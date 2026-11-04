// POST /api/site-imagem — envia uma foto/folder de excursão para o repositório no GitHub
// (Assets/img/excursoes/...). A Vercel publica o site de novo sozinha em ~1 minuto.
// Quem pode: usuários do Garbosa System (agência ou administrador), com o token do login.
// Corpo: { nome, tipo: "image/jpeg"|"image/png"|"image/webp", base64 }
// Variáveis na Vercel: GITHUB_TOKEN (obrigatória), GITHUB_REPO (padrão lferodrigues/garbosa-turismo), GITHUB_BRANCH (padrão main)
//
// /api/site-imagem?certidao=1 — fotos das certidões de nascimento, guardadas no Realtime Database (api/_lib/certidao.js).
// Fica neste arquivo porque o plano da Vercel já está no limite de 12 funções.
//  Público (link da excursão aberto):
//   GET  ?certidao=1&status=1            → { ativo }
//   POST { acao: "enviar", e, base64 }   → { id } foto pendente, ligada ao viajante quando ele é salvo
//   POST { acao: "vincular", e, id, vid }  liga a foto ao viajante da inscrição pelo link
//   POST { acao: "descartar", e, id }      troca de foto antes de salvar
//  Logado (agência dona, colaborador ou admin):
//   GET  ?certidao=1&e=&own=             → { ativo, certidoes: [{ id, vid, criadoEm }] }
//   GET  ?certidao=1&e=&own=&id=         → imagem JPEG
//   POST { acao: "anexar", e, own, vid, base64 } | { acao: "remover", e, own, vid }
//   POST { acao: "excluir-excursao", e, own }    só a agência dona ou o admin
import { auth, db, ADMIN_EMAIL, ErroConfig } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { excursaoAberta } from "./_lib/venda.js";
import * as Certidao from "./_lib/certidao.js";

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 3 * 1024 * 1024;

let _fetch = (...a) => fetch(...a);
export function usarFetchGithub(fn) { _fetch = fn; }

export async function usuarioDoSistema(req) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroUsuario("Faça login no Garbosa System.", 401);
  const u = await (await auth()).verifyIdToken(token).catch(() => null);
  if (!u) throw new ErroUsuario("Sessão expirada. Entre de novo no sistema.", 401);
  const perfil = (await (await db()).ref(`usuarios/${u.uid}`).get()).val();
  const admin = (u.email || "").toLowerCase() === ADMIN_EMAIL;
  if (!admin && (!perfil || perfil.ativo === false || perfil.tipo !== "agencia")) throw new ErroUsuario("Sem permissão para enviar imagens.", 403);
  return { uid: u.uid, admin, nome: perfil?.nome || u.email || "" };
}

const slug = (t) => String(t || "folder").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "folder";

const ID = /^[\w-]{1,64}$/;
const idValido = (v, rotulo = "Identificador") => { if (!ID.test(v || "")) throw new ErroUsuario(`${rotulo} inválido.`); return v; };

/** Quem está logado e pode mexer nas certidões desta excursão */
async function acessoExcursao(req, exId, own, soDono = false) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroUsuario("Faça login no Garbosa System.", 401);
  const u = await (await auth()).verifyIdToken(token).catch(() => null);
  if (!u) throw new ErroUsuario("Sessão expirada. Entre de novo no sistema.", 401);
  idValido(exId, "Excursão"); idValido(own, "Agência");
  const ex = (await (await db()).ref(`excursoes/${own}/${exId}`).get()).val();
  if (!ex) throw new ErroUsuario("Excursão não encontrada.", 404);
  const admin = (u.email || "").toLowerCase() === ADMIN_EMAIL;
  if (!admin && u.uid !== own && (soDono || !ex.colaboradores?.[u.uid])) throw new ErroUsuario("Sem permissão para as certidões desta excursão.", 403);
}

