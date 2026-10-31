import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../sistema/js/venda-regras.js";

test("parcelas do boleto terminam antes da saída e respeitam o máximo", () => {
  const o = R.opcoesPagamento({ maxParcelas: 6, primeiraParcela: "2026-11-10" }, "2027-03-20", 100000, "2026-10-30");
  assert.equal(o.PIX, 1);
  assert.equal(o.CREDIT_CARD, 6);
  assert.equal(o.primeiroVencimento, "2026-11-10");
  assert.equal(o.BOLETO, 5); // 10/11, 10/12, 10/01, 10/02, 10/03 < 20/03
});
test("primeira parcela já passou: vence em hoje + 3", () => {
  const o = R.opcoesPagamento({ maxParcelas: 3, primeiraParcela: "2026-10-01" }, "2027-05-01", 90000, "2026-10-30");
  assert.equal(o.primeiroVencimento, "2026-11-02");
  assert.equal(o.BOLETO, 3);
});
test("saída antes do 1º vencimento: sem boleto", () => {
  const o = R.opcoesPagamento({ maxParcelas: 6, primeiraParcela: "2026-12-10" }, "2026-12-05", 90000, "2026-10-30");
  assert.equal(o.BOLETO, 0);
});
test("parcela mínima de R$ 5", () => {
  const o = R.opcoesPagamento({ maxParcelas: 6 }, "2027-12-01", 1200, "2026-10-30");
  assert.equal(o.CREDIT_CARD, 2);
});
test("cupom vale só para as N primeiras pessoas da compra; colo não usa cupom", () => {
  const cupom = R.avaliarCupom({ valor: 150, porCompra: 5 }, 0, "2026-10-30");
  const pessoas = [{}, {}, { colo: true }, {}, {}, {}, {}, {}];
  const c = R.calcularItens(pessoas, { valorCent: 20000, valorColoCent: 3000, cupom });
  assert.deepEqual(c.itens.map((i) => i.valorCent), [15000, 15000, 3000, 15000, 15000, 15000, 20000, 20000]);
  assert.equal(c.comCupom, 5);
  assert.equal(c.totalCent, 15000 * 5 + 3000 + 40000);
  assert.equal(c.descontoCent, 5 * 5000);
});
test("cupom com limite total usa só as vagas que restam", () => {
  const cupom = R.avaliarCupom({ valor: 150, porCompra: 5, limite: 10 }, 8, "2026-10-30");
  assert.equal(cupom.restam, 2);
  const c = R.calcularItens([{}, {}, {}], { valorCent: 20000, cupom });
  assert.equal(c.comCupom, 2);
  assert.equal(R.avaliarCupom({ valor: 150, porCompra: 5, limite: 10 }, 10).ok, false);
  assert.equal(R.avaliarCupom({ valor: 150, validade: "2026-10-01" }, 0, "2026-10-30").ok, false);
});
test("valor por pessoa segue o rateio do sistema", () => {
  const ex = { veiculos: { a: { tipo: "onibus46", valorTransporte: 9000, valorIngressos: 1000, ordem: 0 } } };
  assert.equal(R.precoPessoaCent(ex), Math.round(10000 / 32 * 100));
});
test("validação de pessoa", () => {
  const p = { nome: "Ana Souza", cpf: "52998224725", rg: "MG1", nascimento: "2000-01-01", email: "a@b.com", whatsapp: "32999999999",
    endereco: { cep: "36680000", rua: "R", numero: "1", bairro: "B", cidade: "C", uf: "MG" } };
  assert.equal(R.erroPessoa(p, "2027-01-01", true), "");
  assert.match(R.erroPessoa({ ...p, cpf: "11111111111" }, "2027-01-01", true), /CPF/);
  assert.match(R.erroPessoa({ ...p, nascimento: "2015-01-01" }, "2027-01-01", true), /maior de idade/);
  assert.equal(R.erroPessoa({ ...p, cpf: "", rg: "", colo: true, nascimento: "2024-01-01" }, "2027-01-01"), "");
  assert.match(R.erroPessoa({ ...p, colo: true }, "2027-01-01"), /colo/);
});
test("somar meses no fim do mês", () => {
  assert.equal(R.somarMeses("2027-01-31", 1), "2027-02-28");
  assert.equal(R.dividir(1000, 3).join(), "333,333,334");
});

test("rotas internas dizem qual variável falta na Vercel; páginas públicas não", async () => {
  const { tratarErro } = await import("../api/_lib/http.js");
  const { ErroConfig } = await import("../api/_lib/firebase.js");
  const res = () => ({ h: {}, setHeader() {}, status(c) { this.c = c; return this; }, json(o) { this.b = o; } });
  const a = res(), b = res();
  tratarErro(a, new ErroConfig("GITHUB_TOKEN não configurada na Vercel."), { interno: true });
  tratarErro(b, new ErroConfig("GITHUB_TOKEN não configurada na Vercel."));
  assert.match(a.b.erro, /GITHUB_TOKEN/);
  assert.doesNotMatch(b.b.erro, /GITHUB_TOKEN/);
});

test("Double Decker 60: dois pisos com todas as poltronas de 1 a 60, sem repetir", async () => {
  const R = await import("../sistema/js/venda-regras.js");
  assert.equal(R.VEICULOS.onibus64.cap, 60);
  const planta = R.plantaVeiculo("onibus64");
  assert.deepEqual(planta.map((p) => p.titulo), ["Piso superior", "Piso inferior"]);
  const nums = R.numerosDaPlanta(planta);
  assert.equal(nums.length, 60);
  assert.deepEqual([...nums].sort((a, b) => a - b), Array.from({ length: 60 }, (_, i) => i + 1));
  assert.deepEqual(planta[0].linhas[0], { esq: [1, 2], dir: [4, 3] });
  assert.deepEqual(planta[1].linhas.at(-1), { esq: [58, 59], dir: [60], largo: true });
  assert.equal(R.plantaVeiculo("onibus46").length, 1);
});
