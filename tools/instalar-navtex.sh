#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS+ · Instala en este equipo el receptor Navtex (github.com/EA7JRS/Navtex,
# GPL-3.0-or-later) y lo enlaza con la consola. Se puede repetir: también actualiza.
#
#   sudo sh tools/instalar-navtex.sh                   instala o actualiza, y enlaza
#   sudo sh tools/instalar-navtex.sh --usuario pepe    usuario que ejecuta los receptores
#   sudo sh tools/instalar-navtex.sh --puerto 8090     puerto de la interfaz de Navtex
#   sudo sh tools/instalar-navtex.sh --red             la interfaz de Navtex, visible en la red
#
# Qué hace:
#   1. retira la cadena NAVTEX antigua de la consola (servicio sat-navtex,
#      rtl_fm + descodificador de fldigi), si estaba instalada;
#   2. instala lo necesario para compilar, y descarga o actualiza Navtex en
#      /usr/local/src/Navtex;
#   3. compila e instala (con RTL-SDR, y con SDRplay si su API está instalada);
#   4. elige un puerto libre para su interfaz (8081 en adelante: el 8080 suele
#      ser de aprsc) y la deja solo para este equipo, salvo con --red;
#   5. instala sus servicios (navtex-web y dos receptores);
#   6. enciende NAVTEX en la consola con la dirección del receptor.
# La API de SDRplay no se instala sola: es del fabricante (sdrplay.com/api).
# Los receptores se eligen después en la consola: Radio → NAVTEX → Receptores.
set -eu

USUARIO="${SUDO_USER:-}"
PUERTO=""
DIRECCION="127.0.0.1"
FUENTES="${NAVTEX_FUENTES:-/usr/local/src/Navtex}"
REPO="${NAVTEX_REPO:-https://github.com/EA7JRS/Navtex.git}"
while [ $# -gt 0 ]; do
  case "$1" in
    --usuario) shift; USUARIO="${1:?falta el nombre del usuario}" ;;
    --puerto) shift; PUERTO="${1:?falta el puerto}" ;;
    --red) DIRECCION="0.0.0.0" ;;
    -h|--help|--ayuda) sed -n '5,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $1 (pruebe --ayuda)" >&2; exit 2 ;;
  esac
  shift
done

DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(id -u)" = 0 ] || { echo "Ejecútelo con sudo: sudo sh tools/instalar-navtex.sh" >&2; exit 1; }
[ -n "$USUARIO" ] && [ "$USUARIO" != root ] || { echo "Indique el usuario que ejecutará los receptores: --usuario nombre" >&2; exit 1; }
id "$USUARIO" >/dev/null 2>&1 || { echo "No existe el usuario $USUARIO" >&2; exit 1; }
case "$PUERTO" in ''|*[!0-9]*) [ -z "$PUERTO" ] || { echo "El puerto tiene que ser un número" >&2; exit 2; } ;; esac
paso() { printf '\n== %s\n' "$*"; }
ocupado() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -q ":$1\$"; }

paso "1. Cadena NAVTEX antigua"
if [ -f /etc/systemd/system/sat-navtex.service ] || systemctl cat sat-navtex.service >/dev/null 2>&1; then
  systemctl disable --now sat-navtex.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/sat-navtex.service /usr/local/bin/sat-navtex /usr/local/bin/navtex_rx_from_file
  [ ! -f /etc/default/sat-navtex ] || mv /etc/default/sat-navtex /etc/default/sat-navtex.retirado
  systemctl daemon-reload
  echo "Retirado el servicio sat-navtex y su descodificador. Sus ajustes quedan en /etc/default/sat-navtex.retirado."
else
  echo "No estaba instalada."
fi

paso "2. Navtex: dependencias y fuentes"
apt-get install -y git build-essential autoconf automake pkg-config libcjson-dev libsqlite3-dev libmicrohttpd-dev sqlite3 librtlsdr-dev curl iproute2
if [ -d "$FUENTES/.git" ]; then
  git -C "$FUENTES" pull --ff-only
else
  mkdir -p "$(dirname "$FUENTES")"
  git clone "$REPO" "$FUENTES"
fi
echo "Navtex $(sed -n 's/^AC_INIT(\[navtex\], *\[\([^]]*\)\].*/\1/p' "$FUENTES/configure.ac")"
[ -f /usr/local/include/sdrplay_api.h ] || [ -f /usr/include/sdrplay_api.h ] \
  || echo "Aviso: la API de SDRplay no está instalada; Navtex se compila solo con RTL-SDR. Para un SDRplay, instálela (sdrplay.com/api) y repita este instalador."

