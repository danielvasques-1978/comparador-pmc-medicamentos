// Regera o par de fixtures do teste de ouro da busca:
//
//   tests/fixtures/busca-base.json    a base congelada sobre a qual o teste roda
//   tests/fixtures/busca-golden.json  o conjunto de GGREMs esperado por consulta
//
// Regerar é ato deliberado: só se faz quando o comportamento pretendido da busca
// muda. Rodar isto para "consertar" um teste vermelho apaga justamente a garantia
// que o teste existe para dar.
import fs from "node:fs";
import { fileURLToPath, URL } from "node:url";

import criticalMedicines from "../src/data/critical-medicines.json" with { type: "json" };
import { buscar, construirTokensEstritos } from "../src/lib/busca.ts";

const BASE_VIVA = fileURLToPath(new URL("../src/data/medicines.json", import.meta.url));
const BASE_CONGELADA = fileURLToPath(new URL("../tests/fixtures/busca-base.json", import.meta.url));
const GOLDEN = fileURLToPath(new URL("../tests/fixtures/busca-golden.json", import.meta.url));

// As consultas do teste de ouro. As quatro últimas são marcas cujo nome não
// contém o próprio princípio ativo: são as únicas que exercitam a expansão por
// princípio ativo, porque sem ela o resultado encolhe.
const CONSULTAS = [
  "clonazepam",
  "leqembi",
  "dipirona",
  "escitalopram",
  "insulina",
  "ab",
  "zzzznaoexiste",
  "aripiprazol",
  "quetiapina",
  "lamotrigina",
  "lítio",
  "venlafaxina",
  "risperidona",
  "sertralina",
  "bupropiona",
  "clozapina",
  "haloperidol",
  "rivotril",
  "lamictal",
  "depakote",
  "carbolitium",
];

function lerJson(caminho) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return null;
  }
}

function escrever(caminho, valor) {
  fs.writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`, "utf8");
}

// A busca só lê estes três campos. Congelar o resto seria carregar 20 MB de
// preço e EAN que o teste nunca olha.
const medicines = lerJson(BASE_VIVA).map((item) => ({
  id: item.id,
  name: item.name,
  activeIngredient: item.activeIngredient,
}));

const baseAnterior = lerJson(BASE_CONGELADA);
const goldenAnterior = lerJson(GOLDEN) ?? {};

const estritos = construirTokensEstritos(criticalMedicines);
const golden = {};
for (const consulta of CONSULTAS) {
  golden[consulta] = buscar(medicines, consulta, estritos)
    .map((item) => item.id)
    .sort();
}

escrever(BASE_CONGELADA, medicines);
escrever(GOLDEN, golden);

if (!baseAnterior) {
  console.log(`base congelada criada com ${medicines.length} registros`);
} else if (baseAnterior.length !== medicines.length) {
  console.log(`base congelada: ${baseAnterior.length} -> ${medicines.length} registros`);
} else {
  console.log(`base congelada: ${medicines.length} registros, sem mudança de tamanho`);
}

let mudou = 0;
for (const consulta of CONSULTAS) {
  const antes = goldenAnterior[consulta];
  const agora = golden[consulta];
  if (!antes) {
    console.log(`  + ${consulta}: ${agora.length} resultados (consulta nova)`);
    mudou += 1;
    continue;
  }
  if (JSON.stringify(antes) !== JSON.stringify(agora)) {
    console.log(`  ~ ${consulta}: ${antes.length} -> ${agora.length} resultados`);
    mudou += 1;
  }
}
for (const consulta of Object.keys(goldenAnterior)) {
  if (!CONSULTAS.includes(consulta)) {
    console.log(`  - ${consulta}: consulta removida da lista`);
    mudou += 1;
  }
}

console.log(mudou === 0 ? "referência inalterada" : `referência: ${mudou} consulta(s) mudaram`);
