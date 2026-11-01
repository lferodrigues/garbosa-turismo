// Catálogo de excursões (excursoes.html).
// Mostra só as excursões cadastradas no Garbosa System (Firebase: site/excursoes ligadas a uma excursão do sistema).
// Páginas antigas/fixas do site não aparecem aqui.
document.addEventListener("DOMContentLoaded", function () {

    // só excursões do Garbosa System: publicadas pelo sistema (exId) ou com o botão levando a uma excursão do sistema
    const exIdDoSite = (x) => (x && x.exId && /^[\w-]{1,128}$/.test(x.exId) ? x.exId
        : ((String((x && x.link) || "").match(/sistema\/(?:comprar|inscricao|reservar|poltrona)\.html\?e=([\w-]{1,128})/) || [])[1] || ""));
    const BANCO = "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com/site/excursoes.json";
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const linkSeguro = (l) => (/^(https?:\/\/|[\w./?=&%-]+$)/.test(l || "") && !/^javascript:/i.test(l) ? l : "#");

    // selo escolhido no Garbosa System → Administrar site
    const SELOS = { promocao: "Promoção", ultimas: "Últimas vagas", esgotado: "Esgotado" };
    const selo = (x) => (SELOS[x.status] ? `<span class="selo selo-${x.status}">${SELOS[x.status]}</span>` : "");

    // selo automático pelas poltronas ocupadas (Garbosa System): "Últimas vagas" faltando 40% ou menos, "Esgotado" lotado.
    // "Esgotado" marcado à mão continua valendo; sem resposta da API, fica o selo escolhido à mão.
    const VAGAS = fetch("/api/venda?vagas=1").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const comSelo = (dados, vagas) => Object.entries(dados || {}).map(([id, x]) =>
        x && typeof x === "object" ? { ...x, status: x.status === "esgotado" ? "esgotado" : (vagas[id] && vagas[id].selo) || x.status } : x);
    let excursoes = [];
    let estado = "carregando"; // carregando | ok | erro
    let paginaAtual = 0;
    const itensPorPagina = 6;

    function renderizarPagina() {
        const start = paginaAtual * itensPorPagina;
        const end = start + itensPorPagina;
        const pagina = excursoes.slice(start, end);
        const container = document.getElementById("cards");
        if (!container) return;

        container.innerHTML = pagina.map((x) => `
            <div class="card ${x.status === "esgotado" ? "card-esgotado" : ""}">
                <div class="card-img">${selo(x)}<img src="${esc(x.imagem)}" alt="${esc(x.titulo)}" loading="lazy" data-raw="${esc(x.imagemRaw || "")}"></div>
                <div class="card-content">
                    <h3>${esc(x.titulo)}</h3>
                    ${x.data || x.local ? `<p class="card-info">${esc([x.data, x.local].filter(Boolean).join(" · "))}</p>` : ""}
                    <p>${esc(x.descricao)}</p>
                    ${x.status === "esgotado" ? `<span class="btn-saiba btn-esgotado" aria-disabled="true">Esgotado</span>` : `<a class="btn-saiba" href="${esc(linkSeguro(x.link))}">${esc(x.botao || "Saiba mais")}</a>`}
                </div>
            </div>`).join("") || `<p class="catalogo-vazio">${estado === "carregando" ? "Carregando as excursões…"
                : estado === "erro" ? "Não foi possível carregar as excursões agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp!"
                : "Nenhuma excursão disponível no momento. Fale com a gente pelo WhatsApp!"}</p>`;

        container.querySelectorAll("img[data-raw]").forEach((img) => {
            img.addEventListener("error", () => { if (img.dataset.raw && img.src !== img.dataset.raw) img.src = img.dataset.raw; }, { once: true });
        });
        document.getElementById("prevBtn").disabled = paginaAtual === 0;
        document.getElementById("nextBtn").disabled = end >= excursoes.length;
        document.querySelector(".pagination").style.display = excursoes.length > itensPorPagina ? "" : "none";
    }

    document.getElementById("prevBtn").onclick = () => { paginaAtual--; renderizarPagina(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    document.getElementById("nextBtn").onclick = () => { paginaAtual++; renderizarPagina(); window.scrollTo({ top: 0, behavior: "smooth" }); };

    renderizarPagina();
    Promise.all([fetch(BANCO).then((r) => { if (!r.ok) throw new Error("banco"); return r.json(); }), VAGAS]).then(([dados, vagas]) => {
        excursoes = comSelo(dados, vagas).filter((x) => x && x.ativo !== false && x.titulo && x.imagem && exIdDoSite(x))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        estado = "ok"; paginaAtual = 0; renderizarPagina();
    }).catch(() => { estado = "erro"; renderizarPagina(); });
});
