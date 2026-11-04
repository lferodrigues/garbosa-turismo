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

/* ---------- passagem: uma página por viajante, via do passageiro + via do motorista ---------- */
function qrNoPdf(doc, matriz, x, y, lado) {
  if (!matriz) return;
  const m = lado / matriz.length;
  doc.setFillColor(0, 0, 0);
  matriz.forEach((linha, l) => linha.forEach((preto, c) => { if (preto) doc.rect(x + c * m, y + l * m, m + 0.02, m + 0.02, "F"); }));
}
function campoPdf(doc, rotulo, valor, x, y, largura) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110, 110, 120);
  doc.text(rotulo, x, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(25, 25, 40);
  const linhas = doc.splitTextToSize(String(valor || "—"), largura).slice(0, 2);
  doc.text(linhas, x, y + 4.4);
  return y + 5 + linhas.length * 4.4;
}
function viaPdf(doc, d, t, x, w, titulo, motorista, qr) {
  const ex = d.excursao, dir = x + w / 2 + 1;
  doc.setFillColor(...ROXO); doc.rect(x, 10, w, 18, "F");
  doc.setFillColor(...AMARELO); doc.rect(x, 28, w, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(d.agencia.nome, x + 4, 17.5, { maxWidth: w - 8 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(titulo, x + 4, 23.5);
  doc.setTextColor(90, 90, 100); doc.setFontSize(7.5);
  doc.text([d.agencia.cnpj && `CNPJ ${d.agencia.cnpj}`, d.agencia.whatsapp && `WhatsApp ${d.agencia.whatsapp}`].filter(Boolean).join("   ·   "), x, 33.5);

  let y = 40;
  y = campoPdf(doc, "Excursão", ex.destino, x, y, w);
  y = campoPdf(doc, "Local de embarque", t.origem, x, y, w);
  campoPdf(doc, "Saída", `${dataBR(ex.dataSaida)}${t.horaSaida ? `, às ${t.horaSaida}` : ""}`, x, y, w / 2 - 2);
  y = campoPdf(doc, "Retorno", `${dataBR(ex.dataRetorno)}${ex.horaRetorno ? `, às ${ex.horaRetorno}` : ""}`, dir, y, w / 2 - 2);
  campoPdf(doc, "Poltrona", t.poltrona, x, y, w / 2 - 2);
  y = campoPdf(doc, "Veículo", t.veiculo || "Único", dir, y, w / 2 - 2);
  y = campoPdf(doc, "Passageiro", t.nome, x, y, w);
  campoPdf(doc, "Documento", t.documento, x, y, w / 2 - 2);
  y = campoPdf(doc, "Bilhete", t.codigo, dir, y, w / 2 - 2);
  doc.setDrawColor(225, 227, 238); doc.line(x, y, x + w, y); y += 5;

  if (motorista) {
    qrNoPdf(doc, qr, x + (w - 42) / 2, y, 42);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 90, 100);
    if (qr) doc.text("Código de conferência do embarque", x + w / 2, y + 47, { align: "center" });
    return;
  }
  const linhas = [["Valor total", brlPdf(t.valorCent)], ["Valor pago", brlPdf(t.pagoCent)], ["Saldo a pagar", brlPdf(t.saldoCent)], ["Forma de pagamento", t.forma || "—"]];
  doc.setFontSize(8.5);
  linhas.forEach(([a, b], i) => {
    doc.setFont("helvetica", i === 2 ? "bold" : "normal"); doc.setTextColor(40, 40, 50);
    doc.text(a, x, y + i * 5); doc.text(b, x + w - 40, y + i * 5, { align: "right", maxWidth: 40 });
  });
  qrNoPdf(doc, qr, x + w - 33, y - 3, 33);
  if (t.opcionais.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(`Opcionais: ${t.opcionais.join(", ")}`, w - 40).slice(0, 2), x, y + 21);
  }
}
const dataBR = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "—");
const brlPdf = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

