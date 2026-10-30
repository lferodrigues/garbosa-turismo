// GET /api/venda?e={idExcursao} — dados públicos da excursão para a página de compra
import { enviar, soMetodo, tratarErro } from "./_lib/http.js";
import { carregarExcursao, situacaoVenda, veiculosComOcupacao, R } from "./_lib/venda.js";

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET")) return;
  try {
    const { exId, own, ex, agencia } = await carregarExcursao(String(req.query.e || ""));
    const sit = situacaoVenda(ex);
    const base = {
      destino: ex.destino, agencia, descricao: ex.descricao || "",
      dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || ex.dataSaida,
      horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || ""
    };
    if (!sit.ativa) return enviar(res, 200, { ...base, ativa: false, motivo: sit.motivo });
    enviar(res, 200, {
      ...base, ativa: true, hoje: R.hojeBR(),
      valorCent: R.precoPessoaCent(ex),
      valorColoCent: R.centavos(ex.valorColo),
      venda: { maxParcelas: Math.min(R.MAX_PARCELAS, parseInt(ex.venda.maxParcelas, 10) || 1), primeiraParcela: ex.venda.primeiraParcela || "" },
      temCupom: Object.values(ex.cupons || {}).some((c) => c && c.ativo !== false),
      veiculos: await veiculosComOcupacao(own, exId, ex)
    });
  } catch (e) { tratarErro(res, e); }
}
