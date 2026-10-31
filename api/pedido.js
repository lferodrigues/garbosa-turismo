// POST /api/pedido — fecha a compra: valida tudo, reserva as poltronas, cadastra os viajantes
// e cria a cobrança no Asaas. Responde com o link da página de pagamento do Asaas.
//
// Corpo: { e, pessoas: [{ nome, cpf, rg, nascimento, email, whatsapp, colo, endereco:{cep,rua,numero,complemento,bairro,cidade,uf}, assento:{vk,n} }],
//          cupom, forma: "PIX" | "CREDIT_CARD" | "BOLETO", parcelas, aceite: true }
// A 1ª pessoa é o titular (é quem paga e recebe a cobrança).
import { db } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { asaas, clienteAsaas, cancelarCobranca, ErroAsaas } from "./_lib/asaas.js";
import { clienteDoToken } from "./_lib/cliente.js";
import {
  carregarExcursao, situacaoVenda, lerCupom, usarCupom, reservarPoltronas, liberarPoltronas, notificar, R
} from "./_lib/venda.js";

/** Endereço público do site (Vercel: SITE_URL; padrão garbosaturismo.com.br) */
const siteUrl = () => String(process.env.SITE_URL || "https://garbosaturismo.com.br").replace(/\/+$/, "");
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function limparPessoa(p) {
  const e = p?.endereco || {};
  return {
    nome: texto(p?.nome, 120), cpf: R.soDig(p?.cpf).slice(0, 11), rg: texto(p?.rg, 30), nascimento: texto(p?.nascimento, 10),
    email: texto(p?.email, 120).toLowerCase(), whatsapp: R.mascaraTel(p?.whatsapp), colo: p?.colo === true,
    endereco: {
      cep: R.mascaraCep(e.cep), rua: texto(e.rua, 120), numero: texto(e.numero, 20), complemento: texto(e.complemento, 60),
      bairro: texto(e.bairro, 80), cidade: texto(e.cidade, 80), uf: texto(e.uf, 2).toUpperCase()
    },
    assento: p?.assento && typeof p.assento === "object" ? { vk: texto(p.assento.vk, 40), n: parseInt(p.assento.n, 10) } : null
  };
}

const rotuloForma = (forma, parcelas) =>
  forma === "PIX" ? "Pix" : `${forma === "BOLETO" ? "Boleto" : "Cartão de crédito"}${parcelas > 1 ? ` ${parcelas}x` : " à vista"}`;

