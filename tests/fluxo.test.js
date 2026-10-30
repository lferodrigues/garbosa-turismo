import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta, pessoa } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import { usarFetch } from "../api/_lib/asaas.js";
import venda from "../api/venda.js";
import cupomApi from "../api/cupom.js";
import pedido from "../api/pedido.js";
import webhook from "../api/asaas-webhook.js";
import cancelar from "../api/pedido-cancelar.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

process.env.ASAAS_API_KEY = "teste";
process.env.ASAAS_WEBHOOK_TOKEN = "token-do-webhook-com-mais-de-32-caracteres";
const OWN = "uidAgencia", EX = "exTeste123";
const SAIDA = somarDias(hojeBR(), 150);
let db, chamadas, falharPagamento;

beforeEach(() => {
  db = criarDb({
    inscricoes: { [EX]: { owner: OWN, agencia: "Garbosa", destino: "Aldeia das Águas", dataSaida: SAIDA, valor: 312.5, valorColo: 0, ativa: true } },
    excursoes: { [OWN]: { [EX]: {
      destino: "Aldeia das Águas", dataSaida: SAIDA, dataRetorno: SAIDA, localSaida: "Rodoviária", valorColo: 50, descricao: "Day use",
      veiculos: { v1: { tipo: "onibus46", valorTransporte: 9000, valorIngressos: 1000, ordem: 0 } },
      venda: { ativa: true, maxParcelas: 6, primeiraParcela: somarDias(hojeBR(), 10) },
      cupons: { PROMO5: { valor: 250, porCompra: 5, limite: 0, ativo: true } },
      colaboradores: { uidColab: { nome: "Colab", instagram: "colab" } }
    } } },
    poltronas: { [OWN]: { [EX]: { v1: { 1: "viajanteAntigo" } } } },
    viajantes: { [OWN]: { [EX]: { viajanteAntigo: { nome: "Já Cadastrado" } } } }
  });
  usarFalsos({ db, auth: { verifyIdToken: async (t) => (t === "tok-dono" ? { uid: OWN, email: "a@a.com" } : t === "tok-outro" ? { uid: "x" } : Promise.reject(new Error("x"))) } });
  chamadas = []; falharPagamento = false;
  usarFetch(async (url, op) => {
    const corpo = op.body ? JSON.parse(op.body) : null;
    chamadas.push({ url, metodo: op.method, corpo, token: op.headers.access_token });
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_1" });
    if (url.endsWith("/payments") && op.method === "POST") {
      if (falharPagamento) return { ok: false, status: 400, text: async () => JSON.stringify({ errors: [{ description: "Cliente sem CEP" }] }) };
      return ok({ id: "pay_1", installment: corpo.installmentCount ? "ins_1" : undefined, invoiceUrl: "https://www.asaas.com/i/abc" });
    }
    return ok({ deleted: true });
  });
});

const chamar = async (fn, req) => { const res = resposta(); await fn({ headers: {}, query: {}, ...req }, res); return res; };
const comprar = (pessoas, extra = {}) => chamar(pedido, { method: "POST", body: { e: EX, pessoas, aceite: true, forma: "BOLETO", parcelas: 3, cupom: "promo5", ...extra } });
const valorCheio = Math.round(10000 / 32 * 100);

test("GET /api/venda mostra excursão e poltronas ocupadas sem nomes", async () => {
  const r = await chamar(venda, { method: "GET", query: { e: EX } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ativa, true);
  assert.equal(r.body.valorCent, valorCheio);
  assert.deepEqual(r.body.veiculos[0].ocupadas, [1]);
  assert.equal(JSON.stringify(r.body).includes("Já Cadastrado"), false);
  assert.equal(JSON.stringify(r.body).includes("PROMO5"), false);
});

test("cupom é conferido", async () => {
  const ok = await chamar(cupomApi, { method: "POST", body: { e: EX, codigo: "promo5" } });
  assert.deepEqual([ok.body.ok, ok.body.valorCent, ok.body.porCompra], [true, 25000, 5]);
  const nao = await chamar(cupomApi, { method: "POST", body: { e: EX, codigo: "xxx" } });
  assert.equal(nao.body.ok, false);
});

test("compra de 7 pessoas: cupom nas 5 primeiras, poltronas reservadas, cobrança parcelada no Asaas", async () => {
  const ps = Array.from({ length: 7 }, (_, i) => pessoa(i, { assento: { vk: "v1", n: i + 2 } }));
  const r = await comprar(ps);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.url, "https://www.asaas.com/i/abc");
  const total = 5 * 25000 + 2 * valorCheio;
  assert.equal(r.body.totalCent, total);
  const pg = chamadas.find((c) => c.url.endsWith("/payments"));
  assert.equal(pg.corpo.billingType, "BOLETO");
  assert.equal(pg.corpo.installmentCount, 3);
  assert.equal(pg.corpo.totalValue, total / 100);
  assert.equal(pg.corpo.dueDate, somarDias(hojeBR(), 10));
  const dump = db.dump();
  const pol = dump.poltronas[OWN][EX].v1;
  assert.equal(Object.keys(pol).length, 8);
  const vias = Object.values(dump.viajantes[OWN][EX]).filter((v) => v.origem === "venda");
  assert.equal(vias.length, 7);
  assert.equal(vias.filter((v) => v.cupom === "PROMO5").length, 5);
  assert.equal(dump.vendasUso[EX].PROMO5, 5);
  const ped = Object.values(dump.pedidos[OWN][EX])[0];
  assert.equal(ped.status, "aguardando");
  assert.equal(ped.asaas.installment, "ins_1");
  assert.ok(dump.notificacoes[OWN] && dump.notificacoes.uidColab);
});

