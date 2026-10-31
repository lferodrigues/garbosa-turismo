// Página de obrigado: o Asaas traz o cliente para cá depois do Pix ou do cartão
// e daqui ele segue direto para o grupo do WhatsApp da excursão.
import * as R from "./venda-regras.js?v=16";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SEGUNDOS = 5;
const pedido = new URLSearchParams(location.search).get("p") || "";

function tela(html) { $("#ob").innerHTML = html; }

async function carregar() {
  let d;
  try {
    const r = await fetch(`/api/pedido-grupo?p=${encodeURIComponent(pedido)}`, { cache: "no-store" });
    d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || "Não foi possível carregar a sua compra.");
  } catch (e) {
    return tela(`<i class="fa-solid fa-circle-info"></i><h2>Pagamento enviado</h2><p>${esc(e.message)}</p>
      <a class="btn btn-primary btn-block" href="minha-conta.html"><i class="fa-solid fa-suitcase-rolling"></i> Ver minhas viagens</a>`);
  }
  const grupo = R.linkGrupoWhatsapp(d.grupo);
  tela(`<i class="fa-solid fa-circle-check" style="color:#1fa37a"></i>
    <h2>Obrigado${d.nome ? ", " + esc(d.nome) : ""}!</h2>
    <p>Recebemos o seu pagamento da excursão <strong>${esc(d.destino)}</strong>${d.dataSaida ? ` (${R.fData(d.dataSaida)})` : ""}. Pedido <strong>#${esc(d.codigo)}</strong>.</p>
    ${grupo ? `<p id="obConta">Você vai entrar no grupo do WhatsApp da excursão em <strong id="obSeg">${SEGUNDOS}</strong> segundos…</p>
      <a class="btn btn-block btn-zap" id="obGrupo" href="${esc(grupo)}"><i class="fa-brands fa-whatsapp"></i> Entrar no grupo agora</a>` : ""}
    <a class="btn btn-light btn-block" href="minha-conta.html" style="margin-top:10px"><i class="fa-solid fa-suitcase-rolling"></i> Ver minhas viagens</a>`);
  if (!grupo) return;
  let s = SEGUNDOS;
  const t = setInterval(() => {
    s--;
    if ($("#obSeg")) $("#obSeg").textContent = s;
    if (s <= 0) { clearInterval(t); $("#obConta").textContent = "Abrindo o grupo do WhatsApp…"; location.href = grupo; }
  }, 1000);
}
carregar();
