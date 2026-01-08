
document.addEventListener("DOMContentLoaded", () => {
    const slides = document.querySelectorAll(".sobre-slideshow .slide");
    let index = 0;

    function trocarSlide() {
        // remove active de todos
        slides.forEach(slide => slide.classList.remove("active"));

        // incrementa o índice
        index = (index + 1) % slides.length;

        // adiciona active ao slide atual
        slides[index].classList.add("active");
    }

    // troca a cada 8 segundos
    setInterval(trocarSlide, 8000);
});
 // Atualiza o ano no rodapé
 document.getElementById('currentYear').textContent = new Date().getFullYear();