/** dados: resposta da API; lista: passagens a baixar; qrDe(token) devolve a matriz do código */
export async function baixarPassagens(dados, lista, qrDe, arquivo) {
  await carregar("jspdf");
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  lista.forEach((t, i) => {
    if (i) doc.addPage();
    const qr = qrDe(t.token);
    viaPdf(doc, dados, t, 10, 132, "Comprovante de passagem · Via do passageiro", false, qr);
    viaPdf(doc, dados, t, 155, 132, "Bilhete de embarque · Via do motorista", true, qr);
    doc.setDrawColor(170, 170, 180); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(148.5, 8, 148.5, 202); doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(120, 120, 130);
    doc.text("Comprovante emitido pela agência. Não é documento fiscal. Apresente um documento com foto no embarque.", 10, 201, { maxWidth: 132 });
  });
  doc.save(nomeArquivo(arquivo) + ".pdf");
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

/** Mapa de poltronas desenhado: veiculos = [{ titulo, cap, planta (R.plantaVeiculo), nomes:{n:nome} }], lista = sheet de passageiros */
/** certidoes = { fotos: [{ legenda, dados (JPEG), w, h }], faltam: [nomes] }: uma página por foto, depois da lista */
export async function baixarPDFPoltronas(titulo, sub, veiculos, lista, certidoes = null) {
  const doc = await novoPDF(false);
  veiculos.forEach((v, idx) => {
    if (idx > 0) doc.addPage();
    cabecalho(doc, titulo, sub);
    doc.setFillColor(215, 238, 249);
    doc.roundedRect(10, 28, 190, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ROXO);
    doc.text("MAPA DAS POLTRONAS — " + v.titulo.toUpperCase(), 105, 35.5, { align: "center" });

    const van = v.cap <= 20;
    const pisos = v.planta || [{ titulo: "", frente: ["Motorista", "Porta"], linhas: v.layout || [], fundo: "" }];
    const sw = 15, sh = 11, gap = 2, aisle = 9;
    const bx = 14, largura = van ? (sw * 3 + gap * 2 + aisle + 8) : (sw * 4 + gap * 2 + aisle + 8);
    const extra = (p) => (p.titulo ? 6 : 0) + (p.subtitulo ? 4 : 0) + (p.frente.length ? 8 : 3) + (p.fundo ? 6 : 3);
    const totalLinhas = pisos.reduce((t, p) => t + p.linhas.length, 0);
    const fixo = pisos.reduce((t, p) => t + extra(p), 0) + (pisos.length - 1) * 5;
    const passo = Math.min(sh + gap, (230 - fixo) / Math.max(1, totalLinhas));
    const hSeat = passo - gap;
    const x0 = bx + 4, xDir = x0 + 2 * sw + gap + aisle, duplo = 2 * sw + gap;
    const desenha = (n, x, y, w = sw) => {
      const nome = v.nomes[n] || "";
      doc.setDrawColor(60, 60, 90); doc.setLineWidth(0.3);
      if (nome) { doc.setFillColor(...ROXO); doc.roundedRect(x, y, w, hSeat, 1.5, 1.5, "FD"); doc.setTextColor(...AMARELO); }
      else { doc.setFillColor(248, 248, 252); doc.roundedRect(x, y, w, hSeat, 1.5, 1.5, "FD"); doc.setTextColor(40, 40, 40); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text(String(n), x + w / 2, y + (nome ? Math.min(4, hSeat / 2) : hSeat / 2 + 1.3), { align: "center" });
      if (nome && hSeat >= 7) {
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(5);
        doc.text(nome.split(" ")[0].slice(0, 10), x + w / 2, y + hSeat - 1.5, { align: "center" });
      }
    };
    const anota = (t, x, y, w) => {
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0);
      doc.roundedRect(x, y, w, hSeat, 1.5, 1.5); doc.setLineDashPattern([], 0);
      doc.setTextColor(110, 110, 120); doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
      doc.text(doc.splitTextToSize(t.toUpperCase(), w - 2), x + w / 2, y + hSeat / 2 + 0.5, { align: "center", baseline: "middle" });
    };
    let by = 46;
    pisos.forEach((p) => {
      const altura = extra(p) + p.linhas.length * passo;
      doc.setDrawColor(60, 60, 90); doc.setLineWidth(0.6);
      doc.roundedRect(bx, by, largura, altura, 6, 6);
      let y = by + 3;
      if (p.titulo) { doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...ROXO); doc.text(p.titulo.toUpperCase(), bx + largura / 2, y + 3, { align: "center" }); y += 6; }
      if (p.subtitulo) { doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(110, 90, 10); doc.text(p.subtitulo, bx + largura / 2, y + 2, { align: "center" }); y += 4; }
      if (p.frente.length) {
        doc.setFontSize(6); doc.setTextColor(90, 90, 90); doc.setFont("helvetica", "normal");
        doc.text(p.frente[0].toUpperCase(), bx + 5, y + 3);
        if (p.frente[1]) doc.text(p.frente[1].toUpperCase(), bx + largura - 5, y + 3, { align: "right" });
        y += 8;
      }
      const yIni = y;
      p.linhas.forEach((l) => {
        if (l.notaEsq) anota(l.notaEsq, x0, y, duplo); else (l.esq || []).forEach((n, i) => desenha(n, x0 + i * (sw + gap), y));
        if (l.notaDir) anota(l.notaDir, xDir, y, duplo);
        else if (l.largo) (l.dir || []).forEach((n) => desenha(n, xDir, y, duplo));
        else {
          const dir = (l.dir || []).length === 1 && !van ? [null, ...l.dir] : l.dir || [];
          dir.forEach((n, i) => { if (n != null) desenha(n, xDir + i * (sw + gap), y); });
          if (l.wc) { doc.setTextColor(120, 120, 120); doc.setFontSize(6); doc.setLineDashPattern([1, 1], 0); doc.rect(xDir + (sw + gap), y, sw, hSeat); doc.setLineDashPattern([], 0); doc.text("WC", xDir + (sw + gap) + sw / 2, y + hSeat / 2 + 1, { align: "center" }); }
        }
        y += passo;
      });
      doc.setTextColor(170, 170, 170); doc.setFontSize(6); doc.setFont("helvetica", "normal");
      doc.text("CORREDOR", x0 + 2 * sw + gap + aisle / 2 + 1, yIni + (p.linhas.length * passo) / 2 - 8, { angle: -90 });
      if (p.fundo) { doc.setFontSize(5.5); doc.setTextColor(110, 110, 120); doc.text(p.fundo.toUpperCase(), bx + largura - 5, y + 3, { align: "right" }); }
      by += altura + 5;
    });

    // lista numerada
    const lx = bx + largura + 10, colW = (200 - lx) / 2, listaY = 46;
    const porCol = Math.ceil(v.cap / 2);
    const lh = Math.min(7, 236 / porCol);
    doc.setFontSize(lh < 5 ? 7 : 8);
    for (let n = 1; n <= v.cap; n++) {
      const c = n <= porCol ? 0 : 1, i = c ? n - porCol - 1 : n - 1;
      const x = lx + c * colW, y = listaY + 4 + i * lh;
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
  (certidoes?.fotos || []).forEach((c) => {
    doc.addPage();
    cabecalho(doc, titulo, sub);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...ROXO);
    doc.text(("Certidão de nascimento: " + c.legenda).slice(0, 90), 10, 31);
    const maxW = 190, maxH = 250, k = Math.min(maxW / c.w, maxH / c.h), w = c.w * k, h = c.h * k;
    doc.addImage(c.dados, "JPEG", (210 - w) / 2, 35, w, h);
  });
  if (certidoes?.faltam?.length) {
    doc.addPage();
    cabecalho(doc, titulo, sub);
    tabela(doc, ["Certidões que não estão neste PDF"], certidoes.faltam.map((n) => [n]), 30);
  }
  rodapes(doc);
  doc.save(nomeArquivo(titulo) + ".pdf");
}
