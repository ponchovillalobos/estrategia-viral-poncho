#!/usr/bin/env python
"""translate.py — Traducción offline con argos-translate (gratis, MIT).

Toma un texto y un idioma destino (en/pt/etc.) y devuelve la traducción.
Los paquetes de idioma se bajan una sola vez con argostranslate.package.

Uso:
    python translate.py "<texto>" --to en
    python translate.py "<texto>" --from es --to pt

Salida (stdout): JSON {ok, translated} o {ok:false, error}. Si el paquete
de idioma no está instalado, devuelve error claro (sin levantar excepción).
"""
from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("text", help="texto a traducir")
    p.add_argument("--from", dest="src", default="es", help="código origen (default es)")
    p.add_argument("--to", dest="dst", required=True, help="código destino (en, pt, fr, ...)")
    args = p.parse_args()

    if not args.text.strip():
        print(json.dumps({"ok": False, "error": "texto vacío"}))
        return 1

    try:
        from argostranslate import translate
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"argostranslate no instalado: {exc}"}))
        return 1

    try:
        out = translate.translate(args.text, args.src, args.dst)
        if not out:
            print(json.dumps({
                "ok": False,
                "error": f"paquete {args.src}→{args.dst} no instalado",
            }))
            return 1
        print(json.dumps({"ok": True, "translated": out, "from": args.src, "to": args.dst}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
