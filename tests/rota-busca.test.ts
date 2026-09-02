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

test("trunca o grupo com PMC estourando sozinho, contando antes de cortar", () => {
  const muitos = [
    ...Array.from({ length: LIMITE_POR_GRUPO + 5 }, (_, i) => med(`x${i}`, true)),
    med("semPmc", false),
  ];
  const r = montarResposta(muitos);
  assert.equal(r.totalComPmc, LIMITE_POR_GRUPO + 5);
  assert.equal(r.comPmc.length, LIMITE_POR_GRUPO);
  assert.equal(r.totalSemPmc, 1);
  assert.equal(r.semPmc.length, 1);
  assert.equal(r.truncado, true);
});

test("trunca o grupo sem PMC estourando sozinho", () => {
  const muitos = [
    med("comPmc", true),
    ...Array.from({ length: LIMITE_POR_GRUPO + 5 }, (_, i) => med(`y${i}`, false)),
  ];
  const r = montarResposta(muitos);
  assert.equal(r.totalComPmc, 1);
  assert.equal(r.comPmc.length, 1);
  assert.equal(r.totalSemPmc, LIMITE_POR_GRUPO + 5);
  assert.equal(r.semPmc.length, LIMITE_POR_GRUPO);
  assert.equal(r.truncado, true);
});

test("trunca os dois grupos quando os dois estouram", () => {
  const muitos = [
    ...Array.from({ length: LIMITE_POR_GRUPO + 5 }, (_, i) => med(`x${i}`, true)),
    ...Array.from({ length: LIMITE_POR_GRUPO + 7 }, (_, i) => med(`y${i}`, false)),
  ];
  const r = montarResposta(muitos);
  assert.equal(r.totalComPmc, LIMITE_POR_GRUPO + 5);
  assert.equal(r.totalSemPmc, LIMITE_POR_GRUPO + 7);
  assert.equal(r.comPmc.length, LIMITE_POR_GRUPO);
  assert.equal(r.semPmc.length, LIMITE_POR_GRUPO);
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
