// Página pública: escolher a poltrona sem pagamento e sem login
import * as R from "./venda-regras.js?v=18";
import { htmlOnibus } from "./mapa-onibus.js?v=1";
import { htmlOpcionais, ligarOpcionais, resumoOpcionais } from "./opcionais-ui.js?v=1";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const primeiro = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const exId = new URLSearchParams(location.search).get("e") || "";
let EX = null, seq = 0;
const S = { pessoas: [], ativo: 0, veic: null };
/*
 * Pessoa: { id, nome, docTipo, docNumero, colo, nascimento, com (id do adulto), assento }
 * + quando o documento já estava cadastrado: vid, existente { nome, poltrona, podeAlterar },
 *   manter (fica como está) ou original (poltrona de antes, enquanto altera)
 */
const nova = (colo = false) => ({ id: "p" + seq++, nome: "", docTipo: colo ? "CERTIDAO" : "RG", docNumero: "", colo, nascimento: "", com: "", assento: null, opcionais: [] });
const precisaPoltrona = (p) => !p.colo && !p.manter;
const adultos = () => S.pessoas.filter((p) => !p.colo);
const nomeCurto = (p) => primeiro(p.nome) || `Pessoa ${S.pessoas.indexOf(p) + 1}`;

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
  EX.idadeColo ??= R.IDADE_COLO;
  document.title = `Poltrona: ${EX.destino} | ${EX.agencia || "Garbosa Turismo"}`;
  $("#pAgencia").textContent = EX.agencia || "Excursão";
  $("#pDestino").textContent = EX.destino;
  mostrarSeloVagas($("#pDestino"));
  $("#pSaida").textContent = `${R.fData(EX.dataSaida)}${EX.horaSaida ? " às " + EX.horaSaida : ""}`;
  $("#pRetorno").textContent = `${R.fData(EX.dataRetorno)}${EX.horaRetorno ? " às " + EX.horaRetorno : ""}`;
  $("#pLocal").textContent = EX.localSaida || "A combinar";
  $("#idadeColo").textContent = EX.idadeColo;
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

/** Selo automático no topo: "Últimas vagas" (faltando 30% ou menos) ou "Esgotado" */
function mostrarSeloVagas(h1) {
  document.querySelector(".cp-selo-vagas")?.remove();
  const selo = R.seloDosVeiculos(EX.veiculos);
  if (!selo || !h1) return;
  const livres = EX.veiculos.reduce((s, v) => s + v.cap - v.ocupadas.length, 0);
  h1.insertAdjacentHTML("afterend", `<span class="cp-selo-vagas ${selo}">${selo === "esgotado"
    ? '<i class="fa-solid fa-ban"></i> Esgotado'
    : `<i class="fa-solid fa-fire"></i> Últimas vagas · ${livres} poltrona${livres > 1 ? "s" : ""} livre${livres > 1 ? "s" : ""}`}</span>`);
}

