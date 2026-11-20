#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Manuel - EA7JRS
#
# S.A.T.-APRS · Recepción NAVTEX con un SDR.
#
#   SDR (USB, 1 kHz por debajo) → navtex_rx_from_file → archivo que lee la consola
#
# RTL-SDR con rtl_fm (paquete rtl-sdr). La RTL-SDR Blog V3 necesita muestreo
# directo para 518 kHz (DIRECTO=2, entrada Q); la V4 sintoniza HF por sí sola.
# SDRplay (RSPdx-R2 y otros) y demás equipos SoapySDR con rx_fm (rx_tools) y
# SoapySDRPlay3. El descodificador es navtex_rx_from_file de fventuri/navtex
# (el de fldigi), que se compila con tools/navtex/instalar.sh.
#
# Ajustes en /etc/default/sat-navtex (o en el entorno):
#   SDR=rtlsdr | soapy         equipo
#   FRECUENCIA=518000          Hz (490000 servicio nacional, 4209500 HF)
#   PPM=0                      corrección del oscilador
#   GANANCIA=                  dB (vacío: automática)
#   DIRECTO=                   RTL-SDR: 1 o 2 para muestreo directo (V3: 2)
#   SOAPY=driver=sdrplay       SoapySDR: equipo
#   ANTENA=                    SoapySDR: nombre de la antena (p. ej. «Antenna B»)
#   SALIDA=/var/lib/sat-aprs/navtex.txt
set -eu

SDR="${SDR:-rtlsdr}"
FRECUENCIA="${FRECUENCIA:-518000}"
PPM="${PPM:-0}"
GANANCIA="${GANANCIA:-}"
DIRECTO="${DIRECTO:-}"
SOAPY="${SOAPY:-driver=sdrplay}"
ANTENA="${ANTENA:-}"
SALIDA="${SALIDA:-/var/lib/sat-aprs/navtex.txt}"
TASA=12000
# El descodificador espera las dos frecuencias de la FSK a 1000 ± 85 Hz
SINTONIA=$((FRECUENCIA - 1000))

command -v navtex_rx_from_file >/dev/null || { echo "Falta navtex_rx_from_file: ejecute tools/navtex/instalar.sh" >&2; exit 1; }
mkdir -p "$(dirname "$SALIDA")"

case "$SDR" in
  rtlsdr)
    command -v rtl_fm >/dev/null || { echo "Falta rtl_fm: sudo apt install rtl-sdr" >&2; exit 1; }
    set -- rtl_fm -f "$SINTONIA" -M usb -s "$TASA" -p "$PPM"
    case "$DIRECTO" in 1) set -- "$@" -E direct ;; 2) set -- "$@" -E direct2 ;; esac
    ;;
  soapy)
    command -v rx_fm >/dev/null || { echo "Falta rx_fm (rx_tools) y el módulo SoapySDR del equipo" >&2; exit 1; }
    set -- rx_fm -d "$SOAPY" -f "$SINTONIA" -M usb -s "$TASA" -p "$PPM"
    if [ -n "$ANTENA" ]; then set -- "$@" -a "$ANTENA"; fi
    ;;
  *) echo "SDR desconocido: $SDR (rtlsdr o soapy)" >&2; exit 1 ;;
esac
if [ -n "$GANANCIA" ]; then set -- "$@" -g "$GANANCIA"; fi

echo "NAVTEX: $* → $SALIDA" >&2
"$@" - | navtex_rx_from_file "$TASA" >> "$SALIDA"
