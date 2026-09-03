# Home sem banco em tempo de build — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home passa a montar Tipo, Forma, data da tabela e fonte a partir do snapshot embutido `src/data/medicines.json`, e o `next build` deixa de depender de rede e de credencial do banco.

**Architecture:** A derivação das facetas sai de `src/app/page.tsx` para um módulo puro novo, `src/lib/facetas.ts`, testável com `node --test`. `src/lib/medicines.ts` passa a exportar o snapshot que já carrega. A home vira síncrona, sem `revalidate`, e chama `facetasDaBase(snapshotEmbutido)`. Nada muda na busca em tempo de execução nem em `getMedicines()`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Node 24 (`node --test` com remoção nativa de tipos), ESLint.

Spec: `docs/superpowers/specs/2026-09-03-home-sem-banco-no-build-design.md`.

## Global Constraints

- `src/lib/facetas.ts` só pode importar módulos puros de `src/lib` **por caminho relativo** (`./busca`, `./types`) — nada de `@/`, nada de `next/*`, nada de `@/data/*`. É o que permite ao `node --test` carregá-lo, e é o padrão de `precos.ts`, `busca.ts` e `codigos.ts`.
- A lógica é **movida** da home, não reescrita: valores distintos de `kind`; valores distintos de `inferForm(presentation)`; ambos ordenados com `localeCompare(…, "pt-BR")`; `tableDate` e `source` do primeiro registro.
- Padrões de texto, literais: `"Não informada"` para a data e `"Fonte importada"` para a fonte, quando a base está vazia.
- O snapshot é exportado de `src/lib/medicines.ts` com o nome `snapshotEmbutido`. O JSON continua importado **só** nesse arquivo.
- `export const revalidate = 3600` sai de `src/app/page.tsx`. Não colocar `dynamic`, `fetchCache` nem outra anotação no lugar.
- `getMedicines()` e `getMedicinesCached()` **não mudam de comportamento**. Nenhum fallback novo para o snapshot em caso de erro do banco.
- Ao rodar `npm run build` localmente, o Next reescreve `next-env.d.ts`; restaurar com `git checkout -- next-env.d.ts` antes de commitar.
- O `tsc` do projeto type-checa os testes (`tests/` está no `include`); um teste que não compila é falha.
- Commits terminam com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Módulo `facetas.ts` com testes

**Files:**
- Create: `src/lib/facetas.ts`
- Test: `tests/facetas.test.ts`

**Interfaces:**
- Consumes: `inferForm(presentation: string): string` de `src/lib/busca.ts`; tipo `Medicine` de `src/lib/types.ts` (campos usados: `kind: string`, `presentation: string`, `tableDate: string`, `source: string`).
- Produces:
  ```ts
  export type FonteDeFacetas = Pick<Medicine, "kind" | "presentation" | "tableDate" | "source">;
  export type Facetas = { tipos: string[]; formas: string[]; tableDate: string; source: string };
  export function facetasDaBase(medicines: FonteDeFacetas[]): Facetas;
  ```
  A Task 2 chama `facetasDaBase(snapshotEmbutido)` — `Medicine[]` satisfaz `FonteDeFacetas[]` por estrutura.

