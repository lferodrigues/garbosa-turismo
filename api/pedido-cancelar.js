// POST /api/pedido-cancelar { pedido } — a agência (ou colaborador/admin) cancela uma compra online sem pagamento.
// Autenticação: cabeçalho Authorization: Bearer <token do Firebase do usuário logado no sistema>.
import { auth, db, ADMIN_EMAIL } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { lerPedido, desfazerPedido, notificar } from "./_lib/venda.js";

export default async function handler(req, res) {
  if (!soMetodo(req, res, "POST")) return;
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new ErroUsuario("Faça login no sistema.", 401);
    const u = await (await auth()).verifyIdToken(token).catch(() => null);
    if (!u) throw new ErroUsuario("Sessão expirada. Entre de novo no sistema.", 401);
    const info = await lerPedido(String(lerCorpo(req).pedido || ""));
    if (!info) throw new ErroUsuario("Pedido não encontrado.", 404);
    const ex = (await (await db()).ref(`excursoes/${info.own}/${info.exId}`).get()).val() || {};
    const pode = u.uid === info.own || !!ex.colaboradores?.[u.uid] || (u.email || "").toLowerCase() === ADMIN_EMAIL;
    if (!pode) throw new ErroUsuario("Sem permissão para esta excursão.", 403);
    if (info.ped.status !== "aguardando") throw new ErroUsuario("Só dá para cancelar compras sem nenhum pagamento. Para as demais, faça o estorno pelo Asaas.", 409);
    await desfazerPedido(info, "cancelado", `Cancelado por ${u.name || u.email || "agência"}`);
    await notificar(info.own, ex, info.exId, { tipo: "venda", titulo: "Compra online cancelada",
      texto: `O pedido de ${info.ped.titular?.nome} foi cancelado e as poltronas foram liberadas.`, link: `#/poltronas/${info.exId}` });
    enviar(res, 200, { ok: true });
  } catch (e) { tratarErro(res, e); }
}
