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
  dd60:     { nome: "Ônibus Double Decker 60 lugares", cap: 60, div: 40, leito: { de: 49, ate: 60, extra: 20 } },
  // não é mais oferecido para excursões novas; continua valendo nas que já usavam
  onibus64: { nome: "Ônibus 64 lugares",       cap: 64, div: 40, legado: true }
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
/**
 * Documento normalizado para comparar cadastros: tanto faz escrever com ou sem pontuação.
 * "MG-12.345.678", "mg 12345678", "12.345.678 SSP/MG" e "12345678" viram "12345678".
 * Devolve "" se sobrar menos de 4 caracteres (não dá para comparar com segurança).
 */
export function normDoc(v) {
  let s = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  s = s.replace(/^(RG|CPF|CI|CERTIDAO|N)?(?=[A-Z]*\d)/, "");  // rótulo digitado antes do número
  s = s.replace(/^[A-Z]{1,6}(?=\d)/, "");                      // UF/órgão antes: MG, SSPMG…
  s = s.replace(/(\d)[A-Z]{2,}$/, "$1");                       // UF/órgão depois: SSPMG (o X final do RG fica)
  s = s.replace(/^0+(?=\d)/, "");
  return s.length >= 4 ? s : "";
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

/* ---------- custos e valor por poltrona ----------
 * Itens por pessoa da excursão: os ingressos (ex.ingresso) e os outros produtos (ex.produtos).
 * Cada item tem valor unitário (adulto) e valor unitário para criança de até 5 anos completos.
 * Total do item no veículo = valor unitário × lotação do veículo.
 * Valor por poltrona = (transporte + soma dos itens) ÷ poltronas de rateio.
 * Excursões antigas (sem ex.ingresso) usam o "valor total dos ingressos" gravado no veículo.
 */
export const IDADE_INFANTIL = 5;       // até 5 anos completos paga o valor infantil
const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const temValor = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Ingressos + produtos: [{ id, nome, valor, valorInfantil }] (valorInfantil vazio = mesmo valor) */
export function itensDe(ex) {
  const itens = [];
  if (ex?.ingresso && (temValor(ex.ingresso.valor) || temValor(ex.ingresso.valorInfantil))) {
    const valor = n2(ex.ingresso.valor);
    itens.push({ id: "ingresso", nome: "Ingressos", valor, valorInfantil: temValor(ex.ingresso.valorInfantil) ? n2(ex.ingresso.valorInfantil) : valor });
  }
  Object.entries(ex?.produtos || {})
    .sort((a, b) => (a[1].ordem || 0) - (b[1].ordem || 0))
    .forEach(([id, p]) => {
      const valor = n2(p.valor);
      itens.push({ id, nome: String(p.nome || "Produto"), valor, valorInfantil: temValor(p.valorInfantil) ? n2(p.valorInfantil) : valor });
    });
  return itens;
}

/** Conta completa de um veículo (em reais): transporte, itens × lotação, rateio e valores por poltrona */
export function custosVeiculo(ex, v) {
  const cat = VEICULOS[v?.tipo] || { nome: v?.tipo || "—", cap: 0, div: 1 };
  const cap = cat.cap, div = cat.div || 1;
  const transporte = n2(v?.valorTransporte);
  const legado = !ex?.ingresso && n2(v?.valorIngressos) > 0;
  const itens = itensDe(ex).map((i) => ({ ...i, qtd: cap, total: i.valor * cap, totalInfantil: i.valorInfantil * cap }));
  if (legado) itens.unshift({ id: "ingresso", nome: "Ingressos (valor total)", valor: n2(v.valorIngressos) / (cap || 1), valorInfantil: n2(v.valorIngressos) / (cap || 1), qtd: cap, total: n2(v.valorIngressos), totalInfantil: n2(v.valorIngressos), legado: true });
  const somaItens = itens.reduce((s, i) => s + i.total, 0);
  const somaInfantil = itens.reduce((s, i) => s + i.totalInfantil, 0);
  return {
    nome: cat.nome, cap, div, transporte, itens, somaItens, custoTotal: transporte + somaItens,
    porPoltrona: (transporte + somaItens) / div,
    porPoltronaInfantil: (transporte + somaInfantil) / div
  };
}

/** Valor por pessoa (centavos) no 1º veículo — mesmo cálculo do sistema */
export function precoPessoaCent(ex) {
  const v0 = veiculosDe(ex)[0]?.[1];
  return v0 ? Math.round(custosVeiculo(ex, v0).porPoltrona * 100) : 0;
}
/** Valor (centavos) de criança de até 5 anos que ocupa poltrona */
export function precoInfantilCent(ex) {
  const v0 = veiculosDe(ex)[0]?.[1];
  return v0 ? Math.round(custosVeiculo(ex, v0).porPoltronaInfantil * 100) : 0;
}
export const ehInfantil = (idade) => idade !== null && idade !== undefined && idade !== "" && Number(idade) >= 0 && Number(idade) <= IDADE_INFANTIL;
/** Valor (centavos) de uma pessoa: colo, até 5 anos com poltrona ou valor cheio */
export function precoDeCent(ex, { colo = false, idade = null } = {}) {
  if (colo) return centavos(ex?.valorColo);
  return ehInfantil(idade) ? precoInfantilCent(ex) : precoPessoaCent(ex);
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

/**
 * Planta do veículo para desenhar o mapa: lista de pisos.
 * Piso: { titulo, frente:[rótulos], linhas:[{ esq, dir, notaEsq, notaDir, largo, wc }], fundo }
 * esq/dir = números das poltronas; notaEsq/notaDir = texto no lugar das poltronas; largo = poltrona da direita ocupa 2 lugares.
 */
export function plantaVeiculo(tipo, cap = VEICULOS[tipo]?.cap || 0) {
  if (tipo === "dd60") {
    // Double Decker Super Luxo 60 lugares (mapa Michelon, carro 2300)
    const sup = [
      { esq: [1, 2], dir: [4, 3] }, { esq: [5, 6], dir: [7, 8] }, { esq: [9, 10], dir: [11, 12] },
      { esq: [13, 14], notaDir: "Entrada · escada" }, { esq: [15, 16], notaDir: "Geladeira · cafeteira · armário" }
    ];
    for (let b = 17; b <= 45; b += 4) sup.push({ esq: [b, b + 1], dir: [b + 3, b + 2] });
    const inf = [{ notaEsq: "Sala de estar · geladeira", notaDir: "Escada" }, { notaEsq: "Banheiro", notaDir: "Entrada" }];
    for (const b of [49, 52, 55, 58]) inf.push({ esq: [b, b + 1], dir: [b + 2], largo: true });
    return [
      { titulo: "Piso superior", frente: [], linhas: sup, fundo: "Bebedouro · geladeira" },
      { titulo: "Piso inferior", subtitulo: `Leito completo · + ${brl(extraPoltronaCent("dd60", 49))} por poltrona`, frente: ["Motorista"], linhas: inf, fundo: "Bebedouro · lixeira" }
    ];
  }
  const linhas = layoutAssentos(cap);
  return [{ titulo: "", frente: ["Motorista", "Porta"], linhas, fundo: cap > 20 && !linhas.some((l) => l.wc) ? "Toalete" : "" }];
}
/** Acréscimo (centavos) de uma poltrona: leito do piso inferior do Double Decker 60 = + R$ 20 */
export function extraPoltronaCent(tipo, n) {
  const l = VEICULOS[tipo]?.leito;
  n = Number(n);
  return l && n >= l.de && n <= l.ate ? centavos(l.extra) : 0;
}
/** Acréscimo da poltrona escolhida ({vk, n}) numa excursão */
export const extraAssentoCent = (ex, a) => (a ? extraPoltronaCent(ex?.veiculos?.[a.vk]?.tipo, a.n) : 0);
/* ---------- opcionais da excursão (passeio, almoço, camisa…) ---------- */
/** Opcionais cadastrados na excursão: [{ id, titulo, descricao, valorCent }] na ordem da agência */
export function opcionaisDe(ex) {
  return Object.entries(ex?.opcionais || {})
    .filter(([, o]) => o && String(o.titulo || "").trim())
    .sort((a, b) => (a[1].ordem ?? 0) - (b[1].ordem ?? 0))
    .map(([id, o]) => ({ id, titulo: String(o.titulo).trim(), descricao: String(o.descricao || "").trim(), valorCent: Math.max(0, centavos(o.valor)) }));
}
/** Só os ids que existem na excursão, sem repetir (o que o viajante escolheu) */
export function opcionaisValidos(ex, ids) {
  const existe = new Set(opcionaisDe(ex).map((o) => o.id));
  return [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => existe.has(id));
}
/** Soma (centavos) dos opcionais escolhidos */
export function opcionaisCent(ex, ids) {
  const set = new Set(opcionaisValidos(ex, ids));
  return opcionaisDe(ex).filter((o) => set.has(o.id)).reduce((s, o) => s + o.valorCent, 0);
}
/** Fotografia dos opcionais escolhidos para guardar no viajante: { id: { titulo, valor } } */
export function opcionaisRegistro(ex, ids) {
  const set = new Set(opcionaisValidos(ex, ids));
  const sel = opcionaisDe(ex).filter((o) => set.has(o.id));
  return sel.length ? Object.fromEntries(sel.map((o) => [o.id, { titulo: o.titulo.slice(0, 80), valor: reais(o.valorCent) }])) : null;
}
/** Soma (centavos) do que está guardado no viajante */
export const opcionaisGuardadosCent = (v) => Object.values(v?.opcionais || {}).reduce((s, o) => s + Math.max(0, centavos(o?.valor)), 0);

/* ---------- selo automático de vagas ---------- */
export const PCT_ULTIMAS = 0.3;   // "Últimas vagas" quando faltarem 30% ou menos das poltronas
/** "esgotado" (sem poltrona livre), "ultimas" (faltando 30% ou menos) ou "" */
export function seloVagas(cap, ocupadas) {
  cap = Number(cap) || 0; ocupadas = Number(ocupadas) || 0;
  if (cap <= 0) return "";
  const livres = cap - ocupadas;
  if (livres <= 0) return "esgotado";
  return livres <= Math.floor(cap * PCT_ULTIMAS) ? "ultimas" : "";
}
/** Mesma regra a partir da lista de veículos das APIs ({ cap, ocupadas:[n] }) */
export const seloDosVeiculos = (veiculos) =>
  seloVagas((veiculos || []).reduce((s, v) => s + (v.cap || 0), 0), (veiculos || []).reduce((s, v) => s + (v.ocupadas?.length || 0), 0));

/** Ordem de leitura das poltronas na planta (para listas) */
export const numerosDaPlanta = (planta) => planta.flatMap((p) => p.linhas.flatMap((l) => [...(l.esq || []), ...(l.dir || [])]));

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

/** Link de convite de grupo do WhatsApp (https://chat.whatsapp.com/CODIGO) — devolve o link limpo ou "" */
export function linkGrupoWhatsapp(v) {
  const m = String(v || "").trim().match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})\/?(?:\?.*)?$/);
  return m ? `https://chat.whatsapp.com/${m[1]}` : "";
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
 * Crianças de até 5 anos com poltrona (p.infantil) pagam o valor infantil; o cupom só entra se for menor.
 */