Por que `Pick` e não `Medicine[]` direto: o `tsc` type-checa os testes, e `Medicine` tem mais de vinte campos obrigatórios. Com o tipo estreito, os testes montam objetos de quatro campos sem `as` e sem fixture gigante — o mesmo motivo pelo qual `codigos.ts` recebe `Identificavel` em vez de `Medicine`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Criar `tests/facetas.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { facetasDaBase } from "../src/lib/facetas.ts";

const registro = (kind: string, presentation: string) => ({
  kind,
  presentation,
  tableDate: "11/08/2026",
  source: "CMED/Anvisa",
});

test("tipos: deduplica e ordena em pt-BR, com acento no lugar certo", () => {
  const base = [
    registro("Similar", "10 MG COM REV CT BL AL X 30"),
    registro("Novo", "10 MG COM REV CT BL AL X 30"),
    registro("Genérico", "10 MG COM REV CT BL AL X 30"),
    registro("Similar", "10 MG COM REV CT BL AL X 30"),
    registro("Não informado", "10 MG COM REV CT BL AL X 30"),
    registro("Específico", "10 MG COM REV CT BL AL X 30"),
  ];
  // Em pt-BR, "Não informado" vem antes de "Novo": o ã conta como a.
  // Uma ordenação por código de caractere poria "Novo" antes.
  assert.deepEqual(facetasDaBase(base).tipos, [
    "Específico",
    "Genérico",
    "Não informado",
    "Novo",
    "Similar",
  ]);
});

test("formas: deriva por inferForm, deduplica e ordena em pt-BR", () => {
  const base = [
    registro("Novo", "2,5 MG/ML SOL OR CT FR VD AMB GOT X 20 ML"),
    registro("Novo", "0,25 MG COM SUB CT BL AL PLAST TRANS X 30"),
    registro("Genérico", "10 MG CAP DURA CT BL AL X 30"),
    registro("Similar", "20 MG COM REV CT BL AL X 30"),
  ];
  // Duas apresentações caem em "Comprimido"; sobra uma entrada.
  assert.deepEqual(facetasDaBase(base).formas, ["Cápsula", "Comprimido", "Solução/gotas"]);
});

test("data e fonte vêm do primeiro registro", () => {
  const base = [registro("Novo", "10 MG COM REV CT BL AL X 30")];
  const facetas = facetasDaBase(base);
  assert.equal(facetas.tableDate, "11/08/2026");
  assert.equal(facetas.source, "CMED/Anvisa");
});

test("base vazia: listas vazias e os dois padrões de texto", () => {
  assert.deepEqual(facetasDaBase([]), {
    tipos: [],
    formas: [],
    tableDate: "Não informada",
    source: "Fonte importada",
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha por módulo inexistente**

Run: `node --test tests/facetas.test.ts`
Expected: falha ao carregar — `Cannot find module '.../src/lib/facetas.ts'`. Nenhum teste executa.

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/facetas.ts`:

```ts
import { inferForm } from "./busca";
import type { Medicine } from "./types";

export type FonteDeFacetas = Pick<Medicine, "kind" | "presentation" | "tableDate" | "source">;

export type Facetas = {
  tipos: string[];
  formas: string[];
  tableDate: string;
  source: string;
};

const porNomePtBr = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/**
 * As facetas que a home entrega ao comparador antes da primeira busca. Vêm do
 * snapshot embutido, não do banco: o build não pode depender de rede nem de
 * credencial. São tão atuais quanto o último commit do cron, que grava
 * src/data/medicines.json a cada edição nova e dispara o deploy.
 */
export function facetasDaBase(medicines: FonteDeFacetas[]): Facetas {
  const tipos = Array.from(new Set(medicines.map((item) => item.kind))).sort(porNomePtBr);
  const formas = Array.from(new Set(medicines.map((item) => inferForm(item.presentation)))).sort(porNomePtBr);
  // A data e a fonte são uniformes na base — toda ela vem de uma única
  // edição —, então o primeiro registro responde pela página inteira.
  const base = medicines[0];
  return {
    tipos,
    formas,
    tableDate: base?.tableDate ?? "Não informada",
    source: base?.source ?? "Fonte importada",
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/facetas.test.ts`
Expected: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.

Se o teste de `tipos` falhar **apenas** na posição de `"Não informado"`, não ajuste a implementação: o `localeCompare` com `"pt-BR"` é a regra a preservar. Reporte no relatório — significaria que o Node do ambiente está sem ICU completo, o que é problema do ambiente, não do código.

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ambos sem saída de erro (exit 0). O `tsc` inclui `tests/facetas.test.ts`; se reclamar de tipo no fixture, é porque `FonteDeFacetas` não ficou como `Pick` de quatro campos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/facetas.ts tests/facetas.test.ts
git commit -F - <<'EOF'
feat: facetas da home num módulo puro

