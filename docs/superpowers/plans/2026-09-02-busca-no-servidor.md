# Busca no servidor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar as 26.001 apresentações do navegador, movendo a busca para o servidor, para que a home pare de pesar 19,98 MB pré-renderizada — peso que hoje faz a Vercel recusar o deploy.

**Architecture:** A lógica de casamento sai do componente para um módulo puro e passa a rodar atrás de uma rota `GET`. O navegador guarda apenas os resultados e continua fazendo filtros, ordenação e troca de alíquota localmente. Um arquivo de referência gerado com o código atual, antes de qualquer mudança, prova que o conjunto encontrado não mudou.

**Tech Stack:** Next.js 16 (App Router, Route Handlers); Node 24 com o test runner nativo (`node --test`, que remove tipos de `.ts` sem configuração); TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-02-busca-no-servidor-design.md`

## Global Constraints

- O conjunto de resultados de uma busca deve ser **idêntico** ao atual. O arquivo de referência é a prova, e ele é gerado antes de mover qualquer código.
- O navegador nunca recebe a base inteira. Só resultados.
- Apenas a digitação vai ao servidor. Tipo, laboratório, forma, teto de preço, ordenação e troca de alíquota continuam locais e instantâneos.
- Limite de **mil registros por grupo** na resposta, com aviso quando houver mais.
- Três quantidades distintas, nunca confundidas: quantos casaram a busca (servidor, antes do limite); quantos sobraram após os filtros locais; quantos estão à vista após o corte de 250. O contador ao lado da lista mostra o segundo.
- Erro de rede mostra falha explícita, nunca lista vazia — vazio significa "nada encontrado".
- Consulta com menos de duas letras não consulta a base.
- Resposta de consulta antiga nunca substitui a de uma mais recente.
- Mensagens de commit em inglês. Arquivos UTF-8, com os acentos da interface intactos. Nenhum segredo no repositório.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/gerar-golden-busca.mjs` (novo, descartado na Task 2) | Roda a lógica **atual**, transcrita, e grava a referência |
| `tests/fixtures/busca-golden.json` (novo) | Conjuntos de GGREM esperados por consulta |
| `src/lib/busca.ts` (novo) | Tokenização, casamento e expansão por princípio ativo — puro |
| `tests/busca.test.ts` (novo) | Unitários da lógica e o teste de ouro |
| `src/app/api/medicines/search/route.ts` (novo) | A rota, nos modos `q` e `ids` |
| `src/lib/medicines.ts` (alterado) | Cache da base em memória entre requisições |
| `src/app/page.tsx` (alterado) | Deixa de passar a base; passa as facetas globais |
| `src/components/pmc-comparator.tsx` (alterado) | Busca pela rota, com espera, corrida e estado de erro |

---

### Task 1: A referência, gerada com o código de hoje

Esta task roda **antes** de qualquer mudança de comportamento. Seu produto é um instantâneo do que a busca encontra hoje. Gerá-lo depois da mudança provaria apenas que o código concorda consigo mesmo.

A lógica atual vive dentro de um componente React e não pode ser importada por um script Node. Por isso o gerador carrega uma **transcrição literal** dessas funções. A transcrição é descartada na Task 2, quando o módulo real passa a existir.

**Files:**
- Create: `scripts/gerar-golden-busca.mjs`
- Create: `tests/fixtures/busca-golden.json`

**Interfaces:**
- Produces: `tests/fixtures/busca-golden.json` — um objeto cujas chaves são as consultas e cujos valores são arrays de códigos GGREM ordenados alfabeticamente.

- [ ] **Step 1: Transcrever a lógica atual**

Crie `scripts/gerar-golden-busca.mjs`. Copie de `src/components/pmc-comparator.tsx` as funções `normalize`, `textTokens`, `queryTokens`, `tokenMatchesText`, `tokensMatchText`, `matchesSearch`, `matchesRelatedIngredient`, a constante `strictSearchTokens` e o corpo do `useMemo` que constrói `relatedIngredients`. Copie **sem alterar uma linha** — remova apenas as anotações de tipo do TypeScript, que o Node não precisa aqui.

```javascript
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
    .replace(/[̀-ͯ]/g, "")
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
```

- [ ] **Step 2: Reproduzir a busca completa e gravar a referência**

