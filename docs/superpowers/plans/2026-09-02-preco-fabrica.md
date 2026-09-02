# Preço Fábrica sem PMC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir no comparador as 3.913 apresentações que têm Preço Fábrica e não têm PMC — hoje invisíveis —, rotuladas de modo que o PF não possa ser lido como preço ao consumidor.

**Architecture:** O importador passa a aceitar linhas sem PMC, gravando `pf` apenas nelas. Dois helpers puros num arquivo novo e sem dependências concentram toda a decisão de "qual preço vale para este item", e a interface os consome nos quatro lugares que hoje assumem que PMC existe. Uma sexta trava protege a redação do aviso, reprovando a importação se alguma apresentação sem PMC deixar de ser de uso restrito hospitalar.

**Tech Stack:** Python 3.11 com `openpyxl` e `pytest`; Node 24 com o test runner nativo (`node --test`, que remove tipos de arquivos `.ts` sem configuração); Next.js 16; Postgres via Neon.

**Spec:** `docs/superpowers/specs/2026-09-02-preco-fabrica-design.md`

## Global Constraints

- O campo `pf` é gravado **apenas** em apresentações sem PMC. Gravá-lo nas demais acrescentaria ~5 MB ao `medicines.json`, que a home embarca inteiro.
- A regra de descarte do importador passa a ser "sem nenhum PMC **e** sem nenhum PF".
- Nenhuma apresentação sem PMC pode exibir `R$ 0,00` em lugar nenhum.
- A lista principal continua contendo somente apresentações com PMC. PF e PMC nunca são comparados entre si em ordenação ou filtro.
- O bloco de PF respeita o mesmo limite de 250 resultados e o mesmo controle de assinatura da lista principal.
- Texto do aviso, literal e não configurável: **"Sem preço máximo ao consumidor"** como título, e no corpo: *"Uso restrito hospitalar. A CMED não fixa PMC para estes produtos; o valor abaixo é o **Preço Fábrica**, que é o teto de venda para farmácias, hospitais e órgãos públicos — **não** é o preço final ao consumidor, e o valor cobrado será maior."*
- Limites das travas em `scripts/cmed_limits.py`, sem override em tempo de execução.
- `scripts/migrate_neon.mjs` divide os `.sql` por `;` e reaplica todas as migrations sempre: a nova precisa ser idempotente e sem `;` dentro de literal.
- Mensagens de commit em inglês. Arquivos UTF-8. Nenhum segredo no repositório.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/import_cmed_xlsx.py` (alterado) | Aceitar linhas sem PMC e gravar `pf` nelas |
| `scripts/diff_cmed.py` (alterado) | Expor no relatório as apresentações sem PMC que não são hospitalares |
| `scripts/cmed_limits.py` (alterado) | Limite da trava nova |
| `scripts/check_cmed.py` (alterado) | A sexta trava |
| `neon/migrations/20260902000000_pf.sql` (novo) | Coluna `pf jsonb` |
| `scripts/seed_neon_medicines.mjs` (alterado) | Gravar `pf` |
| `src/lib/precos.ts` (novo) | `temPmc` e `precoAplicavel` — puros, sem imports de runtime |
| `tests/precos.test.ts` (novo) | Testes dos dois helpers |
| `src/lib/types.ts` (alterado) | Campo `pf` em `Medicine` |
| `src/lib/medicines.ts` (alterado) | Selecionar e mapear `pf` |
| `src/components/pmc-comparator.tsx` (alterado) | Os quatro pontos de quebra e o bloco novo |
| `DEPLOYMENT.md`, `README.md` (alterados) | Consequência operacional |

---

### Task 1: Importador aceita apresentações sem PMC

**Files:**
- Modify: `scripts/import_cmed_xlsx.py`
- Test: `tests/test_import_cmed.py`

**Interfaces:**
- Produces: cada item ganha `pf` — um dicionário no mesmo formato de `pmc` (chaves `"17"`, `"18"`, `"19"`, `"19.5"`, `"20"`, `"20.5"`, `"22.5"`, `"23"`) — presente **apenas** quando `pmc` não tem nenhum valor. Quando `pmc` tem valor, a chave `pf` não existe no item.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/test_import_cmed.py`:

