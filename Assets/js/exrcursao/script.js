// Catálogo de excursões (excursoes.html), no mesmo visual da página inicial.
// Mostra só as excursões cadastradas no Garbosa System (Firebase: site/excursoes ligadas a uma excursão do sistema)
// e nunca as ocultas no Administrar site. Páginas antigas/fixas do site não aparecem aqui.
(function () {
    const BANCO = "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com/site/excursoes.json";
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const linkSeguro = (l) => (/^(https?:\/\/|[\w./?=&%-]+$)/.test(l || "") && !/^javascript:/i.test(l) ? l : "#");
    // só excursões do Garbosa System: publicadas pelo sistema (exId) ou com o botão levando a uma excursão do sistema
    const exIdDoSite = (x) => (x && x.exId && /^[\w-]{1,128}$/.test(x.exId) ? x.exId
        : ((String((x && x.link) || "").match(/sistema\/(?:comprar|inscricao|reservar|poltrona)\.html\?e=([\w-]{1,128})/) || [])[1] || ""));

    const SELOS = { promocao: "Promoção", ultimas: "Últimas vagas", esgotado: "Esgotado" };
    // selo automático pelas poltronas marcadas (Garbosa System): "Últimas vagas" faltando 40% ou menos, "Esgotado" lotado.
    // "Esgotado" marcado à mão continua valendo; sem resposta da API, fica o selo escolhido à mão.
    const VAGAS = fetch("/api/venda?vagas=1").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const comSelo = (dados, vagas) => Object.entries(dados || {}).map(([id, x]) =>
        x && typeof x === "object" ? { ...x, status: x.status === "esgotado" ? "esgotado" : (vagas[id] && vagas[id].selo) || x.status } : x);

    const POR_PAGINA = 8;
    let excursoes = [], pagina = 0, estado = "carregando"; // carregando | ok | erro
    const $ = (s) => document.querySelector(s);

    const cartao = (x) => {
        const esg = x.status === "esgotado";
        const info = [x.data, x.local].filter(Boolean).join(" · ");
        const desc = x.descricao ? (x.descricao.length > 140 ? x.descricao.slice(0, 137) + "…" : x.descricao) : "";
        return `
        <article class="gt-dest ${esg ? "gt-esgotado" : ""}">
          <a href="${esc(esg ? "#" : linkSeguro(x.link))}" class="gt-dest-img" ${esg ? 'aria-disabled="true" tabindex="-1"' : ""}>
            <img loading="lazy" src="${esc(x.imagem)}" data-raw="${esc(x.imagemRaw || "")}" alt="Folder da excursão ${esc(x.titulo)}">
            ${x.categoria ? `<span class="gt-tag">${esc(x.categoria)}</span>` : ""}${SELOS[x.status] ? `<span class="gt-selo gt-selo-${x.status}">${SELOS[x.status]}</span>` : ""}
          </a>
          <h3>${esc(x.titulo)}</h3>
          ${info ? `<p class="gt-dest-info"><i class="fa-regular fa-calendar"></i> ${esc(info)}</p>` : ""}
          ${desc ? `<p class="gt-dest-desc">${esc(desc)}</p>` : ""}
          ${esg ? `<span class="gt-btn gt-btn-p gt-btn-esgotado" aria-disabled="true">Esgotado</span>`
                : `<a class="gt-btn gt-btn-roxo gt-btn-p" href="${esc(linkSeguro(x.link))}">${esc(x.botao && x.botao !== "Saiba mais" ? x.botao : "Ver excursão")}</a>`}
        </article>`;
    };

    function render() {
        const grade = $("#cards");
        if (!grade) return;
        const total = Math.max(1, Math.ceil(excursoes.length / POR_PAGINA));
        pagina = Math.min(pagina, total - 1);
        const itens = excursoes.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
        grade.innerHTML = itens.map(cartao).join("") || `<div class="gt-catalogo-vazio">
            <i class="fa-solid ${estado === "carregando" ? "fa-spinner fa-spin" : "fa-map-location-dot"}"></i>
            <p>${estado === "carregando" ? "Carregando as excursões…"
                : estado === "erro" ? "Não foi possível carregar as excursões agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp."
                : "Nenhuma excursão disponível no momento. Fale com a gente pelo WhatsApp para saber das próximas!"}</p>
            ${estado !== "carregando" ? `<a class="gt-btn gt-btn-roxo" href="https://wa.me/5532999874657" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Falar no WhatsApp</a>` : ""}
          </div>`;
        grade.querySelectorAll("img[data-raw]").forEach((img) =>
            img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true }));
        const nav = $(".gt-paginacao");
        nav.hidden = excursoes.length <= POR_PAGINA;
        $("#prevBtn").disabled = pagina === 0;
        $("#nextBtn").disabled = pagina >= total - 1;
        $("#paginaInfo").textContent = `Página ${pagina + 1} de ${total}`;
    }

    const irPara = (n) => { pagina = n; render(); $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" }); };
    $("#prevBtn").addEventListener("click", () => irPara(pagina - 1));
    $("#nextBtn").addEventListener("click", () => irPara(pagina + 1));

    render();
    Promise.all([fetch(BANCO).then((r) => { if (!r.ok) throw new Error("banco"); return r.json(); }), VAGAS]).then(([dados, vagas]) => {
        // oculta no Administrar site (ativo === false) nunca aparece
        excursoes = comSelo(dados, vagas).filter((x) => x && x.ativo !== false && x.titulo && x.imagem && exIdDoSite(x))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        estado = "ok"; pagina = 0; render();
    }).catch(() => { estado = "erro"; render(); });
})();
