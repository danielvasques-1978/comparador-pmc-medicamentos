import assert from "node:assert/strict";
import test from "node:test";

import { facetasDaBase } from "../src/lib/facetas.ts";

const registro = (kind: string, presentation: string) => ({
  kind,
  presentation,
  tableDate: "11/08/2026",
  source: "CMED/Anvisa",
});

test("tipos: deduplica e ordena em pt-BR, com acento no lugar certo", () => {
  const base = [
    registro("Similar", "10 MG COM REV CT BL AL X 30"),
    registro("Novo", "10 MG COM REV CT BL AL X 30"),
    registro("Genérico", "10 MG COM REV CT BL AL X 30"),
    registro("Similar", "10 MG COM REV CT BL AL X 30"),
    registro("Não informado", "10 MG COM REV CT BL AL X 30"),
    registro("Específico", "10 MG COM REV CT BL AL X 30"),
  ];
  // Em pt-BR, "Não informado" vem antes de "Novo": o ã conta como a.
  // Uma ordenação por código de caractere poria "Novo" antes.
  assert.deepEqual(facetasDaBase(base).tipos, [
    "Específico",
    "Genérico",
    "Não informado",
    "Novo",
    "Similar",
  ]);
});

test("formas: deriva por inferForm, deduplica e ordena em pt-BR", () => {
  const base = [
    registro("Novo", "2,5 MG/ML SOL OR CT FR VD AMB GOT X 20 ML"),
    registro("Novo", "0,25 MG COM SUB CT BL AL PLAST TRANS X 30"),
    registro("Genérico", "10 MG CAP DURA CT BL AL X 30"),
    registro("Similar", "20 MG COM REV CT BL AL X 30"),
  ];
  // Duas apresentações caem em "Comprimido"; sobra uma entrada.
  assert.deepEqual(facetasDaBase(base).formas, ["Cápsula", "Comprimido", "Solução/gotas"]);
});

test("data e fonte vêm do primeiro registro", () => {
  const base = [registro("Novo", "10 MG COM REV CT BL AL X 30")];
  const facetas = facetasDaBase(base);
  assert.equal(facetas.tableDate, "11/08/2026");
  assert.equal(facetas.source, "CMED/Anvisa");
});

test("base vazia: listas vazias e os dois padrões de texto", () => {
  assert.deepEqual(facetasDaBase([]), {
    tipos: [],
    formas: [],
    tableDate: "Não informada",
    source: "Fonte importada",
  });
});
