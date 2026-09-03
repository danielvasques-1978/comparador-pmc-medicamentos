# Encaminhamento para preço em farmácias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna entre o preço regulado que o site conhece e o preço de balcão que a pessoa precisa saber, encaminhando-a ao aplicativo oficial e pondo o código de barras à mão — sem que o site afirme conhecer preço de farmácia.

**Architecture:** Uma regra pura decide qual código identifica cada apresentação na tela; a linha passa a exibir o EAN em destaque com o GGREM ao lado; e um bloco de texto estático abaixo das listas explica a diferença entre preço regulado e preço praticado, nomeando a ferramenta que tem o dado.

**Tech Stack:** Next.js 16, TypeScript, CSS simples em `src/app/globals.css`; Node 24 com o test runner nativo (`node --test`, que remove tipos de `.ts` sem configuração).

**Spec:** `docs/superpowers/specs/2026-09-02-preco-em-farmacias-design.md`

## Global Constraints

- Esta feature **não faz requisição alguma**. Nada de API de preço, nada de raspagem, nenhum estado de carregamento, nenhum caminho de erro. É essa ausência que a torna defensável.
- O site nunca afirma saber preço de farmácia. Ele diz o que sabe — o preço de referência da CMED — e nomeia quem sabe o resto.
- O bloco aparece **uma vez**, abaixo das duas listas, e **só quando há resultados**.
- O bloco **não leva link para loja de aplicativos**. Nomeia a ferramenta e para aí.
- Texto do bloco, literal e não configurável — reproduzir exatamente, com acentos e negritos:
  - Título: **Quanto custa na farmácia?**
  - *"Os valores desta página vêm da tabela da CMED e são preços de referência — o teto ao consumidor, ou o Preço Fábrica quando a CMED não fixa teto. Nenhum deles é necessariamente o que a farmácia cobra, e a diferença entre estabelecimentos costuma ser grande."*
  - *"Para conferir o preço real perto de você, o aplicativo **Menor Preço Brasil**, das secretarias estaduais de fazenda, mostra valores de vendas registradas em nota fiscal nos últimos dias. É um aplicativo de celular, para Android e iPhone, e exige conta gov.br."*
  - *"Leve o código de barras da apresentação escolhida — ele aparece em cada linha desta página."*
- Apresentação sem EAN mostra apenas o GGREM: nenhum rótulo vazio, nenhum traço solto.
- Mensagens de commit em inglês. Arquivos UTF-8, acentos intactos. Nenhum segredo no repositório.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/codigos.ts` (novo) | Decidir quais códigos a linha exibe e em que ordem — puro, sem imports de runtime |
| `tests/codigos.test.ts` (novo) | Testes dessa regra |
| `src/components/pmc-comparator.tsx` (alterado) | Usar a regra nas duas linhas de metadados e renderizar o bloco |
| `src/app/globals.css` (alterado) | Estilo do bloco |

---

### Task 1: A regra de qual código aparece

**Files:**
- Create: `src/lib/codigos.ts`
- Create: `tests/codigos.test.ts`

**Interfaces:**
- Produces: `codigosDaLinha(item): Codigo[]`, onde `Codigo` é `{ rotulo: string; valor: string }`.
  - Com EAN presente, devolve dois itens, nesta ordem: `{ rotulo: "EAN", valor: <ean1> }` e `{ rotulo: "GGREM", valor: <ggremCode ?? id> }`.
  - Sem EAN, devolve um único item: o GGREM.
  - A lista nunca é vazia e nunca contém entrada com `valor` vazio.

O módulo importa apenas tipos. Essa restrição é o que o torna carregável pelo runner do Node, que não resolve o alias `@/` para imports de runtime — é o mesmo padrão de `src/lib/precos.ts` e `src/lib/busca.ts`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/codigos.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { codigosDaLinha } from "../src/lib/codigos.ts";

const comEan = { ean1: "7898937460614", ggremCode: "542726030005502", id: "542726030005502" };
const semEan = { ean1: undefined, ggremCode: "542726030005502", id: "542726030005502" };
const semGgrem = { ean1: "7898937460614", ggremCode: undefined, id: "999" };
const eanVazio = { ean1: "", ggremCode: "542726030005502", id: "542726030005502" };

test("com EAN, mostra EAN primeiro e GGREM depois", () => {
  assert.deepEqual(codigosDaLinha(comEan), [
    { rotulo: "EAN", valor: "7898937460614" },
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
    { rotulo: "EAN", valor: "7898937460614" },
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
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
node --test
```

