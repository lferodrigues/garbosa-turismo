// Página pública de compra: viajantes → poltronas → pagamento no Asaas
import * as R from "./venda-regras.js?v=9";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const primeiro = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const exId = new URLSearchParams(location.search).get("e") || "";
const CHAVE = `garbosa.compra.${exId}`;

let EX = null;
const S = { pessoas: [], cupom: null, etapa: 1, veic: null, ativo: 0, forma: "", parcelas: { CREDIT_CARD: 1, BOLETO: 1 } };

/* ---------- carregar ---------- */
const inicio = Date.now();
function mostrar(id) {
  setTimeout(() => { $("#loading").classList.add("hidden"); $(id).classList.remove("hidden"); }, Math.max(0, 1300 - (Date.now() - inicio)));
}
function fechada(titulo, texto) { $("#fechTitulo").textContent = titulo; $("#fechTexto").textContent = texto; mostrar("#fechada"); }

async function api(caminho, corpo) {
  const r = await fetch(caminho, corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : {});
  let dados = {};
  try { dados = await r.json(); } catch { /* resposta vazia */ }
  if (!r.ok) { const e = new Error(dados.erro || "Não foi possível falar com o servidor."); e.dados = dados; e.status = r.status; throw e; }
  return dados;
}

async function carregar() {
  if (!/^[\w-]{6,40}$/.test(exId)) return fechada("Link inválido", "Confira o link enviado pela agência.");
  try { EX = await api(`/api/venda?e=${encodeURIComponent(exId)}`); }
  catch (e) { return fechada(e.status === 404 ? "Excursão não encontrada" : "Não foi possível carregar", e.message); }
  document.title = `${EX.destino} | ${EX.agencia || "Garbosa Turismo"}`;
  if (!EX.ativa) return fechada("Vendas encerradas", EX.motivo || "Fale com a agência.");
  $("#cAgencia").textContent = EX.agencia || "Excursão";
  $("#cDestino").textContent = EX.destino;
  if (EX.descricao) { $("#cDesc").textContent = EX.descricao; $("#cDesc").classList.remove("hidden"); }
  $("#cSaida").textContent = `${R.fData(EX.dataSaida)}${EX.horaSaida ? " às " + EX.horaSaida : ""}`;
  $("#cRetorno").textContent = `${R.fData(EX.dataRetorno)}${EX.horaRetorno ? " às " + EX.horaRetorno : ""}`;
  $("#cLocal").textContent = EX.localSaida || "A combinar";
  $("#cValor").textContent = R.brl(EX.valorCent);
  $("#cColo").textContent = EX.valorColoCent > 0 ? `Criança de colo (até ${R.IDADE_COLO} anos): ${R.brl(EX.valorColoCent)}` : `Criança de colo (até ${R.IDADE_COLO} anos) não paga`;
  const op = R.opcoesPagamento(EX.venda, EX.dataSaida, EX.valorCent, EX.hoje);
  const cartao = EX.venda.maxParcelas, boleto = R.opcoesPagamento(EX.venda, EX.dataSaida, 1e9, EX.hoje).BOLETO;
  $("#cFormas").innerHTML = [
    `<li><i class="fa-regular fa-credit-card"></i><span><strong>Cartão de crédito</strong>${cartao > 1 ? `em até ${cartao}x` : "à vista"}</span></li>`,
    `<li><i class="fa-brands fa-pix"></i><span><strong>Pix</strong>pagamento integral</span></li>`,
    boleto ? `<li><i class="fa-solid fa-barcode"></i><span><strong>Boleto${boleto > 1 ? " parcelado" : ""}</strong>${boleto > 1 ? `em até ${boleto}x · 1ª parcela em ${R.fData(op.primeiroVencimento).slice(0, 5)}` : `vence em ${R.fData(op.primeiroVencimento)}`}</span></li>` : ""
  ].join("");
  $("#boxCupom").classList.toggle("hidden", !EX.temCupom);
  S.veic = EX.veiculos[0]?.id || null;
  restaurar();
  if (!S.pessoas.length) S.pessoas = [novaPessoa(true)];
  renderPessoas();
  irEtapa(1, false);
  mostrar("#compra");
}

