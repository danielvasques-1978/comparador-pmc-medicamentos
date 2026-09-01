import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(path: Path) -> dict:
    result = subprocess.run(
        ["node", "scripts/validate_critical_medicines.mjs", str(path), "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def med(name, ingredient):
    return {
        "id": name,
        "name": name,
        "activeIngredient": ingredient,
        "laboratory": "ACME S.A.",
        "kind": "Genérico",
        "presentation": "1 MG",
        "pmc": {"18": 10.0},
        "sourcePage": 0,
        "source": "CMED/Anvisa",
        "tableDate": "11/08/2026",
    }


def test_reconhece_critico_presente(tmp_path):
    path = tmp_path / "base.json"
    path.write_text(json.dumps([med("CLONAZEPAM", "CLONAZEPAM")]), encoding="utf-8")

    report = run(path)

    assert "Clonazepam" not in report["absent"]


def test_lista_criticos_ausentes(tmp_path):
    path = tmp_path / "base.json"
    path.write_text(json.dumps([med("DIPIRONA", "DIPIRONA MONOIDRATADA")]), encoding="utf-8")

    report = run(path)

    assert "Clonazepam" in report["absent"]
    assert report["ok"] == 0


def test_default_path_independe_do_cwd(tmp_path):
    script = ROOT / "scripts" / "validate_critical_medicines.mjs"

    result = subprocess.run(
        ["node", str(script), "--json"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["ok"] > 0
