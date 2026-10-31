// Conta do viajante: login (e-mail/senha ou Google), pré-cadastro e perfil.
// Usa um app do Firebase separado ("viajante"), então a sessão do viajante não se mistura com a da agência no sistema.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase.js?v=8";
import * as R from "./venda-regras.js?v=15";

const app = initializeApp(firebaseConfig, "viajante");
export const auth = getAuth(app);
const db = getDatabase(app);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.", "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.", "auth/invalid-email": "E-mail inválido.",
  "auth/email-already-in-use": "Este e-mail já tem conta. Use a aba Entrar.", "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.", "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/popup-closed-by-user": "", "auth/account-exists-with-different-credential": "Este e-mail já tem conta com senha. Entre com e-mail e senha."
};
const traduz = (e) => (e?.code in ERROS ? ERROS[e.code] : "Não foi possível entrar. Tente novamente.");

/** Chama fn(usuario|null) sempre que a sessão mudar */
export function aoMudarSessao(fn) {
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, fn);
}
export const sair = () => signOut(auth);
export const token = () => auth.currentUser?.getIdToken();

export async function lerPerfil() {
  const u = auth.currentUser;
  if (!u) return null;
  return (await get(ref(db, `clientes/${u.uid}`))).val();
}
export async function salvarPerfil(dados) {
  const u = auth.currentUser;
  const atual = await lerPerfil().catch(() => null);
  await update(ref(db, `clientes/${u.uid}`), { ...dados, ...(atual ? {} : { criadoEm: Date.now() }), atualizadoEm: Date.now() });
}

