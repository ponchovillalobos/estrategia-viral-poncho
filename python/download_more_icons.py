"""Triplica el set de iconos editoriales sumando dos packs GRATIS (sin API key,
descarga directa de GitHub) a {DATA_ROOT}/assets/icons/:

  - Material Symbols (Google) — estilo OUTLINED, peso 400, opsz 24 (el archivo
    base `<name>_24px.svg`, sin modificadores wght/grad/fill). ~4,100 SVG.
    Licencia: Apache-2.0 (exige conservar el aviso → se guarda LICENSE).
    Repo: github.com/google/material-design-icons (rama master).

  - Lucide — line-art stroke=currentColor. ~1,700 SVG.
    Licencia: ISC (≈ MIT). Repo: github.com/lucide-icons/lucide (rama main).

Estrategia de descarga eficiente:

  * Material Symbols: el repo entero pesa >1 GB y la Trees API se trunca, así que
    NO se baja el zip. En su lugar se obtiene la lista completa de nombres con UNA
    llamada al árbol git de la subcarpeta `symbols/web` (no-recursivo, no se trunca,
    ~4,106 nombres) y luego se baja cada SVG por su raw URL
    `…/symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg`. Son archivos
    diminutos (~1 KB). Idempotente: salta los que ya existen.

  * Lucide: el repo es chico → se baja el zip de la rama (un solo fetch desde
    codeload) y se extrae `icons/*.svg`.

Todos los SVG usan currentColor / fill heredado → el render los pinta con el acento
del tema sin tocar el archivo.

Uso:  python download_more_icons.py
"""

from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from config import ASSETS_ICONS  # type: ignore

ICONS_DIR = Path(ASSETS_ICONS)

UA = {"User-Agent": "estrategia-viral-icons/1.0"}

MATERIAL_DEST = ICONS_DIR / "material"
MATERIAL_MIN = 3800  # ~4,106 esperados; margen por si algún icono no tiene base 24px
MATERIAL_BRANCH = "master"
MATERIAL_REPO = "google/material-design-icons"

LUCIDE_DEST = ICONS_DIR / "lucide"
LUCIDE_MIN = 1500  # ~1,735 esperados
LUCIDE_ZIP = "https://codeload.github.com/lucide-icons/lucide/zip/refs/heads/main"
LUCIDE_LICENSE = "https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE"


# ---------------------------------------------------------------------------
# helpers HTTP con reintentos
# ---------------------------------------------------------------------------
def _get(url: str, timeout: int = 120, retries: int = 4) -> bytes:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:  # noqa: PERF203
            last = e
            # 404 no se reintenta (icono sin variante base); el resto sí
            if e.code == 404:
                raise
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last if last else RuntimeError(f"fallo al bajar {url}")


def _get_json(url: str) -> object:
    return json.loads(_get(url).decode("utf-8"))


def _tree_child_sha(tree_sha: str, child_name: str) -> str | None:
    """Devuelve el sha del hijo `child_name` dentro del árbol `tree_sha`
    (llamada NO recursiva → no se trunca)."""
    url = f"https://api.github.com/repos/{MATERIAL_REPO}/git/trees/{tree_sha}"
    data = _get_json(url)
    for t in data.get("tree", []):  # type: ignore[union-attr]
        if t.get("path") == child_name:
            return t.get("sha")
    return None