Esperado: FAIL com `Cannot find module '../src/lib/codigos.ts'`.

- [ ] **Step 3: Implementar**

`src/lib/codigos.ts`:

```typescript
import type { Medicine } from "@/lib/types";

export type Codigo = {
  rotulo: string;
  valor: string;
};

type Identificavel = Pick<Medicine, "ean1" | "ggremCode" | "id">;

export function codigosDaLinha(item: Identificavel): Codigo[] {
  const codigos: Codigo[] = [];

  // O EAN é o código impresso na caixa e o que se digita ou escaneia no
  // aplicativo de preços. Vem primeiro porque é o que serve a quem compra.
  if (item.ean1) codigos.push({ rotulo: "EAN", valor: item.ean1 });

  codigos.push({ rotulo: "GGREM", valor: item.ggremCode ?? item.id });

  return codigos;
}
```

- [ ] **Step 4: Rodar os testes**

```bash
node --test
```

Esperado: os cinco novos passam, e os anteriores seguem passando.

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/codigos.ts tests/codigos.test.ts
git commit -m "Decide which identifying codes a result row shows"
```

---

### Task 2: A linha mostra o código de barras

Hoje cada linha exibe `GGREM 542726030005502` — um código de regulação que não diz nada a quem vai comprar. O EAN é o que está impresso na caixa.

**Files:**
- Modify: `src/components/pmc-comparator.tsx`

**Interfaces:**
- Consumes: `codigosDaLinha(item): Codigo[]` de `@/lib/codigos` (Task 1).

- [ ] **Step 1: Importar a regra**

No topo de `src/components/pmc-comparator.tsx`, junto dos demais imports:

```typescript
import { codigosDaLinha } from "@/lib/codigos";
```

- [ ] **Step 2: Trocar a linha de metadados da lista principal**

Há **duas** linhas de metadados no arquivo com o mesmo formato — uma na lista principal, outra no bloco de Preço Fábrica. Ambas mudam, e ambas ficam idênticas.

Localize as duas ocorrências de:

```tsx
                  <div className="medicine-meta">
                    <span>{item.laboratory}</span>
                    <small>GGREM {item.ggremCode ?? item.id}</small>
                  </div>
```

e substitua **cada uma** por:

```tsx
                  <div className="medicine-meta">
                    <span>{item.laboratory}</span>
                    {codigosDaLinha(item).map((codigo) => (
                      <small key={codigo.rotulo}>
                        {codigo.rotulo} {codigo.valor}
                      </small>
                    ))}
                  </div>
```

A chave usa o rótulo porque cada linha tem no máximo um EAN e um GGREM — os rótulos são únicos dentro da lista.

- [ ] **Step 3: Dar ao EAN o destaque tipográfico**

Ao final de `src/app/globals.css`:

Existe já uma regra `.medicine-meta small` que aplica `color: var(--muted)` a todos eles. As novas regras têm especificidade maior e a sobrescrevem para o primeiro código, sem tocar no resto:

```css
.medicine-meta small:first-of-type {
  color: var(--text);
  font-weight: 600;
}