```python
def test_importa_linha_com_pf_e_sem_pmc(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "LECANEMABE",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "999",
            "EAN 1": "7898937460614",
            "PRODUTO": "LEQEMBI",
            "APRESENTAÇÃO": "100 MG/ML SOL DIL INFUS IV CT FA VD TRANS X 2 ML",
            "RESTRIÇÃO HOSPITALAR": "Sim",
            "PF 18 %": "1582,23",
            "COMERCIALIZAÇÃO 2025": "Não",
        }
    ])

    item = import_cmed(path)[0]

    assert item["name"] == "LEQEMBI"
    assert item["pf"]["18"] == 1582.23
    assert all(value is None for value in item["pmc"].values())
    assert item["hospitalRestricted"] is True


def test_nao_grava_pf_quando_ha_pmc(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "111",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "PMC 18 %": "50,28",
            "PF 18 %": "35,10",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    item = import_cmed(path)[0]

    assert "pf" not in item
    assert item["pmc"]["18"] == 50.28


def test_descarta_linha_sem_pmc_e_sem_pf(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "NADA",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "222",
            "PRODUTO": "NADA",
            "APRESENTAÇÃO": "1 MG",
            "COMERCIALIZAÇÃO 2025": "Não",
        }
    ])

    assert import_cmed(path) == []
```

- [ ] **Step 2: Acrescentar as colunas de PF à fixture**

Em `tests/conftest.py`, na lista `BASE_COLUMNS`, insira as oito colunas de PF logo antes de `"PMC 17 %"`:

```python
    "PF 17 %",
    "PF 18 %",
    "PF 19 %",
    "PF 19,5 %",
    "PF 20 %",
    "PF 20,5 %",
    "PF 22,5 %",
    "PF 23 %",
```

- [ ] **Step 3: Rodar para confirmar que falham**

```bash
pytest tests/test_import_cmed.py -v
```

Esperado: `test_importa_linha_com_pf_e_sem_pmc` falha (a linha é descartada, `IndexError`), `test_nao_grava_pf_quando_ha_pmc` falha (`"pf" not in item` já passa, mas confirme), `test_descarta_linha_sem_pmc_e_sem_pf` passa desde já.

- [ ] **Step 4: Implementar**

Em `scripts/import_cmed_xlsx.py`, logo após o dicionário `PMC_COLUMNS`, acrescente o equivalente para PF:

```python
PF_COLUMNS = {
    "17": "PF 17 %",
    "18": "PF 18 %",
    "19": "PF 19 %",
    "19.5": "PF 19,5 %",
    "20": "PF 20 %",
    "20.5": "PF 20,5 %",
    "22.5": "PF 22,5 %",
    "23": "PF 23 %",
}
```

Dentro de `import_cmed`, substitua o bloco que calcula `prices` e descarta a linha por:

```python
        prices = {rate: parse_price(row[columns[column]]) for rate, column in PMC_COLUMNS.items()}
        factory = {
            rate: parse_price(row[columns[column]])
            for rate, column in PF_COLUMNS.items()
            if column in columns
        }
        has_pmc = any(price is not None for price in prices.values())
        has_pf = any(price is not None for price in factory.values())
        if not has_pmc and not has_pf:
            continue
```

Logo após o `medicines.append({...})`, acrescente a gravação condicional do `pf`:

```python
        if not has_pmc:
            medicines[-1]["pf"] = factory
```

Ajuste a mensagem de erro de GGREM duplicado, que hoje cita apenas PMC:

```python
            raise ValueError("A planilha contém códigos GGREM duplicados entre as apresentações importadas.")
```

- [ ] **Step 5: Rodar os testes**

```bash
pytest -v
```

Esperado: todos passam, incluindo os anteriores.

- [ ] **Step 6: Conferir contra a planilha real**

```bash
python scripts/import_cmed_xlsx.py "C:/Users/danie/AppData/Local/Temp/claude/C--/1e5cb0b7-4e6b-41d0-bb9f-84f84cbffe00/scratchpad/cmed_ago2026.xlsx" /tmp/cand.json
```

Depois:

```bash
python -c "import json;d=json.load(open('/tmp/cand.json',encoding='utf-8'));pf=[x for x in d if 'pf' in x];cob=sum(1 for x in d if x['ean1'])/len(d);print('total',len(d));print('sem pmc',len(pf));print('todas hospitalares?',all(x['hospitalRestricted'] for x in pf));print('cobertura de ean1: %.1f%%' % (cob*100))"
```

Esperado: total 26001, sem pmc 3913, todas hospitalares `True`.

**A cobertura de EAN precisa ficar em 90% ou mais.** É a trava `MIN_EAN_COVERAGE`, e o grupo hospitalar entra agora na conta. Se ficar abaixo, pare e reporte: a importação seria barrada na próxima edição, e a decisão de ajustar o limite é do dono do projeto, não sua.

Não commite `/tmp/cand.json` nem altere `src/data/medicines.json`.

- [ ] **Step 7: Commit**

```bash
git add scripts/import_cmed_xlsx.py tests/test_import_cmed.py tests/conftest.py
git commit -m "Import presentations that have a factory price and no PMC"
```

---

### Task 2: A sexta trava protege a redação do aviso

