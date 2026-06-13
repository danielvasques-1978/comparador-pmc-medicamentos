import criticalMedicines from "../src/data/critical-medicines.json" with { type: "json" };
import manualCriticalMedicines from "../src/data/manual-critical-medicines.json" with { type: "json" };
import rawMedicines from "../src/data/medicines.json" with { type: "json" };

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanMedicine(medicine) {
  const name = normalize(medicine.name);
  const activeIngredient = normalize(medicine.activeIngredient);

  if (name.includes("prometazina") && name.includes("exp")) {
    return null;
  }

  if (name.includes("desvenlafaxina") && activeIngredient === "venlafaxina") {
    return { ...medicine, activeIngredient: "DESVENLAFAXINA" };
  }

  return medicine;
}

const manualIds = new Set(manualCriticalMedicines.map((medicine) => medicine.id));
const medicines = [
  ...rawMedicines.flatMap((medicine) => {
    if (manualIds.has(medicine.id)) return [];
    const cleaned = cleanMedicine(medicine);
    return cleaned ? [cleaned] : [];
  }),
  ...manualCriticalMedicines,
];

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

function relatedIngredientTokens(search) {
  const searchTokens = queryTokens(search);
  const matchingTokens = new Set();
  const fallbackTokens = new Set();
  const criticalSearch = criticalMedicines.find((item) => tokensMatchText(search, item.query));

  if (criticalSearch) {
    for (const value of criticalSearch.allowed) {
      for (const token of textTokens(value)) matchingTokens.add(token);
    }
  }

  for (const item of medicines) {
    if (!tokensMatchText(search, `${item.name} ${item.activeIngredient}`)) continue;
    const itemTokens = ingredientTokens(item);
    const matchingIngredientTokens = itemTokens.filter((token) =>
      searchTokens.some((queryToken) =>
        strictSearchTokens.has(queryToken) ? token === queryToken : token.startsWith(queryToken),
      ),
    );
    for (const token of matchingIngredientTokens) matchingTokens.add(token);
    for (const token of itemTokens) fallbackTokens.add(token);
  }

  return matchingTokens.size > 0 ? matchingTokens : fallbackTokens;
}

function searchResults(query) {
  const relatedTokens = relatedIngredientTokens(query);
  return medicines.filter(
    (item) =>
      tokensMatchText(query, `${item.name} ${item.activeIngredient}`) ||
      ingredientTokens(item).some((token) => relatedTokens.has(token)),
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
