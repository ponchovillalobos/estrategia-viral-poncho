"""F2 — Detector de MULETILLAS en español (lo que Descript hace mal en es).

Usa los timestamps palabra-por-palabra de WhisperX para encontrar muletillas
("eh", "este…", "pues", "o sea", "bueno", "entonces") y las RESTA de los
keep_segments del cuts JSON — así `cut_silences.py` genera el _cut.mp4 sin
silencios NI muletillas, y el remap de build-props descarta esas palabras de
los subtítulos automáticamente.

Reglas (conservadoras — mejor dejar una muletilla que cortar una palabra real):
  - SIEMPRE muletilla: sonidos sin contenido ("eh", "em", "mmm", "ajá"…).
  - CONTEXTUALES ("este", "pues", "bueno", "entonces", "o sea", "digamos"):
    solo si están rodeadas de pausa (gap antes/después ≥ 0.3s) o estiradas
    (duran > 0.45s con pausa después) — la firma acústica de la duda.
    "este video es…" (sin pausa) NUNCA se corta.
  - Cada corte deja 40-60ms de aire para no sonar robótico (patrón auto-editor).

Uso:
  python detect_fillers.py <video_id> [--transcripts-dir D] [--cuts-dir D] [--dry]

Lee  {TRANSCRIPTS_DIR}/{id}.json y {CUTS_DIR}/{id}.json (si no hay cuts JSON,
lo crea con un único keep_segment de todo el video). Reescribe el cuts JSON con
los keep_segments ya sin muletillas + lista "fillers" para auditar.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from config import CUTS_DIR, RAW_DIR, TRANSCRIPTS_DIR

# Sonidos sin contenido semántico — cortar siempre.
ALWAYS_FILLERS = {
    "eh", "ehh", "eeh", "eehh", "em", "emm", "ehm", "uhm", "um", "umm",
    "mmm", "mm", "hmm", "aja", "ajá", "ah", "ahh", "aah", "uh",
}
# Palabras reales que SOLO son muletilla con firma de duda (pausas alrededor).
CONTEXTUAL_FILLERS = {
    "este", "esta", "pues", "bueno", "entonces", "osea", "digamos", "viste",
    "vale", "tipo", "nada", "claro",
}
GAP = 0.30          # pausa mínima alrededor para considerar contextual
STRETCH = 0.45      # duración "estirada" (esteee…)
AIR = 0.05          # aire que se deja en cada borde del corte
MIN_PIECE = 0.12    # pedazos de keep_segment más cortos que esto se descartan


def _norm(word: str) -> str:
    return word.lower().strip(".,;:!?¿¡\"'…()")


def find_filler_spans(words: list[dict]) -> list[dict]:
    spans: list[dict] = []
    n = len(words)
    for i, w in enumerate(words):
        text = _norm(str(w.get("word", "")))
        if not text:
            continue
        start, end = float(w.get("start", 0)), float(w.get("end", 0))
        dur = end - start
        gap_before = start - float(words[i - 1].get("end", 0)) if i > 0 else 99.0
        gap_after = float(words[i + 1].get("start", 0)) - end if i < n - 1 else 99.0

        is_filler = False
        if text in ALWAYS_FILLERS:
            is_filler = True
        elif text in CONTEXTUAL_FILLERS:
            # Firma acústica de la duda: pausa alrededor o palabra estirada.
            if gap_after >= GAP and (gap_before >= GAP or dur > STRETCH):
                is_filler = True
            elif dur > STRETCH and gap_after >= 0.2:
                is_filler = True
        # "o sea" como par: "o" + "sea" seguidos con pausa después de "sea".
        elif text == "o" and i < n - 1 and _norm(str(words[i + 1].get("word", ""))) == "sea":
            nxt = words[i + 1]
            gap_after_pair = (
                float(words[i + 2].get("start", 0)) - float(nxt.get("end", 0))
                if i < n - 2 else 99.0
            )
            if gap_after_pair >= GAP and gap_before >= 0.2:
                spans.append({
                    "start": round(max(0.0, start - AIR), 3),
                    "end": round(float(nxt.get("end", 0)) + AIR, 3),
                    "word": "o sea",
                })
            continue

        if is_filler:
            spans.append({
                "start": round(max(0.0, start - AIR), 3),
                "end": round(end + AIR, 3),
                "word": text,
            })

    # merge de spans solapados (ej. "eh eh")
    spans.sort(key=lambda s: s["start"])
    merged: list[dict] = []
    for s in spans:
        if merged and s["start"] <= merged[-1]["end"] + 0.02:
            merged[-1]["end"] = max(merged[-1]["end"], s["end"])
            merged[-1]["word"] += f"+{s['word']}"
        else:
            merged.append(dict(s))
    return merged


def subtract_spans(keep: list[dict], spans: list[dict]) -> list[dict]:
    """Resta los spans de muletillas de los keep_segments."""
    out: list[dict] = []
    for seg in keep:
        pieces = [(float(seg["start"]), float(seg["end"]))]
        for sp in spans:
            nxt: list[tuple[float, float]] = []
            for a, b in pieces:
                if sp["end"] <= a or sp["start"] >= b:
                    nxt.append((a, b))
                    continue
                if sp["start"] > a:
                    nxt.append((a, sp["start"]))
                if sp["end"] < b:
                    nxt.append((sp["end"], b))
            pieces = nxt
        for a, b in pieces:
            if b - a >= MIN_PIECE:
                out.append({"start": round(a, 3), "end": round(b, 3)})
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id", help="ID del video (stem, sin extensión)")
    parser.add_argument("--transcripts-dir", default=str(TRANSCRIPTS_DIR))
    parser.add_argument("--cuts-dir", default=str(CUTS_DIR))
    parser.add_argument("--dry", action="store_true", help="solo reporta, no escribe")
    args = parser.parse_args()

    tpath = Path(args.transcripts_dir) / f"{args.video_id}.json"
    cpath = Path(args.cuts_dir) / f"{args.video_id}.json"
    if not tpath.exists():
        print(json.dumps({"ok": False, "error": f"sin transcript: {tpath}"}))
        return 0

    transcript = json.loads(tpath.read_text(encoding="utf-8"))
    words = transcript.get("words", [])
    duration = float(transcript.get("duration", 0)) or (
        float(words[-1].get("end", 0)) if words else 0.0
    )

    spans = find_filler_spans(words)
    if not spans:
        print(json.dumps({"ok": True, "fillers": 0, "removedSec": 0}))
        return 0

    if cpath.exists():
        cuts = json.loads(cpath.read_text(encoding="utf-8"))
        keep = cuts.get("keep_segments", [])
    else:
        cuts = {"video": f"{args.video_id}.mp4", "duration": round(duration, 3), "silences": []}
        keep = [{"start": 0.0, "end": round(duration, 3)}]

    new_keep = subtract_spans(keep, spans)
    removed = sum(s["end"] - s["start"] for s in keep) - sum(
        s["end"] - s["start"] for s in new_keep
    )

    cuts["keep_segments"] = new_keep
    cuts["fillers"] = spans
    # Las muletillas también van a "silences" (reason=filler) para auditoría/UI.
    cuts.setdefault("silences", []).extend(
        {"start": s["start"], "end": s["end"], "reason": f"filler:{s['word']}"} for s in spans
    )

    if not args.dry:
        cpath.parent.mkdir(parents=True, exist_ok=True)
        cpath.write_text(json.dumps(cuts, ensure_ascii=False, indent=2), encoding="utf-8")
        # Invalidar el _cut.mp4 cacheado: fue cortado con los keep_segments VIEJOS.
        # Si quedara, los subtítulos remapeados con el JSON nuevo se desincronizarían.
        stale_cut = Path(RAW_DIR) / f"{args.video_id}_cut.mp4"
        if stale_cut.exists():
            try:
                stale_cut.unlink()
                print(f"[fillers] _cut.mp4 viejo invalidado (se regenera)", file=sys.stderr)
            except OSError:
                pass

    print(json.dumps({
        "ok": True,
        "fillers": len(spans),
        "removedSec": round(removed, 2),
        "words": [s["word"] for s in spans],
        "out": str(cpath),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
