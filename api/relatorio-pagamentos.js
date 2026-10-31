// GET /api/relatorio-pagamentos?e={idExcursao}&own={uidAgencia}
// Relatório de quem pagou e quem não pagou uma excursão:
//  - compras online: parcelas consultadas NA HORA no Asaas (se o Asaas não responder, usa o que o webhook já gravou);
//  - demais viajantes (cadastro manual, link, reserva, planilha): pagamentos registrados no Financeiro do sistema.
// Autenticação: Authorization: Bearer <token do Firebase do usuário logado no sistema> (agência dona, colaborador ou admin).
import { auth, db, ADMIN_EMAIL } from "./_lib/firebase.js";
import { enviar, soMetodo, tratarErro, ErroUsuario } from "./_lib/http.js";
import { parcelasDoPedido, situacaoDoPedido } from "./_lib/parcelas.js";
import { R } from "./_lib/venda.js";

const ID = /^[\w-]{1,64}$/;

/** Executa em lotes para não estourar o limite de requisições do Asaas */
async function emLotes(itens, tamanho, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  return out;
}

function situacaoManual(v) {
  const valorCent = R.centavos(v.valor);
  const pagoCent = Object.values(v.pagamentos || {}).reduce((s, x) => s + R.centavos(x.valor), 0);
  const situacao = valorCent <= 0 ? (pagoCent > 0 ? "pago" : "isento") : pagoCent >= valorCent - 1 ? "pago" : pagoCent > 0 ? "parcial" : "aguardando";
  return { valorCent, pagoCent, abertoCent: Math.max(0, valorCent - pagoCent), situacao };
}

export default async function handler(req, res) {
  if (!soMetodo(req, res, "GET")) return;
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new ErroUsuario("Faça login no sistema.", 401);
    const u = await (await auth()).verifyIdToken(token).catch(() => null);
    if (!u) throw new ErroUsuario("Sessão expirada. Entre de novo no sistema.", 401);

    const exId = String(req.query.e || "");
    if (!ID.test(exId)) throw new ErroUsuario("Excursão inválida.", 400);
    const d = await db();
    let own = String(req.query.own || "");
    if (!ID.test(own)) own = (await d.ref(`inscricoes/${exId}/owner`).get()).val() || "";
    if (!ID.test(own)) throw new ErroUsuario("Excursão não encontrada.", 404);
    const ex = (await d.ref(`excursoes/${own}/${exId}`).get()).val();
    if (!ex) throw new ErroUsuario("Excursão não encontrada.", 404);
    const pode = u.uid === own || !!ex.colaboradores?.[u.uid] || (u.email || "").toLowerCase() === ADMIN_EMAIL;
    if (!pode) throw new ErroUsuario("Sem permissão para esta excursão.", 403);

    const [pedidos, viajantes] = await Promise.all([
      d.ref(`pedidos/${own}/${exId}`).get().then((s) => s.val() || {}),
      d.ref(`viajantes/${own}/${exId}`).get().then((s) => s.val() || {})
    ]);

    /* ---- compras online (Asaas) ---- */
    let falhasAsaas = 0;
    const online = await emLotes(Object.entries(pedidos), 5, async ([pedidoId, p]) => {
      const { parcelas, fonte, erro } = await parcelasDoPedido(p);
      if (erro) falhasAsaas++;
      const s = situacaoDoPedido(p, parcelas);
      return {
        pedido: pedidoId, codigo: pedidoId.slice(-6).toUpperCase(), criadoEm: p.criadoEm || 0, fonte,
        titular: { nome: p.titular?.nome || "", whatsapp: p.titular?.whatsapp || "", email: p.titular?.email || "" },
        viajantes: Object.entries(p.viajantes || {}).map(([vid, v]) => ({ vid, nome: v.nome, valorCent: v.valorCent || 0, colo: !!v.colo, infantil: !!v.infantil, assento: v.assento || null })),
        formaTxt: p.formaTxt || "", parcelasQtd: p.parcelas || 1, totalCent: p.totalCent || 0, cupom: p.cupom || null,
        statusSistema: p.status || "", motivo: p.motivo || "", ...s,
        proxima: s.proxima ? { numero: s.proxima.numero, vencimento: s.proxima.vencimento, valorCent: s.proxima.valorCent, link: s.proxima.link } : null,
        parcelas: parcelas.map(({ numero, valorCent, vencimento, situacao, forma, pagaEm }) => ({ numero, valorCent, vencimento, situacao, forma, pagaEm }))
      };
    });
    online.sort((a, b) => a.titular.nome.localeCompare(b.titular.nome, "pt-BR"));

    /* ---- viajantes fora da venda online ---- */
    const noPedido = new Set(online.flatMap((o) => o.viajantes.map((v) => v.vid)));
    const outros = Object.entries(viajantes)
      .filter(([vid, v]) => v && !noPedido.has(vid) && !(v.origem === "venda" && v.pedido && pedidos[v.pedido]))
      .map(([vid, v]) => ({ vid, nome: v.nome || "", telefone: v.telefone || "", colo: !!v.colo, origem: v.origem || "manual",
        formaPagamento: v.formaPagamento || "", ...situacaoManual(v) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const ativos = online.filter((o) => o.situacao !== "cancelado");
    const soma = (lista, k) => lista.reduce((s, x) => s + (x[k] || 0), 0);
    enviar(res, 200, {
      geradoEm: Date.now(), hoje: R.hojeBR(), falhasAsaas,
      excursao: { destino: ex.destino || "", dataSaida: ex.dataSaida || "" },
      online, outros,
      totais: {
        online: { pedidos: ativos.length, totalCent: soma(ativos, "totalCent"), pagoCent: soma(ativos, "pagoCent"), abertoCent: soma(ativos, "abertoCent"), vencidoCent: soma(ativos, "vencidoCent") },
        outros: { viajantes: outros.length, totalCent: soma(outros, "valorCent"), pagoCent: soma(outros, "pagoCent"), abertoCent: soma(outros, "abertoCent") }
      }
    });
  } catch (e) { tratarErro(res, e); }
}
