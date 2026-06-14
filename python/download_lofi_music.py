"""Géneros virales lo-fi CC0 PURO — open-lofi (166 tracks, 10 moods). SIN API key.

Fuente (verificada con fetch real 2026-06-13):
  github.com/btahir/open-lofi — release v1.0.0, asset `openlofi.zip` (~554 MB,
  166 mp3 reales con tag ID3) + `catalog.json`. Licencia del repo: **CC0-1.0**
  (`GET /repos/btahir/open-lofi/license` -> spdx_id "CC0-1.0"), o sea dominio
  público: uso comercial OK, SIN atribución obligatoria. Esto es lo que suena en
  TikTok/Reels (lo-fi / chillhop / late-night / lofi beats).

Por qué este enfoque:
  - Los mp3 NO viven en el árbol git del repo (sólo `opengraph.png`); SÓLO existen
    dentro de `openlofi.zip` (release asset). El CDN soporta `Accept-Ranges: bytes`,
    así que para un SUBSET de verificación se extraen N tracks con lecturas por
    rango (sin bajar los 554 MB). Para el set completo se baja el zip a un temporal
    y se extrae.
  - `catalog.json` mapea cada `filename` (`<slug>.mp3`) a una de 10 `category`.
    Cada categoría se traduce a tokens de mood (lofi/chill/etc) que se incrustan en
    el nombre final `openlofi-<mood1>-<mood2>-<slug>.mp3`, porque el selector de
    runtime (`pickRandomMusicTrack`) filtra por el substring `-<mood>-`. Así una
    pista cae tanto bajo `-lofi-` como bajo su sub-mood (`-chill-`, `-jazzhop-`...).

Salida:
  Los mp3 caen FLAT en {MUSIC_DIR}/github/ (la MISMA carpeta que ya escanean
  /api/music/list, /api/music/stream y pickRandomMusicTrack — cero cambios de
  rutas). El manifest se MERGEA en {MUSIC_DIR}/manifest_music_library.json (el
  mismo que usa download_music_library.py), con el schema existente:
    {filename, title, artist, mood, license:"CC0 / Public Domain (open-lofi)",
     source, url, attribution:null}

Uso:
  # set completo (baja el zip ~554 MB y extrae los 166)
  python download_lofi_music.py download --out-dir <MUSIC_DIR>\github

  # subset rápido por rangos (NO baja el zip entero) — ideal para verificar
  python download_lofi_music.py download --out-dir <MUSIC_DIR>\github --subset 8

Idempotente (salta los que ya existen), con reintentos.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path
from typing import Any

REPO = "btahir/open-lofi"
CATALOG_URL = f"https://raw.githubusercontent.com/{REPO}/main/catalog.json"
ZIP_URL = (
    f"https://github.com/{REPO}/releases/download/v1.0.0/openlofi.zip"
)
LICENSE_URL = f"https://github.com/{REPO}/blob/main/LICENSE"

# ── Mapa categoría -> tokens de mood incrustados en el filename ───────────────
# Todas son lo-fi, así que SIEMPRE llevan "lofi". El 2º token es el sub-mood para
# que el selector por mood (chill/phonk/synthwave/...) también haga match. El
# selector de runtime busca el substring `-<mood>-`, por eso van varios tokens.
CATEGORY_MOODS: dict[str, list[str]] = {
    "chillhop": ["lofi", "chill"],
    "jazzhop": ["lofi", "jazzhop", "chill"],
    "ambient-lofi": ["lofi", "ambient", "chill"],
    "soul-rnb": ["lofi", "soul", "chill"],
    "asian-lofi": ["lofi", "zen", "chill"],
    "funk-soul": ["lofi", "funk"],
    "seasonal-weather": ["lofi", "rain", "chill"],
    "late-night": ["lofi", "synthwave", "night"],
    "activities": ["lofi", "focus", "chill"],
    "hybrid": ["lofi", "cinematic"],
}
DEFAULT_MOODS = ["lofi", "chill"]

USER_AGENT = "ViralPoncho/1.0 (+https://github.com/ponchovillalobos/viralito)"


def _slug(name: str) -> str:
    stem = name.rsplit(".", 1)[0]
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return s or "track"


def _mood_prefix(category: str) -> str:
    moods = CATEGORY_MOODS.get(category, DEFAULT_MOODS)
    # `openlofi-lofi-chill-` ⇒ selector hace match con -lofi- y -chill-
    return "openlofi-" + "-".join(moods) + "-"


def _request(url: str, extra_headers: dict[str, str] | None = None) -> urllib.request.Request:
    headers = {"User-Agent": USER_AGENT}
    if extra_headers:
        headers.update(extra_headers)
    return urllib.request.Request(url, headers=headers)


def _open(url: str, headers: dict[str, str] | None = None, timeout: int = 60):
    return urllib.request.urlopen(_request(url, headers), timeout=timeout)


def fetch_bytes(url: str, *, timeout: int = 60, attempts: int = 3) -> bytes:
    last: Exception | None = None
    for i in range(attempts):
        try:
            with _open(url, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"fetch failed after {attempts} attempts: {last}")


def fetch_range(url: str, start: int, end: int, *, timeout: int = 120, attempts: int = 3) -> bytes:
    last: Exception | None = None
    for i in range(attempts):
        try:
            with _open(url, {"Range": f"bytes={start}-{end}"}, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"range fetch failed after {attempts} attempts: {last}")


def load_catalog() -> tuple[dict[str, str], dict[str, str]]:
    """Devuelve (filename->category, filename->title)."""
    data = json.loads(fetch_bytes(CATALOG_URL).decode("utf-8"))
    cat: dict[str, str] = {}
    title: dict[str, str] = {}
    for t in data.get("tracks", []):
        fn = t.get("filename")
        if not fn:
            continue
        cat[fn] = t.get("category", "")
        title[fn] = t.get("title", _slug(fn).replace("-", " ").title())
    return cat, title


def get_total_size(url: str) -> int:
    # HEAD sigue el redirect al CDN y trae Content-Length real.
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        n = r.headers.get("Content-Length")
    if not n:
        raise RuntimeError("no Content-Length en el zip")
    return int(n)


# ── Lector de zip por rangos (central directory + extracción puntual) ─────────
class ZipEntry:
    __slots__ = ("name", "local_off", "csize", "usize", "method")

    def __init__(self, name: str, local_off: int, csize: int, usize: int, method: int):
        self.name = name
        self.local_off = local_off
        self.csize = csize
        self.usize = usize
        self.method = method


def read_central_directory(url: str, total: int) -> list[ZipEntry]:
    tail_len = min(65536, total)
    tail = fetch_range(url, total - tail_len, total - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError("EOCD no encontrado (¿zip64?)")
    f = struct.unpack("<IHHHHIIH", tail[eocd:eocd + 22])
    cd_size, cd_off = f[5], f[6]
    cd = fetch_range(url, cd_off, cd_off + cd_size - 1)
    entries: list[ZipEntry] = []
    i = 0
    while i < len(cd) and cd[i:i + 4] == b"PK\x01\x02":
        method = struct.unpack("<H", cd[i + 10:i + 12])[0]
        csize = struct.unpack("<I", cd[i + 20:i + 24])[0]
        usize = struct.unpack("<I", cd[i + 24:i + 28])[0]
        nlen = struct.unpack("<H", cd[i + 28:i + 30])[0]
        elen = struct.unpack("<H", cd[i + 30:i + 32])[0]
        clen = struct.unpack("<H", cd[i + 32:i + 34])[0]
        loff = struct.unpack("<I", cd[i + 42:i + 46])[0]
        name = cd[i + 46:i + 46 + nlen].decode("utf-8", "replace")
        entries.append(ZipEntry(name, loff, csize, usize, method))
        i += 46 + nlen + elen + clen
    return entries


def extract_entry(url: str, e: ZipEntry) -> bytes:
    lh = fetch_range(url, e.local_off, e.local_off + 30 - 1)
    lnlen = struct.unpack("<H", lh[26:28])[0]
    lelen = struct.unpack("<H", lh[28:30])[0]
    data_start = e.local_off + 30 + lnlen + lelen
    raw = fetch_range(url, data_start, data_start + e.csize - 1)
    data = zlib.decompress(raw, -15) if e.method == 8 else raw
    if len(data) < 10_000 or not (data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)):
        raise RuntimeError(f"{e.name}: no parece mp3 (bytes={len(data)})")
    return data


def _manifest_entry(fname: str, title: str, category: str, mood_prefix: str) -> dict[str, Any]:
    primary = mood_prefix.split("-")[1] if "-" in mood_prefix else "lofi"
    return {
        "filename": fname,
        "title": title,
        "artist": "open-lofi (CC0)",
        "mood": primary,
        "license": "CC0 / Public Domain (open-lofi)",
        "source": "github.com/btahir/open-lofi (release v1.0.0)",
        "url": ZIP_URL,
        "attribution": None,  # CC0: no requiere atribución
        "category": category,
    }


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data
    except Exception:
        pass
    return {"items": []}


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    manifest["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def download(out_dir: Path, subset: int | None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir.parent / "manifest_music_library.json"
    manifest = load_manifest(manifest_path)
    known = {it.get("filename") for it in manifest["items"]}

    cat_by_fn, title_by_fn = load_catalog()
    total = get_total_size(ZIP_URL)
    entries = read_central_directory(ZIP_URL, total)
    mp3s = [e for e in entries if e.name.lower().endswith(".mp3")]
    if subset is not None and subset > 0:
        mp3s = mp3s[:subset]

    downloaded = skipped = failed = 0

    if subset is not None and subset > 0:
        # ── Modo subset: extracción puntual por rangos (no baja el zip entero) ──
        for e in mp3s:
            category = cat_by_fn.get(e.name, "")
            prefix = _mood_prefix(category)
            fname = prefix + _slug(e.name) + ".mp3"
            dest = out_dir / fname
            if dest.exists():
                skipped += 1
                continue
            try:
                data = extract_entry(ZIP_URL, e)
                dest.write_bytes(data)
                downloaded += 1
                print(f"[lofi] + {fname} ({len(data)} bytes, cat={category})", file=sys.stderr)
            except Exception as ex:
                failed += 1
                print(f"[lofi] fail {e.name}: {ex}", file=sys.stderr)
                continue
            if fname not in known:
                manifest["items"].append(
                    _manifest_entry(fname, title_by_fn.get(e.name, e.name), category, prefix)
                )
                known.add(fname)
    else:
        # ── Modo completo: baja el zip a un temporal y extrae con zipfile ──────
        import io
        import zipfile

        print(f"[lofi] bajando openlofi.zip ({total} bytes)...", file=sys.stderr)
        blob = fetch_bytes(ZIP_URL, timeout=600)
        if len(blob) != total:
            print(f"[lofi] WARN: tamaño bajado {len(blob)} != esperado {total}", file=sys.stderr)
        zf = zipfile.ZipFile(io.BytesIO(blob))
        for name in zf.namelist():
            if not name.lower().endswith(".mp3"):
                continue
            category = cat_by_fn.get(name, "")
            prefix = _mood_prefix(category)
            fname = prefix + _slug(name) + ".mp3"
            dest = out_dir / fname
            if dest.exists():
                skipped += 1
                continue
            try:
                data = zf.read(name)
                if len(data) < 10_000 or not (
                    data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)
                ):
                    raise RuntimeError(f"no parece mp3 (bytes={len(data)})")
                dest.write_bytes(data)
                downloaded += 1
                print(f"[lofi] + {fname} ({len(data)} bytes, cat={category})", file=sys.stderr)
            except Exception as ex:
                failed += 1
                print(f"[lofi] fail {name}: {ex}", file=sys.stderr)
                continue
            if fname not in known:
                manifest["items"].append(
                    _manifest_entry(fname, title_by_fn.get(name, name), category, prefix)
                )
                known.add(fname)

    save_manifest(manifest_path, manifest)
    return {
        "ok": True,
        "source": f"github.com/{REPO} (release v1.0.0, openlofi.zip)",
        "license": "CC0-1.0",
        "out_dir": str(out_dir),
        "mode": "subset" if (subset and subset > 0) else "full",
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "manifest": str(manifest_path),
        "manifest_items": len(manifest["items"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("download")
    p.add_argument("--out-dir", required=True, help="ej. <MUSIC_DIR>\\github")
    p.add_argument(
        "--subset",
        type=int,
        default=None,
        help="baja sólo N tracks por rangos (rápido, sin descargar el zip entero)",
    )
    args = parser.parse_args()

    if args.cmd == "download":
        try:
            print(json.dumps(download(Path(args.out_dir), args.subset), ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
