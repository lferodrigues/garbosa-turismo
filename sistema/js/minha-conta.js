// Área do viajante: histórico de viagens, parcelas pagas e em aberto, meus dados
import * as R from "./venda-regras.js?v=16";
import { aoMudarSessao, telaAcesso, formPerfil, lerPerfil, salvarPerfil, sair, api, esc } from "./conta-viajante.js?v=16";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const C = () => $("#mcConteudo");
const hoje = R.hojeBR();
let PERFIL = null, CONTA = null, aba = "viagens";

const inicio = Date.now();
const pronto = () => setTimeout(() => { $("#loading").classList.add("hidden"); $("#conta").classList.remove("hidden"); }, Math.max(0, 900 - (Date.now() - inicio)));

const STATUS = {
  aguardando: { nome: "Aguardando pagamento", cls: "pendente", ic: "fa-hourglass-half" },
  parcial: { nome: "Pagando", cls: "parcial", ic: "fa-circle-half-stroke" },
  pago: { nome: "Pago", cls: "pago", ic: "fa-circle-check" },
  expirado: { nome: "Expirada", cls: "isento", ic: "fa-clock" },
  cancelado: { nome: "Cancelada", cls: "isento", ic: "fa-ban" }
};
const SIT = {
  paga: { nome: "Paga", cls: "pago" }, aberta: { nome: "Em aberto", cls: "parcial" }, vencida: { nome: "Vencida", cls: "pendente" },
  estornada: { nome: "Estornada", cls: "isento" }, cancelada: { nome: "Cancelada", cls: "isento" }
};
const pill = (m, k) => { const s = m[k] || { nome: k, cls: "" }; return `<span class="pill st-${s.cls}">${esc(s.nome)}</span>`; };
const quando = (v) => `${R.fData(v.dataSaida)}${v.horaSaida ? " às " + esc(v.horaSaida) : ""}`;

aoMudarSessao(async (u) => {
  CONTA = u;
  if (!u) {
    PERFIL = null; topo();
    telaAcesso(C(), { titulo: "Área do cliente", texto: "Entre para ver o financeiro das suas viagens (parcelas pagas e em aberto). Primeira vez? Crie a conta e faça o pré-cadastro." });
    C().insertAdjacentHTML("beforeend", `<p class="mc-rodape"><a href="../index.html"><i class="fa-solid fa-house"></i> Voltar à tela inicial</a> · <a href="../excursoes.html">Catálogo de viagens</a></p>`);
    return pronto();
  }
  try { PERFIL = await lerPerfil(); } catch { PERFIL = null; }
  topo();
  if (!PERFIL?.cpf) {
    formPerfil(C(), PERFIL, { hoje, titulo: "Pré-cadastro do viajante", texto: "Falta pouco! Preencha seus dados uma única vez. Eles serão usados nas suas compras de excursões.",
      botao: "Salvar meu cadastro", aoSalvar: (p) => { PERFIL = p; topo(); abrir("viagens"); } });
    return pronto();
  }
  abrir(aba);
  pronto();
});

function topo() {
  const u = $("#mcUser");
  u.classList.toggle("hidden", !CONTA);
  $("#mcAbas").classList.toggle("hidden", !CONTA || !PERFIL?.cpf);
  if (CONTA) {
    u.innerHTML = `<span><i class="fa-solid fa-circle-user"></i> ${esc((PERFIL?.nome || CONTA.email || "").split(" ")[0])}</span><button type="button" class="btn btn-ghost-light btn-sm" id="btnSair"><i class="fa-solid fa-right-from-bracket"></i> Sair</button>`;
    $("#btnSair").onclick = () => sair();
  }
}
$$("#mcAbas [data-aba]").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.aba)));
function abrir(qual) {
  aba = qual;
  $$("#mcAbas [data-aba]").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === qual));
  if (qual === "dados") return meusDados();
  return historico();
}

