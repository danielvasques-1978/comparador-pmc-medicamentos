import assert from "node:assert/strict";
import test from "node:test";

import { precoAplicavel, temPmc } from "../src/lib/precos.ts";

const comPmc = { pmc: { "18": 50.28 } };
const semPmc = { pmc: {}, pf: { "18": 1582.23 } };
const pmcVazio = { pmc: { "18": null } };

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

test("item com PMC mas sem valor na zona pedida devolve null, nao zero", () => {
  assert.deepEqual(precoAplicavel(comPmc, "23"), { valor: null, tipo: "PMC" });
});

test("preco zero e preservado, nao confundido com ausencia", () => {
  const gratuito = { pmc: { "18": 0 } };
  assert.equal(temPmc(gratuito), true);
  assert.deepEqual(precoAplicavel(gratuito, "18"), { valor: 0, tipo: "PMC" });
});
