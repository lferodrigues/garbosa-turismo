import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import { usarFetch } from "../api/_lib/asaas.js";
import relatorio from "../api/relatorio-pagamentos.js";

process.env.ASAAS_API_KEY = "teste";
const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
const pag = (id, ref, status, extra = {}) => ({ id, externalReference: ref, customer: "cus1", status, value: 100, netValue: 97.5, dueDate: "2027-02-10", billingType: "BOLETO", invoiceUrl: `https://asaas/i/${id}`, ...extra });
let chamadas, pagina1, pagina2;

beforeEach(() => {
  chamadas = [];
  pagina1 = [pag("p1", "pedidoAg1", "RECEIVED", { paymentDate: "2027-01-05", installmentNumber: 1 }), pag("p2", "pedidoAg1", "OVERDUE", { installmentNumber: 2 })];
  pagina2 = [pag("p3", "pedidoAg2", "PENDING", { customer: "cus2" }), pag("p4", null, "PENDING", { customer: "cus9" }), pag("p5", "pedidoAg1", "PENDING", { deleted: true })];
  const db = criarDb({
    usuarios: { ag1: { tipo: "agencia" }, tr1: { tipo: "transportadora" } },
    pedidos: {
      ag1: { ex1: { pedidoAg1: { titular: { nome: "Ana Souza" }, excursao: { destino: "Aldeia" }, asaas: { customer: "cus1" } } } },
      ag2: { ex2: { pedidoAg2: { titular: { nome: "Bia Lima" }, excursao: { destino: "Barra" }, asaas: { customer: "cus2" } } } }
    }
  });
  usarFalsos({ db, auth: { verifyIdToken: async (t) => { const [uid, email] = t.split("|"); return { uid, email: email || "a@b.com" }; } } });
  usarFetch(async (url) => {
    chamadas.push(url);
    if (url.includes("/finance/balance")) return ok({ balance: 1234.56 });
    if (url.includes("/customers/cus9")) return ok({ name: "Carlos Avulso" });
    if (url.includes("/payments?")) return url.includes("offset=0") ? ok({ data: pagina1, hasMore: true }) : ok({ data: pagina2, hasMore: false });
    throw new Error(`inesperado: ${url}`);
  });
});
const pedir = async (token) => {
  const res = resposta();
  await relatorio({ method: "GET", headers: { authorization: `Bearer ${token}` }, query: { asaas: "1" } }, res);
  return res;
};

test("admin vê todas as cobranças da conta, o saldo e quem está fora do sistema", async () => {
  const r = await pedir("adm|contato@feliperodrigues.net");
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.saldoCent, 123456);
  assert.deepEqual(r.body.cobrancas.map((c) => c.id), ["p1", "p2", "p3", "p4"]);
  const [p1, p2, , p4] = r.body.cobrancas;
  assert.deepEqual([p1.nome, p1.destino, p1.situacao, p1.pagaEm, p1.valorCent, p1.liquidoCent], ["Ana Souza", "Aldeia", "paga", "2027-01-05", 10000, 9750]);
  assert.equal(p2.situacao, "vencida");
  assert.deepEqual([p4.nome, p4.destino, p4.exId], ["Carlos Avulso", "", ""]);
});

test("agência só vê as cobranças dela e não vê o saldo da conta", async () => {
  const r = await pedir("ag1|ag1@ex.com");
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.cobrancas.map((c) => c.id), ["p1", "p2"]);
  assert.equal(r.body.saldoCent, null);
  assert.ok(!chamadas.some((u) => u.includes("/finance/balance")));
  assert.ok(!chamadas.some((u) => u.includes("/customers/")));
});

test("outros perfis não entram", async () => {
  const r = await pedir("tr1|tr1@ex.com");
  assert.equal(r.statusCode, 403);
  assert.equal(chamadas.length, 0);
});
