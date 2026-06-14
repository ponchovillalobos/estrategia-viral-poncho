"""Tests de la RESILIENCIA de python/setup_all.py (T4).

NO baja nada de verdad: monkeypatcheamos `_run` (el unit que corre cada paso) para
controlar qué pasos pasan y cuáles fallan, `_validate` para no depender de archivos
en disco, y la detección de GPU para que torch CUDA se saltee. Verificamos:
  (a) con un paso que falla y otro que pasa → el estado persiste ok / fail_final y el
      setup CONTINÚA con los demás (no aborta).
  (b) 2ª corrida con estado fresco presente → el 1er stage se SALTEA (skip).
  (c) un stage con "ok" más viejo que 7 días → se RE-EJECUTA (no skip).
"""
from __future__ import annotations

import importlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# python/ al sys.path para importar config y setup_all como en runtime.
PY_DIR = Path(__file__).resolve().parent.parent
if str(PY_DIR) not in sys.path:
    sys.path.insert(0, str(PY_DIR))


@pytest.fixture()
def setup_mod(tmp_path, monkeypatch):
    """Importa setup_all con DATA_ROOT (y STATE_PATH) apuntando a un tmp aislado."""
    monkeypatch.setenv("VIRAL_DATA_ROOT", str(tmp_path))
    # config y setup_all leen DATA_ROOT/STATE_PATH en import-time → reimportar limpio.
    for name in ("setup_all", "config"):
        if name in sys.modules:
            del sys.modules[name]
    # Mockear detect() ANTES de recargar config: config llama hw_profile.detect() al
    # importar (auto-config de Whisper/Ollama). Sin esto correría probes REALES de
    # hardware (spawns de ffmpeg) en cada reimport → lento. Este test es de la lógica
    # de reanudación, no del hardware.
    import hw_profile
    monkeypatch.setattr(
        hw_profile,
        "detect",
        lambda force=False: {
            "recommend": {
                "whisper_model": "small",
                "whisper_device": "cpu",
                "whisper_compute_type": "int8",
                "ollama_model": "qwen3:1.7b",
            },
            "gpu_nvidia": {"driver_version": None},
        },
        raising=False,
    )
    import config  # noqa: F401  (re-import con el env nuevo)
    importlib.reload(config)
    setup_all = importlib.import_module("setup_all")
    importlib.reload(setup_all)
    assert setup_all.DATA_ROOT == tmp_path
    assert setup_all.STATE_PATH == tmp_path / "cache" / "setup_state.json"

    # Sin GPU → el stage torch_install_cuda se saltea sin tocar pip/torch.
    monkeypatch.setattr(setup_all, "_hay_gpu_nvidia", lambda: False)
    # Validación post-paso: por defecto siempre OK (no dependemos de archivos reales).
    monkeypatch.setattr(setup_all, "_validate", lambda stage: (True, "ok-mock"))
    # H4/H5: aislar las descargas reales NUEVAS. Un `ollama pull` real cuelga hasta
    # 1800s (no pasa por el _run mockeado), y _download_recommended_whisper llamaría
    # detect(). Los neutralizamos: este test mide la reanudación de stages, no esto.
    monkeypatch.setattr(setup_all, "_ollama_disponible", lambda: False, raising=False)
    monkeypatch.setattr(setup_all, "_install_ollama_model", lambda state: None, raising=False)
    monkeypatch.setattr(setup_all, "_download_recommended_whisper", lambda state: None, raising=False)
    return setup_all


def _read_state(mod) -> dict:
    return json.loads(mod.STATE_PATH.read_text(encoding="utf-8"))


def _patch_run(mod, monkeypatch, fail_stages: set[str], calls: list[str]):
    """Reemplaza _run para que registre el stage llamado y falle los indicados."""
    def fake_run(stage, nombre, args):
        calls.append(stage)
        if stage in fail_stages:
            return False, f"fallo simulado de {stage}"
        return True, ""

    monkeypatch.setattr(mod, "_run", fake_run)


def test_un_paso_falla_y_continua(setup_mod, monkeypatch):
    """El 1º (fonts) pasa, el 2º (iconos) falla → estado ok / fail y CONTINÚA."""
    calls: list[str] = []
    _patch_run(setup_mod, monkeypatch, fail_stages={"iconos_editoriales"}, calls=calls)

    rc = setup_mod.main()
    # whisper_voice (crítico) pasó → exit 0.
    assert rc == 0

    st = _read_state(setup_mod)
    stages = st["stages"]
    assert stages["fonts"]["status"] == "ok"
    assert stages["iconos_editoriales"]["status"] == "fail"
    assert "error" in stages["iconos_editoriales"]

    # Continuó con los pasos posteriores al que falló.
    assert "musica" in calls
    assert "sfx" in calls
    assert stages["musica"]["status"] == "ok"
    assert stages["sfx"]["status"] == "ok"
    # torch se saltea (sin GPU).
    assert stages["torch_install_cuda"]["status"] == "skip"
    # Metadatos del estado.
    assert "lastRunAt" in st
    assert st["version"]


def test_segunda_corrida_skipea_ok_fresco(setup_mod, monkeypatch, capsys):
    """Con estado fresco, los stages 'ok' (skippables) se SALTEAN en la 2ª corrida."""
    calls: list[str] = []
    _patch_run(setup_mod, monkeypatch, fail_stages=set(), calls=calls)

    # 1ª corrida: todo OK, escribe estado fresco.
    assert setup_mod.main() == 0
    assert "fonts" in calls

    # 2ª corrida: fonts debería saltearse (no volver a llamar _run).
    calls.clear()
    capsys.readouterr()  # limpiar buffer
    assert setup_mod.main() == 0
    out = capsys.readouterr().out

    # fonts NO se re-ejecutó (skippable + ok + fresco + valida).
    assert "fonts" not in calls
    # Se emitió un evento skip para fonts.
    skip_events = [
        json.loads(l)
        for l in out.splitlines()
        if l.startswith("{") and '"stage": "fonts"' in l
    ]
    assert any(e["status"] == "skip" for e in skip_events)
    # whisper_voice (crítico, NO skippable) SÍ se re-ejecuta siempre.
    assert "whisper_voice" in calls


def test_stage_viejo_se_reejecuta(setup_mod, monkeypatch):
    """Un 'ok' con lastRunAt > 7 días se considera expirado y se RE-EJECUTA."""
    calls: list[str] = []
    _patch_run(setup_mod, monkeypatch, fail_stages=set(), calls=calls)

    # Sembrar un estado viejo: fonts ok pero lastRunAt hace 8 días.
    viejo = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    setup_mod.STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    setup_mod.STATE_PATH.write_text(
        json.dumps(
            {
                "lastRunAt": viejo,
                "version": "0.3.4",
                "stages": {"fonts": {"status": "ok", "ms": 10, "at": viejo}},
            }
        ),
        encoding="utf-8",
    )

    assert setup_mod.main() == 0
    # fonts expiró → se RE-EJECUTÓ (apareció en las llamadas a _run).
    assert "fonts" in calls
