import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import handler from "../api/pedido-grupo.js";
import { documentoMascarado } from "../api/_lib/passagem.js";
import * as R from "../sistema/js/venda-regras.js";

const EX = "exTeste123";
let banco;
const pago = { p1: { valor: 50, data: "2026-11-04", forma: "Pix" } };

beforeEach(() => {
  banco = criarDb({
    usuarios: { ag: { nome: "Agência", tipo: "agencia", empresa: "Garbosa Turismo", documento: "12.345.678/0001-90", whatsapp: "(32) 99999-0000" } },
    inscricoes: { [EX]: { owner: "ag", agencia: "Garbosa Turismo", ativa: true } },
    excursoes: { ag: { [EX]: { destino: "Aldeia", dataSaida: "2026-12-20", horaSaida: "05:00", dataRetorno: "2026-12-20", horaRetorno: "19:00", localSaida: "Rodoviária",
      colaboradores: { co: true }, veiculos: { v1: { tipo: "onibus46", ordem: 0 } } } } },
    viajantes: { ag: { [EX]: {
      edson: { nome: "Edson Melo", pedido: "PED1", docTipo: "RG", docNumero: "MG-1234567", cpf: "111.222.333-44", telefone: "(32) 98888-7777", endereco: { rua: "Rua A" }, valor: 100, pagamentos: pago, statusVenda: "parcial" },
      ana: { nome: "Ana Melo", pedido: "PED1", responsavel: "Edson Melo", docTipo: "CERTIDAO", valor: 100, pagamentos: pago, statusVenda: "parcial" },
      bebe: { nome: "Bebê Melo", pedido: "PED1", responsavel: "Edson Melo", docTipo: "CERTIDAO", colo: true, valor: 0, statusVenda: "parcial" },
      lia: { nome: "Lia Reis", docTipo: "RG", docNumero: "99", valor: 200 },
      ivo: { nome: "Ivo Reis", docTipo: "RG", docNumero: "98", valor: 200, pagamentos: { m: { valor: 200 } }, responsavel: "Lia Reis" }
    } } },
    poltronas: { ag: { [EX]: { v1: { 5: "edson", 6: "ana" } } } }
  });
  usarFalsos({ db: banco, auth: { verifyIdToken: async (t) => (t.startsWith("tok-") ? { uid: t.slice(4), email: `${t}@x.com` } : Promise.reject(new Error("x"))) } });
});
const pedirLink = async (v, token = "tok-ag", own = "ag") => { const r = resposta(); await handler({ method: "POST", query: { passagem: "1" }, headers: { authorization: `Bearer ${token}` }, body: { e: EX, own, v } }, r); return r; };
const abrir = async (t) => { const r = resposta(); await handler({ method: "GET", query: { passagem: t }, headers: {} }, r); return r; };
const tokenDa = (url) => new URL(url).searchParams.get("t");

test("libera no primeiro pagamento, seja Asaas ou baixa manual", () => {
  const lista = Object.entries(banco.dump().viajantes.ag[EX]);
  assert.deepEqual([...R.passagensLiberadas(lista)].sort(), ["ana", "bebe", "edson", "ivo"]);
});
test("não libera sem pagamento nem compra cancelada", () => {
  assert.equal(R.passagensLiberadas([["a", { nome: "A", valor: 100 }]]).size, 0);
  assert.equal(R.passagensLiberadas([["a", { nome: "A", valor: 100, pagamentos: pago, statusVenda: "cancelado" }]]).size, 0);
  assert.equal(R.passagensLiberadas([["a", { nome: "A", valor: 0 }]]).size, 0);
});
test("o link do titular abre a família, e o do dependente só a própria passagem", async () => {
  const t = await pedirLink("edson");
  assert.equal(t.statusCode, 200, JSON.stringify(t.body));
  assert.equal(t.body.qtd, 3);
  const r = await abrir(tokenDa(t.body.url));
  assert.deepEqual(r.body.passagens.map((p) => p.nome), ["Edson Melo", "Ana Melo", "Bebê Melo"]);
  assert.deepEqual(r.body.passagens.map((p) => p.poltrona), ["5", "6", "Colo"]);
  assert.equal(r.body.agencia.cnpj, "12.345.678/0001-90");
  const dep = await abrir(r.body.passagens[1].token);
  assert.deepEqual(dep.body.passagens.map((p) => p.nome), ["Ana Melo"]);
});
test("a passagem pública não expõe CPF, telefone nem endereço", async () => {
  const r = await abrir(tokenDa((await pedirLink("edson")).body.url));
  const texto = JSON.stringify(r.body);
  for (const segredo of ["111.222", "98888", "Rua A", "MG-1234567"]) assert.equal(texto.includes(segredo), false, segredo);
  assert.equal(r.body.passagens[0].documento, "RG ***567");
});
test("titular ainda sem pagamento não recebe link; quem pagou sim, e o saldo aparece", async () => {
  assert.equal((await pedirLink("lia")).statusCode, 409);
  const r = await abrir(tokenDa((await pedirLink("edson")).body.url));
  assert.equal(r.body.passagens[0].pagoCent, 5000);
  assert.equal(r.body.passagens[0].saldoCent, 5000);
});
test("estornou ou saiu da lista: o link deixa de abrir", async () => {
  const t = tokenDa((await pedirLink("edson")).body.url);
  await banco.ref(`viajantes/ag/${EX}/edson/pagamentos`).set(null);
  assert.equal((await abrir(t)).statusCode, 403);
  await banco.ref(`viajantes/ag/${EX}/edson`).set(null);
  assert.equal((await abrir(t)).statusCode, 404);
});
test("só a agência dona, colaborador ou admin geram o link; o link repete", async () => {
  assert.equal((await pedirLink("edson", "tok-outra")).statusCode, 403);
  assert.equal((await pedirLink("edson", "invalido")).statusCode, 401);
  assert.equal((await pedirLink("edson", "tok-co")).statusCode, 200);
  assert.equal((await pedirLink("edson")).body.url, (await pedirLink("edson")).body.url);
  assert.equal((await abrir("codigo-que-nao-existe-1234")).statusCode, 404);
  assert.equal((await abrir("x")).statusCode, 404);
});
test("documento mascarado", () => {
  assert.equal(documentoMascarado({ docTipo: "CERTIDAO" }), "Certidão de nascimento");
  assert.equal(documentoMascarado({ docTipo: "RG", docNumero: "Não tem" }), "Não informado");
  assert.equal(documentoMascarado({ cpf: "111.222.333-44" }), "CPF ***344");
});
