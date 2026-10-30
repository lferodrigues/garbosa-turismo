// POST /api/cupom { e, codigo } — confere um cupom antes da compra (o valor é recalculado no pedido)
import { enviar, lerCorpo, soMetodo, tratarErro } from "./_lib/http.js";
import { carregarExcursao, situacaoVenda, lerCupom } from "./_lib/venda.js";

export default async function handler(req, res) {
  if (!soMetodo(req, res, "POST")) return;
  try {
    const { e, codigo } = lerCorpo(req);
    const { exId, ex } = await carregarExcursao(String(e || ""));
    const sit = situacaoVenda(ex);
    if (!sit.ativa) return enviar(res, 409, { erro: sit.motivo });
    const c = await lerCupom(exId, ex, codigo);
    if (!c) return enviar(res, 400, { erro: "Digite o código do cupom." });
    if (!c.ok) return enviar(res, 200, { ok: false, codigo: c.codigo, motivo: c.motivo });
    enviar(res, 200, { ok: true, codigo: c.codigo, valorCent: c.valorCent, porCompra: c.porCompra, restam: Number.isFinite(c.restam) ? c.restam : null });
  } catch (err) { tratarErro(res, err); }
}
