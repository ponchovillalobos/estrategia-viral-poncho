"""Recorta al SUJETO de un frame del video (rembg local, sin API) para la
tarjeta editorial de COLLAGE (Ola 6): papel recortado con borde de tijera.

  python cutout_subject.py <videoId> <segundos> [--long-form]

- Extrae el frame con ffmpeg del raw (o clip de largos con --long-form).
- Lo pasa por rembg (modelo u2net_human_seg, pre-descargado a
  {DATA_ROOT}/models/u2net — sin red si ya está).
- Guarda PNG con alpha en {DATA_ROOT}/assets/cutouts/{videoId}_{ms}.png.
- Imprime JSON: {"ok": true, "file": "<nombre>.png"} (o {"ok": false, "error"}).

OPT-IN: si rembg no está instalado en el venv, falla limpio con ok:false y el
pipeline sigue sin tarjeta de collage (cero ruptura).
"""

from __future__ import annotations

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
        print(json.dumps({"ok": False, "error": "uso: cutout_subject.py <videoId> <segundos>"}))
        return 1
    video_id = sys.argv[1]
    at = float(sys.argv[2])
    long_form = "--long-form" in sys.argv

    src = _find_video(video_id, long_form)
    if not src:
        print(json.dumps({"ok": False, "error": f"video no encontrado: {video_id}"}))
        return 1

    out_name = f"{video_id}_{int(at * 1000)}.png"
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
    frame_path = CUTOUTS_DIR / f"__frame_{video_id}.png"
    try:
        # Frame nítido a la altura pedida (escala a 1080 de ancho máx).
        r = subprocess.run(
            [_ffmpeg_exe(), "-y", "-ss", str(at), "-i", str(src),
             "-frames:v", "1", "-vf", "scale='min(1080,iw)':-2", str(frame_path)],
            capture_output=True, timeout=120,
        )
        if r.returncode != 0 or not frame_path.exists():
            raise RuntimeError(f"ffmpeg: {r.stderr.decode(errors='ignore')[-200:]}")

        session = new_session("u2net_human_seg")
        result = remove(frame_path.read_bytes(), session=session)

        # Recortar al BOUNDING BOX del alpha (+4% de margen): el PNG sale justo
        # al sujeto — sin esto el recorte se veía diminuto (frame entero
        # transparente alrededor). PIL ya viene con rembg.
        import io as _io

        from PIL import Image  # type: ignore

        img = Image.open(_io.BytesIO(result)).convert("RGBA")
        bbox = img.getchannel("A").getbbox()
        if bbox:
            mx = int((bbox[2] - bbox[0]) * 0.04)
            my = int((bbox[3] - bbox[1]) * 0.04)
            img = img.crop((
                max(0, bbox[0] - mx), max(0, bbox[1] - my),
                min(img.width, bbox[2] + mx), min(img.height, bbox[3] + my),
            ))
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
