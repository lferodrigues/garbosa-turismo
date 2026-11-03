// Vitrine do link de escolha de poltrona: fotos do local, resumo da viagem, fotos dos veículos e botão Escolher poltrona.
import * as R from "./venda-regras.js?v=23";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const quando = (d, h) => `${R.fData(d)}${h ? ` às ${h}` : ""}`;
const imgDoSite = (f, cls, alt) => `<img class="${cls}" src="../${esc(f.caminho)}" alt="${esc(alt)}" loading="lazy" data-raw="${esc(f.raw || "")}">`;

function ligarRaw(el) {
  el.querySelectorAll("img[data-raw]").forEach((img) => {
    img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true });
  });
}

/** Carrossel: fotos do local enviadas pela agência; sem elas, o folder da excursão */
function desenharFotos(box, fotos, classe, destino) {
  let i = 0;
  const pintar = () => {
    const f = fotos[i];
    box.innerHTML = !f ? `<div class="vt-sem-foto"><i class="fa-regular fa-image"></i></div>` : `
      ${imgDoSite(f, classe, `Foto de ${destino}`)}
      ${fotos.length > 1 ? `<button type="button" class="vt-seta esq" aria-label="Foto anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" class="vt-seta dir" aria-label="Próxima foto"><i class="fa-solid fa-chevron-right"></i></button>` : ""}`;
    ligarRaw(box);
    box.querySelector(".esq")?.addEventListener("click", () => { i = (i - 1 + fotos.length) % fotos.length; pintar(); });
    box.querySelector(".dir")?.addEventListener("click", () => { i = (i + 1) % fotos.length; pintar(); });
  };
  pintar();
}

export function montarVitrine(el, EX, aoComprar) {
  const preco = EX.valorCent > 0 ? R.brl(EX.valorCent) : "";
  const selo = EX.vagas?.selo, livres = EX.vagas?.livres;
  const saidas = [[EX.localSaida, EX.horaSaida], ...(EX.saidas || []).map((s) => [s.local, s.hora])].filter(([l]) => l);
  const botao = `<button type="button" class="btn btn-primary btn-block vt-comprar">Escolher poltrona</button>`;
  el.innerHTML = `
    <div class="vt-barra">
      <div class="vt-barra-nome"><strong>${esc(EX.destino)}</strong><small><i class="fa-solid fa-location-dot"></i> ${esc(EX.localSaida || "Local a combinar")}</small></div>
      <div class="vt-barra-datas">
        <span><small>Ida</small><strong>${esc(quando(EX.dataSaida, EX.horaSaida))}</strong></span>
        <span><small>Volta</small><strong>${esc(quando(EX.dataRetorno, EX.horaRetorno))}</strong></span>
      </div>
      <div class="vt-barra-compra">${preco ? `<span><small>Por pessoa</small><strong>${preco}</strong></span>` : ""}${botao}</div>
    </div>
    <article class="vt-card">
      <h2 class="vt-faixa">Excursão selecionada</h2>
      <div class="vt-corpo">
        <div class="vt-fotos" id="vtFotos"></div>
        <div class="vt-info">
          <h1>${esc(EX.destino)}</h1>
          ${EX.agencia ? `<p class="vt-agencia">${esc(EX.agencia)}</p>` : ""}
          ${selo ? `<span class="vt-selo ${esc(selo)}">${selo === "esgotado" ? "Esgotado" : `Restam apenas ${livres}`}</span>` : ""}
          ${EX.descricao ? `<p class="vt-desc">${esc(EX.descricao)}</p>` : ""}
          ${saidas.length ? `<ul class="vt-saidas">${saidas.map(([l, h]) => `<li><i class="fa-solid fa-location-dot"></i> ${esc(l)}${h ? `, às ${esc(h)}` : ""}</li>`).join("")}</ul>` : ""}
        </div>
        <aside class="vt-preco">
          ${preco ? `<small>Preço por pessoa</small><strong>${preco}</strong>` : ""}
          ${botao}
        </aside>
      </div>
    </article>
    ${EX.fotosVeiculos?.length ? `<section class="vt-veiculos">
      <h2>Veículos</h2>
      <div class="vt-veic-grid">${EX.fotosVeiculos.map((f) => imgDoSite(f, "vt-veic", "Foto do veículo")).join("")}</div>
      <p class="vt-nota"><i class="fa-solid fa-circle-info"></i> Os veículos podem mudar de acordo com a disponibilidade ou quantidade de passageiros.</p>
    </section>` : ""}`;
  ligarRaw(el);
  el.querySelectorAll(".vt-comprar").forEach((b) => b.addEventListener("click", aoComprar));
  const box = el.querySelector("#vtFotos");
  if (EX.fotosLocal?.length) desenharFotos(box, EX.fotosLocal, "vt-foto", EX.destino);
  else desenharFotos(box, EX.folder?.caminho ? [EX.folder] : [], "vt-foto vt-foto-folder", EX.destino);
}
