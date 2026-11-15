#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
# Contrasta los codificadores NMEA 2000 (server/conectividad/nmea2000.ts) con una release FIJADA de la base de datos de
# CANboat (https://canboat.github.io/canboat/, Apache-2.0). Uso: tools/canboat/run.sh [canboat.json]
set -e
cd "$(dirname "$0")/../.."
CANBOAT_VERSION=v9.2.0
DEFS="${1:-.build/canboat-$CANBOAT_VERSION.json}"
mkdir -p .build
[ -s "$DEFS" ] || curl -fsSL "https://raw.githubusercontent.com/canboat/canboat/$CANBOAT_VERSION/docs/canboat.json" -o "$DEFS"
npx tsx tools/canboat/dump.ts | python3 tools/canboat/canboat_check.py comprobar "$DEFS"
