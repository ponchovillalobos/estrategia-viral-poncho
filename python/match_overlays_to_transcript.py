"""Matcher determinístico de descripciones de overlays vs transcript.

¿Por qué existe?
================
Antes solo confiábamos en el agente VFX (Claude Opus) para decidir en qué segundo
poner cada imagen. El agente a veces se saltaba imágenes, inventaba timestamps o
devolvía respuestas incompletas.

Este script hace lo mismo PERO determinísticamente:
  1. Toma cada overlay con su `description` y/o `filename`.
  2. Extrae palabras clave (>3 letras, sin stop words españolas).
  3. Busca cada keyword en las palabras del transcript (exact match + fuzzy).
  4. Si encuentra, asigna startTime = start de la palabra matcheada.
  5. Devuelve para cada overlay:
       - startTime + endTime sugeridos
       - matchedWord (la palabra del transcript que motivó el match)
       - confidence: "high" (exact), "medium" (fuzzy 0.85+), "low" (fallback orden)

Solo los overlays SIN match obvio pasan al agente VFX (más lento + más caro).

Uso:
  python match_overlays_to_transcript.py \\
      --transcript-file <path.json> \\
      --overlays-file <path.json> \\
      [--target-duration 4.0]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

# Stop words españolas comunes — palabras que NO sirven para matching
STOP_WORDS = {
    "el", "la", "los", "las", "de", "del", "que", "y", "o", "u", "a", "en",
    "un", "una", "uno", "unos", "unas", "es", "se", "le", "lo", "te", "me",
    "por", "para", "con", "sin", "este", "esta", "estos", "estas", "esto",
    "ese", "esa", "eso", "esos", "esas", "ya", "no", "si", "sí", "al", "del",
    "mi", "tu", "su", "yo", "vos", "ello", "ella", "él", "como", "más", "muy",
    "foto", "imagen", "video", "screenshot", "captura", "primero", "primera",
    "segundo", "segunda", "tercero", "tercera", "cuarto", "cuarta", "quinto",
    "quinta", "sexto", "sexta", "es", "fue", "son", "ser", "estar", "esta",
    "estamos", "estás", "están",
}


def normalize(word: str) -> str:
    """Normaliza palabra: lowercase + remove accents básicos + alfanuméricos."""
    w = word.lower().strip()
    # Quitar puntuación común
    w = re.sub(r"[^\w\sáéíóúñ]", "", w, flags=re.UNICODE)
    # Acentos básicos → sin acento (matching más permisivo)
    repl = str.maketrans("áéíóúñ", "aeioun")
    return w.translate(repl)


def extract_keywords(text: str, max_keywords: int = 8) -> list[str]:
    """Extrae palabras clave de la descripción del user.

    Filtra stop words, palabras cortas, números puros.
    """
    if not text:
        return []
    words = re.findall(r"[A-Za-zÁÉÍÓÚáéíóúñÑ]+", text)
    keywords = []
    seen: set[str] = set()
    for w in words:
        n = normalize(w)
        if len(n) < 3:
            continue
        if n in STOP_WORDS:
            continue
        if n in seen:
            continue
        seen.add(n)
        keywords.append(n)
        if len(keywords) >= max_keywords:
            break
    return keywords


def find_word_in_transcript(
    keyword: str,
    transcript_words: list[dict[str, Any]],
    fuzzy_threshold: float = 0.85,
) -> tuple[dict[str, Any] | None, float, str]:
    """Busca la mejor coincidencia de `keyword` en transcript_words.

    Devuelve:
      - dict de la palabra matcheada (con start/end) o None
      - score (1.0 = match exacto, 0.0-1.0 = fuzzy)
      - tier: "exact" | "fuzzy" | "none"
    """
    keyword_n = normalize(keyword)

    # Pasada 1: match exacto
    for w in transcript_words:
        word_text = w.get("word", "")
        if normalize(word_text) == keyword_n:
            return w, 1.0, "exact"

    # Pasada 2: substring match (keyword está dentro de la palabra)
    for w in transcript_words:
        word_text = normalize(w.get("word", ""))
        if len(word_text) >= 4 and (keyword_n in word_text or word_text in keyword_n):
            return w, 0.95, "exact"

    # Pasada 3: fuzzy match con SequenceMatcher
    best_match = None
    best_score = 0.0
    for w in transcript_words:
        word_text = normalize(w.get("word", ""))
        if len(word_text) < 3:
            continue
        score = SequenceMatcher(None, keyword_n, word_text).ratio()
        if score > best_score:
            best_score = score
            best_match = w

    if best_score >= fuzzy_threshold:
        return best_match, best_score, "fuzzy"

    return None, best_score, "none"


def match_overlay(
    overlay: dict[str, Any],
    transcript_words: list[dict[str, Any]],
    target_duration: float = 6.0,
    used_starts: set[float] | None = None,
) -> dict[str, Any]:
    """Encuentra el mejor timestamp para un overlay basado en su descripción.

    used_starts: para evitar que dos overlays apunten al mismo segundo. Si el match
    cae en un segundo ya usado, busca el segundo mejor match.
    """
    if used_starts is None:
        used_starts = set()

    desc = overlay.get("description", "") or ""
    fname = overlay.get("filename", "") or ""
    # Quitar extensión del filename y números aislados
    fname_clean = re.sub(r"\.\w+$", "", fname)
    fname_clean = re.sub(r"^\d+\b|\b\d+$", "", fname_clean).strip()

    # Keywords a buscar: combinar description + filename
    keywords = extract_keywords(desc) + extract_keywords(fname_clean)
    # Dedupe preservando orden
    seen: set[str] = set()
    keywords = [k for k in keywords if not (k in seen or seen.add(k))]
    # Priorizar palabras más LARGAS (más específicas/distintivas) sobre cortas.
    # Esto soluciona: descripción "nixon maquillandolo" — antes ganaba "nixon" (5
    # letras, palabra común que aparece 3 veces). Ahora gana "maquillandolo"
    # (13 letras) que matchea fuzzy con "maquillaje" del transcript.
    keywords = sorted(keywords, key=lambda k: -len(k))

    best_word = None
    # Adjusted score = raw_score * specificity_bonus.
    # specificity_bonus es función inversa de freq_en_transcript (palabras raras valen más)
    # + bonus por longitud (palabras largas son más distintivas).
    best_adjusted = 0.0
    best_keyword = ""
    best_tier = "none"

    # Pre-calcular frecuencias para specificity bonus
    word_freq: dict[str, int] = {}
    for w in transcript_words:
        wn = normalize(w.get("word", ""))
        if len(wn) >= 3:
            word_freq[wn] = word_freq.get(wn, 0) + 1

    for kw in keywords:
        match_word, score, tier = find_word_in_transcript(kw, transcript_words, fuzzy_threshold=0.7)
        if not match_word:
            continue
        start = float(match_word.get("start", 0))
        # Evitar reusar segundo ya usado (within 1.5s)
        if any(abs(start - u) < 1.5 for u in used_starts):
            continue
        # Specificity: palabras menos frecuentes valen más; palabras más largas también
        matched_norm = normalize(match_word.get("word", ""))
        freq = word_freq.get(matched_norm, 1)
        length_bonus = min(2.0, len(kw) / 5.0)  # palabra de 5+ letras = 1.0+, 10+ = 2.0
        freq_penalty = 1.0 / freq  # aparece 1 vez = 1.0, 3 veces = 0.33
        adjusted = score * length_bonus * freq_penalty
        if adjusted > best_adjusted:
            best_word = match_word
            best_adjusted = adjusted
            best_keyword = kw
            best_tier = tier

    best_score = best_adjusted  # mantener nombre legacy para el resto del flujo

    if not best_word:
        return {
            "overlayId": overlay["id"],
            "startTime": None,
            "endTime": None,
            "matchedWord": None,
            "matchedKeyword": None,
            "confidence": "low",
            "tier": "none",
            "needsAgent": True,
            "reason": (
                f"sin match para keywords {keywords[:3]}"
                if keywords
                else "descripción/filename vacíos"
            ),
        }

    start_time = round(float(best_word["start"]), 2)
    # endTime = start + target_duration, pero no exceder end del transcript
    last_word_end = max(
        (float(w.get("end", 0)) for w in transcript_words), default=start_time + target_duration
    )
    end_time = round(min(start_time + target_duration, last_word_end - 0.2), 2)
    confidence = "high" if best_tier == "exact" else "medium"

    used_starts.add(start_time)
    return {
        "overlayId": overlay["id"],
        "startTime": start_time,
        "endTime": end_time,
        "matchedWord": best_word.get("word"),
        "matchedKeyword": best_keyword,
        "confidence": confidence,
        "tier": best_tier,
        "score": round(best_score, 3),
        "needsAgent": False,
        "reason": f"'{best_keyword}' matchea con '{best_word.get('word')}' en seg {start_time}",
    }


def match_all_overlays(
    overlays: list[dict[str, Any]],
    transcript_words: list[dict[str, Any]],
    duration: float,
    target_duration_per_overlay: float = 6.0,
) -> list[dict[str, Any]]:
    """Procesa todos los overlays en orden de userOrder.

    Si dos overlays compiten por la misma palabra, gana el de userOrder menor.
    Los que no encuentran match quedan con `needsAgent=true` para que el LLM decida.
    """
    # Ordenar por userOrder (los que no tienen quedan al final, orden por id)
    sorted_overlays = sorted(
        overlays,
        key=lambda o: (o.get("userOrder") if o.get("userOrder") is not None else 999, o.get("id", "")),
    )

    used_starts: set[float] = set()
    results: list[dict[str, Any]] = []
    # min_start cronológico: cada overlay solo puede empezar DESPUÉS del anterior.
    # Esto fuerza el orden 1 < 2 < 3 < 4 < 5 < 6 garantizado.
    cronological_min_start = 0.0
    for o in sorted_overlays:
        # Filtrar transcript_words al rango permitido (>= cronological_min_start)
        eligible_words = [w for w in transcript_words if float(w.get("start", 0)) >= cronological_min_start]
        if not eligible_words:
            # Sin palabras restantes — fuerza fallback
            eligible_words = transcript_words[-5:] if transcript_words else []
        result = match_overlay(o, eligible_words, target_duration_per_overlay, used_starts)
        result["userOrder"] = o.get("userOrder")
        result["description"] = o.get("description", "")
        results.append(result)
        # Actualizar cronological_min_start si encontró match (con buffer 0.5s)
        if not result.get("needsAgent") and result.get("endTime") is not None:
            cronological_min_start = max(cronological_min_start, float(result["endTime"]) + 0.5)

    # FALLBACK respetando userOrder estrictamente.
    # Para cada overlay sin match, calcular su posición de modo que:
    #   - Si tiene orden N, debe ir DESPUÉS del overlay con orden N-1 (matcheado o no)
    #   - Si tiene orden N, debe ir ANTES del overlay con orden N+1 (matcheado o no)
    undecided = [r for r in results if r["needsAgent"]]
    if undecided:
        # Crear mapa de orden → posición ya decidida (incluyendo matches exactos)
        by_order = {r.get("userOrder"): r for r in results if r.get("userOrder") is not None}
        max_order = max((r.get("userOrder") or 0) for r in results)

        for u in undecided:
            order = u.get("userOrder")
            if order is None:
                # Sin orden: distribuir al final
                start = duration - target_duration_per_overlay - 1
            else:
                # Buscar el predecesor (orden N-1 o menor) con timestamp decidido
                prev_end = 1.0
                for o in range(order - 1, 0, -1):
                    candidate = by_order.get(o)
                    if candidate and not candidate["needsAgent"]:
                        prev_end = candidate["endTime"] + 0.5
                        break
                    if candidate and candidate.get("startTime") is not None:
                        prev_end = candidate["endTime"] + 0.5
                        break
                # Buscar el sucesor (orden N+1 o mayor) con timestamp decidido
                next_start = duration - 0.5
                for o in range(order + 1, max_order + 1):
                    candidate = by_order.get(o)
                    if candidate and not candidate["needsAgent"]:
                        next_start = candidate["startTime"] - 0.5
                        break
                    if candidate and candidate.get("startTime") is not None:
                        next_start = candidate["startTime"] - 0.5
                        break

                # Mid-point del gap respetando el orden
                if next_start - prev_end >= target_duration_per_overlay + 0.5:
                    start = (prev_end + next_start - target_duration_per_overlay) / 2
                else:
                    # Gap chiquito: poner al inicio del gap
                    start = prev_end

            start = round(max(0.5, min(start, duration - target_duration_per_overlay - 0.5)), 2)
            u["startTime"] = start
            u["endTime"] = round(start + target_duration_per_overlay, 2)
            u["confidence"] = "low"
            u["tier"] = "fallback"
            u["reason"] = (
                f"sin match en transcript, ubicado en gap respetando orden {order} "
                f"(entre overlay {order - 1 if order else '?'} y {order + 1 if order else '?'})"
            )
            # Actualizar by_order para que los siguientes fallbacks vean este como "decidido"
            if order is not None:
                by_order[order] = u

    # Devolver ordenado por startTime para el render
    results.sort(key=lambda r: r.get("startTime") or 0)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transcript-file", required=True)
    parser.add_argument("--overlays-file", required=True)
    parser.add_argument("--target-duration", type=float, default=6.0)
    parser.add_argument("--video-duration", type=float, help="Si no se pasa, se usa el último timestamp del transcript")
    parser.add_argument("--out", help="Path donde guardar JSON resultante")
    args = parser.parse_args()

    # Cargar transcript
    raw = Path(args.transcript_file).read_text(encoding="utf-8")
    t_data = json.loads(raw)
    if isinstance(t_data, dict) and "words" in t_data:
        words = t_data["words"]
    else:
        print("[error] transcript no tiene .words[]", file=sys.stderr)
        return 1

    # Duración del video
    if args.video_duration:
        duration = args.video_duration
    elif words:
        duration = max(float(w.get("end", 0)) for w in words) + 1
    else:
        duration = 30.0

    # Cargar overlays
    overlays = json.loads(Path(args.overlays_file).read_text(encoding="utf-8"))
    if isinstance(overlays, dict) and "overlays" in overlays:
        overlays = overlays["overlays"]
    if not isinstance(overlays, list):
        print("[error] overlays.json debe ser una lista", file=sys.stderr)
        return 1

    print(
        f"[matcher] {len(overlays)} overlays vs {len(words)} palabras transcript "
        f"(duración {duration}s)",
        file=sys.stderr,
    )

    results = match_all_overlays(overlays, words, duration, args.target_duration)

    # Stats
    by_tier = {"exact": 0, "fuzzy": 0, "fallback": 0, "none": 0}
    for r in results:
        by_tier[r.get("tier", "none")] = by_tier.get(r.get("tier", "none"), 0) + 1
    print(
        f"[matcher] exact={by_tier['exact']} fuzzy={by_tier['fuzzy']} "
        f"fallback={by_tier['fallback']} fail={by_tier['none']}",
        file=sys.stderr,
    )

    output = {"matches": results, "stats": by_tier, "duration": duration}
    if args.out:
        Path(args.out).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
