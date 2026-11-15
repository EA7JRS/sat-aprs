#!/usr/bin/env python3
# Copyright (C) 2026 Manuel - EA7JRS — SPDX-License-Identifier: GPL-3.0-or-later
"""Contrasta tramas con la base de datos de CANboat (https://github.com/canboat/canboat, Apache-2.0).

Dos usos, los dos contra una release fijada de las definiciones (canboat.json / canboat-j1939.json):

  comprobar <definiciones.json>            lee por la entrada líneas JSON {"pgn", "hex", "expect": {campo: valor}} que ha
                                           escrito NUESTRO codificador, las decodifica con las definiciones de CANboat y
                                           comprueba cada campo (y la longitud del PGN).
  generar <definiciones.json> <pgn> c=v... arma una trama con las definiciones de CANboat (campos sin dar: todo a unos) y
                                           la escribe en hexadecimal, para dársela a NUESTRO decodificador.

Así el formato de cada PGN lo fija CANboat y no una copia hecha a mano. Solo biblioteca estándar.
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        db = json.load(f)
    by = {}
    for p in db["PGNs"]:
        by.setdefault(p["PGN"], p)          # la primera definición (las demás son variantes de fabricante)
    return db.get("Version", "?"), by


def get_bits(data, off, length):
    v = 0
    for i in range(length):
        bit = off + i
        if bit // 8 < len(data) and (data[bit // 8] >> (bit % 8)) & 1:
            v |= 1 << i
    return v


def set_bits(data, off, length, v):
    for i in range(length):
        bit = off + i
        if (v >> i) & 1:
            data[bit // 8] |= 1 << (bit % 8)
        else:
            data[bit // 8] &= ~(1 << (bit % 8)) & 0xFF


def field(p, name):
    for f in p["Fields"]:
        if f["Name"] == name:
            return f
    raise KeyError("PGN %d: CANboat no tiene el campo '%s'" % (p["PGN"], name))


def decode(f, data):
    raw = get_bits(data, f["BitOffset"], f["BitLength"])
    n = f["BitLength"]
    if raw == (1 << n) - 1 and not f.get("Signed"):
        return None                          # todo a unos: sin dato
    if f.get("Signed"):
        if raw == (1 << (n - 1)) - 1:
            return None
        if raw >> (n - 1):
            raw -= 1 << n
    return raw * (f.get("Resolution") or 1) + (f.get("Offset") or 0)


def comprobar(defs):
    version, by = load(defs)
    n = bad = 0
    for line in sys.stdin:
        line = line.strip()
        if not line.startswith("{"):
            continue
        t = json.loads(line)
        p = by.get(t["pgn"])
        if p is None:
            print("FALLO: CANboat %s no tiene el PGN %d" % (version, t["pgn"])); bad += 1; continue
        data = bytes.fromhex(t["hex"])
        n += 1
        if p.get("Length") and len(data) != p["Length"]:
            print("FALLO %d: %d bytes, CANboat dice %d" % (t["pgn"], len(data), p["Length"])); bad += 1
        for name, want in t["expect"].items():
            n += 1
            try:
                f = field(p, name)
            except KeyError as e:
                print("FALLO:", e.args[0]); bad += 1; continue
            got = decode(f, data)
            res = abs(f.get("Resolution") or 1)
            ok = (got is None and want is None) or (got is not None and want is not None and abs(got - want) <= res * 0.51 + 1e-9)
            if not ok:
                print("FALLO %d '%s': CANboat lee %r, se esperaba %r" % (t["pgn"], name, got, want)); bad += 1
    print("CANboat %s: %d comprobaciones, %d fallos" % (version, n, bad))
    return 1 if bad or not n else 0


def generar(defs, pgn, pairs):
    _, by = load(defs)
    p = by[int(pgn)]
    data = bytearray([0xFF] * (p.get("Length") or 8))
    for pair in pairs:
        name, value = pair.split("=", 1)
        f = field(p, name)
        raw = round((float(value) - (f.get("Offset") or 0)) / (f.get("Resolution") or 1))
        set_bits(data, f["BitOffset"], f["BitLength"], raw & ((1 << f["BitLength"]) - 1))
    print(data.hex())
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "comprobar":
        sys.exit(comprobar(sys.argv[2]))
    if len(sys.argv) >= 4 and sys.argv[1] == "generar":
        sys.exit(generar(sys.argv[2], sys.argv[3], sys.argv[4:]))
    print(__doc__)
    sys.exit(2)
