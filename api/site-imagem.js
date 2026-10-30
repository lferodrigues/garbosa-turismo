// POST /api/site-imagem — envia uma foto/folder de excursão para o repositório no GitHub
// (Assets/img/excursoes/...). A Vercel publica o site de novo sozinha em ~1 minuto.
// Quem pode: usuários do Garbosa System (agência ou administrador), com o token do login.
// Corpo: { nome, tipo: "image/jpeg"|"image/png"|"image/webp", base64 }
// Variáveis na Vercel: GITHUB_TOKEN (obrigatória), GITHUB_REPO (padrão lferodrigues/garbosa-turismo), GITHUB_BRANCH (padrão main)
import { auth, db, ADMIN_EMAIL, ErroConfig } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";

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

export default async function handler(req, res) {
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
  } catch (e) { tratarErro(res, e); }
}