/* ---------- rascunho (só nesta aba do navegador) ---------- */
function salvar() {
  try { sessionStorage.setItem(CHAVE, JSON.stringify({ pessoas: S.pessoas.map((p) => ({ ...p, assento: null })), cupom: S.cupom?.codigo || "" })); } catch { /* sem armazenamento */ }
}
function restaurar() {
  try {
    const d = JSON.parse(sessionStorage.getItem(CHAVE) || "null");
    if (d?.pessoas?.length) S.pessoas = d.pessoas.map((p, i) => ({ ...novaPessoa(i === 0), ...p, assento: null }));
    if (d?.cupom) { $("#cCupom").value = d.cupom; aplicarCupom(true); }
  } catch { /* ignora */ }
}

/* ---------- pessoas ---------- */
let seq = 0;
function novaPessoa(titular = false) {
  return { uid: `p${Date.now()}${seq++}`, titular, nome: "", cpf: "", rg: "", nascimento: "", email: "", whatsapp: "", colo: false, mesmoContato: !titular,
    endereco: { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" }, assento: null };
}
/** Dados como serão enviados: dependente com "mesmo contato" herda e-mail, WhatsApp e endereço do titular */
function efetiva(p) {
  const t = S.pessoas[0];
  const base = { nome: p.nome, cpf: p.cpf, rg: p.rg, nascimento: p.nascimento, colo: !p.titular && p.colo && podeColo(p), assento: p.assento };
  return p.titular || !p.mesmoContato
    ? { ...base, email: p.email, whatsapp: p.whatsapp, endereco: { ...p.endereco } }
    : { ...base, email: t.email, whatsapp: t.whatsapp, endereco: { ...t.endereco } };
}
const idade = (p) => (R.isoValida(p.nascimento) ? R.idadeEm(p.nascimento, EX.dataSaida) : null);
const podeColo = (p) => !p.titular && idade(p) !== null && idade(p) >= 0 && idade(p) <= R.IDADE_COLO;
const ocupaPoltrona = (p) => !(p.colo && podeColo(p));

const campo = (p, chave, rotulo, attrs = "", cls = "") => {
  const [g, k] = chave.includes(".") ? chave.split(".") : [null, chave];
  const v = g ? p[g][k] : p[chave];
  return `<label class="${cls}">${rotulo}<input data-c="${chave}" value="${esc(v)}" ${attrs}></label>`;
};

function cardPessoa(p, i) {
  const titulo = p.titular ? `<i class="fa-solid fa-user"></i> Titular da compra` : `<i class="fa-solid fa-user-group"></i> Dependente ${i}`;
  return `<fieldset class="cp-pessoa" data-uid="${p.uid}">
    <legend>${titulo}${p.titular ? "" : `<button type="button" class="cp-rem" data-rem="${p.uid}" title="Remover dependente" aria-label="Remover dependente ${i}"><i class="fa-solid fa-xmark"></i></button>`}</legend>
    ${p.titular ? `<p class="cp-dica">É quem paga. A cobrança e os avisos do Asaas vão para o e-mail e o WhatsApp do titular.</p>` : ""}
    <div class="form-grid">
      ${campo(p, "nome", "Nome completo", 'autocomplete="' + (p.titular ? "name" : "off") + '" maxlength="120"', "span2")}
      ${campo(p, "cpf", `CPF${p.titular ? "" : ' <small class="cp-opc" data-opc>(opcional para colo)</small>'}`, 'inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00"')}
      ${campo(p, "rg", `RG${p.titular ? "" : ' <small class="cp-opc" data-opc>(opcional para colo)</small>'}`, 'maxlength="30"')}
      ${campo(p, "nascimento", "Data de nascimento", 'type="date" max="' + EX.hoje + '"')}
      <div class="cp-colo ${podeColo(p) ? "" : "hidden"}" data-colo-wrap>
        <label class="check"><input type="checkbox" data-c="colo" ${p.colo ? "checked" : ""}> Vai no colo (não ocupa poltrona)</label>
      </div>
      ${p.titular ? "" : `<label class="check span2"><input type="checkbox" data-c="mesmoContato" ${p.mesmoContato ? "checked" : ""}> Usar e-mail, WhatsApp e endereço do titular</label>`}
      <div class="span2 form-grid cp-contato ${!p.titular && p.mesmoContato ? "hidden" : ""}" data-contato>
        ${campo(p, "email", "E-mail", 'type="email" autocomplete="' + (p.titular ? "email" : "off") + '"')}
        ${campo(p, "whatsapp", "WhatsApp", 'type="tel" inputmode="tel" data-mask="tel" placeholder="(32) 99999-9999"')}
        ${campo(p, "endereco.cep", "CEP", 'inputmode="numeric" data-mask="cep" placeholder="00000-000"')}
        ${campo(p, "endereco.numero", "Número", 'maxlength="20"')}
        ${campo(p, "endereco.rua", "Rua / Avenida", 'maxlength="120"', "span2")}
        ${campo(p, "endereco.complemento", "Complemento", 'maxlength="60" placeholder="Apto, bloco… (opcional)"')}
        ${campo(p, "endereco.bairro", "Bairro", 'maxlength="80"')}
        ${campo(p, "endereco.cidade", "Cidade", 'maxlength="80"')}
        ${campo(p, "endereco.uf", "UF", 'maxlength="2" placeholder="MG"')}
      </div>
    </div>
  </fieldset>`;
}

function renderPessoas() {
  $("#listaPessoas").innerHTML = S.pessoas.map(cardPessoa).join("");
  $$(".cp-pessoa").forEach((fs) => {
    const p = S.pessoas.find((x) => x.uid === fs.dataset.uid);
    $$("[data-c]", fs).forEach((el) => {
      const ev = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(ev, () => atualizarCampo(p, el, fs));
      if (el.dataset.c === "endereco.cep") el.addEventListener("change", () => buscarCep(p, fs));
    });
    atualizarOpcionais(p, fs);
  });
  $$("[data-rem]").forEach((b) => b.addEventListener("click", () => {
    S.pessoas = S.pessoas.filter((p) => p.uid !== b.dataset.rem);
    renderPessoas(); renderResumo1(); salvar();
  }));
}

function atualizarCampo(p, el, fs) {
  const c = el.dataset.c;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.mask === "cpf") v = el.value = R.mascaraCpf(v);
  if (el.dataset.mask === "tel") v = el.value = R.mascaraTel(v);
  if (el.dataset.mask === "cep") v = el.value = R.mascaraCep(v);
  if (c === "endereco.uf") v = el.value = String(v).toUpperCase().replace(/[^A-Z]/g, "");
  if (c.includes(".")) { const [g, k] = c.split("."); p[g][k] = v; } else p[c] = v;
  if (c === "nascimento") { $("[data-colo-wrap]", fs).classList.toggle("hidden", !podeColo(p)); if (!podeColo(p)) { p.colo = false; $("[data-c=colo]", fs).checked = false; } }
  if (c === "mesmoContato") $("[data-contato]", fs).classList.toggle("hidden", !!v);
  if (c === "nascimento" || c === "colo") { atualizarOpcionais(p, fs); renderResumo1(); }
  if (c === "nome") renderResumo1();
  fs.classList.remove("erro");
  salvar();
}
function atualizarOpcionais(p, fs) { $$("[data-opc]", fs).forEach((s) => s.classList.toggle("hidden", !(p.colo && podeColo(p)))); }

async function buscarCep(p, fs) {
  const cep = R.soDig(p.endereco.cep);
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return;
    const preencher = { rua: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf };
    Object.entries(preencher).forEach(([k, v]) => {
      if (!v || p.endereco[k]) return;
      p.endereco[k] = v;
      const el = $(`[data-c="endereco.${k}"]`, fs);
      if (el) el.value = v;
    });
    salvar();
    $(`[data-c="endereco.numero"]`, fs)?.focus();
  } catch { /* sem internet ou CEP fora do ar: a pessoa digita */ }
}

