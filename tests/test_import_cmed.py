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
