# Automação CMED — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar, importar, validar e publicar automaticamente cada nova edição da lista de preços CMED/Anvisa, parando apenas quando uma trava de sanidade reprovar.

**Architecture:** Um orquestrador Python encadeia descoberta, download, importação, diff e travas, e só então aplica o resultado ao `medicines.json` e ao Neon. O orquestrador delega ao Node as duas etapas que já existem em JavaScript — validação de críticos e seed — em vez de reimplementá-las. Um workflow do GitHub Actions roda o mesmo orquestrador diariamente e faz o commit quando ele aplica uma edição nova.

**Tech Stack:** Python 3.11 com `openpyxl`, `requests` e `pytest`; Node 20+ com `@neondatabase/serverless` e o test runner nativo `node --test`; Next.js 16; Postgres via Neon; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-01-automacao-cmed-design.md`

## Global Constraints

- Publicação é automática quando todas as travas passam. Não existe botão nem flag de override.
- O pipeline nunca abre pull request. Commit vai direto na `main`.
- Apresentações que somem da CMED **não** são apagadas: recebem `delisted_at` e saem da busca.
- O Neon é a fonte de verdade e `src/data/medicines.json` é regravado na mesma rodada.
- Limites das travas, todos em `scripts/cmed_limits.py`: volume de −5% a +50%; variação máxima de PMC 18% de ±30%; cobertura mínima de EAN de 90%; até 5 princípios ativos críticos perdidos.
- `scripts/migrate_neon.mjs` divide cada arquivo `.sql` por `;` e reaplica **todas** as migrations a cada execução. Toda migration nova precisa ser idempotente (`if not exists`) e não pode conter `;` dentro de corpo de função ou literal de texto.
- `scripts/load_local_env.mjs` só define variáveis ainda indefinidas. No CI, `DATABASE_URL` vem do ambiente e não deve ser sobrescrita.
- Mensagens de commit em inglês, seguindo o padrão do repositório (`Add …`, `Use …`, `Keep …`).
- Nenhum segredo entra no repositório. `DATABASE_URL` é secret do GitHub Actions.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/cmed_limits.py` (novo) | Constantes das travas, num único lugar |
| `scripts/fetch_cmed.py` (novo) | Descobrir a edição publicada e baixar o `.xlsx` |
| `scripts/import_cmed_xlsx.py` (alterado) | Planilha → JSON candidato, agora com EAN e demais campos |
| `scripts/diff_cmed.py` (novo) | Comparar duas edições e emitir relatório JSON |
| `scripts/check_cmed.py` (novo) | Aplicar as cinco travas ao relatório |
| `scripts/update_cmed.py` (novo) | Orquestrar tudo e aplicar o resultado |
| `scripts/record_blocked_import.mjs` (novo) | Registrar em `price_imports` a tentativa bloqueada |
| `scripts/validate_critical_medicines.mjs` (alterado) | Aceitar caminho e emitir JSON |
| `scripts/seed_neon_medicines.mjs` (alterado) | Marcar saídas em vez de apagar |
| `neon/migrations/20260901000000_cmed_lifecycle.sql` (novo) | Campos novos e ciclo de vida |
| `src/lib/types.ts`, `src/lib/medicines.ts` (alterados) | Tipos e leitura filtrando descontinuados |
| `src/app/admin/page.tsx` (alterado) | Estado da última edição, aplicada ou bloqueada |
| `tests/` (novo) | `pytest` para o lado Python |
| `.github/workflows/cmed-update.yml` (novo) | Cron diário |

---

### Task 1: Fundação de testes e fixture da planilha CMED

Trava o comportamento atual do importador antes de mexer nele.

**Files:**
- Create: `requirements.txt`
- Create: `pytest.ini`
- Create: `tests/conftest.py`
- Test: `tests/test_import_cmed.py`

**Interfaces:**
- Produces: `build_cmed_workbook(path, rows, *, commercialization_header="COMERCIALIZAÇÃO 2025", published="11/08/2026")` — fixture do pytest que grava um `.xlsx` no layout da CMED e devolve o `Path`. `rows` é uma lista de dicionários com as chaves de coluna.

- [ ] **Step 1: Criar as dependências Python**

`requirements.txt`:

```text
openpyxl==3.1.5
requests==2.32.3
pytest==8.3.4
```

`pytest.ini`:

```ini
[pytest]
testpaths = tests
pythonpath = .
```

- [ ] **Step 2: Escrever a fixture da planilha**

`tests/conftest.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import Workbook

BASE_COLUMNS = [
    "SUBSTÂNCIA",
    "CNPJ",
    "LABORATÓRIO",
    "CÓDIGO GGREM",
    "REGISTRO",
    "EAN 1",
    "EAN 2",
    "EAN 3",
    "PRODUTO",
    "APRESENTAÇÃO",
    "CLASSE TERAPÊUTICA",
    "TIPO DE PRODUTO (STATUS DO PRODUTO)",
    "PMC 17 %",
    "PMC 18 %",
    "PMC 19 %",
    "PMC 19,5 %",
    "PMC 20 %",
    "PMC 20,5 %",
    "PMC 22,5 %",
    "PMC 23 %",
    "RESTRIÇÃO HOSPITALAR",
    "TARJA",
]


@pytest.fixture
def build_cmed_workbook(tmp_path: Path):
    def build(
        rows: list[dict[str, object]],
        *,
        commercialization_header: str = "COMERCIALIZAÇÃO 2025",
        published: str = "11/08/2026",
        name: str = "cmed.xlsx",
    ) -> Path:
        workbook = Workbook()
        sheet = workbook.active

        sheet.append(["Secretaria Executiva - CMED"])
        sheet.append(["LISTA DE PREÇOS DE MEDICAMENTOS"])
        sheet.append([f"Publicada em {published} 19h30min."])
        sheet.append([])

        headers = [*BASE_COLUMNS, commercialization_header]
        sheet.append(headers)
        for row in rows:
            sheet.append([row.get(header) for header in headers])

        path = tmp_path / name
        workbook.save(path)
        return path

    return build
```

Note que o cabeçalho fica na linha 5 e a data de publicação na linha 3. O importador procura o cabeçalho pela primeira célula igual a `SUBSTÂNCIA` e a data nas dez primeiras linhas, então o layout serve.

- [ ] **Step 3: Escrever o teste de regressão do comportamento atual**

`tests/test_import_cmed.py`:

```python
from scripts.import_cmed_xlsx import import_cmed


def test_importa_linha_com_pmc(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "538912020009303",
            "REGISTRO": "1234567890123",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG COM CT BL AL PLAS X 30",
            "TIPO DE PRODUTO (STATUS DO PRODUTO)": "Referência",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    medicines = import_cmed(path)

    assert len(medicines) == 1
    assert medicines[0]["id"] == "538912020009303"
    assert medicines[0]["pmc"]["18"] == 50.28
    assert medicines[0]["commercialized"] is True
    assert medicines[0]["tableDate"] == "11/08/2026"


def test_ignora_linha_sem_nenhum_pmc(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "SEM PRECO",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "111",
            "PRODUTO": "NADA",
            "APRESENTAÇÃO": "1 MG",
            "COMERCIALIZAÇÃO 2025": "Não",
        }
    ])

    assert import_cmed(path) == []


def test_preco_com_asterisco_de_isencao(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "ISENTO",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "222",
            "PRODUTO": "ISENTO",
            "APRESENTAÇÃO": "1 MG",
            "PMC 18 %": "12,34*",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    assert import_cmed(path)[0]["pmc"]["18"] == 12.34
```

