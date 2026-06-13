"""Tests de python/repair_assets.py (self-heal de assets).

NO baja nada de verdad: monkeypatcheamos subprocess.run del módulo para que las
descargas sean no-ops. Verificamos:
  (a) el lockfile reciente evita una segunda corrida (exit 0, sin re-descargar);
  (b) una librería inválida sale con código != 0 y mensaje.
"""
from __future__ import annotations

import importlib
import os
import sys
import time
from pathlib import Path

import pytest

# python/ al sys.path para poder importar config y repair_assets como en runtime.
PY_DIR = Path(__file__).resolve().parent.parent
if str(PY_DIR) not in sys.path:
    sys.path.insert(0, str(PY_DIR))


@pytest.fixture()
def repair_mod(tmp_path, monkeypatch):
    """Importa repair_assets con DATA_ROOT apuntando a un tmp aislado."""
    monkeypatch.setenv("VIRAL_DATA_ROOT", str(tmp_path))
    # config y repair_assets leen DATA_ROOT en import-time → reimportar limpio.
    for name in ("repair_assets", "config"):
        if name in sys.modules:
            del sys.modules[name]
    import config  # noqa: F401  (re-import con el env nuevo)
    importlib.reload(config)
    repair_assets = importlib.import_module("repair_assets")
    importlib.reload(repair_assets)
    assert repair_assets.DATA_ROOT == tmp_path
    return repair_assets


def _stub_run_ok(calls):
    """Devuelve un fake subprocess.run que registra llamadas y simula rc==0."""
    class _Res:
        returncode = 0
        stdout = ""
        stderr = ""

    def _fake(args, *a, **k):
        calls.append(args)
        return _Res()

    return _fake


def test_lockfile_evita_doble_corrida(repair_mod, monkeypatch):
    """Si ya hay un lock reciente, una segunda corrida sale 0 SIN re-descargar."""
    calls: list = []
    monkeypatch.setattr(repair_mod.subprocess, "run", _stub_run_ok(calls))

    # Primera corrida: descarga (mockeada) y borra el lock al terminar.
    rc1 = repair_mod.reparar("music")
    assert rc1 == 0
    assert len(calls) >= 1  # corrió al menos una descarga
    lock = repair_mod._lock_path("music")
    assert not lock.exists()  # el finally borró el lock

    # Simular que OTRA corrida dejó un lock reciente.
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text(str(time.time()), encoding="utf-8")
    calls.clear()

    rc2 = repair_mod.reparar("music")
    assert rc2 == 0
    assert calls == []  # NO re-descargó: el lock reciente lo cortó
    assert lock.exists()  # no borró el lock de la "otra" corrida


def test_lock_viejo_no_bloquea(repair_mod, monkeypatch):
    """Un lock más viejo que el TTL se ignora y la reparación procede."""
    calls: list = []
    monkeypatch.setattr(repair_mod.subprocess, "run", _stub_run_ok(calls))

    lock = repair_mod._lock_path("sfx")
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text("old", encoding="utf-8")
    # Envejecer el lock más allá del TTL.
    viejo = time.time() - (repair_mod.LOCK_TTL_SECONDS + 60)
    os.utime(lock, (viejo, viejo))

    rc = repair_mod.reparar("sfx")
    assert rc == 0
    assert len(calls) >= 1  # sí re-descargó pese al lock viejo


def test_lib_invalida_sale_con_error(repair_mod, monkeypatch, capsys):
    """Librería inválida → exit != 0 con mensaje."""
    calls: list = []
    monkeypatch.setattr(repair_mod.subprocess, "run", _stub_run_ok(calls))

    rc = repair_mod.reparar("noexiste")
    assert rc != 0
    assert calls == []  # no intentó descargar nada
    out = capsys.readouterr().out
    assert "inválida" in out or "desconocida" in out


def test_main_sin_args_sale_con_error(repair_mod, monkeypatch):
    """main() sin argumento → código != 0."""
    monkeypatch.setattr(repair_mod.subprocess, "run", _stub_run_ok([]))
    monkeypatch.setattr(repair_mod.sys, "argv", ["repair_assets.py"])
    assert repair_mod.main() != 0
