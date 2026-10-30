// Regras da venda online (Asaas) — usadas pela página de compra (para MOSTRAR valores)
// e pelas funções da Vercel em /api (que DECIDEM preço, cupom, parcelas e poltronas).
// Sem dependências: funciona no navegador e no Node.

export const VEICULOS = {
  van15:    { nome: "Van 15 lugares",          cap: 15, div: 10 },
  van20:    { nome: "Van 20 lugares",          cap: 20, div: 15 },
  micro32:  { nome: "Micro-ônibus 32 lugares", cap: 32, div: 20 },
  micro36:  { nome: "Micro-ônibus 36 lugares", cap: 36, div: 28 },
  onibus42: { nome: "Ônibus 42 lugares",       cap: 42, div: 29 },
  onibus46: { nome: "Ônibus 46 lugares",       cap: 46, div: 32 },
  onibus50: { nome: "Ônibus 50 lugares",       cap: 50, div: 35 },
  onibus64: { nome: "Ônibus 64 lugares",       cap: 64, div: 40 }
};

export const MAX_PARCELAS = 6;
export const MIN_PARCELA = 5;          // R$ — menor cobrança/parcela aceita pelo Asaas
export const IDADE_COLO = 5;           // até esta idade (na data da saída) pode ir no colo
export const MAX_PESSOAS = 20;         // por compra

export const FORMAS = {
  PIX: "Pix à vista",
  CREDIT_CARD: "Cartão de crédito",
  BOLETO: "Boleto"
};

