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
    _run("ilustraciones animadas", ["download_animated_icons.py", "--all"])
    _run(
        "biblioteca de música",
        ["download_music_library.py", "download", "--out-dir", str(ASSETS_MUSIC), "--chosic", "30"],
    )
    _run(
        "efectos de sonido",
        ["download_sfx_library.py", "download", "--out-dir", str(ASSETS_SFX)],
    )

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
