/* =========================================================
   DOCX DAS POLTRONAS (Word) — só número da poltrona e nome do ocupante.
   Monta o .docx direto no navegador (zip sem compressão), sem biblioteca externa.
========================================================= */

const xml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const ROXO = "2A1F88";
const corrida = (t, { negrito = false, tam = 22, cor = "" } = {}) =>
  `<w:r><w:rPr>${negrito ? "<w:b/>" : ""}${cor ? `<w:color w:val="${cor}"/>` : ""}<w:sz w:val="${tam}"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
const paragrafo = (conteudo, { centro = false, depois = 120, quebraAntes = false } = {}) =>
  `<w:p><w:pPr>${quebraAntes ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="0" w:after="${depois}"/>${centro ? '<w:jc w:val="center"/>' : ""}</w:pPr>${conteudo}</w:p>`;

const LARG_N = 1400, LARG_NOME = 7600; // em twips (A4 com margens de 2 cm ≈ 9638)
function celula(texto, largura, { cabecalho = false, centro = false } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>${cabecalho ? `<w:shd w:val="clear" w:color="auto" w:fill="${ROXO}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr>`
    + paragrafo(corrida(texto, { negrito: cabecalho || centro, cor: cabecalho ? "FFFFFF" : "", tam: 22 }), { centro, depois: 0 }) + "</w:tc>";
}
const linha = (cells, cabecalho = false) =>
  `<w:tr><w:trPr><w:trHeight w:val="400"/>${cabecalho ? "<w:tblHeader/>" : ""}<w:cantSplit/></w:trPr>${cells}</w:tr>`;

function tabela(cap, nomes) {
  const borda = (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="9A9AB0"/>`;
  let t = `<w:tbl><w:tblPr><w:tblW w:w="${LARG_N + LARG_NOME}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(borda).join("")}</w:tblBorders>`
    + `<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid><w:gridCol w:w="${LARG_N}"/><w:gridCol w:w="${LARG_NOME}"/></w:tblGrid>`;
  t += linha(celula("Poltrona", LARG_N, { cabecalho: true, centro: true }) + celula("Nome", LARG_NOME, { cabecalho: true }), true);
  for (let n = 1; n <= cap; n++) t += linha(celula(String(n), LARG_N, { centro: true }) + celula(nomes[n] || "", LARG_NOME));
  return t + "</w:tbl>";
}

/** veiculos = [{ titulo, cap, nomes: { n: nome } }] → XML do corpo do documento */
export function documentoPoltronas(titulo, sub, veiculos) {
  const corpo = veiculos.map((v, i) =>
    paragrafo(corrida(titulo, { negrito: true, tam: 30, cor: ROXO }), { centro: true, depois: 60, quebraAntes: i > 0 })
    + (sub ? paragrafo(corrida(sub, { tam: 20, cor: "555566" }), { centro: true, depois: 60 }) : "")
    + (v.titulo ? paragrafo(corrida(v.titulo, { negrito: true, tam: 24 }), { centro: true, depois: 200 }) : "")
    + tabela(v.cap, v.nomes || {})
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}`
    + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const ARQUIVOS_FIXOS = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`
};

/* ---------- zip "store" (sem compressão): o Word abre normalmente ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export function zipar(arquivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let pos = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const n = enc.encode(nome), d = typeof conteudo === "string" ? enc.encode(conteudo) : conteudo, crc = crc32(d);
    const loc = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, t]) => (t === 4 ? loc.setUint32(o, v, true) : loc.setUint16(o, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, pos, 4]]
      .forEach(([o, v, t]) => (t === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    partes.push(new Uint8Array(loc.buffer), n, d);
    central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0), qtd = Object.keys(arquivos).length;
  const fim = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, qtd, 2], [10, qtd, 2], [12, tamCentral, 4], [16, pos, 4], [20, 0, 2]]
    .forEach(([o, v, t]) => (t === 4 ? fim.setUint32(o, v, true) : fim.setUint16(o, v, true)));
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let o = 0; tudo.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

/** Bytes do .docx: uma página por veículo com a tabela Poltrona | Nome */
export function docxPoltronas(titulo, sub, veiculos) {
  return zipar({ ...ARQUIVOS_FIXOS, "word/document.xml": documentoPoltronas(titulo, sub, veiculos) });
}

export function baixarDOCXPoltronas(titulo, sub, veiculos, arquivo) {
  const blob = new Blob([docxPoltronas(titulo, sub, veiculos)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = arquivo + ".docx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
