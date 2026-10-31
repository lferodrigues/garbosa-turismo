// POST /api/asaas-webhook — avisos do Asaas sobre as cobranças da venda online.
// Configure no Asaas (Integrações → Webhooks) com a URL https://SEU-SITE/api/asaas-webhook
// e o mesmo "Token de autenticação" da variável ASAAS_WEBHOOK_TOKEN na Vercel.
import { db } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo } from "./_lib/http.js";
import { lerPedido, desfazerPedido, repartir, notificar, cancelarSeApagadoNoAsaas, R } from "./_lib/venda.js";

const PAGOU = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const ESTORNOU = new Set(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RECEIVED_IN_CASH_UNDONE", "PAYMENT_DELETED"]);
const FORMA_PG = { PIX: "Pix", CREDIT_CARD: "Cartão de crédito", BOLETO: "Boleto", UNDEFINED: "Asaas" };

export default async function handler(req, res) {
  if (!soMetodo(req, res, "POST")) return;
  const token = process.env.ASAAS_WEBHOOK_TOKEN || "";
  if (!token || req.headers["asaas-access-token"] !== token) return enviar(res, 401, { erro: "Token inválido." });
  try {
    const ev = lerCorpo(req);
    await processar(ev);
    enviar(res, 200, { ok: true });
  } catch (e) {
    console.error("webhook", e);
    enviar(res, 500, { erro: "Falha ao processar" }); // o Asaas reenvia depois
  }
}

export async function processar(ev) {
  const pay = ev?.payment;
  if (!ev?.id || !ev.event || !pay?.id) return;
  const d = await db();
  const marca = d.ref(`asaasEventos/${String(ev.id).replace(/[.#$[\]/]/g, "_")}`);
  if ((await marca.get()).exists()) return; // já processado (o Asaas pode repetir eventos)

  const info = await lerPedido(pay.externalReference);
  if (info) {
    if (PAGOU.has(ev.event)) await registrarPagamento(info, pay);
    else if (ESTORNOU.has(ev.event)) await removerPagamento(info, pay, ev.event);
    else if (ev.event === "PAYMENT_OVERDUE") await vencida(info, pay);
  }
  await marca.set({ evento: ev.event, pagamento: pay.id, pedido: pay.externalReference || null, em: Date.now() });
}

async function excursao(own, exId) {
  return (await (await db()).ref(`excursoes/${own}/${exId}`).get()).val() || {};
}

async function atualizarSituacao(info, recebidoCent) {
  const { pedidoId, own, exId, ped } = info;
  const d = await db();
  const status = recebidoCent >= ped.totalCent ? "pago" : recebidoCent > 0 ? "parcial" : "aguardando";
  const upd = { [`pedidos/${own}/${exId}/${pedidoId}/status`]: status, [`pedidos/${own}/${exId}/${pedidoId}/recebidoCent`]: recebidoCent };
  for (const vid of Object.keys(ped.viajantes || {})) {
    if ((await d.ref(`viajantes/${own}/${exId}/${vid}/nome`).get()).exists()) upd[`viajantes/${own}/${exId}/${vid}/statusVenda`] = status;
  }
  if (status !== "aguardando" && ped.titular?.cpf) {
    const atual = (await d.ref(`vendasCpf/${exId}/${ped.titular.cpf}`).get()).val();
    if (atual === pedidoId) upd[`vendasCpf/${exId}/${ped.titular.cpf}`] = null;
  }
  await d.ref().update(upd);
  return status;
}

async function registrarPagamento(info, pay) {
  const { pedidoId, own, exId, ped } = info;
  const d = await db();
  const valorCent = R.centavos(pay.value);
  const ex = await excursao(own, exId);
  if (ped.status === "expirado" || ped.status === "cancelado") {
    await d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}`).set({ valorCent, status: pay.status, data: pay.paymentDate || pay.confirmedDate || R.hojeBR(), aposEncerrar: true });
    return notificar(own, ex, exId, { tipo: "pagamento", titulo: "Pagamento de compra já encerrada!",
      texto: `${ped.titular?.nome} pagou ${R.brl(valorCent)} de um pedido ${ped.status}. Recadastre os viajantes ou estorne pelo Asaas.` });
  }
  const ja = (await d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}`).get()).val();
  if (ja) return d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}/status`).set(pay.status); // CONFIRMED → RECEIVED do cartão
  const parcela = pay.installmentNumber ? ` · parcela ${pay.installmentNumber}/${ped.parcelas}` : "";
  const data = String(pay.paymentDate || pay.clientPaymentDate || pay.confirmedDate || R.hojeBR()).slice(0, 10);
  const partes = repartir(valorCent, ped.viajantes);
  const upd = { [`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}`]: { valorCent, status: pay.status, data, numero: pay.installmentNumber || 1 } };
  for (const [vid, parte] of Object.entries(partes)) {
    if (!parte || !(await d.ref(`viajantes/${own}/${exId}/${vid}/nome`).get()).exists()) continue;
    upd[`viajantes/${own}/${exId}/${vid}/pagamentos/${pay.id}`] = {
      valor: R.reais(parte), data, forma: FORMA_PG[pay.billingType] || "Asaas",
      obs: `Asaas${parcela}`.slice(0, 200), por: "Venda online (Asaas)", em: Date.now()
    };
  }
  await d.ref().update(upd);
  const pags = (await d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos`).get()).val() || {};
  const recebido = Object.values(pags).filter((p) => !p.aposEncerrar).reduce((s, p) => s + (p.valorCent || 0), 0);
  const status = await atualizarSituacao(info, recebido);
  await notificar(own, ex, exId, { tipo: "pagamento", titulo: status === "pago" ? "Compra online quitada" : "Pagamento online recebido",
    texto: `${ped.titular?.nome}: ${R.brl(valorCent)} via ${FORMA_PG[pay.billingType] || "Asaas"}${parcela} — ${ex.destino || ""}.` });
}

