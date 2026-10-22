import { auth, db, ADMIN_EMAIL, authSecundario } from "./firebase.js";
import { baixarXLSX, baixarPDF, baixarPDFPoltronas } from "./exportar.js";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, get, set, push, update, remove, onValue, query, orderByChild, equalTo, limitToLast, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* =========================================================
   CATÁLOGOS
   div = poltronas de rateio: valor por poltrona = (transporte + ingressos) / div
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
const TIPOS = { agencia: "Agência de turismo", transportadora: "Transporte / Fretamento", admin: "Administrador" };
const TIPO_CURTO = { agencia: "Agência", transportadora: "Transporte", admin: "Admin" };
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const ACOES = { login: "Login", sessao: "Sessão retomada", logout: "Logout", cadastro: "Cadastro", admin: "Ação administrativa" };

/* Rotas da SPA e quem pode acessar cada uma */
const ROTAS = {
  calendario: { nome: "Calendário",           icone: "fa-calendar-days", cor: "c1", tipos: ["agencia", "transportadora", "admin"] },
  excursoes:  { nome: "Excursões",            icone: "fa-route",         cor: "c2", tipos: ["agencia", "admin"] },
  viajantes:  { nome: "Viajantes",            icone: "fa-users",         cor: "c3", tipos: ["agencia", "admin"] },
  poltronas:  { nome: "Poltronas",            icone: "fa-couch",         cor: "c4", tipos: ["agencia", "admin"] },
  viagens:    { nome: "Viagens / Orçamentos", icone: "fa-bus",           cor: "c2", tipos: ["transportadora", "admin"] },
  usuarios:   { nome: "Usuários",             icone: "fa-user-gear",     cor: "c5", tipos: ["admin"] },
  logs:       { nome: "Logs de acesso",       icone: "fa-clipboard-list", cor: "c5", tipos: ["admin"] }
};

/* =========================================================
   HELPERS
========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const fData = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const fDataHora = (ts) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoje = () => isoDe(new Date());
const veic = (tipo) => VEICULOS[tipo] || { nome: tipo || "—", cap: 0, div: 1, icone: "fa-bus" };
const ordenar = (obj, campo) => Object.entries(obj || {}).sort((a, b) => String(a[1][campo] ?? "").localeCompare(String(b[1][campo] ?? "")));
const soDig = (v) => String(v || "").replace(/\D/g, "");

function mascaraTel(v) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function mascaraDoc(v) {
  const d = soDig(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
function docValido(v) {
  const d = soDig(v);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  if (d.length === 14) {
    const dv = (n) => { const p = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < n; i++) s += +d[i] * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }
  return false;
}
function ligarMascaras(root = document) {
  $$("[data-mask=tel]", root).forEach((el) => el.addEventListener("input", () => { el.value = mascaraTel(el.value); }));
  $$("[data-mask=doc]", root).forEach((el) => el.addEventListener("input", () => { el.value = mascaraDoc(el.value); }));
}

function toast(texto, tipo = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.innerHTML = `<i class="fa-solid ${tipo === "erro" ? "fa-circle-exclamation" : "fa-circle-check"}"></i> ${esc(texto)}`;
  $("#toasts").appendChild(t);
  setTimeout(() => t.classList.add("sai"), 3200);
  setTimeout(() => t.remove(), 3700);
}
function falha(e) {
  console.error(e);
  const m = e?.code === "PERMISSION_DENIED" || /permission/i.test(e?.message || "") ? "Sem permissão no banco. Verifique as regras do Firebase." : (ERROS_AUTH[e?.code] || e?.message || "Erro ao salvar");
  toast(m, "erro");
}

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
  ligarMascaras($("#modalBody"));
  const primeiro = $("#modalBody input:not([readonly]), #modalBody select");
  if (primeiro) setTimeout(() => primeiro.focus(), 50);
}
function fecharModal() { $("#modalBackdrop").classList.add("hidden"); }
$("#modalClose").addEventListener("click", fecharModal);
$("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

function confirmar(texto, acao, rotulo = "Excluir") {
  abrirModal("Confirmar", `<div>${texto}</div>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-trash"></i> ${rotulo}`, classe: "btn-danger", acao: async () => {
      const extras = lerForm($("#modalBody"));
      fecharModal();
      try { await acao(extras); } catch (e) { falha(e); }
    } }
  ]);
}
function lerForm(form) {
  const d = {};
  $$("[name]", form).forEach((el) => {
    if (el.type === "radio") { if (el.checked) d[el.name] = el.value; }
    else d[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  });
  return d;
}
const linha = (rotulo, valor) => `<div class="dl-row"><span>${rotulo}</span><strong>${valor}</strong></div>`;

/* =========================================================
   ESTADO
========================================================= */
let U = null;   // usuário Firebase
let P = null;   // perfil
let unsubs = [];
let eventoAuth = null;     // "login" | "cadastro" — o que causou a entrada
let cadastrando = false;
const S = {
  view: "calendario", param: null,
  viagens: {}, excursoes: {}, viajantes: {}, poltronas: {}, agencias: {}, usuarios: {}, logs: null,
  mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  exSel: null, veicSel: null, passSel: null, busca: "",
  filtroLogs: { de: "", ate: "", uid: "", acao: "" }, buscaUsuarios: "",
  exportar: null
};
const ehAdmin = () => P?.tipo === "admin";
const ehAgencia = () => P?.tipo === "agencia";
const ehTransp = () => P?.tipo === "transportadora";
const podeAgencia = () => ehAgencia() || ehAdmin();
const podeTransp = () => ehTransp() || ehAdmin();
const dono = (exId) => S.excursoes[exId]?._owner || U.uid;
const nomeAgencia = (uid) => S.agencias[uid]?.nome || S.usuarios[uid]?.empresa || (uid === U?.uid ? P?.empresa : "") || "—";

/* =========================================================
   ROTEADOR (hash) — #/view/parametro
========================================================= */
function lerHash() {
  const [, view = "", param = ""] = (location.hash || "").split("/");
  return { view, param: decodeURIComponent(param) || null };
}
function navegar(view, param) {
  const h = `#/${view}${param ? "/" + encodeURIComponent(param) : ""}`;
  if (location.hash === h) rotear(); else location.hash = h;
}
window.addEventListener("hashchange", rotear);

function rotear() {
  const { view, param } = lerHash();
  if (!U || !P) {                       // fora da sessão
    if (U && !P) return;                // carregando perfil
    mostrarAuth(view === "cadastro" ? "cadastro" : "login");
    return;
  }
  const rota = ROTAS[view];
  if (!rota || !rota.tipos.includes(P.tipo)) { history.replaceState(null, "", "#/calendario"); S.view = "calendario"; S.param = null; }
  else {
    S.view = view; S.param = param;
    if ((view === "viajantes" || view === "poltronas") && param && param !== S.exSel) { S.exSel = param; S.veicSel = null; S.passSel = null; }
  }
  if (S.view === "logs" && S.logs === null) carregarLogs();
  render();
  window.scrollTo({ top: 0 });
}

/* =========================================================
   TELA DE ACESSO
========================================================= */
const ERROS_AUTH = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/email-already-in-use": "Este e-mail já possui uma conta.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/operation-not-allowed": "Login por e-mail/senha não está ativado no Firebase.",
  "auth/network-request-failed": "Sem conexão com a internet."
};
const traduz = (e) => ERROS_AUTH[e.code] || ("Erro: " + (e.message || e));
function msg(texto, tipo = "erro") { const m = $("#loginMsg"); m.textContent = texto; m.className = "login-msg " + tipo; }

function mostrarAuth(aba) {
  $("#loading").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
  const verificando = aba === "verificar";
  $("#verifyBox").classList.toggle("hidden", !verificando);
  $(".login-tabs").classList.toggle("hidden", verificando);
  $("#formEntrar").classList.toggle("hidden", aba !== "login");
  $("#formCadastrar").classList.toggle("hidden", aba !== "cadastro");
  $$(".login-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === aba));
  document.title = (aba === "cadastro" ? "Criar conta" : aba === "verificar" ? "Confirmar e-mail" : "Entrar") + " | Garbosa System";
}
ligarMascaras($("#formCadastrar"));
$$(".login-tab").forEach((t) => t.addEventListener("click", () => msg("", "")));

$("#formEntrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("Entrando...", "info");
  eventoAuth = "login";
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginSenha").value);
  } catch (err) { eventoAuth = null; msg(traduz(err)); }
});

