// Página pública: cadastro de viajantes pelo link da excursão
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, push, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase.js";

const db = getDatabase(initializeApp(firebaseConfig, "inscricao"));
const $ = (s) => document.querySelector(s);
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fData = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const soDig = (v) => String(v || "").replace(/\D/g, "");
function mascaraTel(v) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const inicio = Date.now();
const mostrar = (id) => setTimeout(() => { $("#loading").classList.add("hidden"); $(id).classList.remove("hidden"); }, Math.max(0, 1500 - (Date.now() - inicio)));
const msg = (t, tipo = "erro") => { const m = $("#iMsg"); m.textContent = t; m.className = "login-msg " + tipo; };

const exId = new URLSearchParams(location.search).get("e");
let EX = null;

async function carregar() {
  if (!exId || !/^[\w-]{6,40}$/.test(exId)) { $("#fechTitulo").textContent = "Link inválido"; $("#fechTexto").textContent = "Confira o link enviado pela agência."; return mostrar("#inscFechada"); }
  try {
    const snap = await get(ref(db, `inscricoes/${exId}`));
    if (!snap.exists()) { $("#fechTitulo").textContent = "Excursão não encontrada"; $("#fechTexto").textContent = "Este link não existe mais. Fale com a agência."; return mostrar("#inscFechada"); }
    EX = snap.val();
  } catch (e) { console.error(e); $("#fechTitulo").textContent = "Não foi possível carregar"; $("#fechTexto").textContent = "Verifique sua internet e tente novamente."; return mostrar("#inscFechada"); }
  if (!EX.ativa) return mostrar("#inscFechada");
  document.title = `Inscrição: ${EX.destino} | ${EX.agencia || "Garbosa Turismo"}`;
  $("#iAgencia").textContent = EX.agencia || "Excursão";
  $("#iDestino").textContent = EX.destino;
  $("#iSaida").textContent = `${fData(EX.dataSaida)}${EX.horaSaida ? " às " + EX.horaSaida : ""}`;
  $("#iRetorno").textContent = `${fData(EX.dataRetorno)}${EX.horaRetorno ? " às " + EX.horaRetorno : ""}`;
  $("#iLocal").textContent = EX.localSaida || "A combinar";
  $("#iValor").textContent = brl(EX.valor);
  $("#iColo").textContent = EX.valorColo > 0 ? `Criança de colo: ${brl(EX.valorColo)}` : "Criança de colo não paga";
  atualizarTotal();
  mostrar("#insc");
}

function atualizarTotal() {
  const colo = $("#iColoChk").checked;
  $("#iTotal").textContent = brl(colo ? EX.valorColo : EX.valor);
}

$("#iTel").addEventListener("input", (e) => { e.target.value = mascaraTel(e.target.value); });
$("#iColoChk").addEventListener("change", atualizarTotal);
const sugerirColo = () => { if ($("#iIdade").value !== "" && Number($("#iIdade").value) <= 5 && $("#iDocTipo").value === "CERTIDAO") { $("#iColoChk").checked = true; atualizarTotal(); } };
$("#iIdade").addEventListener("change", sugerirColo);
$("#iDocTipo").addEventListener("change", sugerirColo);

$("#fInsc").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = $("#iNome").value.replace(/\s+/g, " ").trim();
  const docNumero = $("#iDocNum").value.trim();
  const telefone = $("#iTel").value.trim();
  const idade = $("#iIdade").value;
  if (nome.split(" ").length < 2) return msg("Informe o nome completo.");
  if (!docNumero) return msg("Informe o número do documento.");
  if (soDig(telefone).length < 10) return msg("Informe um WhatsApp válido com DDD.");
  if (idade === "") return msg("Informe a idade.");
  if (!$("#iLgpd").checked) return msg("É preciso autorizar o uso dos dados para concluir a inscrição.");
  const colo = $("#iColoChk").checked;
  const botao = $("#fInsc button[type=submit]");
  botao.disabled = true;
  msg("Enviando...", "info");
  try {
    const k = push(ref(db, `viajantes/${EX.owner}/${exId}`)).key;
    await set(ref(db, `viajantes/${EX.owner}/${exId}/${k}`), {
      nome: nome.slice(0, 120), docTipo: $("#iDocTipo").value, docNumero: docNumero.slice(0, 30), telefone, idade: parseInt(idade, 10) || 0,
      colo, valor: colo ? EX.valorColo : EX.valor, formaPagamento: $("#iForma").value || null, origem: "link", consentimentoLgpd: true, criadoEm: Date.now()
    });
    const upd = {};
    Object.keys(EX.notificar || {}).forEach((uid) => {
      const nk = push(ref(db, `notificacoes/${uid}`)).key;
      upd[`notificacoes/${uid}/${nk}`] = { tipo: "inscricao", titulo: "Nova inscrição pelo link", texto: `${nome} se inscreveu em ${EX.destino} (${fData(EX.dataSaida)}).`,
        link: `#/viajantes/${exId}`, exId, de: "publico", deNome: nome.slice(0, 120), lida: false, em: serverTimestamp() };
    });
    await update(ref(db), upd).catch((err) => console.warn("aviso", err));
    $("#fInsc").classList.add("hidden");
    $("#iOk").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    msg(/permission/i.test(err.message || err.code || "") ? "As inscrições desta excursão foram encerradas." : "Não foi possível enviar. Tente novamente.");
  }
  botao.disabled = false;
});

$("#btnOutra").addEventListener("click", () => {
  $("#fInsc").reset(); msg("", "");
  atualizarTotal();
  $("#iOk").classList.add("hidden");
  $("#fInsc").classList.remove("hidden");
  $("#iNome").focus();
});

carregar();
