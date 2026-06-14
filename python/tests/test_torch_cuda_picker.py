"""Tests del selector de wheel de PyTorch según el driver NVIDIA (H2).

setup_all._torch_cuda_index_tag(driver) elige el tag del índice de wheels
(cu128/cu126/cu124/cu123) o None (skip → CPU) si el driver es muy viejo o ilegible.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import setup_all  # noqa: E402


def test_driver_572_cu128():
    assert setup_all._torch_cuda_index_tag("572.55") == "cu128"


def test_driver_560_cu126():
    assert setup_all._torch_cuda_index_tag("560.94") == "cu126"


def test_driver_550_cu124():
    assert setup_all._torch_cuda_index_tag("551.23") == "cu124"


def test_driver_525_cu123():
    assert setup_all._torch_cuda_index_tag("530.10") == "cu123"


def test_driver_none_skip():
    assert setup_all._torch_cuda_index_tag(None) is None


def test_driver_viejo_470_skip():
    assert setup_all._torch_cuda_index_tag("470.10") is None


def test_driver_ilegible_skip():
    assert setup_all._torch_cuda_index_tag("desconocido") is None


def test_borde_570_exacto_cu128():
    assert setup_all._torch_cuda_index_tag("570.00") == "cu128"


def test_borde_524_skip():
    assert setup_all._torch_cuda_index_tag("524.99") is None
