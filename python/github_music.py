"""Descarga música CC0 (dominio público) DIRECTO de GitHub — SIN API key.

Fuente: SoundSafari/CC0-1.0-Music, carpeta `freepd.com/` (música de FreePD.com,
todo CC0 / dominio público: uso comercial OK, SIN atribución requerida).

Cómo funciona sin key:
  - Se lista la carpeta una vez con la API pública de GitHub (lectura anónima, sin
    token; sólo para obtener los `download_url`).
  - Cada track se baja por su URL raw (raw.githubusercontent.com) — descarga directa,
    sin autenticación.

Bajamos un set curado por mood (upbeat, inspirador, épico, chill, dramático). Si algún
nombre ya no existe en el repo, se saltea sin romper.

Uso:
  python github_music.py download --out-dir <dir>
  python github_music.py download --out-dir <dir> --limit 30   # + relleno hasta 30
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_API = "https://api.github.com/repos/SoundSafari/CC0-1.0-Music/contents/freepd.com"

# Set curado por mood (nombres exactos del repo). Música FreePD = CC0.
CURATED = [
    # upbeat / energético
    "Energizing.mp3", "City Run.mp3", "Funky Energy Loop.mp3", "Gotta Keep On Movin.mp3",
    "Groovin.mp3", "Downtown Boogie.mp3",
    # inspirador / esperanzador
    "Hopeful.mp3", "Inspiration.mp3", "Journey of Hope.mp3", "Elevate Inspirate.mp3",
    "Infinite Wonder.mp3", "Finally See The Light.mp3",
    # épico / cinematográfico
    "Heroic Adventure.mp3", "Epic Blockbuster 2.mp3", "Apex.mp3", "Horizon Flare.mp3",
    "Adventure.mp3",
    # chill / lofi / piano
    "Be Chillin.mp3", "Kalimba Relaxation Music.mp3", "Lovely Piano Song.mp3", "Infinite Peace.mp3",
    # dramático / tensión
    "Driving Concern.mp3", "Drop Point.mp3", "Final Step.mp3",
]


def _slug(name: str) -> str:
    stem = name.rsplit(".", 1)[0]
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"freepd-{s}.mp3"


def list_folder() -> list[dict[str, Any]]:
    req = urllib.request.Request(
        REPO_API,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "ViralPoncho/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"GitHub API HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"GitHub API URL error: {e.reason}")
    if not isinstance(data, list):
        raise RuntimeError(f"respuesta inesperada de GitHub: {str(data)[:160]}")
    return data


def download_to(url: str, dest: Path, timeout: int = 90) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read()
            dest.write_bytes(payload)
            return len(payload)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt == 2:
                raise RuntimeError(f"download failed after 3 attempts: {e}")
            time.sleep(2 ** attempt)
    return 0


def download(out_dir: Path, limit: int | None = None) -> dict[str, Any]:
    files = list_folder()
    by_name = {f["name"]: f for f in files if f.get("name", "").endswith(".mp3")}

    # Orden: primero los curados (en orden), luego el resto para rellenar hasta `limit`.
    wanted = [n for n in CURATED if n in by_name]
    if limit and limit > len(wanted):
        extra = [n for n in by_name if n not in wanted]
        wanted += extra[: limit - len(wanted)]
    if limit:
        wanted = wanted[:limit]

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    failed: list[str] = []

    for name in wanted:
        hit = by_name[name]
        url = hit.get("download_url")
        if not url:
            continue
        dest = out_dir / _slug(name)
        if dest.exists():
            manifest.append({"filename": dest.name, "source_name": name, "skipped": True})
            continue
        try:
            n = download_to(url, dest)
            manifest.append({
                "filename": dest.name,
                "source_name": name,
                "bytes": n,
                "license": "CC0 / Public Domain (FreePD.com)",
                "source": "github.com/SoundSafari/CC0-1.0-Music",
            })
            print(f"[github-music] + {dest.name} ({n} bytes)", file=sys.stderr)
        except Exception as e:
            print(f"[github-music] fail {name}: {e}", file=sys.stderr)
            failed.append(name)
        time.sleep(0.3)

    (out_dir / "manifest_github_music.json").write_text(
        json.dumps({"items": manifest, "failed": failed}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "ok": True,
        "out_dir": str(out_dir),
        "downloaded": len([m for m in manifest if not m.get("skipped")]),
        "skipped": len([m for m in manifest if m.get("skipped")]),
        "failed": len(failed),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("download")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if args.cmd == "download":
        try:
            print(json.dumps(download(Path(args.out_dir), limit=args.limit), ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