$("#btnAddDep").addEventListener("click", () => {
  if (S.pessoas.length >= R.MAX_PESSOAS) return msg(1, `No máximo ${R.MAX_PESSOAS} pessoas por compra.`);
  S.pessoas.push(novaPessoa(false));
  renderPessoas(); renderResumo1(); salvar();
  const ult = $$(".cp-pessoa").at(-1);
  ult.scrollIntoView({ behavior: "smooth", block: "start" });
  $("[data-c=nome]", ult).focus({ preventScroll: true });
});

/* ---------- cupom e valores ---------- */
function conta() {
  const pessoas = S.pessoas.map((p) => ({ colo: !ocupaPoltrona(p) }));
  const cupom = S.cupom ? { ok: true, valorCent: S.cupom.valorCent, porCompra: S.cupom.porCompra, restam: S.cupom.restam ?? Infinity } : null;
  return R.calcularItens(pessoas, { valorCent: EX.valorCent, valorColoCent: EX.valorColoCent, cupom });
}
function tabelaResumo(comPoltrona) {
  const c = conta();
  const veicNome = (vk) => { const i = EX.veiculos.findIndex((v) => v.id === vk); return EX.veiculos.length > 1 ? `V${i + 1}·` : ""; };
  const linhas = S.pessoas.map((p, i) => {
    const it = c.itens[i];
    const nome = p.nome.trim() || (p.titular ? "Titular" : `Dependente ${i}`);
    const tags = [it.colo ? `<em class="cp-tag colo">colo</em>` : "", it.cupom ? `<em class="cp-tag cupom">cupom</em>` : "",
      comPoltrona && p.assento ? `<em class="cp-tag polt">poltrona ${veicNome(p.assento.vk)}${p.assento.n}</em>` : ""].join("");
    return `<div class="cp-linha"><span>${i + 1}. ${esc(nome)} ${tags}</span><strong>${it.cupom ? `<s>${R.brl(EX.valorCent)}</s> ` : ""}${R.brl(it.valorCent)}</strong></div>`;
  }).join("");
  const desc = c.descontoCent > 0
    ? `<div class="cp-linha desconto"><span><i class="fa-solid fa-tag"></i> Cupom ${esc(S.cupom.codigo)} (${c.comCupom} pessoa${c.comCupom > 1 ? "s" : ""})</span><strong>− ${R.brl(c.descontoCent)}</strong></div>` : "";
  return `${linhas}${desc}<div class="cp-total"><span>Valor final</span><strong>${R.brl(c.totalCent)}</strong></div>`;
}
function renderResumo1() { $("#resumo1").innerHTML = tabelaResumo(false); }

