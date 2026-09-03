import assert from "node:assert/strict";
import test from "node:test";

import { celulaDeCodigo, celulaTexto } from "../src/lib/csv.ts";

test("célula comum vai entre aspas", () => {
  assert.equal(celulaTexto("RIVOTRIL"), '"RIVOTRIL"');
});

test("célula comum duplica aspas internas", () => {
  assert.equal(celulaTexto('gotas 2,5 MG/ML "novo"'), '"gotas 2,5 MG/ML ""novo"""');
});

test("código de barras de 13 dígitos vira fórmula de texto, sem aspas externas", () => {
  assert.equal(celulaDeCodigo("7898581710462"), '="7898581710462"');
});

test("GGREM de 15 dígitos idem", () => {
  assert.equal(celulaDeCodigo("544221120002217"), '="544221120002217"');
});

test("zero à esquerda sobrevive — o outro jeito de o Excel estragar o código", () => {
  assert.equal(celulaDeCodigo("0078987"), '="0078987"');
});

test("célula vazia fica vazia, sem fórmula", () => {
  assert.equal(celulaDeCodigo(""), "");
});

test("conteúdo que não é só dígito cai na célula comum, entre aspas", () => {
  assert.equal(celulaDeCodigo("7898 581"), '"7898 581"');
  assert.equal(celulaDeCodigo('12"3'), '"12""3"');
});

test("a fórmula nunca contém separador, aspa ou quebra de linha", () => {
  // É o que autoriza emitir esse campo sem aspas externas.
  for (const valor of ["7898581710462", "544221120002217", "0078987"]) {
    const celula = celulaDeCodigo(valor);
    assert.equal(celula.startsWith('="'), true);
    assert.equal(celula.slice(2, -1).includes(";"), false);
    assert.equal(celula.slice(2, -1).includes('"'), false);
    assert.equal(celula.includes("\n"), false);
  }
});
