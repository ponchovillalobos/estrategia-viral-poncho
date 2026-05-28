"""Transcribe un video con WhisperX y produce JSON con timestamps palabra-a-palabra.

Uso:
  python transcribe.py <ruta_video.mp4>
  python transcribe.py --download-model small
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from config import (
    CUTS_DIR,
    FFMPEG_PATH,
    RAW_DIR,
    TRANSCRIPTS_DIR,
    WHISPER_COMPUTE_TYPE,
    WHISPER_LANGUAGE,
    WHISPER_MODEL,
    ensure_dirs,
)


def extract_audio(video_path: Path, out_wav: Path) -> None:
    """Extrae pista de audio a WAV mono 16kHz (formato preferido por Whisper)."""
    cmd = [
        str(FFMPEG_PATH),
        "-y",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(out_wav),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def transcribe(video_path: Path, model_size: str = WHISPER_MODEL) -> dict[str, Any]:
    """Transcribe + alinea palabras. Retorna dict con words[]."""
    import whisperx

    device = "cpu"
    batch_size = 8

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "audio.wav"
        extract_audio(video_path, wav_path)

        print(f"[transcribe] cargando modelo whisperx '{model_size}'...", file=sys.stderr)
        model = whisperx.load_model(
            model_size,
            device=device,
            compute_type=WHISPER_COMPUTE_TYPE,
            language=WHISPER_LANGUAGE,
        )

        print("[transcribe] transcribiendo...", file=sys.stderr)
        audio = whisperx.load_audio(str(wav_path))
        result = model.transcribe(audio, batch_size=batch_size, language=WHISPER_LANGUAGE)

        print("[transcribe] cargando modelo de alineación...", file=sys.stderr)
        align_model, metadata = whisperx.load_align_model(language_code=WHISPER_LANGUAGE, device=device)

        print("[transcribe] alineando palabras...", file=sys.stderr)
        aligned = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            device,
            return_char_alignments=False,
        )

        words: list[dict[str, Any]] = []
        for segment in aligned.get("segments", []):
            for w in segment.get("words", []):
                if "start" in w and "end" in w:
                    words.append(
                        {
                            "word": w.get("word", "").strip(),
                            "start": round(float(w["start"]), 3),
                            "end": round(float(w["end"]), 3),
                            "score": round(float(w.get("score", 0.0)), 3),
                        }
                    )

        return {
            "video": video_path.name,
            "language": WHISPER_LANGUAGE,
            "model": model_size,
            "duration": round(len(audio) / 16000.0, 3),
            "words": words,
        }


def download_model(model_size: str) -> None:
    import whisperx
    print(f"[download] descargando whisperx model '{model_size}'...")
    whisperx.load_model(model_size, device="cpu", compute_type=WHISPER_COMPUTE_TYPE, language=WHISPER_LANGUAGE)
    print("[download] descargando alignment model 'es'...")
    whisperx.load_align_model(language_code=WHISPER_LANGUAGE, device="cpu")
    print("OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", nargs="?", help="Path al video .mp4 (o solo nombre si está en raw/)")
    parser.add_argument("--download-model", metavar="SIZE", help="Descarga el modelo sin transcribir")
    parser.add_argument("--out", help="Path JSON de salida (default: transcripts/<video>.json)")
    args = parser.parse_args()

    ensure_dirs()

    if args.download_model:
        download_model(args.download_model)
        return 0

    if not args.video:
        parser.error("Especificá un video o --download-model")

    video_path = Path(args.video)
    if not video_path.is_absolute() and not video_path.exists():
        video_path = RAW_DIR / video_path

    if not video_path.exists():
        print(f"[error] video no encontrado: {video_path}", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else TRANSCRIPTS_DIR / f"{video_path.stem}.json"

    t0 = time.time()
    result = transcribe(video_path)
    elapsed = time.time() - t0

    result["meta"] = {"elapsed_sec": round(elapsed, 1)}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "out": str(out_path), "words": len(result["words"]), "elapsed_sec": round(elapsed, 1)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