$("#formCadastrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = $("#cadNome").value.trim();
  const empresa = $("#cadEmpresa").value.trim();
  const documento = mascaraDoc($("#cadDoc").value);
  const whatsapp = mascaraTel($("#cadWhats").value);
  const email = $("#cadEmail").value.trim().toLowerCase();
  const senha = $("#cadSenha").value;
  let tipo = $("input[name=cadTipo]:checked").value;
  if (nome.split(/\s+/).length < 2) return msg("Informe o nome completo.");
  if (!empresa) return msg("Informe o nome da agência / empresa.");
  if (!docValido(documento)) return msg("CPF ou CNPJ inválido.");
  if (soDig(whatsapp).length < 10) return msg("WhatsApp inválido.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return msg("E-mail inválido.");
  if (senha.length < 6) return msg("A senha precisa ter pelo menos 6 caracteres.");
  const admin = email === ADMIN_EMAIL;
  if (admin) tipo = "admin";
  msg("Criando conta...", "info");
  cadastrando = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    await updateProfile(cred.user, { displayName: nome });
    await gravarPerfil(cred.user.uid, { nome, empresa, documento, whatsapp, email, tipo });
    if (admin) await sendEmailVerification(cred.user).catch(() => {});
    cadastrando = false;
    eventoAuth = "cadastro";
    await iniciarSessao(cred.user);
  } catch (err) {
    cadastrando = false;
    msg(traduz(err));
  }
});

async function gravarPerfil(uid, d) {
  const perfil = { nome: d.nome, empresa: d.empresa, documento: d.documento, whatsapp: d.whatsapp, email: d.email, tipo: d.tipo, ativo: true, criadoEm: Date.now() };
  const dados = { [`usuarios/${uid}`]: perfil };
  if (d.tipo === "agencia") dados[`agencias/${uid}`] = { nome: d.empresa };
  await update(ref(db), dados);
}

$("#btnEsqueci").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) return msg("Digite seu e-mail no campo acima e clique novamente.");
  try { await sendPasswordResetEmail(auth, email); msg("Enviamos um link de redefinição para " + email, "ok"); }
  catch (err) { msg(traduz(err)); }
});
$("#btnReenviar").addEventListener("click", async () => {
  try { await sendEmailVerification(auth.currentUser); msg("E-mail reenviado.", "ok"); } catch (err) { msg(traduz(err)); }
});
$("#btnJaVerifiquei").addEventListener("click", async () => {
  await auth.currentUser.reload();
  if (!auth.currentUser.emailVerified) return msg("O e-mail ainda não foi confirmado. Abra o link enviado para sua caixa de entrada.");
  await auth.currentUser.getIdToken(true);
  msg("", "");
  iniciarSessao(auth.currentUser);
});
$("#btnSairVerify").addEventListener("click", () => sair());

/* =========================================================
   SESSÃO
========================================================= */
onAuthStateChanged(auth, (user) => {
  if (cadastrando) return;
  if (!user) {
    pararAssinaturas();
    U = null; P = null;
    const { view } = lerHash();
    if (view !== "login" && view !== "cadastro") history.replaceState(null, "", "#/login");
    mostrarAuth(lerHash().view === "cadastro" ? "cadastro" : "login");
    return;
  }
  iniciarSessao(user);
});

async function iniciarSessao(user) {
  U = user; P = null;
  $("#loading").classList.remove("hidden");
  try {
    let snap = await get(ref(db, `usuarios/${user.uid}`));
    // conta de administrador criada direto no console do Firebase: cria o perfil
    if (!snap.exists() && (user.email || "").toLowerCase() === ADMIN_EMAIL) {
      await gravarPerfil(user.uid, { nome: user.displayName || "Administrador", empresa: "Garbosa Turismo", documento: "", whatsapp: "", email: ADMIN_EMAIL, tipo: "admin" });
      snap = await get(ref(db, `usuarios/${user.uid}`));
    }
    if (!snap.exists()) { bloquear("Seu acesso foi removido ou o cadastro não foi concluído. Fale com o administrador."); return; }
    const perfil = snap.val();
    if (perfil.ativo === false) { bloquear("Seu usuário está desativado. Fale com o administrador."); return; }
    if (perfil.tipo === "admin" && !user.emailVerified) {
      U = null;
      $("#verifyEmail").textContent = user.email;
      mostrarAuth("verificar");
      return;
    }
    P = perfil;
  } catch (e) {
    console.error(e);
    U = null;
    mostrarAuth("login");
    msg("Não foi possível ler o banco de dados. Confira se as regras do Realtime Database foram publicadas.");
    return;
  }
  registrarLog(eventoAuth || "sessao");
  eventoAuth = null;
  $("#userNome").textContent = P.nome;
  $("#userEmpresa").textContent = P.empresa;
  $("#userTipo").textContent = TIPO_CURTO[P.tipo];
  montarAbas();
  assinar();
  $("#authScreen").classList.add("hidden");
  $("#loading").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const { view } = lerHash();
  if (!ROTAS[view]) history.replaceState(null, "", "#/calendario");
  rotear();
}

async function bloquear(texto) {
  await signOut(auth);
  history.replaceState(null, "", "#/login");
  mostrarAuth("login");
  msg(texto);
}

async function sair() {
  if (P) await registrarLog("logout");
  await signOut(auth);
  history.replaceState(null, "", "#/login");
  S.logs = null; S.exSel = null;
}
$("#btnSair").addEventListener("click", sair);

function registrarLog(acao, detalhe = "") {
  if (!U) return Promise.resolve();
  return set(push(ref(db, "logs")), {
    uid: U.uid, nome: P?.nome || U.displayName || "", email: U.email || "", tipo: P?.tipo || "",
    acao, detalhe, navegador: navigator.userAgent.slice(0, 160), em: serverTimestamp()
  }).catch((e) => console.warn("log", e));
}

function pararAssinaturas() {
  unsubs.forEach((u) => u());
  unsubs = [];
  Object.assign(S, { viagens: {}, excursoes: {}, viajantes: {}, poltronas: {}, agencias: {}, usuarios: {}, logs: null });
}

function assinar() {
  pararAssinaturas();
  const ouvir = (q, fn) => unsubs.push(onValue(q, (s) => { fn(s.val() || {}); render(); }, falha));
  if (ehAdmin()) {
    ouvir(ref(db, "viagens"), (v) => { S.viagens = v; });
    ouvir(ref(db, "usuarios"), (v) => { S.usuarios = v; });
    ouvir(ref(db, "excursoes"), (v) => {
      S.excursoes = {};
      Object.entries(v).forEach(([own, exs]) => Object.entries(exs || {}).forEach(([id, e]) => { S.excursoes[id] = { ...e, _owner: own }; }));
    });
    ouvir(ref(db, "viajantes"), (v) => { S.viajantes = {}; Object.values(v).forEach((porEx) => Object.assign(S.viajantes, porEx)); });
    ouvir(ref(db, "poltronas"), (v) => { S.poltronas = {}; Object.values(v).forEach((porEx) => Object.assign(S.poltronas, porEx)); });
  } else {
    const campo = ehAgencia() ? "agenciaUid" : "transportadoraUid";
    ouvir(query(ref(db, "viagens"), orderByChild(campo), equalTo(U.uid)), (v) => { S.viagens = v; });
  }
  if (podeAgencia() && !ehAdmin()) {
    ouvir(ref(db, `excursoes/${U.uid}`), (v) => { S.excursoes = {}; Object.entries(v).forEach(([id, e]) => { S.excursoes[id] = { ...e, _owner: U.uid }; }); });
    ouvir(ref(db, `viajantes/${U.uid}`), (v) => { S.viajantes = v; });
    ouvir(ref(db, `poltronas/${U.uid}`), (v) => { S.poltronas = v; });
  }
  if (podeTransp()) ouvir(ref(db, "agencias"), (v) => { S.agencias = v; });
}

/* =========================================================
   ABAS / RENDER
========================================================= */
function montarAbas() {
  $("#tabstrip").innerHTML = Object.entries(ROTAS).filter(([, r]) => r.tipos.includes(P.tipo)).map(([id, r]) =>
    `<a class="tab" href="#/${id}" data-view="${id}"><i class="fa-solid ${r.icone} ${r.cor}"></i><span>${r.nome}</span></a>`).join("");
}
function irPara(view, exId) { navegar(view, exId); }

