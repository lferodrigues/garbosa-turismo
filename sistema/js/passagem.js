// Página da passagem: aberta pelo link enviado no WhatsApp ou pelo QR Code. Quem é titular baixa todas de uma vez.
import * as R from "./venda-regras.js?v=28";
import { baixarPassagens } from "./exportar.js?v=11";

const QR = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const token = new URLSearchParams(location.search).get("t") || "";
const urlDe = (t) => `${location.origin}/sistema/passagem.html?t=${t}`;
let dados;

// sem o código a passagem continua abrindo: o bilhete e os dados valem do mesmo jeito
const carregarQR = () => new Promise((ok) => {
  if (window.qrcode) return ok();
  const s = document.createElement("script");
  s.src = QR; s.onload = ok; s.onerror = ok;
  document.head.appendChild(s);
});
function matriz(t) {
  if (!window.qrcode) return null;
  const q = window.qrcode(0, "M");
  q.addData(urlDe(t)); q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, l) => Array.from({ length: n }, (_, c) => q.isDark(l, c)));
}
function svgQR(t) {
  const m = matriz(t);
  if (!m) return "";
  const d = m.flatMap((linha, l) => linha.map((p, c) => (p ? `M${c} ${l}h1v1h-1z` : ""))).join("");
  return `<svg viewBox="0 0 ${m.length} ${m.length}" role="img" aria-label="Código de conferência"><path d="${d}"/></svg>`;
}

const campo = (r, v, cls = "") => `<div class="${cls}"><small>${r}</small><strong>${esc(v || "—")}</strong></div>`;
const quando = (data, hora) => `${R.fData(data)}${hora ? `, às ${hora}` : ""}`;
function bilhete(t, i) {
  const ex = dados.excursao;
  return `<article class="psg">
    <header><strong>${esc(dados.agencia.nome)}</strong><small>Comprovante de passagem</small></header>
    <div class="psg-campos">
      ${campo("Excursão", ex.destino, "span2")}
      ${campo("Local de embarque", t.origem, "span2")}
      ${campo("Saída", quando(ex.dataSaida, t.horaSaida))}
      ${campo("Retorno", quando(ex.dataRetorno, ex.horaRetorno))}
      ${campo("Poltrona", t.poltrona)}
      ${campo("Veículo", t.veiculo || "Único")}
      ${campo("Passageiro", t.nome, "span2")}
      ${campo("Documento", t.documento)}
      ${campo("Bilhete", t.codigo)}
    </div>
    <div class="psg-rodape">
      <div class="psg-valores">
        <span>Valor total <b>${R.brl(t.valorCent)}</b></span>
        <span>Valor pago <b>${R.brl(t.pagoCent)}</b></span>
        <span class="forte">Saldo a pagar <b>${R.brl(t.saldoCent)}</b></span>
        ${t.opcionais.length ? `<small>Opcionais: ${esc(t.opcionais.join(", "))}</small>` : ""}
      </div>
      <div class="psg-qr">${svgQR(t.token)}</div>
    </div>
    <button type="button" class="btn btn-light btn-block" data-baixar="${i}"><i class="fa-solid fa-file-arrow-down"></i> Baixar esta passagem</button>
  </article>`;
}

async function baixar(lista, arquivo, botao) {
  botao.disabled = true;
  try { await baixarPassagens(dados, lista, matriz, arquivo); }
  catch (e) { alert(e.message); }
  botao.disabled = false;
}

async function carregar() {
  const area = $("#psg");
  try {
    const r = await fetch(`/api/pedido-grupo?passagem=${encodeURIComponent(token)}`, { cache: "no-store" });
    dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || "Não foi possível abrir a passagem.");
    await carregarQR();
  } catch (e) {
    area.innerHTML = `<p class="psg-msg"><i class="fa-solid fa-circle-info"></i> ${esc(e.message)}</p>`;
    return;
  }
  const { passagens, pendentes, excursao: ex } = dados, varias = passagens.length > 1;
  area.innerHTML = `
    <h2>${varias ? `${passagens.length} passagens` : "Sua passagem"}</h2>
    <p class="muted">${esc(ex.destino)} · ${R.fData(ex.dataSaida)}</p>
    ${varias ? `<button type="button" class="btn btn-primary btn-block" id="baixarTodas"><i class="fa-solid fa-file-arrow-down"></i> Baixar todas (${passagens.length})</button>` : ""}
    ${pendentes.length ? `<div class="alerta amarelo">Aguardando pagamento: ${esc(pendentes.join(", "))}.</div>` : ""}
    ${ex.outrasSaidas.length ? `<p class="cp-nota">Outras saídas: ${esc(ex.outrasSaidas.join(" · "))}</p>` : ""}
    ${passagens.map(bilhete).join("")}
    <p class="cp-nota">Comprovante emitido pela agência. Não é documento fiscal. Apresente um documento com foto no embarque.</p>`;
  document.querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", () => {
    const t = passagens[+b.dataset.baixar];
    baixar([t], `passagem ${t.nome}`, b);
  }));
  $("#baixarTodas")?.addEventListener("click", (e) => baixar(passagens, `passagens ${ex.destino}`, e.currentTarget));
}
carregar();
