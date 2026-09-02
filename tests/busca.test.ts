import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buscar, construirTokensEstritos, normalize, textTokens, tokensMatchText } from "../src/lib/busca.ts";

const raiz = process.cwd();
const criticos = JSON.parse(fs.readFileSync(path.join(raiz, "src/data/critical-medicines.json"), "utf8"));
// A base congelada, e não src/data/medicines.json: aquele arquivo é reescrito e
// commitado pelo workflow diário da CMED, que roda estes testes antes de atualizar.
// Apontar para o dado vivo faria a primeira edição nova parar o pipeline de preços.
// Para regerar o par base + referência: node scripts/gerar_golden.mjs
const medicines = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/busca-base.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/busca-golden.json"), "utf8"));
const estritos = construirTokensEstritos(criticos);

test("a busca devolve exatamente o mesmo conjunto de antes", () => {
  for (const [consulta, esperado] of Object.entries(golden)) {
    const obtido = buscar(medicines, consulta, estritos).map((item) => item.id).sort();
    assert.deepEqual(obtido, esperado, `divergiu na consulta "${consulta}"`);
  }
});

test("remove acentos e caixa", () => {
  assert.equal(normalize("Lítio"), "litio");
});

test("separa em tokens ignorando pontuacao", () => {
  assert.deepEqual(textTokens("500 MG/ML, COM"), ["500", "mg", "ml", "com"]);
});

test("token de consulta com menos de tres letras nao casa nada", () => {
  assert.equal(tokensMatchText("ab", "abacavir", estritos), false);
});

test("token nao estrito casa por prefixo", () => {
  assert.equal(tokensMatchText("clonaz", "clonazepam", estritos), true);
});

test("token estrito exige igualdade", () => {
  assert.ok(estritos.has("clonazepam"));
  assert.equal(tokensMatchText("clonazepam", "clonazepamx", estritos), false);
});

test("consulta vazia devolve nada", () => {
  assert.deepEqual(buscar(medicines, "", estritos), []);
});
