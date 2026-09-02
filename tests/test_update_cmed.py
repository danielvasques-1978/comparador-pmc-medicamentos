import json
import subprocess
import sys

import scripts.update_cmed as update_cmed
from scripts.update_cmed import decide

# Same as tests/conftest.py's BASE_COLUMNS, minus the eight "PF *" headers —
# used to build a spreadsheet that reproduces a CMED edition missing the
# Preço Fábrica column group entirely.
COLUMNS_SEM_PF = [
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


def test_nao_faz_nada_quando_a_edicao_e_a_mesma():
    assert decide("11/08/2026", "11/08/2026") is False


def test_sai_com_2_quando_faltam_colunas_de_pf(monkeypatch, tmp_path):
    from scripts import update_cmed

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", tmp_path / "base.json")
    update_cmed.CURRENT_JSON.write_text("[]", encoding="utf-8")
    assert update_cmed.exit_code_for(applied=True, pf_columns_missing=True) == 2
    assert update_cmed.exit_code_for(applied=True, pf_columns_missing=False) == 0
    assert update_cmed.exit_code_for(applied=False, pf_columns_missing=True) == 1


def test_main_publica_e_sai_com_2_quando_faltam_colunas_de_pf(
    tmp_path, monkeypatch, build_cmed_workbook
):
    """Guarda de ponta a ponta para a trilha inteira que esta task protege:
    ler as colunas da planilha candidata, calcular pf_columns_missing e
    levar isso ate o codigo de saida de main() — nao so a funcao pura
    exit_code_for isolada. Roda a planilha sem nenhuma das oito colunas de
    PF e confirma as tres consequencias juntas: o codigo de saida e 2, a
    base em CURRENT_JSON (um caminho temporario, nunca o arquivo real) foi
    de fato escrita — provando que a publicacao aconteceu, e nao foi
    pulada —, e o conteudo escrito contem a apresentacao com PMC da
    planilha."""
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
        columns=COLUMNS_SEM_PF,
    )

    current_json = tmp_path / "medicines.json"
    current_json.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", current_json)
    monkeypatch.setattr(
        update_cmed, "run_critical", lambda path: {"ok": 1, "absent": [], "invalid": []}
    )
    monkeypatch.setattr(sys, "argv", ["update_cmed.py", "--xlsx", str(xlsx_path), "--skip-neon"])

    exit_code = update_cmed.main()

    # 1. código de saída 2
    assert exit_code == 2

    # 2. a base foi escrita de verdade (publicação aconteceu)
    written = json.loads(current_json.read_text(encoding="utf-8"))
    assert written != []

    # 3. a base escrita contém a apresentação com PMC da planilha
    assert {item["id"] for item in written} == {"999"}
    assert written[0]["pmc"]["18"] == 50.28


def test_main_nao_sai_com_2_quando_as_colunas_de_pf_estao_presentes(
    tmp_path, monkeypatch, build_cmed_workbook
):
    """Espelho do teste acima: com as oito colunas de PF presentes na
    planilha — mesmo quando a única linha não tem PMC, só PF —,
    pf_columns_missing precisa ser False de ponta a ponta e main() não
    deve devolver 2. Sem este teste, o anterior por si só provaria apenas
    que o código de saída 2 é possível, não que ele só dispara quando
    deveria."""
    xlsx_path = build_cmed_workbook(
        [
            {
                "SUBSTÂNCIA": "LECANEMABE",
                "LABORATÓRIO": "ACME S.A.",
                "CÓDIGO GGREM": "888",
                "EAN 1": "7898937460614",
                "PRODUTO": "LEQEMBI",
                "APRESENTAÇÃO": "100 MG/ML SOL DIL INFUS IV CT FA VD TRANS X 2 ML",
                "RESTRIÇÃO HOSPITALAR": "Sim",
                "PF 18 %": "1582,23",
                "COMERCIALIZAÇÃO 2025": "Não",
            }
        ],
        published="01/09/2026",
    )

    current_json = tmp_path / "medicines.json"
    current_json.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", current_json)
    monkeypatch.setattr(
        update_cmed, "run_critical", lambda path: {"ok": 1, "absent": [], "invalid": []}
    )
    monkeypatch.setattr(sys, "argv", ["update_cmed.py", "--xlsx", str(xlsx_path), "--skip-neon"])

    exit_code = update_cmed.main()

    assert exit_code == 0

    written = json.loads(current_json.read_text(encoding="utf-8"))
    assert {item["id"] for item in written} == {"888"}


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


