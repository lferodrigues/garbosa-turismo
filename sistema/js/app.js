import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, get, set, push, update, remove, onValue, query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* =========================================================
   CATÁLOGO DE VEÍCULOS
   div = número de poltronas pagantes usado no rateio:
   valor por poltrona = (transporte + ingressos) / div
========================================================= */
const VEICULOS = {
  van15:    { nome: "Van 15 lugares",          cap: 15, div: 10, icone: "fa-van-shuttle" },
  van20:    { nome: "Van 20 lugares",          cap: 20, div: 15, icone: "fa-van-shuttle" },
  micro32:  { nome: "Micro-ônibus 32 lugares", cap: 32, div: 20, icone: "fa-bus-simple" },
  micro36:  { nome: "Micro-ônibus 36 lugares", cap: 36, div: 28, icone: "fa-bus-simple" },
  onibus42: { nome: "Ônibus 42 lugares",       cap: 42, div: 29, icone: "fa-bus" },
  onibus46: { nome: "Ônibus 46 lugares",       cap: 46, div: 32, icone: "fa-bus" },
  onibus50: { nome: "Ônibus 50 lugares",       cap: 50, div: 35, icone: "fa-bus" },
  onibus64: { nome: "Ônibus 64 lugares",       cap: 64, div: 40, icone: "fa-bus" }
};
const DOCS = { RG: "RG", CNH: "CNH", CERTIDAO: "Certidão de Nascimento" };
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

/* =========================================================
   HELPERS
========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const fData = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoje = () => isoDe(new Date());
const veic = (tipo) => VEICULOS[tipo] || { nome: tipo || "—", cap: 0, div: 1, icone: "fa-bus" };
const ordenar = (obj, campo) => Object.entries(obj || {}).sort((a, b) => String(a[1][campo] ?? "").localeCompare(String(b[1][campo] ?? "")));

function toast(texto, tipo = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.innerHTML = `<i class="fa-solid ${tipo === "erro" ? "fa-circle-exclamation" : "fa-circle-check"}"></i> ${esc(texto)}`;
  $("#toasts").appendChild(t);
  setTimeout(() => t.classList.add("sai"), 3200);
  setTimeout(() => t.remove(), 3700);
}
function falha(e) { console.error(e); toast(e?.code === "PERMISSION_DENIED" ? "Sem permissão no banco. Verifique as regras do Firebase." : (e?.message || "Erro ao salvar"), "erro"); }

/* ---------- Modal ---------- */
function abrirModal(titulo, corpo, botoes = [], largo = false) {
  $("#modalTitle").textContent = titulo;
  $("#modalBody").innerHTML = corpo;
  const foot = $("#modalFoot");
  foot.innerHTML = "";
  botoes.forEach((b) => {
    const el = document.createElement("button");
    el.className = "btn " + (b.classe || "btn-light");
    el.innerHTML = b.html;
    el.addEventListener("click", b.acao);
    foot.appendChild(el);
  });
  $(".modal").classList.toggle("modal-lg", largo);
  $("#modalBackdrop").classList.remove("hidden");
  const primeiro = $("#modalBody input, #modalBody select");
  if (primeiro) setTimeout(() => primeiro.focus(), 50);
}
function fecharModal() { $("#modalBackdrop").classList.add("hidden"); }
$("#modalClose").addEventListener("click", fecharModal);
$("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

function confirmar(texto, acao, rotulo = "Excluir") {
  abrirModal("Confirmar", `<p>${texto}</p>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-trash"></i> ${rotulo}`, classe: "btn-danger", acao: async () => { fecharModal(); try { await acao(); } catch (e) { falha(e); } } }
  ]);
}

function lerForm(form) {
  const d = {};
  $$("[name]", form).forEach((el) => { d[el.name] = el.type === "checkbox" ? el.checked : el.value.trim(); });
  return d;
}

/* =========================================================
   ESTADO
========================================================= */
let U = null;   // usuário Firebase
let P = null;   // perfil (usuarios/uid)
const S = {
  view: "calendario",
  viagens: {}, excursoes: {}, viajantes: {}, poltronas: {}, agencias: {},
  mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  exSel: null, veicSel: null, passSel: null, busca: ""
};
const ehAgencia = () => P?.tipo === "agencia";
const pAg = (sub = "") => `${sub}/${U.uid}`;

