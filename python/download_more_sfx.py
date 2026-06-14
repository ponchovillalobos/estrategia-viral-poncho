"""OLA 3/4 — Amplía + CURA la librería de SFX (CC0, sin API key, descarga directa).

Hace DOS cosas (independientes, subcomandos):

  1) `download`  → baja 4 packs Kenney.nl CC0 ADICIONALES que el
     download_sfx_library.py NO baja (casino-audio, rpg-audio, sci-fi-sounds,
     music-jingles). Mismo patrón: scrapea el .zip de la página del asset (el
     hash del link cambia por versión) y extrae los audios FLAT a
     {SFX_BASE}/github/ con prefijo `kenney-<pack>-`. Todos verificados CC0 con
     fetch real (2026-06-13): cada página dice "Creative Commons CC0".
       - casino-audio   (50): coins, chips, bells, win/jackpot → momentos $$ virales
       - rpg-audio      (50): magic chimes, swooshes, metal, fanfares
       - sci-fi-sounds  (70): risers, lasers, phasers, transiciones
       - music-jingles  (85): stingers/jingles cortos → intro/outro/reveal

  2) `curate`    → NO descarga nada nuevo: BUSCA en los SFX YA presentes
     (github/ flat + algunos packs de source/, todos del repo CC0
     github.com/lavenderdotpet/CC0-Public-Domain-Sounds) los que sirven como
     "virales/transición" (whoosh/swoosh, pop, ding, click, riser, scratch,
     impact, stinger) y los COPIA a {SFX_BASE}/curated-viral/ + escribe
     {SFX_BASE}/curated-viral/manifest_curated_viral.json con tags. El índice de
     SFX (frontend/src/lib/sfx-index.ts) escanea assets/sfx recursivo, así que la
     subcarpeta queda EXPUESTA automáticamente en /api/sfx/list (categoría
     "curated-viral") y resoluble por match_sfx_to_transcript.py (por basename o
     relPath). CERO cambios de rutas/código.

  `all` corre los dos en orden.

LICENCIAS — REGLA dura: SOLO CC0, descarga directa, sin login/key. PROHIBIDO
Freesound (login/key) y Pixabay (prohíbe redistribuir). Lo que NO se pudo
verificar como CC0 limpio NO se incluye (ver REPORTE al final del run y el
comentario `# NO-AGREGADO` abajo).

Uso:
  python download_more_sfx.py all      --out-dir <DATA_ROOT>\\assets\\sfx\\github
  python download_more_sfx.py download --out-dir <...>\\github
  python download_more_sfx.py curate   --out-dir <...>\\github [--source-dir <...>\\source]

Verificación rápida (sin tocar la data real):
  set VIRAL_DATA_ROOT=C:\\hermes-data\\_sfxtest2
  python download_more_sfx.py download --out-dir %VIRAL_DATA_ROOT%\\assets\\sfx\\github
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

# ─── Packs Kenney CC0 ADICIONALES (no están en download_sfx_library.py) ────────
# Verificados uno por uno con fetch real 2026-06-13: cada página kenney.nl/assets/<pack>
# muestra "Creative Commons CC0" (dominio público, uso comercial OK, sin atribución).
NEW_PACKS = ["casino-audio", "rpg-audio", "sci-fi-sounds", "music-jingles"]

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


# ─────────────────────────────────────────────────────────────────────────────
# 1) DOWNLOAD — packs Kenney CC0 adicionales
# ─────────────────────────────────────────────────────────────────────────────
def download(out_dir: Path, per_pack: int | None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Reusa el MISMO manifest que download_sfx_library.py para no duplicar entradas.
    manifest_path = out_dir.parent / "manifest_sfx_library.json"
    manifest = load_manifest(manifest_path)
    known = {it.get("filename") for it in manifest["items"]}

    extracted = skipped = 0
    failed: list[str] = []

    for pack in NEW_PACKS:
        try:
            zip_url = find_zip_url(pack)
            print(f"[more-sfx] {pack}: {zip_url}", file=sys.stderr)
            blob = _fetch(zip_url)
            zf = zipfile.ZipFile(io.BytesIO(blob))
        except Exception as e:
            print(f"[more-sfx] fail pack {pack}: {e}", file=sys.stderr)
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
                print(f"[more-sfx] fail {n}: {e}", file=sys.stderr)
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
        print(f"[more-sfx] {pack}: {len(names)} audios procesados", file=sys.stderr)
        time.sleep(0.5)

    manifest["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return {
        "ok": True,
        "out_dir": str(out_dir),
        "packs": NEW_PACKS,
        "extracted": extracted,
        "skipped": skipped,
        "failed_packs": failed,
        "manifest_items": len(manifest["items"]),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2) CURATE — set "virales/transición" desde lo YA descargado (CC0)
# ─────────────────────────────────────────────────────────────────────────────
# Cada tag mapea a substrings que buscamos en el BASENAME (lowercase). El primer
# tag que matchea gana. Solo CC0 (github flat = Kenney; source = repo CC0).
# Orden: lo más "viral/transición" primero para que clasifique bien.
CURATE_TAGS: list[tuple[str, list[str]]] = [
    # whoosh/swoosh de transición — el rey del corte viral
    ("whoosh", ["whoosh", "swoosh", "swish", "woosh", "twirl", "phaserup", "phaserdown"]),
    # record-scratch / needle (de Micro Pack - Record Fuzzies, CC0)
    ("record-scratch", ["record skipping", "needle drop", "needle breaker", "record loop", "scratch"]),
    # riser / sube tensión antes del drop
    ("riser", ["riser", "phaser", "highup", "lowup", "power_up", "powerup", "rise", "sweepup", "buildup"]),
    # pop — aparición de texto/elemento
    ("pop", ["pop", "bloop", "blip", "plop", "bubble"]),
    # ding / bell / chime — punch de "correcto"/notificación
    ("ding", ["ding", "bell", "chime", "bong", "jingle", "fanfare", "notification", "tada"]),
    # click / select — micro-acento UI
    ("click", ["click", "select", "tick", "tap", "switch", "toggle", "rollover"]),
    # impact / hit / boom — golpe seco para énfasis
    ("impact", ["impact", "punch", "boom", "hit", "slam", "thud", "thunk", "cannon", "explos"]),
    # laser / zap / sci-fi — energía/transición digital
    ("laser", ["laser", "zap", "phaser", "beam", "blaster"]),
    # coin / cash — momentos de dinero ($$ viral)
    ("coin", ["coin", "cash", "money", "bling", "chip", "jackpot", "win", "casino"]),
    # glitch — corte raro/error estético
    ("glitch", ["glitch", "error", "distort"]),
]

# Carpetas de source/ (repo CC0 lavenderdotpet) de donde vale la pena curar.
# Solo packs CC0 LIMPIOS con material de transición. (footsteps/ambiences fuera.)
SOURCE_PACK_GLOBS = [
    "Micro Pack - Organic Wooshes",   # swishes/twirls = whoosh perfecto
    "Micro Pack - Record Fuzzies",    # needle drop / record skipping ~ scratch
    "50-CC0-retro-synth-SFX",         # power_up = risers
    "50-cc0-sci-fi-sfx",
    "60-sci-fi-sfx",
    "sci-fi-sounds",
]

# Máximo de archivos por (tag) para no inflar la galería con 200 whooshes iguales.
MAX_PER_TAG = 18


def classify(basename: str) -> str | None:
    low = basename.lower()
    for tag, subs in CURATE_TAGS:
        for s in subs:
            if s in low:
                return tag
    return None


def _iter_audio(root: Path):
    """Genera (absPath, basename) de audios reales, podando .git/ocultos/junk."""
    if not root.exists():
        return
    for p in root.rglob("*"):
        # poda directorios .git / ocultos
        if any(part == ".git" or part.startswith(".") for part in p.parts[len(root.parts):]):
            continue
        if not p.is_file():
            continue
        name = p.name
        if name.startswith("._") or name == ".DS_Store":
            continue
        if p.suffix.lower() not in (".ogg", ".mp3", ".wav", ".flac"):
            continue
        yield p, name


def curate(out_dir: Path, source_dir: Path) -> dict[str, Any]:
    sfx_base = out_dir.parent  # .../assets/sfx
    curated_dir = sfx_base / "curated-viral"
    curated_dir.mkdir(parents=True, exist_ok=True)

    # Reunir candidatos: github/ flat (Kenney CC0) + packs selectos de source/.
    candidates: list[tuple[Path, str, str]] = []  # (abs, basename, origin)
    for abs_p, name in _iter_audio(out_dir):
        candidates.append((abs_p, name, "github"))
    for glob_name in SOURCE_PACK_GLOBS:
        pack_dir = source_dir / glob_name
        for abs_p, name in _iter_audio(pack_dir):
            candidates.append((abs_p, name, f"source/{glob_name}"))

    per_tag_count: dict[str, int] = {}
    items: list[dict[str, Any]] = []
    copied = 0
    seen_dest: set[str] = set()

    for abs_p, name, origin in candidates:
        tag = classify(name)
        if not tag:
            continue
        if per_tag_count.get(tag, 0) >= MAX_PER_TAG:
            continue

        # Nombre destino: <tag>-<origen corto>-<basename> normalizado, único.
        origin_slug = re.sub(r"[^a-z0-9]+", "-", origin.lower()).strip("-")
        base_slug = re.sub(r"[^a-z0-9.]+", "-", name.lower()).strip("-")
        dest_name = f"{tag}-{base_slug}"
        if dest_name in seen_dest:
            # colisión de basename entre packs → prefija el origen
            dest_name = f"{tag}-{origin_slug}-{base_slug}"
        if dest_name in seen_dest:
            continue
        dest = curated_dir / dest_name
        if dest.exists():
            seen_dest.add(dest_name)
            # ya copiado en un run previo: igual lo dejamos en el manifest
        else:
            try:
                shutil.copy2(abs_p, dest)
                copied += 1
            except Exception as e:
                print(f"[more-sfx] curate fail {name}: {e}", file=sys.stderr)
                continue

        seen_dest.add(dest_name)
        per_tag_count[tag] = per_tag_count.get(tag, 0) + 1
        items.append({
            "filename": dest_name,
            "tag": tag,
            "category": "curated-viral",
            "origin": origin,
            "source_basename": name,
            "license": "CC0 / Public Domain",
            "attribution": None,
        })

    manifest = {
        "set": "curated-viral",
        "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "license": "CC0 / Public Domain (Kenney.nl + github.com/lavenderdotpet/CC0-Public-Domain-Sounds)",
        "count": len(items),
        "by_tag": per_tag_count,
        "items": sorted(items, key=lambda it: (it["tag"], it["filename"])),
    }
    manifest_path = curated_dir / "manifest_curated_viral.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    return {
        "ok": True,
        "curated_dir": str(curated_dir),
        "copied": copied,
        "total_in_set": len(items),
        "by_tag": per_tag_count,
        "manifest": str(manifest_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    pd = sub.add_parser("download")
    pd.add_argument("--out-dir", required=True)
    pd.add_argument("--per-pack", type=int, default=None)

    pc = sub.add_parser("curate")
    pc.add_argument("--out-dir", required=True, help=".../assets/sfx/github")
    pc.add_argument("--source-dir", default=None, help=".../assets/sfx/source")

    pa = sub.add_parser("all")
    pa.add_argument("--out-dir", required=True)
    pa.add_argument("--per-pack", type=int, default=None)
    pa.add_argument("--source-dir", default=None)

    args = parser.parse_args()

    def _source_dir(out_dir: Path) -> Path:
        if getattr(args, "source_dir", None):
            return Path(args.source_dir)
        return out_dir.parent / "source"

    try:
        if args.cmd == "download":
            res = download(Path(args.out_dir), args.per_pack)
        elif args.cmd == "curate":
            out = Path(args.out_dir)
            res = curate(out, _source_dir(out))
        elif args.cmd == "all":
            out = Path(args.out_dir)
            dl = download(out, args.per_pack)
            cu = curate(out, _source_dir(out))
            res = {"ok": True, "download": dl, "curate": cu}
        else:
            res = {"ok": False, "error": f"cmd desconocido {args.cmd}"}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# NO-AGREGADO (por licencia no verificable como CC0 limpio):
#   - "vine-boom": fuentes circulan en Pixabay/Freesound (PROHIBIDOS) y blogs sin
#     licencia clara. No hay copia CC0 verificada en GitHub/archive.org → NO se mete.
#   - record-scratch "DJ" clásico: BigSoundBank dice CC0 pero requiere ir 1x1 por web;
#     en su lugar usamos "Record Fuzzies" (needle drop / record skipping) del repo CC0
#     ya clonado en source/, que cubre el efecto sin licencia dudosa.
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sys.exit(main())