Acrescente ao mesmo arquivo:

```javascript
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
```

Note que `buscar` reproduz a mesma composição que o componente faz: primeiro o conjunto de princípios ativos dos itens que casam por nome **ou** por substância, depois o filtro que aceita quem casa diretamente **ou** compartilha um desses princípios ativos.

- [ ] **Step 3: Gerar**

```bash
mkdir -p tests/fixtures && node scripts/gerar-golden-busca.mjs
```

Esperado: uma linha por consulta com sua contagem. `clonazepam` deve trazer dezenas; `leqembi`, exatamente 2; `ab` e `zzzznaoexiste`, zero — a primeira porque tokens com menos de três letras são descartados.

Se alguma contagem parecer implausível, pare e reporte: a transcrição pode ter divergido do original.

- [ ] **Step 4: Conferir a transcrição contra o original**

Compare visualmente cada função copiada com a de `src/components/pmc-comparator.tsx`. Confirme que apenas anotações de tipo foram removidas. Registre no relatório que fez essa conferência e o que encontrou.

- [ ] **Step 5: Commit**

```bash
git add scripts/gerar-golden-busca.mjs tests/fixtures/busca-golden.json
git commit -m "Capture the current search results as a reference"
```

---

### Task 2: A lógica sai do componente

Movimento puro: o mesmo código, em outro arquivo, com o componente passando a importá-lo. Nada de comportamento muda, e o teste de ouro prova isso.

**Files:**
- Create: `src/lib/busca.ts`
- Create: `tests/busca.test.ts`
- Modify: `src/components/pmc-comparator.tsx`
- Delete: `scripts/gerar-golden-busca.mjs`

**Interfaces:**
- Produces, de `src/lib/busca.ts`:
  - `normalize(value: string): string`
  - `textTokens(value: string): string[]`
  - `construirTokensEstritos(criticos: Array<{ query: string; allowed: string[] }>): Set<string>`
  - `tokensMatchText(search: string, text: string, estritos: Set<string>): boolean`
  - `buscar(medicines: Medicine[], consulta: string, estritos: Set<string>): Medicine[]` — devolve os itens que casam, já com a expansão por princípio ativo, na ordem original da base.

`src/lib/busca.ts` importa apenas tipos. O conjunto de tokens estritos chega por argumento, e não por importação do JSON de críticos — é isso que mantém o módulo testável pelo runner do Node, que não resolve o alias `@/`.

- [ ] **Step 1: Escrever o teste de ouro, que falha**

`tests/busca.test.ts`:

```typescript
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buscar, construirTokensEstritos, normalize, textTokens, tokensMatchText } from "../src/lib/busca.ts";

const raiz = process.cwd();
const criticos = JSON.parse(fs.readFileSync(path.join(raiz, "src/data/critical-medicines.json"), "utf8"));
const medicines = JSON.parse(fs.readFileSync(path.join(raiz, "src/data/medicines.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/busca-golden.json"), "utf8"));
const estritos = construirTokensEstritos(criticos);

test("a busca devolve exatamente o mesmo conjunto de antes", () => {
  for (const [consulta, esperado] of Object.entries(golden)) {
    const obtido = buscar(medicines, consulta, estritos).map((item) => item.id).sort();
    assert.deepEqual(obtido, esperado, `divergiu na consulta "${consulta}"`);
  }
});

test("remove acentos e caixa", () => {
  assert.equal(normalize("Lítio"), "litio");
});

test("separa em tokens ignorando pontuacao", () => {
  assert.deepEqual(textTokens("500 MG/ML, COM"), ["500", "mg", "ml", "com"]);
});

test("token de consulta com menos de tres letras nao casa nada", () => {
  assert.equal(tokensMatchText("ab", "abacavir", estritos), false);
});

test("token nao estrito casa por prefixo", () => {
  assert.equal(tokensMatchText("clonaz", "clonazepam", estritos), true);
});

test("token estrito exige igualdade", () => {
  assert.ok(estritos.has("clonazepam"));
  assert.equal(tokensMatchText("clonazepam", "clonazepamx", estritos), false);
});

test("consulta vazia devolve nada", () => {
  assert.deepEqual(buscar(medicines, "", estritos), []);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
node --test
```

Esperado: FAIL, `Cannot find module '../src/lib/busca.ts'`.

