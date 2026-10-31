// Regras de servidor da venda online: excursão, cupons, poltronas, pedidos e pagamentos.
import { db, TIMESTAMP } from "./firebase.js";
import { ErroUsuario } from "./http.js";
import { cancelarCobranca } from "./asaas.js";
import * as R from "../../sistema/js/venda-regras.js";

/* ---------- excursão ---------- */
export async function carregarExcursao(exId) {
  if (!/^[\w-]{6,40}$/.test(exId || "")) throw new ErroUsuario("Link inválido. Confira o endereço enviado pela agência.", 404);
  const d = await db();
  const pub = (await d.ref(`inscricoes/${exId}`).get()).val();
  if (!pub?.owner) throw new ErroUsuario("Excursão não encontrada.", 404);
  const ex = (await d.ref(`excursoes/${pub.owner}/${exId}`).get()).val();
  if (!ex) throw new ErroUsuario("Excursão não encontrada.", 404);
  return { exId, own: pub.owner, ex, agencia: pub.agencia || "" };
}

export function situacaoVenda(ex, hoje = R.hojeBR()) {
  if (ex.venda?.ativa !== true) return { ativa: false, motivo: "As vendas online desta excursão estão encerradas." };
  if (!ex.dataSaida || ex.dataSaida < hoje) return { ativa: false, motivo: "Esta excursão já partiu." };
  if (!R.precoPessoaCent(ex)) return { ativa: false, motivo: "Esta excursão ainda não tem valor definido." };
  return { ativa: true };
}

/** Lista de veículos com as poltronas já ocupadas (só números — nunca nomes) */
export async function veiculosComOcupacao(own, exId, ex) {
  const pol = (await (await db()).ref(`poltronas/${own}/${exId}`).get()).val() || {};
  return R.veiculosDe(ex).map(([id, v]) => {
    const cat = R.VEICULOS[v.tipo] || { nome: v.tipo, cap: 0 };
    const ocupadas = Object.entries(pol[id] || {}).filter(([n, pid]) => !!pid && Number(n) <= cat.cap).map(([n]) => Number(n)).sort((a, b) => a - b);
    return { id, tipo: v.tipo, nome: cat.nome, cap: cat.cap, ocupadas };
  });
}

/* ---------- cupom ---------- */
export async function lerCupom(exId, ex, codigo) {
  const cod = R.normCupom(codigo);
  if (!cod) return null;
  const cupom = ex.cupons?.[cod];
  if (!cupom) return { codigo: cod, ok: false, motivo: "Cupom não encontrado para esta excursão." };
  const usos = (await (await db()).ref(`vendasUso/${exId}/${cod}`).get()).val() || 0;
  return { codigo: cod, limite: parseInt(cupom.limite, 10) || 0, ...R.avaliarCupom(cupom, usos) };
}

/** Soma (ou subtrai) usos do cupom de forma atômica, respeitando o limite total */
export async function usarCupom(exId, codigo, qtd, limite) {
  if (!codigo || !qtd) return;
  const r = await (await db()).ref(`vendasUso/${exId}/${codigo}`).transaction((u) => {
    const atual = Number(u) || 0;
    if (qtd > 0 && limite > 0 && atual + qtd > limite) return; // aborta
    return Math.max(0, atual + qtd);
  });
  if (!r.committed) throw new ErroUsuario("As vagas deste cupom acabaram de se esgotar. Atualize a página e tente de novo.", 409);
}

/* ---------- poltronas ---------- */
/** Reserva as poltronas numa transação: ou todas, ou nenhuma */
export async function reservarPoltronas(own, exId, assentos) {
  if (!assentos.length) return;
  let ocupadas = [];
  const r = await (await db()).ref(`poltronas/${own}/${exId}`).transaction((atual) => {
    const mapa = atual || {};
    ocupadas = assentos.filter((a) => mapa[a.vk]?.[a.n]);
    if (ocupadas.length) return; // aborta
    for (const a of assentos) {
      if (!mapa[a.vk] || typeof mapa[a.vk] !== "object") mapa[a.vk] = {};
      mapa[a.vk][a.n] = a.vid;
    }
    return mapa;
  });
  if (!r.committed) {
    throw new ErroUsuario(`A(s) poltrona(s) ${ocupadas.map((a) => a.n).join(", ")} acabou(aram) de ser reservada(s) por outra pessoa. Escolha outra(s).`, 409,
      { poltronasOcupadas: ocupadas.map((a) => ({ vk: a.vk, n: a.n })) });
  }
}

/**
 * Troca/reserva poltronas numa transação só: cada item { vid, vk, n } tira o viajante de onde
 * ele estava (se estava) e coloca na poltrona nova; { vid, sair: true } só libera.
 * Se alguma poltrona nova estiver com outra pessoa, nada muda.
 */
