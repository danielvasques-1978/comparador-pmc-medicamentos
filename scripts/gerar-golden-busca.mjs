import fs from "node:fs";
import path from "node:path";

const criticalMedicines = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src", "data", "critical-medicines.json"), "utf8"),
);
const medicines = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src", "data", "medicines.json"), "utf8"),
);

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textTokens(value) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const strictSearchTokens = new Set(
  criticalMedicines.flatMap((item) => [item.query, ...item.allowed].flatMap((value) => textTokens(value))),
);

function queryTokens(search) {
  return textTokens(search).filter((token) => token.length >= 3);
}

function tokenMatchesText(queryToken, textToken) {
  if (strictSearchTokens.has(queryToken)) return textToken === queryToken;
  return textToken.startsWith(queryToken);
}

function tokensMatchText(search, text) {
  const searchTokens = queryTokens(search);
  if (searchTokens.length === 0) return false;
  const searchableTokens = textTokens(text);
  return searchTokens.every((queryToken) =>
    searchableTokens.some((textToken) => tokenMatchesText(queryToken, textToken)),
  );
}

function matchesSearch(item, search) {
  if (!search) return true;
  return tokensMatchText(search, `${item.name} ${item.activeIngredient}`);
}

function matchesRelatedIngredient(item, relatedIngredients) {
  return relatedIngredients.has(normalize(item.activeIngredient));
}

function buscar(consulta) {
  const search = normalize(consulta);
  if (!search) return [];

  const ingredients = new Set();
  for (const item of medicines) {
    if (tokensMatchText(search, item.name) || tokensMatchText(search, item.activeIngredient)) {
      ingredients.add(normalize(item.activeIngredient));
    }
  }

  return medicines
    .filter((item) => matchesSearch(item, search) || ingredients.has(normalize(item.activeIngredient)))
    .map((item) => item.id)
    .sort();
}

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
];

const golden = {};
for (const consulta of CONSULTAS) golden[consulta] = buscar(consulta);

fs.writeFileSync(
  path.join(process.cwd(), "tests", "fixtures", "busca-golden.json"),
  JSON.stringify(golden, null, 2) + "\n",
  "utf8",
);

for (const consulta of CONSULTAS) {
  console.log(`${consulta}: ${golden[consulta].length}`);
}
