#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS+ · Instala VOACAP para el circuito de onda corta (HF y propagación).
#
#   sudo sh tools/instalar-voacap.sh                  compila e instala
#   sudo sh tools/instalar-voacap.sh --usuario pepe   usuario del servicio sat-aprs
#
# VOACAP es el programa de predicción de onda corta del NTIA / ITS (EE. UU., sin
# derechos de autor allí); voacapl es su versión para Linux, de J. A. Watson
# (CC0). Este guion descarga voacapl de GitHub, a una versión fija, lo compila
# con gfortran, lo instala en /usr/local y deja sus datos en /opt/sat-aprs/itshfbc
# (1,6 MB), a nombre del usuario de los servicios. Necesita Internet solo aquí.
# Sin él, la consola puede pedir el circuito a Wefax si está en la red.
set -eu

VERSION=c12a98b348c39f36f2659b8b3aa97b86284c8a1d    # voacapl, 29-03-2026
USUARIO="${SUDO_USER:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --usuario) shift; USUARIO="${1:?falta el nombre del usuario}" ;;
    -h|--help|--ayuda) sed -n '5,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $1 (pruebe --ayuda)" >&2; exit 2 ;;
  esac
  shift
done
[ "$(id -u)" = 0 ] || { echo "Ejecútelo con sudo: sudo sh tools/instalar-voacap.sh" >&2; exit 1; }
[ -n "$USUARIO" ] && [ "$USUARIO" != root ] || { echo "Indique el usuario del servicio sat-aprs: --usuario <nombre> (no root)" >&2; exit 1; }
id "$USUARIO" >/dev/null 2>&1 || { echo "No existe el usuario $USUARIO" >&2; exit 1; }
paso() { printf '\n== %s\n' "$*"; }

paso "Compilador"
apt-get install -y gfortran git autoconf automake make

paso "Código de voacapl ($VERSION)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone https://github.com/jawatson/voacapl.git "$TMP/voacapl"
cd "$TMP/voacapl"
git checkout --quiet "$VERSION"

paso "Compilar e instalar"
automake --add-missing >/dev/null 2>&1 || true
autoreconf >/dev/null 2>&1 || true
./configure >/dev/null
make >/dev/null
make install >/dev/null

paso "Datos en /opt/sat-aprs/itshfbc"
mkdir -p /opt/sat-aprs
rm -rf /opt/sat-aprs/itshfbc
# makeitshfbc los deja en $HOME/itshfbc
HOME=/opt/sat-aprs makeitshfbc >/dev/null
chown -R "$USUARIO" /opt/sat-aprs/itshfbc

paso "Prueba"
cd /opt/sat-aprs/itshfbc/run
if su -s /bin/sh "$USUARIO" -c "voacapl -s /opt/sat-aprs/itshfbc voacapx.dat prueba.out" >/dev/null 2>&1 && grep -q "REL" prueba.out; then
  rm -f prueba.out
  echo "VOACAP funciona."
else
  echo "VOACAP se instaló pero la prueba no dio resultado: revise /opt/sat-aprs/itshfbc/run" >&2
  exit 1
fi
systemctl restart "${SAT_SERVICIO:-sat-aprs.service}" 2>/dev/null || true
echo "Listo: HF y propagación > Circuito de onda corta. Para afinar, escriba el número de manchas"
echo "solares suavizado del mes en Marítimo > NAVTEX."
