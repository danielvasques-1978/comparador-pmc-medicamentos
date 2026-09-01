from scripts.update_cmed import decide


def test_nao_faz_nada_quando_a_edicao_e_a_mesma():
    assert decide("11/08/2026", "11/08/2026") is False


def test_age_quando_ha_edicao_mais_recente():
    assert decide("10/06/2026", "11/08/2026") is True


def test_ignora_edicao_mais_antiga_que_a_vigente():
    assert decide("11/08/2026", "10/06/2026") is False


def test_age_quando_nao_ha_edicao_vigente():
    assert decide("", "11/08/2026") is True
