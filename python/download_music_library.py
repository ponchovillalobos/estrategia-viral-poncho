"""Biblioteca GRANDE de música CC0/CC-BY — descarga directa, SIN API key ni registro.

Fuentes (todas verificadas con fetch real 2026-06-11):
  1. Kevin MacLeod / incompetech.com — CC-BY 4.0 (requiere atribución; queda
     registrada en el manifest). Descarga directa:
       https://incompetech.com/music/royalty-free/mp3-royaltyfree/<Nombre>.mp3
     58 pistas curadas por mood (energetic/calm/epic/funny/tension).
  2. SoundSafari/CC0-1.0-Music carpeta chosic.com — CC0 / dominio público,
     vía raw.githubusercontent.com (listado anónimo con la API pública).

Los archivos caen FLAT en {MUSIC_DIR}/github/ (carpeta que ya escanean
pickRandomMusicTrack y /api/music/stream — cero cambios de rutas) con el mood
codificado en el nombre: `incompetech-<mood>-<slug>.mp3` / `chosic-<mood>-<slug>.mp3`.
Así pickRandomMusicTrack puede filtrar por mood con un substring del filename.

Manifest con título/autor/licencia/atribución: {MUSIC_DIR}/manifest_music_library.json
(vive en DATA_ROOT, NO va al repo).

Uso:
  python download_music_library.py download --out-dir <MUSIC_DIR>\github
  python download_music_library.py download --out-dir <dir> --chosic 15
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

INCOMPETECH_BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/"
CHOSIC_API = "https://api.github.com/repos/SoundSafari/CC0-1.0-Music/contents/chosic.com"

# ─── 58 pistas de Kevin MacLeod verificadas (HEAD 200) por mood ───────────────
INCOMPETECH: dict[str, list[str]] = {
    "funny": [
        "Monkeys Spinning Monkeys", "Sneaky Snitch", "Fluffing a Duck",
        "Scheming Weasel faster", "Carefree", "Pixel Peeker Polka - faster",
        "Quirky Dog", "Hidden Agenda", "Amazing Plan", "The Builder", "Salty Ditty",
    ],
    "energetic": [
        "Funk Game Loop", "Electrodoodle", "Cut and Run", "Who Likes to Party",
        "Disco con Tutti", "Funky Chunk", "Rollin at 5", "Voltaic", "Exhilarate",
        "Severe Tire Damage", "Overworld", "Itty Bitty 8 Bit", "Adventure Meme",
    ],
    "epic": [
        "Five Armies", "Volatile Reaction", "Epic Unease", "Hitman", "Killers",
        "Curse of the Scarab", "Crusade", "Achilles", "Stormfront", "Heroic Age",
        "Take a Chance", "Arcadia",
    ],
    "calm": [
        "Deliberate Thought", "Inspired", "Wallpaper", "Meditation Impromptu 02",
        "Easy Lemon", "Wholesome", "George Street Shuffle", "Backbay Lounge",
        "Bossa Antigua", "Off to Osaka", "Dispersion Relation", "Local Forecast - Elevator",
    ],
    "tension": [
        "Investigations", "Spy Glass", "Lightless Dawn", "Anxiety", "Echoes of Time",
        "Long Note One", "Mechanolith", "Oppressive Gloom", "The Complex", "Darkest Child",
    ],
}

# Clasificador de mood por keywords del filename para los CC0 de chosic.com.
CHOSIC_MOOD_KEYWORDS: list[tuple[str, list[str]]] = [
    ("epic", ["epic", "hero", "cinematic", "trailer", "battle", "power", "rise"]),
    ("tension", ["dark", "tension", "suspense", "horror", "mystery", "scary", "drama"]),
    ("funny", ["funny", "comedy", "quirky", "happy", "fun", "ukulele", "whistle"]),
    ("calm", ["calm", "chill", "relax", "lofi", "lo-fi", "piano", "ambient", "sleep",
              "peace", "soft", "acoustic", "dream", "meditat"]),
    ("energetic", ["energy", "upbeat", "rock", "edm", "dance", "electro", "pop",
                   "sport", "drive", "motivat", "workout", "trap", "beat"]),
]


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "track"


def _fetch_json(url: str) -> Any:
    req = urllib.request.Request(
        url, headers={"Accept": "application/vnd.github+json", "User-Agent": "ViralPoncho/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_to(url: str, dest: Path, timeout: int = 120) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = resp.read()
            if len(payload) < 10_000:  # mp3 real, no página de error
                raise RuntimeError(f"payload sospechoso ({len(payload)} bytes)")
            dest.write_bytes(payload)
            return len(payload)
        except Exception as e:
            if attempt == 2:
                raise RuntimeError(f"download failed after 3 attempts: {e}")
            time.sleep(2**attempt)
    return 0


def classify_chosic_mood(filename: str) -> str:
    low = filename.lower()
    for mood, kws in CHOSIC_MOOD_KEYWORDS:
        if any(k in low for k in kws):
            return mood
    return "calm"


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data
    except Exception:
        pass
    return {"items": []}


def download(out_dir: Path, chosic_limit: int) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir.parent / "manifest_music_library.json"
    manifest = load_manifest(manifest_path)
    known = {it.get("filename") for it in manifest["items"]}

    downloaded = skipped = failed = 0

    # ─── 1. Incompetech (CC-BY 4.0, atribución registrada) ────────────────────
    for mood, titles in INCOMPETECH.items():
        for title in titles:
            fname = f"incompetech-{mood}-{_slug(title)}.mp3"
            dest = out_dir / fname
            if dest.exists():
                skipped += 1
                continue
            url = INCOMPETECH_BASE + urllib.parse.quote(f"{title}.mp3")
            try:
                n = download_to(url, dest)
                downloaded += 1
                print(f"[music-lib] + {fname} ({n} bytes)", file=sys.stderr)
            except Exception as e:
                failed += 1
                print(f"[music-lib] fail {title}: {e}", file=sys.stderr)
                continue
            if fname not in known:
                manifest["items"].append({
                    "filename": fname,
                    "title": title,
                    "artist": "Kevin MacLeod",
                    "mood": mood,
                    "license": "CC-BY 4.0",
                    "source": "incompetech.com",
                    "url": url,
                    "attribution": (
                        f'"{title}" Kevin MacLeod (incompetech.com). '
                        "Licensed under Creative Commons: By Attribution 4.0 "
                        "https://creativecommons.org/licenses/by/4.0/"
                    ),
                })
                known.add(fname)
            time.sleep(0.25)

    # ─── 2. chosic.com (CC0) vía SoundSafari/CC0-1.0-Music ────────────────────
    if chosic_limit > 0:
        try:
            entries = _fetch_json(CHOSIC_API)
            mp3s = [e for e in entries
                    if isinstance(e, dict) and e.get("name", "").lower().endswith(".mp3")
                    and e.get("download_url")]
            taken = 0
            for e in mp3s:
                if taken >= chosic_limit:
                    break
                raw_name = e["name"]
                stem = raw_name.rsplit(".", 1)[0]
                mood = classify_chosic_mood(stem)
                fname = f"chosic-{mood}-{_slug(stem)}.mp3"
                dest = out_dir / fname
                if dest.exists():
                    skipped += 1
                    taken += 1
                    continue
                try:
                    n = download_to(e["download_url"], dest)
                    downloaded += 1
                    taken += 1
                    print(f"[music-lib] + {fname} ({n} bytes)", file=sys.stderr)
                except Exception as ex:
                    failed += 1
                    print(f"[music-lib] fail {raw_name}: {ex}", file=sys.stderr)
                    continue
                if fname not in known:
                    manifest["items"].append({
                        "filename": fname,
                        "title": stem,
                        "artist": "varios (CC0)",
                        "mood": mood,
                        "license": "CC0 / Public Domain",
                        "source": "github.com/SoundSafari/CC0-1.0-Music (chosic.com)",
                        "url": e["download_url"],
                        "attribution": None,  # CC0: no requiere atribución
                    })
                    known.add(fname)
                time.sleep(0.25)
        except Exception as e:
            print(f"[music-lib] chosic list fail: {e}", file=sys.stderr)

    manifest["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return {
        "ok": True,
        "out_dir": str(out_dir),
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "manifest": str(manifest_path),
        "manifest_items": len(manifest["items"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("download")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--chosic", type=int, default=15, help="cuántas pistas CC0 de chosic sumar")
    args = parser.parse_args()

    if args.cmd == "download":
        try:
            print(json.dumps(download(Path(args.out_dir), args.chosic), ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