export default async function handler(req, res) {
  if (!soMetodo(req, res, "POST")) return;
  let desfazer = [];
  try {
    const body = lerCorpo(req);
    const cliente = await clienteDoToken(req);
    const { exId, own, ex, agencia } = await carregarExcursao(String(body.e || ""));
    const sit = situacaoVenda(ex);
    if (!sit.ativa) throw new ErroUsuario(sit.motivo, 409);
    if (body.aceite !== true) throw new ErroUsuario("É preciso aceitar os termos e autorizar o uso dos dados para a viagem.");

    /* ---- pessoas ---- */
    const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).map(limparPessoa);
    if (!pessoas.length) throw new ErroUsuario("Informe os dados de quem vai viajar.");
    if (pessoas.length > R.MAX_PESSOAS) throw new ErroUsuario(`No máximo ${R.MAX_PESSOAS} pessoas por compra.`);
    if (pessoas[0].colo) throw new ErroUsuario("O titular não pode ser criança de colo.");
    for (let i = 0; i < pessoas.length; i++) {
      const erro = R.erroPessoa(pessoas[i], ex.dataSaida, i === 0);
      if (erro) throw new ErroUsuario(erro, 400, { pessoa: i });
    }
    const cpfs = pessoas.map((p) => p.cpf).filter(Boolean);
    if (new Set(cpfs).size !== cpfs.length) throw new ErroUsuario("Há CPFs repetidos na compra.");
    const titular = pessoas[0];
    if (titular.cpf !== R.soDig(cliente.perfil.cpf)) throw new ErroUsuario("O titular da compra precisa ser o dono da conta (mesmo CPF do pré-cadastro).", 400, { pessoa: 0 });

    const d = await db();
    const pendente = (await d.ref(`vendasCpf/${exId}/${titular.cpf}`).get()).val();
    if (pendente) {
      const p = (await d.ref(`pedidos/${own}/${exId}/${pendente}`).get()).val();
      if (p?.status === "aguardando") {
        throw new ErroUsuario("Já existe uma compra deste CPF aguardando pagamento. Conclua o pagamento dela ou aguarde o vencimento para comprar de novo.", 409,
          { pagamentoPendente: p.asaas?.invoiceUrl || null });
      }
    }

    /* ---- poltronas ---- */
    const veiculos = Object.fromEntries(R.veiculosDe(ex).map(([id, v]) => [id, R.VEICULOS[v.tipo]?.cap || 0]));
    const usados = new Set();
    for (const p of pessoas) {
      if (p.colo) { p.assento = null; continue; }
      const a = p.assento;
      if (!a || !veiculos[a.vk] || !(a.n >= 1 && a.n <= veiculos[a.vk])) throw new ErroUsuario(`Escolha a poltrona de ${p.nome.split(" ")[0]}.`, 400, { etapa: "poltronas" });
      const k = `${a.vk}/${a.n}`;
      if (usados.has(k)) throw new ErroUsuario("Duas pessoas escolheram a mesma poltrona.", 400, { etapa: "poltronas" });
      usados.add(k);
    }

    /* ---- valores ---- */
    const valorCent = R.precoPessoaCent(ex), valorColoCent = R.centavos(ex.valorColo), valorInfantilCent = R.precoInfantilCent(ex);
    pessoas.forEach((p) => { p.infantil = !p.colo && R.ehInfantil(R.idadeEm(p.nascimento, ex.dataSaida)); });
    let cupom = null;
    if (body.cupom) {
      cupom = await lerCupom(exId, ex, body.cupom);
      if (cupom && !cupom.ok) throw new ErroUsuario(cupom.motivo, 400, { etapa: "cupom" });
    }
    const conta = R.calcularItens(pessoas, { valorCent, valorColoCent, valorInfantilCent, cupom });
    if (conta.totalCent < R.MIN_PARCELA * 100) throw new ErroUsuario("O valor da compra é menor que o mínimo aceito para pagamento online (R$ 5,00).");
    const opcoes = R.opcoesPagamento(ex.venda, ex.dataSaida, conta.totalCent);
    const forma = String(body.forma || "");
    const parcelas = Math.max(1, parseInt(body.parcelas, 10) || 1);
    if (!(forma in R.FORMAS) || !opcoes[forma]) throw new ErroUsuario("Escolha uma forma de pagamento disponível.", 400, { etapa: "pagamento" });
    if (parcelas > opcoes[forma]) throw new ErroUsuario(`Para esta compra, ${R.FORMAS[forma]} aceita no máximo ${opcoes[forma]}x.`, 400, { etapa: "pagamento" });
    const hoje = R.hojeBR();
    const vencimento = forma === "BOLETO" ? opcoes.primeiroVencimento : R.somarDias(hoje, 1);

    /* ---- reservas (cupom → poltronas → cadastro) ---- */
    const pedidoId = d.ref(`pedidos/${own}/${exId}`).push().key;
    const vids = pessoas.map(() => d.ref(`viajantes/${own}/${exId}`).push().key);
    if (cupom?.ok && conta.comCupom) {
      await usarCupom(exId, cupom.codigo, conta.comCupom, cupom.limite);
      desfazer.push(() => usarCupom(exId, cupom.codigo, -conta.comCupom, 0));
    }
    const assentos = pessoas.map((p, i) => (p.assento ? { ...p.assento, vid: vids[i] } : null)).filter(Boolean);
    await reservarPoltronas(own, exId, assentos);
    desfazer.push(() => liberarPoltronas(own, exId, vids));

    const formaTxt = rotuloForma(forma, parcelas);
    const curto = pedidoId.slice(-6).toUpperCase();
    const upd = {};
    const viajantesPed = {};
    pessoas.forEach((p, i) => {
      const item = conta.itens[i], vid = vids[i];
      const idade = R.idadeEm(p.nascimento, ex.dataSaida);
      upd[`viajantes/${own}/${exId}/${vid}`] = {
        nome: p.nome, docTipo: p.rg ? "RG" : "CERTIDAO", docNumero: p.rg || "", telefone: p.whatsapp, idade, colo: p.colo,
        cpf: R.mascaraCpf(p.cpf), rg: p.rg, nascimento: p.nascimento, email: p.email, endereco: p.endereco,
        valor: R.reais(item.valorCent), formaPagamento: formaTxt, origem: "venda", pedido: pedidoId, statusVenda: "aguardando",
        responsavel: i === 0 ? null : titular.nome, cupom: item.cupom ? cupom.codigo : null,
        obs: `Compra online #${curto}${i ? ` · dependente de ${titular.nome.split(" ")[0]}` : " · titular"}${item.cupom ? ` · cupom ${cupom.codigo}` : ""}`.slice(0, 300),
        consentimentoLgpd: true, criadoEm: Date.now()
      };
      viajantesPed[vid] = { nome: p.nome, valorCent: item.valorCent, cupom: item.cupom, colo: p.colo, infantil: !!item.infantil, assento: p.assento ? `${p.assento.vk}/${p.assento.n}` : null };
    });
    const pedido = {
      criadoEm: Date.now(), status: "aguardando", clienteUid: cliente.uid,
      excursao: { destino: ex.destino, dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || ex.dataSaida, horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "", agencia }, forma, parcelas, formaTxt, vencimento,
      totalCent: conta.totalCent, descontoCent: conta.descontoCent, recebidoCent: 0,
      cupom: cupom?.ok && conta.comCupom ? cupom.codigo : null, cupomPessoas: conta.comCupom,
      titular: { nome: titular.nome, cpf: titular.cpf, email: titular.email, whatsapp: titular.whatsapp },
      viajantes: viajantesPed,
      dados: pessoas.map(({ infantil, ...p }, i) => ({ ...p, vid: vids[i] }))
    };
    upd[`pedidos/${own}/${exId}/${pedidoId}`] = pedido;
    upd[`pedidosIdx/${pedidoId}`] = { own, exId };
    upd[`vendasCpf/${exId}/${titular.cpf}`] = pedidoId;
    upd[`clientesPedidos/${cliente.uid}/${pedidoId}`] = { own, exId, criadoEm: Date.now() };
    await d.ref().update(upd);
    desfazer.push(() => {
      const apagar = { [`pedidos/${own}/${exId}/${pedidoId}`]: null, [`pedidosIdx/${pedidoId}`]: null, [`vendasCpf/${exId}/${titular.cpf}`]: null, [`clientesPedidos/${cliente.uid}/${pedidoId}`]: null };
      vids.forEach((vid) => { apagar[`viajantes/${own}/${exId}/${vid}`] = null; });
      return d.ref().update(apagar);
    });

    /* ---- Asaas ---- */
    const customer = await clienteAsaas({ ...titular, endereco: { ...titular.endereco, cep: R.soDig(titular.endereco.cep) }, whatsapp: R.soDig(titular.whatsapp) }, `cpf-${titular.cpf}`);
    const nomes = pessoas.map((p) => p.nome.split(" ")[0]).join(", ");
    const cobranca = {
      customer, billingType: forma, dueDate: vencimento, externalReference: pedidoId,
      description: `${ex.destino} — saída ${R.fData(ex.dataSaida)}${agencia ? ` · ${agencia}` : ""} · ${pessoas.length} viajante(s): ${nomes}${pedido.cupom ? ` · cupom ${pedido.cupom}` : ""}`.slice(0, 480),
      ...(parcelas > 1 ? { installmentCount: parcelas, totalValue: R.reais(conta.totalCent) } : { value: R.reais(conta.totalCent) })
    };
    // Pix e cartão: depois de pagar, o Asaas leva o cliente para a página de obrigado (que abre o grupo do WhatsApp).
    // O domínio precisa ser o mesmo cadastrado no Asaas; se ele recusar, tenta de novo sem o redirecionamento.
    let pg;
    if (forma !== "BOLETO") {
      try { pg = await asaas("POST", "/payments", { ...cobranca, callback: { successUrl: `${siteUrl()}/sistema/obrigado.html?p=${pedidoId}`, autoRedirect: true } }); }
      catch (e) {
        if (!(e instanceof ErroAsaas) || e.status >= 500) throw e;
        console.warn("Asaas recusou a cobrança com redirecionamento; tentando sem:", e.message);
      }
    }
    if (!pg) pg = await asaas("POST", "/payments", cobranca);
    desfazer.push(() => cancelarCobranca({ payment: pg.id, installment: pg.installment }));
    await d.ref(`pedidos/${own}/${exId}/${pedidoId}/asaas`).set({
      customer, payment: pg.id, installment: pg.installment || null, invoiceUrl: pg.invoiceUrl, bankSlipUrl: pg.bankSlipUrl || null
    });
    desfazer = [];

    await notificar(own, ex, exId, {
      tipo: "venda", titulo: "Nova compra online",
      texto: `${titular.nome} comprou ${pessoas.length} lugar(es) em ${ex.destino} · ${R.brl(conta.totalCent)} (${formaTxt}). Aguardando pagamento.`
    });
    const grupo = R.linkGrupoWhatsapp(ex.grupoWhatsapp);
    enviar(res, 200, { ok: true, pedido: curto, pedidoId, url: pg.invoiceUrl, boleto: pg.bankSlipUrl || null, forma, totalCent: conta.totalCent, grupo: grupo || null });
  } catch (e) {
    for (const f of desfazer.reverse()) { try { await f(); } catch (err) { console.error("desfazer", err); } }
    tratarErro(res, e);
  }
}
