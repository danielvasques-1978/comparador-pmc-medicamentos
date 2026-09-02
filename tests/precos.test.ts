import assert from "node:assert/strict";
import test from "node:test";

import { precoAplicavel, temPmc } from "../src/lib/precos.ts";

const comPmc = { pmc: { "18": 50.28 } } as never;
const semPmc = { pmc: {}, pf: { "18": 1582.23 } } as never;
const pmcVazio = { pmc: { "18": null } } as never;

test("reconhece item com PMC", () => {
  assert.equal(temPmc(comPmc), true);
});

test("item sem PMC e com PF nao tem PMC", () => {
  assert.equal(temPmc(semPmc), false);
});

test("PMC presente mas nulo nao conta como PMC", () => {
  assert.equal(temPmc(pmcVazio), false);
});

test("preco aplicavel de item com PMC vem do PMC", () => {
  assert.deepEqual(precoAplicavel(comPmc, "18"), { valor: 50.28, tipo: "PMC" });
});

test("preco aplicavel de item sem PMC vem do PF", () => {
  assert.deepEqual(precoAplicavel(semPmc, "18"), { valor: 1582.23, tipo: "PF" });
});

test("zona sem valor devolve null, nunca zero", () => {
  assert.deepEqual(precoAplicavel(semPmc, "23"), { valor: null, tipo: "PF" });
});