function render() {
  if (!P || $("#app").classList.contains("hidden")) return;
  $$("#tabstrip .tab").forEach((b) => b.classList.toggle("active", b.dataset.view === S.view));
  document.title = `${ROTAS[S.view]?.nome || "Sistema"} | Garbosa System`;
  S.exportar = null;
  const views = { calendario: viewCalendario, excursoes: viewExcursoes, viajantes: viewViajantes, poltronas: viewPoltronas, viagens: viewViagens, usuarios: viewUsuarios, logs: viewLogs };
  (views[S.view] || viewCalendario)();
  const bx = $("#btnXlsx"), bp = $("#btnPdf");
  if (bx) bx.onclick = () => exportar("xlsx", bx);
  if (bp) bp.onclick = () => exportar("pdf", bp);
}
function toolbar(titulo, icone, botoes = "", exp = true) {
  const e = exp ? `<span class="tool-sep"></span>${tbBtn("btnXlsx", "fa-file-excel", "XLSX", "tool-xlsx")}${tbBtn("btnPdf", "fa-file-pdf", "PDF", "tool-pdf")}` : "";
  return `<div class="panel-head"><h2><i class="fa-solid ${icone}"></i> ${titulo}</h2><div class="toolbar">${botoes}${e}</div></div>`;
}
const tbBtn = (id, icone, rotulo, cls = "") => `<button class="tool ${cls}" id="${id}"><i class="fa-solid ${icone}"></i><span>${rotulo}</span></button>`;

async function exportar(formato, botao) {
  const ex = S.exportar;
  if (!ex) return toast("Não há dados nesta página para exportar.", "erro");
  botao.disabled = true;
  const original = botao.innerHTML;
  botao.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Gerando</span>`;
  try {
    if (formato === "xlsx") await baixarXLSX(ex.titulo, ex.sheets);
    else if (ex.pdf) await ex.pdf();
    else await baixarPDF(ex.titulo, ex.sub, ex.sheets);
  } catch (e) { falha(e); }
  botao.disabled = false;
  botao.innerHTML = original;
}

/* =========================================================
   CÁLCULOS DE EXCURSÃO
========================================================= */
const veiculosDe = (ex) => Object.entries(ex?.veiculos || {}).sort((a, b) => (a[1].ordem || 0) - (b[1].ordem || 0));
const precoPoltrona = (v) => (num(v.valorTransporte) + num(v.valorIngressos)) / veic(v.tipo).div;
const capacidadeEx = (ex) => veiculosDe(ex).reduce((s, [, v]) => s + veic(v.tipo).cap, 0);
const viajantesEx = (exId) => ordenar(S.viajantes[exId], "nome");
const ocupantes = (exId) => viajantesEx(exId).filter(([, p]) => !p.colo);
function poltronaDe(exId, pid) {
  for (const [vk, seats] of Object.entries(S.poltronas[exId] || {})) {
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
const tituloEx = (e) => `${e.destino} — ${fData(e.dataSaida)}`;

/* =========================================================
   CALENDÁRIO
========================================================= */
function eventos() {
  const ev = [];
  Object.entries(S.viagens).forEach(([id, v]) => ev.push({
    tipo: "viagem", id, ini: v.dataSaida, fim: v.dataRetorno || v.dataSaida, hora: v.horaSaida,
    titulo: `${veic(v.tipoVeiculo).nome.replace(" lugares", "")} · ${v.destino || "Viagem"}`
  }));
  if (podeAgencia()) Object.entries(S.excursoes).forEach(([id, e]) => ev.push({
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
    cells += `<div class="day ${d.getMonth() !== mes ? "fora" : ""} ${iso === hoje() ? "hoje" : ""}"><span class="dnum">${d.getDate()}</span>${chips}${mais}</div>`;
  }
  const proximas = evs.filter((e) => e.fim >= hoje()).slice(0, 8);
  const novo = [];
  if (podeAgencia()) novo.push(tbBtn("calNovaEx", "fa-plus", "Nova excursão", "tool-accent"));
  if (podeTransp()) novo.push(tbBtn("calNovaVg", "fa-plus", "Nova viagem", "tool-accent"));
  ws.innerHTML = `
  <section class="panel">
    ${toolbar("Calendário de viagens", "fa-calendar-days",
      tbBtn("calPrev", "fa-chevron-left", "Anterior") + tbBtn("calHoje", "fa-calendar-day", "Hoje") + tbBtn("calNext", "fa-chevron-right", "Próximo") + novo.join(""))}
    <div class="cal-layout">
      <div class="cal">
        <div class="cal-title">${MESES[mes]} de ${ano}</div>
        <div class="cal-grid cal-head">${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => `<div>${d}</div>`).join("")}</div>
        <div class="cal-grid">${cells}</div>
        <div class="legenda">
          <span><i class="dot dot-viagem"></i> Veículo agendado</span>
          ${podeAgencia() ? `<span><i class="dot dot-excursao"></i> Excursão da agência</span>` : ""}
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

  // exportação: tudo que toca o mês exibido
  const iniMes = isoDe(new Date(ano, mes, 1)), fimMes = isoDe(new Date(ano, mes + 1, 0));
  const doMes = evs.filter((e) => e.ini <= fimMes && e.fim >= iniMes);
  S.exportar = {
    titulo: `Calendário ${MESES[mes]} ${ano}`, sub: `${P.empresa} · ${doMes.length} viagem(ns) no mês`,
    sheets: [{ nome: "Calendário", colunas: ["Tipo", "Saída", "Hora", "Retorno", "Hora", "Destino", "Veículo", "Motorista", "Transportadora", "Agência"],
      linhas: doMes.map((e) => {
        if (e.tipo === "viagem") { const v = S.viagens[e.id]; return ["Veículo agendado", fData(v.dataSaida), v.horaSaida || "", fData(v.dataRetorno), v.horaRetorno || "", v.destino || "", veic(v.tipoVeiculo).nome + (v.veiculo ? ` (${v.veiculo})` : ""), v.motorista || "", v.transportadoraNome || "", v.agenciaNome || ""]; }
        const x = S.excursoes[e.id];
        return ["Excursão", fData(x.dataSaida), x.horaSaida || "", fData(x.dataRetorno), x.horaRetorno || "", x.destino, veiculosDe(x).map(([, v]) => veic(v.tipo).nome).join(" + "), "", "", nomeAgencia(x._owner)];
      }) }]
  };
}

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
    if (podeTransp()) corpo += `<div class="calc-box mini">
        ${linha("Chofer", brl(v.valorChofer))}${linha("Diesel", brl(v.valorDiesel))}${linha("Gastos adicionais", brl(v.gastosAdicionais))}
        ${linha("Custo total", brl(v.custoTotal))}${linha(`Margem (${num(v.margem)}%)`, brl(v.valorLucro))}</div>`;
    const botoes = [{ html: "Fechar", acao: fecharModal }];
    if (podeTransp()) botoes.push({ html: `<i class="fa-solid fa-pen"></i> Editar`, classe: podeAgencia() ? "btn-light" : "btn-primary", acao: () => formViagem(id) });
    if (podeAgencia()) botoes.push({ html: `<i class="fa-solid fa-plus"></i> Criar excursão com este veículo`, classe: "btn-primary", acao: () => formExcursao(null, id) });
    abrirModal("Detalhes do veículo agendado", corpo, botoes);
  } else {
    const e = S.excursoes[id];
    if (!e) return;
    const cap = capacidadeEx(e), occ = ocupantes(id).length, total = viajantesEx(id).length;
    abrirModal("Detalhes da excursão", `
      <div class="det-head"><i class="fa-solid fa-route"></i><div><strong>${esc(e.destino)}</strong><small>${fData(e.dataSaida)}${e.dataRetorno && e.dataRetorno !== e.dataSaida ? " a " + fData(e.dataRetorno) : ""}</small></div></div>
      <div class="dl">
        ${ehAdmin() ? linha("Agência", esc(nomeAgencia(e._owner))) : ""}
        ${linha("Saída", `${fData(e.dataSaida)} às ${esc(e.horaSaida || "—")}`)}
        ${linha("Retorno", `${fData(e.dataRetorno)} às ${esc(e.horaRetorno || "—")}`)}
        ${linha("Local de saída", esc(e.localSaida || "—"))}
        ${linha("Viajantes", `${total} cadastrados (${occ} ocupam poltrona) / ${cap} lugares`)}
      </div>
      <h4 class="sub">Veículos</h4>
      ${veiculosDe(e).map(([, v], i) => `<div class="veic-card"><i class="fa-solid ${veic(v.tipo).icone}"></i>
        <div><strong>Veículo ${i + 1}: ${esc(veic(v.tipo).nome)}</strong><small>Transporte ${brl(v.valorTransporte)} · Ingressos ${brl(v.valorIngressos)}</small></div>
        <span class="preco">${brl(precoPoltrona(v))}<small>/poltrona</small></span></div>`).join("")}`,
      [{ html: "Fechar", acao: fecharModal },
       { html: `<i class="fa-solid fa-users"></i> Viajantes`, acao: () => { fecharModal(); irPara("viajantes", id); } },
       { html: `<i class="fa-solid fa-couch"></i> Poltronas`, classe: "btn-primary", acao: () => { fecharModal(); irPara("poltronas", id); } }]);
  }
}