/* ---------- histórico ---------- */
async function historico() {
  C().innerHTML = `<p class="mc-carregando"><i class="fa-solid fa-spinner fa-spin"></i> Buscando suas viagens…</p>`;
  let r;
  try { r = await api("/api/minhas-viagens"); }
  catch (e) { C().innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(e.message)}</p><button class="btn btn-light btn-sm" id="tentar">Tentar de novo</button></div>`; $("#tentar").onclick = historico; return; }
  if (aba !== "viagens") return;
  if (!r.viagens.length) {
    C().innerHTML = `<div class="empty"><i class="fa-solid fa-suitcase-rolling"></i><p>Você ainda não tem viagens compradas pela internet.</p>
      <a class="btn btn-primary btn-sm" href="../excursoes.html"><i class="fa-solid fa-map-location-dot"></i> Ver o catálogo de viagens</a></div>`;
    return;
  }
  const proximas = r.viagens.filter((v) => v.dataSaida >= r.hoje && !["expirado", "cancelado"].includes(v.status)).sort((a, b) => a.dataSaida.localeCompare(b.dataSaida));
  const outras = r.viagens.filter((v) => !proximas.includes(v));
  const card = (v) => {
    const st = STATUS[v.status] || { ic: "fa-ticket" };
    const pct = v.totalCent ? Math.min(100, Math.round((v.recebidoCent / v.totalCent) * 100)) : 0;
    return `<button type="button" class="mc-viagem ${v.dataSaida < r.hoje ? "passou" : ""}" data-pedido="${esc(v.pedido)}">
      <span class="mc-data"><strong>${esc(R.fData(v.dataSaida).slice(0, 5))}</strong><small>${esc(v.dataSaida.slice(0, 4))}</small></span>
      <span class="mc-info"><strong>${esc(v.destino)}</strong>
        <small><i class="fa-solid fa-users"></i> ${v.viajantes.length} viajante(s) · ${esc(v.formaTxt)} · pedido #${esc(v.codigo)}</small>
        ${["aguardando", "parcial", "pago"].includes(v.status) ? `<span class="bar"><span style="width:${pct}%"></span></span><small>${R.brl(v.recebidoCent)} pagos de ${R.brl(v.totalCent)}</small>` : ""}
      </span>
      <span class="mc-st">${pill(STATUS, v.status)}<i class="fa-solid fa-chevron-right"></i></span>
    </button>`;
  };
  C().innerHTML = `${proximas.length ? `<h3 class="cp-sub"><i class="fa-solid fa-plane-departure"></i> Próximas viagens</h3><div class="mc-lista">${proximas.map(card).join("")}</div>` : ""}
    ${outras.length ? `<h3 class="cp-sub"><i class="fa-solid fa-clock-rotate-left"></i> Histórico</h3><div class="mc-lista">${outras.map(card).join("")}</div>` : ""}`;
  $$("[data-pedido]", C()).forEach((b) => b.addEventListener("click", () => detalhe(b.dataset.pedido)));
}

/* ---------- uma viagem: viajantes e parcelas ---------- */
async function detalhe(pedido) {
  C().innerHTML = `<p class="mc-carregando"><i class="fa-solid fa-spinner fa-spin"></i> Consultando as parcelas no Asaas…</p>`;
  let v;
  try { v = await api(`/api/minhas-viagens?pedido=${encodeURIComponent(pedido)}`); }
  catch (e) { C().innerHTML = `<div class="empty"><p>${esc(e.message)}</p><button class="btn btn-light btn-sm" id="voltar">Voltar</button></div>`; $("#voltar").onclick = historico; return; }
  const abertas = v.parcelasLista.filter((p) => p.situacao === "aberta" || p.situacao === "vencida");
  const prox = abertas[0];
  C().innerHTML = `
    <button type="button" class="link-btn mc-voltar" id="voltar"><i class="fa-solid fa-arrow-left"></i> Financeiro</button>
    <div class="mc-cab">
      <div><h2>${esc(v.destino)}</h2><small class="muted">Pedido #${esc(v.codigo)} · comprado em ${new Date(v.criadoEm).toLocaleDateString("pt-BR")}${v.agencia ? ` · ${esc(v.agencia)}` : ""}</small></div>
      ${pill(STATUS, v.status)}
    </div>
    <div class="insc-info mc-info-grid">
      <div><i class="fa-solid fa-calendar-day"></i><small>Saída</small><strong>${quando(v)}</strong></div>
      <div><i class="fa-solid fa-rotate-left"></i><small>Retorno</small><strong>${R.fData(v.dataRetorno)}${v.horaRetorno ? " às " + esc(v.horaRetorno) : ""}</strong></div>
      <div class="span2"><i class="fa-solid fa-location-dot"></i><small>Local de saída</small><strong>${esc(v.localSaida || "A combinar")}</strong></div>
    </div>
    ${v.motivo ? `<div class="alerta"><i class="fa-solid fa-circle-info"></i> ${esc(v.motivo)}</div>` : ""}

    <div class="cards-fin mc-totais">
      <div class="card-fin"><small>Total</small><strong>${R.brl(v.totalCent)}</strong></div>
      <div class="card-fin verde"><small>Pago</small><strong>${R.brl(v.pagoCent)}</strong></div>
      <div class="card-fin vermelho"><small>Em aberto</small><strong>${R.brl(v.abertoCent)}</strong></div>
    </div>
    ${v.grupo ? `<a class="btn btn-block btn-zap" target="_blank" rel="noopener" href="${esc(v.grupo)}"><i class="fa-brands fa-whatsapp"></i> Entrar no grupo da excursão</a>` : ""}
    ${prox?.link ? `<a class="btn btn-primary btn-block" target="_blank" rel="noopener" href="${esc(prox.link)}"><i class="fa-solid fa-lock"></i> Pagar ${prox.numero > 1 || v.parcelas > 1 ? `a parcela ${prox.numero}` : "agora"} · ${R.brl(prox.valorCent)}</a>` : ""}

    <h3 class="cp-sub"><i class="fa-solid fa-list-ol"></i> Parcelas · ${esc(v.formaTxt)}</h3>
    <div class="mc-parcelas">${v.parcelasLista.map((p) => `
      <div class="mc-parc ${p.situacao}">
        <span class="mc-num">${p.numero}/${v.parcelasLista.length}</span>
        <span class="mc-pinfo"><strong>${R.brl(p.valorCent)}</strong>
          <small>${p.situacao === "paga" ? `Paga${p.pagaEm ? " em " + R.fData(p.pagaEm) : ""}` : `Vence em ${R.fData(p.vencimento)}`}${p.forma ? " · " + esc(p.forma) : ""}</small></span>
        <span class="mc-pacoes">${pill(SIT, p.situacao)}
          ${(p.situacao === "aberta" || p.situacao === "vencida") && p.link ? `<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="${esc(p.link)}">Pagar</a>` : ""}
          ${(p.situacao === "aberta" || p.situacao === "vencida") && p.boleto ? `<a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${esc(p.boleto)}" title="Boleto em PDF"><i class="fa-solid fa-barcode"></i> PDF</a>` : ""}
          ${p.situacao === "paga" && p.link ? `<a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${esc(p.link)}" title="Comprovante"><i class="fa-solid fa-receipt"></i></a>` : ""}
        </span>
      </div>`).join("") || `<p class="vazio">Sem parcelas.</p>`}</div>
    ${v.fonte === "sistema" && !["expirado", "cancelado"].includes(v.status) ? `<p class="cp-nota">Não foi possível consultar o Asaas agora; mostrando os pagamentos já registrados.</p>` : ""}

    <h3 class="cp-sub"><i class="fa-solid fa-users"></i> Viajantes</h3>
    <div class="cp-resumo">${v.viajantes.map((x, i) => `<div class="cp-linha"><span>${i + 1}. ${esc(x.nome)}
      ${x.colo ? `<em class="cp-tag colo">colo</em>` : x.poltrona ? `<em class="cp-tag polt">poltrona ${x.poltrona}</em>` : ""}</span><strong>${R.brl(x.valorCent)}</strong></div>`).join("")}
      ${v.descontoCent ? `<div class="cp-linha desconto"><span><i class="fa-solid fa-tag"></i> Cupom ${esc(v.cupom || "")}</span><strong>− ${R.brl(v.descontoCent)}</strong></div>` : ""}</div>`;
  $("#voltar").onclick = historico;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- meus dados + dependentes salvos ---------- */
function meusDados() {
  C().innerHTML = `<div id="mdPerfil"></div><h3 class="cp-sub"><i class="fa-solid fa-user-group"></i> Dependentes salvos</h3><div id="mdDeps"></div>`;
  formPerfil($("#mdPerfil"), PERFIL, { hoje, botao: "Salvar alterações", texto: "O CPF da conta não pode ser alterado.",
    aoSalvar: (p) => { PERFIL = p; topo(); const m = $("#mdPerfil [data-msg]"); m.textContent = "Dados salvos!"; m.className = "login-msg ok"; } });
  const deps = Object.entries(PERFIL.dependentes || {});
  $("#mdDeps").innerHTML = deps.length ? `<div class="cp-resumo">${deps.map(([k, d]) => `<div class="cp-linha"><span>${esc(d.nome)}
      <small class="muted">${d.nascimento ? R.fData(d.nascimento) : ""}${d.cpf ? " · CPF " + esc(R.mascaraCpf(d.cpf)) : ""}</small></span>
      <button type="button" class="ic danger" data-rm="${esc(k)}" title="Remover"><i class="fa-solid fa-trash"></i></button></div>`).join("")}</div>`
    : `<p class="vazio">Os dependentes das suas compras ficam salvos aqui para a próxima vez.</p>`;
  $$("[data-rm]", $("#mdDeps")).forEach((b) => b.addEventListener("click", async () => {
    const deps2 = { ...PERFIL.dependentes };
    delete deps2[b.dataset.rm];
    try { await salvarPerfil({ dependentes: Object.keys(deps2).length ? deps2 : null }); PERFIL.dependentes = deps2; meusDados(); }
    catch { b.closest(".cp-linha").insertAdjacentHTML("beforeend", `<small class="login-msg erro">Não foi possível remover agora.</small>`); }
  }));
}