/* =========================================================
   AUTENTICAÇÃO
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  U = user;
  try {
    const snap = await get(ref(db, `usuarios/${user.uid}`));
    if (!snap.exists()) {
      $("#loading p").innerHTML = "Perfil não encontrado no banco de dados.<br>Crie a conta novamente pela tela de cadastro.";
      setTimeout(() => signOut(auth), 3500);
      return;
    }
    P = snap.val();
  } catch (e) {
    $("#loading p").innerHTML = "Não foi possível ler o banco de dados.<br>Confira se as regras do Realtime Database foram publicadas.";
    console.error(e);
    return;
  }
  $("#userNome").textContent = P.nome;
  $("#userEmpresa").textContent = P.empresa;
  $("#userTipo").textContent = ehAgencia() ? "Agência" : "Transportadora";
  montarAbas();
  assinar();
  $("#loading").classList.add("hidden");
  $("#app").classList.remove("hidden");
  render();
});
$("#btnSair").addEventListener("click", () => signOut(auth));

function assinar() {
  const campo = ehAgencia() ? "agenciaUid" : "transportadoraUid";
  onValue(query(ref(db, "viagens"), orderByChild(campo), equalTo(U.uid)),
    (s) => { S.viagens = s.val() || {}; render(); }, falha);
  if (ehAgencia()) {
    onValue(ref(db, pAg("excursoes")), (s) => { S.excursoes = s.val() || {}; render(); }, falha);
    onValue(ref(db, pAg("viajantes")), (s) => { S.viajantes = s.val() || {}; render(); }, falha);
    onValue(ref(db, pAg("poltronas")), (s) => { S.poltronas = s.val() || {}; render(); }, falha);
  } else {
    onValue(ref(db, "agencias"), (s) => { S.agencias = s.val() || {}; render(); }, falha);
  }
}

/* =========================================================
   ABAS / ROTEAMENTO
========================================================= */
function abas() {
  const base = [{ id: "calendario", nome: "Calendário", icone: "fa-calendar-days", cor: "c1" }];
  if (ehAgencia()) {
    base.push(
      { id: "excursoes", nome: "Excursões", icone: "fa-route", cor: "c2" },
      { id: "viajantes", nome: "Viajantes", icone: "fa-users", cor: "c3" },
      { id: "poltronas", nome: "Poltronas", icone: "fa-couch", cor: "c4" }
    );
  } else {
    base.push({ id: "viagens", nome: "Viagens / Orçamentos", icone: "fa-bus", cor: "c2" });
  }
  return base;
}
function montarAbas() {
  $("#tabstrip").innerHTML = abas().map((a) =>
    `<button class="tab" data-view="${a.id}"><i class="fa-solid ${a.icone} ${a.cor}"></i><span>${a.nome}</span></button>`).join("");
  $$("#tabstrip .tab").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.view)));
}
function irPara(view, exId) {
  S.view = view;
  if (exId) { S.exSel = exId; S.veicSel = null; S.passSel = null; }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function render() {
  if (!P) return;
  $$("#tabstrip .tab").forEach((b) => b.classList.toggle("active", b.dataset.view === S.view));
  const views = { calendario: viewCalendario, excursoes: viewExcursoes, viajantes: viewViajantes, poltronas: viewPoltronas, viagens: viewViagens };
  (views[S.view] || viewCalendario)();
}
function toolbar(titulo, icone, botoes = "") {
  return `<div class="panel-head"><h2><i class="fa-solid ${icone}"></i> ${titulo}</h2><div class="toolbar">${botoes}</div></div>`;
}
const tbBtn = (id, icone, rotulo, cls = "") => `<button class="tool ${cls}" id="${id}"><i class="fa-solid ${icone}"></i><span>${rotulo}</span></button>`;

/* =========================================================
   CÁLCULOS DE EXCURSÃO
========================================================= */
function veiculosDe(ex) {
  return Object.entries(ex?.veiculos || {}).sort((a, b) => (a[1].ordem || 0) - (b[1].ordem || 0));
}
const precoPoltrona = (v) => (num(v.valorTransporte) + num(v.valorIngressos)) / veic(v.tipo).div;
const capacidadeEx = (ex) => veiculosDe(ex).reduce((s, [, v]) => s + veic(v.tipo).cap, 0);
const viajantesEx = (exId) => ordenar(S.viajantes[exId], "nome");
const ocupantes = (exId) => viajantesEx(exId).filter(([, p]) => !p.colo);
function poltronaDe(exId, pid) {
  const mapa = S.poltronas[exId] || {};
  for (const [vk, seats] of Object.entries(mapa)) {
    for (const [n, id] of Object.entries(seats || {})) if (id === pid) return { vk, n };
  }
  return null;
}
function rotuloPoltrona(exId, pid) {
  const p = poltronaDe(exId, pid);
  if (!p) return "—";
  const lista = veiculosDe(S.excursoes[exId]);
  const idx = lista.findIndex(([k]) => k === p.vk);
  return lista.length > 1 ? `V${idx + 1} · ${p.n}` : p.n;
}

/* =========================================================
   CALENDÁRIO
========================================================= */
function eventos() {
  const ev = [];
  Object.entries(S.viagens).forEach(([id, v]) => ev.push({
    tipo: "viagem", id, ini: v.dataSaida, fim: v.dataRetorno || v.dataSaida,
    titulo: `${veic(v.tipoVeiculo).nome.replace(" lugares", "")} · ${v.destino || "Viagem"}`, hora: v.horaSaida
  }));
  if (ehAgencia()) Object.entries(S.excursoes).forEach(([id, e]) => ev.push({
    tipo: "excursao", id, ini: e.dataSaida, fim: e.dataRetorno || e.dataSaida, titulo: e.destino, hora: e.horaSaida
  }));
  return ev.filter((e) => e.ini).sort((a, b) => (a.ini + (a.hora || "")).localeCompare(b.ini + (b.hora || "")));
}

function viewCalendario() {
  const ws = $("#workspace");
  const ano = S.mes.getFullYear(), mes = S.mes.getMonth();
  const inicio = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay());
  const evs = eventos();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = isoDe(d);
    const doDia = evs.filter((e) => iso >= e.ini && iso <= e.fim);
    const chips = doDia.slice(0, 3).map((e) =>
      `<button class="ev ev-${e.tipo}" data-tipo="${e.tipo}" data-id="${e.id}" title="${esc(e.titulo)}">${e.hora && iso === e.ini ? `<b>${esc(e.hora)}</b> ` : ""}${esc(e.titulo)}</button>`).join("");
    const mais = doDia.length > 3 ? `<button class="ev-mais" data-dia="${iso}">+${doDia.length - 3} mais</button>` : "";
    cells += `<div class="day ${d.getMonth() !== mes ? "fora" : ""} ${iso === hoje() ? "hoje" : ""}">
      <span class="dnum">${d.getDate()}</span>${chips}${mais}</div>`;
  }
  const proximas = evs.filter((e) => e.fim >= hoje()).slice(0, 8);
  ws.innerHTML = `
  <section class="panel">
    ${toolbar("Calendário de viagens", "fa-calendar-days",
      tbBtn("calPrev", "fa-chevron-left", "Anterior") + tbBtn("calHoje", "fa-calendar-day", "Hoje") + tbBtn("calNext", "fa-chevron-right", "Próximo") +
      (ehAgencia() ? tbBtn("calNovaEx", "fa-plus", "Nova excursão", "tool-accent") : tbBtn("calNovaVg", "fa-plus", "Nova viagem", "tool-accent")))}
    <div class="cal-layout">
      <div class="cal">
        <div class="cal-title">${MESES[mes]} de ${ano}</div>
        <div class="cal-grid cal-head">${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => `<div>${d}</div>`).join("")}</div>
        <div class="cal-grid">${cells}</div>
        <div class="legenda">
          <span><i class="dot dot-viagem"></i> Veículo agendado</span>
          ${ehAgencia() ? `<span><i class="dot dot-excursao"></i> Excursão da agência</span>` : ""}
        </div>
      </div>
      <aside class="side-list">
        <h4><i class="fa-solid fa-clock"></i> Próximas</h4>
        ${proximas.length ? proximas.map((e) => `
          <button class="prox ev-${e.tipo}-b" data-tipo="${e.tipo}" data-id="${e.id}">
            <span class="prox-data">${fData(e.ini).slice(0, 5)}</span>
            <span><strong>${esc(e.titulo)}</strong><small>${e.tipo === "viagem" ? "Veículo agendado" : "Excursão"}${e.hora ? " · " + esc(e.hora) : ""}</small></span>
          </button>`).join("") : `<p class="vazio">Nenhuma viagem futura.</p>`}
      </aside>
    </div>
  </section>`;
  $("#calPrev").onclick = () => { S.mes = new Date(ano, mes - 1, 1); render(); };
  $("#calNext").onclick = () => { S.mes = new Date(ano, mes + 1, 1); render(); };
  $("#calHoje").onclick = () => { const h = new Date(); S.mes = new Date(h.getFullYear(), h.getMonth(), 1); render(); };
  if ($("#calNovaEx")) $("#calNovaEx").onclick = () => formExcursao();
  if ($("#calNovaVg")) $("#calNovaVg").onclick = () => formViagem();
  $$("[data-tipo]", ws).forEach((b) => b.addEventListener("click", () => detalhes(b.dataset.tipo, b.dataset.id)));
  $$(".ev-mais", ws).forEach((b) => b.addEventListener("click", () => {
    const iso = b.dataset.dia;
    const lista = eventos().filter((e) => iso >= e.ini && iso <= e.fim);
    abrirModal(`Viagens em ${fData(iso)}`, lista.map((e) =>
      `<button class="prox ev-${e.tipo}-b" data-t="${e.tipo}" data-i="${e.id}"><span><strong>${esc(e.titulo)}</strong><small>${e.tipo === "viagem" ? "Veículo agendado" : "Excursão"}</small></span></button>`).join(""));
    $$("#modalBody [data-t]").forEach((x) => x.addEventListener("click", () => detalhes(x.dataset.t, x.dataset.i)));
  }));
}