- [ ] **Step 3: Criar o módulo**

`src/lib/busca.ts`, com as funções movidas de `src/components/pmc-comparator.tsx` sem alteração de lógica:

```typescript
import type { Medicine } from "@/lib/types";

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
```

- [ ] **Step 4: Rodar o teste de ouro**

```bash
node --test
```

Esperado: todos passam, incluindo o de ouro. **Se o teste de ouro falhar, pare e reporte** — significa que o movimento alterou o comportamento, que é exatamente o que ele existe para impedir. Não ajuste o arquivo de referência para acomodar a diferença.

- [ ] **Step 5: Fazer o componente usar o módulo**

Em `src/components/pmc-comparator.tsx`, remova as funções agora duplicadas — `normalize`, `textTokens`, `queryTokens`, `tokenMatchesText`, `tokensMatchText` e a constante `strictSearchTokens` — e importe do módulo:

```typescript
import { buscar, construirTokensEstritos, normalize, tokensMatchText } from "@/lib/busca";
```

Logo abaixo dos imports, construa o conjunto uma vez:

```typescript
const strictSearchTokens = construirTokensEstritos(criticalMedicines);
```

As chamadas a `tokensMatchText` dentro do componente passam a receber `strictSearchTokens` como terceiro argumento. `matchesSearch` e `matchesRelatedIngredient` continuam no componente por enquanto; a Task 4 é quem os remove.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
```

Esperado: limpo.

```bash
npm run lint
```

Esperado: limpo.

- [ ] **Step 7: Descartar o gerador**

A transcrição cumpriu seu papel; mantê-la criaria uma segunda cópia da lógica, livre para divergir.

```bash
git rm scripts/gerar-golden-busca.mjs
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/busca.ts tests/busca.test.ts src/components/pmc-comparator.tsx
git commit -m "Move the search matching logic into its own module"
```

---

### Task 3: A base fica em memória no servidor

Sem isto, cada tecla digitada vira uma consulta ao Neon.

**Files:**
- Modify: `src/lib/medicines.ts`

**Interfaces:**
- Produces: `getMedicinesCached(): Promise<Medicine[]>` — devolve a mesma coisa que `getMedicines()`, guardando o resultado em memória do processo por 15 minutos.

- [ ] **Step 1: Implementar o cache**

Em `src/lib/medicines.ts`, ao final do arquivo:

```typescript
const CACHE_MS = 15 * 60 * 1000;

let cache: { at: number; medicines: Medicine[] } | null = null;
let emVoo: Promise<Medicine[]> | null = null;

export async function getMedicinesCached() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.medicines;
  // Sem esta guarda, várias requisições simultâneas numa instância fria
  // disparariam a mesma consulta ao banco em paralelo.
  if (!emVoo) {
    emVoo = getMedicines()
      .then((medicines) => {
        cache = { at: Date.now(), medicines };
        return medicines;
      })
      .finally(() => {
        emVoo = null;
      });
  }
  return emVoo;
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```

Esperado: limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/medicines.ts
git commit -m "Cache the medicine base in server memory"
```

---

### Task 4: A rota

**Files:**
- Create: `src/app/api/medicines/search/route.ts`
- Test: `tests/rota-busca.test.ts`

**Interfaces:**
- Consumes: `buscar`, `construirTokensEstritos` (Task 2); `getMedicinesCached` (Task 3); `temPmc` de `@/lib/precos`.
- Produces: `GET /api/medicines/search`, com `?q=` ou `?ids=`, respondendo:

```json
{
  "comPmc": [],
  "semPmc": [],
  "totalComPmc": 0,
  "totalSemPmc": 0,
  "truncado": false,
  "laboratorios": []
}
```

- Produces: `montarResposta(medicines: Medicine[]): RespostaBusca` — função pura exportada da rota, para poder ser testada sem servidor HTTP.

- [ ] **Step 1: Escrever os testes que falham**