/** fetch para /api com o token da conta */
export async function api(caminho, corpo) {
  const t = await token();
  const r = await fetch(caminho, {
    method: corpo ? "POST" : "GET",
    headers: { ...(corpo ? { "Content-Type": "application/json" } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  let dados = {};
  try { dados = await r.json(); } catch { /* vazio */ }
  if (!r.ok) { const e = new Error(dados.erro || "Não foi possível falar com o servidor."); e.dados = dados; e.status = r.status; throw e; }
  return dados;
}

/* ---------- tela de entrar / criar conta ---------- */
export function telaAcesso(el, { titulo = "Entre na sua conta", texto = "" } = {}) {
  el.innerHTML = `
    <div class="cv-acesso">
      <h2>${esc(titulo)}</h2>
      ${texto ? `<p class="cp-dica">${texto}</p>` : ""}
      <div class="cv-abas" role="tablist">
        <button type="button" class="cv-aba ativo" data-aba="entrar" role="tab">Já tenho conta</button>
        <button type="button" class="cv-aba" data-aba="criar" role="tab">Primeira vez? Criar conta</button>
      </div>
      <form class="login-form" data-form novalidate>
        <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
        <label>Senha<input type="password" name="senha" autocomplete="current-password" required minlength="6"></label>
        <label class="cv-so-criar hidden">Repita a senha<input type="password" name="senha2" autocomplete="new-password"></label>
        <button type="submit" class="btn btn-primary btn-block" data-enviar>Entrar</button>
        <button type="button" class="link-btn cv-so-entrar" data-esqueci>Esqueci minha senha</button>
      </form>
      <div class="cv-ou"><span>ou</span></div>
      <button type="button" class="btn btn-light btn-block" data-google><i class="fa-brands fa-google"></i> Continuar com o Google</button>
      <p class="login-msg" data-msg role="alert"></p>
    </div>`;
  let aba = "entrar";
  const msg = (t, tipo = "erro") => { const m = $("[data-msg]", el); if (m) { m.textContent = t; m.className = "login-msg " + tipo; } };
  $$(".cv-aba", el).forEach((b) => b.addEventListener("click", () => {
    aba = b.dataset.aba;
    $$(".cv-aba", el).forEach((x) => x.classList.toggle("ativo", x === b));
    $$(".cv-so-criar", el).forEach((x) => x.classList.toggle("hidden", aba !== "criar"));
    $$(".cv-so-entrar", el).forEach((x) => x.classList.toggle("hidden", aba !== "entrar"));
    $("[data-enviar]", el).textContent = aba === "criar" ? "Criar minha conta" : "Entrar";
    $("[name=senha]", el).autocomplete = aba === "criar" ? "new-password" : "current-password";
    msg("", "");
  }));
  $("[data-form]", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(), senha = f.senha.value;
    if (!R.emailValido(email)) return msg("Informe um e-mail válido.");
    if (senha.length < 6) return msg("A senha precisa ter pelo menos 6 caracteres.");
    if (aba === "criar" && senha !== f.senha2.value) return msg("As senhas não conferem.");
    const btn = $("[data-enviar]", el);
    btn.disabled = true;
    msg(aba === "criar" ? "Criando sua conta…" : "Entrando…", "info");
    try {
      if (aba === "criar") await createUserWithEmailAndPassword(auth, email, senha);
      else await signInWithEmailAndPassword(auth, email, senha);
    } catch (err) { msg(traduz(err)); }
    btn.disabled = false;
  });
  $("[data-esqueci]", el).addEventListener("click", async () => {
    const email = $("[name=email]", el).value.trim();
    if (!R.emailValido(email)) return msg("Digite seu e-mail acima e clique de novo em “Esqueci minha senha”.");
    try { await sendPasswordResetEmail(auth, email); msg(`Enviamos um link para criar uma nova senha em ${email}.`, "ok"); }
    catch (err) { msg(traduz(err)); }
  });
  $("[data-google]", el).addEventListener("click", async () => {
    const prov = new GoogleAuthProvider();
    prov.setCustomParameters({ prompt: "select_account" });
    try { await signInWithPopup(auth, prov); }
    catch (err) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(err.code)) {
        try { await signInWithRedirect(auth, prov); } catch (e2) { msg(traduz(e2)); }
      } else msg(traduz(err));
    }
  });
}

/* ---------- formulário da pessoa (pré-cadastro, "meus dados" e dependentes salvos) ---------- */
const vazio = () => ({ nome: "", cpf: "", rg: "", nascimento: "", email: "", whatsapp: "", endereco: { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" } });

export function camposPessoa(p, { hoje, contato = true, cpfFixo = false }) {
  const c = (chave, rotulo, attrs = "", cls = "") => {
    const [g, k] = chave.includes(".") ? chave.split(".") : [null, chave];
    const v = g ? p[g]?.[k] : p[chave];
    return `<label class="${cls}">${rotulo}<input data-c="${chave}" value="${esc(chave === "cpf" ? R.mascaraCpf(v) : v)}" ${attrs}></label>`;
  };
  return `<div class="form-grid">
    ${c("nome", "Nome completo", 'maxlength="120" autocomplete="name"', "span2")}
    ${c("cpf", "CPF", `inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00" ${cpfFixo ? "readonly title='O CPF da conta não pode ser alterado'" : ""}`)}
    ${c("rg", "RG", 'maxlength="30"')}
    ${c("nascimento", "Data de nascimento", `type="date" max="${hoje}"`)}
    ${contato ? `${c("whatsapp", "WhatsApp", 'type="tel" inputmode="tel" data-mask="tel" placeholder="(32) 99999-9999"')}
    ${c("email", "E-mail", 'type="email" autocomplete="email"', "span2")}
    ${c("endereco.cep", "CEP", 'inputmode="numeric" data-mask="cep" placeholder="00000-000"')}
    ${c("endereco.numero", "Número", 'maxlength="20"')}
    ${c("endereco.rua", "Rua / Avenida", 'maxlength="120"', "span2")}
    ${c("endereco.complemento", "Complemento", 'maxlength="60" placeholder="(opcional)"')}
    ${c("endereco.bairro", "Bairro", 'maxlength="80"')}
    ${c("endereco.cidade", "Cidade", 'maxlength="80"')}
    ${c("endereco.uf", "UF", 'maxlength="2" placeholder="MG"')}` : ""}
  </div>`;
}

/** Liga máscaras, CEP automático e grava cada campo no objeto p */
export function ligarCampos(el, p, aoMudar = () => {}) {
  $$("[data-c]", el).forEach((inp) => {
    inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
      const c = inp.dataset.c;
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (inp.dataset.mask === "cpf") v = inp.value = R.mascaraCpf(v);
      if (inp.dataset.mask === "tel") v = inp.value = R.mascaraTel(v);
      if (inp.dataset.mask === "cep") v = inp.value = R.mascaraCep(v);
      if (c === "endereco.uf") v = inp.value = String(v).toUpperCase().replace(/[^A-Z]/g, "");
      if (c.includes(".")) { const [g, k] = c.split("."); p[g] = p[g] || {}; p[g][k] = v; } else p[c] = v;
      aoMudar(c, v);
    });
    if (inp.dataset.c === "endereco.cep") inp.addEventListener("change", () => buscarCep(el, p));
  });
}

export async function buscarCep(el, p) {
  const cep = R.soDig(p.endereco?.cep);
  if (cep.length !== 8) return;
  try {
    const d = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
    if (d.erro) return;
    Object.entries({ rua: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf }).forEach(([k, v]) => {
      if (!v || p.endereco[k]) return;
      p.endereco[k] = v;
      const i = $(`[data-c="endereco.${k}"]`, el);
      if (i) i.value = v;
    });
    $(`[data-c="endereco.numero"]`, el)?.focus();
  } catch { /* a pessoa digita */ }
}

/** Dados do perfil no formato gravado no banco */
export function paraPerfil(p) {
  const e = p.endereco || {};
  return {
    nome: String(p.nome || "").replace(/\s+/g, " ").trim(), cpf: R.soDig(p.cpf), rg: String(p.rg || "").trim(), nascimento: p.nascimento || "",
    email: String(p.email || "").trim().toLowerCase(), whatsapp: R.mascaraTel(p.whatsapp),
    endereco: { cep: R.mascaraCep(e.cep), rua: (e.rua || "").trim(), numero: (e.numero || "").trim(), complemento: (e.complemento || "").trim(),
      bairro: (e.bairro || "").trim(), cidade: (e.cidade || "").trim(), uf: (e.uf || "").toUpperCase() }
  };
}

/** Formulário de pré-cadastro / meus dados. aoSalvar(perfil) é chamado depois de gravar. */
export function formPerfil(el, perfil, { hoje, titulo, texto = "", botao = "Salvar e continuar", aoSalvar, aoCancelar }) {
  const p = { ...vazio(), ...(perfil || {}), endereco: { ...vazio().endereco, ...(perfil?.endereco || {}) } };
  if (!p.email && auth.currentUser?.email) p.email = auth.currentUser.email;
  if (!p.nome && auth.currentUser?.displayName) p.nome = auth.currentUser.displayName;
  const cpfFixo = !!perfil?.cpf;
  el.innerHTML = `<div class="cv-perfil">
    ${titulo ? `<h2>${esc(titulo)}</h2>` : ""}${texto ? `<p class="cp-dica">${texto}</p>` : ""}
    <fieldset class="cp-pessoa"><legend><i class="fa-solid fa-id-card"></i> Seus dados</legend>${camposPessoa(p, { hoje, cpfFixo })}</fieldset>
    <p class="login-msg" data-msg role="alert"></p>
    <div class="cp-nav">${aoCancelar ? `<button type="button" class="btn btn-light" data-cancelar>Cancelar</button>` : "<span></span>"}
      <button type="button" class="btn btn-primary" data-salvar><i class="fa-solid fa-floppy-disk"></i> ${esc(botao)}</button></div>
  </div>`;
  ligarCampos(el, p, () => $(".cp-pessoa", el).classList.remove("erro"));
  const msg = (t, tipo = "erro") => { const m = $("[data-msg]", el); if (m) { m.textContent = t; m.className = "login-msg " + tipo; } };
  $("[data-cancelar]", el)?.addEventListener("click", aoCancelar);
  $("[data-salvar]", el).addEventListener("click", async () => {
    const erro = R.erroPessoa(p, hoje, true);
    if (erro) { $(".cp-pessoa", el).classList.add("erro"); return msg(erro.replace(" do titular", "")); }
    const btn = $("[data-salvar]", el);
    btn.disabled = true;
    msg("Salvando…", "info");
    try {
      const dados = paraPerfil(p);
      await salvarPerfil(dados);
      msg("", "");
      await aoSalvar?.({ ...(perfil || {}), ...dados });
    } catch (e) { console.error(e); msg("Não foi possível salvar. Verifique sua internet e tente de novo."); }
    btn.disabled = false;
  });
}