- [ ] **Step 4: Tornar `scripts` importável**

Crie `scripts/__init__.py` vazio, para que `from scripts.import_cmed_xlsx import ...` funcione com `pythonpath = .`.

```bash
touch scripts/__init__.py
```

- [ ] **Step 5: Instalar e rodar**

```bash
pip install -r requirements.txt
pytest -v
```

Esperado: os três testes passam. Se `test_importa_linha_com_pmc` falhar por coluna obrigatória ausente, acrescente a coluna faltante a `BASE_COLUMNS` — o importador atual exige `SUBSTÂNCIA`, `LABORATÓRIO`, `CÓDIGO GGREM`, `REGISTRO`, `PRODUTO`, `APRESENTAÇÃO`, `TIPO DE PRODUTO (STATUS DO PRODUTO)`, `COMERCIALIZAÇÃO 2025` e as oito colunas de PMC.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt pytest.ini tests scripts/__init__.py
git commit -m "Add pytest foundation and CMED spreadsheet fixture"
```

---

### Task 2: Importador captura EAN e localiza a coluna de comercialização por padrão

**Files:**
- Modify: `scripts/import_cmed_xlsx.py`
- Test: `tests/test_import_cmed.py`

**Interfaces:**
- Produces: cada item do JSON ganha `ean1`, `ean2`, `ean3` (string ou `None`), `therapeuticClass` (string ou `None`), `tarja` (string ou `None`), `hospitalRestricted` (bool).
- Produces: `clean_code(value) -> str` — converte célula numérica em dígitos sem notação científica.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/test_import_cmed.py`:

```python
def test_captura_ean_e_campos_novos(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "538912020009303",
            "EAN 1": "7898636192182",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "CLASSE TERAPÊUTICA": "N3AE - ANTIEPILEPTICOS",
            "TARJA": "Tarja Preta",
            "RESTRIÇÃO HOSPITALAR": "Não",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    item = import_cmed(path)[0]

    assert item["ean1"] == "7898636192182"
    assert item["ean2"] is None
    assert item["ean3"] is None
    assert item["therapeuticClass"] == "N3AE - ANTIEPILEPTICOS"
    assert item["tarja"] == "Tarja Preta"
    assert item["hospitalRestricted"] is False


def test_ean_numerico_nao_vira_notacao_cientifica(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": 538912020009303,
            "EAN 1": 7898636192182,
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    item = import_cmed(path)[0]

    assert item["ean1"] == "7898636192182"
    assert item["id"] == "538912020009303"


def test_coluna_de_comercializacao_de_outro_ano(build_cmed_workbook):
    path = build_cmed_workbook(
        [
            {
                "SUBSTÂNCIA": "CLONAZEPAM",
                "LABORATÓRIO": "ACME S.A.",
                "CÓDIGO GGREM": "333",
                "PRODUTO": "RIVOTRIL",
                "APRESENTAÇÃO": "2 MG",
                "PMC 18 %": "50,28",
                "COMERCIALIZAÇÃO 2026": "Sim",
            }
        ],
        commercialization_header="COMERCIALIZAÇÃO 2026",
    )

    assert import_cmed(path)[0]["commercialized"] is True


def test_planilha_sem_coluna_de_comercializacao_falha(build_cmed_workbook):
    import pytest

    path = build_cmed_workbook(
        [
            {
                "SUBSTÂNCIA": "CLONAZEPAM",
                "LABORATÓRIO": "ACME S.A.",
                "CÓDIGO GGREM": "444",
                "PRODUTO": "RIVOTRIL",
                "APRESENTAÇÃO": "2 MG",
                "PMC 18 %": "50,28",
            }
        ],
        commercialization_header="OUTRA COISA",
    )

    with pytest.raises(ValueError, match="COMERCIALIZAÇÃO"):
        import_cmed(path)
```

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
pytest tests/test_import_cmed.py -v
```

Esperado: os quatro testes novos falham; os três da Task 1 continuam passando.

- [ ] **Step 3: Implementar**

Em `scripts/import_cmed_xlsx.py`, acrescente após `parse_price`:

```python
COMMERCIALIZATION_PATTERN = re.compile(r"^COMERCIALIZAÇÃO\s+\d{4}$")


def clean_code(value: object) -> str:
    """Códigos numéricos longos não podem virar notação científica."""
    if isinstance(value, bool):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    return clean(value)


def find_commercialization_column(columns: dict[str, int]) -> str:
    matches = [header for header in columns if COMMERCIALIZATION_PATTERN.match(header)]
    if not matches:
        raise ValueError("Coluna COMERCIALIZAÇÃO <ano> não encontrada na planilha CMED.")
    return sorted(matches)[-1]


def optional_text(row: tuple, columns: dict[str, int], column: str) -> str | None:
    if column not in columns:
        return None
    return clean(row[columns[column]]) or None


def optional_digits(row: tuple, columns: dict[str, int], column: str) -> str | None:
    if column not in columns:
        return None
    return clean_code(row[columns[column]]) or None


def flag(row: tuple, columns: dict[str, int], column: str) -> bool:
    if column not in columns:
        return False
    return clean(row[columns[column]]).casefold() == "sim"
```

São funções de módulo, não closures definidas dentro do laço — o laço percorre dezenas de milhares de linhas.

Em `import_cmed`, troque a lista `required` para não citar o ano literal e para exigir as colunas novas:

```python
    commercialization_column = find_commercialization_column(columns)

    required = [
        "SUBSTÂNCIA",
        "LABORATÓRIO",
        "CÓDIGO GGREM",
        "REGISTRO",
        "PRODUTO",
        "APRESENTAÇÃO",
        "TIPO DE PRODUTO (STATUS DO PRODUTO)",
        *PMC_COLUMNS.values(),
    ]
```

Ainda em `import_cmed`, dentro do laço, troque a leitura do GGREM para usar `clean_code`:

```python
        ggrem_code = clean_code(row[columns["CÓDIGO GGREM"]])
```

E, dentro do `medicines.append({...})`, some as chaves novas e substitua a linha de `commercialized`:

```python
                "ean1": optional_digits(row, columns, "EAN 1"),
                "ean2": optional_digits(row, columns, "EAN 2"),
                "ean3": optional_digits(row, columns, "EAN 3"),
                "therapeuticClass": optional_text(row, columns, "CLASSE TERAPÊUTICA"),
                "tarja": optional_text(row, columns, "TARJA"),
                "hospitalRestricted": flag(row, columns, "RESTRIÇÃO HOSPITALAR"),
                "commercialized": flag(row, columns, commercialization_column),
