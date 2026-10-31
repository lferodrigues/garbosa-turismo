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
import minhas from "../api/minhas-viagens.js";
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
    viajantes: { [OWN]: { [EX]: { viajanteAntigo: { nome: "Já Cadastrado" } } } },
    clientes: { cli1: { nome: "Pessoa A Silva", cpf: pessoa(0).cpf, email: "p0@ex.com" }, cli2: { nome: "Sem Perfil" } }
  });
  usarFalsos({ db, auth: { verifyIdToken: async (t) => (t === "tok-dono" ? { uid: OWN, email: "a@a.com" } : t === "tok-outro" ? { uid: "x" } : t === "tok-cli" ? { uid: "cli1" } : t === "tok-cli2" ? { uid: "cli2" } : Promise.reject(new Error("x"))) } });
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
const comprar = (pessoas, extra = {}, token = "tok-cli") => chamar(pedido, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: { e: EX, pessoas, aceite: true, forma: "BOLETO", parcelas: 3, cupom: "promo5", ...extra } });
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

test("compra exige conta com pré-cadastro e titular com o CPF da conta", async () => {
  let r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } })], {}, null);
  assert.equal(r.statusCode, 401); assert.equal(r.body.login, true);
  r = await comprar([pessoa(0, { assento: { vk: "v1", n: 5 } })], {}, "tok-cli2");
  assert.equal(r.statusCode, 403); assert.equal(r.body.preCadastro, true);
  r = await comprar([pessoa(1, { assento: { vk: "v1", n: 5 } })]);
  assert.equal(r.statusCode, 400); assert.match(r.body.erro, /dono da conta/);
});

test("Minhas viagens: lista as compras da conta e mostra as parcelas do Asaas", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 8 } }), pessoa(1, { assento: { vk: "v1", n: 9 } })], { cupom: "", parcelas: 3 });
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  let r = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.viagens.length, 1);
  assert.equal(r.body.viagens[0].destino, "Aldeia das Águas");
  assert.deepEqual(r.body.viagens[0].viajantes.map((v) => v.poltrona), [8, 9]);
  usarFetch(async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(url.includes("/installments/ins_1/payments") ? { data: [
    { id: "p1", installmentNumber: 1, value: 100, dueDate: "2026-11-10", status: "RECEIVED", paymentDate: "2026-11-09", billingType: "BOLETO", invoiceUrl: "u1", bankSlipUrl: "b1" },
    { id: "p2", installmentNumber: 2, value: 100, dueDate: "2026-12-10", status: "OVERDUE", billingType: "BOLETO", invoiceUrl: "u2", bankSlipUrl: "b2" },
    { id: "p3", installmentNumber: 3, value: 100, dueDate: "2027-01-10", status: "PENDING", billingType: "BOLETO", invoiceUrl: "u3", bankSlipUrl: "b3" }] } : {}) }));
  r = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" }, query: { pedido: pid } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.parcelasLista.map((p) => p.situacao), ["paga", "vencida", "aberta"]);
  assert.equal(r.body.pagoCent, 10000); assert.equal(r.body.abertoCent, 20000);
  assert.equal(r.body.parcelasLista[1].boleto, "b2");
  // outra conta não vê esta compra
  r = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli2" }, query: { pedido: pid } });
  assert.equal(r.statusCode, 404);
  // Asaas fora do ar: mostra o que o sistema sabe
  usarFetch(async () => ({ ok: false, status: 500, text: async () => "{}" }));
  r = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" }, query: { pedido: pid } });
  assert.equal(r.body.fonte, "sistema"); assert.equal(r.body.parcelasLista.length, 3);
});