Tipo, Forma, data da tabela e fonte passam a ser derivados por
facetasDaBase(), fora do componente de página e testável com node --test.
A lógica é a que estava inline em src/app/page.tsx, movida sem mudança de
comportamento; o próximo passo troca a origem dos dados pelo snapshot.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: Home lê o snapshot; build sem banco

**Files:**
- Modify: `src/lib/medicines.ts` (a constante `embutida`, linha ~30, e suas três referências)
- Modify: `src/app/page.tsx` (arquivo inteiro, 24 linhas)

**Interfaces:**
- Consumes: `facetasDaBase(medicines: FonteDeFacetas[]): Facetas` de `src/lib/facetas.ts` (Task 1); `PmcComparator` com props `{ tipos: string[]; formas: string[]; tableDate: string; source: string }` — inalteradas.
- Produces: `export const snapshotEmbutido: Medicine[]` em `src/lib/medicines.ts`.

- [ ] **Step 1: Reproduzir a falha de hoje (o "vermelho" desta task)**

Antes de tocar em qualquer arquivo, rodar o build com uma `DATABASE_URL` que não autentica. O host é inventado de propósito: a prova não precisa — e não deve — de credencial real. A variável passada na linha de comando prevalece sobre `.env.local`.

```bash
DATABASE_URL='postgresql://neondb_owner:senha-errada@ep-invalido.sa-east-1.aws.neon.tech/neondb?sslmode=require' npm run build 2>&1 | tail -15; echo "exit=${PIPESTATUS[0]}"
git checkout -- next-env.d.ts
```

Expected: `Error occurred prerendering page "/"` e `exit=1`. Se passar aqui, pare: a premissa do plano está errada e o relatório deve dizer isso.

- [ ] **Step 2: Exportar o snapshot de `medicines.ts`**

Em `src/lib/medicines.ts`, a constante privada vira exportada com o nome novo, e as três referências (`return embutida` duas vezes em `getMedicines`, `medicines !== embutida` em `getMedicinesCached`) acompanham:

```bash
sed -i 's/\bconst embutida = /export const snapshotEmbutido = /; s/\bembutida\b/snapshotEmbutido/g' src/lib/medicines.ts
grep -n "snapshotEmbutido" src/lib/medicines.ts
grep -nw "embutida" src/lib/medicines.ts || echo "nenhuma referência antiga"
```

Expected: quatro linhas com `snapshotEmbutido` (a declaração e três usos) e `nenhuma referência antiga`. O comentário acima da constante fala em "snapshot embutido" — palavra diferente, o `sed` não o toca. Nada mais muda neste arquivo.

- [ ] **Step 3: Reescrever a home**

Substituir o conteúdo inteiro de `src/app/page.tsx` por:

```tsx
import { PmcComparator } from "@/components/pmc-comparator";
import { facetasDaBase } from "@/lib/facetas";
import { snapshotEmbutido } from "@/lib/medicines";

// As facetas saem do snapshot embutido, não do banco: o build não pode
// depender de rede nem de credencial. Elas são tão atuais quanto o último
// commit do cron, que grava src/data/medicines.json a cada edição nova e
// dispara o deploy — se esse commit um dia sair do workflow, a home passa a
// mostrar a edição do último commit manual, sem avisar.
export default function Home() {
  const { tipos, formas, tableDate, source } = facetasDaBase(snapshotEmbutido);
  return <PmcComparator formas={formas} tipos={tipos} tableDate={tableDate} source={source} />;
}
```

Confira o que sumiu: `async`, `getMedicinesCached`, `inferForm`, `export const revalidate = 3600`. Nenhum deles volta.

- [ ] **Step 4: Type-check, lint e suíte**

