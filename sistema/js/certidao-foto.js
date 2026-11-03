/* Foto da certidão de nascimento: tirada no celular ou escolhida da galeria.
   A imagem é reduzida no navegador e sempre sai em JPEG (a conversão também descarta a localização gravada na foto). */
const LADO_MAX = 1600, ALVO = 1200 * 1024;

export async function prepararFoto(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error("Não foi possível abrir esta foto. Tire outra foto ou escolha uma imagem JPG ou PNG."); });
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82, dados = c.toDataURL("image/jpeg", q);
    while (dados.length * 0.75 > ALVO && q > 0.45) { q -= 0.12; dados = c.toDataURL("image/jpeg", q); }
    return dados;
  } finally { URL.revokeObjectURL(url); }
}

/** Chamada à API das certidões. Sem `token` é a rota pública do link da excursão. */
export async function apiCertidao(corpo, token) {
  const r = await fetch("/api/site-imagem?certidao=1", { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || "Não foi possível enviar a foto. Tente de novo.");
  return d;
}

export async function fotoAtiva() {
  const r = await fetch("/api/site-imagem?certidao=1&status=1").catch(() => null);
  return !!r?.ok && (await r.json().catch(() => ({}))).ativo === true;
}

/** HTML do campo. `previa` mostra a foto já escolhida. */
export const htmlFoto = (previa = "", nota = "") => `
  <div class="cert-foto span2">
    <input type="file" accept="image/*" class="hidden" data-cert-arq>
    <img class="cert-previa ${previa ? "" : "hidden"}" data-cert-previa src="${previa}" alt="Prévia da certidão de nascimento">
    <button type="button" class="btn btn-light btn-block" data-cert-btn><i class="fa-solid fa-camera"></i> <span>${previa ? "Trocar a foto" : "Tirar foto ou escolher arquivo"}</span></button>
    <p class="cp-nota" data-cert-st>${nota}</p>
  </div>`;

/** Liga o campo: onFoto(dataUrl) guarda ou envia a foto e pode devolver o texto de sucesso */
export function ligarFoto(el, onFoto) {
  const arq = el.querySelector("[data-cert-arq]"), btn = el.querySelector("[data-cert-btn]"), st = el.querySelector("[data-cert-st]"), img = el.querySelector("[data-cert-previa]");
  btn.addEventListener("click", () => arq.click());
  arq.addEventListener("change", async () => {
    const f = arq.files[0];
    arq.value = "";
    if (!f) return;
    btn.disabled = true; st.classList.remove("alerta-txt"); st.textContent = "Enviando a foto…";
    try {
      const dados = await prepararFoto(f);
      const texto = await onFoto(dados);
      img.src = dados; img.classList.remove("hidden");
      btn.querySelector("span").textContent = "Trocar a foto";
      st.textContent = texto || "Foto enviada.";
    } catch (e) { st.classList.add("alerta-txt"); st.textContent = e.message; }
    btn.disabled = false;
  });
}
