/* =========================================================
   EXPORTAÇÃO XLSX / PDF  (bibliotecas carregadas sob demanda)
========================================================= */
const LIBS = {
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
};
const carregados = {};
function carregar(nome) {
  if (!carregados[nome]) {
    carregados[nome] = new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = LIBS[nome];
      s.onload = ok;
      s.onerror = () => { delete carregados[nome]; erro(new Error("Não foi possível carregar a biblioteca de exportação. Verifique a internet.")); };
      document.head.appendChild(s);
    });
  }
  return carregados[nome];
}

export async function carregarXLSX() { await carregar("xlsx"); return window.XLSX; }

const ROXO = [42, 31, 136];
const AMARELO = [255, 213, 74];
const carimbo = () => new Date().toLocaleString("pt-BR");
export const nomeArquivo = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** sheets: [{ nome, colunas: [], linhas: [[]] }] */
export async function baixarXLSX(titulo, sheets) {
  await carregar("xlsx");
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const usados = new Set();
  sheets.forEach((sh) => {
    const aoa = [[titulo + (sh.nome && sheets.length > 1 ? " — " + sh.nome : "")], [`Gerado em ${carimbo()} · Garbosa System`], [], sh.colunas, ...sh.linhas];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = sh.colunas.map((c, i) => ({ wch: Math.min(60, Math.max(String(c).length, ...sh.linhas.map((l) => String(l[i] ?? "").length)) + 2) }));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, sh.colunas.length - 1) } }];
    let n = (sh.nome || "Dados").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Dados";
    while (usados.has(n)) n = n.slice(0, 28) + "_" + usados.size;
    usados.add(n);
    XLSX.utils.book_append_sheet(wb, ws, n);
  });
  XLSX.writeFile(wb, nomeArquivo(titulo) + ".xlsx");
}

async function novoPDF(paisagem) {
  await carregar("jspdf");
  await carregar("autotable");
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: paisagem ? "landscape" : "portrait", unit: "mm", format: "a4" });
}

