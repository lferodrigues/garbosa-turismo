// Realtime Database em memória (só o que as funções usam) — para os testes
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const partes = (p) => String(p || "").split("/").filter(Boolean);
function limpar(v) {
  if (v === null || typeof v !== "object") return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) { const c = limpar(x); if (c !== null && c !== undefined && !(typeof c === "object" && !Object.keys(c).length)) o[k] = c; }
  return Object.keys(o).length ? o : null;
}
let seq = 0;
export function criarDb(inicial = {}) {
  let raiz = clone(inicial);
  const ler = (p) => partes(p).reduce((n, k) => (n && typeof n === "object" ? n[k] : undefined), raiz);
  const gravar = (p, v) => {
    const ks = partes(p);
    if (v && typeof v === "object" && v[".sv"]) v = Date.now();
    if (!ks.length) { raiz = limpar(clone(v)) || {}; return; }
    let n = raiz;
    for (const k of ks.slice(0, -1)) { if (!n[k] || typeof n[k] !== "object") n[k] = {}; n = n[k]; }
    n[ks.at(-1)] = clone(v);
    raiz = limpar(raiz) || {};
  };
  const snap = (v) => ({ val: () => clone(v ?? null), exists: () => v !== undefined && v !== null });
  const ref = (p = "") => ({
    key: partes(p).at(-1) || null,
    get: async () => snap(ler(p)),
    set: async (v) => gravar(p, v),
    update: async (o) => { for (const [k, v] of Object.entries(o)) gravar(`${p}/${k}`, v); },
    push: () => { const key = "k" + Date.now().toString(36) + (++seq).toString().padStart(6, "0"); return ref(`${p}/${key}`); },
    transaction: async (fn) => {
      const novo = fn(clone(ler(p) ?? null));
      if (novo === undefined) return { committed: false, snapshot: snap(ler(p)) };
      gravar(p, novo);
      return { committed: true, snapshot: snap(ler(p)) };
    }
  });
  return { ref, dump: () => clone(raiz) };
}
