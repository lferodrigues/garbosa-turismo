// Página pública: escolher a poltrona sem pagamento e sem login
import * as R from "./venda-regras.js?v=16";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const primeiro = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const exId = new URLSearchParams(location.search).get("e") || "";
let EX = null, seq = 0;
const S = { pessoas: [], ativo: 0, veic: null };
const nova = () => ({ id: "p" + seq++, nome: "", docTipo: "RG", docNumero: "", assento: null });

const inicio = Date.now();
const mostrar = (id) => setTimeout(() => { $("#loading").classList.add("hidden"); $(id).classList.remove("hidden"); }, Math.max(0, 1200 - (Date.now() - inicio)));
const fechada = (t, x) => { $("#fechTitulo").textContent = t; $("#fechTexto").textContent = x; mostrar("#fechada"); };
const msg = (n, t, tipo = "erro") => { const m = $(`#msg${n}`); m.textContent = t; m.className = "login-msg " + tipo; };

async function api(corpo) {
  const r = await fetch(corpo ? "/api/poltrona-livre" : `/api/poltrona-livre?e=${encodeURIComponent(exId)}`,
    corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : {});
  let d = {}; try { d = await r.json(); } catch { /* vazio */ }
  if (!r.ok) { const e = new Error(d.erro || "Não foi possível falar com o servidor."); e.dados = d; e.status = r.status; throw e; }
  return d;
}

async function carregar() {
  if (!/^[\w-]{6,40}$/.test(exId)) return fechada("Link inválido", "Confira o link enviado pela agência.");
  try { EX = await api(); } catch (e) { return fechada(e.status === 404 ? "Excursão não encontrada" : "Escolha encerrada", e.message); }
  document.title = `Poltrona: ${EX.destino} | ${EX.agencia || "Garbosa Turismo"}`;
  $("#pAgencia").textContent = EX.agencia || "Excursão";
  $("#pDestino").textContent = EX.destino;
  $("#pSaida").textContent = `${R.fData(EX.dataSaida)}${EX.horaSaida ? " às " + EX.horaSaida : ""}`;
  $("#pRetorno").textContent = `${R.fData(EX.dataRetorno)}${EX.horaRetorno ? " às " + EX.horaRetorno : ""}`;
  $("#pLocal").textContent = EX.localSaida || "A combinar";
  if (EX.folder?.caminho) {
    const img = $("#pFolder");
    img.onerror = () => { if (EX.folder.raw && img.src !== EX.folder.raw) img.src = EX.folder.raw; else img.classList.add("hidden"); };
    img.src = "../" + EX.folder.caminho; img.classList.remove("hidden");
  }
  S.veic = EX.veiculos[0]?.id || null;
  S.pessoas = [nova()];
  renderLista(); etapa(1, false);
  mostrar("#pagina");
}

