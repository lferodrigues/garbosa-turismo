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

  /* banner rotativo */
  const slider = $("#gtSlider");
  if (slider) {
    const slides = $$(".gt-slide", slider);
    const pontos = $("#gtPontos");
    let atual = 0, timer = null;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pontos.innerHTML = slides.map((_, i) => `<button type="button" role="tab" aria-label="Slide ${i + 1}" aria-selected="${i === 0}"></button>`).join("");
    const ir = (n) => {
      atual = (n + slides.length) % slides.length;
      slides.forEach((s, i) => { s.classList.toggle("ativo", i === atual); s.setAttribute("aria-hidden", String(i !== atual)); });
      $$("button", pontos).forEach((b, i) => b.setAttribute("aria-selected", String(i === atual)));
    };
    const tocar = () => { if (calmo) return; clearInterval(timer); timer = setInterval(() => ir(atual + 1), 6000); };
    $$("button", pontos).forEach((b, i) => b.addEventListener("click", () => { ir(i); tocar(); }));
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
    ir(0); tocar();
  }

  /* parceiros: duplica a lista para o carrossel girar sem emenda */
  const trilho = $("#gtParceiros");
  if (trilho && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    [...trilho.children].forEach((c) => { const k = c.cloneNode(true); k.setAttribute("aria-hidden", "true"); k.tabIndex = -1; trilho.appendChild(k); });
  }

  /* destinos em destaque: vêm do Garbosa System → Administrar site (⭐). Sem dados, ficam os cartões do HTML. */
  const grade = $(".gt-destinos");
  if (grade) {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const linkSeguro = (l) => (/^(https?:\/\/|[\w./?=&%-]+$)/.test(l || "") && !/^javascript:/i.test(l) ? l : "#");
    fetch("https://bus-virtual-dd0f7-default-rtdb.firebaseio.com/site/excursoes.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        const lista = Object.values(dados || {}).filter((x) => x && x.ativo !== false && x.destaque && x.titulo && x.imagem)
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).slice(0, 7);
        if (!lista.length) return;
        const todas = grade.querySelector(".gt-dest-todas").outerHTML;
        grade.innerHTML = lista.map((x) => `
          <article class="gt-dest">
            <a href="${esc(linkSeguro(x.link))}" class="gt-dest-img"><img loading="lazy" src="${esc(x.imagem)}" data-raw="${esc(x.imagemRaw || "")}" alt="">${x.categoria ? `<span class="gt-tag">${esc(x.categoria)}</span>` : ""}</a>
            <h3>${esc(x.titulo)}</h3><p>${esc([x.local, x.data].filter(Boolean).join(" · "))}</p>
            <a class="gt-btn gt-btn-roxo gt-btn-p" href="${esc(linkSeguro(x.link))}">${esc(x.botao && x.botao !== "Saiba mais" ? x.botao : "Mais sobre " + x.titulo)}</a>
          </article>`).join("") + todas;
        grade.querySelectorAll("img[data-raw]").forEach((img) => img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true }));
      })
      .catch(() => { /* mantém os cartões do HTML */ });
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