`tests/rota-busca.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { LIMITE_POR_GRUPO, montarResposta } from "../src/app/api/medicines/search/route.ts";

function med(id: string, comPmc: boolean, laboratory = "ACME") {
  return {
    id,
    name: `M${id}`,
    activeIngredient: "X",
    laboratory,
    kind: "Genérico",
    presentation: "1 MG",
    pmc: comPmc ? { "18": 10 } : {},
    pf: comPmc ? undefined : { "18": 99 },
    sourcePage: 0,
    source: "CMED/Anvisa",
    tableDate: "11/08/2026",
  } as never;
}

test("separa os dois grupos", () => {
  const r = montarResposta([med("a", true), med("b", false)]);
  assert.deepEqual(r.comPmc.map((i) => i.id), ["a"]);
  assert.deepEqual(r.semPmc.map((i) => i.id), ["b"]);
});

test("conta antes de truncar e sinaliza o truncamento", () => {
  const muitos = Array.from({ length: LIMITE_POR_GRUPO + 5 }, (_, i) => med(`x${i}`, true));
  const r = montarResposta(muitos);
  assert.equal(r.totalComPmc, LIMITE_POR_GRUPO + 5);
  assert.equal(r.comPmc.length, LIMITE_POR_GRUPO);
  assert.equal(r.truncado, true);
});

test("nao sinaliza truncamento quando cabe", () => {
  assert.equal(montarResposta([med("a", true)]).truncado, false);
});

test("lista os laboratorios encontrados, ordenados e sem repeticao", () => {
  const r = montarResposta([med("a", true, "Zeta"), med("b", true, "Alfa"), med("c", false, "Alfa")]);
  assert.deepEqual(r.laboratorios, ["Alfa", "Zeta"]);
});

test("conjunto vazio devolve resposta vazia e sem truncamento", () => {
  const r = montarResposta([]);
  assert.deepEqual(r.comPmc, []);
  assert.deepEqual(r.semPmc, []);
  assert.equal(r.totalComPmc, 0);
  assert.equal(r.truncado, false);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
node --test
```

Esperado: FAIL, módulo não encontrado.

- [ ] **Step 3: Escrever a rota**

`src/app/api/medicines/search/route.ts`:

```typescript
import { NextResponse } from "next/server";

import criticalMedicines from "@/data/critical-medicines.json";
import { buscar, construirTokensEstritos } from "@/lib/busca";
import { getMedicinesCached } from "@/lib/medicines";
import { temPmc } from "@/lib/precos";
import type { Medicine } from "@/lib/types";

export const LIMITE_POR_GRUPO = 1000;
const MINIMO_DE_LETRAS = 2;

const estritos = construirTokensEstritos(criticalMedicines);

export type RespostaBusca = {
  comPmc: Medicine[];
  semPmc: Medicine[];
  totalComPmc: number;
  totalSemPmc: number;
  truncado: boolean;
  laboratorios: string[];
};

export function montarResposta(encontrados: Medicine[]): RespostaBusca {
  const comPmc = encontrados.filter(temPmc);
  const semPmc = encontrados.filter((item) => !temPmc(item));
  const laboratorios = Array.from(new Set(encontrados.map((item) => item.laboratory))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return {
    comPmc: comPmc.slice(0, LIMITE_POR_GRUPO),
    semPmc: semPmc.slice(0, LIMITE_POR_GRUPO),
    totalComPmc: comPmc.length,
    totalSemPmc: semPmc.length,
    truncado: comPmc.length > LIMITE_POR_GRUPO || semPmc.length > LIMITE_POR_GRUPO,
    laboratorios,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const consulta = (params.get("q") ?? "").trim();
  const ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  if (!ids.length && consulta.length < MINIMO_DE_LETRAS) {
    return NextResponse.json(montarResposta([]));
  }

  try {
    const medicines = await getMedicinesCached();
    const encontrados = ids.length
      ? medicines.filter((item) => ids.includes(item.id))
      : buscar(medicines, consulta, estritos);
    return NextResponse.json(montarResposta(encontrados));
  } catch {
    // Responder vazio aqui seria indistinguível de "nada encontrado".
    return NextResponse.json({ erro: "Não foi possível consultar a base." }, { status: 503 });
  }
}
```

- [ ] **Step 4: Rodar os testes**

```bash
node --test
```

Esperado: todos passam.

- [ ] **Step 5: Exercitar a rota de verdade**

Suba o app com a ferramenta de navegador embutida e busque estas URLs, registrando o que cada uma devolveu:

- `/api/medicines/search?q=leqembi` — `semPmc` com 2 itens, `comPmc` vazio, `truncado` falso.
- `/api/medicines/search?q=clonazepam` — `comPmc` povoado, `laboratorios` com mais de um nome.
- `/api/medicines/search?q=a` — tudo vazio, sem consultar a base.
- `/api/medicines/search?ids=<um GGREM de leqembi>` — exatamente aquele item.

Não use um servidor iniciado por shell.

- [ ] **Step 6: Verificar e commitar**

```bash
npx tsc --noEmit && npm run lint
```

```bash
git add src/app/api/medicines/search/route.ts tests/rota-busca.test.ts
git commit -m "Add a server-side medicine search route"
```

---

### Task 5: A home para de carregar a base

Depois desta task o navegador não recebe mais a base, e o peso pré-renderizado despenca. A busca passa a viajar, com espera de 300 ms.

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/pmc-comparator.tsx`

**Interfaces:**
- Consumes: `GET /api/medicines/search` e o formato `RespostaBusca` (Task 4).
- Produces: `PmcComparator` passa a receber `{ tipos: string[]; formas: string[] }` no lugar de `medicines`.

- [ ] **Step 1: Mover `inferForm` para o módulo de busca**

A página vai precisar dela no passo seguinte, e ela não pode viver num componente de cliente. Mova `inferForm` de `src/components/pmc-comparator.tsx` para `src/lib/busca.ts`, exportando-a, sem alterar o corpo. No componente, importe-a de `@/lib/busca`.

Este passo vem antes do próximo porque a página o referencia.

- [ ] **Step 2: A página passa apenas as facetas globais**

`tipos` e `formas` derivam da base inteira, e não da busca, então continuam vindo do servidor — mas como algumas dezenas de textos, não 26 mil registros.

`src/app/page.tsx`:

```tsx
import { PmcComparator } from "@/components/pmc-comparator";
import { getMedicinesCached } from "@/lib/medicines";
import { inferForm } from "@/lib/busca";

export const revalidate = 3600;