function etapa(n, rolar = true) {
  [1, 2, 3].forEach((k) => $(`#etapa${k}`).classList.toggle("hidden", k !== n));
  $$(".cp-passos li").forEach((li) => { const k = +li.dataset.passo; li.classList.toggle("ativo", k === n); li.classList.toggle("feito", k < n); });
  if (n === 2) renderMapa();
  if (rolar) $(".cp-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- 1. dados ---------- */
function renderLista() {
  const wpp = R.mascaraTel(EX.whatsappCertidao.slice(2));
  $("#lista").innerHTML = S.pessoas.map((p, i) => `
    <fieldset class="cp-pessoa" data-id="${p.id}">
      <legend><i class="fa-solid fa-user"></i> ${i === 0 ? "Viajante" : `Pessoa ${i + 1}`}${i ? `<button type="button" class="cp-rem" data-rem="${p.id}" aria-label="Remover"><i class="fa-solid fa-xmark"></i></button>` : ""}</legend>
      <div class="form-grid">
        <label class="span2">Nome completo<input data-c="nome" value="${esc(p.nome)}" maxlength="120" autocomplete="${i ? "off" : "name"}"></label>
        <label>Documento<select data-c="docTipo">
          <option value="RG" ${p.docTipo === "RG" ? "selected" : ""}>RG</option>
          <option value="CERTIDAO" ${p.docTipo === "CERTIDAO" ? "selected" : ""}>Certidão de nascimento</option></select></label>
        <label class="${p.docTipo === "CERTIDAO" ? "hidden" : ""}" data-rg>Número do RG<input data-c="docNumero" value="${esc(p.docNumero)}" maxlength="30" placeholder="MG-12.345.678"></label>
        <p class="cp-nota span2 ${p.docTipo === "CERTIDAO" ? "" : "hidden"}" data-cert><i class="fa-brands fa-whatsapp"></i> A certidão será enviada pelo WhatsApp <strong>${wpp}</strong>. No final aparece o botão para enviar.</p>
      </div>
    </fieldset>`).join("");
  $$(".cp-pessoa").forEach((fs) => {
    const p = S.pessoas.find((x) => x.id === fs.dataset.id);
    $$("[data-c]", fs).forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      p[el.dataset.c] = el.value;
      fs.classList.remove("erro");
      if (el.dataset.c === "docTipo") { $("[data-rg]", fs).classList.toggle("hidden", el.value === "CERTIDAO"); $("[data-cert]", fs).classList.toggle("hidden", el.value !== "CERTIDAO"); }
    }));
  });
  $$("[data-rem]").forEach((b) => b.addEventListener("click", () => { S.pessoas = S.pessoas.filter((p) => p.id !== b.dataset.rem); renderLista(); }));
  $("#btnMais").classList.toggle("hidden", S.pessoas.length >= EX.max);
}
$("#btnMais").addEventListener("click", () => { S.pessoas.push(nova()); renderLista(); $$(".cp-pessoa").at(-1).querySelector("input").focus(); });
function validar() {
  for (let i = 0; i < S.pessoas.length; i++) {
    const p = S.pessoas[i], nome = p.nome.replace(/\s+/g, " ").trim(), quem = primeiro(nome) || `a pessoa ${i + 1}`;
    const erro = nome.split(" ").length < 2 ? `Informe o nome completo de ${quem}.`
      : p.docTipo === "RG" && p.docNumero.replace(/\W/g, "").length < 4 ? `Informe o RG de ${quem}.` : "";
    if (erro) { $$(".cp-pessoa")[i].classList.add("erro"); $$(".cp-pessoa")[i].scrollIntoView({ behavior: "smooth", block: "center" }); return erro; }
  }
  return "";
}
$("#btnIr2").addEventListener("click", async () => {
  const e = validar();
  if (e) return msg(1, e);
  msg(1, "");
  await atualizar();
  S.ativo = S.pessoas.findIndex((p) => !p.assento); if (S.ativo < 0) S.ativo = 0;
  etapa(2);
});
$("#btnVolta").addEventListener("click", () => etapa(1));

