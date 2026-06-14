"""Tests de H3: args adaptativos de ffmpeg (hw_profile.ffmpeg_full_args) y el
runner con fallback runtime a libx264 (lib.ffmpeg_safe_run.safe_ffmpeg).

- ffmpeg_full_args: con NVENC+NVDEC mockeado incluye -hwaccel cuda Y -c:v h264_nvenc;
  con CPU-only incluye -c:v libx264 y NO incluye -hwaccel.
- safe_ffmpeg: primer subprocess.run falla (exit 1) con stderr de error NVENC →
  reintenta sin args de hardware (libx264) y el segundo intento sale 0.
"""
import pathlib
import subprocess
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import hw_profile  # noqa: E402
from lib import ffmpeg_safe_run  # noqa: E402


# ---------------------------------------------------------------------------
# Helper: mockear detect() para que recommend tenga el encoder/decoder deseado
# ---------------------------------------------------------------------------
def _mock_profile(monkeypatch, *, video_encoder, video_decoder_hwaccel):
    prof = {
        "recommend": {
            "video_encoder": video_encoder,
            "video_decoder_hwaccel": video_decoder_hwaccel,
        }
    }
    monkeypatch.setattr(hw_profile, "detect", lambda force=False: prof)
    hw_profile._force_x264_session = None
    return prof


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("VIRAL_FORCE_X264", raising=False)
    hw_profile._force_x264_session = None
    yield
    hw_profile._force_x264_session = None


# ---------------------------------------------------------------------------
# 1) ffmpeg_full_args con NVENC + NVDEC
# ---------------------------------------------------------------------------
def test_full_args_nvenc_nvdec(monkeypatch):
    _mock_profile(monkeypatch, video_encoder="h264_nvenc", video_decoder_hwaccel="cuda")
    full = hw_profile.ffmpeg_full_args(input_path="x.mp4")

    # decode hwaccel
    assert "-hwaccel" in full["input_args"]
    assert "cuda" in full["input_args"]
    assert full["input_args"] == ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]

    # encoder
    assert "-c:v" in full["video_args"]
    assert "h264_nvenc" in full["video_args"]
    assert full["video_args"][:2] == ["-c:v", "h264_nvenc"]


# ---------------------------------------------------------------------------
# 2) ffmpeg_full_args CPU-only
# ---------------------------------------------------------------------------
def test_full_args_cpu_only(monkeypatch):
    _mock_profile(monkeypatch, video_encoder="libx264", video_decoder_hwaccel="none")
    full = hw_profile.ffmpeg_full_args(input_path="x.mp4")

    assert full["input_args"] == []  # sin -hwaccel
    assert "-hwaccel" not in full["input_args"]
    assert full["video_args"][:2] == ["-c:v", "libx264"]


# ---------------------------------------------------------------------------
# 3) safe_ffmpeg: error NVENC en el primer intento → reintenta en libx264
# ---------------------------------------------------------------------------
class _FakeProc:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self.args = None


def test_safe_ffmpeg_falls_back_to_x264(monkeypatch):
    _mock_profile(monkeypatch, video_encoder="h264_nvenc", video_decoder_hwaccel="cuda")

    # Cola de respuestas: 1er run falla por NVENC, 2do (libx264) sale 0.
    responses = [
        _FakeProc(1, stderr="[h264_nvenc @ ...] nvenc not supported on this device"),
        _FakeProc(0, stdout="ok"),
    ]
    seen_cmds = []

    def fake_run(cmd, **kwargs):
        seen_cmds.append(list(cmd))
        return responses.pop(0)

    forced = {}
    monkeypatch.setattr(ffmpeg_safe_run.subprocess, "run", fake_run)
    monkeypatch.setattr(
        ffmpeg_safe_run.hw_profile, "force_x264_for_session",
        lambda reason: forced.update(reason=reason),
    )

    cmd = [
        "ffmpeg", "-y",
        "-hwaccel", "cuda", "-hwaccel_output_format", "cuda",
        "-i", "in.mp4",
        "-c:v", "h264_nvenc", "-preset", "p5",
        "out.mp4",
    ]
    res = ffmpeg_safe_run.safe_ffmpeg(cmd, input_path="in.mp4")

    # Resultado FINAL es el del reintento exitoso.
    assert res.returncode == 0
    assert not responses  # se consumieron ambas respuestas (hubo reintento)
    assert forced.get("reason")  # se forzó x264 con un motivo

    # El 2do comando NO debe tener -hwaccel ni h264_nvenc; sí libx264.
    retry = seen_cmds[1]
    assert "-hwaccel" not in retry
    assert "-hwaccel_output_format" not in retry
    assert "h264_nvenc" not in retry
    assert "libx264" in retry
    # preserva flags ad-hoc del comando original
    assert "-i" in retry and "in.mp4" in retry


# ---------------------------------------------------------------------------
# 4) safe_ffmpeg: error que NO es de hardware → NO reintenta
# ---------------------------------------------------------------------------
def test_safe_ffmpeg_non_hw_error_no_retry(monkeypatch):
    _mock_profile(monkeypatch, video_encoder="h264_nvenc", video_decoder_hwaccel="cuda")

    responses = [_FakeProc(1, stderr="No such file or directory: in.mp4")]
    calls = {"n": 0}

    def fake_run(cmd, **kwargs):
        calls["n"] += 1
        return responses.pop(0)

    monkeypatch.setattr(ffmpeg_safe_run.subprocess, "run", fake_run)

    cmd = ["ffmpeg", "-i", "in.mp4", "-c:v", "h264_nvenc", "out.mp4"]
    res = ffmpeg_safe_run.safe_ffmpeg(cmd, input_path="in.mp4")

    assert res.returncode == 1
    assert calls["n"] == 1  # sin reintento
