// GET /api/minhas-viagens            → histórico de compras do viajante logado
// GET /api/minhas-viagens?pedido=ID  → detalhes de uma compra com as parcelas (pagas e em aberto) consultadas no Asaas
// Autenticação: Authorization: Bearer <token da conta do viajante>
import { db } from "./_lib/firebase.js";
import { enviar, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { asaas } from "./_lib/asaas.js";
import { clienteDoToken } from "./_lib/cliente.js";
import { R } from "./_lib/venda.js";

const PAGA = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const SITUACAO = {
  PENDING: "aberta", AWAITING_RISK_ANALYSIS: "aberta", OVERDUE: "vencida",
  RECEIVED: "paga", CONFIRMED: "paga", RECEIVED_IN_CASH: "paga",
  REFUNDED: "estornada", REFUND_REQUESTED: "estornada", REFUND_IN_PROGRESS: "estornada", CHARGEBACK_REQUESTED: "estornada"
};
const FORMA = { PIX: "Pix", CREDIT_CARD: "Cartão de crédito", BOLETO: "Boleto", UNDEFINED: "A escolher" };

function resumo(pedidoId, p) {
  const ex = p.excursao || {};
  return {
    pedido: pedidoId, codigo: pedidoId.slice(-6).toUpperCase(), criadoEm: p.criadoEm, status: p.status,
    destino: ex.destino || "Excursão", dataSaida: ex.dataSaida || "", horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || "",
    horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "", agencia: ex.agencia || "",
    formaTxt: p.formaTxt || "", parcelas: p.parcelas || 1, totalCent: p.totalCent || 0, recebidoCent: p.recebidoCent || 0,
    cupom: p.cupom || null, descontoCent: p.descontoCent || 0,
    viajantes: Object.values(p.viajantes || {}).map((v) => ({ nome: v.nome, colo: !!v.colo, poltrona: v.assento ? Number(String(v.assento).split("/")[1]) : null, valorCent: v.valorCent || 0 }))
  };
}

async function parcelasAsaas(p) {
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
function parcelasDoSistema(p) {
  const n = p.parcelas || 1;
  const valores = R.dividir(p.totalCent || 0, n);
  const pagos = Object.values(p.pagamentos || {}).filter((x) => !x.aposEncerrar).sort((a, b) => (a.numero || 1) - (b.numero || 1));
  return valores.map((v, i) => {
    const pg = pagos.find((x) => (x.numero || 1) === i + 1);
    return { numero: i + 1, valorCent: v, vencimento: p.forma === "BOLETO" ? R.somarMeses(p.vencimento, i) : p.vencimento || "",
      situacao: pg ? "paga" : ["expirado", "cancelado"].includes(p.status) ? "cancelada" : "aberta", forma: FORMA[p.forma] || "",
      pagaEm: pg?.data || "", link: i === 0 && !pg ? p.asaas?.invoiceUrl || "" : "", boleto: "" };
  });
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET")) return;
  try {
    const { uid } = await clienteDoToken(req, { exigirPerfil: false });
    const d = await db();
    const idx = (await d.ref(`clientesPedidos/${uid}`).get()).val() || {};
    const pedidoId = String(req.query.pedido || "");

    if (!pedidoId) {
      const lista = [];
      for (const [pid, ref] of Object.entries(idx)) {
        const p = (await d.ref(`pedidos/${ref.own}/${ref.exId}/${pid}`).get()).val();
        if (p) lista.push(resumo(pid, p));
      }
      lista.sort((a, b) => (b.dataSaida || "").localeCompare(a.dataSaida || "") || (b.criadoEm || 0) - (a.criadoEm || 0));
      return enviar(res, 200, { hoje: R.hojeBR(), viagens: lista });
    }

    const ref = idx[pedidoId];
    if (!ref) throw new ErroUsuario("Compra não encontrada na sua conta.", 404);
    const p = (await d.ref(`pedidos/${ref.own}/${ref.exId}/${pedidoId}`).get()).val();
    if (!p) throw new ErroUsuario("Compra não encontrada.", 404);
    let parcelas, fonte = "asaas";
    if (["expirado", "cancelado"].includes(p.status)) { parcelas = parcelasDoSistema(p); fonte = "sistema"; }
    else {
      try { parcelas = await parcelasAsaas(p); if (!parcelas.length) throw new Error("sem parcelas"); }
      catch (e) { console.warn("parcelas Asaas", e.message); parcelas = parcelasDoSistema(p); fonte = "sistema"; }
    }
    const pagoCent = parcelas.filter((x) => x.situacao === "paga").reduce((s, x) => s + x.valorCent, 0);
    const abertoCent = parcelas.filter((x) => x.situacao === "aberta" || x.situacao === "vencida").reduce((s, x) => s + x.valorCent, 0);
    const r = resumo(pedidoId, p);
    // o Asaas é a fonte mais atual: se ele já mostra parcela paga, a situação acompanha
    if (fonte === "asaas" && ["aguardando", "parcial", "pago"].includes(r.status)) {
      r.status = pagoCent > 0 && abertoCent === 0 ? "pago" : pagoCent > 0 ? "parcial" : r.status;
      r.recebidoCent = Math.max(r.recebidoCent, pagoCent);
    }
    enviar(res, 200, { hoje: R.hojeBR(), ...r, motivo: p.motivo || "", parcelasLista: parcelas, pagoCent, abertoCent, fonte });
  } catch (e) { tratarErro(res, e); }
}
