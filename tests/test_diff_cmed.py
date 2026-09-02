import pytest

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
