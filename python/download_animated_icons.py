"""Descarga ILUSTRACIONES ANIMADAS (Lottie) de Noto Animated Emoji de Google.

Son animaciones profesionales (1024x1024, 60fps) de conceptos: dinero cayendo,
reloj, cohete despegando, gráfica subiendo, fuego, cerebro… Descarga DIRECTA de
fonts.gstatic.com — sin API key ni cuenta. Licencia Noto (OFL/Apache): uso
comercial OK.

Uso:  python download_animated_icons.py        → baja el set curado a
      {DATA_ROOT}/assets/lottie/noto/{concepto}.json

El mapa CONCEPTOS está alineado con generate_graphics.py (palabra española →
concepto → animación). Idempotente: lo ya bajado se salta.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

from config import DATA_ROOT

OUT_DIR = Path(DATA_ROOT) / "assets" / "lottie" / "noto"
BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest/{code}/lottie.json"

# concepto → codepoint del Noto animated emoji (en minúscula, sin "U+").
# Elegidos por legibilidad como ilustración de ESCENA (no como emoji de texto).
CONCEPTS: dict[str, str] = {
    # dinero / negocio
    "money": "1f4b8",          # billetes con alas (dinero volando)
    "trending": "1f4c8",       # gráfica subiendo
    "chart_down": "1f4c9",     # gráfica bajando
    "handshake": "1f91d",      # apretón de manos (acuerdo/venta)
    # tiempo
    "clock": "23f0",           # despertador sonando
    "hourglass": "231b",       # reloj de arena
    # ideas / mente
    "lightbulb": "1f4a1",      # foco encendiéndose (idea)
    "brain": "1f9e0",          # cerebro
    "thinking": "1f914",       # pensando
    "books": "1f4da",          # libros (aprender)
    "grad": "1f393",           # birrete (capacitación)
    # energía / impacto
    "fire": "1f525",           # fuego
    "rocket": "1f680",         # cohete despegando
    "zap": "26a1",             # rayo
    "boom": "1f4a5",           # explosión
    "star": "2b50",            # estrella
    "sparkles": "2728",        # destellos
    "hundred": "1f4af",        # 100 puntos
    "trophy": "1f3c6",         # trofeo (logro)
    "crown": "1f451",          # corona
    "muscle": "1f4aa",         # músculo (fuerza)
    "target": "1f3af",         # diana (objetivo)
    # comunicación / redes
    "speech": "1f4ac",         # globo de diálogo
    "mega": "1f4e3",           # megáfono (anunciar)
    "eyes": "1f440",           # ojos (atención)
    "wave": "1f44b",           # saludo
    "clap": "1f44f",           # aplauso
    "point_down": "1f447",     # señalar abajo (CTA)
    "check": "2705",           # check (correcto)
    "cross": "274c",           # X (error)
    "warning": "26a0_fe0f",    # advertencia
    "lock": "1f512",           # candado (secreto)
    "gift": "1f381",           # regalo
    "gem": "1f48e",            # diamante (valor)
    "heart": "2764_fe0f",      # corazón
    "heart_eyes": "1f60d",     # encantado
    "mind_blown": "1f92f",     # cabeza explotando (sorpresa)
    "scream": "1f631",         # impacto/shock
    "party": "1f389",          # confeti (celebración)
    "world": "1f30d",          # mundo (global)
    "video": "1f3ac",          # claqueta (video/edición)
    "tools": "1f6e0_fe0f",     # herramientas
    "robot": "1f916",          # robot (IA)
    "seedling": "1f331",       # brote (crecimiento desde cero)
}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = skipped = failed = 0
    for concept, code in CONCEPTS.items():
        dest = OUT_DIR / f"{concept}.json"
        if dest.exists() and dest.stat().st_size > 1000:
            skipped += 1
            continue
        url = BASE.format(code=code)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read()
            # validar que sea Lottie de verdad antes de guardar
            parsed = json.loads(data)
            if "layers" not in parsed:
                raise ValueError("sin layers")
            dest.write_bytes(data)
            ok += 1
            print(f"[ok] {concept} ({code}) — {len(data)//1024} KB", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"[fail] {concept} ({code}): {e}", file=sys.stderr)
    print(json.dumps({"ok": True, "downloaded": ok, "skipped": skipped, "failed": failed,
                      "dir": str(OUT_DIR)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
