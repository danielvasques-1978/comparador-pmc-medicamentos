from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path


PATCH_RATES = ["17", "18", "20"]
STOP_SUBSTANCE_TOKENS = {
    "de",
    "do",
    "da",
    "das",
    "dos",
    "e",
    "a",
    "o",
    "acido",
    "cloridrato",
    "bromidrato",
    "maleato",
    "citrato",
    "hemihidratado",
    "hemi",
    "hidratado",
    "sodico",
    "sodica",
}
STOP_LAB_TOKENS = {
    "sa",
    "s",
    "a",
    "ltda",
    "industria",
    "industrias",
    "farmaceutica",
    "farmaceuticas",
    "quimica",
    "laboratorio",
    "laboratorios",
    "brasil",
    "brasileiro",
    "nacional",
}
PRESENTATION_SYNONYMS = {
    "comp": "com",
    "caps": "cap",
    "capsula": "cap",
    "capsulas": "cap",
    "comprimido": "com",
    "comprimidos": "com",
    "rev": "rev",
    "revestido": "rev",
    "revestidos": "rev",
    "solucao": "sol",
    "sol": "sol",
    "got": "got",
    "gotas": "got",
    "frasco": "fr",
    "fr": "fr",
    "ampola": "amp",
    "ampolas": "amp",
    "amp": "amp",
    "envelope": "env",
    "envelopes": "env",
    "envl": "env",
    "env": "env",
    "creme": "crem",
    "crem": "crem",
    "gel": "gel",
}


