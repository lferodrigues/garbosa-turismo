import { ErroConfig } from "./firebase.js";
import { ErroAsaas } from "./asaas.js";

/** Erro com mensagem que pode ser mostrada ao comprador */
export class ErroUsuario extends Error {
  constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; }
}

export function enviar(res, status, obj) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(obj);
}

export function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { throw new ErroUsuario("Requisição inválida."); }
}

export function soMetodo(req, res, ...metodos) {
  if (metodos.includes(req.method)) return true;
  res.setHeader("Allow", metodos.join(", "));
  enviar(res, 405, { erro: "Método não permitido." });
  return false;
}

export function tratarErro(res, e) {
  if (e instanceof ErroUsuario) return enviar(res, e.status, { erro: e.message, ...e.extra });
  if (e instanceof ErroConfig) { console.error("CONFIGURAÇÃO:", e.message); return enviar(res, 503, { erro: "A venda online ainda não foi configurada. Fale com a agência." }); }
  if (e instanceof ErroAsaas) { console.error("ASAAS:", e.status, JSON.stringify(e.detalhes)); return enviar(res, 502, { erro: `O Asaas recusou a cobrança: ${e.message}` }); }
  console.error(e);
  return enviar(res, 500, { erro: "Erro inesperado. Tente novamente em instantes." });
}