```

Remova a linha antiga que lia `COMERCIALIZAÇÃO 2025` diretamente. Ajuste a mensagem final de `main` para não citar o ano:

```python
    print(f"Importadas {len(medicines)} apresentações com PMC; {commercialized} comercializadas.")
```

- [ ] **Step 4: Rodar os testes**

```bash
pytest -v
```

Esperado: os sete testes passam.

- [ ] **Step 5: Conferir contra a planilha real**

```bash
python scripts/import_cmed_xlsx.py caminho/para/cmed_ago2026.xlsx /tmp/candidato.json
```

Esperado: mensagem informando um número de apresentações entre 21.000 e 27.000. Confirme que há EAN:

```bash
python -c "import json; d=json.load(open('/tmp/candidato.json',encoding='utf-8')); print(len(d), sum(1 for x in d if x['ean1']))"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/import_cmed_xlsx.py tests/test_import_cmed.py
git commit -m "Capture EAN and locate commercialization column by pattern"
```

---

### Task 3: Descoberta e download da edição publicada

**Files:**
- Create: `scripts/fetch_cmed.py`
- Test: `tests/test_fetch_cmed.py`

**Interfaces:**
- Produces: `find_edition(html: str) -> Edition`, onde `Edition` é uma `dataclass` com `url: str`, `published: str` (formato `dd/mm/aaaa`) e `filename: str`. Levanta `ValueError` quando nenhum link casa.
- Produces: `download(url: str, destination: Path) -> Path`.
- Produces: `PRICES_PAGE_URL` e `BASE_URL` como constantes de módulo.

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_fetch_cmed.py`:

```python
import pytest

from scripts.fetch_cmed import find_edition

PAGINA = """
<html><body>
<a href="/anvisa/pt-br/.../arquivos/pdf_conformidade_gov_20260811_192510234.pdf/@@download/file">PMC PDF</a>
<a href="/anvisa/pt-br/.../arquivos/xls_conformidade_site_20260811_192510234.xlsx/@@download/file">PMC XLS</a>
<a href="/anvisa/pt-br/.../arquivos/xls_conformidade_gov_20260811_192510234.xlsx/@@download/file">PMVG XLS</a>
</body></html>
"""


def test_encontra_a_planilha_pmc_e_ignora_a_pmvg():
    edition = find_edition(PAGINA)

    assert edition.filename == "xls_conformidade_site_20260811_192510234.xlsx"
    assert edition.published == "11/08/2026"
    assert edition.url.startswith("https://www.gov.br/")
    assert edition.url.endswith("/@@download/file")


def test_escolhe_a_edicao_mais_recente_quando_ha_varias():
    html = PAGINA + """
    <a href="/x/xls_conformidade_site_20260910_100000000.xlsx/@@download/file">setembro</a>
    """

    assert find_edition(html).published == "10/09/2026"


def test_falha_quando_o_padrao_do_nome_muda():
    with pytest.raises(ValueError, match="Nenhum link"):
        find_edition("<html><a href='/x/planilha_precos.xlsx'>PMC</a></html>")
```

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
pytest tests/test_fetch_cmed.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'scripts.fetch_cmed'`.

- [ ] **Step 3: Implementar**

`scripts/fetch_cmed.py`:

```python
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import requests

BASE_URL = "https://www.gov.br"
PRICES_PAGE_URL = "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos"

# O sufixo "site" é o PMC; "gov" é o PMVG, que não interessa aqui.
LINK_PATTERN = re.compile(
    r"href=[\"']([^\"']*xls_conformidade_site_(\d{8})_\d+\.xlsx[^\"']*)[\"']",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Edition:
    url: str
    published: str
    filename: str


def find_edition(html: str) -> Edition:
    matches = LINK_PATTERN.findall(html)
    if not matches:
        raise ValueError(
            "Nenhum link no padrão xls_conformidade_site_<data>_<seq>.xlsx foi "
            "encontrado na página da Anvisa. O layout pode ter mudado."
        )

    href, stamp = max(matches, key=lambda item: item[1])
    url = href if href.startswith("http") else f"{BASE_URL}{href}"
    filename = re.search(r"(xls_conformidade_site_\d{8}_\d+\.xlsx)", href).group(1)
    published = f"{stamp[6:8]}/{stamp[4:6]}/{stamp[0:4]}"
    return Edition(url=url, published=published, filename=filename)


def fetch_page(url: str = PRICES_PAGE_URL) -> str:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def download(url: str, destination: Path) -> Path:
    response = requests.get(url, timeout=600, stream=True)
    response.raise_for_status()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1 << 16):
            handle.write(chunk)
    return destination


def main() -> None:
    edition = find_edition(fetch_page())
    print(f"{edition.published} {edition.url}")
    if len(sys.argv) == 2:
        download(edition.url, Path(sys.argv[1]))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar os testes**

```bash
pytest tests/test_fetch_cmed.py -v
```

Esperado: os três passam.

- [ ] **Step 5: Conferir contra a Anvisa de verdade**

```bash
python scripts/fetch_cmed.py
```

Esperado: imprime uma data e uma URL terminada em `/@@download/file`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch_cmed.py tests/test_fetch_cmed.py
git commit -m "Add CMED edition discovery and download"
```

---

### Task 4: Relatório de diferenças entre edições

**Files:**
- Create: `scripts/diff_cmed.py`
- Test: `tests/test_diff_cmed.py`

**Interfaces:**
- Produces: `build_report(current: list[dict], candidate: list[dict]) -> dict` com as chaves `currentTableDate`, `candidateTableDate`, `currentCount`, `candidateCount`, `volumeRatio`, `eanCoverage`, `entered`, `left`, `priceChanges`, `maxPriceVariation`.
- `entered` e `left` são listas de `{"id", "name", "presentation"}`. `priceChanges` é lista de `{"id", "name", "before", "after", "variation"}`, ordenada por `abs(variation)` decrescente e limitada aos 50 maiores.

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_diff_cmed.py`:

```python
from scripts.diff_cmed import build_report


def med(ident, pmc18, *, name="X", ean="789", table_date="10/06/2026"):
    return {
        "id": ident,
        "name": name,
        "presentation": "1 MG",
        "pmc": {"18": pmc18},
        "ean1": ean,
        "tableDate": table_date,
    }


def test_conta_entradas_e_saidas():
    report = build_report(
        [med("a", 10.0), med("b", 20.0)],
        [med("b", 20.0, table_date="11/08/2026"), med("c", 30.0, table_date="11/08/2026")],
    )

    assert [item["id"] for item in report["entered"]] == ["c"]
    assert [item["id"] for item in report["left"]] == ["a"]
    assert report["currentCount"] == 2
    assert report["candidateCount"] == 2
    assert report["volumeRatio"] == 0.0


def test_calcula_variacao_de_preco():
    report = build_report([med("a", 100.0)], [med("a", 130.0, table_date="11/08/2026")])

    assert report["priceChanges"][0]["variation"] == pytest.approx(0.30)
    assert report["maxPriceVariation"] == pytest.approx(0.30)


def test_ignora_variacao_quando_falta_preco_anterior():
    report = build_report([med("a", None)], [med("a", 50.0, table_date="11/08/2026")])

    assert report["priceChanges"] == []
    assert report["maxPriceVariation"] == 0.0


def test_cobertura_de_ean():
    report = build_report(
        [med("a", 10.0)],
        [med("a", 10.0, ean="789"), med("b", 10.0, ean=None)],
    )

    assert report["eanCoverage"] == pytest.approx(0.5)


def test_datas_das_edicoes():
    report = build_report([med("a", 10.0)], [med("a", 11.0, table_date="11/08/2026")])

    assert report["currentTableDate"] == "10/06/2026"
    assert report["candidateTableDate"] == "11/08/2026"
```

