from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from scripts.check_cmed import run_checks
from scripts.diff_cmed import build_report
from scripts.fetch_cmed import download, fetch_page, find_edition
from scripts.import_cmed_xlsx import import_cmed

ROOT = Path(__file__).resolve().parents[1]
CURRENT_JSON = ROOT / "src" / "data" / "medicines.json"


def _parse(date_text: str) -> datetime | None:
    try:
        return datetime.strptime(date_text, "%d/%m/%Y")
    except (ValueError, TypeError):
        return None


def decide(current_table_date: str, edition_published: str) -> bool:
    published = _parse(edition_published)
    if published is None:
        return False
    current = _parse(current_table_date)
    return current is None or published > current


def run_critical(path: Path) -> dict:
    result = subprocess.run(
        ["node", "scripts/validate_critical_medicines.mjs", str(path), "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(result.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza a base CMED a partir do portal da Anvisa.")
    parser.add_argument("--xlsx", type=Path, help="usa um arquivo local em vez de baixar")
    parser.add_argument("--skip-neon", action="store_true", help="não escreve no banco")
    parser.add_argument("--force", action="store_true", help="processa mesmo sem edição nova")
    args = parser.parse_args()

    current_json_text = CURRENT_JSON.read_text(encoding="utf-8")
    current = json.loads(current_json_text)
    current_table_date = current[0].get("tableDate", "") if current else ""

    with tempfile.TemporaryDirectory() as workdir:
        work = Path(workdir)

        if args.xlsx:
            xlsx_path, published, source_url = args.xlsx, "", str(args.xlsx)
        else:
            edition = find_edition(fetch_page())
            published, source_url = edition.published, edition.url
            if not args.force and not decide(current_table_date, published):
                print(f"Edição {published} já está aplicada. Nada a fazer.")
                return 0
            xlsx_path = download(edition.url, work / edition.filename)

        candidate = import_cmed(xlsx_path)
        candidate_json = work / "candidate.json"
        candidate_json.write_text(
            json.dumps(candidate, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

        report = build_report(current, candidate)
        failures = run_checks(report, run_critical(CURRENT_JSON), run_critical(candidate_json))

        report["failures"] = [{"name": item.name, "detail": item.detail} for item in failures]
        report["sourceUrl"] = source_url

        if failures:
            for failure in failures:
                print(f"[{failure.name}] {failure.detail}", file=sys.stderr)
            record_blocked(report)
            return 1

        CURRENT_JSON.write_text(
            json.dumps(candidate, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        print(
            f"Edição {report['candidateTableDate']} aplicada: "
            f"{len(report['entered'])} entradas, {len(report['left'])} saídas."
        )

        if not args.skip_neon:
            try:
                subprocess.run(["node", "scripts/seed_neon_medicines.mjs"], cwd=ROOT, check=True)
            except subprocess.CalledProcessError:
                # The JSON write above must happen before seeding (the seed
                # script reads that file), but that means a failed seed would
                # otherwise leave medicines.json already replaced while Neon
                # still has the old edition — the two sources of truth would
                # disagree. Restore the previous contents so the tree matches
                # what is actually in the database, and let the caller retry.
                CURRENT_JSON.write_text(current_json_text, encoding="utf-8")
                print(
                    f"Edição {report['candidateTableDate']} revertida: a atualização do "
                    "banco Neon falhou, então medicines.json foi restaurado para a edição "
                    f"anterior ({current_table_date or 'nenhuma'}).",
                    file=sys.stderr,
                )
                return 1

    return 0


def record_blocked(report: dict) -> None:
    """Grava a tentativa bloqueada em price_imports, se houver banco configurado."""
    payload = json.dumps(report, ensure_ascii=False)
    result = subprocess.run(
        ["node", "scripts/record_blocked_import.mjs"],
        cwd=ROOT,
        input=payload,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print("Não foi possível registrar a tentativa bloqueada no banco.", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
