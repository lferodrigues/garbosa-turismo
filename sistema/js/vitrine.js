// Vitrine dos links de poltrona e de compra: fotos do local, resumo da viagem, fotos dos veículos e botão para seguir (escolher poltrona ou comprar).
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

/** Rodapé igual ao do site principal (index.html); fica até o fim da compra */
export function mostrarRodape() {
  if (document.querySelector(".gt-rodape")) return;
  document.body.classList.add("com-rodape");
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="gt-rodape">
      <div class="gt-container gt-rodape-in">
        <div>
          <a href="../index.html" class="gt-marca gt-marca-clara"><img src="../Assets/img/logo.ico" alt=""><span><strong>Garbosa</strong><em>Turismo</em></span></a>
          <p>A viagem dos seus sonhos começa aqui. Excursões saindo de São João Nepomuceno, MG.</p>
          <div class="gt-redes">
            <a href="https://wa.me/5532999874657" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
            <a href="https://www.instagram.com/garbosaturismo/" target="_blank" rel="noopener" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://www.tiktok.com/@garbosaturismo" target="_blank" rel="noopener" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a>
            <a href="https://www.facebook.com/profile.php?id=100093055390780" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
          </div>
        </div>
        <div>
          <h3>Navegue</h3>
          <ul><li><a href="../excursoes.html">Excursões</a></li><li><a href="../index.html#destinos">Destinos em destaque</a></li><li><a href="minha-conta.html">Área do cliente</a></li><li><a href="../contrato.html">Contrato de prestação de serviço</a></li><li><a href="../fale-conosco.html">Fale conosco</a></li></ul>
        </div>
        <div>
          <h3>Atendimento</h3>
          <ul><li><a href="https://wa.me/5532999874657" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> (32) 99987-4657</a></li><li><i class="fa-solid fa-location-dot"></i> São João Nepomuceno / MG</li></ul>
        </div>
        <div class="gt-cadastur">
          <h3>Cadastur</h3>
          <a href="../Assets/documentos/cadastro.pdf" target="_blank" rel="noopener" title="Clique para verificar o cadastro"><img loading="lazy" src="../Assets/img/cadastur.png" alt="Selo Cadastur — verificar cadastro"></a>
          <small>Clique no selo para verificar o cadastro</small>
        </div>
      </div>
      <p class="gt-copy">© ${new Date().getFullYear()} Todos os direitos reservados | Garbosa Turismo</p>
    </footer>`);
}

export function montarVitrine(el, EX, aoComprar, rotulo = "Escolher poltrona") {
  const preco = EX.valorCent > 0 ? R.brl(EX.valorCent) : "";
  const selo = EX.vagas?.selo, livres = EX.vagas?.livres;
  const saidas = [[EX.localSaida, EX.horaSaida], ...(EX.saidas || []).map((s) => [s.local, s.hora])].filter(([l]) => l);
  const botao = `<button type="button" class="btn btn-primary btn-block vt-comprar">${esc(rotulo)}</button>`;
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
