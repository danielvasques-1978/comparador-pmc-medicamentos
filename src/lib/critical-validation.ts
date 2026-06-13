import criticalMedicines from "@/data/critical-medicines.json";
import type { Medicine } from "@/lib/types";

export type CriticalValidationItem = {
  label: string;
  query: string;
  total: number;
  status: "ok" | "absent" | "invalid";
  invalid: Array<Pick<Medicine, "name" | "activeIngredient" | "laboratory">>;
};

export type CriticalValidationReport = {
  ok: number;
  absent: number;
  invalid: number;
  items: CriticalValidationItem[];
};

type PreparedMedicine = {
  medicine: Medicine;
  searchableTokens: string[];
  ingredientTokens: string[];
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textTokens(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const strictSearchTokens = new Set(
  criticalMedicines.flatMap((item) => [item.query, ...item.allowed].flatMap((value) => textTokens(value))),
);

function queryTokens(search: string) {
  return normalize(search)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function tokensMatchText(search: string, text: string) {
  const searchTokens = queryTokens(search);
  const searchableTokens = textTokens(text);
  return searchTokens.every((queryToken) =>
    searchableTokens.some((textToken) =>
      strictSearchTokens.has(queryToken) ? textToken === queryToken : textToken.startsWith(queryToken),
    ),
  );
}

function ingredientTokens(item: Medicine) {
  const labTokens = new Set(textTokens(item.laboratory));
  const ignored = new Set([
    "acido",
    "carbonato",
    "clor",
    "clorid",
    "cloridrato",
    "cloreto",
    "da",
    "de",
    "di",
    "do",
    "e",
    "gen",
    "generic",
    "generica",
    "generico",
    "monoidratada",
    "monoidratado",
    "sodica",
    "sodico",
  ]);

  return textTokens(item.activeIngredient).filter(
    (token) => token.length >= 4 && !ignored.has(token) && !labTokens.has(token),
  );
}

function prepareMedicines(medicines: Medicine[]): PreparedMedicine[] {
  return medicines.map((medicine) => ({
    medicine,
    searchableTokens: textTokens(`${medicine.name} ${medicine.activeIngredient}`),
    ingredientTokens: ingredientTokens(medicine),
  }));
}

function preparedTokensMatchText(search: string, item: PreparedMedicine) {
  const searchTokens = queryTokens(search);
  return searchTokens.every((queryToken) =>
    item.searchableTokens.some((textToken) =>
      strictSearchTokens.has(queryToken) ? textToken === queryToken : textToken.startsWith(queryToken),
    ),
  );
}

function relatedIngredientTokens(search: string, medicines: PreparedMedicine[]) {
  const searchTokens = queryTokens(search);
  const matchingTokens = new Set<string>();
  const fallbackTokens = new Set<string>();
  const criticalSearch = criticalMedicines.find((item) => tokensMatchText(search, item.query));

  criticalSearch?.allowed.forEach((value) => {
    textTokens(value).forEach((token) => matchingTokens.add(token));
  });

  for (const item of medicines) {
    if (!preparedTokensMatchText(search, item)) continue;
    const matchingIngredientTokens = item.ingredientTokens.filter((token) =>
      searchTokens.some((queryToken) =>
        strictSearchTokens.has(queryToken) ? token === queryToken : token.startsWith(queryToken),
      ),
    );
    matchingIngredientTokens.forEach((token) => matchingTokens.add(token));
    item.ingredientTokens.forEach((token) => fallbackTokens.add(token));
  }

  return matchingTokens.size > 0 ? matchingTokens : fallbackTokens;
}

function searchResults(query: string, medicines: PreparedMedicine[]) {
  const relatedTokens = relatedIngredientTokens(query, medicines);
  return medicines.filter(
    (item) =>
      preparedTokensMatchText(query, item) || item.ingredientTokens.some((token) => relatedTokens.has(token)),
  );
}

function hasAllowedIngredient(item: PreparedMedicine, allowed: string[]) {
  const tokens = new Set(item.ingredientTokens);
  return allowed.some((allowedToken) => tokens.has(normalize(allowedToken)));
}

export function validateCriticalMedicines(medicines: Medicine[]): CriticalValidationReport {
  const preparedMedicines = prepareMedicines(medicines);
  const items = criticalMedicines.map((item) => {
    const directPresence = preparedMedicines.some((medicine) =>
      item.allowed.some((allowedToken) => medicine.ingredientTokens.includes(normalize(allowedToken))),
    );

    if (!directPresence) {
      return {
        label: item.label,
        query: item.query,
        total: 0,
        status: "absent" as const,
        invalid: [],
      };
    }

    const results = searchResults(item.query, preparedMedicines);
    const invalid = results
      .filter((medicine) => !hasAllowedIngredient(medicine, item.allowed))
      .slice(0, 10)
      .map(({ medicine }) => ({
        name: medicine.name,
        activeIngredient: medicine.activeIngredient,
        laboratory: medicine.laboratory,
      }));

    return {
      label: item.label,
      query: item.query,
      total: results.length,
      status: results.length > 0 && invalid.length === 0 ? ("ok" as const) : ("invalid" as const),
      invalid,
    };
  });

  return {
    ok: items.filter((item) => item.status === "ok").length,
    absent: items.filter((item) => item.status === "absent").length,
    invalid: items.filter((item) => item.status === "invalid").length,
    items,
  };
}
