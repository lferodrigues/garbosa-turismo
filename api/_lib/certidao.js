// Fotos das certidões de nascimento, guardadas no repositório do site. Só funciona com ele PRIVADO: se estiver público, nada é enviado.
// Cada excursão tem a própria branch (ex-{idExcursao}), fora da main: as fotos não entram no site publicado,
// e excluir a excursão apaga a branch inteira, com o histórico dela. O vercel.json desliga o deploy dessas branches.
// Variáveis na Vercel: as mesmas das fotos do site (GITHUB_TOKEN, GITHUB_REPO).
// Banco: certidoes/{uid}/{exId}/{id} = { caminho, sha, criadoEm, vid? } — sem vid = foto enviada, ainda sem viajante.
// O nó só é acessado pelo servidor: as regras do banco negam leitura e escrita.
import { db, ErroConfig } from "./firebase.js";
import { ErroUsuario } from "./http.js";

export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_PENDENTES_HORA = 40; // fotos sem viajante por excursão, para o link público não virar depósito de arquivos

let _fetch = (...a) => fetch(...a);
let _ativo = { ate: 0, valor: false };
export function usarFetchCertidoes(fn) { _fetch = fn; _ativo = { ate: 0, valor: false }; }

const API = "https://api.github.com";
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const branch = (exId) => `ex-${exId}`;
const raiz = (own, exId) => `certidoes/${own}/${exId}`;
const repoConfig = () => (process.env.GITHUB_REPO || "lferodrigues/garbosa-turismo").trim();
const tokenConfig = () => (process.env.GITHUB_TOKEN || "").trim();

export const configurado = () => !!tokenConfig();

async function github(caminho, { metodo = "GET", corpo, bruto = false } = {}) {
  if (!configurado()) throw new ErroConfig("GITHUB_TOKEN não configurada na Vercel.");
  return _fetch(`${API}/repos/${repoConfig()}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokenConfig()}`, Accept: bruto ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "garbosa-system" },
    ...(corpo ? { body: JSON.stringify(corpo) } : {})
  });
}
async function recusado(r, acao) {
  const d = await r.json().catch(() => ({}));
  console.error("GitHub certidões", r.status, d.message);
  if (r.status === 401 || r.status === 403) throw new ErroConfig("O GitHub recusou o GITHUB_TOKEN (precisa de Contents: Read and write no repositório).");
  throw new ErroUsuario(`Não foi possível ${acao} a certidão no GitHub.`, 502);
}

/** O envio da foto só aparece com o repositório privado. Guarda a resposta por 1 minuto para não consultar o GitHub a cada visita. */
export async function ativo() {
  if (!configurado()) return false;
  if (Date.now() < _ativo.ate) return _ativo.valor;
  const r = await github("").catch(() => null);
  const valor = !!r?.ok && (await r.json().catch(() => ({}))).private === true;
  _ativo = { ate: Date.now() + 60000, valor };
  return valor;
}

/** Cria a branch da excursão se preciso. Antes confere que o repositório é privado: certidão nunca vai para repositório aberto. */
async function prepararBranch(exId) {
  const rRepo = await github("");
  if (!rRepo.ok) await recusado(rRepo, "guardar");
  const repo = await rRepo.json();
  if (repo.private !== true) throw new ErroConfig("O repositório precisa estar privado para guardar certidões.");
  const rBranch = await github(`/git/ref/heads/${branch(exId)}`);
  if (rBranch.ok) return;
  const rBase = await github(`/git/ref/heads/${repo.default_branch}`);
  if (!rBase.ok) await recusado(rBase, "guardar");
  const base = await rBase.json();
  const rNova = await github("/git/refs", { metodo: "POST", corpo: { ref: `refs/heads/${branch(exId)}`, sha: base.object.sha } });
  if (!rNova.ok && rNova.status !== 422) await recusado(rNova, "guardar"); // 422: outra pessoa criou ao mesmo tempo
}

/** Decodifica e confere se é mesmo um JPEG (o navegador sempre converte a foto para esse formato) */
function lerJpeg(base64) {
  const limpo = String(base64 || "").replace(/^data:[^,]+,/, "");
  const bytes = Buffer.from(limpo, "base64");
  if (!bytes.length) throw new ErroUsuario("Foto vazia. Tire a foto de novo.");
  if (bytes.length > MAX_BYTES) throw new ErroUsuario("Foto muito grande (máximo 3 MB).");
  if (!bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) throw new ErroUsuario("O arquivo não parece ser uma foto válida.");
  return limpo;
}

