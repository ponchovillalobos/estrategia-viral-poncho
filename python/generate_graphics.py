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
    """Elige frases potentes: hook de apertura + frases con palabras de énfasis."""
    sents = _sentences(words)
    if not sents:
        return []
    scored: list[tuple[float, dict]] = []
    for s in sents:
        text = s["text"].strip()
        wcount = len(text.split())
        if wcount < 2 or wcount > 7:
            continue  # titulares: 2-7 palabras
        low = text.lower()
        score = sum(2 for e in EMPHASIS if e in low)
        if s["start"] < 2.0:
            score += 3  # el hook de apertura siempre es buen titular
        score += min(2, wcount / 3)
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    chosen = scored[:max_h]
    chosen.sort(key=lambda x: x[1]["start"])
    headlines: list[dict] = []
    for i, (_, s) in enumerate(chosen):
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
        "Sos editor de video viral. De este fragmento, dame los 2-3 TITULARES más "
        "potentes (frases de 2-6 palabras que paren el scroll, en MAYÚSCULAS, sin "
        "comillas). Para cada uno, el segundo aprox del clip donde aparece la idea.\n"
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

    charts = heuristic_charts(words, duration)
    headlines = None
    source = "heurística"
    if use_llm:
        headlines = llm_headlines(words, duration)
        if headlines is not None:
            source = "LLM"
    if headlines is None:
        headlines = heuristic_headlines(words, duration)

    # Anti-solape básico: si un titular cae sobre un chart, lo movemos al hueco.
    chart_windows = [(c["at"], c["at"] + c["duration"]) for c in charts]
    for h in headlines:
        for s, e in chart_windows:
            if s - 0.5 < h["at"] < e:
                h["position"] = "top" if h["position"] == "bottom" else "bottom"
                break

    print(
        f"[graphics] {len(charts)} charts · {len(headlines)} titulares ({source})",
        file=sys.stderr,
    )
    return {"dataViz": charts, "kineticHeadlines": headlines}


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
        "kineticHeadlines": len(result["kineticHeadlines"]),
        "elapsed_sec": round(time.time() - t0, 1),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