test("poltrona já ocupada: recusa sem deixar nada para trás", async () => {
  const r = await comprar([pessoa(0, { assento: { vk: "v1", n: 1 } })]);
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body.poltronasOcupadas, [{ vk: "v1", n: 1 }]);
  const dump = db.dump();
  assert.equal(dump.vendasUso?.[EX]?.PROMO5 || 0, 0);
  assert.equal(Object.keys(dump.viajantes[OWN][EX]).length, 1);
});

test("Asaas recusa: desfaz poltronas, viajantes, cupom e pedido", async () => {
  falharPagamento = true;
  const r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } }), pessoa(1, { assento: { vk: "v1", n: 6 } })]);
  assert.equal(r.statusCode, 502);
  assert.match(r.body.erro, /Cliente sem CEP/);
  const dump = db.dump();
  assert.deepEqual(Object.keys(dump.poltronas[OWN][EX].v1), ["1"]);
  assert.equal(Object.keys(dump.viajantes[OWN][EX]).length, 1);
  assert.equal(dump.pedidos, undefined);
  assert.equal(dump.vendasUso?.[EX]?.PROMO5 || 0, 0);
});

test("parcelas acima do permitido e forma inválida são recusadas", async () => {
  let r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } })], { parcelas: 7 });
  assert.equal(r.statusCode, 400);
  r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } })], { forma: "DINHEIRO" });
  assert.equal(r.statusCode, 400);
  r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } }), pessoa(1)]);
  assert.equal(r.statusCode, 400);
  assert.match(r.body.erro, /poltrona/);
});

test("criança de colo não ocupa poltrona e paga o valor de colo", async () => {
  const bebe = pessoa(1, { colo: true, cpf: "", rg: "", nascimento: somarDias(hojeBR(), -400) });
  const r = await comprar([pessoa(0, { assento: { vk: "v1", n: 9 } }), bebe], { cupom: "", forma: "PIX", parcelas: 1 });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.totalCent, valorCheio + 5000);
  const pg = chamadas.find((c) => c.url.endsWith("/payments"));
  assert.equal(pg.corpo.billingType, "PIX");
  assert.equal(pg.corpo.value, (valorCheio + 5000) / 100);
});

test("mesmo CPF com compra aguardando pagamento devolve o link pendente", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 10 } })]);
  const r = await comprar([pessoa(0, { assento: { vk: "v1", n: 11 } })]);
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.pagamentoPendente, "https://www.asaas.com/i/abc");
});

const evento = (id, event, payment) => chamar(webhook, { method: "POST", headers: { "asaas-access-token": process.env.ASAAS_WEBHOOK_TOKEN }, body: { id, event, payment } });

test("webhook: parcela paga entra no financeiro de cada viajante; repetição é ignorada", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 2 } }), pessoa(1, { assento: { vk: "v1", n: 3 } })], { cupom: "" });
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  const pay = { id: "pay_1", externalReference: pid, value: (2 * valorCheio) / 3 / 100, billingType: "BOLETO", installmentNumber: 1, status: "RECEIVED", paymentDate: "2026-11-10" };
  assert.equal((await evento("evt_1", "PAYMENT_RECEIVED", pay)).statusCode, 200);
  assert.equal((await evento("evt_1", "PAYMENT_RECEIVED", pay)).statusCode, 200);
  const dump = db.dump();
  const vias = Object.values(dump.viajantes[OWN][EX]).filter((v) => v.origem === "venda");
  const soma = vias.reduce((s, v) => s + Object.values(v.pagamentos || {}).reduce((a, p) => a + Math.round(p.valor * 100), 0), 0);
  assert.equal(soma, Math.round(pay.value * 100));
  assert.ok(vias.every((v) => v.statusVenda === "parcial"));
  assert.equal(dump.pedidos[OWN][EX][pid].status, "parcial");
  assert.equal(dump.vendasCpf, undefined); // liberou o CPF para nova compra
  const r = await chamar(webhook, { method: "POST", headers: { "asaas-access-token": "errado" }, body: {} });
  assert.equal(r.statusCode, 401);
});

test("webhook: Pix vencido libera as poltronas e cancela a cobrança", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 20 } })], { forma: "PIX", parcelas: 1, cupom: "promo5" });
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  await evento("evt_2", "PAYMENT_OVERDUE", { id: "pay_1", externalReference: pid, value: 250, billingType: "PIX", dueDate: hojeBR() });
  const dump = db.dump();
  assert.equal(dump.pedidos[OWN][EX][pid].status, "expirado");
  assert.equal(dump.poltronas[OWN][EX].v1[20], undefined);
  assert.equal(Object.keys(dump.viajantes[OWN][EX]).length, 1);
  assert.equal(dump.vendasUso?.[EX]?.PROMO5 || 0, 0);
  assert.ok(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/payments/pay_1")));
});

test("agência cancela pedido sem pagamento; outro usuário não pode", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 30 } })]);
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  let r = await chamar(cancelar, { method: "POST", headers: { authorization: "Bearer tok-outro" }, body: { pedido: pid } });
  assert.equal(r.statusCode, 403);
  r = await chamar(cancelar, { method: "POST", headers: { authorization: "Bearer tok-dono" }, body: { pedido: pid } });
  assert.equal(r.statusCode, 200);
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "cancelado");
  assert.ok(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/installments/ins_1")));
});

test("venda desativada", async () => {
  await db.ref(`excursoes/${OWN}/${EX}/venda/ativa`).set(false);
  const r = await chamar(venda, { method: "GET", query: { e: EX } });
  assert.equal(r.body.ativa, false);
  const p = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } })]);
  assert.equal(p.statusCode, 409);
});
