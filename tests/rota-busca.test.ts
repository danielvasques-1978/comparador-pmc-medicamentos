import assert from "node:assert/strict";
import test from "node:test";

import { LIMITE_POR_GRUPO, montarResposta } from "../src/app/api/medicines/search/route.ts";

function med(id: string, comPmc: boolean, laboratory = "ACME") {
  return {
    id,
    name: `M${id}`,
    activeIngredient: "X",
    laboratory,
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

test("lista os laboratorios encontrados, ordenados e sem repeticao", () => {
  const r = montarResposta([med("a", true, "Zeta"), med("b", true, "Alfa"), med("c", false, "Alfa")]);
  assert.deepEqual(r.laboratorios, ["Alfa", "Zeta"]);
});

test("conjunto vazio devolve resposta vazia e sem truncamento", () => {
  const r = montarResposta([]);
  assert.deepEqual(r.comPmc, []);
  assert.deepEqual(r.semPmc, []);
  assert.equal(r.totalComPmc, 0);
  assert.equal(r.truncado, false);
});