def normalize(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", ascii_value.lower())).strip()


def money_equal(a: object, b: object) -> bool:
    if a is None or b is None:
        return False
    return round(float(a), 2) == round(float(b), 2)


def substance_tokens(value: object) -> set[str]:
    return {
        token
        for token in normalize(value).split()
        if len(token) >= 4 and token not in STOP_SUBSTANCE_TOKENS
    }


def lab_tokens(value: object) -> set[str]:
    return {
        token
        for token in normalize(value).split()
        if len(token) >= 3 and token not in STOP_LAB_TOKENS
    }


def presentation_tokens(value: object) -> set[str]:
    normalized = normalize(str(value).replace(",", "."))
    tokens: set[str] = set()
    compact_units = re.findall(r"\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|ui|%)", normalized)
    for token in compact_units:
        tokens.add(re.sub(r"\s+", "", token))
    for raw in normalized.split():
        token = PRESENTATION_SYNONYMS.get(raw, raw)
        if token in PRESENTATION_SYNONYMS.values():
            tokens.add(token)
    quantities = re.findall(r"(?:x|c)\s*(\d+)\b", normalized)
    for quantity in quantities:
        tokens.add(f"x{quantity}")
    return tokens


def compatible_identity(cmed: dict[str, object], kairos: dict[str, object]) -> bool:
    cmed_lab = lab_tokens(cmed.get("laboratory"))
    kairos_lab = lab_tokens(kairos.get("laboratory"))
    if cmed_lab and kairos_lab and not (cmed_lab & kairos_lab):
        return False

    cmed_substance = substance_tokens(cmed.get("activeIngredient"))
    kairos_substance = substance_tokens(kairos.get("activeIngredient"))
    if cmed_substance and kairos_substance and not (cmed_substance & kairos_substance):
        return False

    cmed_name = normalize(cmed.get("name"))
    kairos_name = normalize(kairos.get("name"))
    if cmed_name == kairos_name or cmed_name in kairos_name or kairos_name in cmed_name:
        return True

    return bool(cmed_substance and kairos_substance and cmed_substance & kairos_substance)


def compatible_presentation(cmed: dict[str, object], kairos: dict[str, object]) -> bool:
    cmed_tokens = presentation_tokens(cmed.get("presentation"))
    kairos_tokens = presentation_tokens(kairos.get("presentation"))
    if not cmed_tokens or not kairos_tokens:
        return False
    shared = cmed_tokens & kairos_tokens
    shared_dose = any(re.search(r"(mg|mcg|g|ml|ui|%)$", token) for token in shared)
    shared_quantity = any(token.startswith("x") for token in shared)
    shared_form = bool(shared & set(PRESENTATION_SYNONYMS.values()))
    return shared_dose and shared_quantity and shared_form


def same_kairos_row(old: dict[str, object], new: dict[str, object]) -> bool:
    fields = ["name", "laboratory", "presentation"]
    return all(normalize(old.get(field)) == normalize(new.get(field)) for field in fields)


def changed_prices(old: dict[str, object], new: dict[str, object]) -> bool:
    old_pmc = old.get("pmc") or {}
    new_pmc = new.get("pmc") or {}
    return any(
        rate in old_pmc
        and rate in new_pmc
        and not money_equal(old_pmc.get(rate), new_pmc.get(rate))
        for rate in PATCH_RATES
    )


def has_review_risk(row: dict[str, object], old: dict[str, object], new: dict[str, object]) -> bool:
    presentation = str(new.get("presentation") or "")
    if len(presentation) < 8 or re.fullmatch(r"[\d\s]+", presentation):
        return True
    old_pmc = old.get("pmc") or {}
    new_pmc = new.get("pmc") or {}
    for rate in PATCH_RATES:
        old_price = old_pmc.get(rate)
        new_price = new_pmc.get(rate)
        if old_price and new_price:
            pct = abs((float(new_price) - float(old_price)) / float(old_price) * 100)
            if pct > 20:
                return True
    return False


def build_kairos_changes(old_rows: list[dict[str, object]], new_rows: list[dict[str, object]]) -> list[tuple[dict[str, object], dict[str, object]]]:
    old_by_key = {
        (normalize(row["name"]), normalize(row["laboratory"]), normalize(row["presentation"])): row
        for row in old_rows
    }
    changes: list[tuple[dict[str, object], dict[str, object]]] = []
    for new in new_rows:
        key = (normalize(new["name"]), normalize(new["laboratory"]), normalize(new["presentation"]))
        old = old_by_key.get(key)
        if not old or not same_kairos_row(old, new):
            continue
        if changed_prices(old, new) and not has_review_risk(new, old, new):
            changes.append((old, new))
    return changes


def find_cmed_match(cmed_rows: list[dict[str, object]], old: dict[str, object], new: dict[str, object]) -> list[dict[str, object]]:
    old_pmc = old.get("pmc") or {}
    old_prices = {rate: old_pmc.get(rate) for rate in PATCH_RATES if old_pmc.get(rate) is not None}
    if len(old_prices) < 2:
        return []

    name = normalize(new.get("name"))
    new_substance_tokens = substance_tokens(new.get("activeIngredient"))
    same_name_candidates = []
    price_substance_candidates = []
    for row in cmed_rows:
        pmc = row.get("pmc") or {}
        matching_rates = sum(money_equal(pmc.get(rate), price) for rate, price in old_prices.items())
        if matching_rates < 2:
            continue
        if normalize(row.get("name")) == name:
            same_name_candidates.append(row)
            continue
        if matching_rates >= 3:
            row_substance_tokens = substance_tokens(row.get("activeIngredient"))
            if new_substance_tokens and row_substance_tokens and new_substance_tokens & row_substance_tokens:
                price_substance_candidates.append(row)
    if same_name_candidates:
        return same_name_candidates
    return price_substance_candidates


def apply_overlay(cmed_rows: list[dict[str, object]], changes: list[tuple[dict[str, object], dict[str, object]]]) -> dict[str, object]:
    patched: list[dict[str, object]] = []
    already_current: list[dict[str, object]] = []
    skipped: list[dict[str, object]] = []

    for old, new in changes:
        matches = find_cmed_match(cmed_rows, old, new)
        if len(matches) != 1:
            skipped.append(
                {
                    "name": new.get("name"),
                    "laboratory": new.get("laboratory"),
                    "presentation": new.get("presentation"),
                    "reason": f"{len(matches)} candidatos CMED",
                }
            )
            continue

        row = matches[0]
        pmc = dict(row.get("pmc") or {})
        new_pmc = new.get("pmc") or {}
        if all(money_equal(pmc.get(rate), new_pmc.get(rate)) for rate in PATCH_RATES if new_pmc.get(rate) is not None):
            already_current.append(row)
            continue

        for rate in PATCH_RATES:
            if new_pmc.get(rate) is not None:
                pmc[rate] = round(float(new_pmc[rate]), 2)
        row["pmc"] = pmc
        row["source"] = "CMED/Anvisa + Suplemento Kairos 452"
        row["tableDate"] = "CMED 10/06/2026; Kairos Julho/2026"
        patched.append(
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "activeIngredient": row.get("activeIngredient"),
                "laboratory": row.get("laboratory"),
                "presentation": row.get("presentation"),
                "pmc": {rate: pmc.get(rate) for rate in PATCH_RATES},
            }
        )

    return {"patched": patched, "alreadyCurrent": already_current, "skipped": skipped}


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            "Uso: python scripts/apply_kairos_overlay.py <cmed.json> <kairos451.json> <kairos452.json> <relatorio.json>"
        )

    cmed_path = Path(sys.argv[1])
    old_path = Path(sys.argv[2])
    new_path = Path(sys.argv[3])
    report_path = Path(sys.argv[4])

    cmed_rows = json.loads(cmed_path.read_text(encoding="utf-8"))
    old_rows = json.loads(old_path.read_text(encoding="utf-8"))
    new_rows = json.loads(new_path.read_text(encoding="utf-8"))

    changes = build_kairos_changes(old_rows, new_rows)
    result = apply_overlay(cmed_rows, changes)

    cmed_path.write_text(json.dumps(cmed_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                "kairosChangesConsidered": len(changes),
                "patchedCount": len(result["patched"]),
                "alreadyCurrentCount": len(result["alreadyCurrent"]),
                "skippedCount": len(result["skipped"]),
                **result,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"Kairos changes considered: {len(changes)}; patched: {len(result['patched'])}; "
        f"already current: {len(result['alreadyCurrent'])}; skipped: {len(result['skipped'])}"
    )


if __name__ == "__main__":
    main()
