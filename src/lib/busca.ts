import type { Medicine } from "@/lib/types";

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function textTokens(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function construirTokensEstritos(criticos: Array<{ query: string; allowed: string[] }>) {
  return new Set(criticos.flatMap((item) => [item.query, ...item.allowed].flatMap((value) => textTokens(value))));
}

function queryTokens(search: string) {
  return textTokens(search).filter((token) => token.length >= 3);
}

function tokenMatchesText(queryToken: string, textToken: string, estritos: Set<string>) {
  if (estritos.has(queryToken)) return textToken === queryToken;
  return textToken.startsWith(queryToken);
}

export function tokensMatchText(search: string, text: string, estritos: Set<string>) {
  const searchTokens = queryTokens(search);
  if (searchTokens.length === 0) return false;
  const searchableTokens = textTokens(text);
  return searchTokens.every((queryToken) =>
    searchableTokens.some((textToken) => tokenMatchesText(queryToken, textToken, estritos)),
  );
}

export function inferForm(presentation: string) {
  const text = normalize(presentation);
  // Por palavra inteira: a CMED abrevia comprimido como COM (raramente COMP) e
  // cápsula como CAP (raramente CAPS). Substring pegaria COMPRESSAS e CAPILAR.
  const palavras = new Set(text.split(/\s+/));
  if (palavras.has("com") || palavras.has("comp")) return "Comprimido";
  if (palavras.has("cap") || palavras.has("caps")) return "Cápsula";
  if (text.includes("xpe") || text.includes("susp")) return "Xarope/suspensão";
  if (text.includes("inj") || text.includes("amp") || text.includes("fa ")) return "Injetável";
  if (palavras.has("crem") || palavras.has("creme") || text.includes("gel") || text.includes("pom")) return "Tópico";
  if (text.includes("sol") || text.includes("got")) return "Solução/gotas";
  return "Outras";
}

export function buscar(medicines: Medicine[], consulta: string, estritos: Set<string>) {
  const search = normalize(consulta);
  if (!search) return [];

  const ingredientes = new Set<string>();
  for (const item of medicines) {
    if (
      tokensMatchText(search, item.name, estritos) ||
      tokensMatchText(search, item.activeIngredient, estritos)
    ) {
      ingredientes.add(normalize(item.activeIngredient));
    }
  }

  return medicines.filter(
    (item) =>
      tokensMatchText(search, `${item.name} ${item.activeIngredient}`, estritos) ||
      ingredientes.has(normalize(item.activeIngredient)),
  );
}