function cupomMsg(t, tipo = "") { const m = $("#cupomMsg"); m.textContent = t; m.className = "cp-cupom-msg " + tipo; }
async function aplicarCupom(silencioso = false) {
  const codigo = R.normCupom($("#cCupom").value);
  $("#cCupom").value = codigo;
  if (!codigo) { S.cupom = null; cupomMsg(""); renderResumo1(); salvar(); return; }
  $("#btnCupom").disabled = true;
  try {
    const r = await api("/api/cupom", { e: exId, codigo });
    if (!r.ok) { S.cupom = null; cupomMsg(r.motivo, "erro"); }
    else {
      S.cupom = { codigo: r.codigo, valorCent: r.valorCent, porCompra: r.porCompra, restam: r.restam ?? Infinity };
      const n = Math.min(r.porCompra, S.cupom.restam);
      cupomMsg(`Cupom aplicado: ${R.brl(r.valorCent)} por pessoa para até ${n} pessoa${n > 1 ? "s" : ""} desta compra.`, "ok");
    }
  } catch (e) { if (!silencioso) cupomMsg(e.message, "erro"); }
  $("#btnCupom").disabled = false;
  if (EX) renderResumo1();
  salvar();
}
$("#btnCupom").addEventListener("click", () => aplicarCupom());
$("#cCupom").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aplicarCupom(); } });