**Files:**
- Modify: `scripts/diff_cmed.py`
- Modify: `scripts/cmed_limits.py`
- Modify: `scripts/check_cmed.py`
- Test: `tests/test_diff_cmed.py`, `tests/test_check_cmed.py`

**Interfaces:**
- Consumes: itens com a chave `pf` presente apenas quando não há PMC (Task 1).
- Produces: o relatório de `build_report` ganha a chave `pfSemHospitalar`, uma lista de `{"id", "name", "presentation"}` das apresentações sem PMC que não têm `hospitalRestricted` verdadeiro.
- Produces: `run_checks` passa a devolver também uma `Failure` de nome `hospitalar`.

- [ ] **Step 1: Escrever o teste do relatório**

Em `tests/test_diff_cmed.py`:

```python
def test_lista_sem_pmc_que_nao_e_hospitalar():
    candidate = [
        {"id": "a", "name": "OK", "presentation": "1 MG", "pmc": {}, "pf": {"18": 10.0},
         "hospitalRestricted": True, "ean1": "789", "tableDate": "11/08/2026"},
        {"id": "b", "name": "SUSPEITO", "presentation": "2 MG", "pmc": {}, "pf": {"18": 20.0},
         "hospitalRestricted": False, "ean1": "789", "tableDate": "11/08/2026"},
    ]

    report = build_report([], candidate)

    assert [item["id"] for item in report["pfSemHospitalar"]] == ["b"]


def test_item_com_pmc_nunca_entra_na_lista_hospitalar():
    candidate = [
        {"id": "a", "name": "NORMAL", "presentation": "1 MG", "pmc": {"18": 10.0},
         "hospitalRestricted": False, "ean1": "789", "tableDate": "11/08/2026"},
    ]

    assert build_report([], candidate)["pfSemHospitalar"] == []
```

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
pytest tests/test_diff_cmed.py -v
```

Esperado: FAIL com `KeyError: 'pfSemHospitalar'`.

- [ ] **Step 3: Implementar no relatório**

Em `scripts/diff_cmed.py`, acrescente antes do `return`:

```python
    sem_hospitalar = [
        _identify(item)
        for item in candidate
        if not any(
            value is not None for value in (item.get("pmc") or {}).values()
        )
        and not item.get("hospitalRestricted")
    ]
```

E inclua a chave no dicionário devolvido:

```python
        "pfSemHospitalar": sem_hospitalar,
```

- [ ] **Step 4: Escrever o teste da trava**

Em `tests/test_check_cmed.py`, acrescente `"pfSemHospitalar": []` ao dicionário devolvido por `base_report`, e então:

```python
def test_trava_hospitalar_quando_sem_pmc_nao_e_hospitalar():
    report = base_report(pfSemHospitalar=[{"id": "b", "name": "SUSPEITO", "presentation": "2 MG"}])

    failures = run_checks(report, VAZIO, VAZIO)

    assert [failure.name for failure in failures] == ["hospitalar"]
    assert "SUSPEITO" in failures[0].detail


def test_libera_quando_todas_sem_pmc_sao_hospitalares():
    assert run_checks(base_report(), VAZIO, VAZIO) == []
```

- [ ] **Step 5: Rodar para confirmar que falha**

```bash
pytest tests/test_check_cmed.py -v
```

Esperado: `test_trava_hospitalar_quando_sem_pmc_nao_e_hospitalar` falha, porque nenhuma trava dispara.

- [ ] **Step 6: Implementar a trava**

Em `scripts/cmed_limits.py`, acrescente:

```python
# O aviso exibido para apresentações sem PMC afirma uso restrito hospitalar.
# Zero exceções toleradas: se a CMED mudar esse padrão, a edição é barrada e a
# redação do aviso é revista deliberadamente.
MAX_PF_SEM_HOSPITALAR = 0
```

Em `scripts/check_cmed.py`, importe `MAX_PF_SEM_HOSPITALAR` junto dos demais limites e acrescente:

```python
def _check_hospitalar(report: dict) -> Failure | None:
    offenders = report.get("pfSemHospitalar", [])
    if len(offenders) <= MAX_PF_SEM_HOSPITALAR:
        return None
    nomes = "; ".join(f"{item.get('name', '')} ({item.get('presentation', '')})" for item in offenders[:10])
    return Failure(
        "hospitalar",
        f"{len(offenders)} apresentação(ões) sem PMC não têm restrição hospitalar, "
        f"o que contradiz o aviso exibido para esse grupo: {nomes}",
    )
