import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta, pessoa } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import { usarFetch } from "../api/_lib/asaas.js";
import pedido from "../api/pedido.js";
import venda from "../api/venda.js";
import relatorio from "../api/relatorio-pagamentos.js";
import * as R from "../sistema/js/venda-regras.js";

process.env.ASAAS_API_KEY = "teste";

/* ---------- regras de preço ---------- */
const exNova = {
  valorColo: 40,
  ingresso: { valor: 100, valorInfantil: 50 },
  produtos: { p1: { nome: "Almoço", valor: 30, ordem: 0 }, p2: { nome: "Seguro", valor: 5, valorInfantil: 0, ordem: 1 } },
  veiculos: { v1: { tipo: "onibus46", valorTransporte: 9000, ordem: 0 } }
};

test("ingresso e produtos: valor unitário × lotação do veículo, ÷ rateio", () => {
  const c = R.custosVeiculo(exNova, exNova.veiculos.v1);
  assert.equal(c.cap, 46);
  assert.deepEqual(c.itens.map((i) => [i.nome, i.total]), [["Ingressos", 4600], ["Almoço", 1380], ["Seguro", 230]]);
  assert.equal(c.custoTotal, 9000 + 4600 + 1380 + 230);
  assert.equal(c.porPoltrona, (9000 + 4600 + 1380 + 230) / 32);
  // criança: ingresso 50, almoço sem valor infantil = mesmo valor (30), seguro 0
  assert.equal(c.porPoltronaInfantil, (9000 + 50 * 46 + 30 * 46 + 0) / 32);
  assert.equal(R.precoPessoaCent(exNova), Math.round(c.porPoltrona * 100));
  assert.equal(R.precoInfantilCent(exNova), Math.round(c.porPoltronaInfantil * 100));
});

test("valor por pessoa: colo, até 5 anos completos e adulto", () => {
  assert.equal(R.precoDeCent(exNova, { colo: true, idade: 2 }), 4000);
  assert.equal(R.precoDeCent(exNova, { idade: 5 }), R.precoInfantilCent(exNova));
  assert.equal(R.precoDeCent(exNova, { idade: 6 }), R.precoPessoaCent(exNova));
  assert.equal(R.precoDeCent(exNova, { idade: "" }), R.precoPessoaCent(exNova));
});

test("excursão antiga (valor total dos ingressos no veículo) continua com o mesmo preço", () => {
  const antiga = { veiculos: { v1: { tipo: "onibus46", valorTransporte: 9000, valorIngressos: 1000, ordem: 0 } } };
  assert.equal(R.precoPessoaCent(antiga), Math.round(10000 / 32 * 100));
  assert.equal(R.precoInfantilCent(antiga), R.precoPessoaCent(antiga));
});

test("calcularItens: criança até 5 anos paga o infantil e o cupom só vale se for menor", () => {
  const r = R.calcularItens([{}, { infantil: true }, { colo: true }],
    { valorCent: 50000, valorInfantilCent: 30000, valorColoCent: 4000, cupom: { ok: true, valorCent: 40000, porCompra: 5, restam: Infinity } });
  assert.deepEqual(r.itens.map((i) => [i.valorCent, i.cupom]), [[40000, true], [30000, false], [4000, false]]);
  assert.equal(r.totalCent, 74000);
  assert.equal(r.descontoCent, 10000);
});

/* ---------- compra online e relatório de pagamentos ---------- */
const OWN = "uidAgencia", EX = "exTeste123";
const SAIDA = R.somarDias(R.hojeBR(), 150);
let db, parcelasAsaas;