function linha(rotulo, valor) { return `<div class="dl-row"><span>${rotulo}</span><strong>${valor}</strong></div>`; }

function detalhes(tipo, id) {
  if (tipo === "viagem") {
    const v = S.viagens[id];
    if (!v) return;
    let corpo = `<div class="det-head"><i class="fa-solid ${veic(v.tipoVeiculo).icone}"></i><div><strong>${esc(veic(v.tipoVeiculo).nome)}</strong><small>${esc(v.destino || "")}</small></div></div>
      <div class="dl">
        ${linha("Veículo", esc(veic(v.tipoVeiculo).nome) + (v.veiculo ? ` · ${esc(v.veiculo)}` : ""))}
        ${linha("Destino", esc(v.destino || "—"))}
        ${linha("Saída", `${fData(v.dataSaida)} às ${esc(v.horaSaida || "—")}`)}
        ${linha("Retorno", `${fData(v.dataRetorno)} às ${esc(v.horaRetorno || "—")}`)}
        ${linha("Motorista", esc(v.motorista || "—"))}
        ${linha("Empresa de transporte", esc(v.transportadoraNome || "—"))}
        ${linha("Agência solicitante", esc(v.agenciaNome || "—"))}
        ${linha("Valor da viagem", brl(v.valorFinal))}
      </div>`;
    if (!ehAgencia()) corpo += `<div class="calc-box mini">
        ${linha("Chofer", brl(v.valorChofer))}${linha("Diesel", brl(v.valorDiesel))}${linha("Gastos adicionais", brl(v.gastosAdicionais))}
        ${linha("Custo total", brl(v.custoTotal))}${linha(`Margem (${num(v.margem)}%)`, brl(v.valorLucro))}</div>`;
    const botoes = [{ html: "Fechar", acao: fecharModal }];
    if (!ehAgencia()) botoes.push({ html: `<i class="fa-solid fa-pen"></i> Editar`, classe: "btn-primary", acao: () => formViagem(id) });
    else botoes.push({ html: `<i class="fa-solid fa-plus"></i> Criar excursão com este veículo`, classe: "btn-primary", acao: () => formExcursao(null, id) });
    abrirModal("Detalhes do veículo agendado", corpo, botoes);
  } else {
    const e = S.excursoes[id];
    if (!e) return;
    const cap = capacidadeEx(e), occ = ocupantes(id).length, total = viajantesEx(id).length;
    abrirModal("Detalhes da excursão", `
      <div class="det-head"><i class="fa-solid fa-route"></i><div><strong>${esc(e.destino)}</strong><small>${fData(e.dataSaida)}${e.dataRetorno && e.dataRetorno !== e.dataSaida ? " a " + fData(e.dataRetorno) : ""}</small></div></div>
      <div class="dl">
        ${linha("Saída", `${fData(e.dataSaida)} às ${esc(e.horaSaida || "—")}`)}
        ${linha("Retorno", `${fData(e.dataRetorno)} às ${esc(e.horaRetorno || "—")}`)}
        ${linha("Local de saída", esc(e.localSaida || "—"))}
        ${linha("Viajantes", `${total} cadastrados (${occ} ocupam poltrona) / ${cap} lugares`)}
      </div>
      <h4 class="sub">Veículos</h4>
      ${veiculosDe(e).map(([k, v], i) => `<div class="veic-card"><i class="fa-solid ${veic(v.tipo).icone}"></i>
        <div><strong>Veículo ${i + 1}: ${esc(veic(v.tipo).nome)}</strong><small>Transporte ${brl(v.valorTransporte)} · Ingressos ${brl(v.valorIngressos)}</small></div>
        <span class="preco">${brl(precoPoltrona(v))}<small>/poltrona</small></span></div>`).join("")}`,
      [{ html: "Fechar", acao: fecharModal },
       { html: `<i class="fa-solid fa-users"></i> Viajantes`, acao: () => { fecharModal(); irPara("viajantes", id); } },
       { html: `<i class="fa-solid fa-couch"></i> Poltronas`, classe: "btn-primary", acao: () => { fecharModal(); irPara("poltronas", id); } }]);
  }
}

