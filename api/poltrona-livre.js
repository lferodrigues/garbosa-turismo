// Escolha de poltrona sem pagamento e sem login (link enviado pela agência).
// GET  /api/poltrona-livre?e=ID  → dados da excursão + poltronas ocupadas (só números)
// POST /api/poltrona-livre { acao: "conferir", e, docs: ["MG-12.345.678", ...] }
//      → { encontrados: [{ i, vid, nome (abreviado), poltrona, assento, colo, podeAlterar }] }
//      Compara os documentos com quem já está na excursão (com ou sem pontuação).
// POST /api/poltrona-livre { e, pessoas: [...] } → salva. Cada pessoa:
//      { nome, docTipo: "RG"|"CERTIDAO", docNumero, assento:{vk,n} }           pessoa nova com poltrona
//      { ..., colo: true, nascimento: "AAAA-MM-DD", com: índice do adulto }    criança de colo (até 5 anos completos)
//      { ..., vid }                                                             altera o cadastro feito antes por este link
//      { vid, docNumero, manter: true }                                         já cadastrada, fica como está (pode levar criança no colo)
// Funciona enquanto as inscrições da excursão estiverem abertas (link de inscrição ativo).
import { db } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { carregarExcursao, veiculosComOcupacao, vagasDaExcursao, trocarPoltronas, liberarPoltronas, notificar, R } from "./_lib/venda.js";

