#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS · Instala el descodificador NAVTEX (fventuri/navtex, GPL-3.0,
# basado en el de fldigi) y el servicio sat-navtex. Uso: sudo sh tools/navtex/instalar.sh
set -eu
[ "$(id -u)" = 0 ] || { echo "Ejecútelo con sudo" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
apt-get install -y git cmake g++ rtl-sdr
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/fventuri/navtex.git "$TMP/navtex"
cmake -S "$TMP/navtex" -B "$TMP/navtex/build"
make -C "$TMP/navtex/build" -j"$(nproc)"
install -m 0755 "$TMP/navtex/build/src/navtex_rx_from_file" /usr/local/bin/
rm -rf "$TMP"
install -m 0755 "$DIR/navtex.sh" /usr/local/bin/sat-navtex
[ -f /etc/default/sat-navtex ] || install -m 0644 "$DIR/sat-navtex.default" /etc/default/sat-navtex
install -m 0644 "$DIR/sat-navtex.service" /etc/systemd/system/sat-navtex.service
mkdir -p /var/lib/sat-aprs
systemctl daemon-reload
echo "Listo. Ajuste /etc/default/sat-navtex y arránquelo: sudo systemctl enable --now sat-navtex"
