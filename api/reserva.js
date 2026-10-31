// Reserva de poltrona sem pagamento (link público sistema/reservar.html?e={id})
// GET  /api/reserva?e=ID  → dados da excursão + poltronas ocupadas (só números)
// POST /api/reserva       → { e, pessoas:[{ nome, cpf, rg, nascimento, email, whatsapp, colo, endereco, assento:{vk,n} }], aceite }
// Funciona enquanto o link de inscrição da excursão estiver aberto (o mesmo botão "Encerrar/Reabrir inscrições").
import { db } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { carregarExcursao, veiculosComOcupacao, vagasDaExcursao, reservarPoltronas, liberarPoltronas, notificar, R } from "./_lib/venda.js";

const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function situacao(exId, ex) {
  const pub = (await (await db()).ref(`inscricoes/${exId}`).get()).val() || {};
  if (pub.ativa === false || ex.linkAtivo === false) return { ativa: false, motivo: "As reservas desta excursão estão encerradas. Fale com a agência." };
  if (!ex.dataSaida || ex.dataSaida < R.hojeBR()) return { ativa: false, motivo: "Esta excursão já partiu." };
  if (!R.veiculosDe(ex).length) return { ativa: false, motivo: "Esta excursão ainda não tem veículo definido." };
  return { ativa: true };
}

