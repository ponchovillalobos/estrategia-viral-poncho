"""Runner de ffmpeg con FALLBACK runtime a libx264 (H3).

`safe_ffmpeg(cmd, input_path=...)` corre un comando ffmpeg; si falla por un error
de HARDWARE (nvenc/nvdec/cuda/qsv/amf/"no encoder available"), marca la sesión con
`hw_profile.force_x264_for_session(reason)` y REINTENTA el mismo comando pero con los
args de aceleración por hardware quitados (decode hwaccel fuera, encoder GPU → libx264
-preset fast -crf 18). Devuelve el CompletedProcess del intento FINAL.

Si el error NO es de hardware (input corrupto, filtro mal escrito, disco lleno…),
NO reintenta: devuelve el primer resultado tal cual para no enmascarar el bug real.

Esto es el complemento de runtime de `hw_profile.ffmpeg_full_args()`: aquel elige el
encoder por adelantado según el probe; éste cubre el caso en que el probe pasó pero el
encode REAL de producción falla igual (driver que se cae, VRAM que se agotó a mitad,
codec raro de un input puntual)."""
from __future__ import annotations

import subprocess
import sys

# Import robusto: el paquete vive en python/lib, pero los scripts corren con cwd=python
# (sys.path incluye python/). Soportar ambos: `from lib.ffmpeg_safe_run import …` y, si
# se ejecuta el módulo suelto, `import hw_profile` directo.
try:  # pragma: no cover - depende del layout de ejecución
    import hw_profile
except Exception:  # noqa: BLE001
    import os as _os

    sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    import hw_profile  # type: ignore[no-redef]


# Encoders por hardware que sabemos reemplazar por libx264 en el fallback.
_HW_ENCODERS = ("h264_nvenc", "hevc_nvenc", "h264_qsv", "hevc_qsv", "h264_amf", "hevc_amf")

# Flags de tuning ESPECÍFICOS de los encoders por hardware (con un valor cada uno).
# Cuando reemplazamos el -c:v hw_encoder por libx264, hay que QUITAR estos flags que
# venían pegados: -preset p5/-rc vbr/-cq 19/-qp_i… no son válidos para libx264 (un
# `-preset p5` haría fallar x264). Coinciden con lo que emite hw_profile.ffmpeg_video_args.
_HW_TUNING_FLAGS = frozenset({
    "-preset", "-rc", "-cq", "-b:v", "-spatial-aq", "-temporal-aq",  # nvenc
    "-global_quality",                                               # qsv (-preset ya está)
    "-quality", "-qp_i", "-qp_p",                                    # amf (-rc ya está)
})

# Señales en el stderr que delatan un fallo de ACELERACIÓN por hardware (no un error
# de contenido). Si aparece cualquiera, vale la pena reintentar en CPU.
_HW_ERROR_MARKERS = (
    "nvenc",
    "nvdec",
    "cuda",
    "cuvid",
    "qsv",
    "amf",
    "no encoder available",
    "no capable devices",
    "no nvenc capable devices",
    "cannot load nvcuda",
    "hwaccel",
    "device creation failed",
    "openencodesessionex failed",
)


def _looks_like_hw_error(stderr: str) -> bool:
    low = (stderr or "").lower()
    return any(marker in low for marker in _HW_ERROR_MARKERS)


def _last_line(stderr: str) -> str:
    lines = [ln.strip() for ln in (stderr or "").splitlines() if ln.strip()]
    return lines[-1] if lines else "ffmpeg falló sin stderr"


def _strip_hw_args(cmd: list[str]) -> list[str]:
    """Devuelve una COPIA de `cmd` sin los args de aceleración por hardware.

    - Quita `-hwaccel X` y `-hwaccel_output_format X` (el flag y su valor).
    - Reemplaza `-c:v <hw_encoder>` (o `-codec:v`/`-vcodec`) por
      `-c:v libx264 -preset fast -crf 18`, y quita los flags de tuning del encoder
      hw que venían pegados (-preset p5/-rc/-cq/-qp_i…), que no valen para libx264.
    Preserva TODO lo demás (filtros, -vf, audio, -r, -pix_fmt, mapeos…) intacto."""
    out: list[str] = []
    i = 0
    n = len(cmd)
    while i < n:
        tok = cmd[i]
        # Flags hwaccel: consumen el flag + su valor.
        if tok in ("-hwaccel", "-hwaccel_output_format", "-hwaccel_device"):
            i += 2  # saltar flag y valor
            continue
        # Selección de encoder de video.
        if tok in ("-c:v", "-codec:v", "-vcodec"):
            enc = cmd[i + 1] if i + 1 < n else ""
            if enc in _HW_ENCODERS:
                out.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "18"])
                i += 2
                # Consumir los flags de tuning del encoder hw que siguen (flag+valor),
                # hasta el primer token que no sea uno de ellos.
                while i + 1 < n and cmd[i] in _HW_TUNING_FLAGS:
                    i += 2
                continue
            # encoder no-hw (libx264, copy, etc.) → dejar tal cual
            out.append(tok)
            i += 1
            continue
        out.append(tok)
        i += 1
    return out


def _uses_hw(cmd: list[str]) -> bool:
    """¿El comando trae algún arg de aceleración por hardware que valga la pena quitar?"""
    for i, tok in enumerate(cmd):
        if tok in ("-hwaccel", "-hwaccel_output_format", "-hwaccel_device"):
            return True
        if tok in ("-c:v", "-codec:v", "-vcodec"):
            nxt = cmd[i + 1] if i + 1 < len(cmd) else ""
            if nxt in _HW_ENCODERS:
                return True
    return False


def safe_ffmpeg(
    cmd: list[str],
    *,
    input_path: str | None = None,
    **run_kwargs,
) -> subprocess.CompletedProcess:
    """Corre `cmd` (lista de args ffmpeg) con fallback runtime a libx264.

    Devuelve el `subprocess.CompletedProcess` del intento final. NUNCA lanza por
    returncode (no usa check=True internamente); el caller decide qué hacer con
    `.returncode`. `input_path` se acepta por simetría con `ffmpeg_full_args`
    (útil para logging/diagnóstico); el strip opera sobre `cmd`.
    """
    # Forzamos captura de texto para poder inspeccionar el stderr.
    run_kwargs.pop("check", None)  # el fallback necesita ver el returncode, no excepción
    run_kwargs.setdefault("capture_output", True)
    run_kwargs.setdefault("text", True)

    first = subprocess.run(cmd, **run_kwargs)
    if first.returncode == 0:
        return first

    stderr = first.stderr or ""
    if not _looks_like_hw_error(stderr):
        # Error que NO es de hardware: no tiene sentido reintentar en CPU.
        return first
    if not _uses_hw(cmd):
        # El comando ya era CPU (o no tenía args hw que quitar): nada que reintentar.
        return first

    reason = _last_line(stderr)
    hw_profile.force_x264_for_session(reason=reason)
    print(
        f"[ffmpeg_safe_run] error de hardware detectado, reintentando en libx264: {reason}",
        file=sys.stderr,
    )
    cpu_cmd = _strip_hw_args(cmd)
    return subprocess.run(cpu_cmd, **run_kwargs)