```

E inclua `_check_hospitalar(report)` na lista dentro de `run_checks`.

- [ ] **Step 7: Rodar os testes**

```bash
pytest -v
```

Esperado: todos passam.

- [ ] **Step 8: Commit**

```bash
git add scripts/diff_cmed.py scripts/cmed_limits.py scripts/check_cmed.py tests/test_diff_cmed.py tests/test_check_cmed.py
git commit -m "Add a gate asserting PMC-less presentations are hospital restricted"
```

---

### Task 3: Coluna `pf` no banco

**Files:**
- Create: `neon/migrations/20260902000000_pf.sql`
- Modify: `scripts/seed_neon_medicines.mjs`

**Interfaces:**
- Produces: coluna `pf jsonb` em `medicines`, nula para apresentações com PMC.

- [ ] **Step 1: Escrever a migration**

`neon/migrations/20260902000000_pf.sql` — idempotente e sem `;` dentro de literal, porque o runner divide o arquivo por `;` e reaplica todas as migrations a cada execução:

```sql
alter table medicines
  add column if not exists pf jsonb;

create index if not exists medicines_pf_idx on medicines ((pf is not null));
```

- [ ] **Step 2: Gravar `pf` no seed**

Em `scripts/seed_neon_medicines.mjs`, acrescente `pf` à lista de colunas do `insert`, ao bloco `values` e ao `on conflict do update set`, seguindo exatamente o padrão das colunas vizinhas. O valor é:

```javascript
            ${item.pf ? JSON.stringify(item.pf) : null}::jsonb,
```

e no `do update set`:

```javascript
            pf = excluded.pf,
```

- [ ] **Step 3: Aplicar a migration**

Com `DATABASE_URL` no `.env.local`:

```bash
npm run migrate:neon
```

Esperado: número de instruções aplicadas, sem erro. Rode duas vezes seguidas e confirme que a segunda também passa — é a prova de idempotência.

- [ ] **Step 4: Commit**

```bash
git add neon/migrations/20260902000000_pf.sql scripts/seed_neon_medicines.mjs
git commit -m "Store the factory price alongside the medicine row"
```

---

### Task 4: Helpers de preço, puros e testados

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/precos.ts`
- Create: `tests/precos.test.ts`
- Modify: `.github/workflows/cmed-update.yml`

**Interfaces:**
- Produces: `Medicine` ganha `pf?: Partial<Record<IcmsZone, number>>`, e `pmc` passa a ser `Partial<Record<IcmsZone, number>>` — um item sem PMC tem o objeto vazio, e mesmo um item com PMC pode não ter valor em toda alíquota.
- Produces: `temPmc(item: Medicine): boolean` — verdadeiro quando há ao menos um valor numérico em `item.pmc`.
- Produces: `precoAplicavel(item: Medicine, zona: IcmsZone): { valor: number | null; tipo: "PMC" | "PF" }` — devolve o preço da zona no conjunto que o item possui. `valor` é `null` quando aquela zona não tem valor, e nunca `0` por ausência.

Este arquivo não importa nada em tempo de execução — só tipos, que o Node remove. É o que o torna testável pelo runner nativo, ao contrário de `src/lib/medicines.ts`, que importa aliases `@/` que o Node não resolve.

- [ ] **Step 1: Declarar os campos no tipo**

Isto vem primeiro porque `src/lib/precos.ts` referencia `Medicine["pf"]`; sem esta etapa o `tsc` reprova o arquivo novo.

Em `src/lib/types.ts`, dentro de `Medicine`, substitua a linha de `pmc` por estas duas:

```typescript
  pmc: Partial<Record<IcmsZone, number>>;
  pf?: Partial<Record<IcmsZone, number>>;
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/precos.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { precoAplicavel, temPmc } from "../src/lib/precos.ts";

const comPmc = { pmc: { "18": 50.28 } } as never;
const semPmc = { pmc: {}, pf: { "18": 1582.23 } } as never;
const pmcVazio = { pmc: { "18": null } } as never;

test("reconhece item com PMC", () => {
  assert.equal(temPmc(comPmc), true);
});

test("item sem PMC e com PF nao tem PMC", () => {
  assert.equal(temPmc(semPmc), false);
});

test("PMC presente mas nulo nao conta como PMC", () => {
  assert.equal(temPmc(pmcVazio), false);
});

test("preco aplicavel de item com PMC vem do PMC", () => {
  assert.deepEqual(precoAplicavel(comPmc, "18"), { valor: 50.28, tipo: "PMC" });
});

test("preco aplicavel de item sem PMC vem do PF", () => {
  assert.deepEqual(precoAplicavel(semPmc, "18"), { valor: 1582.23, tipo: "PF" });
});

test("zona sem valor devolve null, nunca zero", () => {
  assert.deepEqual(precoAplicavel(semPmc, "23"), { valor: null, tipo: "PF" });
});
```

- [ ] **Step 3: Rodar para confirmar que falha**

```bash
node --test
```

Esperado: FAIL, `Cannot find module '../src/lib/precos.ts'`. Se em vez disso o erro for sobre sintaxe TypeScript não suportada, pare e reporte: significa que este Node não remove tipos, e o plano precisa ser revisto.

