from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import requests

BASE_URL = "https://www.gov.br"
PRICES_PAGE_URL = "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos"

# O sufixo "site" é o PMC; "gov" é o PMVG, que não interessa aqui.
LINK_PATTERN = re.compile(
    r"href=[\"']([^\"']*xls_conformidade_site_(\d{8})_\d+\.xlsx[^\"']*)[\"']",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Edition:
    url: str
    published: str
    filename: str


def find_edition(html: str) -> Edition:
    matches = LINK_PATTERN.findall(html)
    if not matches:
        raise ValueError(
            "Nenhum link no padrão xls_conformidade_site_<data>_<seq>.xlsx foi "
            "encontrado na página da Anvisa. O layout pode ter mudado."
        )

    href, stamp = max(matches, key=lambda item: item[1])
    url = href if href.startswith("http") else f"{BASE_URL}{href}"
    filename = re.search(r"(xls_conformidade_site_\d{8}_\d+\.xlsx)", href).group(1)
    published = f"{stamp[6:8]}/{stamp[4:6]}/{stamp[0:4]}"
    return Edition(url=url, published=published, filename=filename)


def fetch_page(url: str = PRICES_PAGE_URL) -> str:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def download(url: str, destination: Path) -> Path:
    response = requests.get(url, timeout=600, stream=True)
    response.raise_for_status()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1 << 16):
            handle.write(chunk)
    return destination


def main() -> None:
    edition = find_edition(fetch_page())
    print(f"{edition.published} {edition.url}")
    if len(sys.argv) == 2:
        download(edition.url, Path(sys.argv[1]))


if __name__ == "__main__":
    main()
