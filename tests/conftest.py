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
    "PF 17 %",
    "PF 18 %",
    "PF 19 %",
    "PF 19,5 %",
    "PF 20 %",
    "PF 20,5 %",
    "PF 22,5 %",
    "PF 23 %",
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
        columns: list[str] | None = None,
    ) -> Path:
        workbook = Workbook()
        sheet = workbook.active

        sheet.append(["Secretaria Executiva - CMED"])
        sheet.append(["LISTA DE PREÇOS DE MEDICAMENTOS"])
        sheet.append([f"Publicada em {published} 19h30min."])
        sheet.append([])

        headers = [*(columns if columns is not None else BASE_COLUMNS), commercialization_header]
        sheet.append(headers)
        for row in rows:
            sheet.append([row.get(header) for header in headers])

        path = tmp_path / name
        workbook.save(path)
        return path

    return build
