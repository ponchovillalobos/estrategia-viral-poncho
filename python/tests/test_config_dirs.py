import os
import sys
import tempfile
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))


def _reimport_config():
    for m in list(sys.modules):
        if m == "config":
            del sys.modules[m]
    import config

    return config


def test_ensure_dirs_crea_las_11_carpetas():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["VIRAL_DATA_ROOT"] = tmp
        config = _reimport_config()
        config.ensure_dirs()
        root = pathlib.Path(tmp)
        esperadas = [
            "raw", "transcripts", "cuts", "renders", "projects",
            "assets/broll", "assets/music",
            "assets/sfx", "assets/lottie/noto", "assets/icons", "assets/overlays",
        ]
        faltantes = [s for s in esperadas if not (root / s).is_dir()]
        assert not faltantes, f"faltan: {faltantes}"


def test_ensure_long_form_crea_las_carpetas_de_long_form():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["VIRAL_DATA_ROOT"] = tmp
        config = _reimport_config()
        config.ensure_long_form_dirs()
        root = pathlib.Path(tmp) / "long_form"
        for s in ["raw", "transcripts", "cuts", "clean", "proposals", "clips", "projects", "renders", "graphics"]:
            assert (root / s).is_dir(), f"falta long_form/{s}"