export const soDig = (v) => String(v ?? "").replace(/\D/g, "");
export const centavos = (v) => Math.round(Number(v || 0) * 100);
export const reais = (c) => Math.round(c) / 100;
export const brl = (c) => (Math.round(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fData = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "—");

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo */
export function hojeBR(base = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}
export function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02) */
export function somarMeses(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
export const isoValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(Date.parse(v + "T12:00:00Z"));

export function cpfValido(v) {
  const d = soDig(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
export const mascaraCpf = (v) => soDig(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
export function mascaraTel(v) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const mascaraCep = (v) => soDig(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
export const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

export function idadeEm(nascimento, dataRef) {
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ra, rm, rd] = dataRef.split("-").map(Number);
  let idade = ra - a;
  if (rm < m || (rm === m && rd < d)) idade--;
  return idade;
}

/** Veículos da excursão em ordem */
export const veiculosDe = (ex) => Object.entries(ex?.veiculos || {}).sort((a, b) => (a[1].ordem || 0) - (b[1].ordem || 0));

/** Valor por pessoa (centavos) = (transporte + ingressos) ÷ rateio do 1º veículo — mesmo cálculo do sistema */
export function precoPessoaCent(ex) {
  const v0 = veiculosDe(ex)[0]?.[1];
  if (!v0) return 0;
  const div = VEICULOS[v0.tipo]?.div || 1;
  return Math.round(((Number(v0.valorTransporte) || 0) + (Number(v0.valorIngressos) || 0)) / div * 100);
}

/** Desenho das fileiras de poltronas (igual ao mapa do sistema) */
export function layoutAssentos(cap) {
  const linhas = [];
  if (cap <= 20) {
    for (let n = 1; n <= cap; n += 3) linhas.push({ esq: [n, n + 1].filter((x) => x <= cap), dir: [n + 2].filter((x) => x <= cap) });
  } else {
    const cheias = Math.floor(cap / 4), resto = cap % 4;
    for (let r = 0; r < cheias; r++) { const b = r * 4 + 1; linhas.push({ esq: [b, b + 1], dir: [b + 3, b + 2] }); }
    if (resto) { const b = cheias * 4 + 1; const s = Array.from({ length: resto }, (_, i) => b + i); linhas.push({ esq: s.slice(0, 2), dir: s.slice(2).reverse(), wc: resto <= 2 }); }
  }
  return linhas;
}

/** Primeiro vencimento do boleto: a data escolhida pela agência, ou hoje + 3 dias se ela já passou */
export function primeiroVencimento(venda, hoje) {
  const minimo = somarDias(hoje, 3);
  const escolhida = isoValida(venda?.primeiraParcela) ? venda.primeiraParcela : minimo;
  return escolhida < minimo ? minimo : escolhida;
}

/**
 * Parcelamento possível para um total (centavos):
 * - Pix: sempre à vista.
 * - Cartão: até maxParcelas (cobrado na compra, parcelas na fatura do cartão).
 * - Boleto: até maxParcelas, mensais a partir da data escolhida pela agência;
 *   a última parcela precisa vencer ANTES da data de saída da excursão.
 * Toda parcela precisa ser de pelo menos R$ 5,00.
 */
export function opcoesPagamento(venda, dataSaida, totalCent, hoje = hojeBR()) {
  const max = Math.min(MAX_PARCELAS, Math.max(1, parseInt(venda?.maxParcelas, 10) || 1));
  const cabe = (n) => totalCent / n >= MIN_PARCELA * 100;
  let cartao = max;
  while (cartao > 1 && !cabe(cartao)) cartao--;
  const venc = primeiroVencimento(venda, hoje);
  let boleto = 0;
  if (!dataSaida || venc < dataSaida) {
    boleto = 1;
    while (boleto < max && (!dataSaida || somarMeses(venc, boleto) < dataSaida) && cabe(boleto + 1)) boleto++;
  }
  return { PIX: 1, CREDIT_CARD: cartao, BOLETO: boleto, primeiroVencimento: venc };
}

/** Divide o total como o Asaas faz: parcelas iguais, a diferença vai para a última */
export function dividir(totalCent, n) {
  const base = Math.floor(totalCent / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCent - base * (n - 1) : base));
}

export const normCupom = (v) => String(v || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);

/**
 * Situação de um cupom. `usos` = pessoas que já compraram com ele (todas as vendas).
 * Retorna { ok, motivo, valorCent, porCompra, restam }
 *  - porCompra: quantas pessoas da MESMA compra recebem o valor promocional (da 1ª até a N-ª)
 *  - limite: total de pessoas que podem usar o cupom (0 = sem limite)
 */
export function avaliarCupom(cupom, usos = 0, hoje = hojeBR()) {
  if (!cupom || cupom.ativo === false) return { ok: false, motivo: "Cupom inválido ou encerrado." };
  if (cupom.validade && isoValida(cupom.validade) && cupom.validade < hoje) return { ok: false, motivo: "Este cupom expirou." };
  const valorCent = centavos(cupom.valor);
  if (!(valorCent > 0)) return { ok: false, motivo: "Cupom sem valor configurado." };
  const porCompra = Math.max(1, parseInt(cupom.porCompra, 10) || 1);
  const limite = parseInt(cupom.limite, 10) || 0;
  const restam = limite > 0 ? Math.max(0, limite - (parseInt(usos, 10) || 0)) : Infinity;
  if (restam <= 0) return { ok: false, motivo: "As vagas deste cupom acabaram." };
  return { ok: true, valorCent, porCompra, restam };
}

/**
 * Valor de cada pessoa da compra, na ordem em que foram cadastradas.
 * O cupom vale para as primeiras `porCompra` pessoas que ocupam poltrona; da seguinte em diante, valor cheio.
 * Crianças de colo pagam o valor de colo e não usam cupom.
 */
export function calcularItens(pessoas, { valorCent, valorColoCent = 0, cupom = null }) {
  let cupons = cupom?.ok ? Math.min(cupom.porCompra, cupom.restam) : 0;
  const itens = pessoas.map((p) => {
    if (p.colo) return { valorCent: valorColoCent, cupom: false, colo: true };
    if (cupons > 0 && cupom.valorCent < valorCent) { cupons--; return { valorCent: cupom.valorCent, cupom: true, colo: false }; }
    return { valorCent, cupom: false, colo: false };
  });
  const totalCent = itens.reduce((s, i) => s + i.valorCent, 0);
  const cheioCent = pessoas.reduce((s, p) => s + (p.colo ? valorColoCent : valorCent), 0);
  return { itens, totalCent, descontoCent: cheioCent - totalCent, comCupom: itens.filter((i) => i.cupom).length };
}

/** Valida os dados de uma pessoa. Retorna a mensagem do primeiro erro ou "" */
export function erroPessoa(p, dataSaida, titular = false) {
  const quem = titular ? "do titular" : `de ${p.nome ? p.nome.split(" ")[0] : "um dependente"}`;
  const nome = String(p.nome || "").replace(/\s+/g, " ").trim();
  if (nome.split(" ").length < 2) return `Informe o nome completo ${quem}.`;
  if (!isoValida(p.nascimento)) return `Informe a data de nascimento ${quem}.`;
  const idade = idadeEm(p.nascimento, dataSaida || hojeBR());
  if (idade < 0 || idade > 120) return `Data de nascimento inválida ${quem}.`;
  if (titular && idade < 18) return "O titular da compra precisa ser maior de idade.";
  if (p.colo && idade > IDADE_COLO) return `Só crianças de até ${IDADE_COLO} anos podem ir no colo (${nome.split(" ")[0]}).`;
  if (!p.colo || p.cpf) { if (!cpfValido(p.cpf)) return `CPF inválido ${quem}.`; }
  if (!p.colo && !String(p.rg || "").trim()) return `Informe o RG ${quem}.`;
  if (!emailValido(p.email)) return `Informe um e-mail válido ${quem}.`;
  if (soDig(p.whatsapp).length < 10) return `Informe o WhatsApp com DDD ${quem}.`;
  const e = p.endereco || {};
  if (soDig(e.cep).length !== 8) return `Informe o CEP ${quem}.`;
  if (!String(e.rua || "").trim() || !String(e.numero || "").trim() || !String(e.bairro || "").trim() || !String(e.cidade || "").trim() || !/^[A-Za-z]{2}$/.test(e.uf || ""))
    return `Complete o endereço ${quem} (rua, número, bairro, cidade e UF).`;
  return "";
}
