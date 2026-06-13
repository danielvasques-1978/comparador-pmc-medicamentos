from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path

from pypdf import PdfReader


MONEY_RE = re.compile(r"\d{1,9},\d{2}")
PRICE_TAIL_RE = re.compile(r"(?:\d{1,9},\d{2}\s*){4,}$")
SKIP_RE = re.compile(
    r"^(ICMS|PF|PMC|X|LISTAGEM|COMUNICADO|RESOLUÇÃO|DIÁRIO|PUBLICADO|ART\.|PARÁGRAFO|SR\. FARMACÊUTICO)",
    re.IGNORECASE,
)
KNOWN_LABS = [
    "PRATI DONADUZZI",
    "SANOFI MEDLEY",
    "TEUTO BRAS.",
    "NOVA QUÍMICA",
    "NOVA QUIMICA",
    "NEO QUÍMICA",
    "NEO QUIMICA",
    "UNIÃO QUÍMICA",
    "UNIAO QUIMICA",
    "GEN.GERMED GENÉRIC.GERMED",
    "GEN.GERMED GENERIC.GERMED",
    "GEN.LEGRAND GENÉRIC.LEGRAND",
    "GEN.LEGRAND GENERIC.LEGRAND",
    "ZYDUS NIKKHO",
    "DR. REDDY’S",
    "DR REDDYS",
    "GLAXOSMITHKLINE",
    "NOVO NORDISK",
    "MANTECORP FSA",
    "BIOLAB SANUS",
    "SIGMA PHARMA",
    "ASTRAZENECA",
    "EUROFARMA",
    "GERMED",
    "LEGRAND",
    "CRISTÁLIA",
    "CRISTALIA",
    "ACHÉ",
    "ACHE",
    "CIMED",
    "GEOLAB",
    "ALTHAIA",
    "ABBOTT",
    "NOVARTIS",
    "PFIZER",
    "BLAU",
    "LIBBS",
    "APSEN",
    "GLOBO",
    "MULTILAB",
    "MERCK",
    "SANDOZ",
    "VIATRIS",
    "AUROBINDO",
    "TORRENT",
    "ACCORD",
    "RANBAXY",
    "MEDLEY",
    "EMS",
    "MSD",
    "FQM",
    "ABL",
    "TEVA",
]


@dataclass
class Medicine:
    id: str
    name: str
    activeIngredient: str
    laboratory: str
    kind: str
    presentation: str
    pmc: dict[str, float]
    sourcePage: int
    source: str
    tableDate: str


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("|", " ")).strip()


def strip_marker(value: str) -> str:
    cleaned = normalize_spaces(value)
    cleaned = re.sub(r"^(?:l|ä|ã|Al|Cl)\s*", "", cleaned).strip()
    return cleaned


def is_mostly_upper(value: str) -> bool:
    letters = [ch for ch in value if ch.isalpha()]
    if len(letters) < 3:
        return False
    return sum(1 for ch in letters if ch.upper() == ch) / len(letters) > 0.75


def has_known_lab_suffix(value: str) -> bool:
    upper = strip_marker(value).upper()
    return any(upper.endswith(lab) for lab in KNOWN_LABS)


def parse_money(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def infer_kind(header: str, presentation: str) -> str:
    text = f"{header} {presentation}".upper()
    if "GENÉRIC" in text or "GENERIC" in text or re.search(r"\bGEN\b", text):
        return "Genérico"
    if "REF" in text:
        return "Referência"
    return "Similar"


def infer_lab(header: str) -> str:
    cleaned = strip_marker(header)
    words = cleaned.split()
    if len(words) <= 2:
        return words[-1] if words else "Não informado"

    upper = cleaned.upper()
    for lab in KNOWN_LABS:
        if upper.endswith(lab):
            return cleaned[-len(lab) :]

    if len(words) >= 2 and words[-1] == words[-2]:
        return words[-1]
    return " ".join(words[-2:])


def infer_name(header: str, lab: str) -> str:
    cleaned = strip_marker(header)
    if cleaned.endswith(lab):
        name = cleaned[: -len(lab)].strip()
        return name or cleaned
    return cleaned


def read_lines(pdf_path: Path) -> list[tuple[int, str]]:
    reader = PdfReader(str(pdf_path))
    lines: list[tuple[int, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        if index < 8 or index > 208:
            continue
        text = page.extract_text() or ""
        for raw in text.splitlines():
            line = normalize_spaces(raw)
            if line:
                lines.append((index, line))
    return lines


def extract(pdf_path: Path) -> list[Medicine]:
    current_header = ""
    current_active = ""
    pending: list[str] = []
    records: list[Medicine] = []

    for page, line in read_lines(pdf_path):
        if SKIP_RE.match(line):
            continue

        money = MONEY_RE.findall(line)
        has_price_tail = bool(PRICE_TAIL_RE.search(line))

        if not has_price_tail:
            if pending:
                pending.append(line)
                joined = normalize_spaces(" ".join(pending))
                if PRICE_TAIL_RE.search(joined):
                    line = joined
                    pending = []
                else:
                    continue
            elif is_mostly_upper(line) and not any(ch.isdigit() for ch in line) and has_known_lab_suffix(line):
                current_header = strip_marker(line)
                current_active = ""
                continue
            elif line.endswith(".") and is_mostly_upper(line):
                current_active = strip_marker(line.rstrip("."))
                continue
            elif is_mostly_upper(line) and not any(ch.isdigit() for ch in line):
                current_header = strip_marker(line)
                current_active = ""
                continue
            else:
                pending = [line]
                continue

        money = MONEY_RE.findall(line)
        if len(money) < 8 or not current_header:
            pending = []
            continue

        price_start = line.rfind(money[-8])
        presentation = normalize_spaces(line[:price_start])
        values = [parse_money(item) for item in money[-8:]]
        pmc = {
            "20": values[1],
            "18": values[3],
            "17": values[5],
            "12": values[7],
        }
        lab = infer_lab(current_header)
        name = infer_name(current_header, lab)
        active = current_active or name
        identifier = slug(f"{name}-{lab}-{presentation}-{page}")[:96]
        records.append(
            Medicine(
                id=identifier,
                name=name,
                activeIngredient=active,
                laboratory=lab,
                kind=infer_kind(current_header, presentation),
                presentation=presentation,
                pmc=pmc,
                sourcePage=page,
                source="Suplemento Kairos 451",
                tableDate="Junho/2026",
            )
        )
        pending = []

    deduped: dict[str, Medicine] = {}
    for record in records:
        deduped[record.id] = record
    return list(deduped.values())


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_kairos_pdf.py <input.pdf> <output.json>")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    medicines = extract(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps([asdict(item) for item in medicines], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Extracted {len(medicines)} records to {output_path}")


if __name__ == "__main__":
    main()
