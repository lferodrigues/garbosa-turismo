// GET /api/pedido-grupo?p={pedidoId} — página de obrigado (sistema/obrigado.html).
// O Asaas manda o cliente para lá depois do Pix ou do cartão; a página abre o grupo do WhatsApp da excursão.
// O id do pedido só aparece para quem fez a compra (é ele que o Asaas devolve), por isso basta ele.
// GET  /api/pedido-grupo?passagem={codigo} — página pública da passagem (sistema/passagem.html).
// POST /api/pedido-grupo?passagem=1 { e, own, v } — o sistema pede o link da passagem para enviar pelo WhatsApp.
//  Fica neste arquivo porque o plano da Vercel já está no limite de 12 funções.
import { enviar, soMetodo, tratarErro, ErroUsuario, lerCorpo } from "./_lib/http.js";
import { lerPedido, R } from "./_lib/venda.js";
import { auth, db, ADMIN_EMAIL } from "./_lib/firebase.js";
import { criarLink, passagensDoToken } from "./_lib/passagem.js";

const ID = /^[\w-]{1,64}$/;

async function linkDaPassagem(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const u = await (await auth()).verifyIdToken(token).catch(() => null);
  if (!u) throw new ErroUsuario("Entre no sistema novamente.", 401);
  const { e, own, v } = lerCorpo(req);
  if (![e, own, v].every((x) => ID.test(x || ""))) throw new ErroUsuario("Requisição inválida.");
  const ex = (await (await db()).ref(`excursoes/${own}/${e}`).get()).val();
  if (!ex) throw new ErroUsuario("Excursão não encontrada.", 404);
  const pode = u.uid === own || !!ex.colaboradores?.[u.uid] || (u.email || "").toLowerCase() === ADMIN_EMAIL;
  if (!pode) throw new ErroUsuario("Sem permissão para esta excursão.", 403);
  return criarLink(own, e, v);
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET", "POST")) return;
  try {
    if (req.method === "POST") return enviar(res, 200, await linkDaPassagem(req));
    if (req.query.passagem) return enviar(res, 200, await passagensDoToken(String(req.query.passagem)));
    const info = await lerPedido(String(req.query.p || ""));
    if (!info) throw new ErroUsuario("Compra não encontrada.", 404);
    const { pedidoId, own, exId, ped } = info;
    if (["expirado", "cancelado"].includes(ped.status)) throw new ErroUsuario("Esta compra foi cancelada. Fale com a agência.", 410);
    const grupo = R.linkGrupoWhatsapp((await (await db()).ref(`excursoes/${own}/${exId}/grupoWhatsapp`).get()).val());
    enviar(res, 200, {
      codigo: pedidoId.slice(-6).toUpperCase(), destino: ped.excursao?.destino || "", dataSaida: ped.excursao?.dataSaida || "",
      agencia: ped.excursao?.agencia || "", nome: String(ped.titular?.nome || "").split(" ")[0], status: ped.status, grupo: grupo || null,
      // para o botão "Baixar": fatura/comprovante do Asaas (e o boleto, quando for boleto)
      fatura: ped.asaas?.invoiceUrl || null, boleto: ped.asaas?.bankSlipUrl || null, forma: ped.forma || "", parcelas: ped.parcelas || 1
    });
  } catch (e) { tratarErro(res, e); }
}
