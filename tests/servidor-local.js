// Servidor de desenvolvimento: arquivos do site + /api com banco em memória e Asaas falso.
// Uso: node tests/servidor-local.js  →  http://localhost:5173/sistema/comprar.html?e=exTeste123
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { criarDb } from "./fake-db.js";
import { usarFalsos } from "../api/_lib/firebase.js";
import { usarFetch } from "../api/_lib/asaas.js";
import { somarDias, hojeBR } from "../sistema/js/venda-regras.js";

process.env.ASAAS_API_KEY = "local";
const RAIZ = new URL("..", import.meta.url).pathname;
const SAIDA = somarDias(hojeBR(), 120);
const db = criarDb({
  inscricoes: { exTeste123: { owner: "ag1", agencia: "Garbosa Turismo", destino: "Aldeia das Águas", dataSaida: SAIDA, valor: 1, valorColo: 0, ativa: true } },
  excursoes: { ag1: { exTeste123: {
    destino: "Aldeia das Águas Park Resort", dataSaida: SAIDA, horaSaida: "05:00", dataRetorno: SAIDA, horaRetorno: "19:00", localSaida: "Rodoviária de São João Nepomuceno",
    descricao: "Day use com acesso a todas as piscinas e toboáguas.\nInclui: transporte ida e volta, ingresso e seguro viagem.", valorColo: 60,
    veiculos: { v1: { tipo: "onibus46", valorTransporte: 7500, valorIngressos: 2500, ordem: 0 }, v2: { tipo: "van15", valorTransporte: 2000, valorIngressos: 0, ordem: 1 } },
    venda: { ativa: true, maxParcelas: 6, primeiraParcela: somarDias(hojeBR(), 12) },
    cupons: { AMIGOS: { valor: 250, porCompra: 5, ativo: true } }
  } } },
  poltronas: { ag1: { exTeste123: { v1: { 1: "a", 2: "b", 5: "c", 6: "d", 13: "e", 14: "f", 22: "g" } } } }
});
usarFalsos({ db });
usarFetch(async (url, op) => {
  const ok = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  console.log("ASAAS", op.method, url, op.body || "");
  if (url.includes("/customers?")) return ok({ data: [] });
  if (url.endsWith("/customers")) return ok({ id: "cus_local" });
  if (url.endsWith("/payments")) return ok({ id: "pay_local", invoiceUrl: "http://localhost:5173/__asaas-fake" });
  return ok({});
});
const handlers = {};
for (const n of ["venda", "cupom", "pedido", "asaas-webhook"]) handlers[n] = (await import(`../api/${n}.js`)).default;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    let corpo = "";
    for await (const c of req) corpo += c;
    const r = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: corpo ? JSON.parse(corpo) : undefined };
    const s = { status(c) { res.statusCode = c; return s; }, setHeader: (k, v) => res.setHeader(k, v), json(o) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); } };
    const h = handlers[url.pathname.slice(5)];
    return h ? h(r, s) : s.status(404).json({ erro: "404" });
  }
  if (url.pathname === "/__asaas-fake") { res.setHeader("Content-Type", "text/html"); return res.end("<h1>Página de pagamento do Asaas (simulada)</h1>"); }
  if (url.pathname === "/__db") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(db.dump(), null, 1)); }
  try {
    const arq = normalize(join(RAIZ, decodeURIComponent(url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname)));
    if (!arq.startsWith(RAIZ)) throw new Error();
    const dados = await readFile(arq);
    res.setHeader("Content-Type", TIPOS[extname(arq)] || "application/octet-stream");
    res.end(dados);
  } catch { res.statusCode = 404; res.end("404"); }
}).listen(5173, () => console.log("http://localhost:5173/sistema/comprar.html?e=exTeste123"));
