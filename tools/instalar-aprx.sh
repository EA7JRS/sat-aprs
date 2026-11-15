#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS · Instala aprx desde el fork EA7JRS/aprx (compila en Debian 13).
#
# Compila el paquete .deb del fork, lo instala en lugar del aprx de Debian
# (respetando /etc/aprx.conf si ya existe), lo retiene para que apt no lo
# cambie por el de la distribución y lo deja arrancado.
#
#   sudo sh tools/instalar-aprx.sh
#
# Variables opcionales: APRX_REPO, APRX_RAMA (master), APRX_DIR (/usr/local/src/aprx).
set -eu

REPO=${APRX_REPO:-https://github.com/EA7JRS/aprx.git}
RAMA=${APRX_RAMA:-master}
DIR=${APRX_DIR:-/usr/local/src/aprx}

if [ "$(id -u)" -ne 0 ]; then
  echo "Hay que ejecutarlo como administrador: sudo sh $0" >&2
  exit 1
fi

echo "== Herramientas de compilación"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  git build-essential dpkg-dev debhelper fakeroot perl

echo "== Fuentes: $REPO ($RAMA) en $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$RAMA"
  git -C "$DIR" checkout --quiet -B "$RAMA" "origin/$RAMA"
  git -C "$DIR" clean -fdxq
else
  mkdir -p "$(dirname "$DIR")"
  git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
VERSION=$(tr -d 'v\n' < "$DIR/VERSION")
ARQ=$(dpkg --print-architecture)
DEB="$(dirname "$DIR")/aprx_${VERSION}_${ARQ}.deb"

echo "== Compilando aprx $VERSION"
(cd "$DIR" && ./configure --quiet && make make-deb > "$(dirname "$DIR")/aprx-compilacion.log" 2>&1) || {
  echo "La compilación falló: mira $(dirname "$DIR")/aprx-compilacion.log" >&2
  exit 1
}

echo "== Instalando $DEB"
apt-mark unhold aprx > /dev/null 2>&1 || true
DEBIAN_FRONTEND=noninteractive dpkg -i --force-confdef --force-confold "$DEB"
apt-mark hold aprx > /dev/null
echo "   retenido: apt no lo sustituirá por el aprx de Debian (apt-mark unhold aprx para deshacerlo)"

# Que arranque al instalar, como el paquete de Debian
if [ -f /etc/default/aprx ]; then
  if grep -q '^STARTAPRX=' /etc/default/aprx; then
    sed -i 's/^STARTAPRX=.*/STARTAPRX="yes"/' /etc/default/aprx
  else
    printf '\nSTARTAPRX="yes"\n' >> /etc/default/aprx
  fi
fi
mkdir -p /var/log/aprx

if command -v systemctl > /dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable aprx > /dev/null 2>&1 || true
  if systemctl restart aprx; then
    echo "== aprx en marcha: $(systemctl is-active aprx)"
  else
    echo "== aprx no arrancó: revisa /etc/aprx.conf (journalctl -u aprx)" >&2
  fi
fi

# La pantalla Radio · aprx de la consola necesita el registro de radio
if ! grep -Eq '^[[:space:]]*rflog[[:space:]]' /etc/aprx.conf 2>/dev/null; then
  echo
  echo "Aviso: /etc/aprx.conf no tiene registro de radio. Para que la consola vea"
  echo "el tráfico, añade dentro de <logging>:"
  echo "    rflog /var/log/aprx/aprx-rf.log"
  echo "y reinicia aprx (sudo systemctl restart aprx)."
fi
echo "Hecho: $(dpkg-query -W -f='aprx ${Version}' aprx)"
