import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buscar, construirTokensEstritos, inferForm, normalize, textTokens, tokensMatchText } from "../src/lib/busca.ts";

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

test("inferForm: COM e COMP, por palavra inteira, são comprimido", () => {
  assert.equal(inferForm("0,25 MG COM SUB CT BL AL PLAST TRANS X 30"), "Comprimido");
  assert.equal(inferForm("10 MG COMP REV CT BL AL X 30"), "Comprimido");
});

test("inferForm: CAP e CAPS, por palavra inteira, são cápsula", () => {
  assert.equal(inferForm("10 MG CAP DURA CT BL AL X 30"), "Cápsula");
  assert.equal(inferForm("20 MG CAPS GEL MOLE CT BL AL X 30"), "Cápsula");
});

test("inferForm: COMPRESSAS num kit injetável não vira comprimido", () => {
  assert.equal(
    inferForm("250 UI PÓ LIOF SOL INJ IV CT FA VD TRANS + SER 5 ML + 2 COMPRESSAS + 1 KPV"),
    "Injetável",
  );
});

test("inferForm: CAPILAR não vira cápsula", () => {
  assert.equal(inferForm("SOL CAPILAR FR PLAS OPC X 100 ML"), "Solução/gotas");
});

test("inferForm: CREM e CREME, por palavra inteira, são tópico", () => {
  assert.equal(inferForm("10 MG/G CREM DERM CT BG AL X 40 G"), "Tópico");
  assert.equal(inferForm("20 MG/G CREME VAG CT BG AL X 50 G + APLIC"), "Tópico");
});

test("inferForm: as demais regras continuam iguais", () => {
  assert.equal(inferForm("5 MG/ML SOL INJ CT FA VD INC X 1 ML"), "Injetável");
  assert.equal(inferForm("2,5 MG/ML SOL OR CT FR VD AMB GOT X 20 ML"), "Solução/gotas");
  assert.equal(inferForm("10 MG/G CREM DERM CT BG AL X 40 G"), "Tópico");
  assert.equal(inferForm("40 MG/ML SUSP OR CT FR VD AMB X 100 ML"), "Xarope/suspensão");
  assert.equal(inferForm("ADESIVO TRANSDÉRMICO CT ENV AL X 4"), "Outras");
});