.medicine-meta small + small {
  color: var(--muted);
  font-weight: 400;
}
```

Use as variáveis do projeto, não cores literais — o restante da folha usa `var(--muted)` e valores fixos destoariam.

O primeiro código da lista fica em destaque e o segundo em tipografia secundária. Como a regra da Task 1 sempre põe o EAN primeiro quando ele existe, o destaque cai nele; quando não existe, cai no GGREM, que é então o único código disponível.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: ambos limpos.

- [ ] **Step 5: Ver na tela**

Suba o app com a ferramenta de navegador embutida — `preview_start` com o nome **`comparador-pmc`**, porta 3200; o registro fica em `C:\.claude\launch.json`, não no repositório. Busque `clonazepam` e confirme que as linhas mostram `EAN …` em destaque seguido de `GGREM …` apagado. Busque `leqembi` e confirme o mesmo no bloco de Preço Fábrica.

Rodar o servidor reescreve `next-env.d.ts`; reverta com `git checkout -- next-env.d.ts` e mantenha-o fora do commit.

- [ ] **Step 6: Commit**

```bash
git add src/components/pmc-comparator.tsx src/app/globals.css
git commit -m "Show the barcode alongside the regulatory code on each row"
```

---

### Task 3: O bloco de encaminhamento

**Files:**
- Modify: `src/components/pmc-comparator.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `temResultados`, a constante booleana que o componente já calcula e que é verdadeira quando qualquer um dos dois grupos tem linhas.

- [ ] **Step 1: Renderizar o bloco**

O bloco entra **depois** do fechamento da seção de Preço Fábrica e **antes** do modal de configuração — isto é, entre `) : null}` que fecha `.pf-section` e a linha `{showSettings ? (`.

```tsx
      {temResultados ? (
        <section className="farmacia-section" aria-label="Como conferir o preço em farmácias">
          <h2>Quanto custa na farmácia?</h2>
          <p>
            Os valores desta página vêm da tabela da CMED e são preços de referência — o teto ao
            consumidor, ou o Preço Fábrica quando a CMED não fixa teto. Nenhum deles é
            necessariamente o que a farmácia cobra, e a diferença entre estabelecimentos costuma ser
            grande.
          </p>
          <p>
            Para conferir o preço real perto de você, o aplicativo <strong>Menor Preço Brasil</strong>,
            das secretarias estaduais de fazenda, mostra valores de vendas registradas em nota fiscal
            nos últimos dias. É um aplicativo de celular, para Android e iPhone, e exige conta
            gov.br.
          </p>
          <p>
            Leve o código de barras da apresentação escolhida — ele aparece em cada linha desta
            página.
          </p>
        </section>
      ) : null}
```

Não acrescente link para loja de aplicativos. O site nomeia a ferramenta; instalar é escolha de quem lê.

- [ ] **Step 2: Estilizar**

Ao final de `src/app/globals.css`:

```css
.farmacia-section {
  margin-top: 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  background: var(--panel);
}

.farmacia-section h2 {
  margin: 0 0 8px;
  font-size: 1.05rem;
}

.farmacia-section p {
  margin: 0 0 10px;
  font-size: 0.85rem;
  line-height: 1.55;
}

.farmacia-section p:last-child {
  margin-bottom: 0;
}
```

O tom é neutro, distinto do amarelo de advertência que o bloco de Preço Fábrica usa: este aqui informa, não alerta.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: ambos limpos.

- [ ] **Step 4: Conferir o texto contra o spec**

Compare os três parágrafos e o título, palavra por palavra, com a seção "O bloco" de `docs/superpowers/specs/2026-09-02-preco-em-farmacias-design.md`. Acentos e negritos incluídos. Registre no relatório que fez essa conferência.

Este texto é o produto desta task. O código ao redor é andaime.

- [ ] **Step 5: Ver os dois estados na tela**

Com o navegador embutido: busque `clonazepam` e confirme que o bloco aparece abaixo das listas, com o texto correto. Depois apague a busca e confirme que o bloco **some** — ele não deve aparecer numa tela sem resultados.

Reverta `next-env.d.ts` e confirme `git status` limpo antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add src/components/pmc-comparator.tsx src/app/globals.css
git commit -m "Point people to the official app for real pharmacy prices"
```

---

## Notas de execução

- Nenhuma task precisa de `DATABASE_URL`: sem ele o app cai no JSON embutido, que serve para tudo aqui.
- As Tasks 2 e 3 precisam do navegador embutido.
- Nenhuma task altera `src/data/medicines.json`.
- Esta feature não tem caminho de erro para testar, porque não faz requisição. Se em algum momento a implementação introduzir uma, ela saiu do escopo do spec.