- [ ] **Step 4: Implementar**

`src/lib/precos.ts`:

```typescript
import type { IcmsZone, Medicine } from "@/lib/types";

export type PrecoAplicavel = {
  valor: number | null;
  tipo: "PMC" | "PF";
};

function algumValor(mapa: Partial<Record<IcmsZone, number | null>> | undefined) {
  return Object.values(mapa ?? {}).some((valor) => typeof valor === "number");
}

export function temPmc(item: Pick<Medicine, "pmc">) {
  return algumValor(item.pmc);
}

export function precoAplicavel(
  item: Pick<Medicine, "pmc" | "pf">,
  zona: IcmsZone,
): PrecoAplicavel {
  if (temPmc(item)) {
    const valor = item.pmc?.[zona];
    return { valor: typeof valor === "number" ? valor : null, tipo: "PMC" };
  }
  const valor = item.pf?.[zona];
  return { valor: typeof valor === "number" ? valor : null, tipo: "PF" };
}
```

O `import type` é apagado na compilação e na remoção de tipos do Node, então não vira import de runtime — é por isso que o alias `@/` não atrapalha o teste.

- [ ] **Step 5: Rodar os testes**

```bash
node --test
```

Esperado: 6 testes novos passam, mais os 3 já existentes.

- [ ] **Step 6: Subir o Node do CI para 24**

Em `.github/workflows/cmed-update.yml`, troque `node-version: "22"` por `node-version: "24"`. O runner precisa remover tipos sem flag para rodar `tests/precos.test.ts`.

- [ ] **Step 7: Verificar que o tipo não quebrou o resto**

```bash
npx tsc --noEmit
```

Erros em `src/components/pmc-comparator.tsx` são esperados aqui: tornar `pmc` parcial expõe justamente os acessos que a Task 6 vai corrigir. Qualquer erro **fora** desse arquivo é seu e deve ser resolvido antes do commit.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/precos.ts tests/precos.test.ts .github/workflows/cmed-update.yml
git commit -m "Add pure price helpers with their own tests"
```

---

### Task 5: A aplicação lê `pf`

**Files:**
- Modify: `src/lib/medicines.ts`

**Interfaces:**
- Consumes: `Medicine.pf` declarado na Task 4.

- [ ] **Step 1: Selecionar e mapear a coluna**

Em `src/lib/medicines.ts`, acrescente ao tipo `MedicineRow`:

```typescript
  pf: Record<IcmsZone, number> | null;
```

Acrescente `pf,` à lista do `select`, logo após `pmc,`. E no `.map`, logo após a linha de `pmc`:

```typescript
      pf: row.pf ?? undefined,
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Erros em `src/components/pmc-comparator.tsx` continuam esperados até a Task 6. Confirme que não há nenhum fora daquele arquivo:

```bash
npx tsc --noEmit 2>&1 | grep -v "pmc-comparator" | head
```

Esperado: nenhuma linha.

- [ ] **Step 3: Commit**

```bash
git add src/lib/medicines.ts
git commit -m "Read the factory price from the database"
```

---

### Task 6: Comparador deixa de assumir que PMC existe

Esta task torna o app correto com os dados novos presentes, sem ainda exibir o grupo. Ao final dela, apresentações sem PMC simplesmente não aparecem — que é o comportamento seguro.

**Files:**
- Modify: `src/components/pmc-comparator.tsx`

**Interfaces:**
- Consumes: `temPmc` e `precoAplicavel` de `src/lib/precos.ts` (Task 4).

- [ ] **Step 1: Importar os helpers**

No topo de `src/components/pmc-comparator.tsx`, junto dos demais imports:

```typescript
import { precoAplicavel, temPmc } from "@/lib/precos";
```

- [ ] **Step 2: Manter a lista principal homogênea**

O `useMemo` de `filtered` continua casando os dois grupos — é ele que carrega os critérios de busca, e duplicá-los depois seria repetir um bloco de lógica. A separação acontece uma linha adiante.

Substitua `const visibleRows = filtered.slice(0, 250);` por:

```typescript
  const visibleRows = filtered.filter(temPmc).slice(0, 250);
```

A Task 7 usa o mesmo `filtered` para extrair o outro grupo.

- [ ] **Step 3: Corrigir o filtro de faixa de preço**

No `filter`, substitua:

```typescript
      const price = item.pmc[selectedZone] ?? 0;
      if (max !== null && Number.isFinite(max) && price > max) return false;
```

por:

```typescript
      const { valor } = precoAplicavel(item, selectedZone);
      if (max !== null && Number.isFinite(max) && temPmc(item) && valor !== null && valor > max) return false;
```

