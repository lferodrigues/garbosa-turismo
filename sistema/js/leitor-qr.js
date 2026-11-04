// Leitor de QR Code pela câmera do celular. Precisa de https (ou localhost) e da permissão da câmera.
const LIB = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const LARGURA = 640, INTERVALO_MS = 200;
let lib;

const carregarLib = () => lib || (lib = new Promise((ok, erro) => {
  const s = document.createElement("script");
  s.src = LIB; s.onload = ok;
  s.onerror = () => { lib = null; erro(new Error("Não foi possível carregar o leitor. Verifique a internet.")); };
  document.head.appendChild(s);
}));

function mensagemCamera(e) {
  if (e?.name === "NotAllowedError") return "A câmera foi bloqueada. Libere a câmera para este site nas permissões do navegador.";
  if (e?.name === "NotFoundError") return "Nenhuma câmera encontrada neste aparelho.";
  if (e?.name === "NotReadableError") return "A câmera está em uso por outro aplicativo.";
  return e?.message || "Não foi possível abrir a câmera.";
}

/** Liga a câmera e chama aoLer(texto) a cada QR Code encontrado. Devolve a função que desliga. */
export async function iniciarLeitor(video, aoLer) {
  let stream;
  try {
    await carregarLib();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite usar a câmera aqui.");
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    throw new Error(mensagemCamera(e));
  }
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  let ligado = true, timer;
  const ler = () => {
    if (!ligado) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const esc = Math.min(1, LARGURA / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * esc); canvas.height = Math.round(video.videoHeight * esc);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (qr?.data) aoLer(qr.data);
    }
    timer = setTimeout(ler, INTERVALO_MS);
  };
  ler();
  return () => {
    ligado = false; clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
