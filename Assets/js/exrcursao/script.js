document.addEventListener("DOMContentLoaded", function () {

    const excursoes = [
        {
            titulo: "Parque aquatico Aldeia das Aguas",
            imagem: "Assets/img/excursoes/aldeia.webp",
            descricao: "Prepare-se para um dia incrivel no maior parque aquático da região — com o MAIOR TOBOÁGUA DO PLANETA!",
             link: "aldeia-das-aguas.html"
        },
        
    ];

    let paginaAtual = 0;
    const itensPorPagina = 4;

    function renderizarPagina() {
        const start = paginaAtual * itensPorPagina;
        const end = start + itensPorPagina;
        const pagina = excursoes.slice(start, end);

        const container = document.getElementById("cards");

        if (!container) {
            console.error("Elemento #cards não encontrado.");
            return;
        }

        container.innerHTML = "";

        pagina.forEach((excursao, index) => {
            container.innerHTML += `
                <div class="card">
                    <img src="${excursao.imagem}">
                    <div class="card-content">
                        <h3>${excursao.titulo}</h3>
                        <p>${excursao.descricao}</p>
                        <button class="btn-saiba" onclick="window.location.href='${excursao.link}'">Saiba mais</button>
                    </div>
                </div>
            `;
        });

        document.getElementById("prevBtn").disabled = paginaAtual === 0;
        document.getElementById("nextBtn").disabled = end >= excursoes.length;
    }

    // Botões
    document.getElementById("prevBtn").onclick = () => {
        paginaAtual--;
        renderizarPagina();
    };

    document.getElementById("nextBtn").onclick = () => {
        paginaAtual++;
        renderizarPagina();
    };

    // CHAMADA GARANTIDA
    renderizarPagina();
});

    const hamburger = document.getElementById("hamburger");
    const navLinks = document.getElementById("nav-links");

    hamburger.addEventListener("click", () => {
        navLinks.classList.toggle("open");
    });

