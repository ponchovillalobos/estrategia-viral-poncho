"""Genera specs de Modo Gráficos & Motion (dataViz + kineticHeadlines) desde el
transcript de un CLIP, automáticamente.

Estrategia:
  - CHARTS: heurística determinista sobre los words[] — detecta números/porcentajes
    y comparaciones ("de 23 a 78") y los convierte en contadores/barras en su timestamp.
    Los números son confiables sin LLM, así que esto es el caballo de batalla.
  - HEADLINES: frases potentes. Con Ollama (si está) elige mejores frases; si no,
    heurística (hook de apertura + frase con palabras de énfasis).

Output: long_form/graphics/{clip_id}.json  →  { "dataViz": [...], "kineticHeadlines": [...] }

Uso:
  python generate_graphics.py <clip_id>
  python generate_graphics.py --transcript <path> [--out <path>] [--no-llm]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

from config import (
    LF_GRAPHICS,
    LF_TRANSCRIPTS,
    OLLAMA_MODEL,
    OLLAMA_URL,
    ensure_long_form_dirs,
)

EFFECTS = ["split_letters", "glitch", "shimmer", "draw_on", "gradient_sweep", "tracking_in"]
ACCENTS = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa", "#fb7185"]

# Palabras vacías para no usarlas como título de un chart.
STOP = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "y", "o",
    "que", "en", "a", "es", "son", "con", "por", "para", "se", "su", "al", "lo",
    "me", "te", "le", "nos", "ya", "muy", "más", "mas", "pero", "como", "esto",
    "esta", "este", "eso", "porque", "cuando", "donde", "si", "no", "the",
}

# Palabras de énfasis → buena señal de frase "potente" para titular.
EMPHASIS = {
    "nunca", "siempre", "secreto", "error", "clave", "gratis", "deja", "dejá",
    "stop", "increíble", "increible", "brutal", "verdad", "mentira", "nadie",
    "todos", "millones", "rápido", "rapido", "fácil", "facil", "ahora", "hoy",
    "atención", "atencion", "importante", "jamás", "jamas", "peor", "mejor",
}

# Concepto → ÍCONO (lucide). En vez de repetir el texto del subtítulo, mostramos un
# símbolo VISUAL que representa lo que se dice (esto "explica" sin saturar de texto).
# Keywords en español; matcheo por palabra/prefijo. Los íconos existen en ICON_MAP.
CONCEPT_ICONS = {
    "money": ["dinero", "plata", "peso", "pesos", "dólar", "dolar", "dólares", "dolares",
              "precio", "costo", "gratis", "vender", "vende", "venta", "ventas", "ganar",
              "ingreso", "ingresos", "factura", "pagar", "invertir", "inversión", "inversion",
              "negocio", "rentable", "ganancia", "ganancias", "facturar"],
    "trending": ["crecer", "crece", "crecimiento", "subir", "sube", "aumentar", "aumenta",
                 "escalar", "duplicar", "triplicar", "resultado", "resultados", "éxito",
                 "exito", "despegar", "explotar", "multiplicar"],
    "brain": ["idea", "ideas", "pensar", "mente", "aprender", "aprende", "estrategia",
              "inteligencia", "cerebro", "conocimiento", "entender", "lógica", "logica"],
    "rocket": ["lanzar", "lanzamiento", "despegue", "acelerar", "impulso", "empezar",
               "arrancar", "empieza", "arranca", "rápido", "rapido"],
    "target": ["objetivo", "objetivos", "meta", "metas", "foco", "enfocar", "enfoque",
               "apuntar", "nicho", "público", "publico"],
    "lightbulb": ["tip", "tips", "consejo", "consejos", "truco", "trucos", "secreto",
                  "secretos", "descubrir", "solución", "solucion", "aprendé"],
    "fire": ["increíble", "increible", "brutal", "fuego", "tendencia", "viral", "imperdible"],
    "heart": ["amor", "pasión", "pasion", "comunidad", "fans", "conexión", "conexion",
              "corazón", "corazon"],
    "eye": ["atención", "atencion", "observa", "visión", "vision", "fíjate", "fijate"],
    "warn": ["error", "errores", "cuidado", "peligro", "problema", "problemas", "evitar",
             "evita", "riesgo", "fallo", "trampa"],
    "check": ["listo", "hecho", "correcto", "funciona", "confirmar", "perfecto", "logrado",
              "resuelto"],
    "message": ["comentar", "comenta", "mensaje", "conversación", "conversacion", "pregunta",
                "responder", "comunicación", "comunicacion"],
    "award": ["premio", "ganador", "logro", "campeón", "campeon", "medalla", "trofeo"],
    "music": ["música", "musica", "audio", "sonido", "canción", "cancion", "ritmo"],
    "film": ["video", "videos", "grabar", "cámara", "camara", "contenido", "reel", "reels",
             "tiktok"],
    "gem": ["valor", "valioso", "premium", "calidad", "joya", "tesoro", "exclusivo"],
    "crown": ["rey", "reina", "líder", "lider", "liderar", "dominar", "corona"],
    "zap": ["energía", "energia", "poder", "fuerza", "impacto", "potente"],
    "star": ["estrella", "destacar", "destaca", "famoso", "brillar", "sobresalir"],
    "people": ["gente", "personas", "clientes", "cliente", "usuarios", "audiencia",
               "seguidores", "equipo"],
}
# Lookup invertido: palabra → ícono.
_WORD_TO_ICON: dict[str, str] = {}
for _icon, _kws in CONCEPT_ICONS.items():
    for _kw in _kws:
        _WORD_TO_ICON.setdefault(_kw, _icon)
# "people" no existe en ICON_MAP → cae a un ícono cercano.
_ICON_ALIAS = {"people": "heart"}


def concept_icons(words: list[dict], duration: float, target: int) -> list[dict]:
    """Genera íconos VISUALES (no texto) representando los conceptos que se mencionan.
    Uno por tipo de concepto (no repite el mismo ícono), distribuidos en el tiempo."""
    seen: set[str] = set()
    hits: list[tuple[float, str]] = []
    for w in words:
        tok = _clean_word(str(w.get("word", ""))).lower().strip(".,!?¿¡")
        if len(tok) < 3:
            continue
        icon = _WORD_TO_ICON.get(tok)
        if not icon:
            # prefijo (plurales/conjugaciones): "vendés" → "vend…"
            for kw, ic in _WORD_TO_ICON.items():
                if len(kw) >= 5 and tok.startswith(kw[:5]):
                    icon = ic
                    break
        if not icon or icon in seen:
            continue
        seen.add(icon)
        hits.append((float(w.get("start", 0)), _ICON_ALIAS.get(icon, icon)))

    hits.sort(key=lambda h: h[0])
    out: list[dict] = []
    min_gap = max(2.5, (duration / max(1, target)) * 0.6)
    last_t = -99.0
    positions = ["top-right", "top-left", "bottom-right", "top-center"]
    for t, icon in hits:
        if len(out) >= target:
            break
        if t - last_t < min_gap:
            continue
        last_t = t
        i = len(out)
        out.append({
            "at": round(max(0.3, t - 0.1), 2),
            "duration": 1.8,
            "icon": icon,
            "position": positions[i % len(positions)],
            "color": "#0a0a0a",
            "bg": ACCENTS[(i * 2) % len(ACCENTS)],
            "size": 120,
        })
    return out


def _ollama(prompt: str, temperature: float = 0.3) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": temperature, "num_ctx": 8192},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate", data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("response", "").strip()


def _clean_word(w: str) -> str:
    return re.sub(r"[^\wáéíóúñü%¿?¡!.,]", "", w, flags=re.UNICODE)


def _number_in(token: str) -> float | None:
    """Parsea un número de un token, manejando separadores es/en.

    Casos: 80 · 80% · 3,5 (decimal es) · 12.5 (decimal en) · 1.000 / 1,000 (miles) ·
    1.000.000 (millón) · 1.000,50 / 1,000.50 (miles+decimal). Devuelve None si no es
    claramente un número (evita inventar datos a partir de basura)."""
    t = token.strip().replace("%", "")
    if not re.fullmatch(r"[\d.,]+", t) or not any(c.isdigit() for c in t):
        return None
    has_comma, has_dot = "," in t, "." in t
    if has_comma and has_dot:
        # El separador que aparece más a la derecha es el decimal.
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")  # 1.000,50 -> 1000.50
        else:
            t = t.replace(",", "")  # 1,000.50 -> 1000.50
    elif has_comma:
        parts = t.split(",")
        # coma con 1 grupo y NO de 3 dígitos = decimal (3,5); si no, miles (1,000)
        t = t.replace(",", ".") if (len(parts) == 2 and len(parts[1]) != 3) else t.replace(",", "")
    elif has_dot:
        parts = t.split(".")
        # punto con 1 grupo y NO de 3 dígitos = decimal (12.5); si no, miles (1.000)
        if not (len(parts) == 2 and len(parts[1]) != 3):
            t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None


# Unidades que confirman que un número es un DATO (no un año/edad casual).
DATA_UNITS = {
    "veces", "vez", "millones", "millón", "millon", "mil", "miles", "dólares",
    "dolares", "pesos", "euros", "clientes", "ventas", "personas", "usuarios",
    "seguidores", "horas", "días", "dias", "minutos", "segundos", "kilos",
    "puntos", "x", "%",
}
# Conectores válidos para una comparación "de X a Y" (crecimiento). "o"/"y" NO.
COMPARE_CONNECTORS = {"a", "hasta"}


def _is_year_or_age(token_clean: str, val: float, next_word: str) -> bool:
    """Filtra años (1900-2099) y edades ('40 años') que no son datos virales."""
    if 1900 <= val <= 2099 and val == int(val) and "." not in token_clean:
        return True
    nxt = _clean_word(next_word).lower()
    if nxt in ("años", "año", "anos", "ano"):
        return True
    return False


def heuristic_charts(words: list[dict], duration: float, max_charts: int = 4) -> list[dict]:
    """Detecta SOLO números que son datos reales (porcentajes, 'X veces/millones',
    comparaciones 'de X a Y') → charts en su timestamp. Evita años/edades y pares
    casuales para no inventar gráficas falsas."""
    charts: list[dict] = []
    used_times: list[float] = []
    n = len(words)

    def far_enough(t: float) -> bool:
        return all(abs(t - u) > 3.5 for u in used_times)

    def word_at(idx: int) -> str:
        return words[idx].get("word", "") if 0 <= idx < n else ""

    for i, w in enumerate(words):
        if len(charts) >= max_charts:
            break
        raw = w.get("word", "")
        tok = _clean_word(raw)
        val = _number_in(tok)
        if val is None or val == 0:
            continue
        at = float(w.get("start", 0))
        if not far_enough(at):
            continue
        is_pct = "%" in raw or _clean_word(word_at(i + 1)).lower() in ("%", "porciento")
        next1 = _clean_word(word_at(i + 1)).lower()
        next2 = _clean_word(word_at(i + 2)).lower()
        has_unit = is_pct or next1 in DATA_UNITS or next2 in DATA_UNITS
        if _is_year_or_age(tok, val, word_at(i + 1)):
            continue
        # ¿comparación "de X [conector] Y"? requiere conector real (a/hasta) entre números.
        partner = None
        for j in range(i + 1, min(i + 6, n)):
            connector = _clean_word(word_at(j)).lower()
            v2 = _number_in(_clean_word(words[j].get("word", "")))
            if v2 is not None and v2 != val and v2 != 0:
                # confirmar que entre i y j hubo un conector válido
                between = [_clean_word(word_at(k)).lower() for k in range(i + 1, j)]
                if any(b in COMPARE_CONNECTORS for b in between):
                    partner = v2
                break
        # Sin unidad de dato Y sin comparación válida → no es un dato, lo saltamos.
        if not has_unit and partner is None:
            continue
        # Título: 2-3 palabras previas no-vacías.
        ctx = []
        for k in range(i - 1, max(-1, i - 5), -1):
            cw = _clean_word(words[k].get("word", "")).lower()
            if cw and cw not in STOP and not _number_in(cw):
                ctx.insert(0, words[k].get("word", "").strip(".,"))
            if len(ctx) >= 3:
                break
        title = " ".join(ctx).strip().capitalize()[:34]
        accent = ACCENTS[len(charts) % len(ACCENTS)]
        if partner is not None and abs(partner - val) > 0:
            charts.append({
                "at": round(max(0.2, at - 0.3), 2),
                "duration": 3.0,
                "type": "bar",
                "title": title or "Comparación",
                "data": [
                    {"label": "Antes", "value": val},
                    {"label": "Después", "value": partner},
                ],
                "suffix": "%" if is_pct else "",
                "accent": accent,
                "fullscreen": True,
            })
        else:
            charts.append({
                "at": round(max(0.2, at - 0.3), 2),
                "duration": 2.6,
                "type": "counter",
                "title": title,
                "data": [{"value": val}],
                "suffix": "%" if is_pct else "",
                "accent": accent,
                "fullscreen": True,
            })
        used_times.append(at)
    return charts


def _sentences(words: list[dict]) -> list[dict]:
    """Agrupa words en frases (corte por puntuación fuerte o pausa > 0.6s)."""
    out: list[dict] = []
    cur: list[dict] = []
    for idx, w in enumerate(words):
        cur.append(w)
        txt = w.get("word", "")
        gap = (
            words[idx + 1].get("start", 0) - w.get("end", 0)
            if idx + 1 < len(words) else 99
        )
        if re.search(r"[.!?]$", txt.strip()) or gap > 0.6:
            if cur:
                out.append({
                    "text": " ".join(c.get("word", "") for c in cur).strip(),
                    "start": float(cur[0].get("start", 0)),
                })
                cur = []
    if cur:
        out.append({
            "text": " ".join(c.get("word", "") for c in cur).strip(),
            "start": float(cur[0].get("start", 0)),
        })
    return out


def heuristic_headlines(words: list[dict], duration: float, max_h: int = 3) -> list[dict]:
    """Elige frases potentes DISTRIBUIDAS parejo en el tiempo (~1 por bucket), para
    densidad uniforme en vez de agrupar todas al principio. Hook de apertura + frases
    con palabras de énfasis. `max_h` = cuántos titulares objetivo (escala con duración)."""
    sents = _sentences(words)
    if not sents:
        return []
    scored: list[tuple[float, dict]] = []
    for s in sents:
        text = s["text"].strip()
        wcount = len(text.split())
        if wcount < 2 or wcount > 8:
            continue  # titulares: 2-8 palabras
        low = text.lower()
        score = sum(2 for e in EMPHASIS if e in low)
        if s["start"] < 2.0:
            score += 3  # el hook de apertura siempre es buen titular
        score += min(2, wcount / 3)
        scored.append((score, s))
    if not scored:
        return []

    # Distribución por buckets temporales: ~1 titular cada (duration/max_h) seg.
    n = max(1, max_h)
    bucket = max(1.0, duration / n) if duration > 0 else 10.0
    used: set[int] = set()
    chosen: list[dict] = []
    for b in range(n):
        lo, hi = b * bucket, (b + 1) * bucket
        cands = [(sc, s) for sc, s in scored if lo <= s["start"] < hi and id(s) not in used]
        if not cands:
            continue
        cands.sort(key=lambda x: -x[0])
        used.add(id(cands[0][1]))
        chosen.append(cands[0][1])
    # Si quedaron huecos (frases ralas), rellenar con las mejores no usadas.
    if len(chosen) < n:
        rest = sorted((p for p in scored if id(p[1]) not in used), key=lambda x: -x[0])
        for _, s in rest:
            if len(chosen) >= n:
                break
            used.add(id(s))
            chosen.append(s)

    chosen.sort(key=lambda s: s["start"])
    headlines: list[dict] = []
    for i, s in enumerate(chosen):
        text = re.sub(r"\s+", " ", s["text"]).strip(" .,").upper()[:40]
        headlines.append({
            "at": round(min(duration - 1.8, max(0.3, s["start"])), 2),
            "duration": 2.2,
            "text": text,
            "effect": EFFECTS[i % len(EFFECTS)],
            "accent": ACCENTS[i % len(ACCENTS)],
            "position": "bottom" if i % 2 == 0 else "top",
            "size": 120,
        })
    return headlines


def llm_headlines(words: list[dict], duration: float, max_h: int = 3) -> list[dict] | None:
    """Pide a Ollama 2-3 titulares potentes. Devuelve None si falla."""
    text = " ".join(w.get("word", "") for w in words)[:2000]
    prompt = (
        f"Sos editor de video viral. De este fragmento, dame los {max_h} TITULARES más "
        "potentes (frases de 2-6 palabras que paren el scroll, en MAYÚSCULAS, sin "
        "comillas), REPARTIDOS a lo largo de todo el clip (no todos al inicio). Para cada "
        "uno, el segundo aprox del clip donde aparece la idea.\n"
        "Devolvé SOLO JSON: {\"headlines\":[{\"text\":\"...\",\"at\":<seg>}]}\n"
        f"Duración del clip: {duration:.0f}s.\n\nFRAGMENTO:\n{text}\n\nJSON:"
    )
    try:
        resp = _ollama(prompt, temperature=0.2)
    except Exception as e:
        print(f"[graphics] Ollama no disponible ({e}) — uso heurística", file=sys.stderr)
        return None
    m = re.search(r"\{.*\}", resp, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    items = data.get("headlines") if isinstance(data, dict) else None
    if not isinstance(items, list) or not items:
        return None
    out: list[dict] = []
    for i, it in enumerate(items[:max_h]):
        text = str(it.get("text", "")).strip(" .,\"'").upper()[:40]
        if not text or len(text.split()) > 8:
            continue
        try:
            at = float(it.get("at", i * 2 + 0.5))
        except (ValueError, TypeError):
            at = i * 2 + 0.5
        out.append({
            "at": round(min(duration - 1.8, max(0.3, at)), 2),
            "duration": 2.2,
            "text": text,
            "effect": EFFECTS[i % len(EFFECTS)],
            "accent": ACCENTS[i % len(ACCENTS)],
            "position": "bottom" if i % 2 == 0 else "top",
            "size": 120,
        })
    return out or None


def generate(transcript_path: Path, use_llm: bool = True) -> dict:
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    words = transcript.get("words", [])
    duration = float(transcript.get("duration", 0) or 0)
    if duration <= 0 and words:
        duration = float(words[-1].get("end", 0))

    # DENSIDAD: ~1 elemento visual cada ~10s, mín 3, máx 14.
    target = max(3, min(14, round(duration / 10))) if duration > 0 else 3

    # GRÁFICOS VISUALES (lo que el usuario pidió):
    #   - charts: contador/barras/línea/dona desde NÚMEROS reales (no inventa datos).
    #   - íconos de concepto: un símbolo que representa lo que se dice (dinero, idea,
    #     crecimiento…). VISUAL, no texto.
    # NO generamos titulares de texto automáticos: repetían el subtítulo (texto duplicado).
    charts = heuristic_charts(words, duration, max_charts=max(4, target))
    icon_budget = max(3, target - len(charts))  # los charts ya aportan; el resto, íconos
    icons = concept_icons(words, duration, icon_budget)

    # Variedad de charts: rota color y posición.
    for i, c in enumerate(charts):
        c["accent"] = ACCENTS[(i * 2 + 1) % len(ACCENTS)]
        c["position"] = ["top", "bottom", "center"][i % 3]

    # Anti-solape: si un ícono cae sobre un chart fullscreen, lo corremos de esquina.
    chart_windows = [(c["at"], c["at"] + c["duration"]) for c in charts if c.get("fullscreen")]
    for ic in icons:
        for s, e in chart_windows:
            if s - 0.5 < ic["at"] < e:
                ic["position"] = "bottom-right" if ic["position"] != "bottom-right" else "top-left"
                break

    print(
        f"[graphics] {len(charts)} charts · {len(icons)} íconos visuales · target {target} (dur {duration:.0f}s) · SIN texto repetido",
        file=sys.stderr,
    )
    # kineticHeadlines vacío a propósito: las animaciones ahora son VISUALES (charts +
    # íconos), no copias del texto. La capa de titulares sigue disponible para uso manual.
    return {"dataViz": charts, "kineticHeadlines": [], "iconStickers": icons}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("clip_id", nargs="?", help="ID del clip (transcript en long_form/transcripts)")
    parser.add_argument("--transcript", help="Path al transcript JSON")
    parser.add_argument("--out", help="Path de salida (default: long_form/graphics/{clip_id}.json)")
    parser.add_argument("--no-llm", action="store_true", help="Solo heurística (sin Ollama)")
    args = parser.parse_args()

    ensure_long_form_dirs()

    if args.transcript:
        tp = Path(args.transcript)
        clip_id = tp.stem
    elif args.clip_id:
        clip_id = args.clip_id
        tp = LF_TRANSCRIPTS / f"{clip_id}.json"
    else:
        parser.error("Especificá clip_id o --transcript")

    if not tp.exists():
        print(f"[error] no encontré {tp}", file=sys.stderr)
        return 1

    t0 = time.time()
    result = generate(tp, use_llm=not args.no_llm)
    out = Path(args.out) if args.out else LF_GRAPHICS / f"{clip_id}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True, "out": str(out),
        "dataViz": len(result["dataViz"]),
        "iconStickers": len(result.get("iconStickers", [])),
        "kineticHeadlines": len(result["kineticHeadlines"]),
        "elapsed_sec": round(time.time() - t0, 1),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
