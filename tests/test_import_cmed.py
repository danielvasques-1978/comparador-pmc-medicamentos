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


def test_traco_da_cmed_vira_ausencia(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "555",
            "EAN 1": "7898636192182",
            "EAN 2": "-",
            "EAN 3": "-",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "CLASSE TERAPÊUTICA": "-",
            "TARJA": "-",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    item = import_cmed(path)[0]

    assert item["ean1"] == "7898636192182"
    assert item["ean2"] is None
    assert item["ean3"] is None
    assert item["therapeuticClass"] is None
    assert item["tarja"] is None
