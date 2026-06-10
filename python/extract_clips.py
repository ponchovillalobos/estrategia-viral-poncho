"""Extrae los clips propuestos desde el video CLEAN.

Uso:
  python extract_clips.py <video_id>

Para cada clip en long_form/proposals/{video_id}.json:
  - Recorta [start, end] del long_form/clean/{video_id}_clean.mp4
  - Guarda long_form/clips/{video_id}_clip_NN.mp4
  - Recorta sub-transcript con timestamps re-anclados a 0
  - Guarda long_form/transcripts/{video_id}_clip_NN.json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from hw_profile import ffmpeg_video_args
from config import (
    FFMPEG_PATH,
    LF_CLEAN,
    LF_CLIPS,
    LF_PROPOSALS,
    LF_RAW,
    LF_TRANSCRIPTS,
    LF_ROOT,
    ensure_long_form_dirs,
)

# Path para los face tracks (uno por clip) — se crea cuando --face-tracking está activo
LF_FACE_TRACKS = LF_ROOT / "face_tracks"

PYTHON_DIR = Path(__file__).resolve().parent
# El MISMO intérprete que está corriendo este script: venv en dev, Python
# embeddable en el paquete distribuible (la ruta hardcodeada al venv rompía
# los sub-spawns en máquinas de usuarios finales).
VENV_PYTHON = Path(sys.executable)


def detect_aspect(video_path: Path) -> tuple[int, int] | None:
    """Devuelve (width, height) del primer video stream usando ffprobe. None si falla."""
    try:
        from config import FFPROBE_PATH
    except ImportError:
        return None
    try:
        result = subprocess.run(
            [
                str(FFPROBE_PATH),
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        parts = result.stdout.strip().split(",")
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    except Exception:
        return None
    return None


def needs_reframe(clean_path: Path, target_aspect: str | None) -> bool:
    """True si el source tiene aspect distinto al target (con tolerancia 5%)."""
    if target_aspect not in ("9:16", "16:9"):
        return False
    dims = detect_aspect(clean_path)
    if not dims:
        return False
    src_w, src_h = dims
    src_ratio = src_w / src_h
    target_ratio = 9 / 16 if target_aspect == "9:16" else 16 / 9
    return abs(src_ratio - target_ratio) > 0.05


def build_crop_filter(target_aspect: str, face_bbox: tuple[float, float, float, float] | None) -> str:
    """Devuelve el filtro -vf crop para ffmpeg.

    Si face_bbox = (cx, cy, w, h) normalizado, centra el crop en esa posición.
    Si no, center crop estándar.

    target_aspect:
      "9:16" → recortar horizontal del source. Tamaño objetivo: ih*9/16 × ih.
      "16:9" → recortar vertical del source. Tamaño objetivo: iw × iw*9/16.
    """
    if target_aspect == "9:16":
        # Output dim: width = ih*9/16, height = ih.
        # X offset por defecto: (iw - ih*9/16) / 2  (center crop).
        # Con face_bbox: queremos x = cx*iw - (ih*9/16)/2.  Clamp 0..(iw - ih*9/16).
        if face_bbox:
            cx, _, _, _ = face_bbox
            # Usar 'min/max' de ffmpeg para clampear sin que se salga del frame.
            x_expr = f"max(0,min(iw-ih*9/16,({cx:.4f})*iw-(ih*9/16)/2))"
            return f"crop=ih*9/16:ih:{x_expr}:0"
        return "crop=ih*9/16:ih"
    elif target_aspect == "16:9":
        # Output dim: width = iw, height = iw*9/16.
        if face_bbox:
            _, cy, _, _ = face_bbox
            y_expr = f"max(0,min(ih-iw*9/16,({cy:.4f})*ih-(iw*9/16)/2))"
            return f"crop=iw:iw*9/16:0:{y_expr}"
        return "crop=iw:iw*9/16"
    raise ValueError(f"target_aspect inválido: {target_aspect}")


def run_face_tracking(clip_path: Path, out_json: Path, single_frame: bool = True) -> tuple[float, float, float, float] | None:
    """Ejecuta face_tracking.py sobre clip_path. Devuelve el bbox del medio (o promedio).

    single_frame=True → detecta solo en el frame del medio (rápido, ~1s por clip).
    """
    cmd = [
        str(VENV_PYTHON),
        str(PYTHON_DIR / "face_tracking.py"),
        str(clip_path),
        str(out_json),
    ]
    if single_frame:
        cmd.append("--single-frame")
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
    except subprocess.CalledProcessError as e:
        print(f"[face] tracking falló: {e.stderr[-200:]}", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print(f"[face] tracking timeout en {clip_path.name}", file=sys.stderr)
        return None

    try:
        data = json.loads(out_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return None

    samples = data.get("samples", [])
    if not samples:
        print(f"[face] sin samples — no se detectó cara en {clip_path.name}", file=sys.stderr)
        return None

    if single_frame:
        s = samples[0]
        return (s["cx"], s["cy"], s["w"], s["h"])

    # Per-frame: promediar cx/cy (más estable que tomar solo el medio)
    n = len(samples)
    cx_avg = sum(s["cx"] for s in samples) / n
    cy_avg = sum(s["cy"] for s in samples) / n
    w_avg = sum(s["w"] for s in samples) / n
    h_avg = sum(s["h"] for s in samples) / n
    return (cx_avg, cy_avg, w_avg, h_avg)


def extract_clip(
    clean_path: Path,
    start: float,
    end: float,
    out_path: Path,
    target_aspect: str | None = None,
    face_tracking: str = "off",
    clip_id: str | None = None,
) -> dict:
    """Recorta el clip [start, end] del CLEAN.

    Si target_aspect cambia el aspect del source, aplica crop:
      - face_tracking == "off": center crop ciego
      - face_tracking == "single": 2 pases — primero extraer sin crop, detectar cara, recortar centrado en la cara
      - face_tracking == "per-frame": idem pero promediando cara por frame

    Devuelve dict con metadata útil: { center_crop: bool, face_detected: bool, face_bbox: [cx,cy,w,h] | None }
    """
    metadata: dict = {"center_crop": False, "face_detected": False, "face_bbox": None}

    if not needs_reframe(clean_path, target_aspect) or face_tracking == "off":
        # Path simple: extract con (o sin) center crop, 1 solo pase de ffmpeg
        cmd = [
            str(FFMPEG_PATH),
            "-y",
            "-ss", f"{start:.3f}",
            "-i", str(clean_path),
            "-to", f"{end - start:.3f}",
        ]
        if target_aspect in ("9:16", "16:9") and needs_reframe(clean_path, target_aspect):
            cmd.extend(["-vf", build_crop_filter(target_aspect, None)])
            metadata["center_crop"] = True
        cmd.extend([
            # Encoder adaptativo: h264_nvenc si hay GPU NVIDIA funcional, libx264 si no.
            *ffmpeg_video_args("final"),
            "-c:a", "aac",
            "-b:a", "128k",
            str(out_path),
        ])
        subprocess.run(cmd, check=True, capture_output=True)
        return metadata

    # Path face-aware: 2 pases de ffmpeg + face_tracking entre medio
    # Pase 1: extract temporal sin crop espacial → archivo .tmp.mp4
    tmp_path = out_path.with_suffix(".tmp.mp4")
    subprocess.run([
        str(FFMPEG_PATH),
        "-y",
        "-ss", f"{start:.3f}",
        "-i", str(clean_path),
        "-to", f"{end - start:.3f}",
        # intermedio (se re-encodea en pase 2): velocidad sobre tamaño
        *ffmpeg_video_args("fast"),
        "-c:a", "aac",
        "-b:a", "128k",
        str(tmp_path),
    ], check=True, capture_output=True)

    # Face tracking sobre el tmp
    LF_FACE_TRACKS.mkdir(parents=True, exist_ok=True)
    face_json = LF_FACE_TRACKS / f"{clip_id or out_path.stem}.json"
    single_frame = face_tracking == "single"
    bbox = run_face_tracking(tmp_path, face_json, single_frame=single_frame)
    metadata["face_detected"] = bbox is not None
    metadata["face_bbox"] = list(bbox) if bbox else None

    # Pase 2: reframe con face-aware crop (o center fallback si no detectó cara)
    crop_filter = build_crop_filter(target_aspect, bbox)
    subprocess.run([
        str(FFMPEG_PATH),
        "-y",
        "-i", str(tmp_path),
        "-vf", crop_filter,
        *ffmpeg_video_args("final"),
        "-c:a", "copy",
        str(out_path),
    ], check=True, capture_output=True)

    # Cleanup tmp
    try:
        tmp_path.unlink()
    except OSError:
        pass

    if bbox:
        print(
            f"[face] {out_path.name} centrado en cx={bbox[0]:.2f} cy={bbox[1]:.2f}",
            file=sys.stderr,
        )
    else:
        print(
            f"[face] {out_path.name} sin cara detectada → center crop fallback",
            file=sys.stderr,
        )
    return metadata


def slice_transcript(transcript_path: Path, start: float, end: float) -> dict:
    data = json.loads(transcript_path.read_text(encoding="utf-8"))
    sliced_words = []
    for w in data.get("words", []):
        ws, we = float(w["start"]), float(w["end"])
        if we < start:
            continue
        if ws > end:
            break
        sliced_words.append({
            "word": w["word"],
            "start": round(max(0.0, ws - start), 3),
            "end": round(min(end - start, we - start), 3),
            "score": w.get("score", 1.0),
        })
    return {
        "video": f"clip",
        "language": data.get("language", "es"),
        "model": data.get("model", "small"),
        "duration": round(end - start, 3),
        "source_range": [start, end],
        "words": sliced_words,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id", help="ID del video largo (sin extensión)")
    parser.add_argument(
        "--aspect-ratio",
        choices=["9:16", "16:9"],
        default=None,
        help="Si se pasa y no coincide con el source, aplica center-crop con ffmpeg.",
    )
    parser.add_argument(
        "--face-tracking",
        choices=["off", "single", "per-frame"],
        default="off",
        help=(
            "Reframe siguiendo el rostro detectado. "
            "off=center crop ciego (default). "
            "single=detección 1-frame del medio del clip (rápido, ~1s/clip). "
            "per-frame=sample cada 5 frames (preciso, ~5-10s/clip)."
        ),
    )
    args = parser.parse_args()

    ensure_long_form_dirs()

    proposal_path = LF_PROPOSALS / f"{args.video_id}.json"
    if not proposal_path.exists():
        print(f"[error] no encontré {proposal_path}", file=sys.stderr)
        return 1
    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    clips = proposal.get("clips", [])
    if not clips:
        print("[error] proposals sin clips", file=sys.stderr)
        return 1

    # Fuente: preferir el CLEAN (sin silencios) si existe; si no, cortar del RAW.
    # El modo "clips rápidos" no transcribe ni recorta silencios del video entero
    # (inviable en videos de 80 min), así que corta directo del raw.
    clean_path = LF_CLEAN / f"{args.video_id}_clean.mp4"
    if clean_path.exists():
        source_path = clean_path
    else:
        source_path = None
        for ext in (".mp4", ".mov", ".mkv", ".webm", ".m4v"):
            cand = LF_RAW / f"{args.video_id}{ext}"
            if cand.exists():
                source_path = cand
                break
        if source_path is None:
            print(f"[error] no encontré ni clean ni raw para {args.video_id}", file=sys.stderr)
            return 1
        print(f"[extract] sin clean — cortando del raw {source_path.name}", file=sys.stderr)

    # Si existe el transcript COMPLETO del video, cada clip se obtiene cortándolo (rápido).
    # Si NO existe (modo clips rápidos), transcribimos CADA clip por separado: 30-60s de
    # audio es liviano y seguro, a diferencia de transcribir los 80 min de una.
    # OJO: un transcript a nivel FRASE (modo inteligente, alignment="segment") tiene
    # timestamps de palabra INTERPOLADOS (sirven para ELEGIR clips, no para karaoke).
    # En ese caso re-transcribimos cada clip (50s alinea bien) para subtítulos precisos.
    full_transcript_path = LF_TRANSCRIPTS / f"{args.video_id}.json"
    use_full = False
    if full_transcript_path.exists():
        try:
            _t = json.loads(full_transcript_path.read_text(encoding="utf-8"))
            use_full = _t.get("alignment") != "segment"  # solo si es nivel palabra
        except Exception:
            use_full = False
    if not use_full:
        print("[extract] transcript ausente o a nivel frase — se transcribe cada clip (karaoke preciso)", file=sys.stderr)

    results = []
    # Clips que necesitan transcripción: se acumulan y se transcriben en UN solo
    # proceso al final (--batch) — antes se spawneaba un python NUEVO por clip,
    # recargando torch + el modelo Whisper 15+ veces por video (minutos perdidos).
    pending_transcriptions: list[tuple[Path, int]] = []  # (out_transcript, idx en results)
    for i, clip in enumerate(clips, start=1):
        slug = clip.get("slug") or f"clip-{i:02d}"
        clip_id = f"{args.video_id}_c{i:02d}_{slug}"
        out_mp4 = LF_CLIPS / f"{clip_id}.mp4"
        out_transcript = LF_TRANSCRIPTS / f"{clip_id}.json"
        try:
            meta = extract_clip(
                source_path,
                clip["start"],
                clip["end"],
                out_mp4,
                target_aspect=args.aspect_ratio,
                face_tracking=args.face_tracking,
                clip_id=clip_id,
            )
            if use_full:
                sub = slice_transcript(full_transcript_path, clip["start"], clip["end"])
                out_transcript.write_text(json.dumps(sub, ensure_ascii=False, indent=2), encoding="utf-8")
                n_words = len(sub["words"])
            else:
                # Se transcribe DESPUÉS, en un solo batch (una carga de modelo).
                pending_transcriptions.append((out_transcript, len(results)))
                n_words = 0
            results.append({
                "clip_id": clip_id,
                "index": i,
                "slug": slug,
                "ok": True,
                "duration": clip["end"] - clip["start"],
                "words": n_words,
                "face_detected": meta.get("face_detected"),
                "face_bbox": meta.get("face_bbox"),
            })
        except subprocess.CalledProcessError as e:
            results.append({"clip_id": clip_id, "index": i, "ok": False, "error": e.stderr.decode("utf-8", errors="ignore")[:300]})
        except Exception as e:
            results.append({"clip_id": clip_id, "index": i, "ok": False, "error": str(e)})

    # ── BATCH de transcripción: TODOS los clips pendientes con UNA carga de modelo ──
    if pending_transcriptions:
        print(
            f"[extract] transcribiendo {len(pending_transcriptions)} clips en batch "
            "(modelo se carga una sola vez)...",
            file=sys.stderr, flush=True,
        )
        jobs = [
            {"video": str(LF_CLIPS / f"{results[idx]['clip_id']}.mp4"), "out": str(tpath)}
            for tpath, idx in pending_transcriptions
        ]
        batch_file = LF_TRANSCRIPTS / f"_batch_{args.video_id}.json"
        batch_file.write_text(json.dumps(jobs, ensure_ascii=False), encoding="utf-8")
        try:
            tr = subprocess.run(
                [str(VENV_PYTHON), str(PYTHON_DIR / "transcribe.py"), "--batch", str(batch_file)],
                capture_output=True, text=True,
            )
            if tr.returncode != 0:
                print(f"[extract] batch de transcripción falló: {tr.stderr[-400:]}", file=sys.stderr)
        finally:
            batch_file.unlink(missing_ok=True)
        # Completar words[] por clip; los que fallaron quedan con transcript vacío
        # (clip sin subtítulos, pero el pipeline NUNCA se rompe por esto).
        for tpath, idx in pending_transcriptions:
            if not tpath.exists():
                tpath.write_text(
                    json.dumps({"duration": results[idx].get("duration", 50), "words": []}, ensure_ascii=False),
                    encoding="utf-8",
                )
            try:
                results[idx]["words"] = len(json.loads(tpath.read_text(encoding="utf-8")).get("words", []))
            except Exception:
                results[idx]["words"] = 0

    print(json.dumps({"ok": True, "clips": results}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
