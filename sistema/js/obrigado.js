// Página de obrigado: o Asaas traz o cliente para cá depois do Pix ou do cartão.
// Mostra as opções de baixar o comprovante e entrar no grupo oficial do WhatsApp da excursão (sem sair sozinha).
import * as R from "./venda-regras.js?v=16";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const baixar = d.boleto || d.fatura;
  tela(`<i class="fa-solid fa-circle-check" style="color:#1fa37a"></i>
    <h2>Obrigado${d.nome ? ", " + esc(d.nome) : ""}!</h2>
    <p>Recebemos o seu pagamento da excursão <strong>${esc(d.destino)}</strong>${d.dataSaida ? ` (${R.fData(d.dataSaida)})` : ""}. Pedido <strong>#${esc(d.codigo)}</strong>.</p>
    <div class="cp-fim-passos">
      ${baixar ? `<a class="btn btn-primary btn-block" href="${esc(baixar)}" target="_blank" rel="noopener"><i class="fa-solid fa-file-arrow-down"></i> Baixar o comprovante</a>` : ""}
      ${grupo ? `<a class="btn btn-block btn-zap" href="${esc(grupo)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Entrar no grupo oficial da excursão</a>` : ""}
      <a class="btn btn-light btn-block" href="minha-conta.html"><i class="fa-solid fa-suitcase-rolling"></i> Ver minhas viagens</a>
    </div>
    ${d.forma === "BOLETO" && d.parcelas > 1 ? `<p class="cp-nota" style="margin-top:12px"><i class="fa-brands fa-whatsapp"></i> As próximas parcelas chegam no seu WhatsApp 5 dias antes de cada vencimento.</p>` : ""}`);
}
carregar();
