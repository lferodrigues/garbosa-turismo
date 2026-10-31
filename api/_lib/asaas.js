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
  let id;
  if (existente) {
    await asaas("PUT", `/customers/${existente.id}`, dados).catch(() => {});
    id = existente.id;
  } else id = (await asaas("POST", "/customers", dados)).id;
  return id;
}

export const DIAS_LEMBRETE = 5; // lembrete de vencimento: 5 dias antes (o Asaas aceita 0, 5, 10, 15 ou 30)

/**
 * O Asaas cria o cliente com o WhatsApp DESLIGADO em todas as notificações.
 * Aqui, antes de criar a cobrança:
 *  - liga o WhatsApp (o celular é o WhatsApp do cadastro) em todas as notificações ativas;
 *  - garante ligadas a "cobrança criada" (o cliente recebe a cobrança assim que finaliza a compra)
 *    e o lembrete antes do vencimento, que passa para 5 dias antes de cada parcela (o padrão do Asaas é 10);
 *  - o aviso no dia do vencimento e os de atraso continuam como estão no painel do Asaas.
 * Falha não impede a venda.
 */
export function ajustesNotificacoes(lista) {
  const vivas = (lista || []).filter((n) => n && !n.deleted);
  // lembrete "antes do vencimento" = PAYMENT_DUEDATE_WARNING com dias > 0 (o de 0 é o do próprio dia)
  const avisos = vivas.filter((n) => n.event === "PAYMENT_DUEDATE_WARNING" && Number(n.scheduleOffset) > 0);
  const lembrete = avisos.find((n) => Number(n.scheduleOffset) === DIAS_LEMBRETE)
    || avisos.find((n) => Number(n.scheduleOffset) === 10) || avisos[0] || null;
  const mudar = [];
  for (const n of vivas) {
    const essencial = n.event === "PAYMENT_CREATED" || n === lembrete;
    const alt = {};
    if (n === lembrete && Number(n.scheduleOffset) !== DIAS_LEMBRETE) alt.scheduleOffset = DIAS_LEMBRETE;
    if (essencial && n.enabled === false) alt.enabled = true;
    // só mexe no WhatsApp; notificações desligadas no painel do Asaas (fora as essenciais) continuam desligadas
    if ((n.enabled !== false || essencial) && n.whatsappEnabledForCustomer !== true) alt.whatsappEnabledForCustomer = true;
    if (Object.keys(alt).length) mudar.push({ id: n.id, ...alt });
  }
  return { mudar, lembrete: !!lembrete };
}

export async function ligarWhatsapp(customer) {
  try {
    const lista = (await asaas("GET", `/customers/${customer}/notifications`))?.data || [];
    const { mudar, lembrete } = ajustesNotificacoes(lista);
    if (mudar.length) await asaas("PUT", "/notifications/batch", { customer, notifications: mudar });
    return { ok: true, total: lista.length, ligadas: mudar.length, lembreteDias: lembrete ? DIAS_LEMBRETE : null, em: Date.now() };
  } catch (e) {
    console.warn("Asaas: não foi possível ligar o WhatsApp do cliente", e.message);
    return { ok: false, erro: String(e.message || e).slice(0, 300), em: Date.now() };
  }
}

/** Situação das notificações do cliente no Asaas (para o diagnóstico no sistema) */
export async function notificacoesCliente(customer) {
  const [cli, lista] = await Promise.all([
    asaas("GET", `/customers/${customer}`),
    asaas("GET", `/customers/${customer}/notifications`).then((r) => r?.data || [])
  ]);
  return {
    nome: cli?.name || "", celular: cli?.mobilePhone || "", telefone: cli?.phone || "", email: cli?.email || "",
    notificacoesDesligadas: cli?.notificationDisabled === true,
    eventos: lista.filter((n) => n && !n.deleted).map((n) => ({ evento: n.event, dias: n.scheduleOffset ?? null, ativa: n.enabled !== false,
      whatsapp: n.whatsappEnabledForCustomer === true, email: n.emailEnabledForCustomer === true, sms: n.smsEnabledForCustomer === true }))
  };
}

/** Cancela no Asaas a cobrança (ou o parcelamento inteiro) de um pedido. Ignora erros. */
export async function cancelarCobranca(info = {}) {
  try {
    if (info.installment) await asaas("DELETE", `/installments/${info.installment}`);
    else if (info.payment) await asaas("DELETE", `/payments/${info.payment}`);
  } catch (e) { console.warn("cancelar cobrança Asaas", e.message); }
}