export async function trocarPoltronas(own, exId, itens) {
  if (!itens.length) return;
  const vids = new Set(itens.map((a) => a.vid));
  let ocupadas = [];
  const r = await (await db()).ref(`poltronas/${own}/${exId}`).transaction((atual) => {
    const mapa = atual || {};
    for (const vk of Object.keys(mapa)) {
      const m = mapa[vk];
      if (!m || typeof m !== "object") continue;
      for (const n of Object.keys(m)) if (vids.has(m[n])) m[n] = null;
    }
    const novos = itens.filter((a) => !a.sair);
    ocupadas = novos.filter((a) => mapa[a.vk]?.[a.n]);
    if (ocupadas.length) return; // aborta
    for (const a of novos) {
      if (!mapa[a.vk] || typeof mapa[a.vk] !== "object") mapa[a.vk] = {};
      mapa[a.vk][a.n] = a.vid;
    }
    return mapa;
  });
  if (!r.committed) {
    throw new ErroUsuario(`A(s) poltrona(s) ${ocupadas.map((a) => a.n).join(", ")} acabou(aram) de ser reservada(s) por outra pessoa. Escolha outra(s).`, 409,
      { poltronasOcupadas: ocupadas.map((a) => ({ vk: a.vk, n: a.n })) });
  }
}

/** Libera só as poltronas que ainda pertencem a estes viajantes */
export async function liberarPoltronas(own, exId, vids) {
  const set = new Set(vids);
  if (!set.size) return;
  await (await db()).ref(`poltronas/${own}/${exId}`).transaction((atual) => {
    if (!atual) return atual;
    for (const vk of Object.keys(atual)) {
      const m = atual[vk];
      if (!m || typeof m !== "object") continue;
      for (const n of Object.keys(m)) if (set.has(m[n])) m[n] = null;
    }
    return atual;
  });
}

/* ---------- notificações (sininho do sistema) ---------- */
export async function notificar(own, ex, exId, n) {
  const d = await db(), ts = await TIMESTAMP();
  const uids = [own, ...Object.keys(ex?.colaboradores || {})];
  const upd = {};
  for (const uid of new Set(uids)) {
    const k = d.ref(`notificacoes/${uid}`).push().key;
    upd[`notificacoes/${uid}/${k}`] = {
      tipo: n.tipo || "venda", titulo: String(n.titulo).slice(0, 120), texto: String(n.texto || "").slice(0, 300),
      link: n.link || `#/financeiro/${exId}`, exId, de: "asaas", deNome: "Venda online", lida: false, em: ts
    };
  }
  await d.ref().update(upd).catch((e) => console.warn("notificação", e.message));
}

/* ---------- pedidos ---------- */
export async function lerPedido(pedidoId) {
  if (!/^[\w-]{6,40}$/.test(pedidoId || "")) return null;
  const d = await db();
  const idx = (await d.ref(`pedidosIdx/${pedidoId}`).get()).val();
  if (!idx) return null;
  const ped = (await d.ref(`pedidos/${idx.own}/${idx.exId}/${pedidoId}`).get()).val();
  return ped ? { pedidoId, own: idx.own, exId: idx.exId, ped } : null;
}

/**
 * Desfaz um pedido sem pagamento: cancela no Asaas, libera poltronas, remove os viajantes
 * e devolve as vagas do cupom. Os dados ficam guardados no próprio pedido.
 */
export async function desfazerPedido({ pedidoId, own, exId, ped }, status, motivo) {
  const d = await db();
  const vids = Object.keys(ped.viajantes || {});
  await cancelarCobranca(ped.asaas);
  await liberarPoltronas(own, exId, vids);
  const upd = {
    [`pedidos/${own}/${exId}/${pedidoId}/status`]: status,
    [`pedidos/${own}/${exId}/${pedidoId}/motivo`]: motivo,
    [`pedidos/${own}/${exId}/${pedidoId}/encerradoEm`]: Date.now()
  };
  vids.forEach((vid) => { upd[`viajantes/${own}/${exId}/${vid}`] = null; });
  if (ped.titular?.cpf) {
    const atual = (await d.ref(`vendasCpf/${exId}/${ped.titular.cpf}`).get()).val();
    if (atual === pedidoId) upd[`vendasCpf/${exId}/${ped.titular.cpf}`] = null;
  }
  await d.ref().update(upd);
  if (ped.cupom && ped.cupomPessoas) await usarCupom(exId, ped.cupom, -ped.cupomPessoas, 0).catch(() => {});
}

/** Reparte um valor (centavos) entre os viajantes do pedido, proporcional ao valor de cada um */
export function repartir(valorCent, viajantes) {
  const itens = Object.entries(viajantes || {}).filter(([, v]) => v.valorCent > 0);
  const total = itens.reduce((s, [, v]) => s + v.valorCent, 0);
  if (!total) return {};
  const partes = {};
  let usado = 0;
  itens.forEach(([vid, v], i) => {
    const parte = i === itens.length - 1 ? valorCent - usado : Math.floor((valorCent * v.valorCent) / total);
    partes[vid] = parte; usado += parte;
  });
  return partes;
}

export { R };
