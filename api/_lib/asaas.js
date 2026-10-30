// Cliente da API v3 do Asaas.
// Variáveis na Vercel: ASAAS_API_KEY (obrigatória) e ASAAS_AMBIENTE = "sandbox" para testes (padrão: produção).
import { ErroConfig } from "./firebase.js";

const BASE = () => (String(process.env.ASAAS_AMBIENTE || "").toLowerCase().startsWith("sandbox")
  ? "https://api-sandbox.asaas.com/v3"
  : "https://api.asaas.com/v3");

export class ErroAsaas extends Error {
  constructor(msg, status, detalhes) { super(msg); this.status = status; this.detalhes = detalhes; }
}

/** Para os testes: troca o fetch */
let _fetch = (...a) => fetch(...a);
export function usarFetch(fn) { _fetch = fn; }

export async function asaas(metodo, caminho, corpo) {
  const chave = (process.env.ASAAS_API_KEY || "").trim();
  if (!chave) throw new ErroConfig("ASAAS_API_KEY não configurada na Vercel.");
  const r = await _fetch(BASE() + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", "User-Agent": "garbosa-system", access_token: chave },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const txt = await r.text();
  let dados = null;
  try { dados = txt ? JSON.parse(txt) : null; } catch { dados = { bruto: txt }; }
  if (!r.ok) {
    const msg = dados?.errors?.map((e) => e.description).join(" ") || `Asaas respondeu ${r.status}`;
    throw new ErroAsaas(msg, r.status, dados);
  }
  return dados;
}

/** Busca o cliente pelo CPF; cria se não existir; atualiza contato/endereço se existir */
export async function clienteAsaas(t, externalReference) {
  const dados = {
    name: t.nome, cpfCnpj: t.cpf, email: t.email, mobilePhone: t.whatsapp,
    postalCode: t.endereco.cep, address: t.endereco.rua, addressNumber: t.endereco.numero,
    complement: t.endereco.complemento || undefined, province: t.endereco.bairro,
    externalReference, notificationDisabled: false
  };
  const busca = await asaas("GET", `/customers?cpfCnpj=${encodeURIComponent(t.cpf)}&limit=1`);
  const existente = busca?.data?.find((c) => !c.deleted);
  if (existente) {
    await asaas("PUT", `/customers/${existente.id}`, dados).catch(() => {});
    return existente.id;
  }
  return (await asaas("POST", "/customers", dados)).id;
}

/** Cancela no Asaas a cobrança (ou o parcelamento inteiro) de um pedido. Ignora erros. */
export async function cancelarCobranca(info = {}) {
  try {
    if (info.installment) await asaas("DELETE", `/installments/${info.installment}`);
    else if (info.payment) await asaas("DELETE", `/payments/${info.payment}`);
  } catch (e) { console.warn("cancelar cobrança Asaas", e.message); }
}
