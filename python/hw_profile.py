"""Perfil de HARDWARE auto-detectado: la app se adapta a cada equipo.

Detecta una sola vez (y cachea 7 días en DATA_ROOT/cache/hw_profile.json):
  - CPU cores y RAM total.
  - GPU NVIDIA (vía nvidia-smi) y si el ffmpeg local puede usar NVENC de verdad
    (encode REAL de prueba de 8 frames sintéticos — que ffmpeg "liste" h264_nvenc
    no garantiza que el driver funcione).
  - Si torch tiene CUDA disponible (para WhisperX en GPU).

Lo usan:
  - extract_clips / cut_silences / long_form_pipeline (post-fx): encoder adaptativo
    → h264_nvenc (3-8x más rápido, misma calidad visual a cq 19) o libx264.
  - transcribe.py: device cuda+float16 si hay GPU con torch CUDA, cpu+int8 si no.
  - long_form_pipeline: cuántos renders de Remotion corren en paralelo.

CLI:  python hw_profile.py          → imprime el perfil (y lo re-detecta)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from config import DATA_ROOT, FFMPEG_PATH

_CACHE = DATA_ROOT / "cache" / "hw_profile.json"
_CACHE_TTL = 7 * 24 * 3600  # re-detectar cada 7 días (drivers cambian)
_profile: dict | None = None  # memo por proceso


def _ram_gb() -> float:
    try:
        if sys.platform == "win32":
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            st = MEMORYSTATUSEX()
            st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return round(st.ullTotalPhys / 1024**3, 1)
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024**3, 1)
    except Exception:  # noqa: BLE001
        return 8.0


def _nvidia_gpu() -> str:
    """Nombre de la GPU NVIDIA o "" si no hay (nvidia-smi viene con el driver)."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10,
        )
        name = (out.stdout or "").strip().splitlines()
        return name[0].strip() if out.returncode == 0 and name else ""
    except Exception:  # noqa: BLE001
        return ""


def _nvenc_works() -> bool:
    """Encode REAL de prueba con h264_nvenc (8 frames sintéticos, ~1s)."""
    try:
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "probe.mp4"
            r = subprocess.run(
                [str(FFMPEG_PATH), "-y", "-v", "error",
                 "-f", "lavfi", "-i", "color=c=black:s=320x240:r=8:d=1",
                 "-c:v", "h264_nvenc", "-frames:v", "8", str(out)],
                capture_output=True, text=True, timeout=30,
            )
            return r.returncode == 0 and out.exists() and out.stat().st_size > 0
    except Exception:  # noqa: BLE001
        return False


def _torch_cuda() -> bool:
    try:
        import torch  # noqa: PLC0415

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False


def detect(force: bool = False) -> dict:
    """Perfil del equipo (cacheado en disco + memo por proceso)."""
    global _profile
    if _profile is not None and not force:
        return _profile
    if not force:
        try:
            cached = json.loads(_CACHE.read_text(encoding="utf-8"))
            if time.time() - float(cached.get("detected_at", 0)) < _CACHE_TTL:
                _profile = cached
                return cached
        except Exception:  # noqa: BLE001
            pass
    gpu = _nvidia_gpu()
    prof = {
        "cores": os.cpu_count() or 4,
        "ram_gb": _ram_gb(),
        "gpu": gpu,
        "nvenc": bool(gpu) and _nvenc_works(),
        "torch_cuda": bool(gpu) and _torch_cuda(),
        "detected_at": time.time(),
    }
    try:
        _CACHE.parent.mkdir(parents=True, exist_ok=True)
        _CACHE.write_text(json.dumps(prof, indent=2), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass
    _profile = prof
    return prof


def ffmpeg_video_args(quality: str = "final") -> list[str]:
    """Args de video adaptativos para ffmpeg.

    quality:
      - "final": calidad extrema (lo que ve el usuario). NVENC p5/cq19 ≈ x264 crf18.
      - "fast":  intermedios que se re-encodean después (velocidad sobre tamaño).
    """
    if os.environ.get("VIRAL_FORCE_X264") == "1":
        prof = {"nvenc": False}
    else:
        prof = detect()
    if prof.get("nvenc"):
        if quality == "fast":
            return ["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "28", "-b:v", "0"]
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0",
                "-spatial-aq", "1", "-temporal-aq", "1"]
    if quality == "fast":
        return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"]
    return ["-c:v", "libx264", "-preset", "fast", "-crf", "18"]


def whisper_device() -> tuple[str, str]:
    """(device, compute_type) para WhisperX: GPU si hay torch CUDA, CPU int8 si no."""
    override = os.environ.get("VIRAL_WHISPER_DEVICE")
    if override in ("cpu", "cuda"):
        return override, ("float16" if override == "cuda" else "int8")
    prof = detect()
    if prof.get("torch_cuda"):
        return "cuda", "float16"
    return "cpu", "int8"


def render_workers() -> int:
    """Renders de Remotion en paralelo (largos): escala con los cores reales.
    4 cores → 1 (no sobre-suscribir), 8 → 2, 16+ → 3. Override LF_RENDER_WORKERS."""
    override = os.environ.get("LF_RENDER_WORKERS")
    if override and override.isdigit():
        return max(1, min(4, int(override)))
    cores = detect().get("cores", 4)
    if cores >= 16:
        return 3
    if cores >= 8:
        return 2
    return 1


if __name__ == "__main__":
    p = detect(force=True)
    print(json.dumps(p, indent=2))
    print("\nencoder final :", " ".join(ffmpeg_video_args("final")))
    print("encoder fast  :", " ".join(ffmpeg_video_args("fast")))
    print("whisper       :", whisper_device())
    print("render workers:", render_workers())
