// Catálogo de excursões (excursoes.html).
// A lista vem do Garbosa System → Administrar site (Firebase: site/excursoes).
// Se ainda não houver nada lá (ou a internet falhar), mostra a lista fixa abaixo.
document.addEventListener("DOMContentLoaded", function () {

    const LISTA_FIXA = [
        { titulo: "Excursão para o Zoológico + Parque de diversões Guanabara em BH", imagem: "Assets/img/excursoes/bh.png",
          descricao: "Prepare-se para um dia incrível de diversão em Belo Horizonte, curtindo as atrações do Parque Guanabara e a natureza do Zoológico de BH em uma aventura para toda a família", link: "bh.html" },
        { titulo: "Excursão para a praia da Barra da Tijuca no Rio de Janeiro", imagem: "Assets/img/excursoes/barra.jpeg",
          descricao: "Prepare a mala e venha viver momentos inesquecíveis na Praia da Barra da Tijuca! Um dia de sol, mar e muita diversão esperando por você", link: "barra.html" },
        { titulo: "Excursão para o parque aquatico Aldeia das águas", imagem: "Assets/img/excursoes/aldeia-das-aguas.jpg",
          descricao: "Prepare-se para uma aventura incrivel no maior parque aquatico do estado do Rio de Janeiro, com o maior toboagua do mundo", link: "aldeia-das-aguas.html" },
        { titulo: "Excursão para o show do Frei Gilson em JF", imagem: "Assets/img/excursoes/frei.png",
          descricao: "Prepare-se para uma noite repleta do Espirito Santo", link: "evento-frei-gilson.html" }
    ];
    const BANCO = "https://bus-virtual-dd0f7-default-rtdb.firebaseio.com/site/excursoes.json";
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const linkSeguro = (l) => (/^(https?:\/\/|[\w./?=&%-]+$)/.test(l || "") && !/^javascript:/i.test(l) ? l : "#");

    // selo escolhido no Garbosa System → Administrar site
    const SELOS = { promocao: "Promoção", ultimas: "Últimas vagas", esgotado: "Esgotado" };
    const selo = (x) => (SELOS[x.status] ? `<span class="selo selo-${x.status}">${SELOS[x.status]}</span>` : "");

    // selo automático pelas poltronas ocupadas (Garbosa System): "Últimas vagas" faltando 30% ou menos, "Esgotado" lotado.
    // "Esgotado" marcado à mão continua valendo; sem resposta da API, fica o selo escolhido à mão.
    const VAGAS = fetch("/api/venda?vagas=1").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const comSelo = (dados, vagas) => Object.entries(dados || {}).map(([id, x]) =>
        x && typeof x === "object" ? { ...x, status: x.status === "esgotado" ? "esgotado" : (vagas[id] && vagas[id].selo) || x.status } : x);
    let excursoes = LISTA_FIXA;
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
            </div>`).join("") || `<p>Nenhuma excursão disponível no momento. Fale com a gente pelo WhatsApp!</p>`;

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
    Promise.all([fetch(BANCO).then((r) => (r.ok ? r.json() : null)), VAGAS]).then(([dados, vagas]) => {
        const lista = comSelo(dados, vagas).filter((x) => x && x.ativo !== false && x.titulo && x.imagem)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        if (lista.length) { excursoes = lista; paginaAtual = 0; renderizarPagina(); }
    }).catch(() => { /* mantém a lista fixa */ });
});
