#!/usr/bin/env python
"""xtts.py — Clonar tu voz con XTTS-v2 (Coqui TTS, gratis, local).

Toma una muestra de tu voz (~6-30s WAV mono 22050Hz idealmente) + el texto y
sintetiza un WAV que suena como vos. La PRIMERA VEZ que se llama, coqui-tts
descarga el modelo (~1.8GB) a `~/.local/share/tts/` o equivalente — eso tarda
unos minutos y solo pasa una vez.

Uso:
    python xtts.py "<texto>" <output.wav> --speaker <sample.wav> [--lang es]

Salida (stdout): JSON {ok, path, durationSec} o {ok:false, error}.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import wave
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("text", help="texto a sintetizar")
    p.add_argument("out_wav", help="WAV de salida")
    p.add_argument("--speaker", required=True, help="WAV de muestra de tu voz (6-30s)")
    p.add_argument("--lang", default="es", help="idioma destino (es/en/pt/fr/it/de/...)")
    args = p.parse_args()

    speaker = Path(args.speaker)
    if not speaker.exists():
        print(json.dumps({"ok": False, "error": f"sample no existe: {speaker}"}))
        return 1
    if not args.text.strip():
        print(json.dumps({"ok": False, "error": "texto vacío"}))
        return 1

    # Aceptar TOS del modelo sin prompt interactivo.
    os.environ.setdefault("COQUI_TOS_AGREED", "1")
    try:
        from TTS.api import TTS  # legacy module name, sigue funcionando en coqui-tts.
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"coqui-tts no instalado: {exc}"}))
        return 1

    try:
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
        out_path = Path(args.out_wav)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tts.tts_to_file(
            text=args.text,
            speaker_wav=str(speaker),
            language=args.lang,
            file_path=str(out_path),
        )
        if not out_path.exists() or out_path.stat().st_size < 1000:
            print(json.dumps({"ok": False, "error": "no se generó el WAV"}))
            return 1
        try:
            with wave.open(str(out_path), "rb") as w:
                duration = w.getnframes() / float(w.getframerate())
        except Exception:
            duration = None
        print(json.dumps({"ok": True, "path": str(out_path), "durationSec": duration}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)[:500]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
