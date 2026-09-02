from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from scripts.cmed_limits import (
    MAX_CRITICAL_LOSSES,
    MAX_PF_SEM_HOSPITALAR,
    MAX_PRICE_VARIATION,
    MIN_EAN_COVERAGE,
    VOLUME_MAX_RATIO,
    VOLUME_MIN_RATIO,
)


@dataclass(frozen=True)
class Failure:
    name: str
    detail: str


def _parse(date_text: str) -> datetime | None:
    try:
        return datetime.strptime(date_text, "%d/%m/%Y")
    except (ValueError, TypeError):
        return None


def _check_edition(report: dict) -> Failure | None:
    current = _parse(report.get("currentTableDate", ""))
    candidate = _parse(report.get("candidateTableDate", ""))
    if candidate is None:
        return Failure("edicao", "Data da edição candidata não pôde ser interpretada.")
    if current is not None and candidate <= current:
        return Failure(
            "edicao",
            f"A edição candidata ({report['candidateTableDate']}) não é mais recente "
            f"que a vigente ({report['currentTableDate']}).",
        )
    return None


def _check_volume(report: dict) -> Failure | None:
    ratio = report["volumeRatio"]
    if VOLUME_MIN_RATIO <= ratio <= VOLUME_MAX_RATIO:
        return None

    # Determine which records list to sample from
    if ratio < VOLUME_MIN_RATIO:
        records_list = report.get("left", [])
        action_word = "saíram"
    else:
        records_list = report.get("entered", [])
        action_word = "entraram"

    # Sample records and format them defensively
    sample_size = min(10, len(records_list))
    sample = records_list[:sample_size]
    sample_parts = []
    for record in sample:
        # Defensive reading: skip records missing required keys
        name = record.get("name", "")
        presentation = record.get("presentation", "")
        if name or presentation:
            sample_parts.append(f"{name} ({presentation})" if name and presentation else (name or presentation))
    sample_text = "; ".join(sample_parts)

    total_count = len(records_list)
    detail = (
        f"Total de apresentações variou {ratio:.1%} "
        f"({report['currentCount']} para {report['candidateCount']}), fora da faixa "
        f"de {VOLUME_MIN_RATIO:.0%} a {VOLUME_MAX_RATIO:.0%}. "
        f"{total_count} {action_word}"
    )

    if sample_text:
        detail += f", entre elas: {sample_text}"

    detail += "."

    return Failure("volume", detail)


def _check_price(report: dict) -> Failure | None:
    if report["maxPriceVariation"] <= MAX_PRICE_VARIATION:
        return None
    offenders = [
        f"{item['name']} ({item['before']:.2f} para {item['after']:.2f}, {item['variation']:+.1%})"
        for item in report["priceChanges"]
        if abs(item["variation"]) > MAX_PRICE_VARIATION
    ]
    # Report count found in the sample and clarify it's among largest variations
    sample_text = "; ".join(offenders[:10])
    detail = (
        f"Entre as maiores variações de preço, {len(offenders)} apresentação(ões) variaram acima de {MAX_PRICE_VARIATION:.0%} "
        f"(para cima ou para baixo): " + sample_text
    )
    return Failure("preco", detail)


def _check_ean(report: dict) -> Failure | None:
    if report["eanCoverage"] >= MIN_EAN_COVERAGE:
        return None
    return Failure(
        "ean",
        f"Apenas {report['eanCoverage']:.1%} das linhas trazem EAN 1, "
        f"abaixo do mínimo de {MIN_EAN_COVERAGE:.0%}.",
    )


def _check_criticals(before: dict, after: dict) -> Failure | None:
    lost = sorted(set(after.get("absent", [])) - set(before.get("absent", [])))
    if len(lost) <= MAX_CRITICAL_LOSSES:
        return None
    return Failure(
        "criticos",
        f"{len(lost)} princípios ativos críticos sumiram nesta edição, acima do "
        f"tolerado de {MAX_CRITICAL_LOSSES}: " + ", ".join(lost[:15]),
    )


def _check_hospitalar(report: dict) -> Failure | None:
    offenders = report["pfSemHospitalar"]
    if len(offenders) <= MAX_PF_SEM_HOSPITALAR:
        return None
    nomes = "; ".join(f"{item.get('name', '')} ({item.get('presentation', '')})" for item in offenders[:10])
    return Failure(
        "hospitalar",
        f"{len(offenders)} apresentação(ões) sem PMC não têm restrição hospitalar, "
        f"o que contradiz o aviso exibido para esse grupo: {nomes}",
    )


def run_checks(report: dict, criticals_before: dict, criticals_after: dict) -> list[Failure]:
    candidates = [
        _check_edition(report),
        _check_volume(report),
        _check_price(report),
        _check_ean(report),
        _check_criticals(criticals_before, criticals_after),
        _check_hospitalar(report),
    ]
    return [failure for failure in candidates if failure is not None]


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Uso: python -m scripts.check_cmed <relatorio.json> <criticos_antes.json> <criticos_depois.json>")

    report = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    before = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    after = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))

    failures = run_checks(report, before, after)
    for failure in failures:
        print(f"[{failure.name}] {failure.detail}", file=sys.stderr)

    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
