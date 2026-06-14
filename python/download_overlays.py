"""Overlays de TEXTURA para el look "pro de revista" (OLA 3).

Dos fuentes, en ESTE orden de preferencia:

  (a) CC0 / dominio público VERIFICADO, sin API key, descarga DIRECTA.
      → lista `CC0_OVERLAYS` (hoy vacía a propósito; ver nota abajo).
  (b) PROCEDURALES generados aquí mismo con PIL/numpy (grano, polvo,
      light-leak, scanlines, viñeta). Son 100% NUESTROS → license
      "generado-propio", sin licencia de terceros que cumplir.

REGLA DURÍSIMA sobre licencias
------------------------------
Solo entran a CC0_OVERLAYS fuentes con licencia CC0 / Public-Domain-Mark
/ dominio público VERIFICADA UNA POR UNA (URL + licenseurl explícito),
sin API key y con descarga directa del archivo crudo. Mixkit, Coverr y
Wikimedia-CC-BY están PROHIBIDOS: sus licencias prohíben redistribuir el
archivo crudo dentro de un producto que se vende.

Auditoría 2026-06-13: NO se encontraron overlays de film-grain / light-leak
/ dust con licencia CC0 limpia, descarga directa y sin key. Los "free film
grain" que circulan son CC-BY o comerciales con cláusulas de no-redistribución;
los hits CC0/PD del Internet Archive para "film grain" son películas COMPLETAS
(no assets de overlay) y redistribuir el crudo en un producto vendido es
dudoso. Por eso CC0_OVERLAYS queda VACÍA y el complemento garantizado son los
procedurales. Si en el futuro se verifica una fuente CC0 real, se agrega a la
lista con su {url, file, type, license, source} y el script la bajará sola.

Uso:
    python download_overlays.py
    → baja CC0 verificados (si hay) + genera procedurales en
      {DATA_ROOT}/assets/overlays/<name>.(mp4|png) y escribe manifest.json
      con [{file, type, license, source}].

Idempotente: lo ya generado/bajado se salta.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

from config import DATA_ROOT

OUT_DIR = Path(DATA_ROOT) / "assets" / "overlays"
MANIFEST = OUT_DIR / "manifest.json"

# Resolución base de los PNG procedurales (1080x1920 vertical, el formato shorts).
W, H = 1080, 1920


# ---------------------------------------------------------------------------
# (a) Overlays CC0 VERIFICADOS — descarga directa, sin API key.
# ---------------------------------------------------------------------------
# Formato de cada entrada:
#   {"name", "url", "type" (png|mp4), "license", "source"}
# license debe ser un texto CC0 / Public-Domain explícito y `source` la URL
# de la PÁGINA donde se ve la licencia (para auditar). VACÍA a propósito: ver
# la nota del docstring. NO agregar nada aquí sin verificar la licencia.
CC0_OVERLAYS: list[dict] = []


def _download_cc0(out_dir: Path) -> list[dict]:
    """Baja cada entrada de CC0_OVERLAYS. Devuelve los manifests escritos."""
    written: list[dict] = []
    for item in CC0_OVERLAYS:
        name = item["name"]
        ext = item["type"]
        dest = out_dir / f"{name}.{ext}"
        if dest.exists() and dest.stat().st_size > 1024:
            written.append({
                "file": dest.name, "type": ext,
                "license": item["license"], "source": item["source"],
            })
            print(f"[skip] {dest.name} (ya existe)", file=sys.stderr)
            continue
        try:
            req = urllib.request.Request(
                item["url"], headers={"User-Agent": "viralito-overlays/1.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 1024:
                raise ValueError("archivo demasiado chico")
            dest.write_bytes(data)
            written.append({
                "file": dest.name, "type": ext,
                "license": item["license"], "source": item["source"],
            })
            print(f"[ok] {dest.name} — {len(data)//1024} KB ({item['license']})",
                  file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"[fail] {name}: {e}", file=sys.stderr)
    return written


# ---------------------------------------------------------------------------
# (b) Overlays PROCEDURALES — 100% nuestros (license: "generado-propio").
# ---------------------------------------------------------------------------
def _gen_procedural(out_dir: Path) -> list[dict]:
    """Genera overlays con numpy/PIL. Devuelve manifests escritos.

    Cada overlay es un PNG RGBA pensado para cablearse en modo 'screen' /
    'overlay' / 'multiply' sobre el video. Son texturas estáticas (un PNG por
    estilo); el motion se logra animando opacidad/escala en Remotion."""
    try:
        import numpy as np
        from PIL import Image
    except Exception as e:  # noqa: BLE001
        print(f"[procedural] falta numpy/PIL ({e}); no genero nada.",
              file=sys.stderr)
        return []

    rng = np.random.default_rng(20260613)
    written: list[dict] = []

    def _save(name: str, rgba: "np.ndarray") -> None:
        dest = out_dir / f"{name}.png"
        if dest.exists() and dest.stat().st_size > 1024:
            written.append({"file": dest.name, "type": "png",
                            "license": "generado-propio", "source": "procedural"})
            print(f"[skip] {dest.name} (ya existe)", file=sys.stderr)
            return
        Image.fromarray(rgba.astype(np.uint8), "RGBA").save(dest)
        written.append({"file": dest.name, "type": "png",
                        "license": "generado-propio", "source": "procedural"})
        print(f"[ok] {dest.name} (procedural)", file=sys.stderr)

    def _gaussian_blur(arr: "np.ndarray", radius: int) -> "np.ndarray":
        """Blur separable barato sin scipy: convolución 1D con kernel gaussiano."""
        if radius < 1:
            return arr
        x = np.arange(-radius, radius + 1, dtype=np.float64)
        k = np.exp(-(x ** 2) / (2 * (radius / 2.0) ** 2))
        k /= k.sum()
        out = arr.astype(np.float64)
        # filas
        out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 1, out)
        # columnas
        out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 0, out)
        return out

    # --- 1) GRANO de película (monocromo, fino) ------------------------------
    # Ruido gaussiano gris; alpha modulado por el propio ruido para que el grano
    # sea sutil. Va en modo 'overlay' al ~15-25% de opacidad.
    grain = rng.normal(128, 38, (H, W)).clip(0, 255)
    g = grain.astype(np.uint8)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = g
    # alpha: más opaco donde el grano se aleja del gris medio
    rgba[..., 3] = (np.abs(grain - 128) / 127 * 140).clip(0, 140).astype(np.uint8)
    _save("grain_fine", rgba)

    # --- 2) GRANO grueso (más áspero, look 8mm) ------------------------------
    small = rng.normal(128, 55, (H // 3, W // 3)).clip(0, 255)
    coarse = np.array(
        Image.fromarray(small.astype(np.uint8)).resize((W, H), Image.NEAREST),
        dtype=np.float64,
    )
    rgba = np.zeros((H, W, 4), np.uint8)
    cg = coarse.astype(np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = cg
    rgba[..., 3] = (np.abs(coarse - 128) / 127 * 120).clip(0, 120).astype(np.uint8)
    _save("grain_coarse", rgba)

    # --- 3) POLVO y motas (dust) ---------------------------------------------
    # Puntitos blancos dispersos + algunas rayas verticales finas (pelos).
    dust = np.zeros((H, W), np.float64)
    n_spots = 1400
    ys = rng.integers(0, H, n_spots)
    xs = rng.integers(0, W, n_spots)
    sizes = rng.integers(1, 4, n_spots)
    for y, x, s in zip(ys, xs, sizes):
        dust[max(0, y - s):y + s, max(0, x - s):x + s] = rng.uniform(150, 255)
    # algunas rayas verticales (scratches/pelos)
    for _ in range(18):
        x = int(rng.integers(0, W))
        y0 = int(rng.integers(0, H // 2))
        length = int(rng.integers(H // 6, H // 2))
        dust[y0:y0 + length, x:x + 1] = rng.uniform(160, 240)
    dust = _gaussian_blur(dust, 1)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = 255
    rgba[..., 3] = dust.clip(0, 255).astype(np.uint8)
    _save("dust_specks", rgba)

    # --- 4) SCANLINES (líneas horizontales, look CRT/VHS) --------------------
    rgba = np.zeros((H, W, 4), np.uint8)
    line = np.zeros(H, np.float64)
    line[::3] = 90  # una línea oscura cada 3 px
    rgba[..., 3] = np.repeat(line[:, None], W, axis=1).astype(np.uint8)
    # color negro (multiply/overlay para oscurecer las scanlines)
    _save("scanlines", rgba)

    # --- 5) VIÑETA (oscurece bordes) -----------------------------------------
    yy, xx = np.mgrid[0:H, 0:W]
    cy, cx = H / 2, W / 2
    dist = np.sqrt(((yy - cy) / cy) ** 2 + ((xx - cx) / cx) ** 2)
    vig = (dist - 0.6).clip(0, None)
    vig = (vig / vig.max() * 200).clip(0, 200)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 3] = vig.astype(np.uint8)  # negro en bordes
    _save("vignette", rgba)

    # --- 6) LIGHT LEAK cálido (esquina) --------------------------------------
    # Gradiente radial naranja/magenta desde una esquina; modo 'screen'.
    yy, xx = np.mgrid[0:H, 0:W]
    lx, ly = W * 0.92, H * 0.08  # esquina superior derecha
    d = np.sqrt(((xx - lx) / W) ** 2 + ((yy - ly) / H) ** 2)
    glow = (1.0 - (d / d.max())) ** 2
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0] = (glow * 255).astype(np.uint8)            # R
    rgba[..., 1] = (glow * 120).astype(np.uint8)            # G
    rgba[..., 2] = (glow * 60).astype(np.uint8)             # B
    rgba[..., 3] = (glow * 200).clip(0, 200).astype(np.uint8)
    _save("light_leak_warm", rgba)

    # --- 7) LIGHT LEAK frío (banda lateral) ----------------------------------
    band = np.exp(-((xx - W * 0.12) ** 2) / (2 * (W * 0.10) ** 2))
    band = band * (0.5 + 0.5 * np.exp(-((yy - H * 0.35) ** 2) / (2 * (H * 0.5) ** 2)))
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0] = (band * 90).astype(np.uint8)
    rgba[..., 1] = (band * 140).astype(np.uint8)
    rgba[..., 2] = (band * 255).astype(np.uint8)
    rgba[..., 3] = (band * 180).clip(0, 180).astype(np.uint8)
    _save("light_leak_cool", rgba)

    return written


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    manifest.extend(_download_cc0(OUT_DIR))
    manifest.extend(_gen_procedural(OUT_DIR))

    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    cc0 = sum(1 for m in manifest if m["license"] != "generado-propio")
    proc = sum(1 for m in manifest if m["license"] == "generado-propio")
    print(json.dumps({
        "ok": True, "total": len(manifest), "cc0_verified": cc0,
        "procedural": proc, "dir": str(OUT_DIR), "manifest": str(MANIFEST),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
