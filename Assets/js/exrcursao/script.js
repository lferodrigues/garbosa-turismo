document.addEventListener("DOMContentLoaded", function () {

    const excursoes = [
           {
            titulo: "PHN Canção Nova 2026",
            imagem: "Assets/img/excursoes/phn.webp",
            descricao: "Prepare-se para o maior acampamento católico da america latina, um evento recheado de fé,amor e religiosidade.",
             link: "phn.html"
        },
        {
            titulo: "Excursão para o Zoológico + Parque de diversões Guanabara em BH ",
            imagem: "Assets/img/excursoes/bh.png",
            descricao: "Prepare-se para um dia incrível de diversão em Belo Horizonte, curtindo as atrações do Parque Guanabara e a natureza do Zoológico de BH em uma aventura para toda a família",
             link: "bh.html"
        },
        
        {
            titulo: "Excursão para o parque aquatico Aldeia das águas",
            imagem: "Assets/img/excursoes/aldeia-das-aguas.jpg",
            descricao: "Prepare-se para uma aventura incrivel no maior parque aquatico do estado do Rio de Janeiro, com o maior toboagua do mundo",
             link: "aldeia-das-aguas.html"
        },
        
       
         {
            titulo: "Excursão para o show do Frei Gilson em JF",
            imagem: "Assets/img/excursoes/frei.png",
            descricao: "Prepare-se para uma noite repleta do Espirito Santo",
             link: "freigilson.html"
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

