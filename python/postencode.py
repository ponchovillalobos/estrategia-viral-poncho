"""Post-encode NVENC del MP4 que saca Remotion (OLA 1 — velocidad de render).

Remotion encodea SIEMPRE en CPU (libx264), aunque la máquina tenga NVENC/QSV/AMF
ocioso (se confirmó en H3: Remotion no expone encoders por hardware). Este script
RE-ENCODEA el .mp4 final con el encoder por hardware recomendado por hw_profile,
3-8× más rápido que x264 y con calidad equivalente (p5/cq19 ≈ crf18).

GATE CRÍTICO: si el encoder recomendado es libx264 (no hay GPU usable), NO se
re-encodea — sería un re-encode CPU→CPU inútil con pérdida de calidad. El script
sale 0 dejando el archivo intacto (no-op), para que el caller no tenga que saber
nada del hardware.

Preserva el audio con `-c:a copy` (sin tocar, sin pérdida). El video se re-encodea
con los args de hw_profile.ffmpeg_video_args('final'). Reemplaza el archivo de
entrada por el re-encodeado de forma atómica (escribe a un temporal y renombra).

NO inyecta decode hwaccel: el input es un MP4 H.264 ya plano de Remotion; el cuello
de botella es el ENCODE, y un decode hwaccel sobre un input puntual raro solo
agrega modos de fallo. safe_ffmpeg cae a libx264 si el NVENC falla en runtime.

Uso:
    python postencode.py <archivo.mp4>
    python postencode.py <archivo.mp4> --quality final|fast

Salida (stdout, última línea = JSON):
    {"ok": true,  "reencoded": true,  "encoder": "h264_nvenc", "path": "..."}
    {"ok": true,  "reencoded": false, "encoder": "libx264",    "reason": "cpu-only (no re-encode)"}
    {"ok": false, "reencoded": false, "error": "..."}
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from config import FFMPEG_PATH
from hw_profile import ffmpeg_video_args, ffmpeg_full_args
from lib.ffmpeg_safe_run import safe_ffmpeg


def _recommended_encoder() -> str:
    """Primer token tras '-c:v' en ffmpeg_video_args('final')."""
    args = ffmpeg_video_args("final")
    try:
        return args[args.index("-c:v") + 1]
    except (ValueError, IndexError):
        return "libx264"


def post_encode(path: Path, quality: str = "final") -> dict:
    if not path.exists():
        return {"ok": False, "reencoded": False, "error": f"no existe: {path}"}

    encoder = _recommended_encoder()
    # Solo vale la pena el post-encode con NVENC REAL (NVIDIA): ahí el re-encode por
    # hardware es 3-8x y compensa la pasada extra. Con QSV/AMF (iGPU) o CPU, RE-ENCODEAR
    # es una SEGUNDA pasada completa que normalmente es MÁS LENTA que dejar el x264
    # 'veryfast' de Remotion como entregable → no-op (una sola pasada). Esto arregla la
    # regresión de velocidad en equipos sin GPU NVIDIA dedicada (antes QSV hacía doble
    # encode). En NVENC sí re-encodea (el x264 de Remotion fue un intermedio 'ultrafast').
    if encoder != "h264_nvenc":
        return {
            "ok": True,
            "reencoded": False,
            "encoder": encoder,
            "reason": "sin NVENC (una sola pasada, no re-encode)",
            "path": str(path),
        }

    # Re-encode con el encoder por hardware. Audio copy (sin pérdida ni costo).
    ff = ffmpeg_full_args(input_path=None, quality=quality)
    tmp = path.with_name(path.stem + ".__postenc.mp4")
    try:
        tmp.unlink(missing_ok=True)
    except OSError:
        pass

    cmd = [
        str(FFMPEG_PATH), "-y",
        # -threads 0 = usar TODOS los núcleos en la parte de CPU (decode del input
        # H.264 plano de Remotion + filtros/escala). Aunque el ENCODE va por NVENC
        # (GPU), el decode y los filtros corren en CPU; sin esto ffmpeg puede limitar
        # los hilos y dejar núcleos ociosos. Es seguro con NVENC (no afecta el encoder
        # de hardware) y no cambia la calidad. Va antes de -i para cubrir el decode.
        "-threads", "0",
        "-i", str(path),
        "-map", "0",
        *ff["video_args"],
        "-c:a", "copy",
        "-pix_fmt", "yuv420p",
        *ff["container_args"],  # -movflags +faststart
        str(tmp),
    ]
    res = safe_ffmpeg(cmd, input_path=str(path))

    # Si safe_ffmpeg cayó a libx264 en runtime (NVENC falló), el video SÍ se
    # re-encodeó en CPU una vez — no es ideal pero el archivo es válido; lo
    # reportamos honestamente como encoder efectivo libx264.
    if res.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        last = ((res.stderr or "").strip().splitlines() or ["ffmpeg falló"])[-1]
        return {"ok": False, "reencoded": False, "error": last[:200], "path": str(path)}

    # Reemplazo atómico: el temporal pasa a ser el archivo final.
    try:
        os.replace(tmp, path)
    except OSError as e:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "reencoded": False, "error": f"replace falló: {e}", "path": str(path)}

    # Encoder efectivo: si la sesión forzó x264 (fallback runtime), reportarlo.
    import hw_profile  # noqa: PLC0415
    effective = "libx264" if hw_profile._session_forces_x264() else encoder  # type: ignore[attr-defined]
    return {"ok": True, "reencoded": True, "encoder": effective, "path": str(path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Post-encode NVENC del MP4 final de Remotion")
    parser.add_argument("path", help="MP4 a re-encodear (in-place)")
    parser.add_argument("--quality", choices=["final", "fast"], default="final")
    args = parser.parse_args()

    result = post_encode(Path(args.path), quality=args.quality)
    if result.get("reencoded"):
        print(f"[postencode] re-encodeado con {result.get('encoder')}: {Path(args.path).name}",
              file=sys.stderr)
    elif result.get("ok"):
        print(f"[postencode] skip ({result.get('reason', 'sin re-encode')}): {Path(args.path).name}",
              file=sys.stderr)
    else:
        print(f"[postencode] error: {result.get('error')}", file=sys.stderr)
    print(json.dumps(result, ensure_ascii=False))
    # Salir 0 también en no-op (libx264): el caller no debe tratar el skip como fallo.
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
