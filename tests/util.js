export function cpf(base) {
  const d = String(base).padStart(9, "1").slice(0, 9).split("").map(Number);
  const dv = (arr) => { let s = 0; arr.forEach((x, i) => { s += x * (arr.length + 1 - i); }); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d)); d.push(dv(d));
  return d.join("");
}
export function resposta() {
  return { statusCode: 0, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader(k, v) { this.headers[k] = v; } };
}
export const endereco = { cep: "36680-000", rua: "Rua Coronel Peixoto", numero: "100", complemento: "", bairro: "Centro", cidade: "São João Nepomuceno", uf: "MG" };
export function pessoa(i, extra = {}) {
  return { nome: `Pessoa ${"ABCDEFGHIJ"[i]} Silva`, cpf: cpf(100000000 + i * 7919), rg: `MG-${1000 + i}`, nascimento: "1990-05-10", email: `p${i}@ex.com`, whatsapp: "32999990000", endereco, ...extra };
}
