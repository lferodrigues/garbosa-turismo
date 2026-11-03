// Vitrine dos links de poltrona e de compra: fotos do local, resumo da viagem, fotos dos veículos e botão para seguir (escolher poltrona ou comprar).
import * as R from "./venda-regras.js?v=23";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const AVISO_VEICULOS = "Os veículos podem mudar de acordo com a disponibilidade ou quantidade de passageiros.";
export const CATEGORIAS_VEICULO = ["Executivo", "Double Decker (DD)", "Semi-leito"];
export const ITENS_VEICULO = [["wifi", "Wi-Fi", "fa-wifi"], ["ar", "Ar-condicionado", "fa-snowflake"], ["carregador", "Carregador", "fa-plug"], ["frigobar", "Frigobar", "fa-bottle-water"], ["banheiro", "Banheiro", "fa-restroom"]];
const quando = (d, h) => `${R.fData(d)}${h ? ` às ${h}` : ""}`;
const imgDoSite = (f, cls, alt) => `<img class="${cls}" src="../${esc(f.caminho)}" alt="${esc(alt)}" loading="lazy" data-raw="${esc(f.raw || "")}">`;

/** Dados que ficam ao lado da foto do veículo; mudam junto com a foto */
function htmlDadosVeiculo(d) {
  if (!d) return "";
  const linhas = [["Empresa", d.empresa], ["Assentos", d.assentos > 0 ? d.assentos : ""], ["Categoria", d.categoria]].filter(([, v]) => v);
  const itens = ITENS_VEICULO.filter(([k]) => (d.itens || []).includes(k));
  if (!linhas.length && !itens.length && !d.descricao) return "";
  return `<div class="vt-veic-dados">
    ${linhas.length ? `<dl>${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
    ${d.descricao ? `<p class="vt-desc">${esc(d.descricao)}</p>` : ""}
    ${itens.length ? `<ul class="vt-veic-itens">${itens.map(([, nome, ic]) => `<li><i class="fa-solid ${ic}"></i> ${nome}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function ligarRaw(el) {
  el.querySelectorAll("img[data-raw]").forEach((img) => {
    img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true });
  });
}

/** Carrossel com botões de voltar e avançar (fotos do local e dos veículos) */
function desenharFotos(box, fotos, classe, alt, inicio = 0, aoTrocar = () => {}) {
  let i = inicio;
  const pintar = () => {
    const f = fotos[i];
    aoTrocar(f);
    box.innerHTML = !f ? `<div class="vt-sem-foto"><i class="fa-regular fa-image"></i></div>` : `
      ${imgDoSite(f, classe, alt)}
      ${fotos.length > 1 ? `<button type="button" class="vt-seta esq" aria-label="Foto anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" class="vt-seta dir" aria-label="Próxima foto"><i class="fa-solid fa-chevron-right"></i></button>` : ""}`;
    ligarRaw(box);
    box.querySelector(".esq")?.addEventListener("click", () => { i = (i - 1 + fotos.length) % fotos.length; pintar(); });
    box.querySelector(".dir")?.addEventListener("click", () => { i = (i + 1) % fotos.length; pintar(); });
  };
  pintar();
}

export function montarVitrine(el, EX, aoComprar, rotulo = "Escolher poltrona", fotoVeiculoInicial = 0) {
  const titulo = EX.vitrine?.titulo || EX.destino;
  const preco = EX.valorCent > 0 && !EX.vitrine?.ocultarPreco ? R.brl(EX.valorCent) : "";
  const fotosVeic = EX.fotosVeiculos || [], dadosComuns = htmlDadosVeiculo(EX.vitrine?.veiculo); // dadosComuns: gravados antes de cada foto ter os seus
  const dadosDaFoto = (f) => htmlDadosVeiculo(f?.dados) || dadosComuns;
  const temDados = fotosVeic.some((f) => dadosDaFoto(f));
  const selo = EX.vagas?.selo, livres = EX.vagas?.livres;
  const saidas = [[EX.localSaida, EX.horaSaida], ...(EX.saidas || []).map((s) => [s.local, s.hora])].filter(([l]) => l);
  const botao = `<button type="button" class="btn btn-primary btn-block vt-comprar">${esc(rotulo)}</button>`;
  el.innerHTML = `
    <div class="vt-barra">
      <div class="vt-barra-nome"><strong>${esc(titulo)}</strong><small><i class="fa-solid fa-location-dot"></i> ${esc(EX.localSaida || "Local a combinar")}</small></div>
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
          <h1>${esc(titulo)}</h1>
          ${EX.agencia ? `<p class="vt-agencia">${esc(EX.agencia)}</p>` : ""}
          ${selo ? `<span class="vt-selo ${esc(selo)}">${selo === "esgotado" ? "Esgotado" : `Restam apenas ${livres}`}</span>` : ""}
          ${saidas.length ? `<ul class="vt-saidas">${saidas.map(([l, h]) => `<li><i class="fa-solid fa-location-dot"></i> ${esc(l)}${h ? `, às ${esc(h)}` : ""}</li>`).join("")}</ul>` : ""}
        </div>
        <aside class="vt-preco">
          ${preco ? `<small>Preço por pessoa</small><strong>${preco}</strong>` : ""}
          ${botao}
        </aside>
      </div>
    </article>
    ${EX.descricao ? `<section class="vt-veiculos">
      <h2>Descrição</h2>
      <p class="vt-desc">${esc(EX.descricao)}</p>
    </section>` : ""}
    ${fotosVeic.length || dadosComuns ? `<section class="vt-veiculos">
      <h2>Veículos</h2>
      <div class="vt-veic-lado ${fotosVeic.length && temDados ? "duplo" : ""}">
        ${fotosVeic.length ? `<div class="vt-fotos vt-fotos-veic"></div>` : ""}
        <div class="vt-veic-texto">${fotosVeic.length ? "" : dadosComuns}</div>
      </div>
      <p class="vt-nota"><i class="fa-solid fa-circle-info"></i> ${esc(EX.vitrine?.aviso || AVISO_VEICULOS)}</p>
    </section>` : ""}
    ${EX.opcionais?.length ? `<section class="vt-veiculos">
      <h2>Adicionais</h2>
      <div class="vt-adicionais">${EX.opcionais.map((o) => {
        const fotos = EX.fotosOpcionais?.[o.id] || [];
        const valor = EX.vitrine?.ocultarPreco ? "" : o.valorCent ? `+ ${R.brl(o.valorCent)}` : "sem custo";
        return `<div class="vt-adicional">
          <div class="vt-adic-topo"><strong>${esc(o.titulo)}</strong>${valor ? `<em>${valor}</em>` : ""}</div>
          ${o.descricao ? `<p class="vt-desc">${esc(o.descricao)}</p>` : ""}
          ${fotos.length ? `<div class="vt-veic-grid">${fotos.map((f) => imgDoSite(f, "vt-veic", `Foto de ${o.titulo}`)).join("")}</div>` : ""}
        </div>`;
      }).join("")}</div>
    </section>` : ""}`;
  ligarRaw(el);
  el.querySelectorAll(".vt-comprar").forEach((b) => b.addEventListener("click", aoComprar));
  const box = el.querySelector("#vtFotos");
  if (EX.fotosLocal?.length) desenharFotos(box, EX.fotosLocal, "vt-foto", `Foto de ${EX.destino}`);
  else desenharFotos(box, EX.folder?.caminho ? [EX.folder] : [], "vt-foto vt-foto-folder", `Folder de ${EX.destino}`);
  const veiculos = el.querySelector(".vt-fotos-veic");
  const texto = el.querySelector(".vt-veic-texto");
  if (veiculos) desenharFotos(veiculos, fotosVeic, "vt-foto", "Foto do veículo", Math.max(0, fotoVeiculoInicial), (f) => { texto.innerHTML = dadosDaFoto(f); });
}
