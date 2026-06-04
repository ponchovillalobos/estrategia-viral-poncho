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
import subprocess
import sys
import time
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


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"\n[run] {' '.join(str(x) for x in cmd)}", file=sys.stderr)
    subprocess.run(cmd, check=True, cwd=cwd)


def run_capture(cmd: list[str], cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, check=True, cwd=cwd, capture_output=True, text=True)
    return proc.stdout


def step_transcribe(video_path: Path, video_id: str) -> Path:
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


def step_analyze(video_id: str, model: str | None = None, use_heuristic: bool = False) -> Path:
    out = LF_PROPOSALS / f"{video_id}.json"
    if out.exists():
        print(f"[skip] analyze_clips (existe {out})", file=sys.stderr)
        return out
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "analyze_clips.py"),
        video_id,
    ]
    if model:
        cmd.extend(["--model", model])
    if use_heuristic:
        cmd.append("--use-heuristic")
    run(cmd)
    return out


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
        project_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"[tracking] {len(points)} puntos de cara → {clip_id}_{style_id}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 — best-effort, nunca rompe el clip
        print(f"[tracking] skipped: {e}", file=sys.stderr)


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
) -> Path:
    """Genera proyecto + props + render con Remotion para un (clip, style) específico.

    Output: long_form/renders/{clip_id}_{style_id}.mp4
    aspect_ratio: "9:16" vertical (default) o "16:9" horizontal.
    """
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
    ]
    run(build_args, cwd=REMOTION_DIR)
    # 1.5) motion tracking opt-in (estilos que lo declaran, ej. hype): parchea trackPath
    #      sobre el clip antes de armar los props. Best-effort.
    _apply_tracking(clip_id, style_id)
    # 2) build props.json (pasamos styleId para que cargue el project file correcto)
    run(["node", str(REMOTION_DIR / "build-clip-props.mjs"), clip_id, style_id], cwd=REMOTION_DIR)
    # 3) render — nombre incluye styleId para no pisar otros estilos del mismo clip
    out = LF_RENDERS / f"{clip_id}_{style_id}.mp4"
    run([
        "npx.cmd" if sys.platform == "win32" else "npx",
        "remotion",
        "render",
        "src/index.ts",
        "ViralVideo",
        str(out),
        "--props=props.json",
    ], cwd=REMOTION_DIR)
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
        "--styles",
        default="supreme",
        help="Estilos de render separados por coma (silent,punch,hype,hype_max,hype_max_sfx,supreme). Default: supreme",
    )
    parser.add_argument(
        "--accent-color",
        default=None,
        help="Color accent en hex (#fb7185). Si se omite, paleta rotativa por clipIndex",
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

    # Step 1: transcribe del raw
    print("\n========== STEP 1: transcribe ==========", file=sys.stderr)
    if not args.skip_transcribe:
        step_transcribe(raw_path, args.video_id)

    # Step 2: detect silences
    print("\n========== STEP 2: detect silences ==========", file=sys.stderr)
    cuts_path = step_detect(raw_path, args.video_id)

    # Step 3: cut silences -> clean
    print("\n========== STEP 3: cut silences ==========", file=sys.stderr)
    clean_path = step_cut(raw_path, cuts_path, args.video_id)

    # Step 4: re-transcribir el CLEAN (timestamps alineados a clips extraídos)
    print("\n========== STEP 4: re-transcribe del clean ==========", file=sys.stderr)
    step_re_transcribe_clean(clean_path, args.video_id)

    # Step 5: analyze con Ollama (o heurístico si --use-heuristic)
    print("\n========== STEP 5: analyze (Ollama) ==========", file=sys.stderr)
    proposals_path = step_analyze(args.video_id, model=args.model, use_heuristic=args.use_heuristic)

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

    # Step 7: render (opcional) — N estilos × M clips
    if args.render and clips_info:
        print("\n========== STEP 7: render con Remotion ==========", file=sys.stderr)
        styles = [s.strip() for s in args.styles.split(",") if s.strip()]
        VALID_STYLES = {"silent", "punch", "hype", "hype_max", "hype_max_sfx", "supreme"}
        invalid = [s for s in styles if s not in VALID_STYLES]
        if invalid:
            print(f"[error] estilos inválidos: {invalid}. Válidos: {sorted(VALID_STYLES)}", file=sys.stderr)
            return 1
        print(f"[render] {len(styles)} estilo(s) × {min(args.max_clips or len(clips_info), len(clips_info))} clip(s)", file=sys.stderr)
        limit = args.max_clips if args.max_clips else len(clips_info)
        clips_to_render = clips_info[:limit]
        n_clips = len(clips_to_render)
        for ci, c in enumerate(clips_to_render, start=1):
            for si, style_id in enumerate(styles, start=1):
                # Marcador que la ruta surfacea en el panel: "clip 2/7 · estilo supreme (1/3)".
                # Da contexto durante el render largo en vez de una barra muda.
                print(
                    f"[render] clip {ci}/{n_clips} · estilo {style_id} ({si}/{len(styles)})",
                    file=sys.stderr, flush=True,
                )
                try:
                    out = step_render_clip(
                        args.video_id,
                        c["index"],
                        c["slug"],
                        style_id=style_id,
                        accent_color=args.accent_color,
                        aspect_ratio=args.aspect_ratio,
                    )
                    print(f"[ok] render -> {out}", file=sys.stderr)
                except subprocess.CalledProcessError as e:
                    print(f"[fail] render clip {c['index']} style {style_id}: {e}", file=sys.stderr)

    elapsed = time.time() - t_total
    print(f"\n========== DONE en {elapsed/60:.1f} min ==========", file=sys.stderr)
    print(json.dumps({
        "ok": True,
        "video_id": args.video_id,
        "clean": str(clean_path),
        "clips": len(clips_info),
        "elapsed_min": round(elapsed / 60, 2),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
