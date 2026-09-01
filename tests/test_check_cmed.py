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


def test_volume_shrink_names_records_that_left():
    left = [
        {"id": "1", "name": "Dipirona 500mg", "presentation": "Comprimido"},
        {"id": "2", "name": "Amoxicilina 500mg", "presentation": "Cápsula"},
        {"id": "3", "name": "Metformina 850mg", "presentation": "Comprimido"},
    ]
    report = base_report(volumeRatio=-0.20, left=left)

    failures = run_checks(report, VAZIO, VAZIO)

    assert [f.name for f in failures] == ["volume"]
    # Should contain at least one of the names that disappeared
    detail = failures[0].detail
    assert any(record["name"] in detail for record in left)


def test_volume_growth_names_records_that_entered():
    entered = [
        {"id": "4", "name": "Nimesulida 100mg", "presentation": "Comprimido"},
        {"id": "5", "name": "Ibuprofeno 600mg", "presentation": "Comprimido"},
        {"id": "6", "name": "Losartana 50mg", "presentation": "Comprimido"},
    ]
    report = base_report(volumeRatio=0.80, entered=entered)

    failures = run_checks(report, VAZIO, VAZIO)

    assert [f.name for f in failures] == ["volume"]
    # Should contain at least one of the names that entered
    detail = failures[0].detail
    assert any(record["name"] in detail for record in entered)


def test_price_message_clarifies_sample_when_truncated():
    # Simulate a large priceChanges list with many entries exceeding limit
    # In real scenario, priceChanges would be pre-truncated to ~50 largest variations
    # but we're testing that if there were many, the message should be honest
    large_price_changes = [
        {"id": f"med{i}", "name": f"Med{i}", "before": 10.0, "after": 15.0, "variation": 0.50}
        for i in range(70)
    ]
    report = base_report(maxPriceVariation=0.50, priceChanges=large_price_changes)

    failures = run_checks(report, VAZIO, VAZIO)

    assert [f.name for f in failures] == ["preco"]
    detail = failures[0].detail
    # Message should indicate this is among largest variations (amostra/maiores/sample)
    # or should explicitly state it's the count within the provided data sample
    # NOT just claim "70 variações" without clarification that data is pre-filtered
    assert "maiores" in detail.lower() or "amostra" in detail.lower() or "entre os" in detail.lower()