Acrescente `import pytest` no topo do arquivo.

- [ ] **Step 2: Rodar para confirmar que falham**

```bash
pytest tests/test_diff_cmed.py -v
```

Esperado: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`scripts/diff_cmed.py`:

```python
from __future__ import annotations

import json
import sys
from pathlib import Path

MAX_LISTED_CHANGES = 50


def _identify(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "name": item.get("name", ""),
        "presentation": item.get("presentation", ""),
    }


def _table_date(rows: list[dict]) -> str:
    return rows[0].get("tableDate", "") if rows else ""


def _pmc18(item: dict) -> float | None:
    value = (item.get("pmc") or {}).get("18")
    return value if isinstance(value, (int, float)) else None


def build_report(current: list[dict], candidate: list[dict]) -> dict:
    before = {item["id"]: item for item in current}
    after = {item["id"]: item for item in candidate}

    entered = [_identify(after[key]) for key in sorted(set(after) - set(before))]
    left = [_identify(before[key]) for key in sorted(set(before) - set(after))]

    changes = []
    for key in sorted(set(before) & set(after)):
        old_price = _pmc18(before[key])
        new_price = _pmc18(after[key])
        if not old_price or new_price is None:
            continue
        variation = (new_price - old_price) / old_price
        if abs(variation) < 0.0001:
            continue
        changes.append(
            {
                "id": key,
                "name": after[key].get("name", ""),
                "before": old_price,
                "after": new_price,
                "variation": variation,
            }
        )

    changes.sort(key=lambda item: abs(item["variation"]), reverse=True)
    with_ean = sum(1 for item in candidate if item.get("ean1"))

    return {
        "currentTableDate": _table_date(current),
        "candidateTableDate": _table_date(candidate),
        "currentCount": len(current),
        "candidateCount": len(candidate),
        "volumeRatio": (len(candidate) - len(current)) / len(current) if current else 0.0,
        "eanCoverage": with_ean / len(candidate) if candidate else 0.0,
        "entered": entered,
        "left": left,
        "priceChanges": changes[:MAX_LISTED_CHANGES],
        "maxPriceVariation": abs(changes[0]["variation"]) if changes else 0.0,
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: python scripts/diff_cmed.py <atual.json> <candidato.json> <relatorio.json>")

    current = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    candidate = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    report = build_report(current, candidate)
    Path(sys.argv[3]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"{len(report['entered'])} entradas, {len(report['left'])} saídas, "
        f"variação máxima de {report['maxPriceVariation']:.1%}."
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar os testes**

```bash
pytest tests/test_diff_cmed.py -v
```

Esperado: os cinco passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/diff_cmed.py tests/test_diff_cmed.py
git commit -m "Add CMED edition diff report"
```

---

### Task 5: Validação de críticos com caminho configurável e saída JSON

Reaproveita a lógica já validada em vez de reimplementá-la em Python.

**Files:**
- Modify: `scripts/validate_critical_medicines.mjs`
- Test: `tests/test_validate_critical_cli.py`

**Interfaces:**
- Produces: `node scripts/validate_critical_medicines.mjs [caminho.json] [--json]`. Sem argumento, usa `src/data/medicines.json`, preservando `npm run validate:critical`. Com `--json`, imprime em stdout `{"ok": n, "absent": [labels], "invalid": [{label, total, invalid}]}` e sai com código 0 mesmo havendo falhas, para o orquestrador decidir.

- [ ] **Step 1: Escrever o teste que falha**

`tests/test_validate_critical_cli.py`:

```python
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(path: Path) -> dict:
    result = subprocess.run(
        ["node", "scripts/validate_critical_medicines.mjs", str(path), "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def med(name, ingredient):
    return {
        "id": name,
        "name": name,
        "activeIngredient": ingredient,
        "laboratory": "ACME S.A.",
        "kind": "Genérico",
        "presentation": "1 MG",
        "pmc": {"18": 10.0},
        "sourcePage": 0,
        "source": "CMED/Anvisa",
        "tableDate": "11/08/2026",
    }


def test_reconhece_critico_presente(tmp_path):
    path = tmp_path / "base.json"
    path.write_text(json.dumps([med("CLONAZEPAM", "CLONAZEPAM")]), encoding="utf-8")

    report = run(path)

    assert "Clonazepam" not in report["absent"]


def test_lista_criticos_ausentes(tmp_path):
    path = tmp_path / "base.json"
    path.write_text(json.dumps([med("DIPIRONA", "DIPIRONA MONOIDRATADA")]), encoding="utf-8")

    report = run(path)

    assert "Clonazepam" in report["absent"]
    assert report["ok"] == 0
```

Se o rótulo exato `Clonazepam` não constar de `src/data/critical-medicines.json`, troque nos testes por um rótulo que conste — confira com `python -c "import json;print([i['label'] for i in json.load(open('src/data/critical-medicines.json',encoding='utf-8'))][:20])"`.

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pytest tests/test_validate_critical_cli.py -v
```

Esperado: FAIL, porque o script hoje ignora argumentos e não imprime JSON.

- [ ] **Step 3: Implementar**

Em `scripts/validate_critical_medicines.mjs`, troque as duas primeiras linhas por leitura dinâmica:

```javascript
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import criticalMedicines from "../src/data/critical-medicines.json" with { type: "json" };

const DEFAULT_INPUT = fileURLToPath(new URL("../src/data/medicines.json", import.meta.url));

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const inputPath = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_INPUT;

const medicines = JSON.parse(fs.readFileSync(inputPath, "utf8"));
```

O caminho padrão é ancorado no próprio módulo, não em `process.cwd()`. O import estático que existia antes resolvia relativo ao arquivo, e um orquestrador que rode a partir de outro diretório precisa do mesmo comportamento. Não use `new URL(import.meta.url).pathname`, que no Windows devolve `/C:/…` e é rejeitado pelo `fs`.

Remova a linha `const medicines = rawMedicines;` que existia adiante.

Substitua o bloco final de saída por:

```javascript
const okCount = summary.filter((item) => item.status === "ok").length;

if (asJson) {
  console.log(JSON.stringify({ ok: okCount, absent, invalid: failures }));
  process.exit(0);
}

console.log(`Critical medicine validation: ${okCount} OK, ${absent.length} absent, ${failures.length} failing.`);

