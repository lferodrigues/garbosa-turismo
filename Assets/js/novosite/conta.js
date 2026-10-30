// Área do cliente no site: janela de login/cadastro (e-mail e senha ou Google).
// Depois de entrar, o cliente vai para a tela dele (sistema/minha-conta.html).
import { aoMudarSessao, telaAcesso } from "../../../sistema/js/conta-viajante.js?v=14";

const TELA_CLIENTE = "./sistema/minha-conta.html";
const link = document.getElementById("linkConta");
const modal = document.getElementById("gcModal");
const corpo = document.getElementById("gcCorpo");
let logado = false, abrindo = false;

function abrir() {
  abrindo = true;
  telaAcesso(corpo, { titulo: "Área do cliente",
    texto: "Entre para acompanhar suas viagens e parcelas. <strong>Primeira vez?</strong> Crie sua conta: depois é só completar o pré-cadastro." });
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => corpo.querySelector("input")?.focus(), 50);
}
function fechar() {
  abrindo = false;
  modal.hidden = true;
  document.body.style.overflow = "";
}

// "Área do cliente" no menu e os outros atalhos marcados com data-abrir-conta
[link, ...document.querySelectorAll("[data-abrir-conta]")].filter(Boolean).forEach((el) => el.addEventListener("click", (e) => {
  if (logado) return; // já entrou: segue o link para a tela do cliente
  e.preventDefault();
  document.querySelector(".navbar ul")?.classList.remove("active");
  abrir();
}));
modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest("[data-fechar]")) fechar(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) fechar(); });

aoMudarSessao((u) => {
  logado = !!u;
  if (link) link.innerHTML = u
    ? `<i class="fa-solid fa-circle-user"></i> Minha conta`
    : `<i class="fa-regular fa-circle-user"></i> Área do cliente`;
  if (u && abrindo) location.href = TELA_CLIENTE;
});
