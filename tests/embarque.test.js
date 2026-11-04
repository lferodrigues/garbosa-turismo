import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../sistema/js/venda-regras.js";

const lido = (ponto, em = 1) => ({ a: { ponto, em } });
const umVeic = { veiculos: { v1: { tipo: "onibus46", ordem: 0 } } };
const dois = { veiculos: { v1: { tipo: "onibus46", ordem: 0 }, v2: { tipo: "van15", ordem: 1 } } };

test("pontos ficam na ordem da viagem", () => {
  const ex = { conferencia: { pontos: {
    z: { trecho: "volta", tipo: "parada", nome: "Graal", ordem: 1 }, volta_embarque: { trecho: "volta", tipo: "embarque", nome: "Parque", ordem: 0 },
    b: { trecho: "ida", tipo: "parada", nome: "Posto 2", ordem: 2 }, a: { trecho: "ida", tipo: "parada", nome: "Posto 1", ordem: 1 }, ida_embarque: { trecho: "ida", tipo: "embarque", nome: "Rodoviária", ordem: 0 } } } };
  assert.deepEqual(R.pontosDe(ex).map((p) => p.nome), ["Rodoviária", "Posto 1", "Posto 2", "Parque", "Graal"]);
  assert.equal(R.rotuloPonto(R.pontosDe(ex)[3]), "Volta · Embarque: Parque");
});
test("lê o código do link do QR, e recusa outros textos", () => {
  const t = "95fTG6OBUxdLfeVYZ9aF2Q";
  assert.equal(R.tokenDoQr(`https://garbosaturismo.com.br/sistema/passagem.html?t=${t}`), t);
  assert.equal(R.tokenDoQr(t), t);
  assert.equal(R.tokenDoQr("https://exemplo.com/nada"), "");
  assert.equal(R.tokenDoQr(""), "");
});
test("a primeira leitura vale e as seguintes ficam anotadas", () => {
  const v = { leituras: { x: { ponto: "p1", em: 20 }, y: { ponto: "p1", em: 10 }, z: { ponto: "p2", em: 30 } } };
  assert.equal(R.leituraNoPonto(v, "p1").em, 10);
  assert.equal(R.leiturasDe(v).length, 3);
  assert.equal(R.leituraNoPonto(v, "p3"), null);
});
test("todos a bordo só quando ninguém do veículo falta", () => {
  const lista = [["a", { nome: "A", leituras: lido("p1") }], ["b", { nome: "B" }]];
  const antes = R.conferenciaDoPonto(lista, {}, umVeic, "p1", "v1");
  assert.deepEqual([antes.presentes, antes.faltam, antes.completo], [["a"], ["b"], false]);
  lista[1][1].leituras = lido("p1");
  assert.equal(R.conferenciaDoPonto(lista, {}, umVeic, "p1", "v1").completo, true);
  assert.equal(R.conferenciaDoPonto(lista, {}, umVeic, "p2", "v1").completo, false); // cada ponto conta de novo
  assert.equal(R.conferenciaDoPonto([], {}, umVeic, "p1", "v1").completo, false);
});
test("com dois veículos conta só o veículo escolhido, e colo acompanha o titular", () => {
  const lista = [
    ["ed", { nome: "Ed", pedido: "P" }], ["be", { nome: "Bebê", pedido: "P", responsavel: "Ed", colo: true }],
    ["jo", { nome: "Jo" }], ["sem", { nome: "Sem Poltrona" }]
  ];
  const mapa = { v1: { 1: "ed" }, v2: { 1: "jo" } };
  const c1 = R.conferenciaDoPonto(lista, mapa, dois, "p1", "v1"), c2 = R.conferenciaDoPonto(lista, mapa, dois, "p1", "v2");
  assert.deepEqual(c1.esperados, ["ed", "be"]);
  assert.deepEqual(c2.esperados, ["jo"]);
  assert.deepEqual(c1.semVeiculo, ["sem"]);
  assert.equal(c1.vkDe("jo"), "v2");
});
test("familiaDe mostra quem viaja junto", () => {
  const lista = [["ed", { nome: "Ed", pedido: "P" }], ["ana", { nome: "Ana", pedido: "P", responsavel: "Ed" }], ["jo", { nome: "Jo" }]];
  assert.deepEqual(R.familiaDe(lista, "ana").map(([id]) => id), ["ed", "ana"]);
  assert.deepEqual(R.familiaDe(lista, "jo").map(([id]) => id), ["jo"]);
});
