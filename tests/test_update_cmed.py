import json
import subprocess
import sys

import scripts.update_cmed as update_cmed
from scripts.update_cmed import decide


def test_nao_faz_nada_quando_a_edicao_e_a_mesma():
    assert decide("11/08/2026", "11/08/2026") is False


def test_age_quando_ha_edicao_mais_recente():
    assert decide("10/06/2026", "11/08/2026") is True


def test_ignora_edicao_mais_antiga_que_a_vigente():
    assert decide("11/08/2026", "10/06/2026") is False


def test_age_quando_nao_ha_edicao_vigente():
    assert decide("", "11/08/2026") is True


def test_reverte_medicines_json_quando_o_seed_do_neon_falha(tmp_path, monkeypatch, build_cmed_workbook):
    """CURRENT_JSON.write_text roda antes do seed porque o seed lê esse
    arquivo. Se o seed falhar depois, o arquivo já escrito precisa voltar
    ao que era, senão o JSON e o banco ficam dessincronizados."""
    xlsx_path = build_cmed_workbook(
        [
            {
                "SUBSTÂNCIA": "CLONAZEPAM",
                "LABORATÓRIO": "ACME S.A.",
                "CÓDIGO GGREM": "999",
                "EAN 1": "7898636192182",
                "PRODUTO": "RIVOTRIL",
                "APRESENTAÇÃO": "2 MG",
                "PMC 18 %": "50,28",
                "COMERCIALIZAÇÃO 2025": "Sim",
            }
        ],
        published="01/09/2026",
    )

    # A base "vigente" tem a mesma apresentação (mesmo id, mesmo preço, mesmo
    # EAN) que a candidata acima, só que com tableDate anterior — assim todas
    # as travas de check_cmed passam trivialmente (0 de variação de volume e
    # de preço, cobertura de EAN igual, nenhum crítico perdido) e o pipeline
    # chega até a etapa de seed do Neon, que é o que queremos testar.
    current_json = tmp_path / "medicines.json"
    current_json.write_text(
        json.dumps(
            [
                {
                    "id": "999",
                    "name": "RIVOTRIL",
                    "activeIngredient": "CLONAZEPAM",
                    "laboratory": "ACME S.A.",
                    "kind": "Não informado",
                    "productType": "Não informado",
                    "presentation": "2 MG",
                    "pmc": {
                        "17": None,
                        "18": 50.28,
                        "19": None,
                        "19.5": None,
                        "20": None,
                        "20.5": None,
                        "22.5": None,
                        "23": None,
                    },
                    "ggremCode": "999",
                    "registration": "",
                    "ean1": "7898636192182",
                    "ean2": None,
                    "ean3": None,
                    "therapeuticClass": None,
                    "tarja": None,
                    "hospitalRestricted": False,
                    "commercialized": True,
                    "sourcePage": 0,
                    "source": "CMED/Anvisa",
                    "tableDate": "10/06/2026",
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    original_text = current_json.read_text(encoding="utf-8")

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", current_json)
    monkeypatch.setattr(update_cmed, "run_critical", lambda path: {"ok": 1, "absent": [], "invalid": []})

    def fake_run(cmd, *args, **kwargs):
        if cmd[:2] == ["node", "scripts/seed_neon_medicines.mjs"]:
            raise subprocess.CalledProcessError(1, cmd)
        raise AssertionError(f"chamada de subprocess inesperada no teste: {cmd}")

    monkeypatch.setattr(update_cmed.subprocess, "run", fake_run)
    monkeypatch.setattr(sys, "argv", ["update_cmed.py", "--xlsx", str(xlsx_path)])

    exit_code = update_cmed.main()

    assert exit_code == 1
    assert current_json.read_text(encoding="utf-8") == original_text
