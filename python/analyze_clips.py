"""Analiza un transcript completo con Ollama local y propone 5-7 clips virales (30-60s).

Uso:
  python analyze_clips.py <video_id>            # busca transcript en long_form/transcripts
  python analyze_clips.py --transcript <path>   # archivo custom

Output: long_form/proposals/{video_id}.json con [{start, end, hook, theme, keywords}].
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
    LF_PROPOSALS,
    LF_TRANSCRIPTS,
    OLLAMA_MODEL,
    OLLAMA_URL,
    ensure_long_form_dirs,
)


SYSTEM_PROMPT = """Sos un editor de video viral experto en TikTok y Reels para audiencia
hispanohablante en el nicho de comunicación + ventas + IA.

Te paso un transcript con timestamps de un video largo. Identificá 5-7 CLIPS de 30-60s
con MÁS potencial viral, y por cada uno generá copy listo para publicar.

Criterios de clip viral:
- HOOK fuerte al inicio (frase punzante, pregunta, contraintuitivo, "deja de", "el secreto",
  número específico). Algo que pare el scroll en 1.5s.
- INSIGHT autocontenido (se entiende sin contexto previo).
- Cierre con CTA o frase memorable.
- Alta densidad sin paja.

Tono del CAPTION:
- Humano, orgánico, NO marketero.
- Primera frase = hook que detiene el scroll. Después contexto en 1-2 frases.
- Sin emojis al inicio. Máximo 1-2 emojis en todo el caption.
- Cerrar con CTA simple (comentá X, guardalo, mandalo a ese vendedor que...).
- Largo: 100-220 caracteres (sin contar hashtags).