/* =========================================================
   EXCURSÕES
========================================================= */
const opcoesVeiculo = (sel) => Object.entries(VEICULOS).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v.nome}</option>`).join("");

function viewExcursoes() {
  const lista = ordenar(S.excursoes, "dataSaida").reverse();
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar(ehAdmin() ? "Excursões de todas as agências" : "Excursões da agência", "fa-route", tbBtn("btnNovaEx", "fa-plus", "Cadastrar excursão", "tool-accent"))}
    <div class="regra"><i class="fa-solid fa-calculator"></i> Valor por poltrona = (valor do transporte + ingressos) ÷ poltronas de rateio:
      ${Object.values(VEICULOS).map((v) => `<span>${v.nome.replace(" lugares", "")}: ÷${v.div}</span>`).join("")}</div>
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr>${ehAdmin() ? "<th>Agência</th>" : ""}<th>Destino</th><th>Saída</th><th>Retorno</th><th>Veículos</th><th>Ocupação</th><th>Valor/poltrona</th><th></th></tr></thead>
      <tbody>${lista.map(([id, e]) => {
        const vs = veiculosDe(e), cap = capacidadeEx(e), occ = ocupantes(id).length;
        return `<tr>
          ${ehAdmin() ? `<td>${esc(nomeAgencia(e._owner))}</td>` : ""}
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
    const id = b.dataset.id, own = dono(id);
    if (b.dataset.a === "via") irPara("viajantes", id);
    if (b.dataset.a === "pol") irPara("poltronas", id);
    if (b.dataset.a === "edit") formExcursao(id);
    if (b.dataset.a === "del") confirmar(`Excluir a excursão <strong>${esc(S.excursoes[id].destino)}</strong> com todos os viajantes e o mapa de poltronas?`, async () => {
      await update(ref(db), { [`excursoes/${own}/${id}`]: null, [`viajantes/${own}/${id}`]: null, [`poltronas/${own}/${id}`]: null });
      if (S.exSel === id) S.exSel = null;
      toast("Excursão excluída");
    });
  }));
  const linhas = [];
  lista.forEach(([id, e]) => veiculosDe(e).forEach(([, v], i) => linhas.push([
    ...(ehAdmin() ? [nomeAgencia(e._owner)] : []), e.destino, `${fData(e.dataSaida)} ${e.horaSaida || ""}`, `${fData(e.dataRetorno)} ${e.horaRetorno || ""}`,
    `${i + 1}. ${veic(v.tipo).nome}`, brl(v.valorTransporte), brl(v.valorIngressos), `÷${veic(v.tipo).div}`, brl(precoPoltrona(v)), `${ocupantes(id).length}/${capacidadeEx(e)}`])));
  S.exportar = { titulo: "Excursões", sub: `${P.empresa} · ${lista.length} excursão(ões)`,
    sheets: [{ nome: "Excursões", colunas: [...(ehAdmin() ? ["Agência"] : []), "Destino", "Saída", "Retorno", "Veículo", "Transporte", "Ingressos", "Rateio", "Valor/poltrona", "Ocupação"], linhas }] };
}

function opcoesViagens(sel, agUid) {
  const vs = ordenar(S.viagens, "dataSaida").filter(([, v]) => !agUid || !ehAdmin() || v.agenciaUid === agUid || v.agenciaUid == null);
  return `<option value="">— Não vincular —</option>` + vs.map(([id, v]) =>
    `<option value="${id}" ${id === sel ? "selected" : ""}>${fData(v.dataSaida)} · ${esc(veic(v.tipoVeiculo).nome)} · ${esc(v.destino || "")} · ${esc(v.transportadoraNome || "")} (${brl(v.valorFinal)})</option>`).join("");
}
function opcoesAgenciaDona(sel) {
  const ags = ordenar(S.agencias, "nome");
  return `<option value="${U.uid}" ${sel === U.uid ? "selected" : ""}>${esc(P.empresa)} (administrador)</option>` +
    ags.map(([uid, a]) => `<option value="${uid}" ${uid === sel ? "selected" : ""}>${esc(a.nome)}</option>`).join("");
}