/* =========================================================
   AGÊNCIA · EXCURSÕES
========================================================= */
function opcoesVeiculo(sel) {
  return Object.entries(VEICULOS).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v.nome}</option>`).join("");
}

function viewExcursoes() {
  const lista = ordenar(S.excursoes, "dataSaida").reverse();
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Excursões da agência", "fa-route", tbBtn("btnNovaEx", "fa-plus", "Cadastrar excursão", "tool-accent"))}
    <div class="regra"><i class="fa-solid fa-calculator"></i> Valor por poltrona = (valor do transporte + ingressos) ÷ poltronas de rateio do veículo:
      ${Object.values(VEICULOS).map((v) => `<span>${v.nome.replace(" lugares", "")}: ÷${v.div}</span>`).join("")}</div>
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Destino</th><th>Saída</th><th>Retorno</th><th>Veículos</th><th>Ocupação</th><th>Valor/poltrona</th><th></th></tr></thead>
      <tbody>${lista.map(([id, e]) => {
        const vs = veiculosDe(e), cap = capacidadeEx(e), occ = ocupantes(id).length;
        return `<tr>
          <td><strong>${esc(e.destino)}</strong></td>
          <td>${fData(e.dataSaida)} ${esc(e.horaSaida || "")}</td>
          <td>${fData(e.dataRetorno)} ${esc(e.horaRetorno || "")}</td>
          <td>${vs.map(([, v]) => esc(veic(v.tipo).nome)).join("<br>")}</td>
          <td><span class="pill ${occ > cap ? "pill-red" : occ === cap ? "pill-yellow" : ""}">${occ}/${cap}</span></td>
          <td>${vs.map(([, v]) => `<strong class="money">${brl(precoPoltrona(v))}</strong>`).join("<br>")}</td>
          <td class="acoes">
            <button class="ic" title="Viajantes" data-a="via" data-id="${id}"><i class="fa-solid fa-users"></i></button>
            <button class="ic" title="Poltronas" data-a="pol" data-id="${id}"><i class="fa-solid fa-couch"></i></button>
            <button class="ic" title="Editar" data-a="edit" data-id="${id}"><i class="fa-solid fa-pen"></i></button>
            <button class="ic danger" title="Excluir" data-a="del" data-id="${id}"><i class="fa-solid fa-trash"></i></button>
          </td></tr>`;
      }).join("")}</tbody></table></div>`
    : `<div class="empty"><i class="fa-solid fa-route"></i><p>Nenhuma excursão cadastrada ainda.</p></div>`}
  </section>`;
  $("#btnNovaEx").onclick = () => formExcursao();
  $$("[data-a]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id;
    if (b.dataset.a === "via") irPara("viajantes", id);
    if (b.dataset.a === "pol") irPara("poltronas", id);
    if (b.dataset.a === "edit") formExcursao(id);
    if (b.dataset.a === "del") confirmar(`Excluir a excursão <strong>${esc(S.excursoes[id].destino)}</strong> com todos os viajantes e o mapa de poltronas?`, async () => {
      await update(ref(db), { [`excursoes/${U.uid}/${id}`]: null, [`viajantes/${U.uid}/${id}`]: null, [`poltronas/${U.uid}/${id}`]: null });
      if (S.exSel === id) S.exSel = null;
      toast("Excursão excluída");
    });
  }));
}

function opcoesViagens(sel) {
  const vs = ordenar(S.viagens, "dataSaida");
  return `<option value="">— Não vincular —</option>` + vs.map(([id, v]) =>
    `<option value="${id}" ${id === sel ? "selected" : ""}>${fData(v.dataSaida)} · ${esc(veic(v.tipoVeiculo).nome)} · ${esc(v.destino || "")} · ${esc(v.transportadoraNome || "")} (${brl(v.valorFinal)})</option>`).join("");
}

function formExcursao(id = null, viagemId = null) {
  const e = id ? S.excursoes[id] : {};
  const [vk, v0] = id ? (veiculosDe(e)[0] || [null, {}]) : [null, {}];
  const vinc = viagemId || v0.viagemId || "";
  abrirModal(id ? "Editar excursão" : "Cadastrar excursão", `
    <form id="fEx" class="form-grid">
      <label class="span2">Destino / nome da excursão<input name="destino" required value="${esc(e.destino)}" placeholder="Ex.: Aldeia das Águas"></label>
      <label>Data de saída<input type="date" name="dataSaida" required value="${esc(e.dataSaida)}"></label>
      <label>Horário de saída<input type="time" name="horaSaida" value="${esc(e.horaSaida)}"></label>
      <label>Data de retorno<input type="date" name="dataRetorno" value="${esc(e.dataRetorno)}"></label>
      <label>Horário de retorno<input type="time" name="horaRetorno" value="${esc(e.horaRetorno)}"></label>
      <label class="span2">Local de saída<input name="localSaida" value="${esc(e.localSaida)}" placeholder="Ex.: Rodoviária de São João Nepomuceno"></label>
      <div class="section-label span2"><i class="fa-solid fa-bus"></i> ${id ? "Veículo principal" : "Veículo"}</div>
      <label class="span2">Vincular a um veículo agendado pela transportadora (opcional)<select name="viagemId" id="exViagem">${opcoesViagens(vinc)}</select></label>
      <label>Tipo de veículo<select name="tipo" id="exTipo" required>${opcoesVeiculo(v0.tipo || "onibus46")}</select></label>
      <label>Valor cobrado pela empresa de transporte (R$)<input type="number" step="0.01" min="0" name="valorTransporte" id="exTransp" required value="${esc(v0.valorTransporte)}"></label>
      <label class="span2">Ingressos — valor total (R$, deixe 0 se não houver)<input type="number" step="0.01" min="0" name="valorIngressos" id="exIngr" value="${esc(v0.valorIngressos ?? 0)}"></label>
      <div class="calc-box span2" id="exCalc"></div>
    </form>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-floppy-disk"></i> Salvar`, classe: "btn-primary", acao: () => salvarExcursao(id, vk) }
  ], true);
  const f = $("#fEx");
  const calc = () => {
    const d = lerForm(f), vv = veic(d.tipo);
    const soma = num(d.valorTransporte) + num(d.valorIngressos);
    $("#exCalc").innerHTML = `${linha("Transporte + ingressos", brl(soma))}${linha(`Rateio (${vv.nome})`, `÷ ${vv.div}`)}
      <div class="calc-total"><span>Valor por poltrona</span><strong>${brl(soma / vv.div)}</strong></div>`;
  };
  const aplicarViagem = () => {
    const vg = S.viagens[$("#exViagem").value];
    if (!vg) return;
    $("#exTipo").value = vg.tipoVeiculo;
    $("#exTransp").value = vg.valorFinal;
    ["dataSaida", "horaSaida", "dataRetorno", "horaRetorno", "destino"].forEach((c) => { const el = f.elements[c]; if (el && !el.value && vg[c]) el.value = vg[c]; });
    calc();
  };
  f.addEventListener("input", calc);
  $("#exViagem").addEventListener("change", aplicarViagem);
  if (viagemId) aplicarViagem();
  calc();
  f.addEventListener("submit", (ev) => { ev.preventDefault(); salvarExcursao(id, vk); });
}

async function salvarExcursao(id, vk) {
  const f = $("#fEx");
  if (!f.reportValidity()) return;
  const d = lerForm(f);
  if (d.dataRetorno && d.dataRetorno < d.dataSaida) return toast("O retorno não pode ser antes da saída.", "erro");
  const veiculo = { tipo: d.tipo, valorTransporte: num(d.valorTransporte), valorIngressos: num(d.valorIngressos), viagemId: d.viagemId || null };
  const info = { destino: d.destino, dataSaida: d.dataSaida, horaSaida: d.horaSaida, dataRetorno: d.dataRetorno || d.dataSaida, horaRetorno: d.horaRetorno, localSaida: d.localSaida };
  try {
    if (id) {
      const k = vk || "v" + Date.now();
      await update(ref(db, `excursoes/${U.uid}/${id}`), { ...info, atualizadoEm: Date.now(), [`veiculos/${k}`]: { ...veiculo, ordem: (S.excursoes[id].veiculos?.[k]?.ordem) ?? 0 } });
      toast("Excursão atualizada");
    } else {
      const novo = push(ref(db, `excursoes/${U.uid}`));
      await set(novo, { ...info, criadoEm: Date.now(), veiculos: { ["v" + Date.now()]: { ...veiculo, ordem: 0 } } });
      S.exSel = novo.key;
      toast("Excursão cadastrada");
    }
    fecharModal();
  } catch (e) { falha(e); }
}

function formVeiculoExtra(exId) {
  const ex = S.excursoes[exId];
  const faltam = ocupantes(exId).length - capacidadeEx(ex);
  abrirModal("Inserir mais um veículo", `
    ${faltam > 0 ? `<div class="alerta"><i class="fa-solid fa-triangle-exclamation"></i> Faltam <strong>${faltam}</strong> lugares para acomodar todos os viajantes.</div>` : ""}
    <form id="fVx" class="form-grid">
      <label class="span2">Vincular a um veículo agendado (opcional)<select name="viagemId" id="vxViagem">${opcoesViagens("")}</select></label>
      <label>Tipo de veículo<select name="tipo" id="vxTipo">${opcoesVeiculo(faltam > 0 && faltam <= 15 ? "van15" : "onibus46")}</select></label>
      <label>Valor do transporte (R$)<input type="number" step="0.01" min="0" name="valorTransporte" id="vxTransp" required></label>
      <label class="span2">Ingressos — valor total (R$)<input type="number" step="0.01" min="0" name="valorIngressos" value="0"></label>
      <div class="calc-box span2" id="vxCalc"></div>
    </form>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-plus"></i> Inserir veículo`, classe: "btn-primary", acao: async () => {
      const f = $("#fVx");
      if (!f.reportValidity()) return;
      const d = lerForm(f);
      const k = "v" + Date.now();
      const ordem = veiculosDe(ex).length;
      try {
        await set(ref(db, `excursoes/${U.uid}/${exId}/veiculos/${k}`), { tipo: d.tipo, valorTransporte: num(d.valorTransporte), valorIngressos: num(d.valorIngressos), viagemId: d.viagemId || null, ordem });
        S.veicSel = k;
        fecharModal();
        toast("Veículo inserido");
      } catch (e) { falha(e); }
    } }
  ]);
  const f = $("#fVx");
  const calc = () => { const d = lerForm(f), vv = veic(d.tipo); $("#vxCalc").innerHTML = `<div class="calc-total"><span>Valor por poltrona (÷${vv.div})</span><strong>${brl((num(d.valorTransporte) + num(d.valorIngressos)) / vv.div)}</strong></div>`; };
  f.addEventListener("input", calc);
  $("#vxViagem").addEventListener("change", () => { const vg = S.viagens[$("#vxViagem").value]; if (vg) { $("#vxTipo").value = vg.tipoVeiculo; $("#vxTransp").value = vg.valorFinal; calc(); } });
  calc();
}