Hashtags:
- 6-8 hashtags relevantes al nicho.
- Mezclar específicos (#ventasconia #ventasb2b) + amplios (#ventas #emprendedores) +
  emergentes (#chatgpt #neuroventas #lenguajecorporal).
- En español, sin acentos, en una sola palabra.

OUTPUT - SOLO JSON, sin markdown ni explicaciones. Estructura por clip:
{
  "start": <segundos>,
  "end": <segundos>,
  "slug": "<3-5-palabras-kebab-case-en-espanol-sin-acentos>",
  "hook": "<primera frase EXACTA del clip>",
  "theme": "<tema en 5-8 palabras>",
  "keywords": ["<6 palabras clave en MAYUSCULAS para stickers>"],
  "caption": "<caption viral 100-220 chars, primera frase = hook, cierra con CTA>",
  "hashtags": ["#hashtag1", "#hashtag2", "..."]
}

Top-level: { "clips": [ ... ] }

Reglas duras:
- start y end en segundos del transcript.
- end - start entre 30 y 60.
- Clips NO solapados.
- Ordenar de más viral a menos viral.
- slug: solo a-z, 0-9, guiones medios. Sin acentos. Sin underscores.
"""


def _strip_fences(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _extract_json_object(text: str) -> str:
    """Devuelve el primer { ... } balanceado encontrado (ignora { y } dentro de strings)."""
    text = _strip_fences(text)
    if not text:
        return ""
    # Buscar primer "{" no-escapado
    start = text.find("{")
    if start < 0:
        return ""
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]  # devolver lo que haya, aunque no esté balanceado


def _try_parse_clips(response_text: str) -> list[dict[str, Any]] | None:
    """Intenta parsear el JSON con varias estrategias. Devuelve lista de clips o None."""
    candidates = [response_text, _strip_fences(response_text), _extract_json_object(response_text)]
    for cand in candidates:
        if not cand:
            continue
        try:
            parsed = json.loads(cand)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and isinstance(parsed.get("clips"), list):
            return parsed["clips"]
        if isinstance(parsed, list):
            return parsed
    # Plan B: rescate clip-by-clip — extraer cada objeto { ... } del array y parsearlos individualmente
    body = _extract_json_object(response_text)
    rescued: list[dict[str, Any]] = []
    # buscar la posición de "clips" : [
    m = re.search(r'"clips"\s*:\s*\[', body)
    cursor = m.end() if m else 0
    while cursor < len(body):
        obj_start = body.find("{", cursor)
        if obj_start < 0:
            break
        obj_text = _extract_json_object(body[obj_start:])
        if not obj_text:
            break
        try:
            obj = json.loads(obj_text)
            if isinstance(obj, dict):
                rescued.append(obj)
        except json.JSONDecodeError:
            pass  # saltar este clip y seguir
        cursor = obj_start + len(obj_text)
    return rescued if rescued else None


def _ollama_request(prompt: str, model: str, temperature: float = 0.3) -> str:
    """Llamada HTTP raw a Ollama, devuelve el texto de respuesta (sin parsear)."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": temperature, "num_ctx": 8192},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("response", "").strip()


def call_ollama(transcript_text: str, model: str = OLLAMA_MODEL) -> dict[str, Any]:
    """Llama a Ollama con retries y parser tolerante.

    Estrategia:
      1. Llamada normal con temperature 0.3.
      2. Si el JSON viene roto, retry con temperature 0.1 (más determinístico).
      3. Si sigue roto, retry con prompt simplificado.
      4. Si TODO falla, devuelve {"clips": []} — el caller decide qué hacer (fallback heurístico).
    """
    base_prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        "REGLA CRÍTICA: NUNCA uses comillas dobles dentro de los valores de strings — "
        "usá comillas simples o reemplazá por —. JSON ROTO = NO SIRVE. "
        "Validá que tu output sea JSON parseable antes de responder.\n\n"
        f"TRANSCRIPT:\n{transcript_text}\n\nResponde con el JSON ahora:"
    )
    attempts = [
        ("temp=0.3 prompt completo", base_prompt, 0.3),
        ("temp=0.1 retry", base_prompt, 0.1),
        ("temp=0.1 prompt corto", f"{SYSTEM_PROMPT}\n\nTRANSCRIPT:\n{transcript_text}\n\nJSON:", 0.1),
    ]
    for label, prompt, temp in attempts:
        print(f"[ollama] llamando {model} ({label}, puede tardar ~1-3 min)...", file=sys.stderr)
        t0 = time.time()
        try:
            response_text = _ollama_request(prompt, model, temperature=temp)
        except Exception as exc:
            print(f"[ollama] error en request ({label}): {exc}", file=sys.stderr)
            continue
        elapsed = time.time() - t0
        print(f"[ollama] respuesta en {elapsed:.1f}s ({len(response_text)} chars)", file=sys.stderr)
        clips = _try_parse_clips(response_text)
        if clips is not None and len(clips) > 0:
            print(f"[ollama] parseados {len(clips)} clips OK ({label})", file=sys.stderr)
            return {"clips": clips}
        print(f"[ollama] {label} devolvió 0 clips parseables, reintentando...", file=sys.stderr)
    # Si llegamos acá, ningún intento funcionó
    print("[ollama] todos los reintentos fallaron — caller debería usar fallback heurístico", file=sys.stderr)
    return {"clips": []}


def build_transcript_text(words: list[dict[str, Any]], window_sec: int = 20) -> str:
    """Construye texto agrupado en ventanas de ~20s para que el LLM tenga timestamps de referencia."""
    if not words:
        return ""
    out = []
    current_start = words[0]["start"]
    buffer: list[str] = []
    for w in words:
        if w["start"] - current_start >= window_sec:
            out.append(f"[{current_start:.1f}s] {' '.join(buffer)}")
            buffer = []
            current_start = w["start"]
        buffer.append(w["word"])
    if buffer:
        out.append(f"[{current_start:.1f}s] {' '.join(buffer)}")
    return "\n".join(out)