async function certidoes(req, res) {
  if (!soMetodo(req, res, "GET", "POST")) return;
  try {
    if (req.method === "GET") {
      if (req.query.status) return enviar(res, 200, { ativo: await Certidao.ativo() });
      const { e: exId, own, id } = req.query;
      await acessoExcursao(req, exId, own);
      if (id) {
        const foto = await Certidao.ler(own, exId, idValido(id));
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.status(200).send(foto);
      }
      const todas = Object.entries(await Certidao.lista(own, exId)).filter(([, c]) => c.vid);
      return enviar(res, 200, { ativo: await Certidao.ativo(), certidoes: todas.map(([id, c]) => ({ id, vid: c.vid, criadoEm: c.criadoEm })) });
    }

    const { acao, e: exId, own, vid, id, base64 } = lerCorpo(req);
    if (acao === "enviar") {
      const c = await excursaoAberta(String(exId || ""));
      return enviar(res, 200, { ok: true, id: await Certidao.guardar(c.own, c.exId, base64) });
    }
    if (acao === "descartar") {
      const c = await excursaoAberta(String(exId || ""));
      if ((await Certidao.pendentes(c.own, c.exId, [idValido(id)])).size) await Certidao.apagar(c.own, c.exId, id);
      return enviar(res, 200, { ok: true });
    }
    if (acao === "vincular") {
      const c = await excursaoAberta(String(exId || ""));
      const v = (await (await db()).ref(`viajantes/${c.own}/${c.exId}/${idValido(vid)}`).get()).val();
      if (v?.origem !== "link" || v.docTipo !== "CERTIDAO" || !(await Certidao.pendentes(c.own, c.exId, [idValido(id)])).size) throw new ErroUsuario("Não encontramos esta foto. Envie de novo para a agência.", 404);
      await (await db()).ref(`certidoes/${c.own}/${c.exId}/${id}/vid`).set(vid);
      return enviar(res, 200, { ok: true });
    }
    if (acao === "anexar" || acao === "remover") {
      await acessoExcursao(req, exId, own);
      idValido(vid, "Viajante");
      if (!(await (await db()).ref(`viajantes/${own}/${exId}/${vid}/nome`).get()).exists() && acao === "anexar") throw new ErroUsuario("Viajante não encontrado.", 404);
      if (acao === "remover") { await Certidao.apagarDoViajante(own, exId, vid); return enviar(res, 200, { ok: true }); }
      const novo = await Certidao.guardar(own, exId, base64, vid);
      await Certidao.apagarDoViajante(own, exId, vid, novo);
      return enviar(res, 200, { ok: true, id: novo });
    }
    if (acao === "excluir-excursao") {
      await acessoExcursao(req, exId, own, true);
      await Certidao.apagarDaExcursao(own, exId);
      return enviar(res, 200, { ok: true });
    }
    throw new ErroUsuario("Ação inválida.");
  } catch (e) { tratarErro(res, e, { interno: !!req.headers?.authorization }); }
}

export default async function handler(req, res) {
  if (req.query?.certidao) return certidoes(req, res);
  if (!soMetodo(req, res, "POST")) return;
  try {
    const quem = await usuarioDoSistema(req);
    const { nome, tipo, base64 } = lerCorpo(req);
    const ext = TIPOS[tipo];
    if (!ext) throw new ErroUsuario("Envie uma imagem JPG, PNG ou WEBP.");
    const limpo = String(base64 || "").replace(/^data:[^,]+,/, "");
    const bytes = Buffer.from(limpo, "base64");
    if (!bytes.length) throw new ErroUsuario("Imagem vazia.");
    if (bytes.length > MAX_BYTES) throw new ErroUsuario("Imagem muito grande (máximo 3 MB).");
    const assinatura = bytes.subarray(0, 12).toString("hex");
    const ehImagem = assinatura.startsWith("ffd8ff") || assinatura.startsWith("89504e47") || (assinatura.startsWith("52494646") && assinatura.slice(16, 24) === "57454250");
    if (!ehImagem) throw new ErroUsuario("O arquivo não parece ser uma imagem válida.");

    const token = (process.env.GITHUB_TOKEN || "").trim();
    if (!token) throw new ErroConfig("GITHUB_TOKEN não configurada na Vercel.");
    const repo = process.env.GITHUB_REPO || "lferodrigues/garbosa-turismo";
    const branch = process.env.GITHUB_BRANCH || "main";
    const caminho = `Assets/img/excursoes/${slug(nome)}-${Date.now().toString(36)}.${ext}`;
    const r = await _fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "garbosa-system" },
      body: JSON.stringify({ message: `Folder/foto de excursão: ${caminho.split("/").pop()} (enviado por ${quem.nome})`, content: limpo, branch })
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      console.error("GitHub", r.status, d.message);
      throw new ErroUsuario(r.status === 401 || r.status === 403 || r.status === 404
        ? "O GitHub recusou o envio: confira o GITHUB_TOKEN na Vercel (precisa de permissão de escrita no repositório)."
        : `O GitHub recusou o envio (${d.message || r.status}).`, 502);
    }
    enviar(res, 200, { ok: true, caminho, raw: `https://raw.githubusercontent.com/${repo}/${branch}/${caminho}` });
  } catch (e) { tratarErro(res, e, { interno: true }); }
}
