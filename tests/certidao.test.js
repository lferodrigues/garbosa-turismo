import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import imagem from "../api/site-imagem.js";
import poltrona from "../api/poltrona-livre.js";
import { usarFetchCertidoes, MAX_PENDENTES_HORA } from "../api/_lib/certidao.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3]).toString("base64");
const EX = "exTeste123", SAIDA = somarDias(hojeBR(), 30);
let banco, gh, chamadas;

/** GitHub falso: guarda os arquivos por branch */
function githubFalso() {
  const estado = { privado: true, branches: { main: {} }, conflitos: 0, recusar: false };
  const resp = (status, o = {}) => ({ ok: status < 300, status, json: async () => o, arrayBuffer: async () => Buffer.from(o.bytes || "", "base64") });
  usarFetchCertidoes(async (url, op) => {
    const metodo = op.method, corpo = op.body ? JSON.parse(op.body) : null, c = url.replace("https://api.github.com/repos/dono/certidoes", "");
    chamadas.push({ metodo, c, op });
    if (estado.recusar) return resp(500, { message: "fora do ar" });
    if (c === "") return resp(200, { private: estado.privado, default_branch: "main" });
    let m = c.match(/^\/git\/refs?\/heads\/(.+)$/);
    if (m && metodo === "GET") return estado.branches[m[1]] ? resp(200, { object: { sha: "base" } }) : resp(404);
    if (m && metodo === "DELETE") { if (!estado.branches[m[1]]) return resp(422); delete estado.branches[m[1]]; return resp(204); }
    if (c === "/git/refs") { estado.branches[corpo.ref.replace("refs/heads/", "")] = {}; return resp(201); }
    m = c.match(/^\/contents\/([^?]+)(?:\?ref=(.+))?$/);
    if (m && metodo === "PUT") {
      if (estado.conflitos-- > 0) return resp(409);
      estado.branches[corpo.branch][m[1]] = corpo.content;
      return resp(201, { content: { sha: "sha-" + m[1] } });
    }
    if (m && metodo === "GET") { const b = estado.branches[m[2]]?.[m[1]]; return b ? resp(200, { bytes: b }) : resp(404); }
    if (m && metodo === "DELETE") { delete estado.branches[corpo.branch][m[1]]; return resp(200); }
    throw new Error(`chamada inesperada ${metodo} ${c}`);
  });
  return estado;
}

beforeEach(() => {
  process.env.GITHUB_TOKEN = "tok"; process.env.GITHUB_REPO = "dono/certidoes";
  chamadas = [];
  banco = criarDb({
    usuarios: { ag: { nome: "Agência", tipo: "agencia", ativo: true }, ot: { nome: "Outra", tipo: "agencia", ativo: true }, co: { nome: "Colab", tipo: "agencia", ativo: true } },
    inscricoes: { [EX]: { owner: "ag", agencia: "Garbosa", ativa: true } },
    excursoes: { ag: { [EX]: { destino: "Aldeia", dataSaida: SAIDA, valor: 100, colaboradores: { co: true }, veiculos: { v1: { tipo: "onibus46", ordem: 0 } } } } },
    viajantes: { ag: { [EX]: { v1: { nome: "Bia Souza", docTipo: "CERTIDAO", origem: "link" }, v2: { nome: "Ana Lima", docTipo: "RG", origem: "link" } } } }
  });
  usarFalsos({ db: banco, auth: { verifyIdToken: async (t) => (t.startsWith("tok-") ? { uid: t.slice(4), email: `${t}@x.com` } : Promise.reject(new Error("x"))) } });
  gh = githubFalso();
});
const post = async (corpo, token) => { const r = resposta(); await imagem({ method: "POST", query: { certidao: "1" }, headers: token ? { authorization: `Bearer ${token}` } : {}, body: corpo }, r); return r; };
const get = async (query, token) => { const r = resposta(); await imagem({ method: "GET", query: { certidao: "1", ...query }, headers: token ? { authorization: `Bearer ${token}` } : {} }, r); return r; };
const enviarFoto = () => post({ acao: "enviar", e: EX, base64: JPG });
const salvarPessoa = async (certidaoId) => {
  const r = resposta();
  await poltrona({ method: "POST", query: {}, body: { e: EX, pessoas: [{ nome: "Lia Souza", docTipo: "CERTIDAO", docNumero: "", certidaoId, assento: { vk: "v1", n: 7 } }] } }, r);
  return r;
};

