"""Pipeline completo: video largo → video clean + N clips virales estilo supreme.

Uso:
  python long_form_pipeline.py <video_id>           # busca raw en long_form/raw/{video_id}.mp4
  python long_form_pipeline.py <video_id> --skip-transcribe   # si ya hay transcript
  python long_form_pipeline.py <video_id> --render             # también renderiza cada clip (largo!)

Pasos:
  1. transcribir (long_form/transcripts/{id}.json)
  2. detect_silences (long_form/cuts/{id}.json)
  3. cut_silences -> long_form/clean/{id}_clean.mp4
  4. analyze_clips (Ollama) -> long_form/proposals/{id}.json
  5. extract_clips -> long_form/clips/{id}_clip_NN.mp4 + transcripts
  6. (opcional) por cada clip: build-clip-supreme.mjs + build-clip-props.mjs + npx remotion render
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from config import (
    FFMPEG_PATH,
    LF_CLEAN,
    LF_CLIPS,
    LF_CUTS,
    LF_PROJECTS,
    LF_PROPOSALS,
    LF_RAW,
    LF_RENDERS,
    LF_TRANSCRIPTS,
    ensure_long_form_dirs,
)


PYTHON_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PYTHON_DIR.parent
REMOTION_DIR = PROJECT_ROOT / "remotion"
VENV_PYTHON = PYTHON_DIR / "venv" / "Scripts" / "python.exe"

# ── Render paralelo de clips (F0.2 auditoría) ───────────────────────────────
# Cuántos renders de Remotion corren A LA VEZ. 2 por default: el render no
# satura el CPU al 100% (arranque de browser, encoding, I/O), así que 2 workers
# dan ~2x throughput real. Override con env LF_RENDER_WORKERS=1 para el modo
# secuencial clásico (o 3 en máquinas con muchos cores).
def _render_workers() -> int:
    try:
        n = int(os.environ.get("LF_RENDER_WORKERS", "2"))
        return max(1, min(4, n))
    except ValueError:
        return 2


def _remotion_concurrency(workers: int) -> int:
    """Workers internos de cada `remotion render`. Repartimos cores-1 entre los
    renders paralelos para no sobre-suscribir el CPU."""
    override = os.environ.get("VIRAL_REMOTION_CONCURRENCY")
    if override and override.isdigit():
        return max(1, int(override))
    cores = os.cpu_count() or 4
    return max(1, (cores - 1) // max(1, workers))


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"\n[run] {' '.join(str(x) for x in cmd)}", file=sys.stderr)
    subprocess.run(cmd, check=True, cwd=cwd)


def _ffprobe_duration(path: Path) -> float:
    """Duración del video en segundos, sin transcribir nada (instantáneo)."""
    ffprobe = FFMPEG_PATH.parent / ("ffprobe.exe" if sys.platform == "win32" else "ffprobe")
    out = subprocess.run(
        [str(ffprobe), "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0


def _write_block_proposals(
    video_id: str, duration: float, max_clips: int = 7, clip_seconds: float = 50.0
) -> Path:
    """Modo CLIPS RÁPIDOS: genera bloques uniformes de ~50s repartidos por el video,
    usando SOLO la duración (ffprobe) — sin transcribir los 80 min. Cada bloque se
    transcribe después por separado, ya cortado, en extract_clips.

    Mismo criterio de espaciado que heuristic_fallback de analyze_clips.
    """
    clips: list[dict] = []
    if duration >= 30:
        spacing = max(clip_seconds + 10, duration / max(1, max_clips))
        n = min(max_clips, max(1, int((duration - clip_seconds) / spacing) + 1))
        for i in range(n):
            start = i * spacing
            end = min(start + clip_seconds, duration)
            if end - start < 25:
                continue
            clips.append({
                "index": i + 1,
                "start": round(start, 2),
                "end": round(end, 2),
                "slug": f"segmento-{i + 1:02d}",
                "hook": f"Segmento {i + 1}",
                "theme": f"Segmento {i + 1} del video",
                "keywords": [],
                "caption": "",
                "hashtags": [],
            })
    proposal = {
        "video_id": video_id,
        "model": "heuristic-blocks",
        "transcript_duration": duration,
        "fallback_heuristic": True,
        "clips": clips,
    }
    out = LF_PROPOSALS / f"{video_id}.json"
    out.write_text(json.dumps(proposal, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def run_capture(cmd: list[str], cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, check=True, cwd=cwd, capture_output=True, text=True)
    return proc.stdout


def step_transcribe(video_path: Path, video_id: str, chunked: bool = False) -> Path:
    out = LF_TRANSCRIPTS / f"{video_id}.json"
    if out.exists():
        print(f"[skip] transcribe (existe {out})", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "transcribe.py"),
        str(video_path),
        "--out", str(out),
    ]
    if chunked:
        # Video largo: ventanas a nivel frase (sin align) para no reventar memoria.
        cmd.append("--chunked")
    run(cmd)
    return out


def step_detect(video_path: Path, video_id: str) -> Path:
    out = LF_CUTS / f"{video_id}.json"
    if out.exists():
        print(f"[skip] detect_silences (existe {out})", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "detect_silences.py"),
        str(video_path),
        "--out", str(out),
    ]
    run(cmd)
    return out


def step_cut(video_path: Path, cuts_path: Path, video_id: str) -> Path:
    out = LF_CLEAN / f"{video_id}_clean.mp4"
    if out.exists():
        print(f"[skip] cut_silences (existe {out})", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "cut_silences.py"),
        str(video_path),
        "--cuts", str(cuts_path),
        "--out", str(out),
    ]
    run(cmd)
    return out


def step_re_transcribe_clean(clean_path: Path, video_id: str, force: bool = False) -> Path:
    """Re-transcribir el video CLEAN para tener timestamps alineados con los clips extraídos.

    El primer transcript es del raw (con silencios). Cuando recortamos silencios, los timestamps
    cambian. Re-transcribimos el clean para que analyze_clips/extract_clips trabajen con
    timestamps consistentes.

    Si ya existe un marker `.from_clean`, asumimos que el transcript ya es del clean y skipeamos.
    """
    out = LF_TRANSCRIPTS / f"{video_id}.json"
    marker = LF_TRANSCRIPTS / f"{video_id}.from_clean"
    if marker.exists() and out.exists() and not force:
        print(f"[skip] re-transcribe (marker existe)", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "transcribe.py"),
        str(clean_path),
        "--out", str(out),
    ]
    run(cmd)
    marker.write_text("ok", encoding="utf-8")
    return out


def step_analyze(
    video_id: str,
    model: str | None = None,
    use_heuristic: bool = False,
    max_clips: int = 15,
) -> Path:
    out = LF_PROPOSALS / f"{video_id}.json"
    if out.exists():
        print(f"[skip] analyze_clips (existe {out})", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "analyze_clips.py"),
        video_id,
        "--max-clips", str(max_clips),
    ]
    if model:
        cmd.extend(["--model", model])
    if use_heuristic:
        cmd.append("--use-heuristic")
    run(cmd)
    return out


def step_score_virality(video_id: str, proposals_path: Path) -> None:
    """Virality Score (0-100) por clip. Lee las propuestas + el transcript y reescribe
    cada clip con viralityScore/reasons/factors, reordenando de más a menos viral.
    Best-effort: si falla, las propuestas quedan sin score (no rompe el job)."""
    try:
        import virality
        tp = LF_TRANSCRIPTS / f"{video_id}.json"
        res = virality.score_proposals_file(proposals_path, tp)
        print(f"[virality] {res}", file=sys.stderr)
    except Exception as e:
        print(f"[virality] no pude scorear (sigo sin score): {e}", file=sys.stderr)


def step_graphics(clip_id: str, use_llm: bool = True) -> None:
    """Modo Gráficos: genera charts + titulares para un clip (best-effort, no rompe el job)."""
    cmd = [str(VENV_PYTHON), str(PYTHON_DIR / "generate_graphics.py"), clip_id]
    if not use_llm:
        cmd.append("--no-llm")
    try:
        run(cmd)
    except subprocess.CalledProcessError as e:
        print(f"[graphics] falló para {clip_id} (sigo sin gráficos): {e}", file=sys.stderr)


def step_extract(
    video_id: str,
    aspect_ratio: str = "9:16",
    face_tracking: str = "off",
) -> list[dict]:
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "extract_clips.py"),
        video_id,
        "--aspect-ratio",
        aspect_ratio,
        "--face-tracking",
        face_tracking,
    ]
    output = run_capture(cmd)
    # extract_clips imprime al final un JSON con la lista
    last_line = output.strip().split("\n")[-1]
    try:
        data = json.loads(last_line)
        return [c for c in data.get("clips", []) if c.get("ok")]
    except json.JSONDecodeError:
        return []


def _apply_tracking(clip_id: str, style_id: str) -> None:
    """Si el estilo pide motion tracking (ej. `hype` setea tracking=true), corre
    track_subject.py sobre el clip y parchea project.trackPath ANTES de build-props.

    Sin esto, el estilo declara tracking/autoReframe pero el trackPath queda vacío y
    los labels que siguen la cara (y el reframe inteligente) no tienen a qué seguir.
    Paridad con applyTracking() del pipeline de shorts, pero operando sobre el clip ya
    extraído (LF_CLIPS) en vez del raw completo.

    Best-effort: si no hay clip, el estilo no pide tracking, o track_subject falla,
    se deja el project como está (trackPath vacío) y el render sigue.
    """
    try:
        project_path = LF_PROJECTS / f"{clip_id}_{style_id}.json"
        if not project_path.exists():
            return
        data = json.loads(project_path.read_text(encoding="utf-8"))
        if not data.get("tracking"):
            return
        # Resolver el clip extraído (normalmente .mp4)
        clip_video = None
        for ext in (".mp4", ".mov", ".mkv", ".webm"):
            cand = LF_CLIPS / f"{clip_id}{ext}"
            if cand.exists():
                clip_video = cand
                break
        if clip_video is None:
            return
        print(f"[tracking] detectando cara en {clip_id}…", file=sys.stderr, flush=True)
        proc = subprocess.run(
            [str(VENV_PYTHON), str(PYTHON_DIR / "track_subject.py"), str(clip_video), "0.15"],
            check=False, cwd=PYTHON_DIR, capture_output=True, text=True, timeout=180,
        )
        line = next(
            (l for l in reversed(proc.stdout.splitlines()) if l.strip().startswith("{")),
            None,
        )
        if not line:
            return
        points = (json.loads(line) or {}).get("points") or []
        if not points:
            return
        data["trackPath"] = points
        # F2 — subtítulos fuera de la cara (paridad con shorts): cara en zona baja
        # del frame → el subtítulo va arriba para no tapar al speaker.
        ys = [p.get("y") for p in points if isinstance(p.get("y"), (int, float))]
        if len(ys) > 3 and sum(ys) / len(ys) > 0.62:
            data["subtitlePosition"] = "top"
            print(f"[tracking] cara abajo → subtítulos ARRIBA ({clip_id})", file=sys.stderr)
        project_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"[tracking] {len(points)} puntos de cara → {clip_id}_{style_id}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — best-effort, nunca rompe el clip
        print(f"[tracking] skipped: {e}", file=sys.stderr)


def _apply_emotion(clip_id: str, style_id: str) -> None:
    """F1 — Director emocional sobre el clip (paridad con applyEmotionDirector de
    shorts): corre emotion_director.py y parchea el project JSON con:
      - musicVolumeCurve (auto-ducking de la música cuando hay voz)
      - reactionZooms extra en los picos emocionales (solo estilos dinámicos)
      - volumen de cada SFX modulado por el arousal local
      - mood global (para selección de música futura)
    Best-effort: si falla, el clip renderiza igual que antes.
    """
    try:
        project_path = LF_PROJECTS / f"{clip_id}_{style_id}.json"
        if not project_path.exists():
            return
        clip_video = None
        for ext in (".mp4", ".mov", ".mkv", ".webm"):
            cand = LF_CLIPS / f"{clip_id}{ext}"
            if cand.exists():
                clip_video = cand
                break
        if clip_video is None:
            return
        transcript = LF_TRANSCRIPTS / f"{clip_id}.json"
        proc = subprocess.run(
            [
                str(VENV_PYTHON), str(PYTHON_DIR / "emotion_director.py"),
                str(clip_video), "--transcript", str(transcript),
            ],
            check=False, cwd=PYTHON_DIR, capture_output=True, text=True,
            timeout=120, encoding="utf-8", errors="replace",
        )
        line = next(
            (l for l in reversed(proc.stdout.splitlines()) if l.strip().startswith("{")),
            None,
        )
        if not line:
            return
        e = json.loads(line)
        if not e.get("ok"):
            return
        data = json.loads(project_path.read_text(encoding="utf-8"))
        data["mood"] = e.get("mood")
        if data.get("musicTrack") and len(e.get("ducking") or []) > 1:
            data["musicVolumeCurve"] = e["ducking"]
        existing_rz = data.get("reactionZooms") or []
        existing_zm = data.get("zoomMarks") or []
        is_dynamic = bool(existing_zm) or bool(existing_rz)
        if is_dynamic:
            peaks = e.get("peaks") or []
            added = [
                {"at": p["t"], "intensity": 1.35, "duration": 0.25}
                for p in peaks
                if p.get("score", 0) >= 0.55
                and not any(abs(z.get("at", -99) - p["t"]) < 2.5 for z in existing_rz)
            ][:3]
            if added:
                data["reactionZooms"] = existing_rz + added
            # Micro punch-ins (paridad con shorts): zoom sutil 8% en picos moderados.
            micro = [
                {"at": p["t"], "duration": 0.5, "scale": 1.08}
                for p in peaks
                if 0.35 <= p.get("score", 0) < 0.55
                and not any(abs(z.get("at", -99) - p["t"]) < 2.0 for z in existing_zm)
            ]
            if micro:
                data["zoomMarks"] = existing_zm + micro
            # F3 — chispas en el pico emocional máximo (paridad con shorts).
            top = max(peaks, key=lambda p: p.get("score", 0), default=None)
            if top and top.get("score", 0) >= 0.6:
                data["particleBursts"] = (data.get("particleBursts") or []) + [
                    {"at": top["t"], "duration": 1.6, "kind": "sparks", "count": 60}
                ]
        project_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(
            f"[emotion] {clip_id}: mood={e.get('mood')} · {len(e.get('peaks') or [])} picos",
            file=sys.stderr,
        )
    except Exception as e:  # noqa: BLE001 — best-effort, nunca rompe el clip
        print(f"[emotion] skipped: {e}", file=sys.stderr)


def _apply_post_fx(rendered: Path, clip_id: str, style_id: str) -> None:
    """Post-procesa el render con ffmpeg, en paridad con el pipeline de shorts:

      1. LUT 3D color grade — lee `lut` del project JSON (todos los estilos setean uno:
         kodak_warm / teal_orange / vintage_film / cyberpunk) y aplica lut3d. Sin esto,
         los clips largos salían SIN el grade que el mismo estilo tiene en shorts.
      2. Audio mastering — compresor + limiter + highpass + EQ de voz. Los largos son
         contenido hablado (cursos/charlas), así que el master mejora la claridad en
         todos los estilos (en shorts solo corría para cinematic_pro).

    Best-effort: cada paso es try/except con timeout. Si ffmpeg falla o el .cube no
    existe, se conserva el render tal cual y el clip NO se da por fallido.
    """
    # 1) LUT — leer el nombre del .cube del project JSON que escribió build-clip-supreme
    try:
        project_path = LF_PROJECTS / f"{clip_id}_{style_id}.json"
        lut_name = None
        if project_path.exists():
            data = json.loads(project_path.read_text(encoding="utf-8"))
            lut_name = data.get("lut")
        if lut_name:
            lut_file = REMOTION_DIR / "public" / "luts" / lut_name
            if lut_file.exists():
                graded = rendered.with_name(rendered.stem + "_graded.mp4")
                # Log ANTES de arrancar: el lut3d re-encodea todo el clip y tarda 1-2 min
                # en silencio. Sin este aviso el panel de progreso parece congelado.
                print(
                    f"[post-fx] aplicando color grade ({lut_name})… re-encode del clip, ~1-2 min",
                    file=sys.stderr, flush=True,
                )
                # Ruta relativa con forward-slashes (cwd=REMOTION_DIR) para evitar el
                # escaping del ":" de la unidad de Windows dentro del filtergraph.
                # preset=fast (no medium): ~40% más rápido a crf 18 con calidad casi igual,
                # clave porque un lote de largos re-encodea N clips × M estilos.
                subprocess.run(
                    [
                        str(FFMPEG_PATH), "-y",
                        "-i", str(rendered),
                        "-vf", f"lut3d=public/luts/{lut_name}",
                        "-c:a", "copy",
                        "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                        "-pix_fmt", "yuv420p",
                        str(graded),
                    ],
                    check=True, cwd=REMOTION_DIR, timeout=240,
                )
                graded.replace(rendered)
                print(f"[post-fx] LUT aplicado ({lut_name}): {rendered.name}", file=sys.stderr)
            else:
                print(f"[post-fx] LUT no encontrado, se salta: {lut_name}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — best-effort, nunca rompe el clip
        print(f"[post-fx] LUT skipped: {e}", file=sys.stderr)

    # 2) Audio mastering — mismos filtros que el SUPREME de shorts
    try:
        mastered = rendered.with_name(rendered.stem + "_mastered.mp4")
        audio_filter = (
            "acompressor=threshold=-18dB:ratio=3:attack=20:release=200,"
            "alimiter=level_in=1:level_out=0.95:limit=0.95,"
            "highpass=f=80,"
            "equalizer=f=3000:t=q:w=1:g=2"
        )
        print("[post-fx] masterizando audio…", file=sys.stderr, flush=True)
        subprocess.run(
            [
                str(FFMPEG_PATH), "-y",
                "-i", str(rendered),
                "-af", audio_filter,
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                str(mastered),
            ],
            check=True, cwd=REMOTION_DIR, timeout=120,
        )
        mastered.replace(rendered)
        print(f"[post-fx] audio mastered: {rendered.name}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — best-effort, nunca rompe el clip
        print(f"[post-fx] audio mastering skipped: {e}", file=sys.stderr)


def step_render_clip(
    video_id: str,
    clip_index: int,
    slug: str,
    style_id: str = "supreme",
    accent_color: str | None = None,
    aspect_ratio: str = "9:16",
    remotion_concurrency: int = 0,
    subtitle_font: str | None = None,
    subtitle_color: str | None = None,
    editorial_theme: str | None = None,
) -> Path:
    """Genera proyecto + props + render con Remotion para un (clip, style) específico.

    Output: long_form/renders/{clip_id}_{style_id}.mp4
    aspect_ratio: "9:16" vertical (default) o "16:9" horizontal.
    remotion_concurrency: workers internos de Remotion (0 = auto según workers del pool).
    """
    if remotion_concurrency <= 0:
        remotion_concurrency = _remotion_concurrency(_render_workers())
    clip_id = f"{video_id}_c{clip_index:02d}_{slug}"
    # 1) build project JSON con el estilo elegido + aspect ratio
    #    Si pasamos aspect pero no accent, le metemos accent vacío para preservar el orden de args
    build_args = [
        "node",
        str(REMOTION_DIR / "build-clip-supreme.mjs"),
        video_id,
        str(clip_index),
        style_id,
        accent_color or "",
        aspect_ratio,
        # Fuente + color de subtítulos elegidos en el wizard de largos ("" = del estilo).
        subtitle_font or "",
        subtitle_color or "",
        # Tema editorial "font:background" (solo lo usa el estilo editorial).
        editorial_theme or "",
    ]
    run(build_args, cwd=REMOTION_DIR)
    # 1.5) motion tracking opt-in (estilos que lo declaran, ej. hype): parchea trackPath
    #      sobre el clip antes de armar los props. Best-effort.
    _apply_tracking(clip_id, style_id)
    # 1.6) F1 — director emocional: ducking de música + zooms en picos. Best-effort.
    _apply_emotion(clip_id, style_id)
    # 2) build props — archivo ÚNICO por clip+estilo: con render paralelo, dos workers
    #    escribiendo "props.json" se pisarían (un clip renderizaría los props del otro).
    props_name = f"props_{clip_id}_{style_id}.json"
    run(
        ["node", str(REMOTION_DIR / "build-clip-props.mjs"), clip_id, style_id, props_name],
        cwd=REMOTION_DIR,
    )
    # 3) render — nombre incluye styleId para no pisar otros estilos del mismo clip
    out = LF_RENDERS / f"{clip_id}_{style_id}.mp4"
    try:
        run([
            "npx.cmd" if sys.platform == "win32" else "npx",
            "remotion",
            "render",
            "src/index.ts",
            "ViralVideo",
            str(out),
            "--concurrency",
            str(remotion_concurrency),
            # delayRender amplio: el dev server sirviendo el clip bajo carga puede
            # tardar >28s (default) en responder un seek de OffthreadVideo.
            "--timeout=120000",
            f"--props={props_name}",
        ], cwd=REMOTION_DIR)
    finally:
        # limpiar el props temporal (best-effort)
        try:
            (REMOTION_DIR / props_name).unlink(missing_ok=True)
        except OSError:
            pass
    # 4) post-fx: LUT color grade + audio mastering (paridad con shorts). Best-effort.
    _apply_post_fx(out, clip_id, style_id)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id", help="ID del video largo (sin extensión, en long_form/raw/)")
    parser.add_argument("--model", help="Modelo Ollama (override)")
    parser.add_argument("--render", action="store_true", help="También renderizar cada clip con Remotion")
    parser.add_argument("--max-clips", type=int, default=None, help="Limitar cantidad de clips a renderizar")
    parser.add_argument("--skip-transcribe", action="store_true")
    parser.add_argument(
        "--use-heuristic",
        action="store_true",
        help="Skipear Ollama y usar clips uniformes (modo rápido, sin curaduría de IA)",
    )
    parser.add_argument(
        "--graphics",
        action="store_true",
        help="Modo Gráficos & Motion: genera charts + titulares poderosos por clip (auto desde el transcript)",
    )
    parser.add_argument(
        "--styles",
        default="supreme",
        help="Estilos de render separados por coma (silent,punch,hype,hype_max,hype_max_sfx,supreme,graphics_pro,graphics_max). Default: supreme",
    )
    parser.add_argument(
        "--accent-color",
        default=None,
        help="Color accent en hex (#fb7185). Si se omite, paleta rotativa por clipIndex",
    )
    parser.add_argument(
        "--subtitle-font",
        default=None,
        help="Fuente de subtítulos (bebas/anton/montserrat/…). 'auto' o vacío = la del estilo",
    )
    parser.add_argument(
        "--subtitle-color",
        default=None,
        help="Color del TEXTO de subtítulos en hex (#fde047). 'auto' o vacío = el del estilo",
    )
    parser.add_argument(
        "--editorial-theme",
        default=None,
        help="Tema del estilo editorial como 'font:background' (ej. playfair:dark). Solo aplica al estilo editorial",
    )
    parser.add_argument(
        "--platforms",
        default=None,
        help="Plataformas destino separadas por coma (tiktok,instagram,linkedin). Solo informativo",
    )
    parser.add_argument(
        "--aspect-ratio",
        choices=["9:16", "16:9"],
        default="9:16",
        help="Aspecto del output. 9:16 vertical (default) o 16:9 horizontal.",
    )
    parser.add_argument(
        "--face-tracking",
        choices=["off", "single", "per-frame"],
        default="off",
        help=(
            "Reframe siguiendo el rostro detectado al cambiar aspect ratio. "
            "off=center crop ciego (default). single=detección 1-frame. per-frame=preciso."
        ),
    )
    args = parser.parse_args()

    ensure_long_form_dirs()

    raw_path = LF_RAW / f"{args.video_id}.mp4"
    if not raw_path.exists():
        # Probar otras extensiones
        for ext in (".mov", ".mkv", ".webm"):
            alt = LF_RAW / f"{args.video_id}{ext}"
            if alt.exists():
                raw_path = alt
                break
    if not raw_path.exists():
        print(f"[error] no encontré {raw_path}", file=sys.stderr)
        return 1

    t_total = time.time()
    clean_path = None  # se setea solo en el modo completo (no en clips rápidos)

    if args.use_heuristic:
        # ── MODO CLIPS RÁPIDOS ────────────────────────────────────────────────
        # No transcribimos NI recortamos silencios del video entero (en un video de
        # 80 min, transcribir+alinear de una sola vez revienta la memoria). En cambio:
        # duración por ffprobe → bloques uniformes de ~50s → se cortan del raw y se
        # transcribe CADA clip por separado (30-60s = liviano y seguro) en extract_clips.
        # Marcamos los pasos 1-5 como saltados para que la UI no quede en "pending".
        print("\n========== STEP 1-5 (modo clips rápidos): bloques por duración ==========", file=sys.stderr)
        for _skip in ("transcribe", "detect_silences", "cut_silences",
                      "re-transcribe", "analyze_clips"):
            print(f"[skip] {_skip} (modo clips rápidos)", file=sys.stderr)
        duration = _ffprobe_duration(raw_path)
        if duration <= 0:
            print("[error] no pude leer la duración del video (¿corrupto?)", file=sys.stderr)
            return 1
        max_clips = args.max_clips if args.max_clips else 7
        proposals_path = _write_block_proposals(args.video_id, duration, max_clips=max_clips)
        print(f"[fast] {duration / 60:.1f} min → bloques de ~50s", file=sys.stderr)
    else:
        # ── MODO INTELIGENTE (encuentra lo más viral) ─────────────────────────
        # Transcribimos el raw EN VENTANAS a nivel frase (sin la alineación que
        # reventaba la memoria en videos de 80-90 min). Con ese transcript completo,
        # Ollama LEE TODO y elige los momentos más virales (mínimo 15, más si hay).
        # NO recortamos silencios ni re-transcribimos el clean: los clips se cortan
        # directo del raw y cada uno se alinea por separado en extract_clips (karaoke).
        #
        # Step 1: transcribe del raw (en chunks)
        print("\n========== STEP 1: transcribe ==========", file=sys.stderr)
        if not args.skip_transcribe:
            step_transcribe(raw_path, args.video_id, chunked=True)

        # Pasos 2-4 no aplican en modo inteligente: los marcamos saltados para que
        # la UI no quede en "pending" esperándolos.
        for _skip in ("detect_silences", "cut_silences", "re-transcribe"):
            print(f"[skip] {_skip} (modo inteligente: clips se cortan del raw)", file=sys.stderr)

        # max_clips: mínimo 15, y más si el video es largo (~1 cada 5 min), tope 30.
        # Es un TECHO — Ollama propone solo los que realmente valen; si hay menos
        # momentos virales, saca menos.
        if args.max_clips:
            smart_max = args.max_clips
        else:
            dur_min = _ffprobe_duration(raw_path) / 60.0
            smart_max = max(15, min(30, int(dur_min / 5) + 1))
        print(f"[smart] objetivo: hasta {smart_max} clips virales", file=sys.stderr)

        # Step 5: analyze con Ollama
        print("\n========== STEP 5: analyze (Ollama) ==========", file=sys.stderr)
        proposals_path = step_analyze(
            args.video_id, model=args.model,
            use_heuristic=args.use_heuristic, max_clips=smart_max,
        )

    # Validación: si el LLM no propuso ningún clip, fallar AHORA con mensaje claro
    # en vez de seguir a extract_clips que va a fallar con un error genérico.
    try:
        proposals_data = json.loads(proposals_path.read_text(encoding="utf-8"))
        clip_count = len(proposals_data.get("clips", []))
        if clip_count == 0:
            model_used = proposals_data.get("model", args.model or "default")
            print(
                f"\n[ERROR ANALYZE] El modelo '{model_used}' no propuso ningún clip.\n"
                f"  Causa típica: el modelo es demasiado chico para razonar sobre transcripts largos.\n"
                f"  Solución: re-ejecutar con un modelo más grande, p.ej.:\n"
                f"    python long_form_pipeline.py \"{args.video_id}\" --model gemma4:26b --skip-transcribe\n"
                f"  (Borrá antes long_form/proposals/{args.video_id}.json para forzar regenerar.)",
                file=sys.stderr,
            )
            return 1
        print(f"[ok] {clip_count} clips propuestos por el modelo", file=sys.stderr)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"[ERROR ANALYZE] no pude leer {proposals_path}: {e}", file=sys.stderr)
        return 1

    # Virality Score (0-100) por clip — reordena de más a menos viral.
    print("\n========== Virality Score ==========", file=sys.stderr)
    step_score_virality(args.video_id, proposals_path)

    # Step 6: extract clips (con aspect ratio + face tracking opcional)
    print("\n========== STEP 6: extract clips ==========", file=sys.stderr)
    clips_info = step_extract(
        args.video_id,
        aspect_ratio=args.aspect_ratio,
        face_tracking=args.face_tracking,
    )
    print(f"\n[ok] {len(clips_info)} clips extraídos", file=sys.stderr)
    for c in clips_info:
        print(f"  - {c['clip_id']} ({c.get('duration', '?')}s)", file=sys.stderr)

    # Modo Gráficos & Motion: charts + íconos visuales por clip, auto desde el
    # transcript de cada clip (que extract_clips ya dejó alineado palabra-por-palabra).
    # Se activa con --graphics O si algún estilo elegido los trae (paridad con shorts:
    # hype/hype_max/hype_max_sfx/supreme/graphics_* generan graphics: true).
    GRAPHICS_STYLES = {
        "hype", "hype_max", "hype_max_sfx", "supreme", "graphics_pro", "graphics_max",
        "motion_pro", "motion_beat", "motion_grid", "editorial",
    }
    requested_styles = {s.strip() for s in args.styles.split(",") if s.strip()}
    wants_graphics = args.graphics or bool(requested_styles & GRAPHICS_STYLES)
    if wants_graphics and clips_info:
        print("\n========== Modo Gráficos: charts + íconos por clip ==========", file=sys.stderr)
        for c in clips_info:
            step_graphics(c["clip_id"], use_llm=not args.use_heuristic)

    # Step 7: render (opcional) — N estilos × M clips
    if args.render and clips_info:
        print("\n========== STEP 7: render con Remotion ==========", file=sys.stderr)
        styles = [s.strip() for s in args.styles.split(",") if s.strip()]
        VALID_STYLES = {
            "silent", "punch", "hype", "hype_max", "hype_max_sfx", "supreme",
            "graphics_pro", "graphics_max",
            "motion_pro", "motion_beat", "motion_grid", "editorial",
        }
        invalid = [s for s in styles if s not in VALID_STYLES]
        if invalid:
            print(f"[error] estilos inválidos: {invalid}. Válidos: {sorted(VALID_STYLES)}", file=sys.stderr)
            return 1
        print(f"[render] {len(styles)} estilo(s) × {min(args.max_clips or len(clips_info), len(clips_info))} clip(s)", file=sys.stderr)
        limit = args.max_clips if args.max_clips else len(clips_info)
        clips_to_render = clips_info[:limit]
        n_clips = len(clips_to_render)
        # ── Render PARALELO (F0.2): pool de N workers (default 2, env LF_RENDER_WORKERS).
        # Cada (clip, estilo) es independiente: project/props/output únicos por par.
        # Con 2 workers el lote baja de ~80 min a ~35-40 min (15 clips supreme).
        tasks = [
            (ci, c, si, style_id)
            for ci, c in enumerate(clips_to_render, start=1)
            for si, style_id in enumerate(styles, start=1)
        ]
        workers = min(_render_workers(), max(1, len(tasks)))
        rc = _remotion_concurrency(workers)
        print(
            f"[render] {workers} render(s) en paralelo · --concurrency {rc} c/u",
            file=sys.stderr, flush=True,
        )
        done_count = 0

        def _render_one(task: tuple) -> tuple:
            ci, c, si, style_id = task
            # Marcador que la ruta surfacea en el panel: "clip 2/7 · estilo supreme (1/3)".
            print(
                f"[render] clip {ci}/{n_clips} · estilo {style_id} ({si}/{len(styles)})",
                file=sys.stderr, flush=True,
            )
            out = step_render_clip(
                args.video_id,
                c["index"],
                c["slug"],
                style_id=style_id,
                accent_color=args.accent_color,
                aspect_ratio=args.aspect_ratio,
                remotion_concurrency=rc,
                subtitle_font=args.subtitle_font,
                subtitle_color=args.subtitle_color,
                editorial_theme=args.editorial_theme,
            )
            return (c["index"], style_id, out)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_render_one, t): t for t in tasks}
            for fut in as_completed(futures):
                ci, c, si, style_id = futures[fut]
                try:
                    _, _, out = fut.result()
                    done_count += 1
                    print(
                        f"[ok] render -> {out} ({done_count}/{len(tasks)} listos)",
                        file=sys.stderr, flush=True,
                    )
                except subprocess.CalledProcessError as e:
                    print(f"[fail] render clip {c['index']} style {style_id}: {e}", file=sys.stderr)
                except Exception as e:  # noqa: BLE001 — un clip fallido no tumba el lote
                    print(f"[fail] render clip {c['index']} style {style_id}: {e}", file=sys.stderr)

    elapsed = time.time() - t_total
    print(f"\n========== DONE en {elapsed/60:.1f} min ==========", file=sys.stderr)
    print(json.dumps({
        "ok": True,
        "video_id": args.video_id,
        # En modo clips rápidos no se genera clean (se corta del raw).
        "clean": str(clean_path) if clean_path else None,
        "clips": len(clips_info),
        "elapsed_min": round(elapsed / 60, 2),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