/* ---------- seletor de excursão ---------- */
function seletorExcursao() {
  const lista = ordenar(S.excursoes, "dataSaida").reverse();
  if (!lista.length) return null;
  if (!S.exSel || !S.excursoes[S.exSel]) S.exSel = lista[0][0];
  return `<label class="ex-picker"><i class="fa-solid fa-route"></i>
    <select id="exPicker">${lista.map(([id, e]) => `<option value="${id}" ${id === S.exSel ? "selected" : ""}>${fData(e.dataSaida)} — ${esc(e.destino)}</option>`).join("")}</select></label>`;
}
function ligarSeletor() {
  const p = $("#exPicker");
  if (p) p.onchange = () => { S.exSel = p.value; S.veicSel = null; S.passSel = null; render(); };
}
function semExcursao(titulo, icone) {
  $("#workspace").innerHTML = `<section class="panel">${toolbar(titulo, icone, tbBtn("btnNovaEx", "fa-plus", "Cadastrar excursão", "tool-accent"))}
    <div class="empty"><i class="fa-solid ${icone}"></i><p>Cadastre uma excursão primeiro.</p></div></section>`;
  $("#btnNovaEx").onclick = () => formExcursao();
}

/* =========================================================
   AGÊNCIA · VIAJANTES
========================================================= */
function viewViajantes() {
  const sel = seletorExcursao();
  if (!sel) return semExcursao("Viajantes", "fa-users");
  const exId = S.exSel, ex = S.excursoes[exId];
  const lista = viajantesEx(exId), occ = ocupantes(exId).length, cap = capacidadeEx(ex);
  const pct = cap ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Cadastro de viajantes", "fa-users",
      tbBtn("btnNovoPass", "fa-user-plus", "Cadastrar viajante", "tool-accent") + tbBtn("btnVeicExtra", "fa-bus", "Inserir veículo") + tbBtn("btnIrPolt", "fa-couch", "Poltronas"))}
    <div class="subbar">${sel}
      <div class="lotacao"><div class="lot-txt"><strong>${occ}</strong> de <strong>${cap}</strong> poltronas · ${lista.length - occ} de colo</div>
      <div class="bar"><span style="width:${pct}%" class="${occ > cap ? "red" : occ === cap ? "yellow" : ""}"></span></div></div>
    </div>
    ${occ > cap ? `<div class="alerta"><i class="fa-solid fa-triangle-exclamation"></i> A quantidade de viajantes (${occ}) passou a capacidade dos veículos (${cap}).
      <button class="btn btn-primary btn-sm" id="btnVeicExtra2"><i class="fa-solid fa-plus"></i> Inserir mais um veículo</button></div>`
      : occ === cap && cap > 0 ? `<div class="alerta amarelo"><i class="fa-solid fa-circle-info"></i> Veículos lotados. Novos viajantes vão precisar de mais um veículo.
      <button class="btn btn-primary btn-sm" id="btnVeicExtra2"><i class="fa-solid fa-plus"></i> Inserir mais um veículo</button></div>` : ""}
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>#</th><th>Nome completo</th><th>Documento</th><th>Telefone</th><th>Idade</th><th>Poltrona</th><th></th></tr></thead>
      <tbody>${lista.map(([pid, p], i) => `<tr>
        <td>${i + 1}</td>
        <td><strong>${esc(p.nome)}</strong>${p.colo ? ` <span class="pill pill-yellow">colo</span>` : ""}</td>
        <td><small class="muted">${esc(DOCS[p.docTipo] || p.docTipo)}</small><br>${esc(p.docNumero)}</td>
        <td>${esc(p.telefone)}</td>
        <td>${esc(p.idade)}</td>
        <td>${p.colo ? "—" : `<span class="pill">${esc(rotuloPoltrona(exId, pid))}</span>`}</td>
        <td class="acoes">
          <button class="ic" title="Editar" data-a="edit" data-id="${pid}"><i class="fa-solid fa-pen"></i></button>
          <button class="ic danger" title="Excluir" data-a="del" data-id="${pid}"><i class="fa-solid fa-trash"></i></button>
        </td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><i class="fa-solid fa-users"></i><p>Nenhum viajante cadastrado nesta excursão.</p></div>`}
  </section>`;
  ligarSeletor();
  $("#btnNovoPass").onclick = () => formViajante(exId);
  $("#btnVeicExtra").onclick = () => formVeiculoExtra(exId);
  if ($("#btnVeicExtra2")) $("#btnVeicExtra2").onclick = () => formVeiculoExtra(exId);
  $("#btnIrPolt").onclick = () => irPara("poltronas");
  $$("[data-a]").forEach((b) => b.addEventListener("click", () => {
    const pid = b.dataset.id, p = S.viajantes[exId][pid];
    if (b.dataset.a === "edit") formViajante(exId, pid);
    if (b.dataset.a === "del") confirmar(`Excluir o viajante <strong>${esc(p.nome)}</strong>?`, async () => {
      const upd = { [`viajantes/${U.uid}/${exId}/${pid}`]: null };
      const pos = poltronaDe(exId, pid);
      if (pos) upd[`poltronas/${U.uid}/${exId}/${pos.vk}/${pos.n}`] = null;
      await update(ref(db), upd);
      toast("Viajante excluído");
    });
  }));
}

function mascaraTel(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formViajante(exId, pid = null) {
  const p = pid ? S.viajantes[exId][pid] : {};
  const salvar = async (continuar) => {
    const f = $("#fPass");
    if (!f.reportValidity()) return;
    const d = lerForm(f);
    const dados = { nome: d.nome, docTipo: d.docTipo, docNumero: d.docNumero, telefone: d.telefone, idade: parseInt(d.idade, 10) || 0, colo: !!d.colo };
    try {
      if (pid) await update(ref(db, `viajantes/${U.uid}/${exId}/${pid}`), dados);
      else await set(push(ref(db, `viajantes/${U.uid}/${exId}`)), { ...dados, criadoEm: Date.now() });
      if (dados.colo && pid) { const pos = poltronaDe(exId, pid); if (pos) await remove(ref(db, `poltronas/${U.uid}/${exId}/${pos.vk}/${pos.n}`)); }
      toast(pid ? "Viajante atualizado" : "Viajante cadastrado");
      if (continuar) { f.reset(); f.elements.nome.focus(); } else fecharModal();
    } catch (e) { falha(e); }
  };
  const botoes = [{ html: "Cancelar", acao: fecharModal }];
  if (!pid) botoes.push({ html: `<i class="fa-solid fa-repeat"></i> Salvar e cadastrar outro`, acao: () => salvar(true) });
  botoes.push({ html: `<i class="fa-solid fa-floppy-disk"></i> Salvar`, classe: "btn-primary", acao: () => salvar(false) });
  abrirModal(pid ? "Editar viajante" : "Cadastrar viajante", `
    <form id="fPass" class="form-grid">
      <label class="span2">Nome completo<input name="nome" required value="${esc(p.nome)}" autocomplete="off"></label>
      <label>Tipo de documento<select name="docTipo" id="pDoc">${Object.entries(DOCS).map(([k, n]) => `<option value="${k}" ${k === p.docTipo ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Número do documento<input name="docNumero" required value="${esc(p.docNumero)}"></label>
      <label>Telefone<input name="telefone" id="pTel" inputmode="tel" required value="${esc(p.telefone)}" placeholder="(32) 99999-9999"></label>
      <label>Idade<input type="number" min="0" max="120" name="idade" id="pIdade" required value="${esc(p.idade)}"></label>
      <label class="check span2"><input type="checkbox" name="colo" id="pColo" ${p.colo ? "checked" : ""}> Criança de colo (não ocupa poltrona)</label>
    </form>`, botoes);
  $("#pTel").addEventListener("input", (e) => { e.target.value = mascaraTel(e.target.value); });
  const sug = () => { if (!pid && num($("#pIdade").value) <= 5 && $("#pIdade").value !== "" && $("#pDoc").value === "CERTIDAO") $("#pColo").checked = true; };
  $("#pIdade").addEventListener("change", sug);
  $("#pDoc").addEventListener("change", sug);
  $("#fPass").addEventListener("submit", (e) => { e.preventDefault(); salvar(!pid); });
}

/* =========================================================
   AGÊNCIA · POLTRONAS
========================================================= */
function layoutAssentos(cap) {
  const linhas = [];
  if (cap <= 20) {               // vans: 2 + 1
    for (let n = 1; n <= cap; n += 3) linhas.push({ esq: [n, n + 1].filter((x) => x <= cap), dir: [n + 2].filter((x) => x <= cap) });
  } else {                        // ônibus: 2 + 2  (padrão 1 2 | 4 3)
    const cheias = Math.floor(cap / 4), resto = cap % 4;
    for (let r = 0; r < cheias; r++) { const b = r * 4 + 1; linhas.push({ esq: [b, b + 1], dir: [b + 3, b + 2] }); }
    if (resto) { const b = cheias * 4 + 1; const s = Array.from({ length: resto }, (_, i) => b + i); linhas.push({ esq: s.slice(0, 2), dir: s.slice(2).reverse(), wc: resto <= 2 }); }
  }
  return linhas;
}

function viewPoltronas() {
  const sel = seletorExcursao();
  if (!sel) return semExcursao("Poltronas", "fa-couch");
  const exId = S.exSel, ex = S.excursoes[exId];
  const vs = veiculosDe(ex);
  if (!S.veicSel || !ex.veiculos?.[S.veicSel]) S.veicSel = vs[0]?.[0];
  const vk = S.veicSel, v = ex.veiculos[vk], vv = veic(v.tipo);
  const mapa = (S.poltronas[exId] || {})[vk] || {};
  const pessoas = ocupantes(exId);
  const nomes = Object.fromEntries(pessoas.map(([id, p]) => [id, p.nome]));
  const totalSent = pessoas.filter(([id]) => poltronaDe(exId, id)).length;
  const filtrados = pessoas.filter(([, p]) => p.nome.toLowerCase().includes(S.busca.toLowerCase()));

  const seat = (n) => {
    const pid = mapa[n];
    const nome = pid ? (nomes[pid] || "?") : "";
    const primeiro = nome.split(" ")[0];
    return `<div class="seat ${pid ? "ocupada" : ""} ${pid && pid === S.passSel ? "sel" : ""}" data-seat="${n}" ${pid ? `draggable="true" data-pid="${pid}"` : ""} title="${esc(nome || "Poltrona " + n + " livre")}">
      <span class="sn">${n}</span>${pid ? `<span class="snome">${esc(primeiro)}</span><button class="seat-x" data-x="${n}" title="Liberar">×</button>` : ""}</div>`;
  };
  const linhas = layoutAssentos(vv.cap);
  const bus = `
    <div class="bus ${vv.cap <= 20 ? "bus-van" : ""}">
      <div class="bus-front"><span class="driver"><i class="fa-solid fa-dharmachakra"></i> Motorista</span><span class="door">Porta</span></div>
      <div class="bus-body">
        ${linhas.map((l) => `<div class="bus-row">
          <div class="side">${l.esq.map(seat).join("")}</div>
          <div class="aisle"></div>
          <div class="side ${l.dir.length < 2 && vv.cap > 20 ? "side-r" : ""}">${l.dir.map(seat).join("")}${l.wc ? `<div class="wc">WC</div>` : ""}</div>
        </div>`).join("")}
        <div class="corredor-label">CORREDOR</div>
      </div>
      ${vv.cap > 20 && !linhas.some((l) => l.wc) ? `<div class="bus-back">Toalete</div>` : ""}
    </div>`;
  const numerada = Array.from({ length: vv.cap }, (_, i) => i + 1).map((n) => `<li><span>${n}</span>${esc(nomes[mapa[n]] || "")}</li>`).join("");

  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Montagem de poltronas", "fa-couch",
      tbBtn("btnAuto", "fa-wand-magic-sparkles", "Distribuir") + tbBtn("btnLimpar", "fa-eraser", "Limpar veículo") +
      tbBtn("btnVeicExtra", "fa-plus", "Inserir veículo", "tool-accent") + tbBtn("btnPrint", "fa-print", "Imprimir"))}
    <div class="subbar">${sel}
      <div class="lotacao"><div class="lot-txt"><strong>${totalSent}</strong> de <strong>${pessoas.length}</strong> viajantes posicionados · capacidade total ${capacidadeEx(ex)}</div></div>
    </div>
    ${pessoas.length > capacidadeEx(ex) ? `<div class="alerta"><i class="fa-solid fa-triangle-exclamation"></i> Há ${pessoas.length - capacidadeEx(ex)} viajante(s) sem lugar. Insira mais um veículo.
      <button class="btn btn-primary btn-sm" id="btnVeicExtra2"><i class="fa-solid fa-plus"></i> Inserir mais um veículo</button></div>` : ""}
    <div class="veic-tabs">${vs.map(([k, x], i) => {
      const ocup = Object.keys((S.poltronas[exId] || {})[k] || {}).length;
      return `<button class="vtab ${k === vk ? "active" : ""}" data-vk="${k}"><i class="fa-solid ${veic(x.tipo).icone}"></i> Veículo ${i + 1} · ${esc(veic(x.tipo).nome)} <span class="pill">${ocup}/${veic(x.tipo).cap}</span></button>`;
    }).join("")}
      ${vs.length > 1 ? `<button class="vtab vtab-del" id="btnDelVeic" title="Remover este veículo"><i class="fa-solid fa-trash"></i></button>` : ""}</div>
    <div class="polt-layout">
      <aside class="pass-list no-print">
        <h4><i class="fa-solid fa-users"></i> Viajantes <small>arraste ou toque e escolha a poltrona</small></h4>
        <input type="search" id="busca" placeholder="Buscar nome..." value="${esc(S.busca)}">
        <div class="pass-scroll">
          ${filtrados.length ? filtrados.map(([id, p]) => {
            const pos = poltronaDe(exId, id);
            return `<div class="pass ${pos ? "posto" : ""} ${S.passSel === id ? "sel" : ""}" draggable="true" data-pid="${id}">
              <i class="fa-solid fa-user"></i><span>${esc(p.nome)}</span>${pos ? `<em>${esc(rotuloPoltrona(exId, id))}</em>` : ""}</div>`;
          }).join("") : `<p class="vazio">${pessoas.length ? "Nenhum resultado." : "Cadastre viajantes primeiro."}</p>`}
        </div>
      </aside>
      <div class="print-area">
        <div class="print-title">MAPA DAS POLTRONAS<br><span>${esc(vv.nome.toUpperCase())}</span></div>
        <div class="print-sub">${esc(ex.destino)} · ${fData(ex.dataSaida)} ${esc(ex.horaSaida || "")}${vs.length > 1 ? ` · Veículo ${vs.findIndex(([k]) => k === vk) + 1}` : ""}</div>
        <div class="map-wrap">
          ${bus}
          <ol class="numerada">${numerada}</ol>
        </div>
      </div>
    </div>
  </section>`;

  ligarSeletor();
  const salvarPos = async (pid, n) => {
    const upd = {};
    const ant = poltronaDe(exId, pid);
    if (ant) upd[`${ant.vk}/${ant.n}`] = null;
    upd[`${vk}/${n}`] = pid;
    S.passSel = null;
    try { await update(ref(db, `poltronas/${U.uid}/${exId}`), upd); } catch (e) { falha(e); }
  };
  $("#busca").addEventListener("input", (e) => {
    S.busca = e.target.value; const pos = e.target.selectionStart; render();
    const b = $("#busca"); b.focus(); b.setSelectionRange(pos, pos);
  });
  $$(".vtab[data-vk]").forEach((b) => b.addEventListener("click", () => { S.veicSel = b.dataset.vk; render(); }));
  $$(".pass").forEach((el) => {
    el.addEventListener("click", () => { S.passSel = S.passSel === el.dataset.pid ? null : el.dataset.pid; render(); });
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", el.dataset.pid); });
  });
  $$(".seat").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".seat-x")) return;
      const n = el.dataset.seat, ocup = mapa[n];
      if (S.passSel) { if (ocup !== S.passSel) salvarPos(S.passSel, n); else { S.passSel = null; render(); } }
      else if (ocup) { S.passSel = ocup; render(); }
    });
    if (el.dataset.pid) el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", el.dataset.pid));
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); const pid = e.dataTransfer.getData("text/plain"); if (pid) salvarPos(pid, el.dataset.seat); });
  });
  $$(".seat-x").forEach((b) => b.addEventListener("click", async () => {
    try { await remove(ref(db, `poltronas/${U.uid}/${exId}/${vk}/${b.dataset.x}`)); } catch (e) { falha(e); }
  }));
  $("#btnAuto").onclick = async () => {
    const livres = pessoas.filter(([id]) => !poltronaDe(exId, id)).map(([id]) => id);
    if (!livres.length) return toast("Todos os viajantes já estão posicionados.");
    const upd = {};
    for (const [k, x] of vs) {
      const m = (S.poltronas[exId] || {})[k] || {};
      for (let n = 1; n <= veic(x.tipo).cap && livres.length; n++) if (!m[n]) upd[`${k}/${n}`] = livres.shift();
    }
    try { await update(ref(db, `poltronas/${U.uid}/${exId}`), upd); toast(livres.length ? `${livres.length} viajante(s) ficaram sem lugar` : "Viajantes distribuídos", livres.length ? "erro" : "ok"); } catch (e) { falha(e); }
  };
  $("#btnLimpar").onclick = () => confirmar("Liberar todas as poltronas deste veículo?", async () => { await remove(ref(db, `poltronas/${U.uid}/${exId}/${vk}`)); toast("Veículo liberado"); }, "Limpar");
  $("#btnVeicExtra").onclick = () => formVeiculoExtra(exId);
  if ($("#btnVeicExtra2")) $("#btnVeicExtra2").onclick = () => formVeiculoExtra(exId);
  $("#btnPrint").onclick = () => window.print();
  if ($("#btnDelVeic")) $("#btnDelVeic").onclick = () => confirmar(`Remover o veículo <strong>${esc(vv.nome)}</strong> desta excursão? As poltronas dele serão liberadas.`, async () => {
    await update(ref(db), { [`excursoes/${U.uid}/${exId}/veiculos/${vk}`]: null, [`poltronas/${U.uid}/${exId}/${vk}`]: null });
    S.veicSel = null; toast("Veículo removido");
  }, "Remover");
}

/* =========================================================
   TRANSPORTADORA · VIAGENS
========================================================= */
function viewViagens() {
  const lista = ordenar(S.viagens, "dataSaida").reverse();
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Viagens / orçamentos", "fa-bus", tbBtn("btnNovaVg", "fa-plus", "Cadastrar viagem", "tool-accent"))}
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Saída</th><th>Retorno</th><th>Destino</th><th>Agência</th><th>Veículo</th><th>Motorista</th><th>Valor final</th><th></th></tr></thead>
      <tbody>${lista.map(([id, v]) => `<tr>
        <td>${fData(v.dataSaida)} ${esc(v.horaSaida || "")}</td>
        <td>${fData(v.dataRetorno)} ${esc(v.horaRetorno || "")}</td>
        <td><strong>${esc(v.destino)}</strong></td>
        <td>${esc(v.agenciaNome || "—")}</td>
        <td>${esc(veic(v.tipoVeiculo).nome)}${v.veiculo ? `<br><small class="muted">${esc(v.veiculo)}</small>` : ""}</td>
        <td>${esc(v.motorista)}</td>
        <td><strong class="money">${brl(v.valorFinal)}</strong></td>
        <td class="acoes">
          <button class="ic" title="Ver" data-a="ver" data-id="${id}"><i class="fa-solid fa-eye"></i></button>
          <button class="ic" title="Editar" data-a="edit" data-id="${id}"><i class="fa-solid fa-pen"></i></button>
          <button class="ic danger" title="Excluir" data-a="del" data-id="${id}"><i class="fa-solid fa-trash"></i></button>
        </td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><i class="fa-solid fa-bus"></i><p>Nenhuma viagem cadastrada ainda.</p></div>`}
  </section>`;
  $("#btnNovaVg").onclick = () => formViagem();
  $$("[data-a]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id;
    if (b.dataset.a === "ver") detalhes("viagem", id);
    if (b.dataset.a === "edit") formViagem(id);
    if (b.dataset.a === "del") confirmar(`Excluir a viagem para <strong>${esc(S.viagens[id].destino)}</strong>? Ela sairá do calendário da agência.`, async () => { await remove(ref(db, `viagens/${id}`)); toast("Viagem excluída"); });
  }));
}

