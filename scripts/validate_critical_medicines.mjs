import criticalMedicines from "../src/data/critical-medicines.json" with { type: "json" };
import rawMedicines from "../src/data/medicines.json" with { type: "json" };

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const medicines = rawMedicines;

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
  return normalize(search)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function tokensMatchText(search, text) {
  const searchTokens = queryTokens(search);
  const searchableTokens = textTokens(text);
  return searchTokens.every((queryToken) =>
    searchableTokens.some((textToken) =>
      strictSearchTokens.has(queryToken) ? textToken === queryToken : textToken.startsWith(queryToken),
    ),
  );
}

function ingredientTokens(item) {
  const labTokens = new Set(textTokens(item.laboratory));
  const ignored = new Set([
    "acido",
    "clor",
    "clorid",
    "cloridrato",
    "cloreto",
    "carbonato",
    "de",
    "di",
    "do",
    "da",
    "e",
    "gen",
    "generic",
    "generico",
    "generica",
    "monoidratada",
    "monoidratado",
    "sodica",
    "sodico",
  ]);

  return textTokens(item.activeIngredient).filter(
    (token) => token.length >= 4 && !ignored.has(token) && !labTokens.has(token),
  );
}

function relatedIngredientKeys(search) {
  const ingredients = new Set();
  for (const item of medicines) {
    if (!tokensMatchText(search, `${item.name} ${item.activeIngredient}`)) continue;
    ingredients.add(normalize(item.activeIngredient));
  }
  return ingredients;
}

function searchResults(query) {
  const relatedIngredients = relatedIngredientKeys(query);
  return medicines.filter(
    (item) =>
      tokensMatchText(query, `${item.name} ${item.activeIngredient}`) ||
      relatedIngredients.has(normalize(item.activeIngredient)),
  );
}

function hasAllowedIngredient(item, allowed) {
  const tokens = new Set(ingredientTokens(item));
  return allowed.some((allowedToken) => tokens.has(normalize(allowedToken)));
}

const failures = [];
const absent = [];
const summary = [];

for (const item of criticalMedicines) {
  const results = searchResults(item.query);
  const directPresence = medicines.some((medicine) =>
    item.allowed.some((allowedToken) => ingredientTokens(medicine).includes(normalize(allowedToken))),
  );

  if (!directPresence) {
    absent.push(item.label);
    summary.push({ label: item.label, total: 0, status: "absent" });
    continue;
  }

  const invalid = results.filter((medicine) => !hasAllowedIngredient(medicine, item.allowed));
  if (results.length === 0 || invalid.length > 0) {
    failures.push({
      label: item.label,
      query: item.query,
      total: results.length,
      invalid: invalid.slice(0, 10).map((medicine) => ({
        name: medicine.name,
        activeIngredient: medicine.activeIngredient,
        laboratory: medicine.laboratory,
      })),
    });
  }

  summary.push({ label: item.label, total: results.length, status: invalid.length ? "invalid" : "ok" });
}

const okCount = summary.filter((item) => item.status === "ok").length;
console.log(`Critical medicine validation: ${okCount} OK, ${absent.length} absent, ${failures.length} failing.`);

if (absent.length > 0) {
  console.log(`Absent from current imported base: ${absent.join(", ")}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
