// Página inicial: menu, banner rotativo, parceiros e ano do rodapé
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* menu do celular */
  const btn = $("#gtMenuBtn"), menu = $("#gtMenu");
  const fecharMenu = () => { menu.classList.remove("aberto"); btn.setAttribute("aria-expanded", "false"); btn.innerHTML = '<i class="fa-solid fa-bars"></i>'; };
  btn?.addEventListener("click", () => {
    const abrir = !menu.classList.contains("aberto");
    menu.classList.toggle("aberto", abrir);
    btn.setAttribute("aria-expanded", String(abrir));
    btn.innerHTML = abrir ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  });
  $$("#gtMenu a").forEach((a) => a.addEventListener("click", fecharMenu));
  document.addEventListener("click", (e) => { if (menu.classList.contains("aberto") && !e.target.closest(".gt-header")) fecharMenu(); });

  /* banner rotativo (o 1º slide é fixo; os outros vêm do Garbosa System → Administrar site → "Mostrar no banner") */
  const slider = $("#gtSlider");
  const pontos = $("#gtPontos");
  let slides = [], atual = 0, timer = null;
  const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ir = (n) => {
    if (!slides.length) return;
    atual = (n + slides.length) % slides.length;
    slides.forEach((s, i) => { s.classList.toggle("ativo", i === atual); s.setAttribute("aria-hidden", String(i !== atual)); });
    $$("button", pontos).forEach((b, i) => b.setAttribute("aria-selected", String(i === atual)));
  };
  const tocar = () => { if (calmo || slides.length < 2) return; clearInterval(timer); timer = setInterval(() => ir(atual + 1), 6000); };
  const prepararSlides = () => {
    slides = $$(".gt-slide", slider);
    pontos.innerHTML = slides.map((_, i) => `<button type="button" role="tab" aria-label="Slide ${i + 1}" aria-selected="${i === 0}"></button>`).join("");
    $$("button", pontos).forEach((b, i) => b.addEventListener("click", () => { ir(i); tocar(); }));
    ir(0); tocar();
  };
  if (slider) {
    $("#gtAnt").addEventListener("click", () => { ir(atual - 1); tocar(); });
    $("#gtProx").addEventListener("click", () => { ir(atual + 1); tocar(); });
    slider.addEventListener("mouseenter", () => clearInterval(timer));
    slider.addEventListener("mouseleave", tocar);
    let x0 = null;
    slider.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { ir(atual + (dx < 0 ? 1 : -1)); tocar(); }
      x0 = null;
    });
    prepararSlides();
  }

  /* dados do site (Garbosa System) + selo automático pelas poltronas: "Últimas vagas" faltando 30% ou menos, "Esgotado" lotado.
     "Esgotado" marcado à mão continua valendo; sem resposta da API, fica o selo escolhido à mão. */
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkSeguro = (l) => (/^(https?:\/\/|[\w./?=&%-]+$)/.test(l || "") && !/^javascript:/i.test(l) ? l : "#");
  const SELOS = { promocao: "Promoção", ultimas: "Últimas vagas", esgotado: "Esgotado" };
  const VAGAS = fetch("/api/venda?vagas=1").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const comSelo = (dados, vagas) => Object.entries(dados || {}).map(([id, x]) =>
    x && typeof x === "object" ? { ...x, status: x.status === "esgotado" ? "esgotado" : (vagas[id] && vagas[id].selo) || x.status } : x);
  const SITE = Promise.all([fetch("https://bus-virtual-dd0f7-default-rtdb.firebaseio.com/site/excursoes.json").then((r) => (r.ok ? r.json() : null)), VAGAS])
    .then(([dados, vagas]) => comSelo(dados, vagas).filter((x) => x && x.ativo !== false && x.titulo && x.imagem).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
  const trocaImg = (raiz) => raiz.querySelectorAll("img[data-raw]").forEach((img) => img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true }));

  const FUNDOS = ["linear-gradient(120deg,#0b4f6c 0%,#2A1F88 70%)", "linear-gradient(120deg,#0d6e6e 0%,#2A1F88 70%)", "linear-gradient(120deg,#5a1a8c 0%,#2A1F88 70%)", "linear-gradient(120deg,#8c3a1a 0%,#2A1F88 70%)"];
  if (slider) {
    SITE.then((lista) => {
      const banner = lista.filter((x) => x.banner);
      if (!banner.length) return; // nenhuma escolhida: ficam os slides do HTML
      $$(".gt-slide", slider).slice(1).forEach((s) => s.remove());
      const html = banner.map((x, i) => {
        const esg = x.status === "esgotado";
        return `<article class="gt-slide ${esg ? "gt-slide-esgotado" : ""}" style="--bg-slide:${FUNDOS[i % FUNDOS.length]}">
          <div class="gt-slide-txt">
            ${SELOS[x.status] ? `<span class="gt-slide-status gt-selo-${x.status}">${SELOS[x.status]}</span>` : ""}
            ${x.categoria ? `<span class="gt-selo"><i class="fa-solid fa-location-dot"></i> ${esc(x.categoria)}</span>` : ""}
            <h2>${esc(x.titulo)}</h2>
            <p>${esc(x.descricao ? (x.descricao.length > 160 ? x.descricao.slice(0, 157) + "…" : x.descricao) : [x.local, x.data].filter(Boolean).join(" · "))}</p>
            ${x.descricao && (x.local || x.data) ? `<p class="gt-slide-info"><i class="fa-regular fa-calendar"></i> ${esc([x.data, x.local].filter(Boolean).join(" · "))}</p>` : ""}
            <div class="gt-acoes">${esg ? `<span class="gt-btn gt-btn-esgotado" aria-disabled="true">Esgotado</span>` : `<a class="gt-btn gt-btn-amarelo" href="${esc(linkSeguro(x.link))}">${esc(x.botao && x.botao !== "Saiba mais" ? x.botao : "Reserve agora")}</a>`}</div>
          </div>
          <img class="gt-slide-img" src="${esc(x.imagem)}" data-raw="${esc(x.imagemRaw || "")}" alt="Folder da excursão ${esc(x.titulo)}">
        </article>`;
      }).join("");
      $("#gtAnt").insertAdjacentHTML("beforebegin", html);
      trocaImg(slider);
      clearInterval(timer);
      prepararSlides();
    }).catch(() => { /* mantém os slides do HTML */ });
  }

  /* parceiros: duplica a lista para o carrossel girar sem emenda */
  const trilho = $("#gtParceiros");
  if (trilho && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    [...trilho.children].forEach((c) => { const k = c.cloneNode(true); k.setAttribute("aria-hidden", "true"); k.tabIndex = -1; trilho.appendChild(k); });
  }

  /* destinos em destaque: as marcadas com ⭐ no Garbosa System → Administrar site; se nenhuma, as primeiras do catálogo.
     Sem dados, ficam os cartões do HTML. */
  const grade = $(".gt-destinos");
  if (grade) {
    SITE.then((todas) => {
      const marcadas = todas.filter((x) => x.destaque);
      const lista = (marcadas.length ? marcadas : todas).slice(0, 7);
      if (!lista.length) return;
      const verTodas = grade.querySelector(".gt-dest-todas")?.outerHTML || "";
      grade.innerHTML = lista.map((x) => {
        const esg = x.status === "esgotado";
        return `
        <article class="gt-dest ${esg ? "gt-esgotado" : ""}">
          <a href="${esc(linkSeguro(x.link))}" class="gt-dest-img"><img loading="lazy" src="${esc(x.imagem)}" data-raw="${esc(x.imagemRaw || "")}" alt="">${x.categoria ? `<span class="gt-tag">${esc(x.categoria)}</span>` : ""}${SELOS[x.status] ? `<span class="gt-selo gt-selo-${x.status}">${SELOS[x.status]}</span>` : ""}</a>
          <h3>${esc(x.titulo)}</h3><p>${esc([x.local, x.data].filter(Boolean).join(" · "))}</p>
          ${esg ? `<span class="gt-btn gt-btn-p gt-btn-esgotado" aria-disabled="true">Esgotado</span>` : `<a class="gt-btn gt-btn-roxo gt-btn-p" href="${esc(linkSeguro(x.link))}">${esc(x.botao && x.botao !== "Saiba mais" ? x.botao : "Mais sobre " + x.titulo)}</a>`}
        </article>`;
      }).join("") + verTodas;
      trocaImg(grade);
    }).catch(() => { /* mantém os cartões do HTML */ });
  }

  /* ano do rodapé */
  const ano = $("#currentYear");
  if (ano) ano.textContent = new Date().getFullYear();

  /* proteções que o site já tinha: botão direito e atalhos de código-fonte */
  document.addEventListener("contextmenu", (e) => { if (!e.target.closest("input, textarea")) e.preventDefault(); });
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) || (e.ctrlKey && ["u", "s"].includes(k))) e.preventDefault();
  });
})();
