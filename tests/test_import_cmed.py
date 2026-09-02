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


def test_libera_o_handle_do_arquivo_apos_importar(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "666",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    import_cmed(path)

    # No Windows, um workbook read_only do openpyxl que não foi fechado
    # mantém um handle aberto sobre o arquivo, e renomear/apagar o arquivo
    # levanta PermissionError enquanto esse handle existe. Este rename só
    # sucede se import_cmed tiver liberado o arquivo corretamente.
    path.rename(path.with_name("renomeado.xlsx"))


def test_traco_no_tipo_de_produto_vira_nao_informado(build_cmed_workbook):
    path = build_cmed_workbook([
        {
            "SUBSTÂNCIA": "CLONAZEPAM",
            "LABORATÓRIO": "ACME S.A.",
            "CÓDIGO GGREM": "777",
            "PRODUTO": "RIVOTRIL",
            "APRESENTAÇÃO": "2 MG",
            "TIPO DE PRODUTO (STATUS DO PRODUTO)": "-",
            "PMC 18 %": "50,28",
            "COMERCIALIZAÇÃO 2025": "Sim",
        }
    ])

    item = import_cmed(path)[0]

    assert item["kind"] == "Não informado"
    assert item["productType"] == "Não informado"


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


def test_detecta_ausencia_das_colunas_de_pf(build_cmed_workbook):
    from scripts.import_cmed_xlsx import PF_COLUMNS, pf_columns_present

    presentes = {nome: i for i, nome in enumerate(PF_COLUMNS.values())}
    assert pf_columns_present(presentes) is True
    assert pf_columns_present({"PMC 18 %": 0}) is False
    assert pf_columns_present({"PF 18 %": 0}) is True
