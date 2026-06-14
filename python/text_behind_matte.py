"""text_behind_matte.py — MATTE ESTÁTICO para el efecto "texto detrás del sujeto"
(versión barata, compuesta en Remotion por src/layers/text-behind-layer.tsx).

A diferencia de text_behind_subject.py (que BAKEA el texto frame-a-frame con
mediapipe → caro), este script produce UN solo PNG RGBA: el sujeto recortado de un
FRAME CLAVE, a RESOLUCIÓN COMPLETA del frame (NO recortado al bounding box). Remotion
lo compone encima del video con object-fit:cover, así que el matte DEBE conservar el
encuadre completo para alinear con el video. Es el contrato de la capa:

    matte PNG = mismo encuadre que el video, sujeto opaco, todo lo demás transparente.

Uso:
    python text_behind_matte.py <videoId> <segundos> [--long-form]

- Extrae el frame con ffmpeg (igual que cutout_subject.py).
- rembg (u2net_human_seg, modelo pre-descargado a {DATA_ROOT}/models/u2net).
- Guarda el RGBA SIN recortar al bbox en {DATA_ROOT}/assets/cutouts/{videoId}_tb_{ms}.png
  (la misma carpeta que sirve /api/cutouts/stream, que ya usa el frontend).
- Imprime JSON: {"ok": true, "file": "<nombre>.png"} (o {"ok": false, "error"}).

Cómo lo consume el builder:  project.textBehind = { phrase, color, matteFile: "<nombre>.png" }
y build-props.mjs lo convierte en matteUrl = /api/cutouts/stream?file=<nombre>.png.

OPT-IN: si rembg no está, falla limpio (ok:false) y el pipeline sigue: el layer
dibuja el texto sin recorte (degradación elegante).
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path

from config import DATA_ROOT  # type: ignore

CUTOUTS_DIR = Path(DATA_ROOT) / "assets" / "cutouts"
MODELS_DIR = Path(DATA_ROOT) / "models" / "u2net"


def _ffmpeg_exe() -> str:
    override = os.environ.get("VIRAL_FFMPEG_EXE")
    if override and Path(override).exists():
        return override
    tools = Path(DATA_ROOT).parent / "tools"
    if tools.exists():
        for d in tools.iterdir():
            cand = d / "bin" / "ffmpeg.exe"
            if d.name.startswith("ffmpeg") and cand.exists():
                return str(cand)
    return "ffmpeg"


def _find_video(video_id: str, long_form: bool) -> Path | None:
    base = Path(DATA_ROOT) / ("long_form/clips" if long_form else "raw")
    for ext in (".mp4", ".mov", ".mkv", ".webm", ".m4v"):
        p = base / f"{video_id}{ext}"
        if p.exists():
            return p
    return None


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "uso: text_behind_matte.py <videoId> <segundos>"}))
        return 1
    video_id = sys.argv[1]
    at = float(sys.argv[2])
    long_form = "--long-form" in sys.argv

    src = _find_video(video_id, long_form)
    if not src:
        print(json.dumps({"ok": False, "error": f"video no encontrado: {video_id}"}))
        return 1

    out_name = f"{video_id}_tb_{int(at * 1000)}.png"
    out_path = CUTOUTS_DIR / out_name
    if out_path.exists() and out_path.stat().st_size > 10_000:
        print(json.dumps({"ok": True, "file": out_name, "cached": True}))
        return 0

    try:
        os.environ.setdefault("U2NET_HOME", str(MODELS_DIR))
        from rembg import new_session, remove  # import tardío: opt-in
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"rembg no instalado: {e}"}))
        return 1

    CUTOUTS_DIR.mkdir(parents=True, exist_ok=True)
    frame_path = CUTOUTS_DIR / f"__tbframe_{video_id}.png"
    try:
        # Frame nítido a resolución original (sin escalar): el matte conserva el
        # encuadre completo para alinear con object-fit:cover del video en Remotion.
        r = subprocess.run(
            [_ffmpeg_exe(), "-y", "-ss", str(at), "-i", str(src),
             "-frames:v", "1", str(frame_path)],
            capture_output=True, timeout=120,
        )
        if r.returncode != 0 or not frame_path.exists():
            raise RuntimeError(f"ffmpeg: {r.stderr.decode(errors='ignore')[-200:]}")

        session = new_session("u2net_human_seg")
        result = remove(frame_path.read_bytes(), session=session)

        # CLAVE: NO recortar al bounding box. El PNG queda del MISMO tamaño que el
        # frame, con el sujeto en su posición original y el resto transparente — así
        # Remotion lo superpone exacto sobre el video (mismo encuadre cover).
        from PIL import Image  # type: ignore

        img = Image.open(io.BytesIO(result)).convert("RGBA")
        img.save(out_path, "PNG")
        print(json.dumps({"ok": True, "file": out_name}))
        return 0
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)[:300]}))
        return 1
    finally:
        try:
            frame_path.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
