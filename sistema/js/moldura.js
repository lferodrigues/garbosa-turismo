// Menu e rodapé iguais aos do site principal (index.html), para as telas do sistema abertas ao público.
// Se o menu ou o rodapé do site mudar, mude aqui também e copie o estilo para sistema.css.

/** Menu do topo igual ao do site principal (index.html); no celular abre pelo botão */
function mostrarMenu() {
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="gt-header">
      <div class="gt-container gt-header-in">
        <a href="../index.html" class="gt-marca" aria-label="Garbosa Turismo — início">
          <img src="../Assets/img/logo.ico" alt="">
          <span><strong>Garbosa</strong><em>Turismo</em></span>
        </a>
        <button type="button" class="gt-menu-btn" id="gtMenuBtn" aria-label="Abrir menu" aria-expanded="false" aria-controls="gtMenu"><i class="fa-solid fa-bars"></i></button>
        <nav class="gt-menu" id="gtMenu" aria-label="Menu principal">
          <ul>
            <li><a href="../index.html#inicio">Início</a></li>
            <li><a href="../index.html#destinos">Destinos</a></li>
            <li><a href="../excursoes.html">Excursões</a></li>
            <li><a href="../index.html#sobre">A agência</a></li>
            <li><a href="../index.html#parceiros">Parceiros</a></li>
            <li><a href="../contrato.html">Contrato</a></li>
            <li><a href="#contato">Contato</a></li>
            <li class="gt-menu-conta"><a href="minha-conta.html"><i class="fa-regular fa-circle-user"></i> Área do cliente</a></li>
          </ul>
        </nav>
      </div>
    </header>`);
  const btn = document.querySelector("#gtMenuBtn"), menu = document.querySelector("#gtMenu");
  const alternar = (abrir) => {
    menu.classList.toggle("aberto", abrir);
    btn.setAttribute("aria-expanded", String(abrir));
    btn.setAttribute("aria-label", abrir ? "Fechar menu" : "Abrir menu");
    btn.innerHTML = `<i class="fa-solid fa-${abrir ? "xmark" : "bars"}"></i>`;
  };
  btn.addEventListener("click", () => alternar(!menu.classList.contains("aberto")));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => alternar(false)));
  document.addEventListener("click", (e) => { if (menu.classList.contains("aberto") && !e.target.closest(".gt-header")) alternar(false); });
}

/** Menu e rodapé iguais aos do site principal (index.html); ficam até o fim da compra */
export function mostrarMoldura() {
  if (document.querySelector(".gt-rodape")) return;
  document.body.classList.add("com-moldura");
  mostrarMenu();
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="gt-rodape" id="contato">
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

/** Tira o menu e o rodapé (o painel usa só na tela de login) */
export function tirarMoldura() {
  document.querySelector(".gt-header")?.remove();
  document.querySelector(".gt-rodape")?.remove();
  document.body.classList.remove("com-moldura");
}
