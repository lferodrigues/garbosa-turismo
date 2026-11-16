import test from "node:test";
import assert from "node:assert/strict";
import { docxPoltronas, documentoPoltronas } from "../sistema/js/docx.js";

test("docx das poltronas: zip válido com número e nome de cada poltrona", () => {
  const bytes = docxPoltronas("Poltronas Aparecida 12/12/2026", "Saída às 05:00", [
    { titulo: "Veículo 1 · Ônibus", cap: 3, nomes: { 1: "Maria & José", 3: "Ana <Souza>" } },
    { titulo: "Veículo 2 · Van", cap: 2, nomes: { 2: "João" } }
  ]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const txt = new TextDecoder().decode(bytes);
  for (const parte of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"]) assert.ok(txt.includes(parte), parte);
  assert.ok(txt.includes("Maria &amp; José") && txt.includes("Ana &lt;Souza&gt;") && txt.includes("João"));
});

test("docx das poltronas: uma linha por poltrona, livres em branco, quebra de página entre veículos", () => {
  const x = documentoPoltronas("T", "", [{ titulo: "A", cap: 4, nomes: { 2: "Bia" } }, { titulo: "B", cap: 1, nomes: {} }]);
  assert.equal((x.match(/<w:tr>/g) || []).length, 4 + 1 + 1 + 1); // 2 cabeçalhos + 5 poltronas
  assert.equal((x.match(/<w:pageBreakBefore\/>/g) || []).length, 1);
});
