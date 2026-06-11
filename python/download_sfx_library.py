"""Biblioteca GRANDE de SFX CC0 de Kenney.nl — descarga directa, SIN API key.

Kenney.nl publica packs de audio 100% CC0 (uso comercial OK, sin atribución)
con zip de descarga directa (sin cuenta). El link del zip lleva un hash que
cambia por versión, así que se scrapea de la página del asset:
  https://kenney.nl/assets/<pack>  →  href='https://kenney.nl/media/pages/assets/<pack>/<hash>/kenney_<pack>.zip'
(verificado con fetch real 2026-06-11 para los 4 packs de abajo).

Packs:
  - interface-sounds (100 sonidos UI: clicks, confirms, errors, pops)
  - ui-audio        (50 sonidos UI/menú: clicks, switches, rollovers)
  - impact-sounds   (impactos: golpes madera/metal/vidrio, punches)
  - digital-audio   (retro/digital: beeps, powerups, lasers, glitch)

Los .ogg se extraen FLAT a {SFX_BASE}/github/ (carpeta que ya sirve
/api/sfx/stream — cero cambios de rutas) con prefijo `kenney-<pack>-`.
Manifest: {SFX_BASE}/manifest_sfx_library.json (DATA_ROOT, no va al repo).

Uso:
  python download_sfx_library.py download --out-dir <...>\assets\sfx\github
  python download_sfx_library.py download --out-dir <dir> --per-pack 40
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

PACKS = ["interface-sounds", "ui-audio", "impact-sounds", "digital-audio"]
ASSET_PAGE = "https://kenney.nl/assets/{pack}"
ZIP_RE = re.compile(r"href='(https://kenney\.nl/media/pages/assets/[^']+\.zip)'")
AUDIO_EXTS = (".ogg", ".mp3", ".wav")


def _fetch(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def find_zip_url(pack: str) -> str:
    html = _fetch(ASSET_PAGE.format(pack=pack), timeout=30).decode("utf-8", errors="replace")
    m = ZIP_RE.search(html)
    if not m:
        raise RuntimeError(f"no se encontró link .zip en la página de {pack}")
    return m.group(1)


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data
    except Exception:
        pass
    return {"items": []}


def download(out_dir: Path, per_pack: int | None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir.parent / "manifest_sfx_library.json"
    manifest = load_manifest(manifest_path)
    known = {it.get("filename") for it in manifest["items"]}

    extracted = skipped = 0
    failed: list[str] = []

    for pack in PACKS:
        try:
            zip_url = find_zip_url(pack)
            print(f"[sfx-lib] {pack}: {zip_url}", file=sys.stderr)
            blob = _fetch(zip_url)
            zf = zipfile.ZipFile(io.BytesIO(blob))
        except Exception as e:
            print(f"[sfx-lib] fail pack {pack}: {e}", file=sys.stderr)
            failed.append(pack)
            continue

        names = [n for n in zf.namelist()
                 if n.lower().endswith(AUDIO_EXTS) and not n.endswith("/")]
        names.sort()
        if per_pack:
            names = names[:per_pack]
        for n in names:
            base = Path(n).name
            fname = f"kenney-{pack}-{base}".lower().replace(" ", "-")
            dest = out_dir / fname
            if dest.exists():
                skipped += 1
                continue
            try:
                dest.write_bytes(zf.read(n))
                extracted += 1
            except Exception as e:
                print(f"[sfx-lib] fail {n}: {e}", file=sys.stderr)
                continue
            if fname not in known:
                manifest["items"].append({
                    "filename": fname,
                    "pack": pack,
                    "license": "CC0 / Public Domain",
                    "source": f"kenney.nl/assets/{pack}",
                    "attribution": None,  # CC0: no requiere atribución
                })
                known.add(fname)
        print(f"[sfx-lib] {pack}: {len(names)} audio files procesados", file=sys.stderr)
        time.sleep(0.5)

    manifest["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return {
        "ok": True,
        "out_dir": str(out_dir),
        "extracted": extracted,
        "skipped": skipped,
        "failed_packs": failed,
        "manifest": str(manifest_path),
        "manifest_items": len(manifest["items"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("download")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--per-pack", type=int, default=None, help="máx de archivos por pack")
    args = parser.parse_args()

    if args.cmd == "download":
        try:
            print(json.dumps(download(Path(args.out_dir), args.per_pack), ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
