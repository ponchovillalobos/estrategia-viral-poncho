"""Tests de config._whisper_defaults(): autodetección de Whisper por hardware.

_whisper_defaults() importa hw_profile.detect() de forma LAZY (dentro de la
función), así que monkeypatcheamos hw_profile.detect para simular distintos equipos
y validamos (model, device, compute_type). El env VIRAL_WHISPER_* SIEMPRE gana.
"""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import config  # noqa: E402
import hw_profile  # noqa: E402


def _fake_detect(*, whisper_model, whisper_device, whisper_compute_type):
    """Devuelve un detect() falso con el bloque recommend que nos interesa."""
    def _detect(force=False):  # noqa: ARG001 — firma compat
        return {
            "recommend": {
                "whisper_model": whisper_model,
                "whisper_device": whisper_device,
                "whisper_compute_type": whisper_compute_type,
                "ollama_model": "qwen3:1.7b",
            }
        }
    return _detect


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for var in ("VIRAL_WHISPER_MODEL", "VIRAL_WHISPER_DEVICE", "VIRAL_WHISPER_COMPUTE_TYPE"):
        monkeypatch.delenv(var, raising=False)
    yield


def test_gpu_16gb_large_v3(monkeypatch):
    monkeypatch.setattr(
        hw_profile, "detect",
        _fake_detect(whisper_model="large-v3", whisper_device="cuda", whisper_compute_type="float16"),
    )
    assert config._whisper_defaults() == ("large-v3", "cuda", "float16")


def test_cpu_8gb_base_int8(monkeypatch):
    monkeypatch.setattr(
        hw_profile, "detect",
        _fake_detect(whisper_model="base", whisper_device="cpu", whisper_compute_type="int8"),
    )
    assert config._whisper_defaults() == ("base", "cpu", "int8")


def test_env_model_override_gana(monkeypatch):
    # GPU recomienda large-v3 pero el user fuerza tiny por env → tiny gana,
    # device/compute siguen siendo los de la GPU.
    monkeypatch.setattr(
        hw_profile, "detect",
        _fake_detect(whisper_model="large-v3", whisper_device="cuda", whisper_compute_type="float16"),
    )
    monkeypatch.setenv("VIRAL_WHISPER_MODEL", "tiny")
    assert config._whisper_defaults() == ("tiny", "cuda", "float16")


def test_detect_falla_cae_a_defaults(monkeypatch):
    def _boom(force=False):  # noqa: ARG001
        raise RuntimeError("sin hw_profile")

    monkeypatch.setattr(hw_profile, "detect", _boom)
    assert config._whisper_defaults() == ("small", "cpu", "int8")