export default async function Home() {
  const medicines = await getMedicinesCached();
  const tipos = Array.from(new Set(medicines.map((item) => item.kind))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const formas = Array.from(new Set(medicines.map((item) => inferForm(item.presentation)))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  return <PmcComparator formas={formas} tipos={tipos} />;
}
```

- [ ] **Step 3: Trocar a propriedade e buscar pela rota**

Em `src/components/pmc-comparator.tsx`, troque a assinatura de `medicines: Medicine[]` por `{ tipos, formas }`, e substitua os `useMemo` que derivavam de `medicines` por estado alimentado pela rota:

```typescript
  const [resposta, setResposta] = useState<RespostaBusca | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const consulta = query.trim();
    if (consulta.length < 2 && !onlyFavorites) {
      setResposta(null);
      return;
    }

    const controlador = new AbortController();
    const timer = setTimeout(() => {
      setBuscando(true);
      const params = onlyFavorites && consulta.length < 2
        ? `ids=${encodeURIComponent(favorites.join(","))}`
        : `q=${encodeURIComponent(consulta)}`;
      fetch(`/api/medicines/search?${params}`, { signal: controlador.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
        .then((dados) => setResposta(dados))
        .catch((erro) => {
          if (erro.name !== "AbortError") setResposta(null);
        })
        .finally(() => setBuscando(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controlador.abort();
    };
  }, [favorites, onlyFavorites, query]);
```

O `AbortController` no retorno do efeito é o que impede que a resposta de uma consulta antiga substitua a de uma mais recente: ao digitar de novo, a anterior é cancelada antes de chegar.

`kindOptions` passa a ser `["Todos", ...tipos]` e `formOptions` passa a ser `["Todas", ...formas]`. `labOptions` passa a ser `["Todos", ...(resposta?.laboratorios ?? [])]`. O `useMemo` de `relatedIngredients` e as funções `matchesSearch` e `matchesRelatedIngredient` são removidos — o servidor já fez esse trabalho.

O `useMemo` de `filtered` deixa de partir de `medicines` e passa a partir de `[...(resposta?.comPmc ?? []), ...(resposta?.semPmc ?? [])]`, mantendo intactos os filtros de tipo, laboratório, forma e teto, a ordenação e a divisão por `temPmc` que já existem.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: ambos limpos.

- [ ] **Step 5: Medir o que foi conquistado**

```bash
npm run build
```

Na tabela de rotas, `/` deve continuar aparecendo. Confirme no relatório que o build **não** emite mais o aviso `Oversized Incremental Static Regeneration (ISR) page`, que é o motivo de todo este trabalho.

- [ ] **Step 6: Ver funcionando**

Com a ferramenta de navegador embutida, confirme: digitar `clonazepam` mostra resultados após a pausa; digitar `leqembi` mostra o bloco de Preço Fábrica com as duas apresentações; trocar de UF muda os preços sem nova busca; alternar tipo e laboratório responde instantaneamente. Tire uma captura da busca por `leqembi`.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/pmc-comparator.tsx src/lib/busca.ts
git commit -m "Fetch search results from the server instead of shipping the base"
```

---

### Task 6: Estados de espera, erro e truncamento

A Task 5 deixou o mecanismo funcionando. Esta trata do que o usuário vê quando ele está lento, quebrado, ou devolvendo mais do que cabe.

**Files:**
- Modify: `src/components/pmc-comparator.tsx`

- [ ] **Step 1: Distinguir erro de "nada encontrado"**

Acrescente um estado de erro, alimentado pelo `catch` do efeito da Task 5:

```typescript
  const [erro, setErro] = useState(false);
```

No `catch`, `setErro(true)` para falhas que não sejam `AbortError`; no início de cada busca, `setErro(false)`.

Quando `erro` for verdadeiro, o lugar da lista mostra, no lugar do estado vazio:

> **Não foi possível buscar**
> A consulta não chegou ao servidor. Verifique sua conexão e tente de novo.

com um botão **Tentar de novo** que refaz a última consulta.

Um usuário que vê "nenhum resultado" quando na verdade a rede caiu conclui que o medicamento não existe — que é o erro que este projeto inteiro existe para não cometer.

- [ ] **Step 2: Mostrar que está buscando**

Enquanto `buscando` for verdadeiro **e** ainda não houver resposta, o lugar da lista mostra `Buscando…`. Não substitua resultados já exibidos por esse indicador: quem está refinando a consulta continua vendo o conjunto anterior até o novo chegar.

- [ ] **Step 3: Avisar sobre o truncamento**

Quando `resposta.truncado` for verdadeiro, exiba acima da lista:

> Esta busca encontrou {totalComPmc + totalSemPmc} apresentações, mais do que cabe numa consulta. Refine os termos para ver as demais.

Os dois totais vêm da resposta e são contados antes do corte, então este número é o real.

- [ ] **Step 4: Conferir os três números**

O contador ao lado da lista deve mostrar quantos itens sobraram depois dos filtros locais — não `totalComPmc`, que é quantos casaram a busca antes de qualquer filtro ou corte. Confirme por leitura qual valor está ali e corrija se necessário. Registre no relatório o que encontrou.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 6: Ver os três estados, e a proteção contra corrida**

Com o navegador embutido: busque algo que exista e veja o resultado; busque `com` para provocar o truncamento e leia o aviso; e, com as ferramentas de rede, bloqueie a rota para ver o estado de erro. Descreva os três no relatório.

Verifique também a proteção contra corrida, que **não tem teste automatizado** — o projeto não tem como testar componentes React, e escrever um arranjo só para isso seria desproporcional. A verificação é em duas partes, e ambas vão para o relatório:

1. Por leitura: confirme que o retorno do `useEffect` chama `controlador.abort()` e `clearTimeout`, e que o `catch` ignora `AbortError` sem tocar o estado.
2. Na prática: digite `clonazepam` letra por letra, rápido, e observe no painel de rede que as requisições anteriores aparecem canceladas e que a lista final corresponde ao termo completo, não a um prefixo.

- [ ] **Step 7: Commit**

```bash
git add src/components/pmc-comparator.tsx
git commit -m "Tell the user when the search is loading, failed or truncated"
```

---

## Notas de execução

- As Tasks 1 a 4 não dependem de banco: `getMedicines()` cai no JSON quando não há `DATABASE_URL`. As Tasks 5 e 6 precisam do navegador embutido.
- O arquivo `tests/fixtures/busca-golden.json` é versionado de propósito. Se um dia a busca mudar de propósito, ele precisa ser regerado deliberadamente, e essa regeração é a decisão a ser revisada — não um detalhe do commit.
- Nenhuma task altera `src/data/medicines.json`.
