// GET /api/venda?e={idExcursao} — dados públicos da excursão para a página de compra
// GET /api/venda?vagas=1          — selo automático de cada excursão do catálogo do site:
//                                    { [idNoSite]: { selo: "ultimas"|"esgotado"|"", livres, cap } }
//                                    (fica nesta função para não passar do limite de funções da Vercel)
import { db } from "./_lib/firebase.js";
import { enviar, soMetodo, tratarErro } from "./_lib/http.js";
import { carregarExcursao, situacaoVenda, veiculosComOcupacao, R } from "./_lib/venda.js";

async function vagasDoSite() {
  const d = await db();
  const site = (await d.ref("site/excursoes").get()).val() || {};
  const itens = Object.entries(site).filter(([, x]) => x && x.exId && x.owner && /^[\w-]{1,128}$/.test(x.exId) && /^[\w-]{1,128}$/.test(x.owner));
  const res = {};
  await Promise.all(itens.map(async ([id, x]) => {
    const [ex, pol] = await Promise.all([d.ref(`excursoes/${x.owner}/${x.exId}`).get(), d.ref(`poltronas/${x.owner}/${x.exId}`).get()]);
    if (!ex.val()) return;
    const mapa = pol.val() || {};
    const veics = R.veiculosDe(ex.val()).map(([vk, v]) => ({
      cap: R.VEICULOS[v.tipo]?.cap || 0,
      ocupadas: Object.entries(mapa[vk] || {}).filter(([n, pid]) => pid && Number(n) <= (R.VEICULOS[v.tipo]?.cap || 0))
    }));
    const cap = veics.reduce((s, v) => s + v.cap, 0), ocup = veics.reduce((s, v) => s + v.ocupadas.length, 0);
    res[id] = { selo: R.seloVagas(cap, ocup), livres: Math.max(0, cap - ocup), cap };
  }));
  return res;
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET")) return;
  try {
    if (req.query.vagas) {
      const dados = await vagasDoSite();
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json(dados);
    }
    const { exId, own, ex, agencia } = await carregarExcursao(String(req.query.e || ""));
    const sit = situacaoVenda(ex);
    const base = {
      destino: ex.destino, agencia, descricao: ex.descricao || "",
      dataSaida: ex.dataSaida, horaSaida: ex.horaSaida || "", dataRetorno: ex.dataRetorno || ex.dataSaida,
      horaRetorno: ex.horaRetorno || "", localSaida: ex.localSaida || "",
      folder: ex.folder?.caminho ? { caminho: ex.folder.caminho, raw: ex.folder.raw || "" } : null
    };
    if (!sit.ativa) return enviar(res, 200, { ...base, ativa: false, motivo: sit.motivo });
    enviar(res, 200, {
      ...base, ativa: true, hoje: R.hojeBR(),
      valorCent: R.precoPessoaCent(ex),
      valorColoCent: R.centavos(ex.valorColo),
      valorInfantilCent: R.precoInfantilCent(ex), idadeInfantil: R.IDADE_INFANTIL,
      venda: { maxParcelas: Math.min(R.MAX_PARCELAS, parseInt(ex.venda.maxParcelas, 10) || 1), primeiraParcela: ex.venda.primeiraParcela || "" },
      temCupom: Object.values(ex.cupons || {}).some((c) => c && c.ativo !== false),
      opcionais: R.opcionaisDe(ex),
      veiculos: await veiculosComOcupacao(own, exId, ex)
    });
  } catch (e) { tratarErro(res, e); }
}
