import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const msg = document.getElementById("loginMsg");
const formEntrar = document.getElementById("formEntrar");
const formCadastrar = document.getElementById("formCadastrar");
let cadastrando = false;

function mostrar(texto, tipo = "erro") {
  msg.textContent = texto;
  msg.className = "login-msg " + tipo;
}

const ERROS = {
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
const traduz = (e) => ERROS[e.code] || ("Erro: " + (e.message || e));

document.querySelectorAll(".login-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const cad = tab.dataset.tab === "cadastrar";
    formCadastrar.classList.toggle("hidden", !cad);
    formEntrar.classList.toggle("hidden", cad);
    mostrar("", "");
  });
});

onAuthStateChanged(auth, (user) => {
  if (user && !cadastrando) window.location.href = "app.html";
});

formEntrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  mostrar("Entrando...", "info");
  try {
    await signInWithEmailAndPassword(auth,
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginSenha").value);
  } catch (err) { mostrar(traduz(err)); }
});

formCadastrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = document.getElementById("cadTipo").value;
  const nome = document.getElementById("cadNome").value.trim();
  const empresa = document.getElementById("cadEmpresa").value.trim();
  const email = document.getElementById("cadEmail").value.trim();
  const senha = document.getElementById("cadSenha").value;
  mostrar("Criando conta...", "info");
  cadastrando = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    await updateProfile(cred.user, { displayName: nome });
    const uid = cred.user.uid;
    const dados = {
      [`usuarios/${uid}`]: { nome, empresa, tipo, email, criadoEm: Date.now() }
    };
    if (tipo === "agencia") dados[`agencias/${uid}`] = { nome: empresa };
    await update(ref(db), dados);
    window.location.href = "app.html";
  } catch (err) {
    cadastrando = false;
    mostrar(traduz(err));
  }
});

document.getElementById("btnEsqueci").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) return mostrar("Digite seu e-mail no campo acima e clique novamente.");
  try {
    await sendPasswordResetEmail(auth, email);
    mostrar("Enviamos um link de redefinição para " + email, "ok");
  } catch (err) { mostrar(traduz(err)); }
});