beforeEach(() => {
  db = criarDb({
    inscricoes: { [EX]: { owner: OWN, agencia: "Garbosa", destino: "Hopi Hari", dataSaida: SAIDA, valor: 1, valorColo: 0, ativa: true } },
    excursoes: { [OWN]: { [EX]: { ...exNova, destino: "Hopi Hari", dataSaida: SAIDA, venda: { ativa: true, maxParcelas: 3, primeiraParcela: R.somarDias(R.hojeBR(), 10) },
      colaboradores: { uidColab: { nome: "Colab", instagram: "colab" } } } } },
    viajantes: { [OWN]: { [EX]: { manual1: { nome: "Maria Manual", valor: 300, telefone: "(32) 99999-0000", pagamentos: { a: { valor: 300, data: "2026-01-01" } } },
      manual2: { nome: "João Devendo", valor: 300, pagamentos: { a: { valor: 100, data: "2026-01-01" } } } } } },
    clientes: { cli1: { nome: "Pessoa A Silva", cpf: pessoa(0).cpf } }
  });
  usarFalsos({ db, auth: { verifyIdToken: async (t) => ({ "tok-dono": { uid: OWN }, "tok-colab": { uid: "uidColab" }, "tok-outro": { uid: "x" }, "tok-cli": { uid: "cli1" } }[t] || Promise.reject(new Error("x"))) } });
  parcelasAsaas = null;
  usarFetch(async (url, op) => {
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_1" });
    if (url.endsWith("/payments") && op.method === "POST") return ok({ id: "pay_1", installment: "ins_1", invoiceUrl: "https://asaas/i/1" });
    if (url.includes("/installments/ins_1/payments")) {
      if (!parcelasAsaas) return { ok: false, status: 500, text: async () => "{}" };
      return ok({ data: parcelasAsaas });
    }
    return ok({});
  });
});

const chamar = async (fn, req) => { const res = resposta(); await fn({ headers: {}, query: {}, ...req }, res); return res; };

test("GET /api/venda envia o valor infantil", async () => {
  const r = await chamar(venda, { method: "GET", query: { e: EX } });
  assert.equal(r.body.valorInfantilCent, R.precoInfantilCent(exNova));
  assert.equal(r.body.idadeInfantil, 5);
});