Duas mudanças aqui. Um item sem preço naquela zona deixa de ser tratado como custando zero — antes o `?? 0` o classificava como o mais barato de todos. E o teto de preço passa a valer apenas para o grupo com PMC: aplicá-lo a Preço Fábrica compararia um limite pensado para preço de consumidor contra preço de fábrica.

- [ ] **Step 4: Corrigir a ordenação**

No `rows.sort`, substitua as duas linhas de `priceA`/`priceB` por:

```typescript
      const priceA = precoAplicavel(a, selectedZone).valor ?? Number.POSITIVE_INFINITY;
      const priceB = precoAplicavel(b, selectedZone).valor ?? Number.POSITIVE_INFINITY;
```

Note que `filtered` contém os dois grupos neste ponto, então a ordenação chega a comparar um PMC com um PF. Isso não é observável: a lista é dividida logo depois, e a ordem relativa dentro de cada grupo é a mesma que teria se cada um fosse ordenado isoladamente. Ordenar uma vez evita repetir o comparador em dois lugares, que divergiriam com o tempo.

- [ ] **Step 5: Corrigir a célula de preço**

Substitua o bloco `price-cell` por:

```tsx
                  <div className="price-cell">
                  {(() => {
                    const { valor, tipo } = precoAplicavel(item, selectedZone);
                    return (
                      <>
                        <small>{tipo} {uf} | ICMS {formatRate(selectedRate)}</small>
                        <strong>{valor === null ? "Sem preço nesta faixa" : currency.format(valor)}</strong>
                      </>
                    );
                  })()}
                  </div>
```

O `?? 0` sai. Ausência de preço passa a ser dita, não convertida em zero.

- [ ] **Step 6: Corrigir a exportação CSV**

Na lista `header`, troque o item `"PMC"` por dois:

```typescript
      "Tipo de preço",
      "Valor",
```

E na montagem de cada linha, troque `String(item.pmc[selectedZone] ?? "")` por:

```typescript
        precoAplicavel(item, selectedZone).tipo,
        String(precoAplicavel(item, selectedZone).valor ?? ""),
```

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit
```

Esperado: limpo. Depois:

```bash
npm run lint
```

Esperado: limpo, saída zero.

- [ ] **Step 8: Commit**

```bash
git add src/components/pmc-comparator.tsx
git commit -m "Stop assuming every presentation has a consumer price"
```

---

### Task 7: O bloco de Preço Fábrica

**Files:**
- Modify: `src/components/pmc-comparator.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Extrair o grupo sem PMC**

O grupo sai do mesmo `filtered` que alimenta a lista principal, já com todos os critérios de busca aplicados. Nenhum critério é reescrito aqui.

Logo após a linha `const visibleRows = filtered.filter(temPmc).slice(0, 250);`, acrescente:

```typescript
  const semPmc = filtered.filter((item) => !temPmc(item)).slice(0, 250);
```

O teto de preço já foi tratado na Task 6: ele só se aplica ao grupo com PMC, então este grupo chega aqui sem ter sido filtrado por um limite pensado para outra natureza de preço.

- [ ] **Step 2: Renderizar o bloco**

Imediatamente após o fechamento da `<section>` que contém a `medicine-list`, acrescente:

```tsx
      {semPmc.length > 0 ? (
        <section className="pf-section" aria-label="Apresentações sem preço máximo ao consumidor">
          <div className="pf-header">
            <h2>Sem preço máximo ao consumidor</h2>
            <p>
              Uso restrito hospitalar. A CMED não fixa PMC para estes produtos; o valor abaixo é o{" "}
              <strong>Preço Fábrica</strong>, que é o teto de venda para farmácias, hospitais e órgãos
              públicos — <strong>não</strong> é o preço final ao consumidor, e o valor cobrado será maior.
            </p>
          </div>
          <div className="medicine-list">
            {semPmc.map((item) => {
              const { valor } = precoAplicavel(item, selectedZone);
              return (
                <article className="medicine-row" key={item.id}>
                  <div className="medicine-main">
                    <div className="medicine-title">
                      <h3>{item.name}</h3>
                      <span className="pf-badge">Preço Fábrica</span>
                    </div>
                    <p>{item.activeIngredient}</p>
                    <small>{item.presentation}</small>
                  </div>
                  <div className="medicine-meta">
                    <span>{item.laboratory}</span>
                    <small>GGREM {item.ggremCode ?? item.id}</small>
                  </div>
                  <div className="price-cell">
                    <small>PF {uf} | ICMS {formatRate(selectedRate)}</small>
                    <strong>{valor === null ? "Sem preço nesta faixa" : currency.format(valor)}</strong>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 3: Estilizar o selo e o cabeçalho**

Em `src/app/globals.css`, ao final do arquivo:

```css
.pf-section {
  margin-top: 24px;
  border: 1px solid #e2b53d;
  border-radius: 12px;
  padding: 16px;
  background: #fffaf0;
}