if (absent.length > 0) {
  console.log(`Absent from current imported base: ${absent.join(", ")}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
```

- [ ] **Step 4: Rodar os testes e o comando antigo**

```bash
pytest tests/test_validate_critical_cli.py -v
npm run validate:critical
```

Esperado: os dois testes passam e o comando antigo continua se comportando como antes.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_critical_medicines.mjs tests/test_validate_critical_cli.py
git commit -m "Accept a base path and JSON output in critical validation"
```

---

### Task 6: As cinco travas

**Files:**
- Create: `scripts/cmed_limits.py`
- Create: `scripts/check_cmed.py`
- Test: `tests/test_check_cmed.py`

**Interfaces:**
- Consumes: o relatório de `build_report` (Task 4) e o JSON de críticos (Task 5).
- Produces: `run_checks(report: dict, criticals_before: dict, criticals_after: dict) -> list[Failure]`, onde `Failure` é uma `dataclass` com `name: str` e `detail: str`. Lista vazia significa liberado.

- [ ] **Step 1: Criar o módulo de limites**

`scripts/cmed_limits.py`:

```python
"""Limites das travas de sanidade da importação CMED.

Ajustar um limite aqui é o caminho previsto quando uma trava barra algo
legítimo. Não existe override em tempo de execução, por decisão de projeto.
"""

VOLUME_MIN_RATIO = -0.05
VOLUME_MAX_RATIO = 0.50
MAX_PRICE_VARIATION = 0.30
MIN_EAN_COVERAGE = 0.90
MAX_CRITICAL_LOSSES = 5
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/test_check_cmed.py`:

```python
from scripts.check_cmed import run_checks


def base_report(**overrides):
    report = {
        "currentTableDate": "10/06/2026",
        "candidateTableDate": "11/08/2026",
        "currentCount": 1000,
        "candidateCount": 1100,
        "volumeRatio": 0.10,
        "eanCoverage": 0.97,
        "entered": [],
        "left": [],
        "priceChanges": [],
        "maxPriceVariation": 0.05,
    }
    report.update(overrides)
    return report


VAZIO = {"ok": 111, "absent": [], "invalid": []}


def test_libera_quando_tudo_esta_normal():
    assert run_checks(base_report(), VAZIO, VAZIO) == []


def test_trava_volume_quando_encolhe_demais():
    failures = run_checks(base_report(volumeRatio=-0.20), VAZIO, VAZIO)

    assert [failure.name for failure in failures] == ["volume"]


def test_trava_volume_quando_cresce_demais():
    assert [f.name for f in run_checks(base_report(volumeRatio=0.80), VAZIO, VAZIO)] == ["volume"]


def test_trava_preco_acima_do_limite():
    report = base_report(
        maxPriceVariation=0.45,
        priceChanges=[{"id": "a", "name": "X", "before": 10.0, "after": 14.5, "variation": 0.45}],
    )

    failures = run_checks(report, VAZIO, VAZIO)

    assert [failure.name for failure in failures] == ["preco"]
    assert "X" in failures[0].detail


def test_trava_ean_abaixo_da_cobertura():
    assert [f.name for f in run_checks(base_report(eanCoverage=0.40), VAZIO, VAZIO)] == ["ean"]


def test_trava_data_nao_avancou():
    report = base_report(candidateTableDate="10/06/2026")

    assert [f.name for f in run_checks(report, VAZIO, VAZIO)] == ["edicao"]


def test_tolera_perda_isolada_de_critico():
    depois = {"ok": 110, "absent": ["Brexpiprazol"], "invalid": []}

    assert run_checks(base_report(), VAZIO, depois) == []


def test_trava_perda_em_massa_de_criticos():
    depois = {"ok": 0, "absent": [f"Critico {n}" for n in range(20)], "invalid": []}

    failures = run_checks(base_report(), VAZIO, depois)

    assert [failure.name for failure in failures] == ["criticos"]


def test_nao_conta_critico_que_ja_estava_ausente_antes():
    antes = {"ok": 105, "absent": [f"Critico {n}" for n in range(6)], "invalid": []}
    depois = {"ok": 105, "absent": [f"Critico {n}" for n in range(6)], "invalid": []}

    assert run_checks(base_report(), antes, depois) == []
```

- [ ] **Step 3: Rodar para confirmar que falham**

```bash
pytest tests/test_check_cmed.py -v
```

Esperado: FAIL com `ModuleNotFoundError`.

- [ ] **Step 4: Implementar**

`scripts/check_cmed.py`:

```python
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from scripts.cmed_limits import (
    MAX_CRITICAL_LOSSES,
    MAX_PRICE_VARIATION,
    MIN_EAN_COVERAGE,
    VOLUME_MAX_RATIO,
    VOLUME_MIN_RATIO,
)


@dataclass(frozen=True)
class Failure:
    name: str
    detail: str


def _parse(date_text: str) -> datetime | None:
    try:
        return datetime.strptime(date_text, "%d/%m/%Y")
    except (ValueError, TypeError):
        return None


def _check_edition(report: dict) -> Failure | None:
    current = _parse(report.get("currentTableDate", ""))
    candidate = _parse(report.get("candidateTableDate", ""))
    if candidate is None:
        return Failure("edicao", "Data da edição candidata não pôde ser interpretada.")
    if current is not None and candidate <= current:
        return Failure(
            "edicao",
            f"A edição candidata ({report['candidateTableDate']}) não é mais recente "
            f"que a vigente ({report['currentTableDate']}).",
        )
    return None


def _check_volume(report: dict) -> Failure | None:
    ratio = report["volumeRatio"]
    if VOLUME_MIN_RATIO <= ratio <= VOLUME_MAX_RATIO:
        return None
    return Failure(
        "volume",
        f"Total de apresentações variou {ratio:.1%} "
        f"({report['currentCount']} para {report['candidateCount']}), fora da faixa "
        f"de {VOLUME_MIN_RATIO:.0%} a {VOLUME_MAX_RATIO:.0%}.",
    )


def _check_price(report: dict) -> Failure | None:
    if report["maxPriceVariation"] <= MAX_PRICE_VARIATION:
        return None
    offenders = [
        f"{item['name']} ({item['before']:.2f} para {item['after']:.2f}, {item['variation']:+.1%})"
        for item in report["priceChanges"]
        if abs(item["variation"]) > MAX_PRICE_VARIATION
    ]
    return Failure(
        "preco",
        f"{len(offenders)} apresentação(ões) variaram acima de {MAX_PRICE_VARIATION:.0%}: "
        + "; ".join(offenders[:10]),
    )


def _check_ean(report: dict) -> Failure | None:
    if report["eanCoverage"] >= MIN_EAN_COVERAGE:
        return None
    return Failure(
        "ean",
        f"Apenas {report['eanCoverage']:.1%} das linhas trazem EAN 1, "
        f"abaixo do mínimo de {MIN_EAN_COVERAGE:.0%}.",
    )


def _check_criticals(before: dict, after: dict) -> Failure | None:
    lost = sorted(set(after.get("absent", [])) - set(before.get("absent", [])))
    if len(lost) <= MAX_CRITICAL_LOSSES:
        return None
    return Failure(
        "criticos",
        f"{len(lost)} princípios ativos críticos sumiram nesta edição, acima do "
        f"tolerado de {MAX_CRITICAL_LOSSES}: " + ", ".join(lost[:15]),
    )


def run_checks(report: dict, criticals_before: dict, criticals_after: dict) -> list[Failure]:
    candidates = [
        _check_edition(report),
        _check_volume(report),
        _check_price(report),
        _check_ean(report),
        _check_criticals(criticals_before, criticals_after),
    ]
    return [failure for failure in candidates if failure is not None]


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: python -m scripts.check_cmed <relatorio.json> <criticos_antes.json> <criticos_depois.json>")

    report = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    before = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    after = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))

    failures = run_checks(report, before, after)
    for failure in failures:
        print(f"[{failure.name}] {failure.detail}", file=sys.stderr)

    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Rodar os testes**

