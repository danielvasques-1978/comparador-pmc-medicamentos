import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buscar, construirTokensEstritos } from "../src/lib/busca.ts";
import { suplementoConsultado, suplementosConhecidos } from "../src/lib/suplementos.ts";

const raiz = process.cwd();
const criticos = JSON.parse(fs.readFileSync(path.join(raiz, "src/data/critical-medicines.json"), "utf8"));
// A base congelada, e não src/data/medicines.json: aquele arquivo é reescrito e
// commitado pelo workflow diário da CMED, que roda estes testes antes de atualizar.
const medicines = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/busca-base.json"), "utf8"));
const estritos = construirTokensEstritos(criticos);

test("nenhuma grafia da lista encontra medicamento na base", () => {
  // Esta é a invariante que sustenta o aviso. Se um destes termos passar a ter
  // registro de medicamento, o site mostraria a linha E o aviso dizendo que a
  // substância não é medicamento. O teste quebra antes disso ir ao ar.
  for (const suplemento of suplementosConhecidos) {
    for (const grafia of suplemento.termos) {
      const achados = buscar(medicines, grafia, estritos);
      assert.equal(
        achados.length,
        0,
        `"${grafia}" (${suplemento.nome}) encontrou ${achados.length} apresentação(ões) na base`,
      );
    }
  }
});

test("reconhece a melatonina e traz a ressalva da manipulação", () => {
  const achado = suplementoConsultado("melatonina");
  assert.equal(achado?.nome, "Melatonina");
  assert.match(achado?.observacao ?? "", /manipula/i);
});

test("ignora acento, caixa e espaço em volta", () => {
  for (const consulta of ["COLÁGENO", "colageno", "  Colágeno  "]) {
    assert.equal(suplementoConsultado(consulta)?.nome, "Colágeno", `falhou para ${consulta}`);
  }
});

test("casa por prefixo, como a busca da tabela", () => {
  assert.equal(suplementoConsultado("melato")?.nome, "Melatonina");
});

test("casa quando a consulta traz palavras a mais na grafia composta", () => {
  assert.equal(suplementoConsultado("proteina do soro")?.nome, "Whey protein");
});

test("token de menos de três letras não dispara aviso algum", () => {
  // Mesmo piso da busca: abaixo de três caracteres nada é pesquisado, e um
  // aviso aqui apareceria antes de o usuário terminar de digitar.
  assert.equal(suplementoConsultado("me"), null);
  assert.equal(suplementoConsultado(""), null);
});

test("termo fora da lista não devolve suplemento", () => {
  for (const consulta of ["clonazepam", "leqembi", "ramelteona", "xyzabc"]) {
    assert.equal(suplementoConsultado(consulta), null, `${consulta} não deveria casar`);
  }
});
