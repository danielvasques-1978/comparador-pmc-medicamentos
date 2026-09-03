import assert from "node:assert/strict";
import test from "node:test";

import { codigosDaLinha } from "../src/lib/codigos.ts";

const comEan = { ean1: "7898937460614", ggremCode: "542726030005502", id: "542726030005502" };
const semEan = { ean1: undefined, ggremCode: "542726030005502", id: "542726030005502" };
const semGgrem = { ean1: "7898937460614", ggremCode: undefined, id: "999" };
const eanVazio = { ean1: "", ggremCode: "542726030005502", id: "542726030005502" };

test("com EAN, mostra EAN primeiro e GGREM depois", () => {
  assert.deepEqual(codigosDaLinha(comEan), [
    { rotulo: "Código de barras", valor: "7898937460614" },
    { rotulo: "GGREM", valor: "542726030005502" },
  ]);
});

test("sem EAN, mostra so o GGREM", () => {
  assert.deepEqual(codigosDaLinha(semEan), [{ rotulo: "GGREM", valor: "542726030005502" }]);
});

test("EAN string vazia conta como ausente", () => {
  assert.deepEqual(codigosDaLinha(eanVazio), [{ rotulo: "GGREM", valor: "542726030005502" }]);
});

test("sem ggremCode, cai no id", () => {
  assert.deepEqual(codigosDaLinha(semGgrem), [
    { rotulo: "Código de barras", valor: "7898937460614" },
    { rotulo: "GGREM", valor: "999" },
  ]);
});

test("nenhuma entrada tem valor vazio", () => {
  for (const item of [comEan, semEan, semGgrem, eanVazio]) {
    for (const codigo of codigosDaLinha(item)) {
      assert.notEqual(codigo.valor, "");
    }
  }
});
