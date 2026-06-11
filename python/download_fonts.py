"""Descarga las fuentes VARIABLES editoriales (OFL) desde el repo oficial de
Google Fonts (raw.githubusercontent.com — sin API key) a remotion/public/fonts/.

Los nombres originales traen brackets ("Fraunces[SOFT,WONK,opsz,wght].ttf") que
PowerShell trata como wildcards y staticFile() no quiere — se guardan con
nombre plano. Idempotente: si el archivo ya existe con tamaño > 0, lo salta.

Uso:  python download_fonts.py
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# (carpeta, archivo original, nombre local plano)
FONTS = [
    ("fraunces", "Fraunces[SOFT,WONK,opsz,wght].ttf", "fraunces-var.ttf"),
    ("fraunces", "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf", "fraunces-italic-var.ttf"),
    ("bodonimoda", "BodoniModa[opsz,wght].ttf", "bodonimoda-var.ttf"),
    ("bodonimoda", "BodoniModa-Italic[opsz,wght].ttf", "bodonimoda-italic-var.ttf"),
    ("robotoserif", "RobotoSerif[GRAD,opsz,wdth,wght].ttf", "robotoserif-var.ttf"),
    ("bricolagegrotesque", "BricolageGrotesque[opsz,wdth,wght].ttf", "bricolage-var.ttf"),
    ("newsreader", "Newsreader[opsz,wght].ttf", "newsreader-var.ttf"),
    ("newsreader", "Newsreader-Italic[opsz,wght].ttf", "newsreader-italic-var.ttf"),
]

OUT_DIR = Path(__file__).resolve().parent.parent / "remotion" / "public" / "fonts"


def quote(name: str) -> str:
    return name.replace("[", "%5B").replace("]", "%5D").replace(",", "%2C")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    for folder, original, local in FONTS:
        dest = OUT_DIR / local
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"ya existe: {local}")
            ok += 1
            continue
        url = f"{BASE}/{folder}/{quote(original)}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "estrategia-viral-fonts/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
                f.write(r.read())
            kb = dest.stat().st_size // 1024
            print(f"descargada: {local} ({kb} KB)")
            ok += 1
        except Exception as e:  # noqa: BLE001 — reportar y seguir con las demás
            print(f"ERROR {local}: {e}", file=sys.stderr)
            if dest.exists():
                dest.unlink()
    print(f"{ok}/{len(FONTS)} fuentes listas en {OUT_DIR}")
    return 0 if ok == len(FONTS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
