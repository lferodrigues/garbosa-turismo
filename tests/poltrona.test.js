import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import poltrona from "../api/poltrona-livre.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

const OWN = "ag1", EX = "exPoltrona1";
let db;
beforeEach(() => {
  db = criarDb({
    inscricoes: { [EX]: { owner: OWN, agencia: "Garbosa", destino: "Ipanema", dataSaida: somarDias(hojeBR(), 30), valor: 100, valorColo: 0, ativa: true } },
    excursoes: { [OWN]: { [EX]: { destino: "Ipanema", dataSaida: somarDias(hojeBR(), 30), veiculos: { v1: { tipo: "van15", valorTransporte: 1000, valorIngressos: 0, ordem: 0 } } } } },
    poltronas: { [OWN]: { [EX]: { v1: { 2: "antigo" } } } },
    viajantes: { [OWN]: { [EX]: { antigo: { nome: "Antigo Silva" } } } }
  });
  usarFalsos({ db });
});
const chamar = async (req) => { const res = resposta(); await poltrona({ headers: {}, query: {}, ...req }, res); return res; };
const salvar = (pessoas) => chamar({ method: "POST", body: { e: EX, pessoas } });

test("GET mostra mapa com ocupadas e o WhatsApp da certidão", async () => {
  const r = await chamar({ method: "GET", query: { e: EX } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.veiculos[0].ocupadas, [2]);
  assert.equal(r.body.whatsappCertidao, "5532999775281");
});
test("salva nome + RG e certidão com a poltrona, sem pagamento", async () => {
  const r = await salvar([
    { nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-12.345", assento: { vk: "v1", n: 5 } },
    { nome: "Bia Souza", docTipo: "CERTIDAO", docNumero: "", assento: { vk: "v1", n: 6 } }
  ]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.poltronas.map((x) => [x.poltrona, x.certidao]), [["5", false], ["6", true]]);
  const d = db.dump();
  const vias = Object.values(d.viajantes[OWN][EX]).filter((v) => v.origem === "poltrona");
  assert.equal(vias.length, 2);
  assert.equal(vias.find((v) => v.docTipo === "CERTIDAO").nome, "Bia Souza");
  assert.equal(vias[0].valor, 100);
  assert.equal(Object.keys(d.poltronas[OWN][EX].v1).length, 3);
  assert.ok(d.notificacoes[OWN]);
});
test("recusa poltrona ocupada, RG vazio e link encerrado", async () => {
  let r = await salvar([{ nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-1234", assento: { vk: "v1", n: 2 } }]);
  assert.equal(r.statusCode, 409);
  r = await salvar([{ nome: "Ana Paula Souza", docTipo: "RG", docNumero: "", assento: { vk: "v1", n: 3 } }]);
  assert.equal(r.statusCode, 400);
  r = await salvar([{ nome: "Ana", docTipo: "CERTIDAO", assento: { vk: "v1", n: 3 } }]);
  assert.equal(r.statusCode, 400);
  await db.ref(`inscricoes/${EX}/ativa`).set(false);
  r = await chamar({ method: "GET", query: { e: EX } });
  assert.equal(r.statusCode, 409);
  assert.equal(Object.values(db.dump().viajantes[OWN][EX]).length, 1);
});

/* ---------- criança de colo ---------- */
const nasc = (anos, dias = 0) => somarDias(`${Number(somarDias(hojeBR(), 30).slice(0, 4)) - anos}${somarDias(hojeBR(), 30).slice(4)}`, dias);
test("criança de colo até 5 anos completos não ocupa poltrona e vai com um adulto", async () => {
  await db.ref(`excursoes/${OWN}/${EX}/valorColo`).set(30);
  const r = await salvar([
    { nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-55.555", assento: { vk: "v1", n: 5 } },
    { nome: "Lia Souza", docTipo: "CERTIDAO", colo: true, nascimento: nasc(5), com: 0, assento: { vk: "v1", n: 9 } }
  ]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.poltronas.map((x) => x.poltrona), ["5", "colo"]);
  const lia = Object.values(db.dump().viajantes[OWN][EX]).find((v) => v.nome === "Lia Souza");
  assert.equal(lia.colo, true); assert.equal(lia.idade, 5); assert.equal(lia.valor, 30); assert.equal(lia.responsavel, "Ana Paula Souza");
  assert.equal(Object.keys(db.dump().poltronas[OWN][EX].v1).length, 2); // só a Ana sentou
});
test("colo recusa quem passa de 5 anos, sem data ou sem adulto", async () => {
  const ana = { nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-55.555", assento: { vk: "v1", n: 5 } };
  let r = await salvar([ana, { nome: "Lia Souza", docTipo: "CERTIDAO", colo: true, nascimento: nasc(6), com: 0 }]);
  assert.equal(r.statusCode, 400); assert.match(r.body.erro, /6 anos/);
  r = await salvar([ana, { nome: "Lia Souza", docTipo: "CERTIDAO", colo: true, nascimento: "", com: 0 }]);
  assert.equal(r.statusCode, 400);
  r = await salvar([{ nome: "Lia Souza", docTipo: "CERTIDAO", colo: true, nascimento: nasc(2), com: 0 }]);
  assert.equal(r.statusCode, 400); assert.match(r.body.erro, /colo de quem/);
});

/* ---------- documento já cadastrado ---------- */
test("conferir acha o documento com ou sem pontuação e não mostra o nome inteiro", async () => {
  await salvar([{ nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-12.345.678", assento: { vk: "v1", n: 5 } }]);
  await db.ref(`viajantes/${OWN}/${EX}/antigo/rg`).set("98.765-4");
  const r = await chamar({ method: "POST", body: { acao: "conferir", e: EX, docs: ["12345678", "999999", "mg 98765-4"] } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.encontrados.map((x) => [x.i, x.nome, x.poltrona, x.podeAlterar]), [[0, "Ana S.", "5", true], [2, "Antigo S.", "2", false]]);
});
test("não deixa cadastrar o mesmo documento duas vezes", async () => {
  await salvar([{ nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-12.345.678", assento: { vk: "v1", n: 5 } }]);
  const r = await salvar([{ nome: "Ana P Souza", docTipo: "RG", docNumero: "12345678", assento: { vk: "v1", n: 7 } }]);
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body.jaCadastrados, [0]);
});
test("altera o cadastro (troca a poltrona) e mantém outro para levar criança no colo", async () => {
  await salvar([{ nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-12.345.678", assento: { vk: "v1", n: 5 } }]);
  const vid = (await chamar({ method: "POST", body: { acao: "conferir", e: EX, docs: ["12345678"] } })).body.encontrados[0].vid;
  let r = await salvar([{ vid, nome: "Ana Paula de Souza", docTipo: "RG", docNumero: "12.345.678", assento: { vk: "v1", n: 8 } }]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  let d = db.dump();
  assert.equal(d.poltronas[OWN][EX].v1[8], vid);
  assert.equal(d.poltronas[OWN][EX].v1[5], undefined);
  assert.equal(d.viajantes[OWN][EX][vid].nome, "Ana Paula de Souza");
  assert.equal(Object.keys(d.viajantes[OWN][EX]).length, 2);
  // mantém a Ana e cadastra a filha no colo dela
  r = await salvar([{ vid, docNumero: "MG12345678", manter: true }, { nome: "Lia Souza", docTipo: "CERTIDAO", colo: true, nascimento: nasc(1), com: 0 }]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.poltronas.map((x) => [x.poltrona, x.mantido]), [["8", true], ["colo", false]]);
  d = db.dump();
  assert.equal(Object.values(d.viajantes[OWN][EX]).find((v) => v.nome === "Lia Souza").responsavel, "Ana Paula de Souza");
  // documento errado ou cadastro da agência não podem ser alterados
  r = await salvar([{ vid, nome: "Outra Pessoa", docTipo: "RG", docNumero: "11111111", assento: { vk: "v1", n: 9 } }]);
  assert.equal(r.statusCode, 409);
  await db.ref(`viajantes/${OWN}/${EX}/antigo/rg`).set("4444-4");
  r = await salvar([{ vid: "antigo", nome: "Antigo Silva", docTipo: "RG", docNumero: "44444", assento: { vk: "v1", n: 9 } }]);
  assert.equal(r.statusCode, 409); assert.match(r.body.erro, /agência/);
});

test("poltrona leito do Double Decker soma R$ 20 no valor do viajante", async () => {
  await db.ref(`excursoes/${OWN}/${EX}/veiculos/v1/tipo`).set("dd60");
  const base = (await chamar({ method: "GET", query: { e: EX } })).body;
  assert.equal(base.veiculos[0].tipo, "dd60");
  let r = await salvar([
    { nome: "Ana Paula Souza", docTipo: "RG", docNumero: "MG-1.111.111", assento: { vk: "v1", n: 10 } },
    { nome: "Bia Paula Souza", docTipo: "RG", docNumero: "MG-2.222.222", assento: { vk: "v1", n: 51 } }
  ]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const vs = Object.values(db.dump().viajantes[OWN][EX]);
  const ana = vs.find((v) => v.nome === "Ana Paula Souza"), bia = vs.find((v) => v.nome === "Bia Paula Souza");
  assert.equal(bia.valor - ana.valor, 20);
  // trocar a Bia do leito para o piso de cima tira os R$ 20
  const vid = (await chamar({ method: "POST", body: { acao: "conferir", e: EX, docs: ["2222222"] } })).body.encontrados[0].vid;
  r = await salvar([{ vid, nome: "Bia Paula Souza", docTipo: "RG", docNumero: "2222222", assento: { vk: "v1", n: 11 } }]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(db.dump().viajantes[OWN][EX][vid].valor, ana.valor);
});