test("opcionais: aparecem na venda e somam no valor de quem escolheu (cobrança e viajante)", async () => {
  await db.ref(`excursoes/${OWN}/${EX}/opcionais`).set({
    o1: { titulo: "Passeio de barco", descricao: "Saída 14h", valor: 45, ordem: 0 },
    o2: { titulo: "Almoço", valor: 30.5, ordem: 1 }
  });
  const g = await chamar(venda, { method: "GET", query: { e: EX } });
  assert.deepEqual(g.body.opcionais.map((o) => [o.id, o.titulo, o.valorCent]), [["o1", "Passeio de barco", 4500], ["o2", "Almoço", 3050]]);
  const r = await comprar([
    pessoa(0, { assento: { vk: "v1", n: 9 }, opcionais: ["o1", "o2", "o1", "inventado"] }),
    pessoa(1, { assento: { vk: "v1", n: 10 } })
  ], { cupom: "", forma: "PIX", parcelas: 1 });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.totalCent, valorCheio * 2 + 7550);
  const vs = Object.values(db.dump().viajantes[OWN][EX]).filter((v) => v.origem === "venda");
  const a = vs.find((v) => v.opcionais), b = vs.find((v) => !v.opcionais);
  assert.deepEqual(a.opcionais, { o1: { titulo: "Passeio de barco", valor: 45 }, o2: { titulo: "Almoço", valor: 30.5 } });
  assert.equal(Math.round((a.valor - b.valor) * 100), 7550);
});

test("GET /api/venda?vagas=1 dá o selo de cada excursão do catálogo pelas poltronas ocupadas", async () => {
  await db.ref("site/excursoes").set({ s1: { titulo: "Aldeia", exId: EX, owner: OWN }, s2: { titulo: "Fixa", link: "bh.html" } });
  let r = await chamar(venda, { method: "GET", query: { vagas: "1" } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.s1, { selo: "", livres: 45, cap: 46 });
  assert.equal(r.body.s2, undefined);
  const mapa = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [i + 1, "v" + i]));
  await db.ref(`poltronas/${OWN}/${EX}/v1`).set(mapa);
  assert.equal((await chamar(venda, { method: "GET", query: { vagas: "1" } })).body.s1.selo, "ultimas");
  await db.ref(`poltronas/${OWN}/${EX}/v1`).set(Object.fromEntries(Array.from({ length: 46 }, (_, i) => [i + 1, "v" + i])));
  assert.equal((await chamar(venda, { method: "GET", query: { vagas: "1" } })).body.s1.selo, "esgotado");
});

/* ---------- excluir no sistema ↔ apagar no Asaas ---------- */
const asaasParcelas = (parcelas) => usarFetch(async (url, op) => {
  chamadas.push({ url, metodo: op.method });
  const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  if (url.includes("/installments/ins_1/payments")) return ok({ data: parcelas });
  return ok({ deleted: true });
});

test("excluir no sistema uma compra sem pagamento cancela no Asaas e some a fatura do cliente", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 30 } }), pessoa(1, { assento: { vk: "v1", n: 31 } })]);
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  const r = await chamar(cancelar, { method: "POST", headers: { authorization: "Bearer tok-dono" }, body: { pedido: pid, excluir: true } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const dump = db.dump();
  assert.equal(dump.pedidos[OWN][EX][pid].status, "cancelado");
  assert.ok(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/installments/ins_1")));
  assert.equal(Object.values(dump.viajantes[OWN][EX]).filter((v) => v.origem === "venda").length, 0);
  assert.equal(dump.poltronas[OWN][EX].v1[30], undefined);
  const lista = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" } });
  assert.equal(lista.body.viagens[0].status, "cancelado");
});

test("excluir no sistema uma compra com parcela paga apaga só as parcelas em aberto no Asaas", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 32 } })]);
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  await db.ref(`pedidos/${OWN}/${EX}/${pid}/status`).set("parcial");
  await db.ref(`pedidos/${OWN}/${EX}/${pid}/recebidoCent`).set(10000);
  asaasParcelas([
    { id: "p1", installmentNumber: 1, value: 100, status: "RECEIVED" },
    { id: "p2", installmentNumber: 2, value: 100, status: "PENDING" },
    { id: "p3", installmentNumber: 3, value: 100, status: "OVERDUE" }
  ]);
  chamadas = [];
  const r = await chamar(cancelar, { method: "POST", headers: { authorization: "Bearer tok-dono" }, body: { pedido: pid, excluir: true } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.pagoCent, 10000);
  const apagadas = chamadas.filter((c) => c.metodo === "DELETE").map((c) => c.url.split("/").pop());
  assert.deepEqual(apagadas, ["p2", "p3"]);
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "cancelado");
  assert.equal(db.dump().poltronas[OWN][EX].v1[32], undefined);
});