function etapa(n, rolar = true) {
  [1, 2, 3].forEach((k) => $(`#etapa${k}`).classList.toggle("hidden", k !== n));
  $$(".cp-passos li").forEach((li) => { const k = +li.dataset.passo; li.classList.toggle("ativo", k === n); li.classList.toggle("feito", k < n); });
  if (n === 2) renderMapa();
  if (rolar) $(".cp-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- 1. dados ---------- */
function opcoesColo(p) {
  const ads = adultos();
  if (!ads.some((a) => a.id === p.com)) p.com = ads[0]?.id || "";
  return ads.length
    ? ads.map((a) => `<option value="${a.id}" ${a.id === p.com ? "selected" : ""}>${esc(nomeCurto(a))}</option>`).join("")
    : `<option value="">Adicione o adulto primeiro</option>`;
}
function campoDoc(p) {
  const cert = p.docTipo === "CERTIDAO", wpp = R.mascaraTel(EX.whatsappCertidao.slice(2));
  return `
    <label>Documento<select data-c="docTipo">
      <option value="RG" ${!cert ? "selected" : ""}>RG</option>
      <option value="CERTIDAO" ${cert ? "selected" : ""}>Certidão de nascimento</option></select></label>
    <label><span data-doc-rot>${cert ? 'Matrícula da certidão <small class="cp-opc">(opcional)</small>' : "Número do RG"}</span>
      <input data-c="docNumero" value="${esc(p.docNumero)}" maxlength="40" placeholder="${cert ? "Pode deixar em branco" : "MG-12.345.678 ou só os números"}"></label>
    <p class="cp-nota span2 ${cert ? "" : "hidden"}" data-cert><i class="fa-brands fa-whatsapp"></i> A certidão será enviada pelo WhatsApp <strong>${wpp}</strong>. No final aparece o botão para enviar.</p>`;
}
function cartaoMantido(p, i) {
  const x = p.existente;
  return `
    <fieldset class="cp-pessoa cp-fixo" data-id="${p.id}">
      <legend><i class="fa-solid fa-circle-check"></i> Já cadastrado(a)${i ? `<button type="button" class="cp-rem" data-rem="${p.id}" aria-label="Tirar da lista"><i class="fa-solid fa-xmark"></i></button>` : ""}</legend>
      <div class="cp-fixo-linha">
        <span class="cp-fixo-av"><i class="fa-solid fa-${x.colo ? "baby" : "user"}"></i></span>
        <div><strong>${esc(x.nome)}</strong><small>${x.poltrona === "colo" ? "Vai no colo" : x.poltrona ? `Poltrona ${esc(x.poltrona)}` : "Sem poltrona"} · continua como está</small></div>
        ${x.podeAlterar ? `<button type="button" class="btn btn-light btn-sm" data-mudar="${p.id}"><i class="fa-solid fa-pen"></i> Quero mudar</button>` : ""}
      </div>
    </fieldset>`;
}
function renderLista() {
  $("#lista").innerHTML = S.pessoas.map((p, i) => {
    if (p.manter) return cartaoMantido(p, i);
    const rem = i ? `<button type="button" class="cp-rem" data-rem="${p.id}" aria-label="Remover"><i class="fa-solid fa-xmark"></i></button>` : "";
    const alterando = p.vid ? `<em class="cp-tag polt">alterando o cadastro${p.existente?.poltrona && p.existente.poltrona !== "colo" ? ` · era a poltrona ${esc(p.existente.poltrona)}` : ""}</em>` : "";
    if (p.colo) return `
      <fieldset class="cp-pessoa cp-colo-card" data-id="${p.id}">
        <legend><i class="fa-solid fa-baby"></i> Criança de colo ${alterando}${rem}</legend>
        <div class="form-grid">
          <label class="span2">Nome completo da criança<input data-c="nome" value="${esc(p.nome)}" maxlength="120" autocomplete="off"></label>
          <label>Data de nascimento<input type="date" data-c="nascimento" value="${esc(p.nascimento)}" max="${R.hojeBR()}"></label>
          <label>Vai no colo de<select data-c="com">${opcoesColo(p)}</select></label>
          ${campoDoc(p)}
          <p class="cp-nota span2" data-idade></p>
          ${htmlOpcionais(EX.opcionais, p.opcionais)}
        </div>
      </fieldset>`;
    return `
      <fieldset class="cp-pessoa" data-id="${p.id}">
        <legend><i class="fa-solid fa-user"></i> ${i === 0 ? "Viajante" : `Pessoa ${i + 1}`} ${alterando}${rem}</legend>
        <div class="form-grid">
          <label class="span2">Nome completo<input data-c="nome" value="${esc(p.nome)}" maxlength="120" autocomplete="${i ? "off" : "name"}"></label>
          ${campoDoc(p)}
          ${htmlOpcionais(EX.opcionais, p.opcionais)}
        </div>
      </fieldset>`;
  }).join("");

  $$(".cp-pessoa").forEach((fs) => {
    const p = S.pessoas.find((x) => x.id === fs.dataset.id);
    if (p.colo) mostrarIdade(p, fs);
    ligarOpcionais(fs, (ids) => { p.opcionais = ids; });
    $$("[data-c]", fs).forEach((el) => el.addEventListener(el.tagName === "SELECT" || el.type === "date" ? "change" : "input", () => {
      p[el.dataset.c] = el.value;
      fs.classList.remove("erro");
      if (el.dataset.c === "docTipo") {
        const cert = el.value === "CERTIDAO";
        $("[data-cert]", fs).classList.toggle("hidden", !cert);
        $("[data-doc-rot]", fs).innerHTML = cert ? 'Matrícula da certidão <small class="cp-opc">(opcional)</small>' : "Número do RG";
        $("[data-c=docNumero]", fs).placeholder = cert ? "Pode deixar em branco" : "MG-12.345.678 ou só os números";
      }
      if (el.dataset.c === "nome" && !p.colo) atualizarSelectsColo();
      if (el.dataset.c === "nascimento") mostrarIdade(p, fs);
    }));
  });
  $$("[data-rem]").forEach((b) => b.addEventListener("click", () => { S.pessoas = S.pessoas.filter((p) => p.id !== b.dataset.rem); renderLista(); }));
  $$("[data-mudar]").forEach((b) => b.addEventListener("click", () => { alterar(S.pessoas.find((p) => p.id === b.dataset.mudar)); renderLista(); }));
  const cheio = S.pessoas.length >= EX.max;
  $("#btnMais").classList.toggle("hidden", cheio);
  $("#btnColo").classList.toggle("hidden", cheio);
}
function atualizarSelectsColo() {
  S.pessoas.filter((p) => p.colo && !p.manter).forEach((p) => {
    const sel = $(`.cp-pessoa[data-id="${p.id}"] [data-c=com]`);
    if (sel) sel.innerHTML = opcoesColo(p);
  });
}
const idadeNaViagem = (p) => (R.isoValida(p.nascimento) ? R.idadeEm(p.nascimento, EX.dataSaida) : null);
function mostrarIdade(p, fs) {
  const el = $("[data-idade]", fs), idade = idadeNaViagem(p);
  el.classList.toggle("alerta-txt", idade !== null && (idade < 0 || idade > EX.idadeColo));
  el.innerHTML = idade === null ? `<i class="fa-solid fa-circle-info"></i> Até ${EX.idadeColo} anos completos na data da viagem (${R.fData(EX.dataSaida)}).`
    : idade < 0 ? `<i class="fa-solid fa-triangle-exclamation"></i> Confira a data de nascimento.`
    : idade > EX.idadeColo ? `<i class="fa-solid fa-triangle-exclamation"></i> Terá ${idade} anos na viagem: precisa de poltrona. Cadastre em <strong>Adicionar outra pessoa</strong>.`
    : `<i class="fa-solid fa-circle-check"></i> Terá ${idade === 0 ? "menos de 1 ano" : `${idade} ano${idade > 1 ? "s" : ""}`} na viagem: pode ir no colo.`;
}
$("#btnMais").addEventListener("click", () => { S.pessoas.push(nova()); renderLista(); $$(".cp-pessoa").at(-1).querySelector("input").focus(); });
$("#btnColo").addEventListener("click", () => {
  const c = nova(true);
  // ao abrir a criança logo depois de um adulto, ela já vai no colo dele
  const ult = [...S.pessoas].reverse().find((p) => !p.colo); if (ult) c.com = ult.id;
  S.pessoas.push(c); renderLista(); $$(".cp-pessoa").at(-1).querySelector("input").focus();
});

function validar() {
  const vistos = new Map();
  for (let i = 0; i < S.pessoas.length; i++) {
    const p = S.pessoas[i];
    if (p.manter) continue;
    const nome = p.nome.replace(/\s+/g, " ").trim(), quem = primeiro(nome) || `a pessoa ${i + 1}`, doc = R.normDoc(p.docNumero);
    let erro = nome.split(" ").length < 2 ? `Informe o nome completo de ${quem}.`
      : p.docTipo === "RG" && !doc ? `Informe o RG de ${quem} (com ou sem pontos, tanto faz).`
      : doc && vistos.has(doc) ? `${quem} e ${vistos.get(doc)} estão com o mesmo documento. Confira.` : "";
    if (!erro && p.colo) {
      const idade = idadeNaViagem(p);
      erro = idade === null ? `Informe a data de nascimento de ${quem}.`
        : idade < 0 ? `Confira a data de nascimento de ${quem}.`
        : idade > EX.idadeColo ? `${quem} terá ${idade} anos na viagem. No colo só vão crianças de até ${EX.idadeColo} anos completos — cadastre com poltrona.`
        : !adultos().some((a) => a.id === p.com) ? `Escolha no colo de quem ${quem} vai (adicione o adulto na lista).` : "";
    }
    if (doc) vistos.set(doc, quem);
    if (erro) { const fs = $$(".cp-pessoa")[i]; fs.classList.add("erro"); fs.scrollIntoView({ behavior: "smooth", block: "center" }); return erro; }
  }
  if (!adultos().length) return "Adicione o adulto que vai levar a criança no colo.";
  return "";
}

/* ---------- documento já cadastrado: pop-up ---------- */
function alterar(p) {
  p.manter = false;
  p.colo = !!p.existente?.colo;
  p.original = p.existente?.assento || null;
  p.assento = p.original;
  p.opcionais = [...(p.existente?.opcionais || [])];
}
function popup(p, achado) {
  return new Promise((ok) => {
    const doc = p.docNumero.trim();
    const onde = achado.poltrona === "colo" ? "vai no colo" : achado.poltrona ? `na poltrona <strong>${esc(achado.poltrona)}</strong>` : "sem poltrona definida";
    const wpp = `https://wa.me/${EX.whatsappCertidao}?text=${encodeURIComponent(`Olá! Quero mudar um cadastro na excursão ${EX.destino} (${R.fData(EX.dataSaida)}). Documento: ${doc}`)}`;
    const fundo = document.createElement("div");
    fundo.className = "modal-backdrop pp-fundo";
    fundo.innerHTML = `
      <div class="modal pp-modal" role="dialog" aria-modal="true" aria-labelledby="ppTit" aria-describedby="ppTxt">
        <div class="pp-topo">
          <span class="pp-ic"><i class="fa-solid fa-id-card-clip"></i></span>
          <h3 id="ppTit">Esse documento já está na lista!</h3>
          <p id="ppTxt">O documento <strong>${esc(doc)}</strong> já foi cadastrado nesta excursão.</p>
        </div>
        <div class="pp-corpo">
          <div class="pp-cartao">
            <span class="cp-fixo-av"><i class="fa-solid fa-${achado.colo ? "baby" : "user"}"></i></span>
            <div><strong>${esc(achado.nome)}</strong><small>${onde}</small></div>
          </div>
          <p class="pp-perg">${achado.podeAlterar ? "Você quer mudar alguma coisa?" : "Este cadastro foi feito pela agência. Para mudar algo, fale com ela."}</p>
          <div class="pp-acoes">
            ${achado.podeAlterar
              ? `<button type="button" class="btn btn-primary btn-block" data-r="alterar"><i class="fa-solid fa-pen"></i> Sim, quero mudar <small>trocar a poltrona ou corrigir o nome</small></button>
                 <button type="button" class="btn btn-light btn-block" data-r="manter"><i class="fa-solid fa-check"></i> Não, está tudo certo</button>`
              : `<button type="button" class="btn btn-primary btn-block" data-r="manter"><i class="fa-solid fa-check"></i> Está certo, deixar como está</button>
                 <a class="btn btn-wpp btn-block" href="${wpp}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Falar com a agência</a>`}
            <button type="button" class="link-btn" data-r="corrigir">Digitei o documento errado</button>
          </div>
        </div>
      </div>`;
    const fechar = (r) => { document.removeEventListener("keydown", tecla); fundo.classList.add("saindo"); setTimeout(() => fundo.remove(), 160); ok(r); };
    const tecla = (e) => { if (e.key === "Escape") fechar("corrigir"); };
    fundo.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) fechar(b.dataset.r); else if (e.target === fundo) fechar("corrigir"); });
    document.addEventListener("keydown", tecla);
    document.body.appendChild(fundo);
    $("[data-r]", fundo).focus();
  });
}
/** Compara os documentos com quem já está na excursão. Devolve false se a pessoa quis corrigir algo. */
async function conferirDocumentos() {
  const alvo = S.pessoas.filter((p) => !p.vid && R.normDoc(p.docNumero));
  if (!alvo.length) return true;
  let r;
  try { r = await api({ acao: "conferir", e: exId, docs: alvo.map((p) => p.docNumero) }); }
  catch { return true; } // o servidor confere de novo ao salvar
  for (const achado of r.encontrados) {
    const p = alvo[achado.i];
    const escolha = await popup(p, achado);
    if (escolha === "corrigir") {
      renderLista();
      const fs = $(`.cp-pessoa[data-id="${p.id}"]`);
      fs?.classList.add("erro");
      const inp = fs && $("[data-c=docNumero]", fs); inp?.focus(); inp?.select();
      msg(1, `Corrija o documento de ${nomeCurto(p)} e toque em continuar.`, "info");
      return false;
    }
    p.vid = achado.vid;
    p.existente = achado;
    if (escolha === "manter") { p.manter = true; p.assento = null; }
    else alterar(p);
  }
  return true;
}

async function continuar() {
  const e = validar();
  if (e) return msg(1, e);
  msg(1, "Conferindo…", "info");
  $("#btnIr2").disabled = true;
  try {
    if (!(await conferirDocumentos())) return;
    msg(1, "");
    renderLista();
    const e2 = validar(); // quem alterou um cadastro de colo pode precisar completar a data
    if (e2) return msg(1, e2);
    if (S.pessoas.every((p) => p.manter)) return mostrarResumo(S.pessoas.map((p) => ({ nome: p.existente.nome, poltrona: p.existente.poltrona || "colo", mantido: true })), true);
    if (!S.pessoas.some(precisaPoltrona)) return salvar(1);
    await atualizar();
    S.ativo = S.pessoas.findIndex((p) => precisaPoltrona(p) && !p.assento);
    if (S.ativo < 0) S.ativo = S.pessoas.findIndex(precisaPoltrona);
    etapa(2);
  } finally { $("#btnIr2").disabled = false; }
}
$("#btnIr2").addEventListener("click", continuar);
$("#btnVolta").addEventListener("click", () => etapa(1));

/* ---------- 2. mapa ---------- */
async function atualizar() {
  try { const novo = await api(); EX.veiculos = novo.veiculos; } catch { /* mantém */ }
  S.pessoas.forEach((p) => {
    if (!p.assento) return;
    const v = EX.veiculos.find((x) => x.id === p.assento.vk);
    const eraDela = p.original && p.original.vk === p.assento.vk && p.original.n === p.assento.n;
    if (!v || (!eraDela && v.ocupadas.includes(p.assento.n))) p.assento = null;
  });
}
/** Ocupadas do veículo sem contar as poltronas de quem está alterando o próprio cadastro */
const ocupadasDe = (v) => {
  const minhasAntes = new Set(S.pessoas.filter((p) => !p.manter && p.original?.vk === v.id).map((p) => p.original.n));
  return new Set(v.ocupadas.filter((n) => !minhasAntes.has(n)));
};
const rotulo = (a) => { const i = EX.veiculos.findIndex((v) => v.id === a.vk); return EX.veiculos.length > 1 ? `V${i + 1} · ${a.n}` : `${a.n}`; };
function renderMapa() {
  const sentam = S.pessoas.filter(precisaPoltrona);
  const falta = sentam.filter((p) => !p.assento).length;
  const ativo = S.pessoas[S.ativo];
  const pos = sentam.indexOf(ativo);
  $("#instrucao").innerHTML = falta
    ? `Toque numa poltrona <b class="verde">verde</b> para <strong>${esc(primeiro(ativo.nome))}</strong>${sentam.length > 1 ? ` <small>(${pos + 1} de ${sentam.length})</small>` : ""}`
    : `<i class="fa-solid fa-circle-check"></i> Pronto! Confira e toque em <strong>Confirmar poltrona</strong>.`;
  const outros = S.pessoas.filter((p) => !precisaPoltrona(p));
  $("#quem").innerHTML = sentam.length > 1 || outros.length
    ? sentam.map((p) => { const i = S.pessoas.indexOf(p); return `<button type="button" class="cp-q ${i === S.ativo ? "ativo" : ""} ${p.assento ? "ok" : ""}" data-i="${i}"><span class="ord">${sentam.indexOf(p) + 1}</span>${esc(primeiro(p.nome))}${p.assento ? `<em>${rotulo(p.assento)}</em>` : ""}</button>`; }).join("")
      + outros.map((p) => p.manter
        ? `<span class="cp-q colo"><i class="fa-solid fa-circle-check"></i>${esc(primeiro(p.existente.nome))}<em>${p.existente.poltrona === "colo" ? "colo" : esc(p.existente.poltrona)} · mantido</em></span>`
        : `<span class="cp-q colo"><i class="fa-solid fa-baby"></i>${esc(primeiro(p.nome))}<em>colo de ${esc(nomeCurto(S.pessoas.find((a) => a.id === p.com) || {}))}</em></span>`).join("")
    : "";
  $$(".cp-q[data-i]").forEach((b) => b.addEventListener("click", () => { S.ativo = +b.dataset.i; const a = S.pessoas[S.ativo].assento; if (a) S.veic = a.vk; renderMapa(); }));
  if (!EX.veiculos.find((v) => v.id === S.veic)) S.veic = EX.veiculos[0]?.id;
  $("#veics").innerHTML = EX.veiculos.length > 1 ? EX.veiculos.map((v, i) => `<button type="button" class="vtab ${v.id === S.veic ? "active" : ""}" data-vk="${v.id}">Veículo ${i + 1} · ${esc(v.nome)} <span class="pill">${v.cap - ocupadasDe(v).size - sentam.filter((p) => p.assento?.vk === v.id).length} livres</span></button>`).join("") : "";
  $$("#veics [data-vk]").forEach((b) => b.addEventListener("click", () => { S.veic = b.dataset.vk; renderMapa(); }));
  const v = EX.veiculos.find((x) => x.id === S.veic);
  $("#mapa").innerHTML = v ? desenhar(v) : `<p class="vazio">Esta excursão ainda não tem veículo.</p>`;
  $$("#mapa .seat[data-n]").forEach((el) => el.addEventListener("click", () => escolher(v.id, +el.dataset.n)));
  $("#btnSalvar").disabled = falta > 0;
}
function desenhar(v) {
  const meus = Object.fromEntries(S.pessoas.filter((p) => precisaPoltrona(p) && p.assento?.vk === v.id).map((p) => [p.assento.n, p]));
  const ocup = ocupadasDe(v);
  const seat = (n) => {
    const p = meus[n];
    if (p) return `<button type="button" class="seat minha" data-n="${n}" aria-label="Poltrona ${n}: ${esc(p.nome)}"><span class="sn">${n}</span><span class="snome">${esc(primeiro(p.nome))}</span></button>`;
    if (ocup.has(n)) return `<span class="seat reservada" aria-label="Poltrona ${n} reservada"><span class="sn">${n}</span></span>`;
    return `<button type="button" class="seat livre" data-n="${n}" aria-label="Poltrona ${n} disponível"><span class="sn">${n}</span></button>`;
  };
  return htmlOnibus(R.plantaVeiculo(v.tipo, v.cap), seat, v.cap);
}
function escolher(vk, n) {
  const dono = S.pessoas.find((p) => precisaPoltrona(p) && p.assento?.vk === vk && p.assento.n === n);
  if (dono) { dono.assento = null; S.ativo = S.pessoas.indexOf(dono); return renderMapa(); }
  S.pessoas[S.ativo].assento = { vk, n };
  const prox = S.pessoas.findIndex((p, i) => precisaPoltrona(p) && !p.assento && i > S.ativo);
  const qualquer = S.pessoas.findIndex((p) => precisaPoltrona(p) && !p.assento);
  if (prox >= 0) S.ativo = prox; else if (qualquer >= 0) S.ativo = qualquer;
  renderMapa();
}

/* ---------- 3. salvar ---------- */
function corpoPessoa(p) {
  if (p.manter) return { vid: p.vid, docNumero: p.docNumero, manter: true };
  return {
    nome: p.nome, docTipo: p.docTipo, docNumero: p.docNumero, vid: p.vid || undefined,
    colo: p.colo, nascimento: p.colo ? p.nascimento : "", com: p.colo ? S.pessoas.findIndex((a) => a.id === p.com) : undefined,
    assento: p.colo ? null : p.assento, opcionais: resumoOpcionais(EX.opcionais, p.opcionais).ids
  };
}
async function salvar(n) {
  msg(n, "Salvando…", "info");
  $("#btnSalvar").disabled = true;
  try {
    const r = await api({ e: exId, pessoas: S.pessoas.map(corpoPessoa) });
    msg(n, "");
    mostrarResumo(r.poltronas);
  } catch (e) {
    $("#btnSalvar").disabled = false;
    if (e.dados?.poltronasOcupadas) { await atualizar(); etapa(2); return msg(2, e.message); }
    if (Array.isArray(e.dados?.jaCadastrados)) {
      // alguém cadastrou o mesmo documento enquanto escolhia: pergunta de novo
      etapa(1); msg(1, "");
      return continuar();
    }
    if (Number.isInteger(e.dados?.pessoa)) { etapa(1); $$(".cp-pessoa")[e.dados.pessoa]?.classList.add("erro"); return msg(1, e.message); }
    msg(n, e.message);
  }
}
$("#btnSalvar").addEventListener("click", () => salvar(2));

function mostrarResumo(lista, nadaMudou = false) {
  $("#etapa3 h2").textContent = nadaMudou ? "Tudo certo, nada mudou!" : lista.some((x) => x.alterado) ? "Cadastro atualizado!" : "Poltrona garantida!";
  $("#resumo").innerHTML = lista.map((x) => `<div class="cp-linha"><span>${esc(x.nome)}${x.colo ? ` <em class="cp-tag colo">colo</em>` : ""}${x.certidao ? ` <em class="cp-tag colo">certidão</em>` : ""}${x.alterado ? ` <em class="cp-tag polt">alterado</em>` : ""}${x.mantido ? ` <em class="cp-tag cupom">já estava</em>` : ""}${(x.opcionais || []).map((t) => ` <em class="cp-tag opc">+ ${esc(t)}</em>`).join("")}</span><strong>${x.poltrona === "colo" ? "No colo" : `Poltrona ${esc(x.poltrona)}`}</strong></div>`).join("");
  const cert = lista.filter((x) => x.certidao);
  $("#certidao").classList.toggle("hidden", !cert.length);
  if (cert.length) {
    const txt = `Olá! Segue a certidão de nascimento para a excursão ${EX.destino} (${R.fData(EX.dataSaida)}):\n${cert.map((x) => `• ${x.nome} — ${x.poltrona === "colo" ? "criança de colo" : `poltrona ${x.poltrona}`}`).join("\n")}`;
    $("#btnWpp").href = `https://wa.me/${EX.whatsappCertidao}?text=${encodeURIComponent(txt)}`;
  }
  etapa(3);
}
$("#btnOutra").addEventListener("click", async () => {
  S.pessoas = [nova()]; S.ativo = 0;
  renderLista(); await atualizar(); etapa(1);
});

carregar();