/* ---------- etapas ---------- */
function msg(n, t, tipo = "erro") { const m = $(`#msg${n}`); m.textContent = t; m.className = "login-msg " + tipo; }
function irEtapa(n, rolar = true) {
  S.etapa = n;
  [1, 2, 3].forEach((k) => $(`#etapa${k}`).classList.toggle("hidden", k !== n));
  $$(".cp-passos li").forEach((li) => { const k = +li.dataset.passo; li.classList.toggle("ativo", k === n); li.classList.toggle("feito", k < n); });
  if (n === 1) renderResumo1();
  if (n === 2) renderPoltronas();
  if (n === 3) renderPagamento();
  if (rolar) $(".cp-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#btnIr2").addEventListener("click", async () => {
  msg(1, "");
  for (let i = 0; i < S.pessoas.length; i++) {
    const p = S.pessoas[i];
    const erro = R.erroPessoa(efetiva(p), EX.dataSaida, p.titular);
    if (erro) {
      msg(1, erro);
      const fs = $$(".cp-pessoa")[i];
      fs.classList.add("erro");
      fs.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
  const cpfs = S.pessoas.map((p) => R.soDig(p.cpf)).filter(Boolean);
  if (new Set(cpfs).size !== cpfs.length) return msg(1, "Há CPFs repetidos. Confira os dados.");
  if (conta().totalCent < R.MIN_PARCELA * 100) return msg(1, "O valor da compra é menor que o mínimo para pagamento online.");
  const b = $("#btnIr2");
  b.disabled = true;
  await atualizarOcupacao();
  b.disabled = false;
  S.ativo = S.pessoas.findIndex((p) => ocupaPoltrona(p) && !p.assento);
  irEtapa(2);
});
$("#btnVolta1").addEventListener("click", () => irEtapa(1));
$("#btnVolta2").addEventListener("click", () => irEtapa(2));

/* ---------- poltronas ---------- */
async function atualizarOcupacao() {
  try {
    const novo = await api(`/api/venda?e=${encodeURIComponent(exId)}`);
    if (novo.ativa) { EX.veiculos = novo.veiculos; EX.valorCent = novo.valorCent; }
  } catch { /* mantém o que já tinha */ }
  // escolhas que ficaram ocupadas ou de pessoas que agora vão no colo voltam a ficar em aberto
  S.pessoas.forEach((p) => {
    if (!p.assento) return;
    const v = EX.veiculos.find((x) => x.id === p.assento.vk);
    if (!ocupaPoltrona(p) || !v || v.ocupadas.includes(p.assento.n)) p.assento = null;
  });
}
const sentam = () => S.pessoas.map((p, i) => [p, i]).filter(([p]) => ocupaPoltrona(p));

function renderPoltronas() {
  const lista = sentam();
  if (S.ativo < 0 || !ocupaPoltrona(S.pessoas[S.ativo] || {})) S.ativo = lista.find(([p]) => !p.assento)?.[1] ?? lista[0]?.[1] ?? 0;
  const ativo = S.pessoas[S.ativo];
  const falta = lista.filter(([p]) => !p.assento).length;
  $("#instrucao").innerHTML = falta
    ? `Toque numa poltrona <b class="verde">verde</b> para <strong>${esc(primeiro(ativo.nome))}</strong> <small>(${lista.findIndex(([, i]) => i === S.ativo) + 1} de ${lista.length})</small>`
    : `<i class="fa-solid fa-circle-check"></i> Todas as poltronas escolhidas. Toque num nome para trocar.`;
  $("#quem").innerHTML = lista.map(([p, i], k) => `<button type="button" class="cp-q ${i === S.ativo ? "ativo" : ""} ${p.assento ? "ok" : ""}" data-i="${i}">
      <span class="ord">${k + 1}</span>${esc(primeiro(p.nome))}${p.assento ? `<em>${rotulo(p.assento)}</em>` : ""}</button>`).join("")
    + S.pessoas.filter((p) => !ocupaPoltrona(p)).map((p) => `<span class="cp-q colo"><i class="fa-solid fa-baby"></i>${esc(primeiro(p.nome))}<em>colo</em></span>`).join("");
  $$(".cp-q[data-i]").forEach((b) => b.addEventListener("click", () => {
    S.ativo = +b.dataset.i;
    const p = S.pessoas[S.ativo];
    if (p.assento) S.veic = p.assento.vk;
    renderPoltronas();
  }));
  if (!EX.veiculos.find((v) => v.id === S.veic)) S.veic = EX.veiculos[0]?.id;
  $("#veics").innerHTML = EX.veiculos.length > 1 ? EX.veiculos.map((v, i) => {
    const livres = v.cap - v.ocupadas.length - S.pessoas.filter((p) => p.assento?.vk === v.id).length;
    return `<button type="button" class="vtab ${v.id === S.veic ? "active" : ""}" data-vk="${v.id}">Veículo ${i + 1} · ${esc(v.nome)} <span class="pill">${livres} livres</span></button>`;
  }).join("") : "";
  $$("#veics [data-vk]").forEach((b) => b.addEventListener("click", () => { S.veic = b.dataset.vk; renderPoltronas(); }));
  const v = EX.veiculos.find((x) => x.id === S.veic);
  $("#mapa").innerHTML = v ? desenharVeiculo(v) : `<p class="vazio">Sem veículo cadastrado.</p>`;
  $$("#mapa .seat[data-n]").forEach((el) => el.addEventListener("click", () => escolher(v.id, +el.dataset.n)));
  $("#btnIr3").disabled = falta > 0;
  msg(2, "", "");
}
function rotulo(a) {
  const i = EX.veiculos.findIndex((v) => v.id === a.vk);
  return EX.veiculos.length > 1 ? `V${i + 1} · ${a.n}` : `${a.n}`;
}
function desenharVeiculo(v) {
  const meus = Object.fromEntries(S.pessoas.filter((p) => p.assento?.vk === v.id).map((p) => [p.assento.n, p]));
  const ocup = new Set(v.ocupadas);
  const seat = (n) => {
    const p = meus[n];
    if (p) {
      const ordem = sentam().findIndex(([x]) => x === p) + 1;
      return `<button type="button" class="seat minha" data-n="${n}" aria-label="Poltrona ${n}: ${esc(p.nome)}. Toque para liberar"><span class="sn">${n}</span><span class="snome">${ordem}. ${esc(primeiro(p.nome))}</span></button>`;
    }
    if (ocup.has(n)) return `<span class="seat reservada" aria-label="Poltrona ${n} reservada"><span class="sn">${n}</span></span>`;
    return `<button type="button" class="seat livre" data-n="${n}" aria-label="Poltrona ${n} disponível"><span class="sn">${n}</span></button>`;
  };
  const linhas = R.layoutAssentos(v.cap);
  return `<div class="bus ${v.cap <= 20 ? "bus-van" : ""}">
    <div class="bus-front"><span class="driver"><i class="fa-solid fa-dharmachakra"></i> Motorista</span><span class="door">Porta</span></div>
    <div class="bus-body">
      ${linhas.map((l) => `<div class="bus-row"><div class="side">${l.esq.map(seat).join("")}</div><div class="aisle"></div><div class="side">${l.dir.map(seat).join("")}${l.wc ? `<div class="wc">WC</div>` : ""}</div></div>`).join("")}
      <div class="corredor-label">CORREDOR</div>
    </div>
    ${v.cap > 20 && !linhas.some((l) => l.wc) ? `<div class="bus-back">Toalete</div>` : ""}
  </div>`;
}
function escolher(vk, n) {
  const dono = S.pessoas.find((p) => p.assento?.vk === vk && p.assento.n === n);
  if (dono) { dono.assento = null; S.ativo = S.pessoas.indexOf(dono); return renderPoltronas(); }
  const p = S.pessoas[S.ativo];
  if (!p || !ocupaPoltrona(p)) return;
  p.assento = { vk, n };
  const prox = sentam().find(([x, i]) => !x.assento && i > S.ativo) || sentam().find(([x]) => !x.assento);
  if (prox) S.ativo = prox[1];
  renderPoltronas();
}
$("#btnIr3").addEventListener("click", () => {
  if (sentam().some(([p]) => !p.assento)) return msg(2, "Escolha a poltrona de todos os viajantes.");
  irEtapa(3);
});

/* ---------- pagamento ---------- */
function renderPagamento() {
  $("#resumo3").innerHTML = `<h3 class="cp-sub">Resumo da compra</h3>${tabelaResumo(true)}`;
  const total = conta().totalCent;
  const op = R.opcoesPagamento(EX.venda, EX.dataSaida, total, EX.hoje);
  if (!op[S.forma]) S.forma = "";
  const sel = (forma, max) => {
    S.parcelas[forma] = Math.min(Math.max(1, S.parcelas[forma] || 1), max);
    return `<select data-parc="${forma}" aria-label="Número de parcelas">${Array.from({ length: max }, (_, k) => k + 1).map((n) => {
      const ps = R.dividir(total, n);
      return `<option value="${n}" ${n === S.parcelas[forma] ? "selected" : ""}>${n === 1 ? `À vista · ${R.brl(total)}` : `${n}x de ${R.brl(ps[0])}${ps[n - 1] !== ps[0] ? "*" : ""}`}</option>`;
    }).join("")}</select>`;
  };
  const datas = (n) => Array.from({ length: n }, (_, k) => R.fData(R.somarMeses(op.primeiroVencimento, k)).slice(0, 5)).join(" · ");
  const cartao = `<label class="cp-op ${S.forma === "CREDIT_CARD" ? "sel" : ""}"><input type="radio" name="forma" value="CREDIT_CARD" ${S.forma === "CREDIT_CARD" ? "checked" : ""}>
      <span class="cp-op-ic"><i class="fa-regular fa-credit-card"></i></span>
      <span class="cp-op-txt"><strong>Cartão de crédito</strong><small>${op.CREDIT_CARD > 1 ? `Em até ${op.CREDIT_CARD}x. Cobrado agora; as parcelas vêm na fatura.` : "À vista."}</small>
      ${op.CREDIT_CARD > 1 ? sel("CREDIT_CARD", op.CREDIT_CARD) : ""}</span></label>`;
  const pix = `<label class="cp-op ${S.forma === "PIX" ? "sel" : ""}"><input type="radio" name="forma" value="PIX" ${S.forma === "PIX" ? "checked" : ""}>
      <span class="cp-op-ic"><i class="fa-brands fa-pix"></i></span>
      <span class="cp-op-txt"><strong>Pix · pagamento integral</strong><small>${R.brl(total)} — pague até ${R.fData(R.somarDias(EX.hoje, 1))} ou as poltronas são liberadas.</small></span></label>`;
  const boleto = op.BOLETO ? `<label class="cp-op ${S.forma === "BOLETO" ? "sel" : ""}"><input type="radio" name="forma" value="BOLETO" ${S.forma === "BOLETO" ? "checked" : ""}>
      <span class="cp-op-ic"><i class="fa-solid fa-barcode"></i></span>
      <span class="cp-op-txt"><strong>Boleto${op.BOLETO > 1 ? " parcelado" : ""}</strong><small>${op.BOLETO > 1 ? `Em até ${op.BOLETO}x, uma por mês. Vencimentos: <span data-datas>${datas(S.parcelas.BOLETO || 1)}</span>` : `Vence em ${R.fData(op.primeiroVencimento)}.`}</small>
      ${op.BOLETO > 1 ? sel("BOLETO", op.BOLETO) : ""}</span></label>` : "";
  $("#opcoesPag").innerHTML = cartao + pix + boleto +
    (EX.venda.maxParcelas > 1 && op.BOLETO < EX.venda.maxParcelas && op.BOLETO > 0 ? `<p class="cp-nota">O boleto tem menos parcelas porque a última precisa vencer antes da viagem.</p>` : "") +
    (Array.from({ length: Math.max(op.CREDIT_CARD, op.BOLETO) }, (_, k) => k + 1).some((n) => total % n) ? `<p class="cp-nota">* os centavos que sobram da divisão ficam na última parcela.</p>` : "");
  $$("#opcoesPag input[name=forma]").forEach((r) => r.addEventListener("change", () => { S.forma = r.value; renderPagamento(); }));
  $$("#opcoesPag select[data-parc]").forEach((s) => {
    s.addEventListener("change", () => { S.parcelas[s.dataset.parc] = +s.value; S.forma = s.dataset.parc; renderPagamento(); });
  });
  const d = $("#opcoesPag [data-datas]");
  if (d) d.textContent = datas(S.parcelas.BOLETO || 1);
}

$("#btnPagar").addEventListener("click", async () => {
  msg(3, "");
  if (!S.forma) return msg(3, "Escolha a forma de pagamento.");
  if (!$("#cAceite").checked) return msg(3, "Marque a confirmação dos dados para continuar.");
  const corpo = {
    e: exId, cupom: S.cupom?.codigo || "", forma: S.forma, parcelas: S.forma === "PIX" ? 1 : (S.parcelas[S.forma] || 1), aceite: true,
    pessoas: S.pessoas.map((p) => { const x = efetiva(p); return { ...x, assento: x.colo || !ocupaPoltrona(p) ? null : x.assento }; })
  };
  $("#btnPagar").disabled = true;
  $("#gerando").classList.remove("hidden");
  try {
    const r = await api("/api/pedido", corpo);
    try { sessionStorage.removeItem(CHAVE); } catch { /* ignora */ }
    $("#gerando p").innerHTML = `<strong>Pedido #${esc(r.pedido)} criado!</strong><span>Abrindo a página de pagamento do Asaas…</span>`;
    location.href = r.url;
  } catch (e) {
    $("#gerando").classList.add("hidden");
    $("#btnPagar").disabled = false;
    const d = e.dados || {};
    if (d.poltronasOcupadas) {
      await atualizarOcupacao();
      irEtapa(2);
      return msg(2, e.message);
    }
    if (d.pagamentoPendente) {
      msg(3, e.message);
      const a = document.createElement("a");
      a.href = d.pagamentoPendente; a.className = "btn btn-light btn-block"; a.style.marginTop = "10px";
      a.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir o pagamento pendente`;
      $("#msg3").after(a);
      return;
    }
    if (d.etapa === "poltronas") { irEtapa(2); return msg(2, e.message); }
    if (d.etapa === "cupom") { S.cupom = null; irEtapa(1); cupomMsg(e.message, "erro"); return; }
    if (Number.isInteger(d.pessoa)) { irEtapa(1); msg(1, e.message); $$(".cp-pessoa")[d.pessoa]?.classList.add("erro"); return; }
    msg(3, e.message);
  }
});

carregar();
