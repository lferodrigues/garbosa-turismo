import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import { usarFetch } from "../api/_lib/asaas.js";
import cobrar from "../api/asaas-whatsapp.js";

process.env.ASAAS_API_KEY = "teste";
const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
const PED = "pedido123";
const parcela = (n, status, extra = {}) => ({ id: `pay${n}`, installmentNumber: n, value: 100, dueDate: `2027-0${n}-10`, status, billingType: "BOLETO",
  invoiceUrl: `https://asaas/i/${n}`, bankSlipUrl: `https://asaas/b/${n}`, ...extra });
let pagamentos, chamadas;

beforeEach(() => {
  chamadas = [];
  pagamentos = [parcela(1, "RECEIVED"), parcela(2, "OVERDUE"), parcela(3, "PENDING")];
  const db = criarDb({
    pedidosIdx: { [PED]: { own: "ag1", exId: "ex1" } },
    excursoes: { ag1: { ex1: { destino: "Aldeia" } } },
    pedidos: { ag1: { ex1: { [PED]: { status: "parcial", parcelas: 3, totalCent: 30000, asaas: { customer: "cus1", installment: "ins1" } } } } }
  });
  usarFalsos({ db, auth: { verifyIdToken: async (t) => (t.startsWith("tok-") ? { uid: t.slice(4), email: "a@b.com" } : Promise.reject(new Error("token"))) } });
  usarFetch(async (url) => {
    chamadas.push(url);
    if (url.includes("/installments/ins1/payments")) return ok({ data: pagamentos });
    if (url.includes("/identificationField")) return ok({ identificationField: "34191.09008 12345.678901" });
    throw new Error(`inesperado: ${url}`);
  });
});
const pedir = async (token = "tok-ag1") => {
  const res = resposta();
  await cobrar({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { pedido: PED, acao: "cobranca" } }, res);
  return res;
};

test("cobrança: devolve o boleto e a linha digitável da parcela em aberto mais antiga", async () => {
  const r = await pedir();
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.cobranca, { numero: 2, total: 3, valorCent: 10000, vencimento: "2027-02-10", vencida: true,
    boleto: "https://asaas/b/2", linha: "34191.09008 12345.678901", link: "https://asaas/i/2" });
  assert.ok(chamadas.some((u) => u.includes("/payments/pay2/identificationField")));
});

test("cobrança: cartão ou Pix não têm boleto, só o link de pagamento", async () => {
  pagamentos = [parcela(1, "PENDING", { billingType: "CREDIT_CARD", bankSlipUrl: null })];
  const r = await pedir();
  assert.equal(r.body.cobranca.boleto, "");
  assert.equal(r.body.cobranca.linha, "");
  assert.equal(r.body.cobranca.link, "https://asaas/i/1");
  assert.ok(!chamadas.some((u) => u.includes("identificationField")));
});

test("cobrança: tudo pago não devolve nada", async () => {
  pagamentos = [parcela(1, "RECEIVED")];
  assert.equal((await pedir()).body.cobranca, null);
});

test("cobrança: só a agência dona vê o boleto", async () => {
  const r = await pedir("tok-outra");
  assert.equal(r.statusCode, 403);
  assert.equal(chamadas.length, 0);
});
