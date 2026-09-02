import assert from "node:assert/strict";
import test from "node:test";

import { LIMITE_POR_GRUPO, montarResposta } from "../src/lib/resposta-busca.ts";

function med(id: string, comPmc: boolean) {
  return {
    id,
    name: `M${id}`,
    activeIngredient: "X",
    laboratory: "ACME",
    kind: "Genérico",
    presentation: "1 MG",
    pmc: comPmc ? { "18": 10 } : {},
    pf: comPmc ? undefined : { "18": 99 },
    sourcePage: 0,
    source: "CMED/Anvisa",
    tableDate: "11/08/2026",
  } as never;
}

test("separa os dois grupos", () => {
  const r = montarResposta([med("a", true), med("b", false)]);
  assert.deepEqual(r.comPmc.map((i) => i.id), ["a"]);
  assert.deepEqual(r.semPmc.map((i) => i.id), ["b"]);
});

test("conta antes de truncar e sinaliza o truncamento", () => {
  const muitos = Array.from({ length: LIMITE_POR_GRUPO + 5 }, (_, i) => med(`x${i}`, true));
  const r = montarResposta(muitos);
  assert.equal(r.totalComPmc, LIMITE_POR_GRUPO + 5);
  assert.equal(r.comPmc.length, LIMITE_POR_GRUPO);
  assert.equal(r.truncado, true);
});

test("nao sinaliza truncamento quando cabe", () => {
  assert.equal(montarResposta([med("a", true)]).truncado, false);
});

test("conjunto vazio devolve resposta vazia e sem truncamento", () => {
  const r = montarResposta([]);
  assert.deepEqual(r.comPmc, []);
  assert.deepEqual(r.semPmc, []);
  assert.equal(r.totalComPmc, 0);
  assert.equal(r.truncado, false);
});
