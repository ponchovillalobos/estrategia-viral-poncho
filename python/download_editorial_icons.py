"""Descarga los packs de iconos editoriales (MIT, sin API key) a
{DATA_ROOT}/assets/icons/:

  - Phosphor duotone (~1,512 SVG, 2 capas con opacity 0.2 → look premium dorado)
    desde el zip del repo phosphor-icons/core.
  - Tabler outline (~5,000 SVG stroke=currentColor, line-art)
    desde el zip del repo tabler/tabler-icons.

Un solo zip por repo (no 6,600 fetches). Idempotente: si la carpeta destino ya
tiene > N archivos, se salta. Los SVG usan currentColor → el render los pinta
con el acento del tema sin tocar el archivo.

Uso:  python download_editorial_icons.py
"""

from __future__ import annotations

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

from config import DATA_ROOT  # type: ignore

ICONS_DIR = Path(DATA_ROOT) / "assets" / "icons"

PACKS = [
    {
        "name": "phosphor-duotone",
        "zip": "https://github.com/phosphor-icons/core/archive/refs/heads/main.zip",
        "inner": "assets/duotone/",
        "min_expected": 1400,
    },
    {
        "name": "tabler",
        "zip": "https://github.com/tabler/tabler-icons/archive/refs/heads/main.zip",
        "inner": "icons/outline/",
        "min_expected": 4500,
    },
]


def download_pack(pack: dict) -> int:
    dest = ICONS_DIR / pack["name"]
    if dest.exists() and len(list(dest.glob("*.svg"))) >= pack["min_expected"]:
        n = len(list(dest.glob("*.svg")))
        print(f"ya existe: {pack['name']} ({n} SVG)")
        return n
    dest.mkdir(parents=True, exist_ok=True)
    print(f"bajando {pack['zip']} …", flush=True)
    req = urllib.request.Request(pack["zip"], headers={"User-Agent": "estrategia-viral-icons/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r:
        data = r.read()
    print(f"  zip: {len(data) // 1024 // 1024} MB — extrayendo {pack['inner']}", flush=True)
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            # El zip de GitHub mete todo bajo "<repo>-main/"
            parts = info.filename.split("/", 1)
            inner = parts[1] if len(parts) == 2 else ""
            if not inner.startswith(pack["inner"]) or not inner.endswith(".svg"):
                continue
            out = dest / Path(inner).name
            with z.open(info) as f:
                out.write_bytes(f.read())
            n += 1
    print(f"  listos: {n} SVG en {dest}")
    return n


def main() -> int:
    total = 0
    ok = True
    for pack in PACKS:
        try:
            n = download_pack(pack)
            total += n
            if n < pack["min_expected"]:
                ok = False
                print(f"ADVERTENCIA: {pack['name']} trajo {n} (< {pack['min_expected']})", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"ERROR {pack['name']}: {e}", file=sys.stderr)
    print(f"TOTAL: {total} iconos")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