function formExcursao(id = null, viagemId = null) {
  const e = id ? S.excursoes[id] : {};
  const [vk, v0] = id ? (veiculosDe(e)[0] || [null, {}]) : [null, {}];
  const vinc = viagemId || v0.viagemId || "";
  const vgPre = viagemId ? S.viagens[viagemId] : null;
  const ownerPadrao = id ? e._owner : (vgPre?.agenciaUid && S.agencias[vgPre.agenciaUid] ? vgPre.agenciaUid : U.uid);
  abrirModal(id ? "Editar excursão" : "Cadastrar excursão", `
    <form id="fEx" class="form-grid">
      ${ehAdmin() ? `<label class="span2">Agência responsável<select name="owner" id="exOwner" ${id ? "disabled" : ""}>${opcoesAgenciaDona(ownerPadrao)}</select></label>` : ""}
      <label class="span2">Destino / nome da excursão<input name="destino" required value="${esc(e.destino)}" placeholder="Ex.: Aldeia das Águas"></label>
      <label>Data de saída<input type="date" name="dataSaida" required value="${esc(e.dataSaida)}"></label>
      <label>Horário de saída<input type="time" name="horaSaida" value="${esc(e.horaSaida)}"></label>
      <label>Data de retorno<input type="date" name="dataRetorno" value="${esc(e.dataRetorno)}"></label>
      <label>Horário de retorno<input type="time" name="horaRetorno" value="${esc(e.horaRetorno)}"></label>
      <label class="span2">Local de saída<input name="localSaida" value="${esc(e.localSaida)}" placeholder="Ex.: Rodoviária de São João Nepomuceno"></label>
      <div class="section-label span2"><i class="fa-solid fa-bus"></i> ${id ? "Veículo principal" : "Veículo"}</div>
      <label class="span2">Vincular a um veículo agendado pela transportadora (opcional)<select name="viagemId" id="exViagem">${opcoesViagens(vinc, ownerPadrao)}</select></label>
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
  if ($("#exOwner") && !id) $("#exOwner").addEventListener("change", () => { $("#exViagem").innerHTML = opcoesViagens("", $("#exOwner").value); });
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
      const own = dono(id), k = vk || "v" + Date.now();
      await update(ref(db, `excursoes/${own}/${id}`), { ...info, atualizadoEm: Date.now(), [`veiculos/${k}`]: { ...veiculo, ordem: S.excursoes[id].veiculos?.[k]?.ordem ?? 0 } });
      toast("Excursão atualizada");
    } else {
      const own = ehAdmin() ? (d.owner || U.uid) : U.uid;
      const novo = push(ref(db, `excursoes/${own}`));
      await set(novo, { ...info, criadoEm: Date.now(), veiculos: { ["v" + Date.now()]: { ...veiculo, ordem: 0 } } });
      S.exSel = novo.key;
      if (ehAdmin()) registrarLog("admin", `Criou excursão ${info.destino} para ${nomeAgencia(own)}`);
      toast("Excursão cadastrada");
    }
    fecharModal();
  } catch (e) { falha(e); }
}

function formVeiculoExtra(exId) {
  const ex = S.excursoes[exId], own = dono(exId);
  const faltam = ocupantes(exId).length - capacidadeEx(ex);
  abrirModal("Inserir mais um veículo", `
    ${faltam > 0 ? `<div class="alerta" style="margin:0 0 14px"><i class="fa-solid fa-triangle-exclamation"></i> Faltam <strong>${faltam}</strong> lugares para acomodar todos os viajantes.</div>` : ""}
    <form id="fVx" class="form-grid">
      <label class="span2">Vincular a um veículo agendado (opcional)<select name="viagemId" id="vxViagem">${opcoesViagens("", own)}</select></label>
      <label>Tipo de veículo<select name="tipo" id="vxTipo">${opcoesVeiculo(faltam > 0 && faltam <= 15 ? "van15" : "onibus46")}</select></label>
      <label>Valor do transporte (R$)<input type="number" step="0.01" min="0" name="valorTransporte" id="vxTransp" required></label>
      <label class="span2">Ingressos — valor total (R$)<input type="number" step="0.01" min="0" name="valorIngressos" value="0"></label>
      <div class="calc-box span2" id="vxCalc"></div>
    </form>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-plus"></i> Inserir veículo`, classe: "btn-primary", acao: async () => {
      const f = $("#fVx");
      if (!f.reportValidity()) return;
      const d = lerForm(f), k = "v" + Date.now();
      try {
        await set(ref(db, `excursoes/${own}/${exId}/veiculos/${k}`), { tipo: d.tipo, valorTransporte: num(d.valorTransporte), valorIngressos: num(d.valorIngressos), viagemId: d.viagemId || null, ordem: veiculosDe(ex).length });
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
    <select id="exPicker">${lista.map(([id, e]) => `<option value="${id}" ${id === S.exSel ? "selected" : ""}>${fData(e.dataSaida)} — ${esc(e.destino)}${ehAdmin() ? ` (${esc(nomeAgencia(e._owner))})` : ""}</option>`).join("")}</select></label>`;
}
function ligarSeletor() {
  const p = $("#exPicker");
  if (p) p.onchange = () => { S.exSel = p.value; S.veicSel = null; S.passSel = null; navegar(S.view, p.value); };
}
function semExcursao(titulo, icone) {
  $("#workspace").innerHTML = `<section class="panel">${toolbar(titulo, icone, tbBtn("btnNovaEx", "fa-plus", "Cadastrar excursão", "tool-accent"), false)}
    <div class="empty"><i class="fa-solid ${icone}"></i><p>Cadastre uma excursão primeiro.</p></div></section>`;
  $("#btnNovaEx").onclick = () => formExcursao();
}
function linhasPassageiros(exId) {
  return viajantesEx(exId).map(([pid, p], i) => [i + 1, p.nome, DOCS[p.docTipo] || p.docTipo, p.docNumero, p.telefone, p.idade, p.colo ? "Sim" : "Não", p.colo ? "—" : rotuloPoltrona(exId, pid)]);
}
const COLS_PASS = ["#", "Nome completo", "Documento", "Número", "Telefone", "Idade", "Colo", "Poltrona"];

/* =========================================================
   VIAJANTES
========================================================= */
function viewViajantes() {
  const sel = seletorExcursao();
  if (!sel) return semExcursao("Viajantes", "fa-users");
  const exId = S.exSel, ex = S.excursoes[exId], own = dono(exId);
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
  $("#btnIrPolt").onclick = () => irPara("poltronas", exId);
  $$("[data-a]").forEach((b) => b.addEventListener("click", () => {
    const pid = b.dataset.id, p = S.viajantes[exId][pid];
    if (b.dataset.a === "edit") formViajante(exId, pid);
    if (b.dataset.a === "del") confirmar(`Excluir o viajante <strong>${esc(p.nome)}</strong>?`, async () => {
      const upd = { [`viajantes/${own}/${exId}/${pid}`]: null };
      const pos = poltronaDe(exId, pid);
      if (pos) upd[`poltronas/${own}/${exId}/${pos.vk}/${pos.n}`] = null;
      await update(ref(db), upd);
      toast("Viajante excluído");
    });
  }));
  S.exportar = { titulo: `Viajantes ${ex.destino} ${fData(ex.dataSaida)}`, sub: `${tituloEx(ex)} · ${lista.length} viajante(s) · ${occ}/${cap} poltronas`,
    sheets: [{ nome: "Viajantes", colunas: COLS_PASS, linhas: linhasPassageiros(exId) }] };
}

function formViajante(exId, pid = null) {
  const own = dono(exId);
  const p = pid ? S.viajantes[exId][pid] : {};
  const salvar = async (continuar) => {
    const f = $("#fPass");
    if (!f.reportValidity()) return;
    const d = lerForm(f);
    const dados = { nome: d.nome, docTipo: d.docTipo, docNumero: d.docNumero, telefone: d.telefone, idade: parseInt(d.idade, 10) || 0, colo: !!d.colo };
    try {
      if (pid) await update(ref(db, `viajantes/${own}/${exId}/${pid}`), dados);
      else await set(push(ref(db, `viajantes/${own}/${exId}`)), { ...dados, criadoEm: Date.now() });
      if (dados.colo && pid) { const pos = poltronaDe(exId, pid); if (pos) await remove(ref(db, `poltronas/${own}/${exId}/${pos.vk}/${pos.n}`)); }
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
      <label>Telefone<input name="telefone" data-mask="tel" inputmode="tel" required value="${esc(p.telefone)}" placeholder="(32) 99999-9999"></label>
      <label>Idade<input type="number" min="0" max="120" name="idade" id="pIdade" required value="${esc(p.idade)}"></label>
      <label class="check span2"><input type="checkbox" name="colo" id="pColo" ${p.colo ? "checked" : ""}> Criança de colo (não ocupa poltrona)</label>
    </form>`, botoes);
  const sug = () => { if (!pid && $("#pIdade").value !== "" && num($("#pIdade").value) <= 5 && $("#pDoc").value === "CERTIDAO") $("#pColo").checked = true; };
  $("#pIdade").addEventListener("change", sug);
  $("#pDoc").addEventListener("change", sug);
  $("#fPass").addEventListener("submit", (e) => { e.preventDefault(); salvar(!pid); });
}

/* =========================================================
   POLTRONAS
========================================================= */
function layoutAssentos(cap) {
  const linhas = [];
  if (cap <= 20) {               // vans: 2 + 1
    for (let n = 1; n <= cap; n += 3) linhas.push({ esq: [n, n + 1].filter((x) => x <= cap), dir: [n + 2].filter((x) => x <= cap) });
  } else {                        // ônibus: 2 + 2 (padrão 1 2 | 4 3)
    const cheias = Math.floor(cap / 4), resto = cap % 4;
    for (let r = 0; r < cheias; r++) { const b = r * 4 + 1; linhas.push({ esq: [b, b + 1], dir: [b + 3, b + 2] }); }
    if (resto) { const b = cheias * 4 + 1; const s = Array.from({ length: resto }, (_, i) => b + i); linhas.push({ esq: s.slice(0, 2), dir: s.slice(2).reverse(), wc: resto <= 2 }); }
  }
  return linhas;
}
function nomesPorPoltrona(exId, vk) {
  const nomes = {};
  Object.entries((S.poltronas[exId] || {})[vk] || {}).forEach(([n, pid]) => { const p = S.viajantes[exId]?.[pid]; if (p) nomes[n] = p.nome; });
  return nomes;
}

function viewPoltronas() {
  const sel = seletorExcursao();
  if (!sel) return semExcursao("Poltronas", "fa-couch");
  const exId = S.exSel, ex = S.excursoes[exId], own = dono(exId);
  const vs = veiculosDe(ex);
  if (!S.veicSel || !ex.veiculos?.[S.veicSel]) S.veicSel = vs[0]?.[0];
  const vk = S.veicSel, v = ex.veiculos[vk], vv = veic(v.tipo);
  const mapa = (S.poltronas[exId] || {})[vk] || {};
  const pessoas = ocupantes(exId);
  const nomes = Object.fromEntries(pessoas.map(([id, p]) => [id, p.nome]));
  const totalSent = pessoas.filter(([id]) => poltronaDe(exId, id)).length;
  const filtrados = pessoas.filter(([, p]) => p.nome.toLowerCase().includes(S.busca.toLowerCase()));

  const seat = (n) => {
    const pid = mapa[n], nome = pid ? (nomes[pid] || "?") : "";
    return `<div class="seat ${pid ? "ocupada" : ""} ${pid && pid === S.passSel ? "sel" : ""}" data-seat="${n}" ${pid ? `draggable="true" data-pid="${pid}"` : ""} title="${esc(nome || "Poltrona " + n + " livre")}">
      <span class="sn">${n}</span>${pid ? `<span class="snome">${esc(nome.split(" ")[0])}</span><button class="seat-x" data-x="${n}" title="Liberar">×</button>` : ""}</div>`;
  };
  const linhas = layoutAssentos(vv.cap);
  const bus = `
    <div class="bus ${vv.cap <= 20 ? "bus-van" : ""}">
      <div class="bus-front"><span class="driver"><i class="fa-solid fa-dharmachakra"></i> Motorista</span><span class="door">Porta</span></div>
      <div class="bus-body">
        ${linhas.map((l) => `<div class="bus-row">
          <div class="side">${l.esq.map(seat).join("")}</div>
          <div class="aisle"></div>
          <div class="side">${l.dir.map(seat).join("")}${l.wc ? `<div class="wc">WC</div>` : ""}</div>
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
        <div class="map-wrap">${bus}<ol class="numerada">${numerada}</ol></div>
      </div>
    </div>
  </section>`;

  ligarSeletor();
  const base = `poltronas/${own}/${exId}`;
  const salvarPos = async (pid, n) => {
    const upd = {};
    const ant = poltronaDe(exId, pid);
    if (ant) upd[`${ant.vk}/${ant.n}`] = null;
    upd[`${vk}/${n}`] = pid;
    S.passSel = null;
    try { await update(ref(db, base), upd); } catch (e) { falha(e); }
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
  $$(".seat-x").forEach((b) => b.addEventListener("click", async () => { try { await remove(ref(db, `${base}/${vk}/${b.dataset.x}`)); } catch (e) { falha(e); } }));
  $("#btnAuto").onclick = async () => {
    const livres = pessoas.filter(([id]) => !poltronaDe(exId, id)).map(([id]) => id);
    if (!livres.length) return toast("Todos os viajantes já estão posicionados.");
    const upd = {};
    for (const [k, x] of vs) {
      const m = (S.poltronas[exId] || {})[k] || {};
      for (let n = 1; n <= veic(x.tipo).cap && livres.length; n++) if (!m[n]) upd[`${k}/${n}`] = livres.shift();
    }
    try { await update(ref(db, base), upd); toast(livres.length ? `${livres.length} viajante(s) ficaram sem lugar` : "Viajantes distribuídos", livres.length ? "erro" : "ok"); } catch (e) { falha(e); }
  };
  $("#btnLimpar").onclick = () => confirmar("Liberar todas as poltronas deste veículo?", async () => { await remove(ref(db, `${base}/${vk}`)); toast("Veículo liberado"); }, "Limpar");
  $("#btnVeicExtra").onclick = () => formVeiculoExtra(exId);
  if ($("#btnVeicExtra2")) $("#btnVeicExtra2").onclick = () => formVeiculoExtra(exId);
  $("#btnPrint").onclick = () => window.print();
  if ($("#btnDelVeic")) $("#btnDelVeic").onclick = () => confirmar(`Remover o veículo <strong>${esc(vv.nome)}</strong> desta excursão? As poltronas dele serão liberadas.`, async () => {
    await update(ref(db), { [`excursoes/${own}/${exId}/veiculos/${vk}`]: null, [`${base}/${vk}`]: null });
    S.veicSel = null; toast("Veículo removido");
  }, "Remover");

  // exportação: uma aba/página por veículo + lista completa
  const titulo = `Poltronas ${ex.destino} ${fData(ex.dataSaida)}`;
  const sub = `${tituloEx(ex)}${ex.horaSaida ? " às " + ex.horaSaida : ""}${ex.localSaida ? " · Saída: " + ex.localSaida : ""}`;
  const porVeiculo = vs.map(([k, x], i) => {
    const nm = nomesPorPoltrona(exId, k), cap = veic(x.tipo).cap;
    return { k, i, x, nm, cap };
  });
  S.exportar = {
    titulo, sub,
    sheets: [
      ...porVeiculo.map(({ i, x, nm, cap, k }) => ({ nome: `Veículo ${i + 1} ${veic(x.tipo).nome.replace(" lugares", "")}`, colunas: ["Poltrona", "Nome", "Documento", "Telefone", "Idade"],
        linhas: Array.from({ length: cap }, (_, j) => { const n = j + 1, pid = ((S.poltronas[exId] || {})[k] || {})[n], p = pid ? S.viajantes[exId]?.[pid] : null;
          return [n, p?.nome || "", p ? `${DOCS[p.docTipo] || p.docTipo} ${p.docNumero}` : "", p?.telefone || "", p?.idade ?? ""]; }) })),
      { nome: "Todos os viajantes", colunas: COLS_PASS, linhas: linhasPassageiros(exId) }
    ],
    pdf: () => baixarPDFPoltronas(titulo, sub,
      porVeiculo.map(({ i, x, nm, cap }) => ({ titulo: `${vs.length > 1 ? `Veículo ${i + 1} · ` : ""}${veic(x.tipo).nome}`, cap, layout: layoutAssentos(cap), nomes: nm })),
      { colunas: COLS_PASS, linhas: linhasPassageiros(exId) })
  };
}

/* =========================================================
   VIAGENS (transporte / fretamento)
========================================================= */
function viewViagens() {
  const lista = ordenar(S.viagens, "dataSaida").reverse();
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar(ehAdmin() ? "Viagens de todas as transportadoras" : "Viagens / orçamentos", "fa-bus", tbBtn("btnNovaVg", "fa-plus", "Cadastrar viagem", "tool-accent"))}
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Saída</th><th>Retorno</th><th>Destino</th>${ehAdmin() ? "<th>Transportadora</th>" : ""}<th>Agência</th><th>Veículo</th><th>Motorista</th><th>Valor final</th><th></th></tr></thead>
      <tbody>${lista.map(([id, v]) => `<tr>
        <td>${fData(v.dataSaida)} ${esc(v.horaSaida || "")}</td>
        <td>${fData(v.dataRetorno)} ${esc(v.horaRetorno || "")}</td>
        <td><strong>${esc(v.destino)}</strong></td>
        ${ehAdmin() ? `<td>${esc(v.transportadoraNome || "—")}</td>` : ""}
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
  S.exportar = { titulo: "Viagens e orçamentos", sub: `${P.empresa} · ${lista.length} viagem(ns)`,
    sheets: [{ nome: "Viagens", colunas: ["Saída", "Retorno", "Destino", "Transportadora", "Agência", "Veículo", "Placa", "Motorista", "Chofer", "Diesel", "Gastos", "Custo", "Margem %", "Lucro", "Valor final"],
      linhas: lista.map(([, v]) => [`${fData(v.dataSaida)} ${v.horaSaida || ""}`, `${fData(v.dataRetorno)} ${v.horaRetorno || ""}`, v.destino, v.transportadoraNome || "", v.agenciaNome || "", veic(v.tipoVeiculo).nome, v.veiculo || "", v.motorista,
        brl(v.valorChofer), brl(v.valorDiesel), brl(v.gastosAdicionais), brl(v.custoTotal), num(v.margem), brl(v.valorLucro), brl(v.valorFinal)]) }] };
}

function transportadoras() {
  return ordenar(Object.fromEntries(Object.entries(S.usuarios).filter(([, u]) => u.tipo === "transportadora")), "empresa");
}

function formViagem(id = null, valores = null) {
  const v = id ? S.viagens[id] : {};
  const ags = ordenar(S.agencias, "nome");
  const agSel = v.agenciaUid || (id && v.agenciaNome ? "__outra" : "");
  const trSel = v.transportadoraUid || U.uid;
  abrirModal(id ? "Editar viagem" : "Cadastrar viagem", `
    <form id="fVg" class="form-grid">
      ${ehAdmin() ? `<label class="span2">Empresa de transporte<select name="transportadoraUid" required>
        <option value="${U.uid}" ${trSel === U.uid ? "selected" : ""}>${esc(P.empresa)} (administrador)</option>
        ${transportadoras().map(([uid, t]) => `<option value="${uid}" ${uid === trSel ? "selected" : ""}>${esc(t.empresa)}</option>`).join("")}</select></label>` : ""}
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
  const f = $("#fVg");
  if (valores) Object.entries(valores).forEach(([k, val]) => { if (f.elements[k]) f.elements[k].value = val; });
  const togg = () => $("#vgAgNomeWrap").classList.toggle("hidden", $("#vgAg").value !== "__outra");
  $("#vgAg").addEventListener("change", togg);
  togg();
  f.addEventListener("submit", (e) => { e.preventDefault(); calcularViagem(id); });
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
  const trUid = ehAdmin() ? (d.transportadoraUid || U.uid) : U.uid;
  const trNome = trUid === U.uid ? P.empresa : (S.usuarios[trUid]?.empresa || "");
  const dados = {
    transportadoraUid: trUid, transportadoraNome: trNome,
    agenciaUid: outra ? null : d.agenciaUid,
    agenciaNome: outra ? d.agenciaNomeLivre : (S.agencias[d.agenciaUid]?.nome || ""),
    destino: d.destino, tipoVeiculo: d.tipoVeiculo, capacidade: veic(d.tipoVeiculo).cap, veiculo: d.veiculo, motorista: d.motorista,
    dataSaida: d.dataSaida, horaSaida: d.horaSaida, dataRetorno: d.dataRetorno, horaRetorno: d.horaRetorno,
    valorChofer: chofer, valorDiesel: diesel, gastosAdicionais: gastos, margem,
    custoTotal: custo, valorLucro: Math.round(lucro * 100) / 100, valorFinal: final
  };
  abrirModal("Confirmar valor da viagem", `
    <div class="det-head"><i class="fa-solid ${veic(d.tipoVeiculo).icone}"></i><div><strong>${esc(dados.destino)}</strong><small>${esc(veic(d.tipoVeiculo).nome)} · ${fData(d.dataSaida)} a ${fData(d.dataRetorno)}</small></div></div>
    <div class="calc-box">
      ${linha("Chofer", brl(chofer))}${linha("Diesel", brl(diesel))}${linha("Gastos adicionais", brl(gastos))}
      ${linha("Custo total", brl(custo))}${linha(`Margem de lucro (${margem}%)`, brl(lucro))}
      <div class="calc-total big"><span>Valor final</span><strong>${brl(final)}</strong></div>
    </div>
    <p class="muted" style="margin-top:10px">Ao confirmar, o veículo aparece no calendário${dados.agenciaUid ? ` da transportadora e da agência <strong>${esc(dados.agenciaNome)}</strong>` : ""}.</p>`, [
    { html: `<i class="fa-solid fa-arrow-left"></i> Voltar e editar`, acao: () => formViagem(id, d) },
    { html: `<i class="fa-solid fa-check"></i> OK, salvar`, classe: "btn-primary", acao: async () => {
      try {
        if (id) await set(ref(db, `viagens/${id}`), { ...dados, criadoEm: S.viagens[id]?.criadoEm || Date.now(), atualizadoEm: Date.now() });
        else await set(push(ref(db, "viagens")), { ...dados, criadoEm: Date.now() });
        if (ehAdmin()) registrarLog("admin", `${id ? "Editou" : "Criou"} viagem ${dados.destino} (${trNome})`);
        fecharModal();
        toast("Viagem salva e agendada no calendário");
        const [a, m] = d.dataSaida.split("-");
        S.mes = new Date(+a, +m - 1, 1);
        irPara("calendario");
      } catch (e) { falha(e); }
    } }
  ]);
}

/* =========================================================
   ADMIN · USUÁRIOS
========================================================= */
function viewUsuarios() {
  const termo = S.buscaUsuarios.toLowerCase();
  const todos = ordenar(S.usuarios, "nome");
  const lista = todos.filter(([, u]) => !termo || [u.nome, u.empresa, u.email, u.documento, u.whatsapp].join(" ").toLowerCase().includes(termo));
  const cont = (t) => todos.filter(([, u]) => u.tipo === t).length;
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Controle de usuários", "fa-user-gear", tbBtn("btnNovoUser", "fa-user-plus", "Adicionar usuário", "tool-accent") + tbBtn("btnIrLogs", "fa-clipboard-list", "Logs"))}
    <div class="subbar">
      <input type="search" id="buscaUser" class="search" placeholder="Buscar por nome, empresa, e-mail, CPF/CNPJ..." value="${esc(S.buscaUsuarios)}">
      <div class="stats-mini">
        <span><strong>${cont("agencia")}</strong> agências</span>
        <span><strong>${cont("transportadora")}</strong> transportadoras</span>
        <span><strong>${todos.filter(([, u]) => u.ativo === false).length}</strong> desativados</span>
      </div>
    </div>
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Nome</th><th>Agência / empresa</th><th>CPF/CNPJ</th><th>WhatsApp</th><th>E-mail</th><th>Tipo</th><th>Status</th><th>Cadastro</th><th></th></tr></thead>
      <tbody>${lista.map(([uid, u]) => {
        const souEu = uid === U.uid;
        const wpp = soDig(u.whatsapp);
        return `<tr class="${u.ativo === false ? "inativo" : ""}">
        <td><strong>${esc(u.nome)}</strong>${souEu ? ` <span class="pill">você</span>` : ""}</td>
        <td>${esc(u.empresa)}</td>
        <td>${esc(u.documento || "—")}</td>
        <td>${wpp ? `<a class="wpp" href="https://wa.me/55${wpp}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${esc(u.whatsapp)}</a>` : "—"}</td>
        <td>${esc(u.email)}</td>
        <td><span class="pill tipo-${u.tipo}">${esc(TIPO_CURTO[u.tipo] || u.tipo)}</span></td>
        <td>${u.ativo === false ? `<span class="pill pill-red">Desativado</span>` : `<span class="pill pill-green">Ativo</span>`}</td>
        <td>${u.criadoEm ? new Date(u.criadoEm).toLocaleDateString("pt-BR") : "—"}</td>
        <td class="acoes">
          <button class="ic" title="Editar" data-a="edit" data-id="${uid}"><i class="fa-solid fa-pen"></i></button>
          <button class="ic" title="Enviar redefinição de senha" data-a="senha" data-id="${uid}"><i class="fa-solid fa-key"></i></button>
          ${souEu ? "" : `<button class="ic" title="${u.ativo === false ? "Reativar" : "Desativar"}" data-a="ativo" data-id="${uid}"><i class="fa-solid ${u.ativo === false ? "fa-toggle-off" : "fa-toggle-on"}"></i></button>
          <button class="ic danger" title="Remover" data-a="del" data-id="${uid}"><i class="fa-solid fa-trash"></i></button>`}
        </td></tr>`;
      }).join("")}</tbody></table></div>`
    : `<div class="empty"><i class="fa-solid fa-users"></i><p>Nenhum usuário encontrado.</p></div>`}
  </section>`;
  $("#btnNovoUser").onclick = () => formUsuario();
  $("#btnIrLogs").onclick = () => irPara("logs");
  $("#buscaUser").addEventListener("input", (e) => {
    S.buscaUsuarios = e.target.value; const pos = e.target.selectionStart; render();
    const b = $("#buscaUser"); b.focus(); b.setSelectionRange(pos, pos);
  });
  $$("[data-a]").forEach((b) => b.addEventListener("click", () => {
    const uid = b.dataset.id, u = S.usuarios[uid];
    if (b.dataset.a === "edit") formUsuario(uid);
    if (b.dataset.a === "senha") sendPasswordResetEmail(auth, u.email).then(() => { toast("Link de redefinição enviado para " + u.email); registrarLog("admin", `Enviou redefinição de senha para ${u.email}`); }).catch(falha);
    if (b.dataset.a === "ativo") {
      const ativo = u.ativo === false;
      update(ref(db, `usuarios/${uid}`), { ativo }).then(() => { toast(ativo ? "Usuário reativado" : "Usuário desativado"); registrarLog("admin", `${ativo ? "Reativou" : "Desativou"} ${u.email}`); }).catch(falha);
    }
    if (b.dataset.a === "del") confirmar(`Remover o usuário <strong>${esc(u.nome)}</strong> (${esc(u.email)})? Ele perde o acesso ao sistema imediatamente.
      ${u.tipo === "agencia" ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="apagarDados"> Apagar também as excursões, viajantes e poltronas desta agência</label>` : ""}
      ${u.tipo === "transportadora" ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="apagarDados"> Apagar também as viagens desta transportadora</label>` : ""}`, async (extra) => {
      const upd = { [`usuarios/${uid}`]: null, [`agencias/${uid}`]: null };
      if (extra.apagarDados && u.tipo === "agencia") Object.assign(upd, { [`excursoes/${uid}`]: null, [`viajantes/${uid}`]: null, [`poltronas/${uid}`]: null });
      if (extra.apagarDados && u.tipo === "transportadora") Object.entries(S.viagens).forEach(([id, v]) => { if (v.transportadoraUid === uid) upd[`viagens/${id}`] = null; });
      await update(ref(db), upd);
      registrarLog("admin", `Removeu usuário ${u.email}${extra.apagarDados ? " e seus dados" : ""}`);
      toast("Usuário removido");
    }, "Remover");
  }));
  S.exportar = { titulo: "Usuários do sistema", sub: `${lista.length} usuário(s)`,
    sheets: [{ nome: "Usuários", colunas: ["Nome completo", "Agência / empresa", "CPF/CNPJ", "WhatsApp", "E-mail", "Tipo", "Status", "Cadastro"],
      linhas: lista.map(([, u]) => [u.nome, u.empresa, u.documento || "", u.whatsapp || "", u.email, TIPOS[u.tipo] || u.tipo, u.ativo === false ? "Desativado" : "Ativo", u.criadoEm ? new Date(u.criadoEm).toLocaleDateString("pt-BR") : ""]) }] };
}

function formUsuario(uid = null) {
  const u = uid ? S.usuarios[uid] : { tipo: "agencia", ativo: true };
  const admin = u.tipo === "admin";
  abrirModal(uid ? "Editar usuário" : "Adicionar usuário", `
    <form id="fUser" class="form-grid">
      <label class="span2">Nome completo<input name="nome" required value="${esc(u.nome)}"></label>
      <label class="span2">Agência / empresa<input name="empresa" required value="${esc(u.empresa)}"></label>
      <label>CPF ou CNPJ<input name="documento" data-mask="doc" inputmode="numeric" ${admin ? "" : "required"} value="${esc(u.documento)}"></label>
      <label>WhatsApp<input name="whatsapp" data-mask="tel" inputmode="tel" ${admin ? "" : "required"} value="${esc(u.whatsapp)}"></label>
      <label class="${uid ? "span2" : ""}">E-mail<input type="email" name="email" required value="${esc(u.email)}" ${uid ? "readonly title='O e-mail de login não pode ser alterado por aqui'" : ""}></label>
      ${uid ? "" : `<label>Senha inicial<input type="text" name="senha" required minlength="6" placeholder="mínimo 6 caracteres" autocomplete="off"></label>`}
      ${admin ? "" : `<fieldset class="tipo-conta span2"><legend>Tipo de conta</legend>
        <label class="tipo-op"><input type="radio" name="tipo" value="agencia" ${u.tipo === "agencia" ? "checked" : ""}><span><i class="fa-solid fa-route"></i> Agência de turismo</span></label>
        <label class="tipo-op"><input type="radio" name="tipo" value="transportadora" ${u.tipo === "transportadora" ? "checked" : ""}><span><i class="fa-solid fa-bus"></i> Transporte / Fretamento</span></label>
      </fieldset>`}
      ${admin || uid === U.uid ? "" : `<label class="check span2"><input type="checkbox" name="ativo" ${u.ativo !== false ? "checked" : ""}> Usuário ativo (pode acessar o sistema)</label>`}
    </form>`, [
    { html: "Cancelar", acao: fecharModal },
    { html: `<i class="fa-solid fa-floppy-disk"></i> Salvar`, classe: "btn-primary", acao: () => salvarUsuario(uid) }
  ], true);
  $("#fUser").addEventListener("submit", (e) => { e.preventDefault(); salvarUsuario(uid); });
}

async function salvarUsuario(uid) {
  const f = $("#fUser");
  if (!f.reportValidity()) return;
  const d = lerForm(f);
  const atual = uid ? S.usuarios[uid] : null;
  const tipo = atual?.tipo === "admin" ? "admin" : (d.tipo || "agencia");
  if (tipo !== "admin" && !docValido(d.documento)) return toast("CPF ou CNPJ inválido.", "erro");
  if (tipo !== "admin" && soDig(d.whatsapp).length < 10) return toast("WhatsApp inválido.", "erro");
  d.documento = d.documento ? mascaraDoc(d.documento) : "";
  d.whatsapp = d.whatsapp ? mascaraTel(d.whatsapp) : "";
  try {
    if (uid) {
      const upd = {
        [`usuarios/${uid}/nome`]: d.nome, [`usuarios/${uid}/empresa`]: d.empresa, [`usuarios/${uid}/documento`]: d.documento,
        [`usuarios/${uid}/whatsapp`]: d.whatsapp, [`usuarios/${uid}/tipo`]: tipo,
        [`agencias/${uid}`]: tipo === "agencia" ? { nome: d.empresa } : null
      };
      if ("ativo" in d) upd[`usuarios/${uid}/ativo`] = d.ativo;
      await update(ref(db), upd);
      registrarLog("admin", `Editou usuário ${atual.email}`);
      toast("Usuário atualizado");
    } else {
      const email = d.email.toLowerCase();
      if (email === ADMIN_EMAIL) return toast("Este e-mail é reservado ao administrador.", "erro");
      const authSec = authSecundario();
      const cred = await createUserWithEmailAndPassword(authSec, email, d.senha);
      await updateProfile(cred.user, { displayName: d.nome }).catch(() => {});
      await signOut(authSec);
      const perfil = { nome: d.nome, empresa: d.empresa, documento: d.documento, whatsapp: d.whatsapp, email, tipo, ativo: d.ativo !== false, criadoEm: Date.now(), criadoPor: U.uid };
      await update(ref(db), { [`usuarios/${cred.user.uid}`]: perfil, ...(tipo === "agencia" ? { [`agencias/${cred.user.uid}`]: { nome: d.empresa } } : {}) });
      registrarLog("admin", `Criou usuário ${email} (${TIPOS[tipo]})`);
      toast("Usuário criado");
    }
    fecharModal();
  } catch (e) { falha(e); }
}

/* =========================================================
   ADMIN · LOGS DE ACESSO
========================================================= */
async function carregarLogs() {
  try {
    const snap = await get(query(ref(db, "logs"), orderByChild("em"), limitToLast(5000)));
    S.logs = Object.entries(snap.val() || {}).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.em || 0) - (a.em || 0));
  } catch (e) { S.logs = []; falha(e); }
  render();
}

function viewLogs() {
  const F = S.filtroLogs;
  const todos = S.logs || [];
  const usuariosLog = [...new Map(todos.map((l) => [l.uid, l.nome || l.email])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const lista = todos.filter((l) => {
    const dia = l.em ? isoDe(new Date(l.em)) : "";
    return (!F.de || dia >= F.de) && (!F.ate || dia <= F.ate) && (!F.uid || l.uid === F.uid) && (!F.acao || l.acao === F.acao);
  });
  $("#workspace").innerHTML = `
  <section class="panel">
    ${toolbar("Relatório de logs de acesso", "fa-clipboard-list", tbBtn("btnRecarregar", "fa-rotate", "Atualizar") + tbBtn("btnIrUsers", "fa-user-gear", "Usuários"))}
    <form class="filtros" id="fLogs">
      <label>De<input type="date" name="de" value="${esc(F.de)}"></label>
      <label>Até<input type="date" name="ate" value="${esc(F.ate)}"></label>
      <label>Usuário<select name="uid"><option value="">Todos</option>${usuariosLog.map(([uid, n]) => `<option value="${esc(uid)}" ${uid === F.uid ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label>Ação<select name="acao"><option value="">Todas</option>${Object.entries(ACOES).map(([k, n]) => `<option value="${k}" ${k === F.acao ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <button type="button" class="btn btn-light btn-sm" id="btnLimparFiltros"><i class="fa-solid fa-filter-circle-xmark"></i> Limpar</button>
      <span class="muted filtro-total">${S.logs === null ? "Carregando..." : `${lista.length} de ${todos.length} registro(s)`}</span>
    </form>
    ${lista.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Data / hora</th><th>Usuário</th><th>E-mail</th><th>Tipo</th><th>Ação</th><th>Detalhe</th><th>Navegador</th></tr></thead>
      <tbody>${lista.slice(0, 500).map((l) => `<tr>
        <td>${fDataHora(l.em)}</td><td><strong>${esc(l.nome)}</strong></td><td>${esc(l.email)}</td>
        <td><span class="pill tipo-${esc(l.tipo)}">${esc(TIPO_CURTO[l.tipo] || l.tipo)}</span></td>
        <td><span class="pill acao-${esc(l.acao)}">${esc(ACOES[l.acao] || l.acao)}</span></td>
        <td>${esc(l.detalhe || "")}</td><td><small class="muted">${esc(navegadorCurto(l.navegador))}</small></td></tr>`).join("")}</tbody></table>
      ${lista.length > 500 ? `<p class="muted" style="padding:10px 0">Mostrando os 500 mais recentes na tela. A exportação inclui todos os ${lista.length}.</p>` : ""}</div>`
    : `<div class="empty"><i class="fa-solid fa-clipboard-list"></i><p>${S.logs === null ? "Carregando logs..." : "Nenhum registro no período."}</p></div>`}
  </section>`;
  $("#fLogs").addEventListener("change", () => { S.filtroLogs = { ...S.filtroLogs, ...lerForm($("#fLogs")) }; render(); });
  $("#btnLimparFiltros").onclick = () => { S.filtroLogs = { de: "", ate: "", uid: "", acao: "" }; render(); };
  $("#btnRecarregar").onclick = () => { S.logs = null; render(); carregarLogs(); };
  $("#btnIrUsers").onclick = () => irPara("usuarios");
  const periodo = F.de || F.ate ? `${F.de ? fData(F.de) : "início"} a ${F.ate ? fData(F.ate) : "hoje"}` : "todo o período";
  S.exportar = { titulo: "Logs de acesso", sub: `${periodo} · ${lista.length} registro(s)`,
    sheets: [{ nome: "Logs", colunas: ["Data/hora", "Usuário", "E-mail", "Tipo", "Ação", "Detalhe", "Navegador"],
      linhas: lista.map((l) => [fDataHora(l.em), l.nome || "", l.email || "", TIPO_CURTO[l.tipo] || l.tipo || "", ACOES[l.acao] || l.acao, l.detalhe || "", navegadorCurto(l.navegador)]) }] };
}

function navegadorCurto(ua = "") {
  const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [nav, so].filter(Boolean).join(" · ") || ua.slice(0, 40);
}