function limpar(p) {
  const e = p?.endereco || {};
  return {
    nome: texto(p?.nome, 120), cpf: R.soDig(p?.cpf).slice(0, 11), rg: texto(p?.rg, 30), nascimento: texto(p?.nascimento, 10),
    email: texto(p?.email, 120).toLowerCase(), whatsapp: R.mascaraTel(p?.whatsapp), colo: p?.colo === true,
    endereco: { cep: R.mascaraCep(e.cep), rua: texto(e.rua, 120), numero: texto(e.numero, 20), complemento: texto(e.complemento, 60),
      bairro: texto(e.bairro, 80), cidade: texto(e.cidade, 80), uf: texto(e.uf, 2).toUpperCase() },
    assento: p?.assento && typeof p.assento === "object" ? { vk: texto(p.assento.vk, 40), n: parseInt(p.assento.n, 10) } : null,
    opcionais: (Array.isArray(p?.opcionais) ? p.opcionais : []).slice(0, 30).map((x) => texto(x, 40)).filter(Boolean),
  };
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET", "POST")) return;
  let vidsReservados = null, own0, exId0;
  try {
    if (req.method === "GET") {
      const { exId, own, ex, agencia } = await carregarExcursao(String(req.query.e || ""));
      const sit = await situacao(exId, ex);
      const base = { destino: ex.destino, agencia, descricao: ex.descricao || "", dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "",
        dataRetorno: ex.dataRetorno || ex.dataSaida, horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "",
        folder: ex.folder?.caminho ? { caminho: ex.folder.caminho, raw: ex.folder.raw || "" } : null };
      if (!sit.ativa) return enviar(res, 200, { ...base, ativa: false, motivo: sit.motivo });
      return enviar(res, 200, { ...base, ativa: true, hoje: R.hojeBR(), valorCent: R.precoPessoaCent(ex), valorColoCent: R.centavos(ex.valorColo),
        valorInfantilCent: R.precoInfantilCent(ex), idadeInfantil: R.IDADE_INFANTIL, opcionais: R.opcionaisDe(ex),
        vagas: await vagasDaExcursao(own, exId, ex),
        veiculos: await veiculosComOcupacao(own, exId, ex) });
    }

    const body = lerCorpo(req);
    const { exId, own, ex } = await carregarExcursao(String(body.e || ""));
    own0 = own; exId0 = exId;
    const sit = await situacao(exId, ex);
    if (!sit.ativa) throw new ErroUsuario(sit.motivo, 409);
    if (body.aceite !== true) throw new ErroUsuario("É preciso autorizar o uso dos dados para a viagem.");

    const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).map(limpar);
    if (!pessoas.length) throw new ErroUsuario("Informe os dados de quem vai viajar.");
    if (pessoas.length > R.MAX_PESSOAS) throw new ErroUsuario(`No máximo ${R.MAX_PESSOAS} pessoas por reserva.`);
    if (pessoas[0].colo) throw new ErroUsuario("O responsável pela reserva não pode ser criança de colo.");
    for (let i = 0; i < pessoas.length; i++) {
      const erro = R.erroPessoa(pessoas[i], ex.dataSaida, i === 0);
      if (erro) throw new ErroUsuario(erro.replace("titular da compra", "responsável pela reserva").replace("do titular", "do responsável"), 400, { pessoa: i });
    }
    const cpfs = pessoas.map((p) => p.cpf).filter(Boolean);
    if (new Set(cpfs).size !== cpfs.length) throw new ErroUsuario("Há CPFs repetidos na reserva.");

    const d = await db();
    const existentes = (await d.ref(`viajantes/${own}/${exId}`).get()).val() || {};
    const jaTem = Object.values(existentes).find((v) => v?.cpf && cpfs.includes(R.soDig(v.cpf)));
    if (jaTem) throw new ErroUsuario(`${jaTem.nome} já tem reserva nesta excursão. Para mudar algo, fale com a agência.`, 409);

    const caps = Object.fromEntries(R.veiculosDe(ex).map(([id, v]) => [id, R.VEICULOS[v.tipo]?.cap || 0]));
    const usados = new Set();
    for (const p of pessoas) {
      if (p.colo) { p.assento = null; continue; }
      const a = p.assento;
      if (!a || !caps[a.vk] || !(a.n >= 1 && a.n <= caps[a.vk])) throw new ErroUsuario(`Escolha a poltrona de ${p.nome.split(" ")[0]}.`, 400, { etapa: "poltronas" });
      if (usados.has(`${a.vk}/${a.n}`)) throw new ErroUsuario("Duas pessoas escolheram a mesma poltrona.", 400, { etapa: "poltronas" });
      usados.add(`${a.vk}/${a.n}`);
    }

    const vids = pessoas.map(() => d.ref(`viajantes/${own}/${exId}`).push().key);
    await reservarPoltronas(own, exId, pessoas.map((p, i) => (p.assento ? { ...p.assento, vid: vids[i] } : null)).filter(Boolean));
    vidsReservados = vids;

    const rotulo = (a) => { const lista = R.veiculosDe(ex); const i = lista.findIndex(([k]) => k === a.vk); return lista.length > 1 ? `V${i + 1}·${a.n}` : `${a.n}`; };
    const upd = {};
    pessoas.forEach((p, i) => {
      upd[`viajantes/${own}/${exId}/${vids[i]}`] = {
        nome: p.nome, docTipo: p.rg ? "RG" : "CERTIDAO", docNumero: p.rg || "", telefone: p.whatsapp, idade: R.idadeEm(p.nascimento, ex.dataSaida), colo: p.colo,
        cpf: p.cpf ? R.mascaraCpf(p.cpf) : "", rg: p.rg, nascimento: p.nascimento, email: p.email, endereco: p.endereco,
        valor: R.reais(R.precoDeCent(ex, { colo: p.colo, idade: R.idadeEm(p.nascimento, ex.dataSaida) }) + R.extraAssentoCent(ex, p.assento) + R.opcionaisCent(ex, p.opcionais)),
        opcionais: R.opcionaisRegistro(ex, p.opcionais), formaPagamento: "A combinar", origem: "reserva",
        responsavel: i === 0 ? null : pessoas[0].nome,
        obs: `Reserva pelo link${p.assento ? ` · poltrona ${rotulo(p.assento)}` : " · colo"}${i ? ` · com ${pessoas[0].nome.split(" ")[0]}` : ""}`.slice(0, 300),
        consentimentoLgpd: true, criadoEm: Date.now()
      };
    });
    await d.ref().update(upd);
    vidsReservados = null;

    await notificar(own, ex, exId, { tipo: "inscricao", titulo: "Nova reserva de poltrona",
      texto: `${pessoas[0].nome} reservou ${pessoas.length} lugar(es) em ${ex.destino} (${R.fData(ex.dataSaida)}). Pagamento a combinar.`, link: `#/poltronas/${exId}` });
    enviar(res, 200, { ok: true, reservas: pessoas.map((p) => ({ nome: p.nome, poltrona: p.assento ? rotulo(p.assento) : "colo" })) });
  } catch (e) {
    if (vidsReservados) await liberarPoltronas(own0, exId0, vidsReservados).catch(() => {});
    tratarErro(res, e);
  }
}
