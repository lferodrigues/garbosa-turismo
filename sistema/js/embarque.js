// Conferência de embarque: lê o QR Code da passagem, anota cada leitura e avisa quando todos estão a bordo.
// Grava direto no banco do navegador: sem sinal, a leitura fica na fila até a conexão voltar (enquanto a página seguir aberta).
import * as R from "./venda-regras.js?v=28";
import { iniciarLeitor } from "./leitor-qr.js?v=1";

const REPETE_MS = 4000; // o mesmo QR parado na frente da câmera conta uma vez só
const hora = (em) => new Date(em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataHora = (em) => new Date(em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function criarConferencia(c) {
  const { S, $, esc } = c;
  const E = { ex: null, ponto: "", vk: "", parar: null, ultimo: "", ultimoEm: 0, incompleto: "", resumo: null, som: null };

  const ex = () => S.excursoes[E.ex];
  const lista = () => Object.entries(S.viajantes[E.ex] || {});
  const mapa = () => S.poltronas[E.ex] || {};
  const pontoAtual = () => R.pontosDe(ex()).find((p) => p.id === E.ponto) || null;
  const conf = () => R.conferenciaDoPonto(lista(), mapa(), ex(), E.ponto, E.vk);
  const nomeVeic = (vk) => {
    const vs = R.veiculosDe(ex()), i = vs.findIndex(([k]) => k === vk), pre = R.prefixoDe(ex(), vk);
    return `${vs.length > 1 ? `Veículo ${i + 1}` : "Veículo"}${pre ? ` · prefixo ${pre}` : " · sem prefixo"}`;
  };

  /* ---------- aviso sonoro ---------- */
  function tocar(notas) {
    try {
      if (!E.som) return;
      notas.forEach(([f, ini]) => {
        const o = E.som.createOscillator(), g = E.som.createGain();
        o.frequency.value = f; g.gain.value = 0.2;
        o.connect(g); g.connect(E.som.destination);
        o.start(E.som.currentTime + ini); o.stop(E.som.currentTime + ini + 0.14);
      });
    } catch { /* sem som, segue o aviso na tela */ }
  }
  const avisar = (tipo) => {
    tocar({ ok: [[880, 0]], alerta: [[520, 0], [520, 0.2]], erro: [[200, 0], [200, 0.2]], todos: [[660, 0], [880, 0.17], [1100, 0.34]] }[tipo]);
    navigator.vibrate?.({ ok: 80, alerta: [80, 60, 80], erro: [220, 80, 220], todos: [120, 60, 120, 60, 240] }[tipo]);
  };

  /* ---------- leitura ---------- */
  function registrar(vid, modo) {
    const p = S.viajantes[E.ex]?.[vid], ponto = pontoAtual();
    if (!p || !ponto) return;
    const antes = R.leituraNoPonto(p, ponto.id), certo = conf().vkDe(vid);
    const errado = R.veiculosDe(ex()).length > 1 && certo && certo !== E.vk;
    c.gravarLeitura(E.ex, vid, { ponto: ponto.id, pontoNome: ponto.nome, trecho: ponto.trecho, tipo: ponto.tipo, em: Date.now(),
      prefixo: R.prefixoDe(ex(), E.vk), vk: E.vk, por: c.usuario().nome, porUid: c.usuario().uid, modo }).catch(c.falha);
    const feito = ponto.tipo === "embarque" ? "Embarcou" : "Voltou ao ônibus";
    E.resumo = { vid, tipo: errado || antes ? "alerta" : "ok",
      titulo: antes ? `${feito} às ${hora(antes.em)} (nova leitura anotada)` : `${feito} agora`,
      nota: errado ? `Atenção: a poltrona deste passageiro é no ${nomeVeic(certo)}.` : "" };
    avisar(E.resumo.tipo);
    atualizar();
  }
  function ler(texto) {
    const agora = Date.now();
    if (texto === E.ultimo && agora - E.ultimoEm < REPETE_MS) { E.ultimoEm = agora; return; }
    E.ultimo = texto; E.ultimoEm = agora;
    const token = R.tokenDoQr(texto), vias = lista();
    const vid = token ? vias.find(([, p]) => p.passagemToken === token)?.[0] : null;
    const erro = (titulo, id = null) => { E.resumo = { vid: id, tipo: "erro", titulo, nota: "Leitura não registrada." }; avisar("erro"); atualizar(); };
    if (!token) return erro("Este QR Code não é uma passagem");
    if (!vid) return erro("Passagem de outra excursão ou cancelada");
    if (!R.passagensLiberadas(vias).has(vid)) return erro("Passagem sem pagamento", vid);
    registrar(vid, "qr");
  }

  /* ---------- telas ---------- */
  function resumoHtml() {
    const r = E.resumo;
    if (!r) return `<p class="emb-vazio">Aponte a câmera para o QR Code da passagem.</p>`;
    const p = r.vid ? S.viajantes[E.ex]?.[r.vid] : null;
    const cab = `<div class="emb-st ${r.tipo}"><strong>${esc(r.titulo)}</strong>${r.nota ? `<small>${esc(r.nota)}</small>` : ""}</div>`;
    if (!p) return cab;
    const st = c.statusPag(p), saldo = Math.max(0, R.centavos(p.valor) - R.pagoCentDe(p));
    const familia = R.familiaDe(lista(), r.vid).filter(([id]) => id !== r.vid);
    const lin = (a, b) => `<div><small>${a}</small><strong>${esc(b ?? "—")}</strong></div>`;
    return `${cab}
      <h3>${esc(p.nome)}</h3>
      <div class="emb-dados">
        ${lin("Poltrona", p.colo ? "Colo" : c.rotuloPoltrona(E.ex, r.vid))}
        ${lin("Idade", p.idade ?? "—")}
        ${lin("Documento", p.docTipo === "CERTIDAO" ? c.DOCS.CERTIDAO : `${c.DOCS[p.docTipo] || p.docTipo || ""} ${p.docNumero || "—"}`)}
        ${lin("Telefone", p.telefone || "—")}
        ${lin("Pagamento", saldo ? `${st.nome}, falta ${R.brl(saldo)}` : st.nome)}
        ${lin("Opcionais", Object.values(p.opcionais || {}).map((o) => o.titulo).join(", ") || "Nenhum")}
      </div>
      ${familia.length ? `<h4>Viaja com</h4><ul class="emb-lista">${familia.map(([, f]) => `<li>${R.leituraNoPonto(f, E.ponto) ? `<i class="fa-solid fa-circle-check ok"></i>` : `<i class="fa-regular fa-circle"></i>`} ${esc(f.nome)}</li>`).join("")}</ul>` : ""}
      <h4>Leituras</h4>
      <ul class="emb-lista">${R.leiturasDe(p).map((l) => `<li>${dataHora(l.em)} · ${esc(l.pontoNome)}${l.prefixo ? ` · prefixo ${esc(l.prefixo)}` : ""}</li>`).join("") || "<li>Nenhuma leitura ainda.</li>"}</ul>`;
  }

  function atualizar() {
    if (!$("#embPainel")) return;
    const pontos = R.pontosDe(ex()), vs = R.veiculosDe(ex());
    if (!pontos.some((p) => p.id === E.ponto)) E.ponto = pontos[0]?.id || "";
    if (!vs.some(([k]) => k === E.vk)) E.vk = vs[0]?.[0] || "";
    $("#embPonto").innerHTML = pontos.map((p) => `<option value="${esc(p.id)}" ${p.id === E.ponto ? "selected" : ""}>${esc(R.rotuloPonto(p))}</option>`).join("") || `<option value="">Cadastre os pontos</option>`;
    $("#embVeic").innerHTML = vs.map(([k]) => `<option value="${esc(k)}" ${k === E.vk ? "selected" : ""}>${esc(nomeVeic(k))}</option>`).join("");
    const prefixo = R.prefixoDe(ex(), E.vk), pronto = !!E.ponto && !!prefixo;
    $("#embFalta").innerHTML = pronto ? "" : `<div class="alerta amarelo"><i class="fa-solid fa-circle-info"></i> ${E.ponto ? "Cadastre o prefixo deste veículo" : "Cadastre o embarque, as paradas e o prefixo"} antes de começar a leitura.</div>`;
    $("#btnCamera").disabled = !pronto && !E.parar;
    $("#btnCamera").innerHTML = E.parar ? `<i class="fa-solid fa-stop"></i> Parar a câmera` : `<i class="fa-solid fa-camera"></i> Ligar a câmera`;
    $(".emb-cam").classList.toggle("hidden", !E.parar);

    const q = conf(), total = q.esperados.length, feitos = q.presentes.length;
    const chave = `${E.ponto}|${E.vk}`;
    if (q.completo && E.incompleto === chave) { E.incompleto = ""; avisar("todos"); c.toast(`Todos a bordo: ${feitos} de ${total}`); }
    if (!q.completo) E.incompleto = chave;

    $("#embContagem").innerHTML = `<div class="lot-txt"><strong>${feitos}</strong> de <strong>${total}</strong> ${pontoAtual()?.tipo === "parada" ? "de volta ao ônibus" : "embarcados"}</div>
      <div class="bar"><span style="width:${total ? Math.round((feitos / total) * 100) : 0}%" class="${q.completo ? "" : "yellow"}"></span></div>`;
    $("#embTodos").innerHTML = q.completo ? `<div class="emb-todos"><i class="fa-solid fa-circle-check"></i> Todos a bordo! ${total} de ${total}${prefixo ? ` · prefixo ${esc(prefixo)}` : ""}</div>` : "";
    $("#embResumo").innerHTML = resumoHtml();
    const porId = Object.fromEntries(lista());
    $("#embFaltam").innerHTML = `<h4>Faltam ${q.faltam.length}</h4>${q.faltam.length ? `<ul class="emb-faltam">${q.faltam.map((id) => `<li><span>${esc(porId[id].nome)}<small>${porId[id].colo ? "Colo" : esc(c.rotuloPoltrona(E.ex, id))}</small></span><button type="button" class="btn btn-light btn-sm" data-marcar="${esc(id)}" title="Marcar sem o QR Code">Marcar</button></li>`).join("")}</ul>` : `<p class="muted">Ninguém.</p>`}
      ${q.semVeiculo.length ? `<div class="alerta amarelo emb-sem"><i class="fa-solid fa-circle-info"></i> Sem poltrona, fora da contagem: ${esc(q.semVeiculo.map((id) => porId[id].nome).join(", "))}.</div>` : ""}`;

    const todas = lista().flatMap(([, p]) => R.leiturasDe(p).map((l) => ({ nome: p.nome, ...l }))).sort((a, b) => a.em - b.em);
    S.exportar = { titulo: `Embarque ${ex().destino} ${c.fData(ex().dataSaida)}`, sub: `${todas.length} leitura(s)`,
      sheets: [{ nome: "Leituras", colunas: ["Passageiro", "Trecho", "Ponto", "Data e hora", "Prefixo", "Registrado por", "Forma"],
        linhas: todas.map((l) => [l.nome, l.trecho === "volta" ? "Volta" : "Ida", l.pontoNome, dataHora(l.em), l.prefixo || "", l.por || "", l.modo === "manual" ? "Manual" : "QR Code"]) }] };
  }

  async function alternarCamera() {
    if (E.parar) { parar(); return atualizar(); }
    const b = $("#btnCamera");
    b.disabled = true;
    try {
      E.som ||= new (window.AudioContext || window.webkitAudioContext)();
      $(".emb-cam").classList.remove("hidden");
      E.parar = await iniciarLeitor($("#embVideo"), ler);
    } catch (e) { c.toast(e.message, "erro"); }
    atualizar();
  }
  function parar() { E.parar?.(); E.parar = null; }

  function formPontos() {
    const atual = ex(), pontos = R.pontosDe(atual), vs = R.veiculosDe(atual);
    const emb = (t) => pontos.find((p) => p.trecho === t && p.tipo === "embarque");
    const paradas = (t) => pontos.filter((p) => p.trecho === t && p.tipo === "parada");
    const linha = (p = {}) => `<div class="emb-par" data-id="${esc(p.id || "")}"><input placeholder="Nome da parada" maxlength="80" value="${esc(p.nome || "")}"><button type="button" class="ic danger" title="Remover parada"><i class="fa-solid fa-trash"></i></button></div>`;
    const bloco = (t, titulo, padrao) => `<fieldset class="span2 emb-trecho" data-trecho="${t}"><legend>${titulo}</legend>
      <label>Embarque<input data-emb maxlength="80" required value="${esc(emb(t)?.nome || padrao || "")}"></label>
      <div class="emb-pars">${paradas(t).map(linha).join("")}</div>
      <button type="button" class="btn btn-light btn-sm" data-add><i class="fa-solid fa-plus"></i> Adicionar parada</button></fieldset>`;
    c.abrirModal("Pontos e prefixos", `<form id="fPontos" class="form-grid">
      ${bloco("ida", "Ida", atual.localSaida)}
      ${bloco("volta", "Volta", atual.destino)}
      <fieldset class="span2"><legend>Prefixo dos veículos</legend>
        ${vs.map(([k], i) => `<label>${vs.length > 1 ? `Veículo ${i + 1}` : "Prefixo do veículo"}<input data-prefixo="${esc(k)}" maxlength="20" value="${esc(R.prefixoDe(atual, k))}"></label>`).join("")}</fieldset>
    </form>`, [
      { html: "Cancelar", acao: c.fecharModal },
      { html: `<i class="fa-solid fa-floppy-disk"></i> Salvar`, classe: "btn-primary", acao: salvarPontos }
    ], true);
    const f = $("#fPontos");
    f.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]"), rm = e.target.closest(".emb-par .ic");
      if (add) add.previousElementSibling.insertAdjacentHTML("beforeend", linha());
      if (rm) rm.closest(".emb-par").remove();
    });
  }
  async function salvarPontos() {
    const f = $("#fPontos"), pontos = {}, prefixos = {};
    let faltou = false, n = 0;
    f.querySelectorAll(".emb-trecho").forEach((b) => {
      const trecho = b.dataset.trecho, nome = b.querySelector("[data-emb]").value.trim();
      if (!nome) faltou = true;
      pontos[`${trecho}_embarque`] = { trecho, tipo: "embarque", nome, ordem: 0 };
      b.querySelectorAll(".emb-par").forEach((l, i) => {
        const v = l.querySelector("input").value.trim();
        if (v) pontos[l.dataset.id || `parada${Date.now()}${n++}`] = { trecho, tipo: "parada", nome: v, ordem: i + 1 };
      });
    });
    if (faltou) return c.toast("Informe o embarque da ida e o da volta.", "erro");
    f.querySelectorAll("[data-prefixo]").forEach((i) => { if (i.value.trim()) prefixos[i.dataset.prefixo] = i.value.trim(); });
    try {
      await c.salvarConferencia(E.ex, { pontos, prefixos });
      c.fecharModal(); c.toast("Pontos e prefixos salvos"); atualizar();
    } catch (e) { c.falha(e); }
  }

  /** subbar: seletor de excursão já pronto */
  function tela(subbar) {
    if ($("#embPainel")?.dataset.ex === S.exSel) return atualizar(); // chegou leitura: não derruba a câmera
    parar();
    Object.assign(E, { ex: S.exSel, ponto: "", vk: "", ultimo: "", incompleto: "", resumo: null });
    $("#workspace").innerHTML = `<section class="panel" id="embPainel" data-ex="${esc(S.exSel)}">
      ${c.toolbar("Conferência de embarque", "fa-qrcode", c.tbBtn("btnPontos", "fa-gear", "Pontos e prefixos"))}
      <div class="subbar">${subbar}</div>
      <div id="embFalta"></div>
      <div class="emb-grade">
        <div class="emb-col">
          <div class="emb-sel">
            <label>Ponto<select id="embPonto"></select></label>
            <label>Veículo<select id="embVeic"></select></label>
          </div>
          <button type="button" class="btn btn-primary btn-block" id="btnCamera"></button>
          <div class="emb-cam hidden"><video id="embVideo" playsinline muted></video><span class="emb-mira"></span></div>
          <div id="embTodos"></div>
          <div id="embContagem" class="lotacao"></div>
          <div id="embResumo" class="emb-resumo" aria-live="polite"></div>
        </div>
        <div class="emb-col" id="embFaltam"></div>
      </div>
    </section>`;
    $("#btnPontos").onclick = formPontos;
    $("#btnCamera").onclick = alternarCamera;
    $("#embPonto").onchange = (e) => { E.ponto = e.target.value; E.resumo = null; E.incompleto = ""; atualizar(); };
    $("#embVeic").onchange = (e) => { E.vk = e.target.value; E.resumo = null; E.incompleto = ""; atualizar(); };
    $("#embFaltam").addEventListener("click", (e) => {
      const id = e.target.closest("[data-marcar]")?.dataset.marcar;
      if (!id) return;
      if (!R.prefixoDe(ex(), E.vk) || !E.ponto) return c.toast("Cadastre o ponto e o prefixo primeiro.", "erro");
      registrar(id, "manual");
    });
    atualizar();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && E.parar) { parar(); atualizar(); } });
  return { tela, parar };
}