```bash
pytest -v
```

Esperado: tudo passa, somando os testes das tarefas anteriores.

- [ ] **Step 6: Commit**

```bash
git add scripts/cmed_limits.py scripts/check_cmed.py tests/test_check_cmed.py
git commit -m "Add sanity gates for CMED imports"
```

---

### Task 7: Migration e marcação de saída no lugar da exclusão

**Files:**
- Create: `neon/migrations/20260901000000_cmed_lifecycle.sql`
- Modify: `scripts/seed_neon_medicines.mjs`
- Test: `tests/seed_neon_medicines.test.mjs`

**Interfaces:**
- Produces: `toIsoDate(tableDate: string) -> string | null` — função pura exportada de `scripts/seed_neon_medicines.mjs`, converte `dd/mm/aaaa` em `aaaa-mm-dd`. É o ponto único de conversão citado no spec, e o seed a usa para gravar `delisted_at`.

- [ ] **Step 1: Escrever a migration**

`neon/migrations/20260901000000_cmed_lifecycle.sql`. Sem `;` dentro de literais e tudo idempotente, porque o runner reaplica todas as migrations a cada execução:

```sql
alter table medicines
  add column if not exists ean1 text,
  add column if not exists ean2 text,
  add column if not exists ean3 text,
  add column if not exists therapeutic_class text,
  add column if not exists tarja text,
  add column if not exists hospital_restricted boolean,
  add column if not exists delisted_at date,
  add column if not exists last_seen_table_date text;

create index if not exists medicines_ean1_idx on medicines (ean1);
create index if not exists medicines_delisted_at_idx on medicines (delisted_at);

alter table price_imports
  add column if not exists status text not null default 'applied',
  add column if not exists report jsonb,
  add column if not exists source_url text;
```

- [ ] **Step 2: Escrever o teste da decisão de ciclo de vida**

`tests/seed_neon_medicines.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { toIsoDate } from "../scripts/seed_neon_medicines.mjs";

test("converte a data da tabela para ISO", () => {
  assert.equal(toIsoDate("11/08/2026"), "2026-08-11");
});

test("preserva o zero à esquerda no dia e no mês", () => {
  assert.equal(toIsoDate("01/06/2026"), "2026-06-01");
});

test("devolve null para entrada inválida", () => {
  assert.equal(toIsoDate("Não informada"), null);
  assert.equal(toIsoDate(null), null);
});
```

- [ ] **Step 3: Rodar para confirmar que falha**

```bash
node --test tests/
```

Esperado: FAIL, porque `toIsoDate` ainda não é exportada.

- [ ] **Step 4: Implementar**

`scripts/seed_neon_medicines.mjs` hoje executa no topo do módulo, o que impede importá-lo num teste. Envolva a execução num guard e exporte a função pura. No topo, logo após os imports:

```javascript
const TABLE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function toIsoDate(tableDate) {
  const match = typeof tableDate === "string" ? tableDate.match(TABLE_DATE_PATTERN) : null;
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
```

Isso exige `import { pathToFileURL } from "node:url";` junto aos demais imports. Comparar a URL completa é o teste correto — comparar nomes de arquivo daria falso positivo com arquivos homônimos em pastas diferentes.

Envolva todo o código existente de execução — de `loadLocalEnv()` até o `console.log` final — num `if (isMain) { ... }`. Dentro dele, substitua a linha final de exclusão:

```javascript
  await sql`delete from medicines where import_id is distinct from ${importId}`;
```

por marcação de saída, executada apenas depois de todos os lotes terem sido aplicados:

```javascript
  const tableDate = first?.tableDate ?? null;
  const isoTableDate = toIsoDate(tableDate);

  if (!isoTableDate) {
    throw new Error(`Data de tabela inesperada: ${tableDate}`);
  }

  await sql`
    update medicines
       set delisted_at = ${isoTableDate}::date
     where import_id is distinct from ${importId}
       and delisted_at is null
  `;

  await sql`
    update medicines
       set delisted_at = null,
           last_seen_table_date = ${tableDate}
     where import_id = ${importId}
  `;
```

Acrescente também as colunas novas ao `insert` e ao `do update set` do lote, seguindo exatamente o padrão das colunas já existentes: `ean1`, `ean2`, `ean3`, `therapeutic_class`, `tarja`, `hospital_restricted`, alimentadas por `item.ean1 ?? null`, `item.ean2 ?? null`, `item.ean3 ?? null`, `item.therapeuticClass ?? null`, `item.tarja ?? null` e `item.hospitalRestricted ?? null`.

- [ ] **Step 5: Rodar os testes**

```bash
node --test tests/
pytest -v
```

Esperado: os três testes de ciclo de vida passam e o pytest continua verde.

- [ ] **Step 6: Aplicar a migration**

Com `DATABASE_URL` no `.env.local`:

```bash
npm run migrate:neon
```

Esperado: mensagem informando o número de statements aplicados, sem erro.

- [ ] **Step 7: Verificar a marcação de saída contra o banco**

O comportamento em SQL não é coberto por teste automatizado — só a conversão de data é. Verifique à mão, uma vez:

```bash
npm run seed:neon
```

Depois, no console do Neon, confirme que a base ficou coerente:

```sql
select count(*) filter (where delisted_at is null) as vigentes,
       count(*) filter (where delisted_at is not null) as descontinuadas
  from medicines;
```

Esperado: `vigentes` igual ao número de apresentações do `medicines.json` e `descontinuadas` em zero, já que esta é a primeira execução após a migration. Rodando o seed uma segunda vez sobre o mesmo arquivo, os números não podem mudar — é isso que prova a idempotência.

- [ ] **Step 8: Commit**

```bash
git add neon/migrations/20260901000000_cmed_lifecycle.sql scripts/seed_neon_medicines.mjs tests/seed_neon_medicines.test.mjs
git commit -m "Mark delisted presentations instead of deleting them"
```

---

