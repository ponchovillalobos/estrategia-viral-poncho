#!/usr/bin/env python
"""text_behind_subject.py
Produce un mp4 donde una FRASE aparece DETRÁS del sujeto (look CapCut clásico):
    fondo (frame original) → texto grande renderizado → persona del frame
    "pegada" encima usando la matte de mediapipe selfie segmenter.

Uso:
    python text_behind_subject.py <video_in> <video_out> "<phrase>" [--color RRGGBB]

Salida (stdout): JSON `{ok, frames}` o `{ok:false, error}`. El video se escribe
en `video_out` (mp4 h264 via ffmpeg).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

try:
    from hw_profile import ffmpeg_video_args
except Exception:  # noqa: BLE001 — fallback x264 si el perfil no carga
    def ffmpeg_video_args(quality: str = "final") -> list[str]:
        return ["-c:v", "libx264", "-crf", "18", "-preset", "fast"]


MODEL = Path(__file__).parent / "models" / "selfie_segmenter.tflite"


def hex_to_bgr(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) != 6:
        return (255, 255, 255)
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return (b, g, r)  # OpenCV usa BGR


def fit_font_scale(
    text: str, frame_w: int, font: int, thickness: int, target_frac: float = 0.85
) -> float:
    target_px = frame_w * target_frac
    scale = 1.0
    for _ in range(40):
        (tw, _th), _ = cv2.getTextSize(text, font, scale, thickness=thickness)
        if tw < target_px:
            scale += 0.5
        else:
            break
    return scale


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("video_in")
    p.add_argument("video_out")
    p.add_argument("phrase")
    p.add_argument("--color", default="ffffff", help="color del texto en hex RRGGBB")
    args = p.parse_args()

    if not MODEL.exists():
        print(json.dumps({"ok": False, "error": f"falta modelo {MODEL}"}))
        return 1

    if not shutil.which("ffmpeg"):
        print(json.dumps({"ok": False, "error": "ffmpeg no está en PATH"}))
        return 1

    cap = cv2.VideoCapture(args.video_in)
    if not cap.isOpened():
        print(json.dumps({"ok": False, "error": f"no se pudo abrir input: {args.video_in}"}))
        return 1

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if w == 0 or h == 0:
        print(json.dumps({"ok": False, "error": "video sin dimensiones"}))
        return 1

    # ffmpeg stdin → h264 mp4 (formato que reproduce todos lados, incluyendo Remotion).
    ff = subprocess.Popen(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24",
            "-s", f"{w}x{h}", "-r", str(fps),
            "-i", "-",
            *ffmpeg_video_args("final"), "-pix_fmt", "yuv420p",
            args.video_out,
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    assert ff.stdin is not None

    # mediapipe selfie segmenter en modo VIDEO.
    base = BaseOptions(model_asset_path=str(MODEL))
    seg_opts = vision.ImageSegmenterOptions(
        base_options=base,
        running_mode=vision.RunningMode.VIDEO,
        output_category_mask=True,
    )
    segmenter = vision.ImageSegmenter.create_from_options(seg_opts)

    font = cv2.FONT_HERSHEY_DUPLEX
    thickness = max(6, int(h * 0.008))
    text = args.phrase.upper()
    scale = fit_font_scale(text, w, font, thickness)
    (tw, th), _baseline = cv2.getTextSize(text, font, scale, thickness=thickness)
    text_x = (w - tw) // 2
    text_y = (h + th) // 2
    color_bgr = hex_to_bgr(args.color)

    frame_idx = 0
    last_log = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            ts_ms = int((frame_idx / fps) * 1000)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            seg = segmenter.segment_for_video(mp_image, ts_ms)
            # selfie segmenter: category_mask es uint8 con 0 = fondo, 255 = persona.
            mask = seg.category_mask.numpy_view()
            fg = mask >= 128

            # 1) Renderizar texto sobre una copia del frame (capa "fondo + texto").
            bg = frame.copy()
            # Sombra suave + texto en color para legibilidad sobre cualquier fondo.
            cv2.putText(bg, text, (text_x + 4, text_y + 4), font, scale,
                        (0, 0, 0), thickness=thickness + 2, lineType=cv2.LINE_AA)
            cv2.putText(bg, text, (text_x, text_y), font, scale,
                        color_bgr, thickness=thickness, lineType=cv2.LINE_AA)

            # 2) Pegar la persona del frame original encima del fondo-con-texto.
            out_frame = bg
            out_frame[fg] = frame[fg]

            ff.stdin.write(out_frame.tobytes())
            frame_idx += 1
            if frame_idx - last_log >= 30:
                print(f"[text-behind] {frame_idx}/{total}", file=sys.stderr)
                last_log = frame_idx
    finally:
        cap.release()
        try:
            ff.stdin.close()
        except Exception:
            pass
        ff.wait(timeout=120)

    print(json.dumps({"ok": True, "frames": frame_idx}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
