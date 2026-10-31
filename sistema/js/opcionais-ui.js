// Lista de opcionais da excursão com caixinhas, para o viajante marcar (compra, reserva e escolha de poltrona).
// opcionais = [{ id, titulo, descricao, valorCent }] (vem da API); selecionados = [ids]
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (c) => (Math.round(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function htmlOpcionais(opcionais, selecionados = []) {
  if (!opcionais?.length) return "";
  const sel = new Set(selecionados);
  return `<div class="cp-opcs" data-opcionais>
    <span><i class="fa-solid fa-square-plus"></i> Opcionais <small class="cp-opc">(marque o que quiser incluir)</small></span>
    ${opcionais.map((o) => `<label class="cp-opc-item">
      <input type="checkbox" data-opcional="${esc(o.id)}" ${sel.has(o.id) ? "checked" : ""}>
      <span><strong>${esc(o.titulo)}</strong>${o.descricao ? `<small>${esc(o.descricao)}</small>` : ""}</span>
      <em>${o.valorCent ? `+ ${brl(o.valorCent)}` : "sem custo"}</em></label>`).join("")}
  </div>`;
}

/** Liga as caixinhas: ao marcar/desmarcar chama aoMudar(listaDeIds) */
export function ligarOpcionais(el, aoMudar) {
  const box = el.querySelector("[data-opcionais]");
  if (!box) return;
  box.addEventListener("change", () => aoMudar([...box.querySelectorAll("[data-opcional]:checked")].map((c) => c.dataset.opcional)));
}

/** Soma (centavos) e títulos dos escolhidos que ainda existem */
export function resumoOpcionais(opcionais, selecionados = []) {
  const sel = new Set(selecionados);
  const lista = (opcionais || []).filter((o) => sel.has(o.id));
  return { ids: lista.map((o) => o.id), cent: lista.reduce((s, o) => s + o.valorCent, 0), titulos: lista.map((o) => o.titulo) };
}
