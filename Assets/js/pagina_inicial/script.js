
// MENU HAMBURGUER

const hamburger = document.getElementById("hamburger");
const navLinks = document.getElementById("nav-links");

hamburger.addEventListener("click", () => {
    navLinks.classList.toggle("open");
});


// SLIDER INFINITO
const slider = document.getElementById("slider");
slider.innerHTML += slider.innerHTML;

function onClick(element) {
  document.getElementById("img01").src = element.src;
  document.getElementById("modal01").style.display = "block";
  var captionText = document.getElementById("caption");
  captionText.innerHTML = element.alt;
}

/* ----- SLIDESHOW SOBRE ----- */