/** Guarda a foto e devolve o id. Com vid já fica ligada ao viajante, senão fica pendente até ele ser salvo. */
export async function guardar(own, exId, base64, vid = "") {
  const conteudo = lerJpeg(base64);
  const d = await db();
  if (!vid) {
    const limite = Date.now() - 3600000;
    const todas = (await d.ref(raiz(own, exId)).get()).val() || {};
    if (Object.values(todas).filter((c) => !c.vid && c.criadoEm > limite).length >= MAX_PENDENTES_HORA) throw new ErroUsuario("Muitas fotos enviadas agora. Tente de novo mais tarde.", 429);
  }
  await prepararBranch(exId);
  const id = d.ref(raiz(own, exId)).push().key;
  const caminho = `certidoes/${id}.jpg`; // sem nome de pessoa no arquivo nem no commit
  for (let tentativa = 0; ; tentativa++) {
    const r = await github(`/contents/${caminho}`, { metodo: "PUT", corpo: { message: `Certidão ${id}`, content: conteudo, branch: branch(exId) } });
    if (r.ok) {
      const { content } = await r.json();
      await d.ref(`${raiz(own, exId)}/${id}`).set({ caminho, sha: content.sha, criadoEm: Date.now(), ...(vid ? { vid } : {}) });
      return id;
    }
    // 409: outra foto entrou na mesma branch no mesmo instante
    if (r.status !== 409 || tentativa >= 3) await recusado(r, "guardar");
    await espera(250 * (tentativa + 1) + Math.random() * 250);
  }
}

export async function lista(own, exId) {
  return (await (await db()).ref(raiz(own, exId)).get()).val() || {};
}

/** Fotos ainda sem viajante, entre os ids informados */
export async function pendentes(own, exId, ids) {
  const todas = ids.length ? await lista(own, exId) : {};
  return new Set(ids.filter((id) => todas[id] && !todas[id].vid));
}

export async function ler(own, exId, id) {
  const c = (await lista(own, exId))[id];
  if (!c) throw new ErroUsuario("Certidão não encontrada.", 404);
  const r = await github(`/contents/${c.caminho}?ref=${encodeURIComponent(branch(exId))}`, { bruto: true });
  if (!r.ok) await recusado(r, "abrir");
  return Buffer.from(await r.arrayBuffer());
}

async function apagarArquivo(own, exId, id, c) {
  for (let tentativa = 0; ; tentativa++) {
    const r = await github(`/contents/${c.caminho}`, { metodo: "DELETE", corpo: { message: `Remove certidão ${id}`, sha: c.sha, branch: branch(exId) } });
    if (r.ok || r.status === 404) break;
    if (r.status !== 409 || tentativa >= 3) await recusado(r, "apagar");
    await espera(250 * (tentativa + 1) + Math.random() * 250);
  }
  await (await db()).ref(`${raiz(own, exId)}/${id}`).set(null);
}

export async function apagar(own, exId, id) {
  const c = (await lista(own, exId))[id];
  if (c) await apagarArquivo(own, exId, id, c);
}

/** Apaga as certidões de um viajante; `menos` preserva a foto nova quando ele troca a anterior */
export async function apagarDoViajante(own, exId, vid, menos = "") {
  for (const [id, c] of Object.entries(await lista(own, exId))) {
    if (c.vid === vid && id !== menos) await apagarArquivo(own, exId, id, c);
  }
}

/** Apaga a branch da excursão inteira. Só limpa o banco depois que o GitHub confirmar. */
export async function apagarDaExcursao(own, exId) {
  const registros = await lista(own, exId);
  if (!Object.keys(registros).length) return; // sem certidão registrada, não há o que apagar no GitHub
  const r = await github(`/git/refs/heads/${branch(exId)}`, { metodo: "DELETE" });
  if (!r.ok && r.status !== 404 && r.status !== 422) await recusado(r, "apagar"); // 404/422: a branch não existe
  await (await db()).ref(raiz(own, exId)).set(null);
}
