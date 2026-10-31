// Parcelas de um pedido: consulta na hora no Asaas, com o que o sistema já sabe como plano B.
import { asaas } from "./asaas.js";
import * as R from "../../sistema/js/venda-regras.js";

export const PAGA = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
export const SITUACAO = {
  PENDING: "aberta", AWAITING_RISK_ANALYSIS: "aberta", OVERDUE: "vencida",
  RECEIVED: "paga", CONFIRMED: "paga", RECEIVED_IN_CASH: "paga",
  REFUNDED: "estornada", REFUND_REQUESTED: "estornada", REFUND_IN_PROGRESS: "estornada", CHARGEBACK_REQUESTED: "estornada"
};
export const FORMA = { PIX: "Pix", CREDIT_CARD: "Cartão de crédito", BOLETO: "Boleto", UNDEFINED: "A escolher" };

export async function parcelasAsaas(p) {
  const a = p.asaas || {};
  let lista = [];
  if (a.installment) lista = (await asaas("GET", `/installments/${a.installment}/payments?limit=100`))?.data || [];
  else if (a.payment) lista = [await asaas("GET", `/payments/${a.payment}`)];
  return lista.filter((x) => x && !x.deleted).map((x) => ({
    numero: x.installmentNumber || 1, valorCent: R.centavos(x.value), vencimento: x.dueDate || "",
    situacao: SITUACAO[x.status] || "aberta", forma: FORMA[x.billingType] || x.billingType || "",
    pagaEm: PAGA.has(x.status) ? String(x.paymentDate || x.clientPaymentDate || x.confirmedDate || "").slice(0, 10) : "",
    link: x.invoiceUrl || "", boleto: x.billingType === "BOLETO" ? x.bankSlipUrl || "" : ""
  })).sort((a2, b) => a2.numero - b.numero);
}

/** Se o Asaas não responder, mostra o que o sistema já sabe (pagamentos recebidos pelo webhook) */
export function parcelasDoSistema(p, hoje = R.hojeBR()) {
  const n = p.parcelas || 1;
  const valores = R.dividir(p.totalCent || 0, n);
  const pagos = Object.values(p.pagamentos || {}).filter((x) => !x.aposEncerrar).sort((a, b) => (a.numero || 1) - (b.numero || 1));
  const encerrado = ["expirado", "cancelado"].includes(p.status);
  return valores.map((v, i) => {
    const pg = pagos.find((x) => (x.numero || 1) === i + 1);
    const vencimento = p.forma === "BOLETO" && p.vencimento ? R.somarMeses(p.vencimento, i) : p.vencimento || "";
    const situacao = pg ? "paga" : encerrado ? "cancelada" : vencimento && vencimento < hoje ? "vencida" : "aberta";
    return { numero: i + 1, valorCent: v, vencimento, situacao, forma: FORMA[p.forma] || "",
      pagaEm: pg?.data || "", link: i === 0 && !pg ? p.asaas?.invoiceUrl || "" : "", boleto: "" };
  });
}

/** Parcelas do pedido + de onde vieram ("asaas" ou "sistema") */
export async function parcelasDoPedido(p) {
  if (["expirado", "cancelado"].includes(p.status) || !(p.asaas?.payment || p.asaas?.installment)) return { parcelas: parcelasDoSistema(p), fonte: "sistema" };
  try {
    const parcelas = await parcelasAsaas(p);
    if (!parcelas.length) throw new Error("sem parcelas");
    return { parcelas, fonte: "asaas" };
  } catch (e) {
    console.warn("parcelas Asaas", e.message);
    return { parcelas: parcelasDoSistema(p), fonte: "sistema", erro: true };
  }
}

/** Totais e situação geral de um pedido a partir das parcelas */
export function situacaoDoPedido(p, parcelas) {
  const soma = (f) => parcelas.filter(f).reduce((s, x) => s + x.valorCent, 0);
  const pagoCent = soma((x) => x.situacao === "paga");
  const vencidoCent = soma((x) => x.situacao === "vencida");
  const abertoCent = soma((x) => x.situacao === "aberta" || x.situacao === "vencida");
  const estornadoCent = soma((x) => x.situacao === "estornada");
  let situacao;
  if (["expirado", "cancelado"].includes(p.status)) situacao = "cancelado";
  else if (estornadoCent && !pagoCent && !abertoCent) situacao = "estornado";
  else if (abertoCent === 0 && pagoCent > 0) situacao = "pago";
  else if (vencidoCent > 0) situacao = "vencido";
  else if (pagoCent > 0) situacao = "parcial";
  else situacao = "aguardando";
  const proxima = parcelas.filter((x) => x.situacao === "aberta" || x.situacao === "vencida").sort((a, b) => a.numero - b.numero)[0] || null;
  return { situacao, pagoCent, abertoCent, vencidoCent, estornadoCent, proxima };
}
