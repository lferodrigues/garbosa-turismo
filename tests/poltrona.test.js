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
