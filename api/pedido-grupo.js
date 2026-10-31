// GET /api/pedido-grupo?p={pedidoId} — página de obrigado (sistema/obrigado.html).
// O Asaas manda o cliente para lá depois do Pix ou do cartão; a página abre o grupo do WhatsApp da excursão.
// O id do pedido só aparece para quem fez a compra (é ele que o Asaas devolve), por isso basta ele.
import { enviar, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { lerPedido, R } from "./_lib/venda.js";
import { db } from "./_lib/firebase.js";

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET")) return;
  try {
    const info = await lerPedido(String(req.query.p || ""));
    if (!info) throw new ErroUsuario("Compra não encontrada.", 404);
    const { pedidoId, own, exId, ped } = info;
    if (["expirado", "cancelado"].includes(ped.status)) throw new ErroUsuario("Esta compra foi cancelada. Fale com a agência.", 410);
    const grupo = R.linkGrupoWhatsapp((await (await db()).ref(`excursoes/${own}/${exId}/grupoWhatsapp`).get()).val());
    enviar(res, 200, {
      codigo: pedidoId.slice(-6).toUpperCase(), destino: ped.excursao?.destino || "", dataSaida: ped.excursao?.dataSaida || "",
      agencia: ped.excursao?.agencia || "", nome: String(ped.titular?.nome || "").split(" ")[0], status: ped.status, grupo: grupo || null
    });
  } catch (e) { tratarErro(res, e); }
}
