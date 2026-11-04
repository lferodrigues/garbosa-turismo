// Passagem da excursão: comprovante da agência, liberado no primeiro pagamento (Asaas ou baixa manual).
// O link leva um código aleatório e mostra só o que a passagem precisa: documento mascarado, sem CPF inteiro, telefone ou endereço.
// Tudo é conferido a cada abertura: estornou ou cancelou, a passagem deixa de abrir.
import { randomBytes } from "node:crypto";
import { db } from "./firebase.js";
import { ErroUsuario } from "./http.js";
import { R } from "./venda.js";

const siteUrl = () => String(process.env.SITE_URL || "https://garbosaturismo.com.br").replace(/\/+$/, "");
const TOKEN = /^[\w-]{16,32}$/;
export const urlPassagem = (token) => `${siteUrl()}/sistema/passagem.html?t=${token}`;

const lista = async (d, own, exId) => Object.entries((await d.ref(`viajantes/${own}/${exId}`).get()).val() || {});

async function tokenDe(d, own, exId, vid, v) {
  if (v.passagemToken) return v.passagemToken;
  const token = randomBytes(16).toString("base64url");
  await d.ref().update({ [`passagensLink/${token}`]: { own, exId, vid }, [`viajantes/${own}/${exId}/${vid}/passagemToken`]: token });
  v.passagemToken = token;
  return token;
}

/** Titular abre a família inteira; dependente abre só a própria passagem */
function idsDoLink(vias, vid) {
  const deps = R.dependentesPorTitular(vias)[vid] || [];
  const juntos = new Set([vid, ...deps]);
  return R.agruparViajantes(vias.filter(([id]) => juntos.has(id))).map(([id]) => id);
}

export function documentoMascarado(v) {
  if (v.docTipo === "CERTIDAO") return "Certidão de nascimento";
  const n = String(v.docNumero || v.cpf || "").replace(/[^\dA-Za-z]/g, "");
  if (!/\d/.test(n)) return "Não informado";
  return `${v.cpf && !v.docNumero ? "CPF" : v.docTipo || "Doc."} ***${n.slice(-3)}`;
}

const cnpjDe = (doc) => {
  const n = String(doc || "").replace(/\D/g, "");
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
};

function poltronaDo(mapa, vid) {
  for (const [vk, lugares] of Object.entries(mapa || {})) {
    for (const [n, id] of Object.entries(lugares || {})) if (id === vid) return { vk, n };
  }
  return null;
}

function bilhete(ex, mapa, vid, v, token) {
  const veiculos = R.veiculosDe(ex), assento = poltronaDo(mapa, vid);
  const idx = assento ? veiculos.findIndex(([k]) => k === assento.vk) : -1;
  const veiculo = idx >= 0 ? veiculos[idx][1] : null, emb = R.embarqueDe(veiculo);
  const valorCent = R.centavos(v.valor), pagoCent = R.pagoCentDe(v);
  return {
    token, codigo: vid.slice(-8).toUpperCase(), nome: v.nome, documento: documentoMascarado(v), colo: !!v.colo,
    responsavel: v.responsavel || "", poltrona: v.colo ? "Colo" : assento ? String(assento.n) : "A definir",
    veiculo: idx >= 0 && veiculos.length > 1 ? `Veículo ${idx + 1}` : "",
    origem: emb ? [emb.cidade, emb.local].filter(Boolean).join(" - ") : ex.localSaida || "A combinar", horaSaida: emb?.hora || ex.horaSaida || "",
    valorCent, pagoCent, saldoCent: Math.max(0, valorCent - pagoCent), forma: v.formaPagamento || "",
    opcionais: Object.values(v.opcionais || {}).map((o) => o.titulo).filter(Boolean)
  };
}

export async function passagensDoToken(token) {
  if (!TOKEN.test(token || "")) throw new ErroUsuario("Link da passagem inválido.", 404);
  const d = await db();
  const ref = (await d.ref(`passagensLink/${token}`).get()).val();
  if (!ref) throw new ErroUsuario("Passagem não encontrada. Fale com a agência.", 404);
  const { own, exId, vid } = ref;
  const vias = await lista(d, own, exId), ex = (await d.ref(`excursoes/${own}/${exId}`).get()).val();
  const mapaV = Object.fromEntries(vias);
  if (!ex || !mapaV[vid]) throw new ErroUsuario("Passagem não encontrada. Fale com a agência.", 404);
  const liberadas = R.passagensLiberadas(vias);
  if (!liberadas.has(vid)) throw new ErroUsuario("A passagem é liberada depois do primeiro pagamento. Fale com a agência.", 403);

  const mapa = (await d.ref(`poltronas/${own}/${exId}`).get()).val() || {};
  const perfil = (await d.ref(`usuarios/${own}`).get()).val() || {};
  const pub = (await d.ref(`inscricoes/${exId}`).get()).val() || {};
  const ids = idsDoLink(vias, vid), passagens = [];
  for (const id of ids.filter((x) => liberadas.has(x))) passagens.push(bilhete(ex, mapa, id, mapaV[id], await tokenDe(d, own, exId, id, mapaV[id])));
  return {
    agencia: { nome: pub.agencia || perfil.empresa || "Garbosa Turismo", cnpj: cnpjDe(perfil.documento), whatsapp: perfil.whatsapp || "" },
    excursao: { destino: ex.destino || "Excursão", dataSaida: ex.dataSaida || "", dataRetorno: ex.dataRetorno || "", horaRetorno: ex.horaRetorno || "", outrasSaidas: R.saidasDe(ex).map(R.textoSaida) },
    passagens, pendentes: ids.filter((x) => !liberadas.has(x)).map((x) => mapaV[x].nome)
  };
}

/** Link que o sistema manda pelo WhatsApp */
export async function criarLink(own, exId, vid) {
  const d = await db();
  const vias = await lista(d, own, exId), v = Object.fromEntries(vias)[vid];
  if (!v) throw new ErroUsuario("Viajante não encontrado.", 404);
  if (!R.passagensLiberadas(vias).has(vid)) throw new ErroUsuario("A passagem é liberada depois do primeiro pagamento.", 409);
  const qtd = idsDoLink(vias, vid).filter((x) => R.passagensLiberadas(vias).has(x)).length;
  return { url: urlPassagem(await tokenDe(d, own, exId, vid, v)), qtd };
}