async function removerPagamento(info, pay, evento) {
  const { pedidoId, own, exId, ped } = info;
  const d = await db();
  const ja = (await d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}`).get()).val();
  if (!ja) {
    // cobrança apagada no Asaas antes de ser paga: se não sobrou nenhuma, o pedido é cancelado aqui também
    // (assim o cliente não vê mais a fatura em aberto em Minhas viagens)
    if (evento === "PAYMENT_DELETED") {
      const atual = await lerPedido(pedidoId);
      if (atual && await cancelarSeApagadoNoAsaas(atual)) {
        const ex = await excursao(own, exId);
        await notificar(own, ex, exId, { tipo: "venda", titulo: "Compra online cancelada no Asaas",
          texto: `A cobrança de ${ped.titular?.nome} foi apagada no Asaas. O pedido foi cancelado e as poltronas liberadas — ${ex.destino || ""}.`, link: `#/poltronas/${exId}` });
      }
    }
    return;
  }
  const upd = { [`pedidos/${own}/${exId}/${pedidoId}/pagamentos/${pay.id}`]: null };
  for (const vid of Object.keys(ped.viajantes || {})) upd[`viajantes/${own}/${exId}/${vid}/pagamentos/${pay.id}`] = null;
  // não recria viajantes que a agência apagou
  for (const vid of Object.keys(ped.viajantes || {})) {
    if (!(await d.ref(`viajantes/${own}/${exId}/${vid}/nome`).get()).exists()) delete upd[`viajantes/${own}/${exId}/${vid}/pagamentos/${pay.id}`];
  }
  await d.ref().update(upd);
  const pags = (await d.ref(`pedidos/${own}/${exId}/${pedidoId}/pagamentos`).get()).val() || {};
  await atualizarSituacao(info, Object.values(pags).filter((p) => !p.aposEncerrar).reduce((s, p) => s + (p.valorCent || 0), 0));
  const ex = await excursao(own, exId);
  await notificar(own, ex, exId, { tipo: "pagamento", titulo: "Pagamento online estornado",
    texto: `${ped.titular?.nome}: ${R.brl(R.centavos(pay.value))} (${evento.replace("PAYMENT_", "").toLowerCase()}) — ${ex.destino || ""}. Confira o financeiro.` });
}

async function vencida(info, pay) {
  const { own, exId, ped } = info;
  const ex = await excursao(own, exId);
  if (ped.status === "aguardando" && (ped.forma === "PIX" || ped.forma === "CREDIT_CARD")) {
    await desfazerPedido(info, "expirado", "Pagamento não realizado até o vencimento");
    return notificar(own, ex, exId, { tipo: "venda", titulo: "Compra online expirada",
      texto: `${ped.titular?.nome} não pagou (${ped.formaTxt}). As poltronas foram liberadas — ${ex.destino || ""}.`, link: `#/poltronas/${exId}` });
  }
  if (ped.status === "aguardando" || ped.status === "parcial") {
    return notificar(own, ex, exId, { tipo: "pagamento", titulo: "Boleto da venda online vencido",
      texto: `${ped.titular?.nome}: ${pay.installmentNumber ? `parcela ${pay.installmentNumber}/${ped.parcelas}` : "boleto"} de ${R.brl(R.centavos(pay.value))} venceu em ${R.fData(pay.dueDate)}. Cobre pelo WhatsApp ou cancele o pedido em Venda online.` });
  }
}
