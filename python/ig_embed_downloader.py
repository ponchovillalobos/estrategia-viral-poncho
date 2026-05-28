"""Descarga Instagram Reels/Posts públicos vía el endpoint /embed/captioned/.

Truco clave: el HTML de `/p/{shortcode}/embed/captioned/` expone:
  - video_url directo (CDN de Facebook), no necesita auth
  - thumbnail URL
  - caption y autor del post

Si el post es público (no privado), este método NO necesita cookies, login, ni
nada. Resuelve la mayoría de los casos donde yt-dlp falla por DPAPI o por
"Instagram is not granting access".

Limitaciones honestas:
  - Solo funciona si el post es público. Posts privados → tira HTTP 200 pero el HTML
    no tiene video_url.
  - El video_url tiene firma con expiración (~10-30 min). Tenés que descargar
    inmediatamente después de extraer el HTML.

Uso programático:
  from ig_embed_downloader import extract_reel_info, download_reel
  info = extract_reel_info("https://www.instagram.com/reel/DYVr__rznJJ/")
  download_reel(info, output_path=Path("clip.mp4"))
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class ReelInfo:
    url: str
    shortcode: str
    video_url: str
    thumbnail_url: str
    author: str
    caption: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Acepta URLs con o sin username intermedio:
#   instagram.com/reel/DXXX/
#   instagram.com/julianealborna/reel/DXXX/   (formato share desde el perfil)
#   instagram.com/p/DXXX/
_SHORTCODE_RE = re.compile(
    r"instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)"
)


def _extract_shortcode(url: str) -> str:
    m = _SHORTCODE_RE.search(url)
    if not m:
        raise ValueError(f"URL no parece un post de Instagram: {url}")
    return m.group(1)


def _fetch_embed_html(shortcode: str, timeout: int = 30) -> str:
    embed_url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
    req = urllib.request.Request(
        embed_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _unescape_double(raw: str) -> str:
    """El HTML embed tiene strings escapadas DOS veces (JSON dentro de JSON).

    Estrategia: dos pases de json.loads sobre "<raw>".
    """
    first = json.loads(f'"{raw}"')
    second = json.loads(f'"{first}"')
    return second


def _extract_field(html: str, key: str, suffix: str = "") -> str | None:
    """Extrae un campo JSON-encoded del HTML del embed.

    Para `video_url`, suffix sería `\\.mp4` para asegurar que matchea el campo correcto.
    """
    # Pattern: `key\":\"<value>\"` donde <value> no contiene comillas no escapadas
    pattern = rf'{re.escape(key)}\\":\\"([^"]*?{suffix}[^"]*?)\\"'
    m = re.search(pattern, html)
    if not m:
        return None
    raw = m.group(1)
    try:
        return _unescape_double(raw)
    except json.JSONDecodeError:
        return None


def _extract_caption(html: str) -> str:
    """Extrae el caption del bloque <div class="Caption">."""
    m = re.search(r'class="Caption"[^>]*>(.*?)</div>', html, re.DOTALL)
    if not m:
        return ""
    raw = m.group(1)
    # Remover HTML tags y entities
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    # Limpiar el sufijo "View all NNN comments"
    text = re.sub(r"View all \d+[\d,.]* comments?", "", text, flags=re.IGNORECASE)
    return text.strip()[:2000]


def _extract_author(html: str) -> str:
    """Username del autor — el embed lo expone como 'UsernameText'."""
    m = re.search(r'class="UsernameText"[^>]*>([^<]+)</', html)
    if m:
        return m.group(1).strip()
    # Fallback al primer @ del caption
    m2 = re.search(r"^([A-Za-z0-9_.]+)", _extract_caption(html))
    return m2.group(1) if m2 else "?"


def extract_reel_info(url: str) -> ReelInfo:
    """Extrae toda la metadata pública del reel."""
    shortcode = _extract_shortcode(url)
    html = _fetch_embed_html(shortcode)

    video_url = _extract_field(html, "video_url", suffix=r"\.mp4")
    if not video_url:
        # Diagnóstico fino según lo que Instagram sirvió:
        if "EmbedBrokenMedia" in html:
            raise RuntimeError(
                "Instagram marcó este post como NO DISPONIBLE públicamente "
                "(borrado, restringido, o de cuenta privada). "
                f"URL: {url}"
            )
        if "display_url" not in html and "video_url" not in html:
            raise RuntimeError(
                "El embed devolvió HTML vacío de media — el post puede haber "
                "sido eliminado o restringido. "
                f"URL: {url}"
            )
        # Heurística carrusel/foto
        raise RuntimeError(
            "El post no contiene video (posiblemente foto o carrusel). "
            f"URL: {url}"
        )

    thumbnail_url = _extract_field(html, "display_url") or ""
    author = _extract_author(html)
    caption = _extract_caption(html)

    return ReelInfo(
        url=url,
        shortcode=shortcode,
        video_url=video_url,
        thumbnail_url=thumbnail_url,
        author=author,
        caption=caption,
    )


def download_reel(info: ReelInfo, output_path: Path, timeout: int = 120) -> int:
    """Descarga el mp4 al path indicado. Devuelve bytes escritos."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        info.video_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.instagram.com/",
            "Accept": "*/*",
        },
    )
    total = 0
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(output_path, "wb") as f:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total


def download_thumbnail(info: ReelInfo, output_path: Path, timeout: int = 30) -> int | None:
    """Best-effort: descarga thumbnail (jpg). Si falla, devuelve None."""
    if not info.thumbnail_url:
        return None
    try:
        req = urllib.request.Request(
            info.thumbnail_url,
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.instagram.com/"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp, open(output_path, "wb") as f:
            data = resp.read()
            f.write(data)
        return len(data)
    except (urllib.error.URLError, OSError):
        return None


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="URL del Reel/Post de Instagram")
    parser.add_argument("--out", required=True, help="Path donde guardar el .mp4")
    parser.add_argument("--thumbnail-out", help="Path opcional para thumbnail .jpg")
    parser.add_argument("--metadata-out", help="Path opcional para metadata .json")
    args = parser.parse_args()

    print(f"[ig-embed] extrayendo metadata de {args.url}", file=sys.stderr)
    info = extract_reel_info(args.url)
    print(
        f"[ig-embed] autor={info.author} · caption_len={len(info.caption)}",
        file=sys.stderr,
    )

    out = Path(args.out)
    print(f"[ig-embed] descargando mp4 → {out}", file=sys.stderr)
    size = download_reel(info, out)
    print(f"[ig-embed] OK · {size:,} bytes", file=sys.stderr)

    if args.thumbnail_out:
        thumb_size = download_thumbnail(info, Path(args.thumbnail_out))
        print(f"[ig-embed] thumbnail: {thumb_size or 'falló'} bytes", file=sys.stderr)

    if args.metadata_out:
        Path(args.metadata_out).write_text(
            json.dumps(info.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(json.dumps({"ok": True, "size": size, "info": info.to_dict()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
