"""Detección de cara por frame para reframe inteligente vertical/horizontal.

Usa MediaPipe Tasks API (BlazeFace short-range) — la API legacy `mp.solutions`
fue removida en mediapipe>=0.10.10. Requiere el modelo .tflite descargado en
python/models/blaze_face_short_range.tflite (~225 KB, se descarga con setup).

Uso:
  python face_tracking.py <input.mp4> <output.json>
  python face_tracking.py <input.mp4> <output.json> --sample-every 5
  python face_tracking.py <input.mp4> <output.json> --single-frame    # MVP rápido

Output JSON:
  {
    "video": "<path>",
    "width": 1920, "height": 1080, "fps": 30, "duration": 12.4,
    "samples": [{"t": 0.0, "cx": 0.52, "cy": 0.45, "w": 0.18, "h": 0.32}, ...],
    "single_frame": false,
    "detection_rate": 0.95
  }

Coordenadas normalizadas [0,1]:
  - cx, cy: centro del bbox
  - w, h: ancho/alto del bbox
  - t: tiempo en segundos

Si NUNCA hay cara, samples queda vacío y el caller debe fallback a center-crop.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

try:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
except ImportError as exc:
    print(f"[error] falta dependencia: {exc}", file=sys.stderr)
    print("Instalá con: pip install mediapipe opencv-python", file=sys.stderr)
    sys.exit(1)

# Modelo .tflite — se descarga en setup. ~225 KB.
MODEL_PATH = Path(__file__).parent / "models" / "blaze_face_short_range.tflite"


def smooth_ema(history: deque, alpha: float = 0.7) -> tuple[float, float, float, float] | None:
    """EMA exponential moving average sobre los últimos N bboxes para evitar flickering."""
    if not history:
        return None
    items = list(history)
    smoothed = items[0]
    for next_bbox in items[1:]:
        smoothed = tuple(alpha * next_bbox[i] + (1 - alpha) * smoothed[i] for i in range(4))
    return smoothed


def make_detector():
    """Crea el FaceDetector de Tasks API."""
    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Modelo .tflite no encontrado en {MODEL_PATH}. "
            "Descargalo desde https://storage.googleapis.com/mediapipe-models/"
            "face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
        )
    base_options = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    options = mp_vision.FaceDetectorOptions(
        base_options=base_options,
        min_detection_confidence=0.4,
    )
    return mp_vision.FaceDetector.create_from_options(options)


def detect_face_in_frame(detector, frame_rgb, frame_w: int, frame_h: int) -> tuple[float, float, float, float] | None:
    """Devuelve (cx, cy, w, h) NORMALIZADO [0,1] del rostro de mayor confianza, o None."""
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
    result = detector.detect(mp_image)
    if not result.detections:
        return None
    # Tomar la cara con mayor score (típicamente el speaker dominante)
    best = max(
        result.detections,
        key=lambda d: d.categories[0].score if d.categories else 0,
    )
    bbox = best.bounding_box  # En píxeles
    cx = (bbox.origin_x + bbox.width / 2) / frame_w
    cy = (bbox.origin_y + bbox.height / 2) / frame_h
    w = bbox.width / frame_w
    h = bbox.height / frame_h
    return (cx, cy, w, h)


def process_video(
    input_path: Path,
    output_path: Path,
    sample_every: int = 5,
    single_frame: bool = False,
    log_progress: bool = True,
) -> dict:
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0.0

    detector = make_detector()

    samples: list[dict] = []
    bbox_history: deque = deque(maxlen=5)
    detected_count = 0
    sampled_count = 0
    frame_idx = 0
    middle_frame = total_frames // 2 if total_frames > 0 else 0

    try:
        while True:
            ret, frame_bgr = cap.read()
            if not ret:
                break

            if single_frame:
                if frame_idx != middle_frame:
                    frame_idx += 1
                    continue
            else:
                if frame_idx % sample_every != 0:
                    frame_idx += 1
                    continue

            sampled_count += 1
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            detection = detect_face_in_frame(detector, frame_rgb, width, height)
            t = frame_idx / fps

            if detection:
                bbox_history.append(detection)
                detected_count += 1
            elif bbox_history:
                # No detectó pero hay historial — repetir último para suavizar gap
                bbox_history.append(bbox_history[-1])
            else:
                # Aún no hay cara detectada en ningún frame anterior — saltar este sample
                frame_idx += 1
                continue

            smoothed = smooth_ema(bbox_history, alpha=0.7)
            if smoothed:
                cx, cy, w, h = smoothed
                samples.append({
                    "t": round(t, 3),
                    "cx": round(max(0.0, min(1.0, cx)), 4),
                    "cy": round(max(0.0, min(1.0, cy)), 4),
                    "w": round(max(0.0, min(1.0, w)), 4),
                    "h": round(max(0.0, min(1.0, h)), 4),
                })

            if log_progress and sampled_count > 0 and sampled_count % 60 == 0:
                pct = (frame_idx / total_frames * 100) if total_frames else 0
                print(
                    f"[face] frame {frame_idx}/{total_frames} ({pct:.0f}%) · "
                    f"detectados {detected_count}/{sampled_count}",
                    file=sys.stderr,
                )

            frame_idx += 1
            if single_frame:
                break
    finally:
        cap.release()
        detector.close()

    detection_rate = detected_count / max(1, sampled_count)
    result = {
        "video": str(input_path),
        "width": width,
        "height": height,
        "fps": fps,
        "duration": round(duration, 3),
        "single_frame": single_frame,
        "sample_every": sample_every if not single_frame else 0,
        "samples": samples,
        "detected_count": detected_count,
        "sampled_count": sampled_count,
        "detection_rate": round(detection_rate, 3),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"[ok] {len(samples)} samples · detection_rate={detection_rate:.0%} · "
        f"out={output_path}",
        file=sys.stderr,
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Path al video .mp4")
    parser.add_argument("output", help="Path donde guardar el JSON")
    parser.add_argument(
        "--sample-every",
        type=int,
        default=5,
        help="Muestrear cada N frames (default 5 ≈ 6Hz a 30fps). Más alto = más rápido.",
    )
    parser.add_argument(
        "--single-frame",
        action="store_true",
        help="MVP rápido: detectar la cara solo en el frame del medio. Crop estático.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"[error] no existe {input_path}", file=sys.stderr)
        return 1

    try:
        result = process_video(
            input_path,
            output_path,
            sample_every=args.sample_every,
            single_frame=args.single_frame,
        )
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    print(json.dumps({
        "ok": True,
        "samples": len(result["samples"]),
        "detection_rate": result["detection_rate"],
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