function formViagem(id = null) {
  const v = id ? S.viagens[id] : {};
  const ags = ordenar(S.agencias, "nome");
  const agSel = v.agenciaUid || (id && v.agenciaNome ? "__outra" : "");
  abrirModal(id ? "Editar viagem" : "Cadastrar viagem", `
    <form id="fVg" class="form-grid">
      <label>Agência solicitante<select name="agenciaUid" id="vgAg" required>
        <option value="">Selecione...</option>
        ${ags.map(([uid, a]) => `<option value="${uid}" ${uid === agSel ? "selected" : ""}>${esc(a.nome)}</option>`).join("")}
        <option value="__outra" ${agSel === "__outra" ? "selected" : ""}>Outra (sem conta no sistema)</option>
      </select></label>
      <label id="vgAgNomeWrap" class="${agSel === "__outra" ? "" : "hidden"}">Nome da agência<input name="agenciaNomeLivre" value="${esc(agSel === "__outra" ? v.agenciaNome : "")}"></label>
      <label class="span2">Destino<input name="destino" required value="${esc(v.destino)}"></label>
      <label>Tamanho do veículo<select name="tipoVeiculo" required>${opcoesVeiculo(v.tipoVeiculo || "onibus46")}</select></label>
      <label>Identificação do veículo (placa / prefixo)<input name="veiculo" value="${esc(v.veiculo)}" placeholder="Ex.: ABC-1D23"></label>
      <label class="span2">Motorista<input name="motorista" required value="${esc(v.motorista)}"></label>
      <label>Data de saída<input type="date" name="dataSaida" required value="${esc(v.dataSaida)}"></label>
      <label>Horário de saída<input type="time" name="horaSaida" required value="${esc(v.horaSaida)}"></label>
      <label>Data de retorno<input type="date" name="dataRetorno" required value="${esc(v.dataRetorno)}"></label>
      <label>Horário de retorno<input type="time" name="horaRetorno" required value="${esc(v.horaRetorno)}"></label>
      <div class="section-label span2"><i class="fa-solid fa-calculator"></i> Custos</div>
      <label>Valor do chofer (R$)<input type="number" step="0.01" min="0" name="valorChofer" required value="${esc(v.valorChofer)}"></label>
      <label>Valor do diesel (R$)<input type="number" step="0.01" min="0" name="valorDiesel" required value="${esc(v.valorDiesel)}"></label>
      <label>Gastos adicionais (R$)<input type="number" step="0.01" min="0" name="gastosAdicionais" value="${esc(v.gastosAdicionais ?? 0)}" placeholder="pedágio, estacionamento..."></label>
      <label>Margem de lucro (%)<input type="number" step="0.1" min="0" name="margem" required value="${esc(v.margem)}"></label>
    </form>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-calculator"></i> Calcular valor final`, classe: "btn-primary", acao: () => calcularViagem(id) }
  ], true);
  $("#vgAg").addEventListener("change", (e) => $("#vgAgNomeWrap").classList.toggle("hidden", e.target.value !== "__outra"));
  $("#fVg").addEventListener("submit", (e) => { e.preventDefault(); calcularViagem(id); });
}

