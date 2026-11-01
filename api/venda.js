// GET /api/venda?e={idExcursao} — dados públicos da excursão para a página de compra
// GET /api/venda?vagas=1          — selo automático de cada excursão do catálogo do site:
//                                    { [idNoSite]: { selo: "ultimas"|"esgotado"|"", livres, cap } }
//                                    (fica nesta função para não passar do limite de funções da Vercel)
import { db } from "./_lib/firebase.js";
import { enviar, soMetodo, tratarErro } from "./_lib/http.js";
import { carregarExcursao, situacaoVenda, veiculosComOcupacao, vagasDaExcursao, exIdDoSite, R } from "./_lib/venda.js";

async function vagasDoSite() {
  const d = await db();
  const site = (await d.ref("site/excursoes").get()).val() || {};
  const res = {};
  await Promise.all(Object.entries(site).map(async ([id, x]) => {
    const exId = exIdDoSite(x);
    if (!exId || x.ativo === false) return; // página fixa ou oculta: sem selo automático
    // dono da excursão: o do link de inscrição (o item do catálogo pode ter sido cadastrado pelo admin)
    const own = (await d.ref(`inscricoes/${exId}/owner`).get()).val() || x.owner;
    if (!own || !/^[\w-]{1,128}$/.test(own)) return;
    const ex = (await d.ref(`excursoes/${own}/${exId}`).get()).val();
    if (!ex) return;
    res[id] = await vagasDaExcursao(own, exId, ex);
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
      vagas: await vagasDaExcursao(own, exId, ex),
      veiculos: await veiculosComOcupacao(own, exId, ex)
    });
  } catch (e) { tratarErro(res, e); }
}
