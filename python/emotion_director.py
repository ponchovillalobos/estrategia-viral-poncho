"""Director emocional (F1 auditoría suprema) — analiza CÓMO se dice, no solo qué.

Mide del audio de la voz (100% local, librosa, sin modelos pesados):
  - Curva de AROUSAL (intensidad emocional) por medio segundo: energía RMS +
    densidad de onsets, suavizada y normalizada 0-1. Es el "electrocardiograma"
    del video: dónde el speaker se enciende y dónde baja.
  - PICOS emocionales: los momentos de máxima intensidad (mín. 6s entre sí).
    El render los usa para zooms de reacción y para subir la densidad de FX.
  - Actividad de VOZ por tramo → curva de DUCKING para la música: cuando hay voz
    la música baja (x0.35), en silencios respira (x1.0). Lo que Wisecut cobra.
  - MOOD global (hype / tension / inspirador / chill / epico) combinando el
    arousal del audio con un léxico de valencia en español sobre el transcript.

Uso:
    python emotion_director.py <video_o_audio> [--transcript t.json] [--out out.json]

Salida (stdout JSON + archivo si --out):
    {"ok": true, "duration": 42.1, "mood": "hype", "arousalMean": 0.54,
     "peaks": [{"t": 12.5, "score": 0.92}, ...],
     "ducking": [{"t": 0.0, "v": 0.35}, {"t": 8.5, "v": 1.0}, ...],
     "arousal": [{"t": 0.0, "a": 0.31}, ...]}

Nunca rompe el pipeline: ante cualquier error imprime {"ok": false, ...} y exit 0.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import config  # noqa: F401 — inyecta ffmpeg portable en PATH (audioread lo usa)
except Exception:
    pass

# Léxico de valencia en español (positivo / negativo / hype). Suficiente para
# clasificar el mood global; un modelo de emociones puede reemplazarlo después.
POSITIVE = {
    "increible", "increíble", "exito", "éxito", "gana", "ganar", "ganancia", "crecer",
    "crecimiento", "logro", "lograr", "mejor", "feliz", "amor", "libre", "libertad",
    "oportunidad", "facil", "fácil", "gratis", "regalo", "premio", "celebrar", "wow",
}
NEGATIVE = {
    "error", "fracaso", "perder", "pierdes", "perdi", "perdí", "miedo", "peligro",
    "problema", "crisis", "deuda", "estafa", "mentira", "nunca", "imposible", "peor",
    "riesgo", "advertencia", "cuidado", "grave",
}
HYPE = {
    "ya", "ahora", "rapido", "rápido", "explota", "viral", "brutal", "locura", "boom",
    "atencion", "atención", "mira", "escucha", "urgente", "secreto", "nadie", "todos",
}


def _fail(msg: str) -> None:
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def analyze(media: Path, transcript_path: Path | None) -> dict:
    import numpy as np
    import librosa

    y, sr = librosa.load(str(media), sr=16000, mono=True)
    duration = float(len(y)) / sr
    if duration < 2.0:
        return {"ok": False, "error": "audio demasiado corto"}

    hop = 512
    # ── Curva de arousal: energía (RMS) + densidad de eventos (onset strength). ──
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    n = min(len(rms), len(onset))
    rms, onset = rms[:n], onset[:n]

    def norm(x: "np.ndarray") -> "np.ndarray":
        lo, hi = np.percentile(x, 5), np.percentile(x, 97)
        if hi - lo < 1e-9:
            return np.zeros_like(x)
        return np.clip((x - lo) / (hi - lo), 0.0, 1.0)

    arousal_raw = 0.65 * norm(rms) + 0.35 * norm(onset)
    # Suavizado (~0.8s) para que los micro-picos de consonantes no cuenten como emoción.
    win = max(1, int(0.8 * sr / hop))
    kernel = np.ones(win) / win
    arousal_smooth = np.convolve(arousal_raw, kernel, mode="same")

    # Re-muestrear a una grilla de 0.5s (suficiente para dirigir FX, JSON chico).
    frame_times = librosa.frames_to_time(np.arange(n), sr=sr, hop_length=hop)
    grid = np.arange(0.0, duration, 0.5)
    arousal_grid = np.interp(grid, frame_times, arousal_smooth)
    arousal = [{"t": round(float(t), 2), "a": round(float(a), 3)} for t, a in zip(grid, arousal_grid)]

    # ── Picos emocionales: máximos locales con separación mínima de 6s. ──
    order = np.argsort(arousal_grid)[::-1]
    peaks: list[dict] = []
    for idx in order:
        t = float(grid[idx])
        if t < 1.0 or t > duration - 1.0:
            continue
        if any(abs(t - p["t"]) < 6.0 for p in peaks):
            continue
        peaks.append({"t": round(t, 2), "score": round(float(arousal_grid[idx]), 3)})
        if len(peaks) >= 5:
            break
    peaks.sort(key=lambda p: p["t"])

    # ── Voz activa → curva de ducking de música. ──
    # librosa.effects.split marca los tramos NO silenciosos (la voz).
    intervals = librosa.effects.split(y, top_db=32, hop_length=hop)
    voice = np.zeros(len(grid), dtype=bool)
    for s, e in intervals:
        t0, t1 = s / sr, e / sr
        voice |= (grid >= t0 - 0.25) & (grid <= t1 + 0.25)
    # Histéresis: pausas cortas (<1.5s) NO sueltan el duck — si no, la música
    # "bombea" arriba/abajo entre frase y frase (suena amateur). Solo respira
    # en silencios largos de verdad (transiciones, pausas dramáticas).
    MIN_BREATH = 1.5
    i = 0
    while i < len(voice):
        if not voice[i]:
            j = i
            while j < len(voice) and not voice[j]:
                j += 1
            if (j - i) * 0.5 < MIN_BREATH and i > 0 and j < len(voice):
                voice[i:j] = True  # hueco corto entre voz → sigue duck
            i = j
        else:
            i += 1
    DUCK, FULL = 0.35, 1.0
    ducking: list[dict] = []
    prev: float | None = None
    for i, t in enumerate(grid):
        v = DUCK if voice[i] else FULL
        if v != prev:  # solo puntos de cambio → JSON compacto
            ducking.append({"t": round(float(t), 2), "v": v})
            prev = v
    if not ducking or ducking[0]["t"] > 0:
        ducking.insert(0, {"t": 0.0, "v": DUCK if (len(voice) and voice[0]) else FULL})

    # ── Mood global: arousal del audio + valencia del texto. ──
    pos = neg = hype = total_words = 0
    if transcript_path and transcript_path.exists():
        try:
            tdata = json.loads(transcript_path.read_text(encoding="utf-8"))
            for w in tdata.get("words", []):
                word = str(w.get("word", "")).lower().strip(".,;:!?¿¡\"'")
                if not word:
                    continue
                total_words += 1
                if word in POSITIVE:
                    pos += 1
                elif word in NEGATIVE:
                    neg += 1
                if word in HYPE:
                    hype += 1
        except Exception:
            pass

    arousal_mean = float(np.mean(arousal_grid))
    valence = (pos - neg) / max(1, total_words) * 100  # % neto de palabras positivas
    hype_density = hype / max(1, total_words) * 100
    if arousal_mean >= 0.5 and (hype_density >= 1.5 or valence >= 0):
        mood = "hype"
    elif arousal_mean >= 0.5 and valence < 0:
        mood = "tension"
    elif arousal_mean < 0.35 and valence >= 0:
        mood = "inspirador"
    elif arousal_mean < 0.35:
        mood = "chill"
    else:
        mood = "epico"

    return {
        "ok": True,
        "duration": round(duration, 2),
        "mood": mood,
        "arousalMean": round(arousal_mean, 3),
        "valence": round(valence, 2),
        "peaks": peaks,
        "ducking": ducking,
        "arousal": arousal,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("media", help="video o audio a analizar")
    parser.add_argument("--transcript", default=None, help="transcript JSON (para el mood)")
    parser.add_argument("--out", default=None, help="archivo de salida JSON")
    args = parser.parse_args()

    media = Path(args.media)
    if not media.exists():
        _fail(f"no existe: {media}")

    try:
        result = analyze(media, Path(args.transcript) if args.transcript else None)
    except Exception as e:  # noqa: BLE001 — best-effort siempre
        result = {"ok": False, "error": str(e)}

    if args.out and result.get("ok"):
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    # stdout compacto (sin la curva completa) para los callers que parsean la última línea.
    summary = {k: v for k, v in result.items() if k != "arousal"}
    summary["arousalPoints"] = len(result.get("arousal", []))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