export const WHATSAPP_CERTIDAO = "5532999775281";
const MAX = 10;
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const primeiro = (n) => String(n || "").split(" ")[0];
/** "Ana Paula Souza" → "Ana S." (não expõe o nome inteiro para quem só digitou um documento) */
const abreviar = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p.at(-1)[0]}.` : p[0] || ""; };

async function aberta(exId) {
  const c = await carregarExcursao(exId);
  const pub = (await (await db()).ref(`inscricoes/${exId}`).get()).val() || {};
  if (pub.ativa !== true || c.ex.linkAtivo === false) throw new ErroUsuario("A escolha de poltronas desta excursão está encerrada. Fale com a agência.", 409);
  if (!c.ex.dataSaida || c.ex.dataSaida < R.hojeBR()) throw new ErroUsuario("Esta excursão já partiu.", 409);
  return c;
}

/** Viajantes da excursão + onde cada um está sentado + índice documento → viajante */
async function cadastros(own, exId) {
  const d = await db();
  const [vs, pol] = await Promise.all([d.ref(`viajantes/${own}/${exId}`).get(), d.ref(`poltronas/${own}/${exId}`).get()]);
  const viajantes = vs.val() || {}, assentoDe = {}, porDoc = new Map();
  for (const [vk, m] of Object.entries(pol.val() || {})) {
    if (m && typeof m === "object") for (const [n, vid] of Object.entries(m)) if (vid) assentoDe[vid] = { vk, n: Number(n) };
  }
  for (const [vid, v] of Object.entries(viajantes)) {
    if (!v) continue;
    for (const doc of docsDe(v)) if (!porDoc.has(doc)) porDoc.set(doc, vid);
  }
  return { viajantes, assentoDe, porDoc };
}
const docsDe = (v) => new Set([v.docNumero, v.rg, v.cpf].map(R.normDoc).filter(Boolean));

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET", "POST")) return;
  let novosReservados = null, own0, exId0;
  try {
    if (req.method === "GET") {
      const { exId, own, ex, agencia } = await aberta(String(req.query.e || ""));
      return enviar(res, 200, {
        destino: ex.destino, agencia, dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || ex.dataSaida,
        horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "", descricao: ex.descricao || "",
        folder: ex.folder?.caminho ? { caminho: ex.folder.caminho, raw: ex.folder.raw || "" } : null,
        whatsappCertidao: WHATSAPP_CERTIDAO, max: MAX, idadeColo: R.IDADE_COLO, valorColoCent: R.centavos(ex.valorColo),
        opcionais: R.opcionaisDe(ex),
        vagas: await vagasDaExcursao(own, exId, ex),
        veiculos: await veiculosComOcupacao(own, exId, ex)
      });
    }

    const body = lerCorpo(req);
    const { exId, own, ex } = await aberta(String(body.e || ""));
    own0 = own; exId0 = exId;
    const lista = R.veiculosDe(ex);
    const rotulo = (a) => { if (!a) return "colo"; const i = lista.findIndex(([k]) => k === a.vk); return lista.length > 1 ? `V${i + 1}·${a.n}` : `${a.n}`; };
    const { viajantes, assentoDe, porDoc } = await cadastros(own, exId);

    /* ---------- conferir documentos ---------- */
    if (body.acao === "conferir") {
      const docs = (Array.isArray(body.docs) ? body.docs : []).slice(0, MAX);
      const encontrados = [];
      docs.forEach((doc, i) => {
        const vid = porDoc.get(R.normDoc(doc));
        if (!vid) return;
        const v = viajantes[vid], a = assentoDe[vid] || null;
        encontrados.push({ i, vid, nome: abreviar(v.nome), poltrona: a ? rotulo(a) : v.colo ? "colo" : "", assento: a, colo: v.colo === true, podeAlterar: v.origem === "poltrona", opcionais: Object.keys(v.opcionais || {}) });
      });
      return enviar(res, 200, { encontrados });
    }

    /* ---------- salvar ---------- */
    const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).map((p) => ({
      nome: texto(p?.nome, 120), docTipo: p?.docTipo === "CERTIDAO" ? "CERTIDAO" : "RG", docNumero: texto(p?.docNumero, 30),
      colo: p?.colo === true, nascimento: texto(p?.nascimento, 10), com: Number.isInteger(p?.com) ? p.com : -1,
      vid: /^[\w-]{1,40}$/.test(p?.vid || "") ? p.vid : "", manter: p?.manter === true,
      assento: p?.assento ? { vk: texto(p.assento.vk, 40), n: parseInt(p.assento.n, 10) } : null,
      opcionais: R.opcionaisValidos(ex, (Array.isArray(p?.opcionais) ? p.opcionais : []).slice(0, 30).map((x) => texto(x, 40)))
    }));
    if (!pessoas.length) throw new ErroUsuario("Informe quem vai viajar.");
    if (pessoas.length > MAX) throw new ErroUsuario(`No máximo ${MAX} pessoas por vez.`);
    if (pessoas.every((p) => p.manter)) throw new ErroUsuario("Não há nada novo para salvar.");

    const caps = Object.fromEntries(lista.map(([id, v]) => [id, R.VEICULOS[v.tipo]?.cap || 0]));
    const usados = new Set(), docsVistos = new Set(), vidsVistos = new Set(), jaCadastrados = [];
    pessoas.forEach((p, i) => {
      const doc = R.normDoc(p.docNumero);
      if (p.vid) {
        // cadastro que já existe: só quem digitou o mesmo documento mexe nele
        const v = viajantes[p.vid];
        if (!v || !doc || !docsDe(v).has(doc)) throw new ErroUsuario("Não encontramos o cadastro anterior. Atualize a página e tente de novo.", 409, { pessoa: i });
        if (vidsVistos.has(p.vid)) throw new ErroUsuario("A mesma pessoa aparece duas vezes na lista.", 400, { pessoa: i });
        vidsVistos.add(p.vid);
        if (p.manter) { p.nome = v.nome; p.colo = v.colo === true; p.existente = v; return; }
        if (v.origem !== "poltrona") throw new ErroUsuario(`O cadastro de ${primeiro(v.nome)} foi feito pela agência. Para mudar algo, fale com a agência.`, 409, { pessoa: i });
        p.existente = v;
      }
      const quem = p.nome ? primeiro(p.nome) : `a pessoa ${i + 1}`;
      if (p.nome.split(" ").length < 2) throw new ErroUsuario(`Informe o nome completo de ${quem}.`, 400, { pessoa: i });
      if (p.docTipo === "RG" && !doc) throw new ErroUsuario(`Informe o RG de ${quem}.`, 400, { pessoa: i });
      if (doc) {
        if (docsVistos.has(doc)) throw new ErroUsuario(`O documento de ${quem} foi digitado duas vezes.`, 400, { pessoa: i });
        docsVistos.add(doc);
        if (!p.vid && porDoc.has(doc)) jaCadastrados.push(i);
      }
      if (p.colo) {
        if (!R.isoValida(p.nascimento)) throw new ErroUsuario(`Informe a data de nascimento de ${quem}.`, 400, { pessoa: i });
        const idade = R.idadeEm(p.nascimento, ex.dataSaida);
        if (idade < 0) throw new ErroUsuario(`Data de nascimento inválida de ${quem}.`, 400, { pessoa: i });
        if (idade > R.IDADE_COLO) throw new ErroUsuario(`${quem} terá ${idade} anos na viagem. No colo só vão crianças de até ${R.IDADE_COLO} anos completos.`, 400, { pessoa: i });
        p.idade = idade;
        p.assento = null;
        return;
      }
      const a = p.assento;
      if (!a || !caps[a.vk] || !(a.n >= 1 && a.n <= caps[a.vk])) throw new ErroUsuario(`Escolha a poltrona de ${quem}.`, 400, { pessoa: i });
      const k = `${a.vk}/${a.n}`;
      if (usados.has(k)) throw new ErroUsuario("Duas pessoas escolheram a mesma poltrona.");
      usados.add(k);
    });
    if (jaCadastrados.length) {
      throw new ErroUsuario("Este documento já está cadastrado nesta excursão.", 409, { jaCadastrados, pessoa: jaCadastrados[0] });
    }
    // criança de colo precisa ir com um adulto da lista
    pessoas.forEach((p, i) => {
      if (!p.colo || p.manter) return;
      const resp = pessoas[p.com];
      if (!resp || resp === p || resp.colo) throw new ErroUsuario(`Escolha no colo de quem ${primeiro(p.nome)} vai.`, 400, { pessoa: i });
      p.responsavel = resp.nome;
    });

    const d = await db();
    pessoas.forEach((p) => { if (!p.vid) p.vid = d.ref(`viajantes/${own}/${exId}`).push().key; });
    const ativos = pessoas.filter((p) => !p.manter);
    const novos = ativos.filter((p) => !p.existente).map((p) => p.vid);
    await trocarPoltronas(own, exId, ativos
      .filter((p) => p.assento || p.existente)
      .map((p) => (p.assento ? { ...p.assento, vid: p.vid } : { vid: p.vid, sair: true })));
    novosReservados = novos;

    const upd = {}, agora = Date.now();
    for (const p of ativos) {
      const base = `viajantes/${own}/${exId}/${p.vid}`;
      const opcCent = R.opcionaisCent(ex, p.opcionais);
      const valor = R.reais(R.precoDeCent(ex, { colo: p.colo, idade: p.colo ? p.idade : null }) + R.extraAssentoCent(ex, p.assento) + opcCent);
      const obs = [p.existente ? "Alterado pelo link de poltrona" : "Escolheu a poltrona pelo link",
        p.colo ? `colo de ${primeiro(p.responsavel)}` : "",
        p.docTipo === "CERTIDAO" ? "certidão será enviada pelo WhatsApp" : ""].filter(Boolean).join(" · ").slice(0, 300);
      const dados = {
        nome: p.nome, docTipo: p.docTipo, docNumero: p.docNumero, colo: p.colo,
        nascimento: p.colo ? p.nascimento : p.existente?.nascimento || "", idade: p.colo ? p.idade : p.existente?.idade ?? null,
        responsavel: p.colo ? p.responsavel : null, opcionais: R.opcionaisRegistro(ex, p.opcionais), obs
      };
      if (!p.existente) {
        upd[base] = { ...dados, telefone: "", valor, origem: "poltrona", criadoEm: agora };
      } else {
        for (const [k, v] of Object.entries(dados)) upd[`${base}/${k}`] = v;
        // valor muda se virou/deixou de ser colo, entrou/saiu do leito ou trocou os opcionais
        const antes = R.extraAssentoCent(ex, assentoDe[p.vid]) + R.opcionaisGuardadosCent(p.existente), depois = R.extraAssentoCent(ex, p.assento) + opcCent;
        if ((p.existente.colo === true) !== p.colo) upd[`${base}/valor`] = valor;
        else if (antes !== depois) upd[`${base}/valor`] = R.reais(R.centavos(p.existente.valor) - antes + depois);
        upd[`${base}/alteradoEm`] = agora;
      }
    }
    await d.ref().update(upd);
    novosReservados = null;

    const alterados = ativos.filter((p) => p.existente), feitos = ativos.filter((p) => !p.existente);
    const desc = (p) => `${primeiro(p.nome)} (${p.colo ? `colo de ${primeiro(p.responsavel)}` : `poltrona ${rotulo(p.assento)}`})`;
    await notificar(own, ex, exId, {
      tipo: "inscricao", titulo: alterados.length && !feitos.length ? "Cadastro alterado pelo link de poltrona" : "Poltrona escolhida pelo link",
      texto: [feitos.length ? feitos.map(desc).join(", ") : "", alterados.length ? `alterou: ${alterados.map(desc).join(", ")}` : ""].filter(Boolean).join(" · ") + ` — ${ex.destino}.`,
      link: `#/poltronas/${exId}`
    });
    enviar(res, 200, {
      ok: true,
      poltronas: pessoas.map((p) => ({
        nome: p.nome, poltrona: p.manter ? (assentoDe[p.vid] ? rotulo(assentoDe[p.vid]) : "colo") : rotulo(p.assento),
        colo: p.colo, certidao: !p.manter && p.docTipo === "CERTIDAO", alterado: !!p.existente && !p.manter, mantido: p.manter,
        opcionais: Object.values((p.manter ? p.existente?.opcionais : R.opcionaisRegistro(ex, p.opcionais)) || {}).map((o) => o.titulo)
      }))
    });
  } catch (e) {
    if (novosReservados?.length) await liberarPoltronas(own0, exId0, novosReservados).catch(() => {});
    tratarErro(res, e);
  }
}
