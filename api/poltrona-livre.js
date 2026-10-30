// Escolha de poltrona sem pagamento e sem login (link enviado pela agência).
// GET  /api/poltrona-livre?e=ID  → dados da excursão + poltronas ocupadas (só números)
// POST /api/poltrona-livre       → { e, pessoas: [{ nome, docTipo: "RG"|"CERTIDAO", docNumero, assento:{vk,n} }] }
// Funciona enquanto as inscrições da excursão estiverem abertas (link de inscrição ativo).
import { db } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { carregarExcursao, veiculosComOcupacao, reservarPoltronas, liberarPoltronas, notificar, R } from "./_lib/venda.js";

export const WHATSAPP_CERTIDAO = "5532999775281";
const MAX = 10;
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function aberta(exId) {
  const c = await carregarExcursao(exId);
  const pub = (await (await db()).ref(`inscricoes/${exId}`).get()).val() || {};
  if (pub.ativa !== true || c.ex.linkAtivo === false) throw new ErroUsuario("A escolha de poltronas desta excursão está encerrada. Fale com a agência.", 409);
  if (!c.ex.dataSaida || c.ex.dataSaida < R.hojeBR()) throw new ErroUsuario("Esta excursão já partiu.", 409);
  return c;
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET", "POST")) return;
  try {
    if (req.method === "GET") {
      const { exId, own, ex, agencia } = await aberta(String(req.query.e || ""));
      return enviar(res, 200, {
        destino: ex.destino, agencia, dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || ex.dataSaida,
        horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "", descricao: ex.descricao || "",
        folder: ex.folder?.caminho ? { caminho: ex.folder.caminho, raw: ex.folder.raw || "" } : null,
        whatsappCertidao: WHATSAPP_CERTIDAO, max: MAX,
        veiculos: await veiculosComOcupacao(own, exId, ex)
      });
    }

    const body = lerCorpo(req);
    const { exId, own, ex } = await aberta(String(body.e || ""));
    const pessoas = (Array.isArray(body.pessoas) ? body.pessoas : []).map((p) => ({
      nome: texto(p?.nome, 120), docTipo: p?.docTipo === "CERTIDAO" ? "CERTIDAO" : "RG", docNumero: texto(p?.docNumero, 30),
      assento: p?.assento ? { vk: texto(p.assento.vk, 40), n: parseInt(p.assento.n, 10) } : null
    }));
    if (!pessoas.length) throw new ErroUsuario("Informe quem vai viajar.");
    if (pessoas.length > MAX) throw new ErroUsuario(`No máximo ${MAX} pessoas por vez.`);
    const caps = Object.fromEntries(R.veiculosDe(ex).map(([id, v]) => [id, R.VEICULOS[v.tipo]?.cap || 0]));
    const usados = new Set();
    pessoas.forEach((p, i) => {
      const quem = p.nome ? p.nome.split(" ")[0] : `a pessoa ${i + 1}`;
      if (p.nome.split(" ").length < 2) throw new ErroUsuario(`Informe o nome completo de ${quem}.`, 400, { pessoa: i });
      if (p.docTipo === "RG" && p.docNumero.replace(/\W/g, "").length < 4) throw new ErroUsuario(`Informe o RG de ${quem}.`, 400, { pessoa: i });
      const a = p.assento;
      if (!a || !caps[a.vk] || !(a.n >= 1 && a.n <= caps[a.vk])) throw new ErroUsuario(`Escolha a poltrona de ${quem}.`, 400, { pessoa: i });
      const k = `${a.vk}/${a.n}`;
      if (usados.has(k)) throw new ErroUsuario("Duas pessoas escolheram a mesma poltrona.");
      usados.add(k);
    });

    const d = await db();
    const vids = pessoas.map(() => d.ref(`viajantes/${own}/${exId}`).push().key);
    await reservarPoltronas(own, exId, pessoas.map((p, i) => ({ ...p.assento, vid: vids[i] })));
    const rotulo = (a) => { const lista = R.veiculosDe(ex); const i = lista.findIndex(([k]) => k === a.vk); return lista.length > 1 ? `V${i + 1}·${a.n}` : `${a.n}`; };
    const valor = R.reais(R.precoPessoaCent(ex));
    const upd = {};
    pessoas.forEach((p, i) => {
      upd[`viajantes/${own}/${exId}/${vids[i]}`] = {
        nome: p.nome, docTipo: p.docTipo, docNumero: p.docNumero, telefone: "", colo: false, valor,
        origem: "poltrona", criadoEm: Date.now(),
        obs: (p.docTipo === "CERTIDAO" ? "Escolheu a poltrona pelo link · certidão será enviada pelo WhatsApp" : "Escolheu a poltrona pelo link").slice(0, 300)
      };
    });
    try { await d.ref().update(upd); }
    catch (e) { await liberarPoltronas(own, exId, vids).catch(() => {}); throw e; }

    await notificar(own, ex, exId, { tipo: "inscricao", titulo: "Poltrona escolhida pelo link",
      texto: `${pessoas.map((p) => `${p.nome.split(" ")[0]} (poltrona ${rotulo(p.assento)})`).join(", ")} — ${ex.destino}.`, link: `#/poltronas/${exId}` });
    enviar(res, 200, { ok: true, poltronas: pessoas.map((p) => ({ nome: p.nome, poltrona: rotulo(p.assento), certidao: p.docTipo === "CERTIDAO" })) });
  } catch (e) { tratarErro(res, e); }
}
