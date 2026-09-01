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
