import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import imagem, { usarFetchGithub } from "../api/site-imagem.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3]).toString("base64");
let chamadas;
beforeEach(() => {
  process.env.GITHUB_TOKEN = "ghp_teste";
  usarFalsos({
    db: criarDb({ usuarios: { ag: { nome: "Agência X", tipo: "agencia", ativo: true }, tr: { nome: "Transp", tipo: "transportadora", ativo: true } } }),
    auth: { verifyIdToken: async (t) => ({ "tok-ag": { uid: "ag", email: "a@x.com" }, "tok-adm": { uid: "adm", email: "contato@feliperodrigues.net" }, "tok-tr": { uid: "tr", email: "t@x.com" } })[t] || Promise.reject(new Error("x")) }
  });
  chamadas = [];
  usarFetchGithub(async (url, op) => { chamadas.push({ url, op, corpo: JSON.parse(op.body) }); return { ok: true, status: 201, json: async () => ({}) }; });
});
const enviar = async (token, corpo) => { const res = resposta(); await imagem({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: corpo }, res); return res; };

test("agência envia folder: vira commit no GitHub em Assets/img/excursoes", async () => {
  const r = await enviar("tok-ag", { nome: "Praia de Ipanema!", tipo: "image/jpeg", base64: JPG });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.match(r.body.caminho, /^Assets\/img\/excursoes\/praia-de-ipanema-[a-z0-9]+\.jpg$/);
  assert.match(chamadas[0].url, /api\.github\.com\/repos\/lferodrigues\/garbosa-turismo\/contents\/Assets\/img\/excursoes\//);
  assert.equal(chamadas[0].op.method, "PUT");
  assert.equal(chamadas[0].corpo.content, JPG);
  assert.equal(chamadas[0].corpo.branch, "main");
  assert.equal(chamadas[0].op.headers.Authorization, "Bearer ghp_teste");
});
test("administrador também envia; transportadora e anônimo não", async () => {
  assert.equal((await enviar("tok-adm", { nome: "x", tipo: "image/jpeg", base64: JPG })).statusCode, 200);
  assert.equal((await enviar("tok-tr", { nome: "x", tipo: "image/jpeg", base64: JPG })).statusCode, 403);
  assert.equal((await enviar(null, { nome: "x", tipo: "image/jpeg", base64: JPG })).statusCode, 401);
});
test("recusa arquivo que não é imagem e tipo não permitido", async () => {
  assert.equal((await enviar("tok-ag", { nome: "x", tipo: "image/jpeg", base64: Buffer.from("<script>").toString("base64") })).statusCode, 400);
  assert.equal((await enviar("tok-ag", { nome: "x", tipo: "image/svg+xml", base64: JPG })).statusCode, 400);
});
test("sem GITHUB_TOKEN: avisa configuração", async () => {
  delete process.env.GITHUB_TOKEN;
  assert.equal((await enviar("tok-ag", { nome: "x", tipo: "image/jpeg", base64: JPG })).statusCode, 503);
});