/* ---------- 2. mapa ---------- */
async function atualizar() {
  try { const novo = await api(); EX.veiculos = novo.veiculos; } catch { /* mantém */ }
  S.pessoas.forEach((p) => { const v = p.assento && EX.veiculos.find((x) => x.id === p.assento.vk); if (p.assento && (!v || v.ocupadas.includes(p.assento.n))) p.assento = null; });
}
const rotulo = (a) => { const i = EX.veiculos.findIndex((v) => v.id === a.vk); return EX.veiculos.length > 1 ? `V${i + 1} · ${a.n}` : `${a.n}`; };
function renderMapa() {
  const falta = S.pessoas.filter((p) => !p.assento).length;
  const ativo = S.pessoas[S.ativo];
  $("#instrucao").innerHTML = falta
    ? `Toque numa poltrona <b class="verde">verde</b> para <strong>${esc(primeiro(ativo.nome))}</strong>${S.pessoas.length > 1 ? ` <small>(${S.ativo + 1} de ${S.pessoas.length})</small>` : ""}`
    : `<i class="fa-solid fa-circle-check"></i> Pronto! Confira e toque em <strong>Confirmar poltrona</strong>.`;
  $("#quem").innerHTML = S.pessoas.length > 1 ? S.pessoas.map((p, i) => `<button type="button" class="cp-q ${i === S.ativo ? "ativo" : ""} ${p.assento ? "ok" : ""}" data-i="${i}"><span class="ord">${i + 1}</span>${esc(primeiro(p.nome))}${p.assento ? `<em>${rotulo(p.assento)}</em>` : ""}</button>`).join("") : "";
  $$(".cp-q[data-i]").forEach((b) => b.addEventListener("click", () => { S.ativo = +b.dataset.i; const a = S.pessoas[S.ativo].assento; if (a) S.veic = a.vk; renderMapa(); }));
  if (!EX.veiculos.find((v) => v.id === S.veic)) S.veic = EX.veiculos[0]?.id;
  $("#veics").innerHTML = EX.veiculos.length > 1 ? EX.veiculos.map((v, i) => `<button type="button" class="vtab ${v.id === S.veic ? "active" : ""}" data-vk="${v.id}">Veículo ${i + 1} · ${esc(v.nome)} <span class="pill">${v.cap - v.ocupadas.length - S.pessoas.filter((p) => p.assento?.vk === v.id).length} livres</span></button>`).join("") : "";
  $$("#veics [data-vk]").forEach((b) => b.addEventListener("click", () => { S.veic = b.dataset.vk; renderMapa(); }));
  const v = EX.veiculos.find((x) => x.id === S.veic);
  $("#mapa").innerHTML = v ? desenhar(v) : `<p class="vazio">Esta excursão ainda não tem veículo.</p>`;
  $$("#mapa .seat[data-n]").forEach((el) => el.addEventListener("click", () => escolher(v.id, +el.dataset.n)));
  $("#btnSalvar").disabled = falta > 0;
}
function desenhar(v) {
  const meus = Object.fromEntries(S.pessoas.filter((p) => p.assento?.vk === v.id).map((p) => [p.assento.n, p]));
  const ocup = new Set(v.ocupadas);
  const seat = (n) => {
    const p = meus[n];
    if (p) return `<button type="button" class="seat minha" data-n="${n}" aria-label="Poltrona ${n}: ${esc(p.nome)}"><span class="sn">${n}</span><span class="snome">${esc(primeiro(p.nome))}</span></button>`;
    if (ocup.has(n)) return `<span class="seat reservada" aria-label="Poltrona ${n} reservada"><span class="sn">${n}</span></span>`;
    return `<button type="button" class="seat livre" data-n="${n}" aria-label="Poltrona ${n} disponível"><span class="sn">${n}</span></button>`;
  };
  const linhas = R.layoutAssentos(v.cap);
  return `<div class="bus ${v.cap <= 20 ? "bus-van" : ""}">
    <div class="bus-front"><span class="driver"><i class="fa-solid fa-dharmachakra"></i> Motorista</span><span class="door">Porta</span></div>
    <div class="bus-body">${linhas.map((l) => `<div class="bus-row"><div class="side">${l.esq.map(seat).join("")}</div><div class="aisle"></div><div class="side">${l.dir.map(seat).join("")}${l.wc ? `<div class="wc">WC</div>` : ""}</div></div>`).join("")}
      <div class="corredor-label">CORREDOR</div></div>
    ${v.cap > 20 && !linhas.some((l) => l.wc) ? `<div class="bus-back">Toalete</div>` : ""}
  </div>`;
}
function escolher(vk, n) {
  const dono = S.pessoas.find((p) => p.assento?.vk === vk && p.assento.n === n);
  if (dono) { dono.assento = null; S.ativo = S.pessoas.indexOf(dono); return renderMapa(); }
  S.pessoas[S.ativo].assento = { vk, n };
  const prox = S.pessoas.findIndex((p, i) => !p.assento && i > S.ativo);
  const qualquer = S.pessoas.findIndex((p) => !p.assento);
  if (prox >= 0) S.ativo = prox; else if (qualquer >= 0) S.ativo = qualquer;
  renderMapa();
}

/* ---------- 3. salvar ---------- */
$("#btnSalvar").addEventListener("click", async () => {
  msg(2, "Salvando…", "info");
  $("#btnSalvar").disabled = true;
  try {
    const r = await api({ e: exId, pessoas: S.pessoas.map((p) => ({ nome: p.nome, docTipo: p.docTipo, docNumero: p.docTipo === "RG" ? p.docNumero : "", assento: p.assento })) });
    msg(2, "");
    $("#resumo").innerHTML = r.poltronas.map((x) => `<div class="cp-linha"><span>${esc(x.nome)}${x.certidao ? ` <em class="cp-tag colo">certidão</em>` : ""}</span><strong>Poltrona ${esc(x.poltrona)}</strong></div>`).join("");
    const cert = r.poltronas.filter((x) => x.certidao);
    $("#certidao").classList.toggle("hidden", !cert.length);
    if (cert.length) {
      const txt = `Olá! Segue a certidão de nascimento para a excursão ${EX.destino} (${R.fData(EX.dataSaida)}):\n${cert.map((x) => `• ${x.nome} — poltrona ${x.poltrona}`).join("\n")}`;
      $("#btnWpp").href = `https://wa.me/${EX.whatsappCertidao}?text=${encodeURIComponent(txt)}`;
    }
    etapa(3);
  } catch (e) {
    $("#btnSalvar").disabled = false;
    if (e.dados?.poltronasOcupadas) { await atualizar(); renderMapa(); return msg(2, e.message); }
    if (Number.isInteger(e.dados?.pessoa)) { etapa(1); return msg(1, e.message); }
    msg(2, e.message);
  }
});
$("#btnOutra").addEventListener("click", async () => {
  S.pessoas = [nova()]; S.ativo = 0;
  renderLista(); await atualizar(); etapa(1);
});

carregar();
