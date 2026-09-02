from __future__ import annotations

import json
import sys
from pathlib import Path

MAX_LISTED_CHANGES = 50


def _identify(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "name": item.get("name", ""),
        "presentation": item.get("presentation", ""),
    }


def _table_date(rows: list[dict]) -> str:
    return rows[0].get("tableDate", "") if rows else ""


def _pmc18(item: dict) -> float | None:
    value = (item.get("pmc") or {}).get("18")
    return value if isinstance(value, (int, float)) else None


def build_report(current: list[dict], candidate: list[dict]) -> dict:
    before = {item["id"]: item for item in current}
    after = {item["id"]: item for item in candidate}

    entered = [_identify(after[key]) for key in sorted(set(after) - set(before))]
    left = [_identify(before[key]) for key in sorted(set(before) - set(after))]

    changes = []
    for key in sorted(set(before) & set(after)):
        old_price = _pmc18(before[key])
        new_price = _pmc18(after[key])
        if not old_price or new_price is None:
            continue
        variation = (new_price - old_price) / old_price
        if abs(variation) < 0.0001:
            continue
        changes.append(
            {
                "id": key,
                "name": after[key].get("name", ""),
                "before": old_price,
                "after": new_price,
                "variation": variation,
            }
        )

    changes.sort(key=lambda item: abs(item["variation"]), reverse=True)
    with_ean = sum(1 for item in candidate if item.get("ean1"))

    sem_hospitalar = [
        _identify(item)
        for item in candidate
        if not any(
            value is not None for value in (item.get("pmc") or {}).values()
        )
        and not item.get("hospitalRestricted")
    ]

    return {
        "currentTableDate": _table_date(current),
        "candidateTableDate": _table_date(candidate),
        "currentCount": len(current),
        "candidateCount": len(candidate),
        "volumeRatio": (len(candidate) - len(current)) / len(current) if current else 0.0,
        "eanCoverage": with_ean / len(candidate) if candidate else 0.0,
        "entered": entered,
        "left": left,
        "priceChanges": changes[:MAX_LISTED_CHANGES],
        "maxPriceVariation": abs(changes[0]["variation"]) if changes else 0.0,
        "pfSemHospitalar": sem_hospitalar,
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: python scripts/diff_cmed.py <atual.json> <candidato.json> <relatorio.json>")

    current = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    candidate = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    report = build_report(current, candidate)
    Path(sys.argv[3]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"{len(report['entered'])} entradas, {len(report['left'])} saídas, "
        f"variação máxima de {report['maxPriceVariation']:.1%}."
    )


if __name__ == "__main__":
    main()
