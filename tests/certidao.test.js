import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import imagem from "../api/site-imagem.js";
import poltrona from "../api/poltrona-livre.js";
import { MAX_PENDENTES, MAX_BYTES } from "../api/_lib/certidao.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3]).toString("base64");
const EX = "exTeste123", SAIDA = somarDias(hojeBR(), 30);
let banco;

beforeEach(() => {
  banco = criarDb({
    usuarios: { ag: { nome: "Agência", tipo: "agencia", ativo: true }, ot: { nome: "Outra", tipo: "agencia", ativo: true }, co: { nome: "Colab", tipo: "agencia", ativo: true } },
    inscricoes: { [EX]: { owner: "ag", agencia: "Garbosa", ativa: true } },
    excursoes: { ag: { [EX]: { destino: "Aldeia", dataSaida: SAIDA, valor: 100, colaboradores: { co: true }, veiculos: { v1: { tipo: "onibus46", ordem: 0 } } } } },
    viajantes: { ag: { [EX]: { v1: { nome: "Bia Souza", docTipo: "CERTIDAO", origem: "link" }, v2: { nome: "Ana Lima", docTipo: "RG", origem: "link" } } } }
  });
  usarFalsos({ db: banco, auth: { verifyIdToken: async (t) => (t.startsWith("tok-") ? { uid: t.slice(4), email: `${t}@x.com` } : Promise.reject(new Error("x"))) } });
});
const post = async (corpo, token) => { const r = resposta(); await imagem({ method: "POST", query: { certidao: "1" }, headers: token ? { authorization: `Bearer ${token}` } : {}, body: corpo }, r); return r; };
const get = async (query, token) => { const r = resposta(); await imagem({ method: "GET", query: { certidao: "1", ...query }, headers: token ? { authorization: `Bearer ${token}` } : {} }, r); return r; };
const enviarFoto = () => post({ acao: "enviar", e: EX, base64: JPG });
const salvarPessoa = async (certidaoId) => {
  const r = resposta();
  await poltrona({ method: "POST", query: {}, body: { e: EX, pessoas: [{ nome: "Lia Souza", docTipo: "CERTIDAO", docNumero: "", certidaoId, assento: { vk: "v1", n: 7 } }] } }, r);
  return r;
};

test("foto pendente fica no banco, separada da lista", async () => {
  const r = await enviarFoto();
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const d = banco.dump();
  assert.equal(d.certidoesFotos.ag[EX][r.body.id], JPG);
  assert.equal(d.certidoes.ag[EX][r.body.id].vid, undefined);
  assert.equal(JSON.stringify(d.certidoes).includes(JPG), false);
});
test("o envio aparece na página pública", async () => {
  assert.equal((await get({ status: "1" })).body.ativo, true);
  const r = resposta(); await poltrona({ method: "GET", query: { e: EX }, body: {} }, r);
  assert.equal(r.body.certidaoFoto, true);
});
test("recusa o que não é JPEG, foto grande demais e link fechado", async () => {
  assert.equal((await post({ acao: "enviar", e: EX, base64: Buffer.from("<script>").toString("base64") })).statusCode, 400);
  const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_BYTES)]).toString("base64");
  assert.equal((await post({ acao: "enviar", e: EX, base64: grande })).statusCode, 400);
  await banco.ref(`inscricoes/${EX}/ativa`).set(false);
  assert.equal((await enviarFoto()).statusCode, 409);
});
test("limita fotos sem viajante no link público", async () => {
  const pend = Object.fromEntries(Array.from({ length: MAX_PENDENTES }, (_, i) => [`c${i}`, { criadoEm: Date.now() }]));
  await banco.ref(`certidoes/ag/${EX}`).set(pend);
  assert.equal((await enviarFoto()).statusCode, 429);
});
test("foto abandonada há mais de 24 horas some no envio seguinte; a ligada a viajante fica", async () => {
  const velha = Date.now() - 25 * 3600000;
  await banco.ref(`certidoes/ag/${EX}`).set({ aband: { criadoEm: velha }, ligada: { criadoEm: velha, vid: "v1" } });
  await banco.ref(`certidoesFotos/ag/${EX}`).set({ aband: JPG, ligada: JPG });
  assert.equal((await enviarFoto()).statusCode, 200);
  const d = banco.dump();
  assert.equal(d.certidoes.ag[EX].aband, undefined);
  assert.equal(d.certidoesFotos.ag[EX].aband, undefined);
  assert.ok(d.certidoesFotos.ag[EX].ligada);
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
  assert.equal(banco.dump().certidoesFotos.ag[EX][a.body.id], undefined);
});
test("excluir a excursão apaga fotos e registros; colaborador não pode", async () => {
  await enviarFoto();
  await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-co")).statusCode, 403);
  assert.ok(banco.dump().certidoesFotos.ag[EX]);
  assert.equal((await post({ acao: "excluir-excursao", e: EX, own: "ag" }, "tok-ag")).statusCode, 200);
  assert.equal(banco.dump().certidoes, undefined);
  assert.equal(banco.dump().certidoesFotos, undefined);
});
test("excluir viajante pelo painel apaga a foto dele", async () => {
  await post({ acao: "anexar", e: EX, own: "ag", vid: "v1", base64: JPG }, "tok-ag");
  await post({ acao: "remover", e: EX, own: "ag", vid: "v1" }, "tok-ag");
  assert.equal(banco.dump().certidoesFotos, undefined);
});
