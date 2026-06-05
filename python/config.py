"""Configuración compartida de paths para los scripts Python.

Variables de entorno opcionales:
    VIRAL_DATA_ROOT       — datos del usuario (default: C:\\viral-data\\videos)
    VIRAL_FFMPEG_PATH     — path explícito a ffmpeg.exe
    VIRAL_FFPROBE_PATH    — path explícito a ffprobe.exe
    VIRAL_OLLAMA_URL      — host de Ollama (default: http://localhost:11434)
    VIRAL_OLLAMA_MODEL    — modelo (default: qwen3:1.7b)
    VIRAL_WHISPER_MODEL   — modelo Whisper (default: small)
    VIRAL_WHISPER_LANGUAGE — idioma (default: es)
"""
import os
import sys
from pathlib import Path

# Forzar stdout/stderr a UTF-8. Cuando Node.js (Next.js) spawnea Python con stdio=pipe,
# Python usa locale.getpreferredencoding() que en Windows es cp1252. Caracteres como
# í/á/é/¿/¡ pasan al encoder y salen como '?' o U+FFFD. Esto rompe el JSON con captions
# en español. reconfigure() requiere Python 3.7+.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
except Exception:
    pass

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _pick_data_root() -> Path:
    override = os.environ.get("VIRAL_DATA_ROOT")
    if override:
        return Path(override)
    # Defaults: viral-data primero, hermes-data como fallback para compat con setup viejo
    candidates = [Path(r"C:\viral-data\videos"), Path(r"C:\hermes-data\videos")]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


DATA_ROOT = _pick_data_root()

RAW_DIR = DATA_ROOT / "raw"
TRANSCRIPTS_DIR = DATA_ROOT / "transcripts"
CUTS_DIR = DATA_ROOT / "cuts"
RENDERS_DIR = DATA_ROOT / "renders"
PROJECTS_DIR = DATA_ROOT / "projects"
ASSETS_BROLL = DATA_ROOT / "assets" / "broll"
ASSETS_MUSIC = DATA_ROOT / "assets" / "music"

LONG_FORM_ROOT = DATA_ROOT / "long_form"
LF_ROOT = LONG_FORM_ROOT  # alias: varios scripts importan LF_ROOT
LF_RAW = LONG_FORM_ROOT / "raw"
LF_TRANSCRIPTS = LONG_FORM_ROOT / "transcripts"
LF_CUTS = LONG_FORM_ROOT / "cuts"
LF_CLEAN = LONG_FORM_ROOT / "clean"
LF_PROPOSALS = LONG_FORM_ROOT / "proposals"
LF_CLIPS = LONG_FORM_ROOT / "clips"
LF_PROJECTS = LONG_FORM_ROOT / "projects"
LF_RENDERS = LONG_FORM_ROOT / "renders"
LF_GRAPHICS = LONG_FORM_ROOT / "graphics"  # Modo Gráficos: specs dataViz/kineticHeadlines por clip

OLLAMA_URL = os.environ.get("VIRAL_OLLAMA_URL", "http://localhost:11434")
# Default: qwen3:1.7b. Es chico pero corre rápido en CPU.
# Para mejor calidad necesitás un modelo más grande Y una GPU (gemma4:26b en CPU pura
# tarda 30+ minutos por inferencia y es inviable). Override con env VIRAL_OLLAMA_MODEL
# o el flag --model en CLI. El pipeline tiene fallback heurístico si Ollama falla.
OLLAMA_MODEL = os.environ.get("VIRAL_OLLAMA_MODEL", "qwen3:1.7b")


def _detect_ffmpeg(binary: str) -> Path:
    env_var = f"VIRAL_{binary.upper()}_PATH"
    override = os.environ.get(env_var)
    if override and Path(override).exists():
        return Path(override)

    tools_dir = DATA_ROOT.parent / "tools"
    if tools_dir.exists():
        for entry in tools_dir.iterdir():
            if entry.is_dir() and entry.name.startswith("ffmpeg-"):
                candidate = entry / "bin" / f"{binary}.exe"
                if candidate.exists():
                    return candidate

    return Path(f"{binary}.exe")


FFMPEG_PATH = _detect_ffmpeg("ffmpeg")
FFPROBE_PATH = _detect_ffmpeg("ffprobe")

# WhisperX (y otras libs) llaman a "ffmpeg" como subprocess esperando que esté en PATH.
# Como nuestro ffmpeg vive en C:\hermes-data\tools\ffmpeg-*\bin\ y no está en el PATH del
# sistema, lo inyectamos acá para que cualquier import de config.py lo arregle.
_ffmpeg_dir = str(FFMPEG_PATH.parent)
if _ffmpeg_dir and _ffmpeg_dir not in os.environ.get("PATH", "").split(os.pathsep):
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

WHISPER_MODEL = os.environ.get("VIRAL_WHISPER_MODEL", "small")
WHISPER_LANGUAGE = os.environ.get("VIRAL_WHISPER_LANGUAGE", "es")
WHISPER_COMPUTE_TYPE = os.environ.get("VIRAL_WHISPER_COMPUTE_TYPE", "int8")

SILENCE_MIN_MS = int(os.environ.get("VIRAL_SILENCE_MIN_MS", "500"))
SILENCE_PAD_MS = int(os.environ.get("VIRAL_SILENCE_PAD_MS", "100"))


def ensure_dirs() -> None:
    for d in [RAW_DIR, TRANSCRIPTS_DIR, CUTS_DIR, RENDERS_DIR, PROJECTS_DIR, ASSETS_BROLL, ASSETS_MUSIC]:
        d.mkdir(parents=True, exist_ok=True)


def ensure_long_form_dirs() -> None:
    for d in [LF_RAW, LF_TRANSCRIPTS, LF_CUTS, LF_CLEAN, LF_PROPOSALS, LF_CLIPS, LF_PROJECTS, LF_RENDERS, LF_GRAPHICS]:
        d.mkdir(parents=True, exist_ok=True)