test("cobrança apagada direto no Asaas: webhook cancela o pedido; pedido já travado se acerta em Minhas viagens", async () => {
  await comprar([pessoa(0, { assento: { vk: "v1", n: 33 } })]);
  const pid = Object.keys(db.dump().pedidos[OWN][EX])[0];
  // ainda sobra parcela viva: não cancela
  asaasParcelas([{ id: "p1", status: "PENDING" }, { id: "p2", status: "PENDING", deleted: true }]);
  await evento("evt_del1", "PAYMENT_DELETED", { id: "p2", externalReference: pid, value: 100 });
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "aguardando");
  // todas apagadas: cancela e libera a poltrona
  asaasParcelas([{ id: "p1", status: "PENDING", deleted: true }, { id: "p2", status: "PENDING", deleted: true }]);
  await evento("evt_del2", "PAYMENT_DELETED", { id: "p1", externalReference: pid, value: 100 });
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "cancelado");
  assert.equal(db.dump().poltronas[OWN][EX].v1[33], undefined);

  // pedido que ficou travado antes desta correção (aguardando, mas apagado no Asaas)
  await db.ref(`pedidos/${OWN}/${EX}/${pid}/status`).set("aguardando");
  asaasParcelas([]);
  const r = await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" } });
  assert.equal(r.body.viagens[0].status, "cancelado");
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "cancelado");
  // Asaas fora do ar não cancela nada
  await db.ref(`pedidos/${OWN}/${EX}/${pid}/status`).set("aguardando");
  usarFetch(async () => ({ ok: false, status: 500, text: async () => "{}" }));
  await chamar(minhas, { method: "GET", headers: { authorization: "Bearer tok-cli" } });
  assert.equal(db.dump().pedidos[OWN][EX][pid].status, "aguardando");
});

test("selo de vagas: item do catálogo cadastrado à mão com link para a excursão; só poltronas marcadas no mapa contam", async () => {
  // item feito à mão pelo admin (origem "site", sem exId, dono = admin), com o botão levando à compra da excursão
  await db.ref("site/excursoes").set({ frei: { titulo: "Show do Frei Gilson", link: `sistema/comprar.html?e=${EX}`, owner: "uidAdmin", origem: "site" } });
  // 35 viajantes cadastrados, nenhum posicionado no mapa: não contam
  const vs = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`via${i}`, { nome: `Pessoa ${i}` }]));
  await db.ref(`viajantes/${OWN}/${EX}`).set(vs);
  await db.ref(`poltronas/${OWN}/${EX}`).set(null);
  let r = await chamar(venda, { method: "GET", query: { vagas: "1" } });
  assert.deepEqual(r.body.frei, { selo: "", livres: 46, cap: 46 });
  // 30 poltronas marcadas no mapa (o caso do Frei Gilson): faltam 16 de 46 (≤ 40%) → Últimas vagas
  await db.ref(`poltronas/${OWN}/${EX}/v1`).set(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, `via${i}`])));
  r = await chamar(venda, { method: "GET", query: { vagas: "1" } });
  assert.deepEqual(r.body.frei, { selo: "ultimas", livres: 16, cap: 46 });
  // a página de compra recebe a mesma conta
  const g = await chamar(venda, { method: "GET", query: { e: EX } });
  assert.deepEqual(g.body.vagas, { selo: "ultimas", livres: 16, cap: 46 });
});
