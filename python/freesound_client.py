"""Cliente para descargar música + SFX desde Freesound (https://freesound.org).

Freesound es un banco GIGANTE de audio. Filtramos a **Creative Commons 0 (CC0)**
por defecto: uso comercial OK, SIN atribución requerida — seguro para vender los
videos. (Se puede ampliar a CC-BY con --license cc-by, pero eso exige dar crédito.)

Clave: usamos los **previews MP3** (`preview-hq-mp3`, ~128kbps) que son públicos y
sólo requieren el token de API — NO hace falta OAuth2 (que sí pediría la descarga
del archivo original). Para música de fondo y efectos, la calidad del preview sobra.

API key gratis: registrate en https://freesound.org/apiv2/apply/ (toma 1 min).

Uso:
  python freesound_client.py search --key XXX --type music --q "uplifting cinematic"
  python freesound_client.py download-pack --key XXX --type music --out-dir <dir>
  python freesound_client.py download-pack --key XXX --type sfx   --out-dir <dir>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

SEARCH_URL = "https://freesound.org/apiv2/search/text/"

# Licencias aceptadas. CC0 = sin atribución (default, seguro comercial).
LICENSE_FILTERS = {
    "cc0": 'license:"Creative Commons 0"',
    "cc-by": '(license:"Creative Commons 0" OR license:"Attribution")',
}

# Packs curados: (query, cuántos, prefijo de archivo). Música = pistas largas;
# SFX = sonidos cortos (filtramos por duración).
MUSIC_PACK = [
    ("uplifting cinematic instrumental", 2, "uplifting-cinematic"),
    ("inspiring corporate background", 2, "inspiring-corporate"),
    ("lofi chill hip hop beat", 2, "lofi-chill"),
    ("epic motivational", 2, "epic-motivational"),
    ("emotional piano ambient", 2, "emotional-piano"),
    ("energetic upbeat pop", 2, "energetic-upbeat"),
    ("dark trap beat", 1, "dark-trap"),
    ("ambient drone background", 1, "ambient-drone"),
]

SFX_PACK = [
    ("whoosh transition", 3, "whoosh"),
    ("impact boom hit", 3, "impact"),
    ("swoosh fast", 2, "swoosh"),
    ("riser build up", 2, "riser"),
    ("ui pop click", 2, "pop"),
    ("notification ding", 2, "ding"),
    ("glitch digital", 2, "glitch"),
    ("camera shutter", 1, "shutter"),
]


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "sound"


def search(
    api_key: str,
    kind: str,
    query: str,
    count: int = 5,
    license_key: str = "cc0",
) -> list[dict[str, Any]]:
    """Busca en Freesound y devuelve hits con previews. kind: music | sfx."""
    lic = LICENSE_FILTERS.get(license_key, LICENSE_FILTERS["cc0"])
    # SFX corto (<8s), música más larga (>15s) para que loopee bien.
    dur = "duration:[0.2 TO 8]" if kind == "sfx" else "duration:[15 TO 240]"
    params = {
        "query": query,
        "filter": f"{lic} {dur}",
        "fields": "id,name,previews,license,duration,username,url",
        "sort": "rating_desc",
        "page_size": str(max(5, count * 2)),
        "token": api_key,
    }
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "ViralPoncho/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"Freesound HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Freesound URL error: {e.reason}")
    return data.get("results", [])[:count]


def download_to(url: str, dest_path: Path, timeout: int = 60) -> int:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read()
            dest_path.write_bytes(payload)
            return len(payload)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt == 2:
                raise RuntimeError(f"download failed after 3 attempts: {e}")
            time.sleep(2 ** attempt)
    return 0


def download_pack(
    api_key: str,
    kind: str,
    out_dir: Path,
    license_key: str = "cc0",
) -> dict[str, Any]:
    """Descarga el pack curado de música o SFX (previews MP3). Devuelve un manifest
    con la atribución de cada archivo (útil aunque CC0 no la exija)."""
    pack = MUSIC_PACK if kind == "music" else SFX_PACK
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    failed: list[str] = []

    for query, count, prefix in pack:
        try:
            hits = search(api_key, kind, query, count=count, license_key=license_key)
        except Exception as e:
            print(f"[freesound] search '{query}' failed: {e}", file=sys.stderr)
            failed.append(query)
            continue
        if not hits:
            print(f"[freesound] sin resultados para '{query}'", file=sys.stderr)
            continue
        for i, hit in enumerate(hits[:count]):
            previews = hit.get("previews") or {}
            audio_url = previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3")
            if not audio_url:
                continue
            filename = f"{prefix}-{i + 1}-{hit.get('id')}.mp3"
            dest = out_dir / filename
            if dest.exists():
                manifest.append({"filename": filename, "query": query, "skipped": True})
                continue
            try:
                n = download_to(audio_url, dest)
                manifest.append({
                    "filename": filename,
                    "query": query,
                    "bytes": n,
                    "freesound_id": hit.get("id"),
                    "name": hit.get("name"),
                    "author": hit.get("username"),
                    "license": hit.get("license"),
                    "url": hit.get("url"),
                    "duration": hit.get("duration"),
                })
                print(f"[freesound] + {kind}/{filename} ({n} bytes)", file=sys.stderr)
            except Exception as e:
                print(f"[freesound] download failed {filename}: {e}", file=sys.stderr)
                failed.append(filename)
            time.sleep(0.5)  # cortesía con la API

    manifest_path = out_dir / "manifest_freesound.json"
    manifest_path.write_text(
        json.dumps({"items": manifest, "failed": failed}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "ok": True,
        "kind": kind,
        "out_dir": str(out_dir),
        "downloaded": len([m for m in manifest if not m.get("skipped")]),
        "skipped": len([m for m in manifest if m.get("skipped")]),
        "failed": len(failed),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_search = sub.add_parser("search")
    p_search.add_argument("--key", required=True)
    p_search.add_argument("--type", choices=["music", "sfx"], required=True)
    p_search.add_argument("--q", required=True)
    p_search.add_argument("--max", type=int, default=5)
    p_search.add_argument("--license", choices=["cc0", "cc-by"], default="cc0")

    p_pack = sub.add_parser("download-pack")
    p_pack.add_argument("--key", required=True)
    p_pack.add_argument("--type", choices=["music", "sfx"], required=True)
    p_pack.add_argument("--out-dir", required=True)
    p_pack.add_argument("--license", choices=["cc0", "cc-by"], default="cc0")

    args = parser.parse_args()

    if args.cmd == "search":
        try:
            hits = search(args.key, args.type, args.q, count=args.max, license_key=args.license)
            print(json.dumps({"ok": True, "count": len(hits), "hits": hits}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1
    elif args.cmd == "download-pack":
        try:
            result = download_pack(args.key, args.type, Path(args.out_dir), license_key=args.license)
            print(json.dumps(result, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