# ---------------------------------------------------------------------------
# Material Symbols
# ---------------------------------------------------------------------------
def download_material() -> int:
    if MATERIAL_DEST.exists():
        existing = len(list(MATERIAL_DEST.glob("*.svg")))
        if existing >= MATERIAL_MIN:
            print(f"ya existe: material ({existing} SVG)")
            return existing
    MATERIAL_DEST.mkdir(parents=True, exist_ok=True)

    # 1) navegar el árbol git para llegar a symbols/web (sin truncar, 1 call por nivel)
    print("material: resolviendo árbol symbols/web …", flush=True)
    web_sha = None
    sym_sha = _tree_child_sha(MATERIAL_BRANCH, "symbols")
    if sym_sha:
        web_parent = _tree_child_sha(sym_sha, "web")
        web_sha = web_parent
    if not web_sha:
        raise RuntimeError("no se pudo resolver symbols/web en el árbol git")

    web = _get_json(
        f"https://api.github.com/repos/{MATERIAL_REPO}/git/trees/{web_sha}"
    )
    names = [t["path"] for t in web.get("tree", []) if t.get("type") == "tree"]  # type: ignore[union-attr]
    if web.get("truncated"):  # type: ignore[union-attr]
        print("  ADVERTENCIA: la lista de nombres salió truncada", file=sys.stderr)
    print(f"  {len(names)} nombres de icono encontrados; bajando outlined/400/24 …", flush=True)

    base = (
        f"https://raw.githubusercontent.com/{MATERIAL_REPO}/{MATERIAL_BRANCH}"
        "/symbols/web/{name}/materialsymbolsoutlined/{name}_24px.svg"
    )
    n = 0
    skipped = 0
    missing = 0
    for i, name in enumerate(names):
        out = MATERIAL_DEST / f"{name}.svg"
        if out.exists() and out.stat().st_size > 0:
            skipped += 1
            n += 1
            continue
        url = base.format(name=name)
        try:
            svg = _get(url, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                missing += 1
                continue
            raise
        out.write_bytes(svg)
        n += 1
        if (i + 1) % 250 == 0:
            print(f"  … {i + 1}/{len(names)} ({n} en disco)", flush=True)

    # 2) LICENSE (Apache-2.0 exige conservar el aviso)
    try:
        lic = _get(
            f"https://raw.githubusercontent.com/{MATERIAL_REPO}/{MATERIAL_BRANCH}/LICENSE"
        )
        (MATERIAL_DEST / "LICENSE").write_bytes(lic)
    except Exception as e:  # noqa: BLE001
        print(f"  ADVERTENCIA: no se pudo bajar LICENSE de material: {e}", file=sys.stderr)

    print(
        f"  listos: {n} SVG en {MATERIAL_DEST} "
        f"(nuevos {n - skipped}, ya estaban {skipped}, sin base 24px {missing})"
    )
    return n


# ---------------------------------------------------------------------------
# Lucide (zip de la rama)
# ---------------------------------------------------------------------------
def download_lucide() -> int:
    if LUCIDE_DEST.exists():
        existing = len(list(LUCIDE_DEST.glob("*.svg")))
        if existing >= LUCIDE_MIN:
            print(f"ya existe: lucide ({existing} SVG)")
            return existing
    LUCIDE_DEST.mkdir(parents=True, exist_ok=True)

    print(f"lucide: bajando {LUCIDE_ZIP} …", flush=True)
    data = _get(LUCIDE_ZIP, timeout=300)
    print(f"  zip: {len(data) // 1024 // 1024} MB — extrayendo icons/*.svg", flush=True)
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            # el zip mete todo bajo "<repo>-main/"
            parts = info.filename.split("/", 1)
            inner = parts[1] if len(parts) == 2 else ""
            if not inner.startswith("icons/") or not inner.endswith(".svg"):
                continue
            # icons/foo.svg  (no subcarpetas: los .json de metadata se ignoran solos)
            rel = inner[len("icons/"):]
            if "/" in rel:
                continue
            out = LUCIDE_DEST / Path(rel).name
            with z.open(info) as f:
                out.write_bytes(f.read())
            n += 1

    # LICENSE (ISC)
    try:
        (LUCIDE_DEST / "LICENSE").write_bytes(_get(LUCIDE_LICENSE))
    except Exception as e:  # noqa: BLE001
        print(f"  ADVERTENCIA: no se pudo bajar LICENSE de lucide: {e}", file=sys.stderr)

    print(f"  listos: {n} SVG en {LUCIDE_DEST}")
    return n


def main() -> int:
    ok = True
    total = 0
    for label, fn, mn in (
        ("material", download_material, MATERIAL_MIN),
        ("lucide", download_lucide, LUCIDE_MIN),
    ):
        try:
            n = fn()
            total += n
            if n < mn:
                ok = False
                print(f"ADVERTENCIA: {label} trajo {n} (< {mn})", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"ERROR {label}: {e}", file=sys.stderr)
    print(f"TOTAL nuevos packs: {total} iconos")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