export function calcularItens(pessoas, { valorCent, valorColoCent = 0, valorInfantilCent = null, cupom = null }) {
  let cupons = cupom?.ok ? Math.min(cupom.porCompra, cupom.restam) : 0;
  const infCent = valorInfantilCent ?? valorCent;
  const cheio = (p) => (p.colo ? valorColoCent : p.infantil ? infCent : valorCent);
  const itens = pessoas.map((p) => {
    const opcCent = Math.max(0, Math.round(p.opcionaisCent || 0));
    if (p.colo) return { valorCent: valorColoCent + opcCent, cupom: false, colo: true, infantil: false, extraCent: 0, opcionaisCent: opcCent };
    const base = cheio(p), infantil = !!p.infantil, extraCent = Math.max(0, Math.round(p.extraCent || 0));
    if (cupons > 0 && cupom.valorCent < base) { cupons--; return { valorCent: cupom.valorCent + extraCent + opcCent, cupom: true, colo: false, infantil, extraCent, opcionaisCent: opcCent }; }
    return { valorCent: base + extraCent + opcCent, cupom: false, colo: false, infantil, extraCent, opcionaisCent: opcCent };
  });
  const totalCent = itens.reduce((s, i) => s + i.valorCent, 0);
  const cheioCent = pessoas.reduce((s, p, i) => s + cheio(p) + itens[i].extraCent + itens[i].opcionaisCent, 0);
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