def test_trava_de_preco_bloqueia_a_escrita_e_registra_o_bloqueio(
    tmp_path, monkeypatch, build_cmed_workbook
):
    """A garantia central do pipeline nunca tinha um teste próprio: os dois
    testes acima arranjam para todas as travas passarem. Este sobe o PMC 18%
    da candidata bem acima do limite de variação em scripts/cmed_limits.py
    para disparar de propósito a trava de preço, e verifica as quatro
    consequências juntas — código de saída 1, medicines.json intacto byte a
    byte, seed_neon_medicines.mjs nunca chamado, e record_blocked_import.mjs
    chamado exatamente uma vez com um payload cujo failures[0]["name"] é
    "preco"."""
    xlsx_path = build_cmed_workbook(
        [
            {
                "SUBSTÂNCIA": "CLONAZEPAM",
                "LABORATÓRIO": "ACME S.A.",
                "CÓDIGO GGREM": "999",
                "EAN 1": "7898636192182",
                "PRODUTO": "RIVOTRIL",
                "APRESENTAÇÃO": "2 MG",
                "PMC 18 %": "150,00",
                "COMERCIALIZAÇÃO 2025": "Sim",
            }
        ],
        published="01/09/2026",
    )

    current_json = tmp_path / "medicines.json"
    original_payload = json.dumps(
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
    )
    current_json.write_text(original_payload, encoding="utf-8")

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", current_json)
    monkeypatch.setattr(update_cmed, "run_critical", lambda path: {"ok": 1, "absent": [], "invalid": []})

    recorded_calls: list[tuple[list[str], dict]] = []

    class FakeCompletedProcess:
        def __init__(self, returncode: int = 0):
            self.returncode = returncode

    def fake_run(cmd, *args, **kwargs):
        recorded_calls.append((cmd, kwargs))
        if cmd[:2] == ["node", "scripts/record_blocked_import.mjs"]:
            return FakeCompletedProcess(returncode=0)
        raise AssertionError(f"chamada de subprocess inesperada no teste: {cmd}")

    monkeypatch.setattr(update_cmed.subprocess, "run", fake_run)
    monkeypatch.setattr(sys, "argv", ["update_cmed.py", "--xlsx", str(xlsx_path)])

    exit_code = update_cmed.main()

    # 1. código de saída 1
    assert exit_code == 1

    # 2. medicines.json permanece intacto byte a byte
    assert current_json.read_text(encoding="utf-8") == original_payload

    # 3. seed_neon_medicines.mjs nunca foi chamado
    seed_calls = [cmd for cmd, _ in recorded_calls if cmd[:2] == ["node", "scripts/seed_neon_medicines.mjs"]]
    assert seed_calls == []

    # 4. record_blocked_import.mjs foi chamado exatamente uma vez, com um
    #    stdin que parseia para um relatório cujo failures[0]["name"] é a
    #    trava que disparou ("preco").
    blocked_calls = [
        (cmd, kwargs)
        for cmd, kwargs in recorded_calls
        if cmd[:2] == ["node", "scripts/record_blocked_import.mjs"]
    ]
    assert len(blocked_calls) == 1
    _, blocked_kwargs = blocked_calls[0]
    payload = json.loads(blocked_kwargs["input"])
    assert payload["failures"][0]["name"] == "preco"


def test_avisa_as_duas_falhas_quando_a_propria_reversao_tambem_falha(
    tmp_path, monkeypatch, capsys, build_cmed_workbook
):
    """Se o seed do Neon falhar E a escrita de restauração também falhar
    (disco cheio, arquivo travado), main() não pode deixar o OSError da
    restauração subir sem tratamento — precisa virar uma mensagem clara
    avisando as duas falhas, e ainda assim retornar 1."""
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

    real_current_json = tmp_path / "medicines.json"
    real_current_json.write_text(
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

    class FlakyPath:
        """Encaminha para o Path real, mas a SEGUNDA escrita — a tentativa
        de rollback, dentro do except — levanta OSError, simulando disco
        cheio ou arquivo travado bem no momento em que main() tenta desfazer
        a edição já aplicada."""

        def __init__(self, real_path):
            self._real_path = real_path
            self.write_calls = 0

        def read_text(self, encoding=None):
            return self._real_path.read_text(encoding=encoding)

        def write_text(self, data, encoding=None):
            self.write_calls += 1
            if self.write_calls == 1:
                return self._real_path.write_text(data, encoding=encoding)
            raise OSError("disco cheio (simulado pelo teste)")

        def __str__(self):
            return str(self._real_path)

    flaky_current_json = FlakyPath(real_current_json)

    monkeypatch.setattr(update_cmed, "CURRENT_JSON", flaky_current_json)
    monkeypatch.setattr(update_cmed, "run_critical", lambda path: {"ok": 1, "absent": [], "invalid": []})

    def fake_run(cmd, *args, **kwargs):
        if cmd[:2] == ["node", "scripts/seed_neon_medicines.mjs"]:
            raise subprocess.CalledProcessError(1, cmd)
        raise AssertionError(f"chamada de subprocess inesperada no teste: {cmd}")

    monkeypatch.setattr(update_cmed.subprocess, "run", fake_run)
    monkeypatch.setattr(sys, "argv", ["update_cmed.py", "--xlsx", str(xlsx_path)])

    exit_code = update_cmed.main()

    assert exit_code == 1
    stderr = capsys.readouterr().err
    assert "neon" in stderr.lower()
    assert "revert" in stderr.lower() or "restaura" in stderr.lower()
    assert str(real_current_json) in stderr