def slugify(text: str) -> str:
    text = text.lower().strip()
    replacements = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u"}
    for k, v in replacements.items():
        text = text.replace(k, v)
    text = re.sub(r"[^a-z0-9\- ]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:40] or "clip"


def validate_clip(clip: dict[str, Any], total_duration: float) -> dict[str, Any] | None:
    try:
        start = float(clip["start"])
        end = float(clip["end"])
    except (KeyError, ValueError, TypeError):
        return None
    if end - start < 25:  # tolerar 25-65s
        return None
    if end - start > 65:
        end = start + 60
    if start < 0 or end > total_duration:
        return None
    theme = str(clip.get("theme", "")).strip()[:80]
    raw_slug = str(clip.get("slug", "")).strip()
    slug = slugify(raw_slug) if raw_slug else slugify(theme)
    hashtags = clip.get("hashtags") or []
    if isinstance(hashtags, list):
        hashtags = [str(h).strip() for h in hashtags if str(h).strip()][:10]
        hashtags = [h if h.startswith("#") else f"#{h}" for h in hashtags]
    else:
        hashtags = []
    return {
        "start": round(start, 2),
        "end": round(end, 2),
        "slug": slug,
        "hook": str(clip.get("hook", "")).strip()[:240],
        "theme": theme,
        "keywords": [str(k).strip()[:30] for k in (clip.get("keywords") or [])][:7],
        "caption": str(clip.get("caption", "")).strip()[:280],
        "hashtags": hashtags,
    }


def chunk_words(words: list[dict[str, Any]], chunk_sec: int = 720) -> list[list[dict[str, Any]]]:
    """Divide words array en chunks de N segundos."""
    if not words:
        return []
    chunks: list[list[dict[str, Any]]] = [[]]
    chunk_start = words[0]["start"]
    for w in words:
        if w["start"] - chunk_start >= chunk_sec:
            chunks.append([])
            chunk_start = w["start"]
        chunks[-1].append(w)
    return [c for c in chunks if c]


def analyze_chunk(words: list[dict[str, Any]], model: str, target_clips: int = 2) -> list[dict[str, Any]]:
    """Llama Ollama con un chunk de transcript. Pide hasta N clips. Tolerante a JSON roto."""
    text = build_transcript_text(words, window_sec=15)
    extra = (
        f"\n\nIMPORTANTE: De este fragmento, identificá los MEJORES {target_clips} clips "
        "(puede ser menos si no hay buenos candidatos).\n"
        "REGLA CRÍTICA: NUNCA uses comillas dobles dentro de valores string — usá simples o —."
    )
    prompt = f"{SYSTEM_PROMPT}{extra}\n\nTRANSCRIPT:\n{text}\n\nResponde con el JSON ahora:"
    print(f"[ollama] chunk con {len(words)} palabras...", file=sys.stderr)
    t0 = time.time()
    # 2 intentos por chunk: temp 0.3, después temp 0.1
    for label, temp in [("temp=0.3", 0.3), ("temp=0.1 retry", 0.1)]:
        try:
            response_text = _ollama_request(prompt, model, temperature=temp)
        except Exception as exc:
            print(f"[ollama] chunk request error ({label}): {exc}", file=sys.stderr)
            continue
        clips = _try_parse_clips(response_text)
        if clips:
            elapsed = time.time() - t0
            print(f"[ollama] chunk ({label}): {len(clips)} clips en {elapsed:.1f}s", file=sys.stderr)
            return clips
        print(f"[ollama] chunk ({label}): 0 clips, reintentando...", file=sys.stderr)
    print(f"[ollama] chunk: todos los retries fallaron", file=sys.stderr)
    return []


def heuristic_fallback(
    words: list[dict[str, Any]],
    duration: float,
    target_clips: int = 6,
    clip_seconds: float = 45.0,
) -> list[dict[str, Any]]:
    """Genera clips heurísticos cuando el LLM falla.

    Estrategia: dividir el transcript en segmentos uniformes de ~45s y usar la primera
    frase de cada segmento como hook. NO es óptimo (sin curaduría por viralidad) pero
    asegura que el pipeline siempre genere algo procesable en vez de cortar todo.
    """
    if duration < clip_seconds or not words:
        return []
    # Calcular cuántos clips entran (con margen de 10s entre cada uno para no solaparse)
    spacing = max(clip_seconds + 10, duration / target_clips)
    n_clips = min(target_clips, max(1, int((duration - clip_seconds) / spacing) + 1))
    clips: list[dict[str, Any]] = []
    for i in range(n_clips):
        start = i * spacing
        end = min(start + clip_seconds, duration)
        if end - start < 25:
            continue
        # Tomar las primeras ~10 palabras dentro del rango como hook
        hook_words = [w["word"] for w in words if start <= w.get("start", 0) <= start + 8]
        hook = " ".join(hook_words[:14]).strip() or f"Segmento {i + 1}"
        clips.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "slug": f"segmento-{i + 1:02d}",
            "hook": hook[:200],
            "theme": f"Segmento {i + 1} del video",
            "keywords": [],
            "caption": "",
            "hashtags": [],
        })
    return clips


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id", nargs="?", help="ID del video (sin extensión)")
    parser.add_argument("--transcript", help="Path al transcript JSON")
    parser.add_argument("--model", default=OLLAMA_MODEL, help=f"Modelo Ollama (default: {OLLAMA_MODEL})")
    parser.add_argument("--max-clips", type=int, default=7)
    parser.add_argument("--chunk-sec", type=int, default=720, help="Tamaño de chunk en seg (default 12 min)")
    parser.add_argument(
        "--use-heuristic",
        action="store_true",
        help="Skipear Ollama y generar clips uniformes de ~45s directo. Útil sin GPU.",
    )
    args = parser.parse_args()

    ensure_long_form_dirs()

    if args.transcript:
        transcript_path = Path(args.transcript)
        video_id = transcript_path.stem
    else:
        if not args.video_id:
            parser.error("Especificá un video_id o --transcript")
        video_id = args.video_id
        transcript_path = LF_TRANSCRIPTS / f"{video_id}.json"

    if not transcript_path.exists():
        print(f"[error] no encontré {transcript_path}", file=sys.stderr)
        return 1

    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    words = transcript.get("words", [])
    duration = float(transcript.get("duration", 0.0))
    if not words:
        print("[error] transcript vacío", file=sys.stderr)
        return 1

    raw_clips: list[dict[str, Any]] = []
    if args.use_heuristic:
        print(
            "[heuristic-mode] skipeando Ollama por --use-heuristic; "
            "generando clips uniformes de ~45s",
            file=sys.stderr,
        )
        # Salimos directo al fallback más abajo
    elif duration <= 900:
        text = build_transcript_text(words, window_sec=15)
        result = call_ollama(text, model=args.model)
        raw_clips = result.get("clips", []) if isinstance(result, dict) else []
    else:
        chunks = chunk_words(words, chunk_sec=args.chunk_sec)
        print(f"[chunking] {len(chunks)} chunks de ~{args.chunk_sec}s", file=sys.stderr)
        per_chunk = max(2, (args.max_clips + len(chunks) - 1) // len(chunks) + 1)
        for i, chunk in enumerate(chunks):
            print(f"\n[chunk {i + 1}/{len(chunks)}]", file=sys.stderr)
            try:
                raw_clips.extend(analyze_chunk(chunk, model=args.model, target_clips=per_chunk))
            except Exception as e:
                print(f"[chunk {i + 1}] error: {e}", file=sys.stderr)

    valid_clips: list[dict[str, Any]] = []
    seen_ranges: list[tuple[float, float]] = []
    for c in raw_clips:
        v = validate_clip(c, duration)
        if not v:
            continue
        overlap = False
        for s, e in seen_ranges:
            inter = max(0, min(v["end"], e) - max(v["start"], s))
            shorter = min(v["end"] - v["start"], e - s)
            if shorter > 0 and inter / shorter > 0.5:
                overlap = True
                break
        if overlap:
            continue
        valid_clips.append(v)
        seen_ranges.append((v["start"], v["end"]))

    valid_clips.sort(key=lambda c: c["start"])
    valid_clips = valid_clips[: args.max_clips]

    # Fallback heurístico: si después de todos los intentos no hay clips válidos,
    # generar clips uniformes de ~45s para que el pipeline igual produzca algo.
    used_fallback = False
    if not valid_clips:
        print(
            "[fallback] LLM no produjo clips válidos — generando "
            "clips heurísticos (~45s uniformes) para que el pipeline continúe",
            file=sys.stderr,
        )
        heuristic = heuristic_fallback(words, duration, target_clips=args.max_clips)
        valid_clips = [validate_clip(c, duration) for c in heuristic]
        valid_clips = [c for c in valid_clips if c]
        used_fallback = True

    proposal = {
        "video_id": video_id,
        "model": args.model,
        "transcript_duration": duration,
        "fallback_heuristic": used_fallback,
        "clips": valid_clips,
    }

    out_path = LF_PROPOSALS / f"{video_id}.json"
    out_path.write_text(json.dumps(proposal, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out_path), "clips": len(valid_clips), "fallback": used_fallback}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