test("foto pendente vai para a branch da excursão, sem nome de pessoa no arquivo", async () => {
  const r = await enviarFoto();
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(gh.branches[`ex-${EX}`]), [`certidoes/${r.body.id}.jpg`]);
  assert.deepEqual(gh.branches.main, {});
  assert.equal(chamadas.at(-1).op.headers.Authorization, "Bearer tok");
  assert.equal(banco.dump().certidoes.ag[EX][r.body.id].vid, undefined);
});
test("recusa repositório público, mesmo com tudo configurado", async () => {
  gh.privado = false;
  const r = await enviarFoto();
  assert.equal(r.statusCode, 503);
  assert.equal(gh.branches[`ex-${EX}`], undefined);
});
test("repositório público: a página continua só no WhatsApp; privado: liga o envio", async () => {
  gh.privado = false;
  assert.equal((await get({ status: "1" })).body.ativo, false);
  const r = resposta(); await poltrona({ method: "GET", query: { e: EX }, body: {} }, r);
  assert.equal(r.body.certidaoFoto, false);
  gh = githubFalso(); // zera a consulta guardada, como depois de 1 minuto
  assert.equal((await get({ status: "1" })).body.ativo, true);
});
test("sem token: a página pública continua no WhatsApp", async () => {
  delete process.env.GITHUB_TOKEN;
  assert.equal((await get({ status: "1" })).body.ativo, false);
});
test("recusa o que não é JPEG e link fechado", async () => {
  assert.equal((await post({ acao: "enviar", e: EX, base64: Buffer.from("<script>").toString("base64") })).statusCode, 400);
  await banco.ref(`inscricoes/${EX}/ativa`).set(false);
  assert.equal((await enviarFoto()).statusCode, 409);
});
test("repete quando duas fotos entram ao mesmo tempo (409 do GitHub)", async () => {
  gh.conflitos = 2;
  assert.equal((await enviarFoto()).statusCode, 200);
});
test("limita fotos sem viajante no link público", async () => {
  const pend = Object.fromEntries(Array.from({ length: MAX_PENDENTES_HORA }, (_, i) => [`c${i}`, { caminho: "x", criadoEm: Date.now() }]));
  await banco.ref(`certidoes/ag/${EX}`).set(pend);
  assert.equal((await enviarFoto()).statusCode, 429);
});
test("escolha de poltrona liga a foto ao viajante e dispensa o WhatsApp", async () => {
  const { body: { id } } = await enviarFoto();
  const r = await salvarPessoa(id);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.poltronas[0].certidao, false);
  assert.equal(r.body.poltronas[0].certidaoFoto, true);
  const d = banco.dump(), vid = d.certidoes.ag[EX][id].vid;
  assert.equal(d.viajantes.ag[EX][vid].nome, "Lia Souza");
  assert.match(d.viajantes.ag[EX][vid].obs, /foto da certidão enviada/);
});
test("id de foto que não existe: continua pedindo pelo WhatsApp", async () => {
  const r = await salvarPessoa("naoexiste");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.poltronas[0].certidao, true);
});
test("inscrição pelo link: só liga a foto a viajante com certidão e uma vez só", async () => {
  const { body: { id } } = await enviarFoto();
  assert.equal((await post({ acao: "vincular", e: EX, id, vid: "v2" })).statusCode, 404);
  assert.equal((await post({ acao: "vincular", e: EX, id, vid: "v1" })).statusCode, 200);
  assert.equal(banco.dump().certidoes.ag[EX][id].vid, "v1");
  assert.equal((await post({ acao: "vincular", e: EX, id, vid: "v1" })).statusCode, 404);
  assert.equal((await post({ acao: "descartar", e: EX, id })).statusCode, 200);
  assert.ok(banco.dump().certidoes.ag[EX][id], "descartar não apaga foto já ligada");
});
test("painel: dono e colaborador leem a foto; outra agência e anônimo não", async () => {
  const { body: { id } } = await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  assert.equal((await get({ e: EX, own: "ag" }, "tok-co")).body.certidoes[0].vid, "v1");
  const foto = await get({ e: EX, own: "ag", id }, "tok-ag");
  assert.equal(foto.statusCode, 200);
  assert.equal(foto.headers["Content-Type"], "image/jpeg");
  assert.equal(foto.headers["Cache-Control"], "private, no-store");
  assert.equal(foto.body.toString("base64"), JPG);
  assert.equal((await get({ e: EX, own: "ag", id }, "tok-ot")).statusCode, 403);
  assert.equal((await get({ e: EX, own: "ag", id })).statusCode, 401);
});
test("trocar a foto no painel apaga a anterior", async () => {
  const a = await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  const b = await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  assert.deepEqual(Object.keys(banco.dump().certidoes.ag[EX]), [b.body.id]);
  assert.equal(gh.branches[`ex-${EX}`][`certidoes/${a.body.id}.jpg`], undefined);
});
test("excluir a excursão apaga a branch inteira; colaborador não pode", async () => {
  await enviarFoto();
  await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-co")).statusCode, 403);
  assert.ok(gh.branches[`ex-${EX}`]);
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-ag")).statusCode, 200);
  assert.equal(gh.branches[`ex-${EX}`], undefined);
  assert.equal(banco.dump().certidoes, undefined);
});
test("se o GitHub falhar na exclusão, avisa e mantém o registro para tentar de novo", async () => {
  await enviarFoto();
  gh.recusar = true;
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-ag")).statusCode, 502);
  assert.ok(banco.dump().certidoes.ag[EX]);
});
test("excursão sem certidões é excluída sem depender do GitHub", async () => {
  gh.recusar = true;
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-ag")).statusCode, 200);
  assert.equal(chamadas.length, 0);
});
