"""Configura TODO lo que Viralito necesita en una PC nueva, de una sola pasada.

Orden: primero lo CRÍTICO (modelos de voz para transcribir, con reintentos), luego
las MEJORAS (música, iconos, fuentes, efectos). Si una mejora falla NO aborta el
resto — la app igual funciona, solo con menos assets. Imprime progreso línea por
línea para que el endpoint /api/setup/full lo muestre en vivo.

Uso:  python setup_all.py
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

from config import ASSETS_MUSIC, DATA_ROOT, ensure_dirs

HERE = Path(__file__).resolve().parent
PY = sys.executable
ASSETS_SFX = DATA_ROOT / "assets" / "sfx"


def _run(nombre: str, args: list[str], critico: bool = False, reintentos: int = 3) -> bool:
    """Corre un script de descarga con reintentos. Devuelve True si quedó OK."""
    for i in range(1, reintentos + 1):
        print(f"[setup] {nombre}: descargando (intento {i}/{reintentos})...", flush=True)
        try:
            r = subprocess.run(
                [PY, *args], cwd=str(HERE), capture_output=True, text=True, timeout=3600
            )
            if r.returncode == 0:
                print(f"[setup] OK: {nombre}", flush=True)
                return True
            tail = (r.stderr or "").strip()[-200:]
            print(f"[setup] {nombre} no terminó (rc={r.returncode}): {tail}", flush=True)
        except Exception as e:  # red caída, timeout, etc.
            print(f"[setup] {nombre} error: {e}", flush=True)
        if i < reintentos:
            espera = min(20, 5 * i)
            print(f"[setup] reintento en {espera}s...", flush=True)
            time.sleep(espera)
    if critico:
        print(f"[setup] CRÍTICO no se pudo: {nombre}", flush=True)
    else:
        print(f"[setup] mejora opcional omitida (no es grave): {nombre}", flush=True)
    return False


def _hay_gpu_nvidia() -> bool:
    """¿Hay GPU NVIDIA? (nvidia-smi responde)."""
    try:
        r = subprocess.run(["nvidia-smi"], capture_output=True, timeout=10)
        return r.returncode == 0
    except Exception:
        return False


def _torch_ya_es_cuda() -> bool:
    try:
        r = subprocess.run(
            [PY, "-c", "import torch; print(torch.cuda.is_available())"],
            capture_output=True, text=True, timeout=120,
        )
        return "True" in (r.stdout or "")
    except Exception:
        return False


def _configurar_segun_equipo() -> None:
    """Adapta la app al HARDWARE: si hay GPU NVIDIA, instala torch CUDA para que
    la transcripción corra en GPU (5-10x más rápido) en vez de CPU. El bundle trae
    torch CPU-only (chico y universal); esto lo actualiza SOLO en máquinas con GPU.
    pip instala de forma atómica: si falla, el torch CPU sigue funcionando.
    """
    if not _hay_gpu_nvidia():
        print("[setup] Sin GPU NVIDIA: la app usa CPU (correcto para este equipo).", flush=True)
        return
    if _torch_ya_es_cuda():
        print("[setup] GPU NVIDIA con torch CUDA ya configurado.", flush=True)
        return
    print("[setup] GPU NVIDIA detectada — instalando aceleración (torch CUDA, ~2.5 GB, una sola vez)...", flush=True)
    _run(
        "aceleración GPU (torch CUDA)",
        ["-m", "pip", "install", "--upgrade", "--no-cache-dir",
         "torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu121"],
        reintentos=2,
    )
    if _torch_ya_es_cuda():
        print("[setup] Aceleración GPU lista: la transcripción ahora usa tu tarjeta.", flush=True)
    else:
        print("[setup] No se pudo activar la GPU; la app sigue en CPU (funciona igual, más lento).", flush=True)


def main() -> int:
    ensure_dirs()
    print("[setup] Configurando Viralito: modelos de IA + librerías de assets...", flush=True)

    # 1) CRÍTICO — modelos de voz (transcripción). Sin esto la app no transcribe.
    voz_ok = _run(
        "modelos de voz (transcripción)",
        ["transcribe.py", "--download-model", "small"],
        critico=True,
        reintentos=4,
    )

    # 2) MEJORAS — no abortan el setup si fallan (la app funciona sin ellas).
    _run("fuentes tipográficas", ["download_fonts.py"])
    _run("iconos editoriales", ["download_editorial_icons.py"])
    # Ilustraciones animadas: hay DOS sets y NO son acumulativos. Sin --all baja el
    # set CURADO por concepto (noto/*.json: money, rocket, fire…) que es lo que el
    # render busca en ASSETS_LOTTIE; con --all baja el CATÁLOGO completo (noto/catalog).
    # Corremos ambos para tener los curados Y el catálogo (audit I1 / hallazgo E).
    _run("ilustraciones animadas (curadas)", ["download_animated_icons.py"])
    _run("ilustraciones animadas (catálogo)", ["download_animated_icons.py", "--all"])
    # Música: el out-dir DEBE terminar en \github — así los mp3 caen donde los
    # scanners de runtime (pickRandomMusicTrack, /api/music/stream) los buscan, y el
    # manifest queda en assets/music/manifest_music_library.json (hallazgo E).
    _run(
        "biblioteca de música",
        ["download_music_library.py", "download", "--out-dir", str(ASSETS_MUSIC / "github"), "--chosic", "30"],
    )
    _run(
        "efectos de sonido",
        ["download_sfx_library.py", "download", "--out-dir", str(ASSETS_SFX / "github")],
    )

    # 3) SEGÚN EL EQUIPO — si hay GPU NVIDIA, baja la aceleración (torch CUDA).
    _configurar_segun_equipo()

    if voz_ok:
        print("[setup] ¡Listo! La app puede transcribir y tiene las librerías de assets.", flush=True)
        print("OK", flush=True)
        return 0
    print(
        "[setup] La transcripción NO quedó lista: faltan los modelos de voz. "
        "Revisa tu internet y vuelve a tocar «Configurar todo».",
        flush=True,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
