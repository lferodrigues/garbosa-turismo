// Fotos das certidões de nascimento, guardadas no Realtime Database.
// Banco (acessado só pelo servidor: as regras negam leitura e escrita pelo navegador):
//  certidoes/{uid}/{exId}/{id}      = { criadoEm, vid? } — sem vid = foto enviada, ainda sem viajante
//  certidoesFotos/{uid}/{exId}/{id} = JPEG em base64, em nó separado para listar sem baixar as imagens
import { db } from "./firebase.js";
import { ErroUsuario } from "./http.js";

export const MAX_BYTES = 1500 * 1024;
export const MAX_PENDENTES = 40; // fotos sem viajante por excursão, para o link público não encher o banco
const VALIDADE_PENDENTE = 24 * 3600000; // foto que ninguém ligou a um viajante é apagada depois de 24 horas

const dados = (own, exId) => `certidoes/${own}/${exId}`;
const fotos = (own, exId) => `certidoesFotos/${own}/${exId}`;

/** O envio aparece quando o servidor consegue falar com o banco */
export const ativo = () => db().then(() => true, () => false);

/** Decodifica e confere se é mesmo um JPEG (o navegador sempre converte a foto para esse formato) */
function lerJpeg(base64) {
  const limpo = String(base64 || "").replace(/^data:[^,]+,/, "");
  const bytes = Buffer.from(limpo, "base64");
  if (!bytes.length) throw new ErroUsuario("Foto vazia. Tire a foto de novo.");
  if (bytes.length > MAX_BYTES) throw new ErroUsuario("Foto muito grande. Tire a foto de novo.");
  if (!bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) throw new ErroUsuario("O arquivo não parece ser uma foto válida.");
  return bytes.toString("base64");
}

const apagarIds = (own, exId, ids) => {
  const upd = {};
  for (const id of ids) { upd[`${dados(own, exId)}/${id}`] = null; upd[`${fotos(own, exId)}/${id}`] = null; }
  return ids.length ? db().then((d) => d.ref().update(upd)) : Promise.resolve();
};

export async function lista(own, exId) {
  return (await (await db()).ref(dados(own, exId)).get()).val() || {};
}

/** Guarda a foto e devolve o id. Com vid já fica ligada ao viajante, senão fica pendente até ele ser salvo. */
export async function guardar(own, exId, base64, vid = "") {
  const conteudo = lerJpeg(base64);
  const d = await db();
  if (!vid) {
    const pend = Object.entries(await lista(own, exId)).filter(([, c]) => !c.vid), limite = Date.now() - VALIDADE_PENDENTE;
    await apagarIds(own, exId, pend.filter(([, c]) => !(c.criadoEm > limite)).map(([id]) => id));
    if (pend.filter(([, c]) => c.criadoEm > limite).length >= MAX_PENDENTES) throw new ErroUsuario("Muitas fotos enviadas agora. Tente de novo mais tarde.", 429);
  }
  const id = d.ref(dados(own, exId)).push().key;
  await d.ref().update({ [`${dados(own, exId)}/${id}`]: { criadoEm: Date.now(), ...(vid ? { vid } : {}) }, [`${fotos(own, exId)}/${id}`]: conteudo });
  return id;
}

/** Fotos ainda sem viajante, entre os ids informados */
export async function pendentes(own, exId, ids) {
  const todas = ids.length ? await lista(own, exId) : {};
  return new Set(ids.filter((id) => todas[id] && !todas[id].vid));
}

export async function ler(own, exId, id) {
  const conteudo = (await (await db()).ref(`${fotos(own, exId)}/${id}`).get()).val();
  if (!conteudo) throw new ErroUsuario("Certidão não encontrada.", 404);
  return Buffer.from(conteudo, "base64");
}

export const apagar = (own, exId, id) => apagarIds(own, exId, [id]);

/** Apaga as certidões de um viajante; `menos` preserva a foto nova quando ele troca a anterior */
export async function apagarDoViajante(own, exId, vid, menos = "") {
  await apagarIds(own, exId, Object.entries(await lista(own, exId)).filter(([id, c]) => c.vid === vid && id !== menos).map(([id]) => id));
}

/** Apaga todas as certidões da excursão */
export async function apagarDaExcursao(own, exId) {
  await (await db()).ref().update({ [dados(own, exId)]: null, [fotos(own, exId)]: null });
}
