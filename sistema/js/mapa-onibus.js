// Desenho do mapa de poltronas (HTML) a partir da planta de venda-regras.js (plantaVeiculo).
// Usado no sistema da agência, na compra online, na reserva e na escolha rápida de poltrona.
// seat(n) devolve o HTML de uma poltrona — cada tela decide a cor e o clique.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nota = (t) => `<div class="bus-nota">${esc(t)}</div>`;

function piso(p, seat, van) {
  const frente = p.frente.length
    ? `<div class="bus-front ${p.frente.length === 1 ? "so-um" : ""}">${p.frente.map((t, i) => `<span class="${i === 0 ? "driver" : "door"}">${i === 0 && /motorista/i.test(t) ? '<i class="fa-solid fa-dharmachakra"></i> ' : ""}${esc(t)}</span>`).join("")}</div>`
    : "";
  const linhas = p.linhas.map((l) => {
    const esq = l.notaEsq ? nota(l.notaEsq) : (l.esq || []).map(seat).join("");
    const dir = l.notaDir ? nota(l.notaDir)
      : (l.dir || []).map((n) => (l.largo ? `<div class="seat-largo">${seat(n)}</div>` : seat(n))).join("") + (l.wc ? `<div class="wc">WC</div>` : "");
    return `<div class="bus-row"><div class="side">${esq}</div><div class="aisle"></div><div class="side">${dir}</div></div>`;
  }).join("");
  return `<div class="bus ${van ? "bus-van" : ""} ${p.titulo ? "bus-piso" : ""} ${p.subtitulo ? "bus-leito" : ""}">
    ${p.titulo ? `<div class="bus-titulo"><i class="fa-solid fa-layer-group"></i> ${esc(p.titulo)}${p.subtitulo ? `<small><i class="fa-solid fa-bed"></i> ${esc(p.subtitulo)}</small>` : ""}</div>` : ""}
    ${frente}
    <div class="bus-body">${linhas}<div class="corredor-label">CORREDOR</div></div>
    ${p.fundo ? `<div class="bus-back">${esc(p.fundo)}</div>` : ""}
  </div>`;
}

/** planta = R.plantaVeiculo(tipo, cap); seat = (n) => html */
export function htmlOnibus(planta, seat, cap = 0) {
  const van = cap > 0 && cap <= 20;
  const pisos = planta.map((p) => piso(p, seat, van)).join("");
  return planta.length > 1 ? `<div class="bus-pisos">${pisos}</div>` : pisos;
}