.pf-header h2 {
  margin: 0 0 8px;
  font-size: 1.05rem;
}

.pf-header p {
  margin: 0 0 12px;
  font-size: 0.85rem;
  line-height: 1.5;
}

.pf-badge {
  background: #e2b53d;
  color: #3a2c05;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 600;
}
```

- [ ] **Step 4: Acertar o contador de resultados**

A Task 6 deixou uma inconsistência de propósito, para não fazer e desfazer: o resumo acima da lista mostra `{filtered.length}` seguido de "apresentações encontradas", mas a lista principal passou a exibir só as com PMC. Enquanto o segundo grupo não era renderizado, o número prometia mais linhas do que apareciam.

Com o bloco desta task no ar, os dois grupos estão visíveis e `filtered.length` volta a descrever a realidade — mas só se ambos couberem na tela. Como cada lista corta em 250, confirme por leitura que o número exibido corresponde à soma do que o usuário efetivamente vê, e ajuste-o se não corresponder. O mesmo vale para o valor passado a `saveSearchHistory`.

Registre no relatório qual das duas situações encontrou e o que fez.

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: limpo.

```bash
npm run lint
```

Esperado: limpo.

- [ ] **Step 6: Ver funcionando de verdade**

Gere uma base que contenha o grupo, sem tocar na publicada:

```bash
python scripts/import_cmed_xlsx.py "C:/Users/danie/AppData/Local/Temp/claude/C--/1e5cb0b7-4e6b-41d0-bb9f-84f84cbffe00/scratchpad/cmed_ago2026.xlsx" src/data/medicines.json
```

Suba o app com o navegador embutido, busque `leqembi` e confirme: o bloco amarelo aparece, mostra as duas apresentações com R$ 1.582,23 e R$ 3.955,58, e a lista principal permanece vazia para essa busca. Depois busque `clonazepam` e confirme que a lista principal aparece normalmente e o bloco não é renderizado. Tire uma captura de cada caso.

Ao terminar, **desfaça a base gerada** — ela pertence ao pipeline, não a esta task:

```bash
git checkout -- src/data/medicines.json
```

- [ ] **Step 7: Commit**

```bash
git add src/components/pmc-comparator.tsx src/app/globals.css
git commit -m "Show hospital-restricted presentations with their factory price"
```

---

### Task 8: Documentar a consequência operacional

**Files:**
- Modify: `DEPLOYMENT.md`
- Modify: `README.md`

- [ ] **Step 1: Registrar a janela entre deploy e regeração**

Em `DEPLOYMENT.md`, na seção `Atualização Automática`, acrescente um parágrafo explicando que publicar o código não faz as apresentações sem PMC aparecerem: a base só passa a contê-las quando for regerada, seja pela próxima edição da CMED que o cron importa, seja rodando `npm run update:cmed -- --force` deliberadamente. Diga que entre o deploy e a regeração o site continua sem exibir esse grupo.

Documente também a trava `hospitalar` junto das demais: ela reprova a edição quando alguma apresentação sem PMC não tiver restrição hospitalar, porque o aviso mostrado ao usuário afirma uso hospitalar para todo o grupo.

- [ ] **Step 2: Explicar o grupo no README**

Em `README.md`, acrescente à descrição do comparador que apresentações de uso restrito hospitalar, para as quais a CMED não fixa PMC, aparecem em bloco separado com o Preço Fábrica e um aviso de que não é preço ao consumidor.

- [ ] **Step 3: Commit**

```bash
git add DEPLOYMENT.md README.md
git commit -m "Document the factory price group and its regeneration step"
```

---

### Task 9: Avisar quando as colunas de PF desaparecerem

O importador tolera a ausência das colunas de Preço Fábrica e segue publicando só o que tem PMC — decisão do dono do projeto. Mas essa tolerância não pode ser silenciosa: é ela que faria o grupo hospitalar sumir do site sem ninguém notar. Esta task garante o aviso por e-mail **sem** impedir a publicação.

Neste sistema o e-mail só chega quando o job do GitHub falha. A ordem é, portanto: publicar primeiro, avisar depois.

**Files:**
- Modify: `scripts/import_cmed_xlsx.py`
- Modify: `scripts/diff_cmed.py`
- Modify: `scripts/update_cmed.py`
- Modify: `.github/workflows/cmed-update.yml`
- Test: `tests/test_import_cmed.py`, `tests/test_update_cmed.py`

**Interfaces:**
- Produces: `pf_columns_present(columns: dict[str, int]) -> bool` em `scripts/import_cmed_xlsx.py` — falso quando nenhuma das oito colunas de PF existe na planilha.
- Produces: o relatório ganha `pfColumnsMissing: bool`.
- Produces: `update_cmed.py` sai com código **2** quando aplicou a edição mas as colunas de PF estavam ausentes. Zero continua significando sucesso limpo, 1 continua significando "trava barrou ou download falhou".

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_import_cmed.py`:

