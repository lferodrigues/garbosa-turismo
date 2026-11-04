import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Em cada tela, um $("#id").onclick sem "if" para um botão que a tela não desenha derruba o resto da tela:
// os botões ligados depois dele (Editar, Excluir...) param de responder sem aviso nenhum.
test("cada tela só liga botões que ela mesma desenha", () => {
  const js = readFileSync(new URL("../sistema/js/app.js", import.meta.url), "utf8");
  const telas = js.split(/^(?=function view)/m).slice(1).map((t) => t.split(/^}/m)[0]);
  assert.ok(telas.length > 5);
  for (const t of telas) {
    const nome = t.match(/function (\w+)/)[1];
    for (const [linha, id] of t.matchAll(/^\s*\$\("#(\w+)"\)\.(?:onclick|onchange|addEventListener)/gm)) {
      assert.ok(t.includes(`id="${id}"`) || t.includes(`tbBtn("${id}"`) || t.includes(`"${id}"`), `${nome}: ${linha.trim()} sem botão na tela`);
    }
  }
});