### Task 8: Aplicação lê os campos novos e esconde descontinuados

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/medicines.ts`

**Interfaces:**
- Produces: `Medicine` ganha `ean1?: string`, `ean2?: string`, `ean3?: string`, `therapeuticClass?: string`, `tarja?: string`, `hospitalRestricted?: boolean`, `delistedAt?: string`.

- [ ] **Step 1: Estender o tipo**

Em `src/lib/types.ts`, dentro de `Medicine`, após `commercialized`:

```typescript
  ean1?: string;
  ean2?: string;
  ean3?: string;
  therapeuticClass?: string;
  tarja?: string;
  hospitalRestricted?: boolean;
  delistedAt?: string;
```

- [ ] **Step 2: Ajustar a consulta e o mapeamento**

Em `src/lib/medicines.ts`, acrescente os campos ao `MedicineRow`:

```typescript
  ean1: string | null;
  ean2: string | null;
  ean3: string | null;
  therapeutic_class: string | null;
  tarja: string | null;
  hospital_restricted: boolean | null;
```

Na consulta SQL, acrescente as colunas à lista do `select`, logo após `commercialized`:

```sql
        ean1,
        ean2,
        ean3,
        therapeutic_class,
        tarja,
        hospital_restricted,
```

E, ainda na consulta, filtre os descontinuados inserindo antes do `order by`:

```sql
      where delisted_at is null
```

No `.map`, acrescente após `commercialized`:

```typescript
      ean1: row.ean1 ?? undefined,
      ean2: row.ean2 ?? undefined,
      ean3: row.ean3 ?? undefined,
      therapeuticClass: row.therapeutic_class ?? undefined,
      tarja: row.tarja ?? undefined,
      hospitalRestricted: row.hospital_restricted ?? undefined,
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sem erros.

- [ ] **Step 4: Verificar no navegador**

```bash
npm run dev
```

Abra `http://localhost:3000`, busque por `clonazepam` e confirme que os resultados aparecem normalmente. Sem `DATABASE_URL`, a aplicação cai no fallback do JSON, que é o esperado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/medicines.ts
git commit -m "Read new CMED fields and hide delisted presentations"
```

---

### Task 9: Tela administrativa mostra o estado da última edição

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `price_imports` com `status`, `report` e `source_url` (Task 7).

- [ ] **Step 1: Buscar a última edição e a última tentativa bloqueada**

Em `src/app/admin/page.tsx`, após `const medicines = await getMedicines();`, acrescente:

```typescript
  const [lastApplied] = sql
    ? await sql`
        select table_date, imported_at, row_count
          from price_imports
         where status = 'applied'
         order by imported_at desc
         limit 1
      `
    : [];

  const [lastBlocked] = sql
    ? await sql`
        select table_date, imported_at, report, source_url
          from price_imports
         where status = 'blocked'
         order by imported_at desc
         limit 1
      `
    : [];
```

- [ ] **Step 2: Trocar o cartão do Kairos pelo estado da automação**

Remova a linha `const kairosOverlayCount = ...` e substitua o cartão `Tabela + Kairos` por:

```tsx
        <div className={lastBlocked ? "admin-card danger" : "admin-card"}>
          <FileCheck2 size={22} />
          <span>{lastBlocked ? "Edição bloqueada" : "Tabela vigente"}</span>
          <strong>{lastBlocked ? String(lastBlocked.table_date) : tableDate}</strong>
        </div>
```

- [ ] **Step 3: Trocar o painel de fluxo manual pelo painel da automação**

Substitua o `<section className="admin-panel">` que contém `Fluxo recomendado` por:

```tsx
      <section className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <p className="eyebrow">Atualização automática</p>
            <h2>{lastBlocked ? "Edição bloqueada por uma trava" : "Em dia"}</h2>
          </div>
          <UploadCloud size={22} />
        </div>

        {lastApplied ? (
          <div className="admin-status-row">
            <span>Última edição aplicada: {String(lastApplied.table_date)}</span>
            <span>{Number(lastApplied.row_count).toLocaleString("pt-BR")} apresentações</span>
          </div>
        ) : (
          <p className="admin-copy">Nenhuma edição registrada ainda pela automação.</p>
        )}

        {lastBlocked ? (
          <div className="admin-list">
            {((lastBlocked.report as { failures?: Array<{ name: string; detail: string }> })?.failures ?? []).map(
              (failure) => (
                <article className="admin-issue" key={failure.name}>
                  <strong>{failure.name}</strong>
                  <p>{failure.detail}</p>
                </article>
              ),
            )}
            <p className="admin-copy">
              Para destravar, ajuste o limite correspondente em `scripts/cmed_limits.py` e rode a
              automação de novo. Não há publicação forçada, por decisão de projeto.
            </p>
          </div>
        ) : null}
      </section>
```

- [ ] **Step 4: Verificar que compila e roda**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

Abra `http://localhost:3000/admin`. Sem `DATABASE_URL`, a tela mostra o bloco de acesso restrito, que é o comportamento existente. Com `DATABASE_URL` e um e-mail em `ADMIN_EMAILS`, confirme que o painel novo aparece sem quebrar.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "Show automation status in the admin screen"
```

---

### Task 10: Orquestrador

**Files:**
- Create: `scripts/update_cmed.py`
- Create: `scripts/record_blocked_import.mjs`
- Modify: `package.json`
- Test: `tests/test_update_cmed.py`

**Interfaces:**
- Consumes: `find_edition`, `download` (Task 3), `import_cmed` (Task 2), `build_report` (Task 4), `run_checks` (Task 6).
- Produces: `decide(current_table_date: str, edition_published: str) -> bool` — indica se há trabalho a fazer.
- Produces: código de saída 0 quando aplicou ou quando não havia edição nova; 1 quando alguma trava reprovou ou o download falhou.

- [ ] **Step 1: Escrever o teste da decisão**

`tests/test_update_cmed.py`:

```python
from scripts.update_cmed import decide


def test_nao_faz_nada_quando_a_edicao_e_a_mesma():
    assert decide("11/08/2026", "11/08/2026") is False


def test_age_quando_ha_edicao_mais_recente():
    assert decide("10/06/2026", "11/08/2026") is True


def test_ignora_edicao_mais_antiga_que_a_vigente():
    assert decide("11/08/2026", "10/06/2026") is False


def test_age_quando_nao_ha_edicao_vigente():
    assert decide("", "11/08/2026") is True
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pytest tests/test_update_cmed.py -v
```

Esperado: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`scripts/update_cmed.py`:

```python
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from scripts.check_cmed import run_checks
from scripts.diff_cmed import build_report
from scripts.fetch_cmed import download, fetch_page, find_edition
from scripts.import_cmed_xlsx import import_cmed

ROOT = Path(__file__).resolve().parents[1]
CURRENT_JSON = ROOT / "src" / "data" / "medicines.json"


def _parse(date_text: str) -> datetime | None:
    try:
        return datetime.strptime(date_text, "%d/%m/%Y")
    except (ValueError, TypeError):
        return None


def decide(current_table_date: str, edition_published: str) -> bool:
    published = _parse(edition_published)
    if published is None:
        return False
    current = _parse(current_table_date)
    return current is None or published > current


