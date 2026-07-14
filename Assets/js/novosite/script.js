  // Bloqueia o PrintScreen
  document.addEventListener("keydown", function (e) {
    
    if (e.key === "PrintScreen") {
      e.preventDefault();
      bloquearTela();
    }
  });
  function bloquearTela() {
    document.body.innerHTML = `
      <div style="
        height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#000;
        color:#fff;
        font-size:20px;
        text-align:center;
      ">
        Conteúdo protegido.<br>Ação não permitida.
      </div>
    `;
  }
  // Bloquear botão direito do mouse
  document.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      alert("Função desabilitada!");
  });
  
  // Bloquear teclas de atalho relacionadas a ferramentas de desenvolvedor
  document.addEventListener("keydown", (event) => {
      if (
          event.key === "F12" || // F12 para abrir DevTools
          (event.ctrlKey && event.shiftKey && event.key === "I") || // Ctrl+Shift+I
          (event.ctrlKey && event.shiftKey && event.key === "J") || // Ctrl+Shift+J
          (event.ctrlKey && event.key === "U") || // Ctrl+U para visualizar o código-fonte
          (event.ctrlKey && event.key === "S") // Ctrl+S para salvar a página
      ) {
          event.preventDefault();
          alert("Ação bloqueada!");
      }
  });
  
  // Tentar detectar o uso das ferramentas de desenvolvedor
  (function detectDevTools() {
      const element = new Image();
      Object.defineProperty(element, 'id', {
          get: function () {
              alert("Ferramentas de desenvolvedor detectadas e bloqueadas!");
              window.location.href = "about:blank"; // Redireciona a página
          }
      });
      console.log('%c', element);
  })();
  document.addEventListener('keydown', function(event) {
      // Bloqueia Ctrl+S (salvar)
      if (event.ctrlKey && event.key === 's') {
          event.preventDefault();
          alert('A combinação Ctrl+S está desabilitada!');
      }
      // Bloqueia Ctrl+U (ver código-fonte)
      if (event.ctrlKey && event.key === 'u') {
          event.preventDefault();
          alert('A combinação Ctrl+U está desabilitada!');
      }
  });
document.addEventListener("DOMContentLoaded", () => {

    /*==============================
        MENU MOBILE
    ==============================*/
    const menuBtn = document.querySelector(".menu-toggle");
    const menu = document.querySelector(".navbar ul");

    if (menuBtn && menu) {
        menuBtn.addEventListener("click", () => {
            menu.classList.toggle("active");
        });
    }
})

    /*==============================
        NAVBAR AO ROLAR
    ==============================*/
    const navbar = document.querySelector(".navbar");

    window.addEventListener("scroll", () => {

        if (window.scrollY > 80) {

            navbar.classList.add("scroll");

        } else {

            navbar.classList.remove("scroll");

        }

    });

    /*==============================
        ANIMAÇÃO DOS CONTADORES
    ==============================*/

    const counters = document.querySelectorAll(".stats h2");

    const animateCounter = (counter) => {

        const text = counter.innerText.replace("+", "").replace("%", "");

        const target = Number(text);

        if (isNaN(target)) return;

        let current = 0;

        const increment = Math.ceil(target / 80);

        const timer = setInterval(() => {

            current += increment;

            if (current >= target) {

                current = target;

                clearInterval(timer);

            }

            if (counter.innerText.includes("%")) {

                counter.innerText = current + "%";

            } else {

                counter.innerText = current + "+";

            }

        }, 20);

    };

    const observerCounter = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                animateCounter(entry.target);

                observerCounter.unobserve(entry.target);

            }

        });

    });

    counters.forEach(counter => observerCounter.observe(counter));

    /*==============================
        ANIMAÇÃO DAS SEÇÕES
    ==============================*/

    const revealElements = document.querySelectorAll(

        ".card,.partner,.hero-content,.section h2,.section p"

    );

    const revealObserver = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("show");

            }

        });

    }, {

        threshold: 0.15

    });

    revealElements.forEach(item => {

        item.classList.add("hidden");

        revealObserver.observe(item);

    });

    /*==============================
        BOTÃO VOLTAR AO TOPO
    ==============================*/

    const topButton = document.createElement("button");

    topButton.innerHTML = "↑";

    topButton.id = "topButton";

    document.body.appendChild(topButton);

    topButton.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });

    window.addEventListener("scroll", () => {

        if (window.scrollY > 400) {

            topButton.classList.add("visible");

        } else {

            topButton.classList.remove("visible");

        }

    });

    /*==============================
        SCROLL SUAVE
    ==============================*/

    document.querySelectorAll('a[href^="#"]').forEach(link => {

        link.addEventListener("click", function (e) {

            e.preventDefault();

            const destino = document.querySelector(this.getAttribute("href"));

            if (destino) {

                destino.scrollIntoView({

                    behavior: "smooth"

                });

            }

        });

    });

    /*==============================
        SLIDER INFINITO PARCEIROS
    ==============================*/

    const slider = document.getElementById("slider");

    // duplica os parceiros
    slider.innerHTML += slider.innerHTML;
    
    let position = 0;
    let speed = 0.6;
    
    let isDragging = false;
    let startX = 0;
    let previousPosition = 0;
    
    function animate(){
    
        if(!isDragging){
    
            position -= speed;
    
            if(Math.abs(position) >= slider.scrollWidth / 2){
    
                position = 0;
    
            }
    
        }
    
        slider.style.transform = `translateX(${position}px)`;
    
        requestAnimationFrame(animate);
    
    }
    
    requestAnimationFrame(animate);
    
    // =======================
    // Mouse
    // =======================
    
    slider.addEventListener("mousedown",(e)=>{
    
        isDragging=true;
    
        startX=e.clientX;
    
        previousPosition=position;
    
    });
    
    window.addEventListener("mousemove",(e)=>{
    
        if(!isDragging) return;
    
        const dx=e.clientX-startX;
    
        position=previousPosition+dx;
    
    });
    
    window.addEventListener("mouseup",()=>{
    
        isDragging=false;
    
    });
    
    // =======================
    // Touch
    // =======================
    
    slider.addEventListener("touchstart",(e)=>{
    
        isDragging=true;
    
        startX=e.touches[0].clientX;
    
        previousPosition=position;
    
    });
    
    slider.addEventListener("touchmove",(e)=>{
    
        if(!isDragging) return;
    
        const dx=e.touches[0].clientX-startX;
    
        position=previousPosition+dx;
    
    });
    
    slider.addEventListener("touchend",()=>{
    
        isDragging=false;
    
    });
    
    // =======================
    // Pausar ao passar mouse
    // =======================
    
    slider.addEventListener("mouseenter",()=>{
    
        speed=0;
    
    });
    
    slider.addEventListener("mouseleave",()=>{
    
        if(!isDragging)
    
            speed=0.6;
    
    });
    
    window.addEventListener("mouseup",()=>{
    
        speed=0.6;
    
    });
    
    slider.addEventListener("touchend",()=>{
    
        speed=0.6;
    
    });
    // Atualiza o ano no rodapé
 document.getElementById('currentYear').textContent = new Date().getFullYear();

