// POST /api/asaas-whatsapp { pedido } — diagnóstico do WhatsApp de uma compra online.
// Liga de novo o WhatsApp nas notificações do cliente no Asaas e devolve como ficou
// (celular cadastrado e quais avisos estão com WhatsApp). Só para a agência dona, colaborador ou admin.
import { auth, db, ADMIN_EMAIL } from "./_lib/firebase.js";
import { enviar, lerCorpo, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { ligarWhatsapp, notificacoesCliente } from "./_lib/asaas.js";
import { lerPedido } from "./_lib/venda.js";

export default async function handler(req, res) {
  if (!soMetodo(req, res, "POST")) return;
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new ErroUsuario("Faça login no sistema.", 401);
    const u = await (await auth()).verifyIdToken(token).catch(() => null);
    if (!u) throw new ErroUsuario("Sessão expirada. Entre de novo no sistema.", 401);
    const info = await lerPedido(String(lerCorpo(req).pedido || ""));
    if (!info) throw new ErroUsuario("Pedido não encontrado.", 404);
    const d = await db();
    const ex = (await d.ref(`excursoes/${info.own}/${info.exId}`).get()).val() || {};
    const pode = u.uid === info.own || !!ex.colaboradores?.[u.uid] || (u.email || "").toLowerCase() === ADMIN_EMAIL;
    if (!pode) throw new ErroUsuario("Sem permissão para esta excursão.", 403);
    const customer = info.ped.asaas?.customer;
    if (!customer) throw new ErroUsuario("Este pedido não tem cliente no Asaas.", 409);
    const ligar = await ligarWhatsapp(customer);
    await d.ref(`pedidos/${info.own}/${info.exId}/${info.pedidoId}/asaas/whatsapp`).set(ligar);
    if (!ligar.ok) throw new ErroUsuario(`O Asaas recusou ligar o WhatsApp: ${ligar.erro}`, 502);
    enviar(res, 200, { ok: true, ligadas: ligar.ligadas, ...(await notificacoesCliente(customer)) });
  } catch (e) { tratarErro(res, e, { interno: true }); }
}