def run_critical(path: Path) -> dict:
    result = subprocess.run(
        ["node", "scripts/validate_critical_medicines.mjs", str(path), "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(result.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza a base CMED a partir do portal da Anvisa.")
    parser.add_argument("--xlsx", type=Path, help="usa um arquivo local em vez de baixar")
    parser.add_argument("--skip-neon", action="store_true", help="não escreve no banco")
    parser.add_argument("--force", action="store_true", help="processa mesmo sem edição nova")
    args = parser.parse_args()

    current = json.loads(CURRENT_JSON.read_text(encoding="utf-8"))
    current_table_date = current[0].get("tableDate", "") if current else ""

    with tempfile.TemporaryDirectory() as workdir:
        work = Path(workdir)

        if args.xlsx:
            xlsx_path, published, source_url = args.xlsx, "", str(args.xlsx)
        else:
            edition = find_edition(fetch_page())
            published, source_url = edition.published, edition.url
            if not args.force and not decide(current_table_date, published):
                print(f"Edição {published} já está aplicada. Nada a fazer.")
                return 0
            xlsx_path = download(edition.url, work / edition.filename)

        candidate = import_cmed(xlsx_path)
        candidate_json = work / "candidate.json"
        candidate_json.write_text(
            json.dumps(candidate, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

        report = build_report(current, candidate)
        failures = run_checks(report, run_critical(CURRENT_JSON), run_critical(candidate_json))

        report["failures"] = [{"name": item.name, "detail": item.detail} for item in failures]
        report["sourceUrl"] = source_url

        if failures:
            for failure in failures:
                print(f"[{failure.name}] {failure.detail}", file=sys.stderr)
            record_blocked(report)
            return 1

        CURRENT_JSON.write_text(
            json.dumps(candidate, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        print(
            f"Edição {report['candidateTableDate']} aplicada: "
            f"{len(report['entered'])} entradas, {len(report['left'])} saídas."
        )

        if not args.skip_neon:
            subprocess.run(["node", "scripts/seed_neon_medicines.mjs"], cwd=ROOT, check=True)

    return 0


def record_blocked(report: dict) -> None:
    """Grava a tentativa bloqueada em price_imports, se houver banco configurado."""
    payload = json.dumps(report, ensure_ascii=False)
    result = subprocess.run(
        ["node", "scripts/record_blocked_import.mjs"],
        cwd=ROOT,
        input=payload,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print("Não foi possível registrar a tentativa bloqueada no banco.", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Criar o registrador da tentativa bloqueada**

`scripts/record_blocked_import.mjs`:

```javascript
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./load_local_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL ausente; tentativa bloqueada não foi registrada.");
  process.exit(0);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const sql = neon(databaseUrl);

await sql`
  insert into price_imports (source_name, source_file, table_date, row_count, status, report, source_url)
  values (
    ${"CMED/Anvisa"},
    ${"Lista de preços CMED.xlsx"},
    ${report.candidateTableDate ?? "Não informada"},
    ${report.candidateCount ?? 0},
    ${"blocked"},
    ${JSON.stringify(report)}::jsonb,
    ${report.sourceUrl ?? null}
  )
`;

console.log("Tentativa bloqueada registrada.");
```

- [ ] **Step 5: Registrar o comando no package.json**

Em `package.json`, dentro de `scripts`, acrescente:

```json
    "update:cmed": "python -m scripts.update_cmed",
```

O módulo é executado com `-m` porque `update_cmed.py` importa `scripts.check_cmed` e companhia. Executá-lo por caminho colocaria `scripts/` no `sys.path` em vez da raiz, e os imports quebrariam.

- [ ] **Step 6: Rodar os testes e o pipeline de ponta a ponta sem banco**

```bash
pytest -v
python -m scripts.update_cmed --skip-neon
```

Esperado: os testes passam. O pipeline detecta a edição de agosto, importa, e ou aplica ou lista qual trava reprovou. Se reprovar por volume, confira o número: a base de junho tem 21.546 apresentações e a de agosto deve ficar dentro de +50%.

- [ ] **Step 7: Commit**

```bash
git add scripts/update_cmed.py scripts/record_blocked_import.mjs tests/test_update_cmed.py package.json
git commit -m "Add CMED update orchestrator"
```

---

### Task 11: Cron no GitHub Actions e integração com a Vercel

**Files:**
- Create: `.github/workflows/cmed-update.yml`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Conectar a Vercel ao repositório**

No painel da Vercel, em Settings → Git do projeto `comparador-pmc-medicamentos`, conecte o repositório `danielvasques-1978/comparador-pmc-medicamentos` e defina a branch de produção como `main`. Confirme com um commit qualquer que o deploy dispara sozinho.

Sem esse passo, o pipeline atualiza os dados e nada vai ao ar.

- [ ] **Step 2: Cadastrar o secret**

Em Settings → Secrets and variables → Actions do repositório, crie `DATABASE_URL` com a connection string do Neon.

- [ ] **Step 3: Escrever o workflow**

`.github/workflows/cmed-update.yml`:

```yaml
name: Atualização CMED

on:
  schedule:
    - cron: "0 9 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - run: npm ci
      - run: pip install -r requirements.txt

      - name: Rodar os testes
        run: |
          pytest -q
          node --test tests/

      - name: Atualizar a base
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: python -m scripts.update_cmed

      - name: Commitar a edição nova
        run: |
          if [ -n "$(git status --porcelain src/data/medicines.json)" ]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add src/data/medicines.json
            git commit -m "Update CMED price table"
            git push
          else
            echo "Nenhuma alteração na base."
          fi
```

O passo de atualização falha com código 1 quando uma trava reprova, o que faz o job falhar e o GitHub enviar o e-mail. O passo de commit não roda nesse caso, porque um passo anterior falhou.

- [ ] **Step 4: Rodar o workflow à mão**

Em Actions, dispare `Atualização CMED` por `workflow_dispatch`.

Esperado: o job termina verde e, havendo edição nova, aparece um commit `Update CMED price table` na `main`, seguido de um deploy na Vercel.

- [ ] **Step 5: Atualizar a documentação**

Em `README.md`, na seção de comandos, acrescente `npm run update:cmed` e remova a menção ao overlay Kairos. Em `DEPLOYMENT.md`, substitua a seção `Revisão Mensal` por uma descrição da automação: o cron roda diariamente, publica sozinho quando as travas passam, e o `/admin` mostra o motivo quando alguma reprova. Registre que os limites vivem em `scripts/cmed_limits.py` e que não existe publicação forçada.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/cmed-update.yml README.md DEPLOYMENT.md
git commit -m "Run the CMED update daily on GitHub Actions"
```

---

## Notas de execução

- As Tasks 1 a 6 não tocam no banco nem na aplicação. Dá para executá-las inteiras sem `DATABASE_URL`.
- A Task 7 exige `DATABASE_URL` no `.env.local` para o passo da migration. As demais tarefas rodam sem.
- A Task 11 depende de acesso ao painel da Vercel e às configurações do repositório no GitHub, que são passos manuais.
- A duplicação de lógica entre `src/lib/critical-validation.ts` e `scripts/validate_critical_medicines.mjs` é anterior a este trabalho e permanece. Unificá-las é uma limpeza legítima, mas fora do escopo desta automação.
