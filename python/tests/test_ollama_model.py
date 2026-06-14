"""Tests de la selección de modelo de Ollama por VRAM (H5).

Cubre las DOS capas:
  - hw_profile._recommend(): mapea VRAM/RAM → qwen3:14b/8b/4b/1.7b.
  - config._ollama_model(): lee ese recommend (import lazy de hw_profile) y respeta
    el override VIRAL_OLLAMA_MODEL.
"""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import config  # noqa: E402
import hw_profile  # noqa: E402


def _ollama_for(vram_free_mb: int, ram_gb: float) -> str:
    """Corre el _recommend real con un perfil mínimo y devuelve el ollama_model."""
    prof = {
        "torch_cuda": vram_free_mb > 0,
        "gpu_nvidia": {"vram_free_mb": vram_free_mb, "compute_capability": 8.0} if vram_free_mb else None,
        "ram_gb": ram_gb,
        "cores_physical": 8,
    }
    return hw_profile._recommend(prof)["ollama_model"]


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("VIRAL_OLLAMA_MODEL", raising=False)
    yield


# --- capa hw_profile._recommend: VRAM/RAM → modelo ---
def test_vram_22000_qwen14b():
    assert _ollama_for(22000, 64.0) == "qwen3:14b"


def test_vram_7000_qwen8b():
    assert _ollama_for(7000, 32.0) == "qwen3:8b"


def test_sin_gpu_ram16_qwen4b():
    assert _ollama_for(0, 16.0) == "qwen3:4b"


def test_sin_gpu_ram8_qwen1_7b():
    assert _ollama_for(0, 8.0) == "qwen3:1.7b"


# --- capa config._ollama_model: lee recommend + override env ---
def _fake_detect(ollama_model):
    def _detect(force=False):  # noqa: ARG001
        return {"recommend": {"ollama_model": ollama_model}}
    return _detect


def test_config_lee_recommend(monkeypatch):
    monkeypatch.setattr(hw_profile, "detect", _fake_detect("qwen3:14b"))
    assert config._ollama_model() == "qwen3:14b"


def test_config_env_override_gana(monkeypatch):
    monkeypatch.setattr(hw_profile, "detect", _fake_detect("qwen3:14b"))
    monkeypatch.setenv("VIRAL_OLLAMA_MODEL", "llama3:70b")
    assert config._ollama_model() == "llama3:70b"


def test_config_detect_falla_cae_a_1_7b(monkeypatch):
    def _boom(force=False):  # noqa: ARG001
        raise RuntimeError("sin hw_profile")

    monkeypatch.setattr(hw_profile, "detect", _boom)
    assert config._ollama_model() == "qwen3:1.7b"
