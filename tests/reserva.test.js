import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDb } from "./fake-db.js";
import { resposta, pessoa } from "./util.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import reserva from "../api/reserva.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

const OWN = "ag1", EX = "exReserva1";
let db;
beforeEach(() => {
  db = criarDb({
    inscricoes: { [EX]: { owner: OWN, agencia: "Garbosa", destino: "Ipanema", dataSaida: somarDias(hojeBR(), 60), valor: 100, valorColo: 0, ativa: true } },
    excursoes: { [OWN]: { [EX]: { destino: "Ipanema", dataSaida: somarDias(hojeBR(), 60), valorColo: 20, veiculos: { v1: { tipo: "van15", valorTransporte: 1000, valorIngressos: 0, ordem: 0 } } } } },
    poltronas: { [OWN]: { [EX]: { v1: { 1: "antigo" } } } },
    viajantes: { [OWN]: { [EX]: { antigo: { nome: "Antigo", cpf: "390.533.447-05" } } } }
  });
  usarFalsos({ db });
});
const chamar = async (req) => { const res = resposta(); await reserva({ headers: {}, query: {}, ...req }, res); return res; };
const reservar = (pessoas) => chamar({ method: "POST", body: { e: EX, aceite: true, pessoas } });

test("GET mostra excursão e poltronas ocupadas sem precisar de venda online", async () => {
  const r = await chamar({ method: "GET", query: { e: EX } });
  assert.equal(r.body.ativa, true);
  assert.deepEqual(r.body.veiculos[0].ocupadas, [1]);
  assert.equal(r.body.valorCent, 10000);
});
test("reserva salva viajantes e poltronas, sem pagamento", async () => {
  const bebe = pessoa(2, { colo: true, cpf: "", rg: "", nascimento: somarDias(hojeBR(), -300) });
  const r = await reservar([pessoa(0, { assento: { vk: "v1", n: 2 } }), pessoa(1, { assento: { vk: "v1", n: 3 } }), bebe]);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.reservas.map((x) => x.poltrona), ["2", "3", "colo"]);
  const dump = db.dump();
  const novos = Object.values(dump.viajantes[OWN][EX]).filter((v) => v.origem === "reserva");
  assert.equal(novos.length, 3);
  assert.ok(novos.every((v) => !v.pagamentos && v.formaPagamento === "A combinar"));
  assert.deepEqual(novos.map((v) => v.valor).sort((a, b) => a - b), [20, 100, 100]);
  assert.equal(Object.keys(dump.poltronas[OWN][EX].v1).length, 3);
  assert.ok(dump.notificacoes[OWN]);
});
test("poltrona ocupada e CPF já reservado são recusados", async () => {
  let r = await reservar([pessoa(0, { assento: { vk: "v1", n: 1 } })]);
  assert.equal(r.statusCode, 409);
  assert.equal(Object.keys(db.dump().viajantes[OWN][EX]).length, 1);
  r = await reservar([pessoa(0, { cpf: "39053344705", assento: { vk: "v1", n: 5 } })]);
  assert.equal(r.statusCode, 409); assert.match(r.body.erro, /já tem reserva/);
});
test("link de inscrição encerrado bloqueia a reserva", async () => {
  await db.ref(`inscricoes/${EX}/ativa`).set(false);
  assert.equal((await chamar({ method: "GET", query: { e: EX } })).body.ativa, false);
  assert.equal((await reservar([pessoa(0, { assento: { vk: "v1", n: 4 } })])).statusCode, 409);
});