test("compra com criança de 4 anos na poltrona cobra o valor infantil; relatório mostra pagos e devedores", async () => {
  const nasc4 = `${Number(SAIDA.slice(0, 4)) - 4}${SAIDA.slice(4)}`;
  const ps = [pessoa(0, { assento: { vk: "v1", n: 1 } }), pessoa(1, { nascimento: nasc4, assento: { vk: "v1", n: 2 } })];
  const r = await chamar(pedido, { method: "POST", headers: { authorization: "Bearer tok-cli" }, body: { e: EX, pessoas: ps, aceite: true, forma: "BOLETO", parcelas: 2 } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const adulto = R.precoPessoaCent(exNova), crianca = R.precoInfantilCent(exNova);
  assert.equal(r.body.totalCent, adulto + crianca);
  const vjs = Object.values(db.dump().viajantes[OWN][EX]).filter((v) => v.origem === "venda");
  assert.deepEqual(vjs.map((v) => Math.round(v.valor * 100)).sort((a, b) => a - b), [crianca, adulto].sort((a, b) => a - b));

  // sem permissão
  const negado = await chamar(relatorio, { method: "GET", headers: { authorization: "Bearer tok-outro" }, query: { e: EX } });
  assert.equal(negado.statusCode, 403);

  // Asaas: 1ª parcela paga, 2ª vencida
  const metade = R.dividir(adulto + crianca, 2);
  parcelasAsaas = [
    { installmentNumber: 1, value: metade[0] / 100, status: "RECEIVED", dueDate: "2026-01-10", paymentDate: "2026-01-09", billingType: "BOLETO" },
    { installmentNumber: 2, value: metade[1] / 100, status: "OVERDUE", dueDate: "2026-02-10", billingType: "BOLETO" }
  ];
  const rel = await chamar(relatorio, { method: "GET", headers: { authorization: "Bearer tok-colab" }, query: { e: EX } });
  assert.equal(rel.statusCode, 200, JSON.stringify(rel.body));
  const o = rel.body.online[0];
  assert.equal(o.fonte, "asaas");
  assert.equal(o.situacao, "vencido");
  assert.equal(o.pagoCent, metade[0]);
  assert.equal(o.vencidoCent, metade[1]);
  assert.equal(o.viajantes.length, 2);
  const outros = Object.fromEntries(rel.body.outros.map((x) => [x.nome, x.situacao]));
  assert.deepEqual(outros, { "João Devendo": "parcial", "Maria Manual": "pago" });
  assert.equal(rel.body.totais.outros.abertoCent, 20000);

  // Asaas fora do ar: usa o que o sistema sabe
  parcelasAsaas = null;
  const rel2 = await chamar(relatorio, { method: "GET", headers: { authorization: "Bearer tok-dono" }, query: { e: EX, own: OWN } });
  assert.equal(rel2.body.falhasAsaas, 1);
  assert.equal(rel2.body.online[0].fonte, "sistema");
  assert.equal(rel2.body.online[0].situacao, "aguardando");
});

/* ---------- grupo do WhatsApp ---------- */
import grupoApi from "../api/pedido-grupo.js";

test("link do grupo do WhatsApp é validado e normalizado", () => {
  assert.equal(R.linkGrupoWhatsapp("chat.whatsapp.com/AbCdEfGhIj123"), "https://chat.whatsapp.com/AbCdEfGhIj123");
  assert.equal(R.linkGrupoWhatsapp(" https://chat.whatsapp.com/invite/AbCdEfGhIj123?mode=ac "), "https://chat.whatsapp.com/AbCdEfGhIj123");
  assert.equal(R.linkGrupoWhatsapp("https://evil.com/chat.whatsapp.com/AbCdEfGhIj123"), "");
  assert.equal(R.linkGrupoWhatsapp("javascript:alert(1)"), "");
});

test("Pix pede ao Asaas para voltar à página de obrigado, que leva ao grupo; boleto devolve o PDF e o grupo", async () => {
  await db.ref(`excursoes/${OWN}/${EX}/grupoWhatsapp`).set("https://chat.whatsapp.com/GrupoHopi12345");
  const corpos = [];
  usarFetch(async (url, op) => {
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_1" });
    if (url.endsWith("/payments") && op.method === "POST") { corpos.push(JSON.parse(op.body)); return ok({ id: "pay_" + corpos.length, invoiceUrl: "https://asaas/i/" + corpos.length, bankSlipUrl: "https://asaas/b/" + corpos.length }); }
    return ok({});
  });
  const pix = await chamar(pedido, { method: "POST", headers: { authorization: "Bearer tok-cli" }, body: { e: EX, pessoas: [pessoa(0, { assento: { vk: "v1", n: 1 } })], aceite: true, forma: "PIX", parcelas: 1 } });
  assert.equal(pix.statusCode, 200, JSON.stringify(pix.body));
  assert.equal(corpos[0].callback.autoRedirect, true);
  assert.equal(corpos[0].callback.successUrl, `https://garbosaturismo.com.br/sistema/obrigado.html?p=${pix.body.pedidoId}`);
  assert.equal(pix.body.grupo, "https://chat.whatsapp.com/GrupoHopi12345");

  const ob = await chamar(grupoApi, { method: "GET", query: { p: pix.body.pedidoId } });
  assert.equal(ob.statusCode, 200);
  assert.equal(ob.body.grupo, "https://chat.whatsapp.com/GrupoHopi12345");
  assert.equal(ob.body.destino, "Hopi Hari");
  const nada = await chamar(grupoApi, { method: "GET", query: { p: "naoexiste123" } });
  assert.equal(nada.statusCode, 404);
});

test("se o Asaas recusar o redirecionamento (domínio não cadastrado), a compra sai sem ele", async () => {
  const corpos = [];
  usarFetch(async (url, op) => {
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_1" });
    if (url.endsWith("/payments") && op.method === "POST") {
      const c = JSON.parse(op.body); corpos.push(c);
      if (c.callback) return { ok: false, status: 400, text: async () => JSON.stringify({ errors: [{ description: "O domínio da URL de sucesso não está cadastrado." }] }) };
      return ok({ id: "pay_x", invoiceUrl: "https://asaas/i/x" });
    }
    return ok({});
  });
  const r = await chamar(pedido, { method: "POST", headers: { authorization: "Bearer tok-cli" }, body: { e: EX, pessoas: [pessoa(0, { assento: { vk: "v1", n: 3 } })], aceite: true, forma: "CREDIT_CARD", parcelas: 1 } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(corpos.length, 2);
  assert.equal(corpos[1].callback, undefined);
  assert.equal(r.body.grupo, null);
});

test("cliente do Asaas recebe a cobrança também pelo WhatsApp (ligado antes de criar a cobrança)", async () => {
  const ordem = [];
  let lote = null;
  usarFetch(async (url, op) => {
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_9" });
    if (url.endsWith("/customers/cus_9/notifications")) return ok({ data: [
      { id: "not_1", event: "PAYMENT_CREATED", enabled: true, whatsappEnabledForCustomer: false },
      { id: "not_2", event: "PAYMENT_OVERDUE", enabled: true, whatsappEnabledForCustomer: true },
      { id: "not_3", event: "PAYMENT_RECEIVED", enabled: false, whatsappEnabledForCustomer: false }] });
    if (url.endsWith("/notifications/batch")) { ordem.push("whatsapp"); lote = JSON.parse(op.body); return ok({}); }
    if (url.endsWith("/payments") && op.method === "POST") { ordem.push("cobranca"); return ok({ id: "pay_9", invoiceUrl: "https://asaas/i/9", bankSlipUrl: "https://asaas/b/9" }); }
    return ok({});
  });
  const r = await chamar(pedido, { method: "POST", headers: { authorization: "Bearer tok-cli" }, body: { e: EX, pessoas: [pessoa(0, { assento: { vk: "v1", n: 5 } })], aceite: true, forma: "BOLETO", parcelas: 1 } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(ordem, ["whatsapp", "cobranca"]);
  assert.deepEqual(lote, { customer: "cus_9", notifications: [{ id: "not_1", whatsappEnabledForCustomer: true }] });
});

import diagWpp from "../api/asaas-whatsapp.js";
test("diagnóstico do WhatsApp: liga de novo e mostra celular e avisos do cliente no Asaas", async () => {
  usarFetch(async (url, op) => {
    const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes("/customers?")) return ok({ data: [] });
    if (url.endsWith("/customers")) return ok({ id: "cus_7" });
    if (url.endsWith("/customers/cus_7")) return ok({ name: "Pessoa A Silva", mobilePhone: "32999990000", email: "p0@ex.com" });
    if (url.endsWith("/customers/cus_7/notifications")) return ok({ data: [{ id: "not_1", event: "PAYMENT_CREATED", enabled: true, whatsappEnabledForCustomer: true, emailEnabledForCustomer: true }] });
    if (url.endsWith("/payments") && op.method === "POST") return ok({ id: "pay_7", invoiceUrl: "https://asaas/i/7" });
    return ok({});
  });
  const r = await chamar(pedido, { method: "POST", headers: { authorization: "Bearer tok-cli" }, body: { e: EX, pessoas: [pessoa(0, { assento: { vk: "v1", n: 7 } })], aceite: true, forma: "PIX", parcelas: 1 } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(db.dump().pedidos[OWN][EX][r.body.pedidoId].asaas.whatsapp.ok, true);
  const negado = await chamar(diagWpp, { method: "POST", headers: { authorization: "Bearer tok-outro" }, body: { pedido: r.body.pedidoId } });
  assert.equal(negado.statusCode, 403);
  const d = await chamar(diagWpp, { method: "POST", headers: { authorization: "Bearer tok-dono" }, body: { pedido: r.body.pedidoId } });
  assert.equal(d.statusCode, 200, JSON.stringify(d.body));
  assert.equal(d.body.celular, "32999990000");
  assert.deepEqual(d.body.eventos[0], { evento: "PAYMENT_CREATED", dias: null, ativa: true, whatsapp: true, email: true, sms: false });
});