function calcularViagem(id) {
  const f = $("#fVg");
  if (!f.reportValidity()) return;
  const d = lerForm(f);
  if (d.agenciaUid === "__outra" && !d.agenciaNomeLivre) return toast("Informe o nome da agência.", "erro");
  if (d.dataRetorno < d.dataSaida) return toast("O retorno não pode ser antes da saída.", "erro");
  const chofer = num(d.valorChofer), diesel = num(d.valorDiesel), gastos = num(d.gastosAdicionais), margem = num(d.margem);
  const custo = chofer + diesel + gastos;
  const lucro = custo * (margem / 100);
  const final = Math.round((custo + lucro) * 100) / 100;
  const outra = d.agenciaUid === "__outra";
  const dados = {
    transportadoraUid: U.uid, transportadoraNome: P.empresa,
    agenciaUid: outra ? null : d.agenciaUid,
    agenciaNome: outra ? d.agenciaNomeLivre : (S.agencias[d.agenciaUid]?.nome || ""),
    destino: d.destino, tipoVeiculo: d.tipoVeiculo, capacidade: veic(d.tipoVeiculo).cap, veiculo: d.veiculo, motorista: d.motorista,
    dataSaida: d.dataSaida, horaSaida: d.horaSaida, dataRetorno: d.dataRetorno, horaRetorno: d.horaRetorno,
    valorChofer: chofer, valorDiesel: diesel, gastosAdicionais: gastos, margem,
    custoTotal: custo, valorLucro: Math.round(lucro * 100) / 100, valorFinal: final
  };
  const valores = lerForm(f);
  abrirModal("Confirmar valor da viagem", `
    <div class="det-head"><i class="fa-solid ${veic(d.tipoVeiculo).icone}"></i><div><strong>${esc(dados.destino)}</strong><small>${esc(veic(d.tipoVeiculo).nome)} · ${fData(d.dataSaida)} a ${fData(d.dataRetorno)}</small></div></div>
    <div class="calc-box">
      ${linha("Chofer", brl(chofer))}${linha("Diesel", brl(diesel))}${linha("Gastos adicionais", brl(gastos))}
      ${linha("Custo total", brl(custo))}${linha(`Margem de lucro (${margem}%)`, brl(lucro))}
      <div class="calc-total big"><span>Valor final</span><strong>${brl(final)}</strong></div>
    </div>
    <p class="muted">Ao confirmar, o veículo aparece no calendário${dados.agenciaUid ? ` da sua empresa e da agência <strong>${esc(dados.agenciaNome)}</strong>` : ""}.</p>`, [
    { html: `<i class="fa-solid fa-arrow-left"></i> Voltar e editar`, acao: () => {
      formViagem(id);
      const f2 = $("#fVg");
      Object.entries(valores).forEach(([k, val]) => { if (f2.elements[k]) f2.elements[k].value = val; });
      $("#vgAgNomeWrap").classList.toggle("hidden", valores.agenciaUid !== "__outra");
    } },
    { html: `<i class="fa-solid fa-check"></i> OK, salvar`, classe: "btn-primary", acao: async () => {
      try {
        if (id) await set(ref(db, `viagens/${id}`), { ...dados, criadoEm: S.viagens[id]?.criadoEm || Date.now(), atualizadoEm: Date.now() });
        else await set(push(ref(db, "viagens")), { ...dados, criadoEm: Date.now() });
        fecharModal();
        toast("Viagem salva e agendada no calendário");
        const [a, m] = d.dataSaida.split("-");
        S.mes = new Date(+a, +m - 1, 1);
        irPara("calendario");
      } catch (e) { falha(e); }
    } }
  ]);
}
