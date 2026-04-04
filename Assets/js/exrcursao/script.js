document.addEventListener("DOMContentLoaded", function () {

    const excursoes = [
         {
            titulo: "Excursao Praia de Ipanema ",
            imagem: "Assets/img/excursoes/ipanema.png",
            descricao: "Prepare-se para viver dias INESQUECÍVEIS de diversão, em uma das praias mais famosas do Brasil.",
             link: "ipanema.html"
        },
           {
            titulo: "PHN Canção Nova 2026",
            imagem: "Assets/img/excursoes/phn.webp",
            descricao: "Prepare-se para o maior acampamento católico da america latina, um evento recheado de fé,amor e religiosidade.",
             link: "phn.html"
        },
       
         {
            titulo: "Excursão para o show do Frei Gilson em JF",
            imagem: "Assets/img/excursoes/frei.png",
            descricao: "Prepare-se para uma noite repleta do Espirito Santo",
             link: "freigilson.html"
        },
            {
            titulo: "Excursão para o parque aquatico Aldeia das águas",
            imagem: "Assets/img/excursoes/aldeia-das-aguas.jpg",
            descricao: "Prepare-se para uma aventura incrivel no maior parque aquatico do estado do Rio de Janeiro, com o maior toboagua do mundo",
             link: "aldeia-das-aguas.html"
        }
        
        
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

