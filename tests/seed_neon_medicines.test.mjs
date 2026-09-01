import assert from "node:assert/strict";
import test from "node:test";

import { toIsoDate } from "../scripts/seed_neon_medicines.mjs";

test("converte a data da tabela para ISO", () => {
  assert.equal(toIsoDate("11/08/2026"), "2026-08-11");
});

test("preserva o zero à esquerda no dia e no mês", () => {
  assert.equal(toIsoDate("01/06/2026"), "2026-06-01");
});

test("devolve null para entrada inválida", () => {
  assert.equal(toIsoDate("Não informada"), null);
  assert.equal(toIsoDate(null), null);
});