Run: `npx tsc --noEmit && npm run lint && node --test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `tsc` e `lint` sem erro; `node --test` com `fail 0` e quatro testes a mais do que antes da Task 1.

- [ ] **Step 5: A prova — o mesmo build do Step 1 tem que passar**

```bash
DATABASE_URL='postgresql://neondb_owner:senha-errada@ep-invalido.sa-east-1.aws.neon.tech/neondb?sslmode=require' npm run build 2>&1 | grep -E "○ /|ƒ /admin|Static|Error|exited|oversiz"; echo "exit=${PIPESTATUS[0]}"
git checkout -- next-env.d.ts
```

Expected: `exit=0`; a linha da home aparece como `○ /` **sem** a coluna de revalidação (antes ela mostrava `1h` ao lado); `/admin` continua `ƒ`; nenhuma linha com `Error`, `exited` ou `oversiz`. Colar as linhas relevantes no relatório — é a evidência central desta task.

- [ ] **Step 6: Verificar no navegador**

Subir o servidor de desenvolvimento pelo Browser pane (`preview_start` com `name: "comparador-pmc"`, porta 3200) e, sem digitar busca alguma:

1. ler os seletores **Tipo** e **Forma** (`read_page` ou `find`) e confirmar que **Tipo** lista exatamente: Todos, Biológico, Específico, Fitoterápico, Genérico, Não informado, Novo, Produto de Terapia Avançada, Radiofármaco, Similar — e **Forma**: Todas, Cápsula, Comprimido, Injetável, Outras, Solução/gotas, Tópico, Xarope/suspensão;
2. confirmar que o cabeçalho mostra `TABELA IMPORTADA: 11/08/2026` antes de qualquer busca;
3. digitar `clonazepam` e confirmar que a busca continua respondendo (a rota de API não mudou — isso é só para provar que nada quebrou em volta).

Expected: as duas listas idênticas às de antes da mudança (a ordem de "Não informado" e "Novo" é a que o `localeCompare` pt-BR produz; se o seletor exibir uma ordem e o teste da Task 1 outra, algo está errado), data no cabeçalho, busca funcionando.

- [ ] **Step 7: Commit**

```bash
git add src/lib/medicines.ts src/app/page.tsx
git commit -F - <<'EOF'
fix: home não consulta o banco em tempo de build

Tipo, Forma, data e fonte iniciais passam a vir do snapshot embutido,
que o cron commita a cada edição nova — mesma edição do Neon após cada
execução. A home vira síncrona e perde o revalidate: não busca mais nada
que mude entre builds.

Motivo: na rotação de senha de 03/09 todo deploy falhou na pré-renderização
da home, inclusive um que só acrescentava uma linha de log, e a produção
ficou presa num deploy com a senha antiga. O build não pode depender de
rede nem de credencial. A busca em tempo de execução continua indo ao
banco e continua respondendo 503 quando ele falha — isso não muda.

Prova: npm run build com DATABASE_URL apontando para host inexistente
falhava antes desta mudança e passa depois, com a home marcada como
estática.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

## Self-review (feito ao escrever)

- **Cobertura do spec:** módulo puro (Task 1), export do snapshot e home síncrona sem `revalidate` (Task 2, Steps 2-3), prova com build sem banco (Task 2, Steps 1 e 5), verificação no navegador (Task 2, Step 6), comentário sobre o invariante de frescor no ponto de uso (Task 2, Step 3 — risco 2 do spec). Testes unitários do spec: os quatro estão na Task 1.
- **Desvio deliberado do spec:** o spec fala em "senha inválida no host real do Neon"; o plano usa host inventado. O host real está numa variável Sensitive que ninguém consegue ler, e um host inexistente prova a mesma coisa com mais força — o build não abre conexão alguma.
- **Consistência de nomes:** `facetasDaBase`, `FonteDeFacetas`, `Facetas`, `snapshotEmbutido` — os mesmos em ambas as tasks e no spec.
- **Placeholders:** nenhum; todo passo de código traz o código.