paso "3. Compilar e instalar"
( cd "$FUENTES" && { autoreconf -i && automake --add-missing; autoreconf; } && ./configure && make -j"$(nproc)" && SUDO_USER="$USUARIO" make install )

paso "4. Puerto de la interfaz de Navtex"
if [ -f /etc/default/navtex ] && [ -z "$PUERTO" ]; then
  PUERTO="$(sed -n 's/^WEB_PORT=\([0-9][0-9]*\).*/\1/p' /etc/default/navtex | head -1)"
  echo "Se conserva /etc/default/navtex (puerto ${PUERTO:-8080})."
  PUERTO="${PUERTO:-8080}"
else
  if [ -z "$PUERTO" ]; then
    systemctl stop navtex-web.service >/dev/null 2>&1 || true
    for p in 8081 8082 8083 8084 8085 8086 8087 8088 8089; do
      if ! ocupado "$p"; then PUERTO="$p"; break; fi
    done
    [ -n "$PUERTO" ] || { echo "No hay puerto libre entre 8081 y 8089: indique uno con --puerto" >&2; exit 1; }
  fi
  if [ -f /etc/default/navtex ]; then
    sed -i "s/^WEB_PORT=.*/WEB_PORT=$PUERTO/; s/^WEB_ADDRESS=.*/WEB_ADDRESS=$DIRECCION/" /etc/default/navtex
  else
    sed "s/^WEB_PORT=.*/WEB_PORT=$PUERTO/; s/^WEB_ADDRESS=.*/WEB_ADDRESS=$DIRECCION/" "$FUENTES/systemd/navtex.default" > /etc/default/navtex
    chmod 0644 /etc/default/navtex
  fi
  echo "Interfaz de Navtex en $DIRECCION:$PUERTO."
fi

paso "5. Servicios de Navtex"
# Los receptores USB son del grupo plugdev
if getent group plugdev >/dev/null 2>&1; then usermod -aG plugdev "$USUARIO"; fi
sh "$FUENTES/tools/instalar-servicios.sh" --usuario "$USUARIO"

paso "6. Enlace con la consola"
URL="http://127.0.0.1:$PUERTO"
i=0
while [ "$i" -lt 10 ] && ! curl -fsS -m 3 -o /dev/null "$URL/api/status"; do i=$((i + 1)); sleep 1; done
if curl -fsS -m 3 -o /dev/null "$URL/api/status"; then echo "Navtex contesta en $URL."; else echo "Aviso: Navtex no contesta todavía en $URL (journalctl -u navtex-web)."; fi

PUERTO_CONSOLA="$(sed -n 's/^PORT=\([0-9][0-9]*\).*/\1/p' "$DIR/.env" 2>/dev/null | head -1)"
PUERTO_CONSOLA="${PUERTO_CONSOLA:-3000}"
TOKEN="$(sed -n 's/^SAT_ADMIN_TOKEN=//p' "$DIR/.env" 2>/dev/null | head -1 | tr -d '"'"'"'\r')"
ENLAZADO=0
if [ -n "$TOKEN" ]; then
  # El token va por la entrada estándar: no aparece en la lista de procesos ni en pantalla
  if printf 'header = "x-admin-token: %s"\n' "$TOKEN" | curl -fsS -m 10 -o /dev/null --config - \
      -H 'Content-Type: application/json' -X POST \
      -d "{\"navtexEnabled\":true,\"navtexUrl\":\"$URL\"}" "http://127.0.0.1:$PUERTO_CONSOLA/api/config"; then
    ENLAZADO=1
    echo "NAVTEX encendido en la consola, con el receptor en $URL."
  fi
fi
TOKEN=""
if [ "$ENLAZADO" = 0 ]; then
  echo "No se pudo avisar a la consola (¿está parada, o sin token en .env?). Hágalo a mano:"
  echo "  Radio → NAVTEX e Inmarsat → Entradas: marque NAVTEX y escriba la dirección $URL"
fi

paso "Siguientes pasos"
echo "· Elija equipo y banda de cada receptor en la consola: Radio → NAVTEX e Inmarsat → Receptores."
echo "· Un equipo SDR solo lo usa un programa a la vez: si Direwolf, rtl_ais u otro tiene"
echo "  el mismo RTL-SDR, indique en Receptores el número de serie del que es para NAVTEX."
if [ "$DIRECCION" = 127.0.0.1 ]; then
  echo "· La interfaz propia de Navtex queda solo para este equipo. Para verla desde la red: --red"
  echo "  (no tiene contraseña: solo en una red de confianza)."
else
  echo "· La interfaz propia de Navtex: http://<este equipo>:$PUERTO (no tiene contraseña: solo en una red de confianza)."
fi
echo "· Actualizar Navtex más adelante: repita este instalador."