```python
def test_detecta_ausencia_das_colunas_de_pf(build_cmed_workbook):
    from scripts.import_cmed_xlsx import PF_COLUMNS, pf_columns_present

    presentes = {nome: i for i, nome in enumerate(PF_COLUMNS.values())}
    assert pf_columns_present(presentes) is True
    assert pf_columns_present({"PMC 18 %": 0}) is False
    assert pf_columns_present({"PF 18 %": 0}) is True
```

Em `tests/test_update_cmed.py`:

```python
def test_sai_com_2_quando_faltam_colunas_de_pf(monkeypatch, tmp_path):
    from scripts import update_cmed

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", tmp_path / "base.json")
    update_cmed.CURRENT_JSON.write_text("[]", encoding="utf-8")
    assert update_cmed.exit_code_for(applied=True, pf_columns_missing=True) == 2
    assert update_cmed.exit_code_for(applied=True, pf_columns_missing=False) == 0
    assert update_cmed.exit_code_for(applied=False, pf_columns_missing=True) == 1
```

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
pytest tests/test_import_cmed.py tests/test_update_cmed.py -v
```

Esperado: FAIL por `ImportError` em `pf_columns_present` e `exit_code_for`.

- [ ] **Step 3: Implementar a detecção**

Em `scripts/import_cmed_xlsx.py`, após `PF_COLUMNS`:

```python
def pf_columns_present(columns: dict[str, int]) -> bool:
    return any(column in columns for column in PF_COLUMNS.values())
```

Em `scripts/diff_cmed.py`, `build_report` ganha um parâmetro com padrão para não quebrar quem já a chama:

```python
def build_report(current: list[dict], candidate: list[dict], pf_columns_missing: bool = False) -> dict:
```

e a chave no dicionário devolvido:

```python
        "pfColumnsMissing": pf_columns_missing,
```

Em `scripts/update_cmed.py`, acrescente a função pura e use-a no lugar dos `return` literais:

```python
def exit_code_for(*, applied: bool, pf_columns_missing: bool) -> int:
    if not applied:
        return 1
    return 2 if pf_columns_missing else 0
```

O orquestrador passa `pf_columns_missing` a `build_report` e, no caminho de sucesso, devolve `exit_code_for(...)` em vez de `0`. Quando o código for 2, imprima em stderr: `"Edição aplicada, mas a planilha não trouxe colunas de Preço Fábrica: o grupo de uso restrito hospitalar não foi importado."`

- [ ] **Step 4: Ensinar o workflow a distinguir os três códigos**

Em `.github/workflows/cmed-update.yml`, o passo `Atualizar a base` passa a capturar o código e registrá-lo, sem falhar de imediato:

```yaml
      - name: Atualizar a base
        id: update
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          set +e
          python -m scripts.update_cmed
          code=$?
          set -e
          echo "code=$code" >> "$GITHUB_OUTPUT"
          test "$code" != "1"
```

O código de saída é guardado numa variável antes de qualquer outro comando rodar — `$?` só é válido imediatamente após o comando que o produziu. O `test` no final falha o passo apenas no código 1, que é o de trava reprovada ou download quebrado; o código 2 passa daqui, para que a publicação aconteça, e é o passo do fim do workflow que o transforma em e-mail.

O passo de commit permanece como está. Acrescente, **depois** dele, o passo que dispara o e-mail sem ter impedido a publicação:

```yaml
      - name: Avisar se faltaram colunas de Preço Fábrica
        if: steps.update.outputs.code == '2'
        run: |
          echo "A edição foi publicada, mas a planilha da CMED não trouxe colunas de Preço Fábrica."
          echo "O grupo de uso restrito hospitalar não entrou nesta edição."
          exit 1
```

- [ ] **Step 5: Rodar os testes**

```bash
pytest -v
```

Esperado: todos passam.

- [ ] **Step 6: Commit**

```bash
git add scripts/import_cmed_xlsx.py scripts/diff_cmed.py scripts/update_cmed.py .github/workflows/cmed-update.yml tests/test_import_cmed.py tests/test_update_cmed.py
git commit -m "Warn by email when the factory price columns disappear"
```

---

## Notas de execução

- As Tasks 1, 2 e 4 não tocam no banco nem na aplicação e rodam sem `DATABASE_URL`.
- A Task 3 exige `DATABASE_URL` no `.env.local` para o passo da migration.
- A Task 7 é a única que precisa de navegador.
- Nenhuma task altera `src/data/medicines.json` de forma permanente. A base entra em produção pelo pipeline, não por este plano.
