"""Fondo con IA: separa la persona del fondo y compone un MP4 opaco.

Uso:
    python remove_background.py <video_in> <mp4_out> [modo]

modo: "blur" (default) → fondo desenfocado + oscurecido (look profundidad de campo).
      "color:#RRGGBB"   → reemplaza el fondo por un color sólido.

Usa mediapipe Tasks ImageSegmenter (selfie_segmenter.tflite). Compone TODO en Python
y exporta un MP4 normal (libx264 + audio original), así no dependemos de webm con
alfa (que el ffmpeg local no soporta de forma confiable). Remotion solo usa el MP4
resultante como video base — sin capas nuevas.

Salida (stdout, JSON): {"ok": true, "frames": N, "out": "..."} | {"ok": false, "error": "..."}.
"""
import sys
import json
import subprocess
from pathlib import Path

try:
    import config  # noqa: F401
    from config import FFMPEG_PATH
except Exception:
    FFMPEG_PATH = Path("ffmpeg.exe")

MODEL = Path(__file__).resolve().parent / "models" / "selfie_segmenter.tflite"


def parse_color(mode: str):
    if mode.startswith("color:"):
        hexv = mode.split(":", 1)[1].lstrip("#")
        if len(hexv) == 6:
            r = int(hexv[0:2], 16)
            g = int(hexv[2:4], 16)
            b = int(hexv[4:6], 16)
            return (b, g, r)  # BGR para cv2
    return None


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "uso: remove_background.py <in> <out> [modo]"}))
        return
    inp, out = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else "blur"
    solid = parse_color(mode)
    if not MODEL.exists():
        print(json.dumps({"ok": False, "error": f"falta modelo {MODEL}"}))
        return
    try:
        import cv2
        import numpy as np
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        opts = vision.ImageSegmenterOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(MODEL)),
            output_category_mask=True,
            running_mode=vision.RunningMode.VIDEO,
        )
        segmenter = vision.ImageSegmenter.create_from_options(opts)

        cap = cv2.VideoCapture(inp)
        if not cap.isOpened():
            print(json.dumps({"ok": False, "error": "no se pudo abrir el video"}))
            return
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        cmd = [
            str(FFMPEG_PATH), "-y",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps}", "-i", "-",
            "-i", inp,
            "-map", "0:v", "-map", "1:a?",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", out,
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

        # Kernel de blur proporcional al tamaño para un desenfoque parejo.
        ksigma = max(8, int(min(w, h) * 0.03))

        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            ts_ms = int(idx / fps * 1000)
            res = segmenter.segment_for_video(mp_img, ts_ms)
            cat = res.category_mask.numpy_view()  # 0 = fondo, !=0 = persona
            a = np.where(cat != 0, 1.0, 0.0).astype(np.float32)
            a = cv2.GaussianBlur(a, (9, 9), 0)  # suavizar borde
            a = a[:, :, None]

            if solid is not None:
                bg = np.empty_like(frame)
                bg[:] = solid
            else:
                bg = cv2.GaussianBlur(frame, (0, 0), sigmaX=ksigma)
                bg = (bg.astype(np.float32) * 0.55).astype(np.uint8)  # oscurecer fondo

            comp = (frame.astype(np.float32) * a + bg.astype(np.float32) * (1.0 - a)).astype(np.uint8)
            if proc.stdin:
                proc.stdin.write(np.ascontiguousarray(comp).tobytes())
            idx += 1

        if proc.stdin:
            proc.stdin.close()
        proc.wait()
        cap.release()
        segmenter.close()
        print(json.dumps({"ok": proc.returncode == 0, "frames": idx, "out": out}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()