function cabecalho(doc, titulo, sub) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...ROXO);
  doc.rect(0, 0, w, 22, "F");
  doc.setFillColor(...AMARELO);
  doc.rect(0, 22, w, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(titulo, 12, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(sub || "Garbosa System", 12, 17);
  doc.setTextColor(30, 30, 30);
}

function rodapes(doc) {
  const total = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Garbosa System · gerado em ${carimbo()}`, 12, h - 6);
    doc.text(`Página ${i} de ${total}`, w - 12, h - 6, { align: "right" });
  }
}

function tabela(doc, colunas, linhas, inicioY) {
  doc.autoTable({
    head: [colunas], body: linhas, startY: inicioY,
    margin: { left: 10, right: 10, top: 28, bottom: 14 },
    styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: ROXO, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 244, 255] }
  });
}

/** sheets como no XLSX; cada sheet vira uma seção */
export async function baixarPDF(titulo, sub, sheets) {
  const maxCols = Math.max(...sheets.map((s) => s.colunas.length));
  const doc = await novoPDF(maxCols > 6);
  cabecalho(doc, titulo, sub);
  let y = 30;
  sheets.forEach((sh, i) => {
    if (i > 0) { doc.addPage(); cabecalho(doc, titulo, sub); y = 30; }
    if (sh.nome && sheets.length > 1) { doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...ROXO); doc.text(sh.nome, 10, y); y += 4; doc.setTextColor(30, 30, 30); }
    if (!sh.linhas.length) { doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.text("Nenhum registro.", 10, y + 6); return; }
    tabela(doc, sh.colunas, sh.linhas, y);
  });
  rodapes(doc);
  doc.save(nomeArquivo(titulo) + ".pdf");
}

/** Mapa de poltronas desenhado: veiculos = [{ titulo, cap, layout, nomes:{n:nome} }], lista = sheet de passageiros */
export async function baixarPDFPoltronas(titulo, sub, veiculos, lista) {
  const doc = await novoPDF(false);
  veiculos.forEach((v, idx) => {
    if (idx > 0) doc.addPage();
    cabecalho(doc, titulo, sub);
    doc.setFillColor(215, 238, 249);
    doc.roundedRect(10, 28, 190, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ROXO);
    doc.text("MAPA DAS POLTRONAS — " + v.titulo.toUpperCase(), 105, 35.5, { align: "center" });

    const van = v.cap <= 20;
    const sw = 15, sh = 11, gap = 2, aisle = 9;
    const rows = v.layout.length;
    const passo = Math.min(sh + gap, (240 - 20) / rows);
    const hSeat = passo - gap;
    const bx = 14, by = 46;
    const largura = van ? (sw * 3 + gap * 2 + aisle + 8) : (sw * 4 + gap * 2 + aisle + 8);
    doc.setDrawColor(60, 60, 90); doc.setLineWidth(0.6);
    doc.roundedRect(bx, by, largura, rows * passo + 18, 6, 6);
    doc.setFontSize(6); doc.setTextColor(90, 90, 90); doc.setFont("helvetica", "normal");
    doc.text("MOTORISTA", bx + 5, by + 6); doc.text("PORTA", bx + largura - 5, by + 6, { align: "right" });
    const x0 = bx + 4, xDir = x0 + 2 * sw + gap + aisle;
    v.layout.forEach((l, r) => {
      const y = by + 10 + r * passo;
      const desenha = (n, x) => {
        const nome = v.nomes[n] || "";
        if (nome) { doc.setFillColor(...ROXO); doc.roundedRect(x, y, sw, hSeat, 1.5, 1.5, "FD"); doc.setTextColor(...AMARELO); }
        else { doc.setFillColor(248, 248, 252); doc.roundedRect(x, y, sw, hSeat, 1.5, 1.5, "FD"); doc.setTextColor(40, 40, 40); }
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.text(String(n), x + sw / 2, y + (nome ? 4 : hSeat / 2 + 1.3), { align: "center" });
        if (nome) {
          doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(5);
          doc.text(nome.split(" ")[0].slice(0, 10), x + sw / 2, y + hSeat - 2, { align: "center" });
        }
      };
      l.esq.forEach((n, i) => desenha(n, x0 + i * (sw + gap)));
      const dir = l.dir.length === 1 && !van ? [null, ...l.dir] : l.dir;
      dir.forEach((n, i) => { if (n != null) desenha(n, xDir + i * (sw + gap)); });
      if (l.wc) { doc.setTextColor(120, 120, 120); doc.setFontSize(6); doc.setLineDashPattern([1, 1], 0); doc.rect(xDir + (sw + gap), y, sw, hSeat); doc.setLineDashPattern([], 0); doc.text("WC", xDir + (sw + gap) + sw / 2, y + hSeat / 2 + 1, { align: "center" }); }
    });
    doc.setTextColor(170, 170, 170); doc.setFontSize(6);
    doc.text("CORREDOR", x0 + 2 * sw + gap + aisle / 2 + 1, by + 10 + (rows * passo) / 2 - 8, { angle: -90 });

    // lista numerada
    const lx = bx + largura + 10, colW = (200 - lx) / 2;
    const porCol = Math.ceil(v.cap / 2);
    const lh = Math.min(7, 236 / porCol);
    doc.setFontSize(lh < 5 ? 7 : 8);
    for (let n = 1; n <= v.cap; n++) {
      const c = n <= porCol ? 0 : 1, i = c ? n - porCol - 1 : n - 1;
      const x = lx + c * colW, y = by + 4 + i * lh;
      doc.setTextColor(30, 30, 30); doc.setFont("helvetica", "bold");
      doc.text(String(n), x, y);
      doc.setFont("helvetica", "normal");
      doc.text((v.nomes[n] || "").slice(0, 28), x + 7, y);
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.15);
      doc.line(x, y + 1.2, x + colW - 3, y + 1.2);
    }
  });
  doc.addPage();
  cabecalho(doc, titulo, sub);
  tabela(doc, lista.colunas, lista.linhas, 30);
  rodapes(doc);
  doc.save(nomeArquivo(titulo) + ".pdf");
}
