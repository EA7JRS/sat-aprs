#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Manuel - EA7JRS
"""
S.A.T.-APRS · Primitivas del protocolo APRS / AX.25 / KISS.

Funciones puras (sin red ni estado) para construir tramas correctas:
  - Validación de indicativos y cálculo del passcode de APRS-IS.
  - Formato de posición, informe meteorológico, objetos y boletines.
  - Codificación AX.25 UI y encapsulado KISS para el TNC (Direwolf).

Al no tocar la red se pueden probar de forma aislada (ver tests/).
"""

import re
import unicodedata

# Destino (TOCALL). «APZxxx» es el rango reservado a software experimental.
# Si el proyecto registra un TOCALL propio en aprs-deviceid, cambiarlo aquí.
TOCALL = "APZSAT"

# Ruta que se anuncia a APRS-IS: el servidor añade su propia construcción «q».
IS_PATH = "TCPIP*"
# Ruta por defecto para RF.
DEFAULT_RF_PATH = "WIDE1-1,WIDE2-1"

MAX_BULLETIN_TEXT = 67   # Longitud máxima del texto de un mensaje/boletín APRS
MAX_OBJECT_COMMENT = 43  # Longitud máxima del comentario de un objeto
MAX_AX25_INFO = 256      # Campo de información máximo de una trama UI

# Indicativos de ejemplo/plantilla con los que NUNCA se debe transmitir.
PLACEHOLDER_CALLSIGNS = frozenset({
    "N0CALL", "NOCALL", "MYCALL", "CALL", "CALLSI", "CALLSING", "CALLSIGN",
    "EA1URG",  # indicativo de ejemplo usado en la documentación del proyecto
})

_CALL_RE = re.compile(r"^([A-Z0-9]{1,6})(?:-([0-9]|1[0-5]))?$")
# Elementos de ruta propios de APRS-IS (TCPIP*, TCPXX*, construcciones qAx)
_INTERNET_PATH_RE = re.compile(r"^(TCPIP\*?|TCPXX\*?|q[A-Za-z]{2})$")

KISS_FEND = 0xC0
KISS_FESC = 0xDB
KISS_TFEND = 0xDC
KISS_TFESC = 0xDD


# ------------------------------------------------------------------------------
# Indicativos y passcode
# ------------------------------------------------------------------------------
def split_callsign(callsign):
    """Devuelve (base, ssid) o None si no es una dirección AX.25 válida."""
    if not callsign:
        return None
    m = _CALL_RE.match(str(callsign).strip().upper())
    if not m:
        return None
    return m.group(1), int(m.group(2) or 0)


def is_valid_callsign(callsign):
    """
    True si el indicativo es apto para transmitir: formato AX.25 (base de 3 a 6
    caracteres con al menos una letra y una cifra, SSID 0-15) y no es uno de
    los indicativos de plantilla.
    """
    parts = split_callsign(callsign)
    if not parts:
        return False
    base = parts[0]
    if len(base) < 3 or base in PLACEHOLDER_CALLSIGNS:
        return False
    return any(c.isdigit() for c in base) and any(c.isalpha() for c in base)


def aprs_passcode(callsign):
    """Passcode de APRS-IS que corresponde al indicativo (se ignora el SSID)."""
    base = str(callsign).strip().upper().split("-")[0]
    code = 0x73E2
    for i, ch in enumerate(base):
        code ^= ord(ch) << (8 if i % 2 == 0 else 0)
    return code & 0x7FFF


def passcode_matches(callsign, passcode):
    """True si el passcode configurado es el del indicativo."""
    try:
        return int(str(passcode).strip()) == aprs_passcode(callsign)
    except (TypeError, ValueError):
        return False


# ------------------------------------------------------------------------------
# Texto
# ------------------------------------------------------------------------------
def to_ascii(text):
    """
    Reduce un texto a ASCII imprimible (sin tildes, emojis ni caracteres de
    control) para que cualquier TNC o pantalla de transceptor lo muestre bien.
    """
    if text is None:
        return ""
    text = str(text).replace("ñ", "n").replace("Ñ", "N").replace("º", "o").replace("°", "o")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(c if 32 <= ord(c) < 127 else " " for c in text)
    return re.sub(r" {2,}", " ", text).strip()


def _message_text(text):
    """Texto apto para mensaje/boletín: ASCII y sin los caracteres reservados."""
    clean = to_ascii(text)
    for ch in "|~{":
        clean = clean.replace(ch, " ")
    return re.sub(r" {2,}", " ", clean).strip()[:MAX_BULLETIN_TEXT].rstrip()


# ------------------------------------------------------------------------------
# Posición y hora
# ------------------------------------------------------------------------------
def _deg_min(value, deg_digits, max_deg):
    """Grados y minutos con centésimas, redondeando sin producir «60.00»."""
    value = min(abs(float(value)), float(max_deg))
    hundredths = int(round(value * 6000))          # centésimas de minuto
    deg, rem = divmod(hundredths, 6000)
    return f"{deg:0{deg_digits}d}{rem // 100:02d}.{rem % 100:02d}"


def format_lat(lat):
    """Latitud decimal -> «DDMM.hhN»."""
    return _deg_min(lat, 2, 90) + ("N" if float(lat) >= 0 else "S")


def format_lon(lon):
    """Longitud decimal -> «DDDMM.hhW»."""
    return _deg_min(lon, 3, 180) + ("E" if float(lon) >= 0 else "W")


def format_timestamp(dt):
    """Sello horario APRS «DDHHMMz» a partir de un datetime en UTC."""
    return dt.strftime("%d%H%Mz")


# ------------------------------------------------------------------------------
# Campos de información
# ------------------------------------------------------------------------------
def _wx_field(prefix, value, width, scale=1.0, lo=None, hi=None):
    """Campo meteorológico de ancho fijo; puntos si no hay dato."""
    if value is None:
        return prefix + "." * width
    n = int(round(float(value) * scale))
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return f"{prefix}{n:0{width}d}"


def format_wx_info(timestamp, lat, lon, temp_c=None, humidity=None, wind_kts=None,
                   wind_dir_deg=None, pressure_hpa=None, gust_kts=None,
                   rain_1h_mm=None, rain_24h_mm=None, comment=""):
    """
    Informe meteorológico completo con posición y hora:
        @DDHHMMzLAT/LON_DIR/VELgRAFtTTTrRRRpPPPhHHbBBBBB

    La especificación APRS usa millas por hora, grados Fahrenheit, centésimas
    de pulgada y décimas de hPa; aquí se convierte desde nudos, °C y mm.
    Los campos sin dato se omiten o se rellenan con puntos: nunca se inventan.
    """
    kts_to_mph = 1.150779
    wdir = "..." if wind_dir_deg is None else f"{int(round(float(wind_dir_deg))) % 360:03d}"
    if wdir == "000" and wind_dir_deg is not None and (wind_kts or 0) > 0:
        wdir = "360"  # 000 significa «sin dato» cuando hay viento
    speed = _wx_field("", wind_kts, 3, kts_to_mph, 0, 999)
    gust = _wx_field("g", gust_kts, 3, kts_to_mph, 0, 999)

    if temp_c is None:
        temp = "t..."
    else:
        temp_f = int(round(float(temp_c) * 9.0 / 5.0 + 32.0))
        temp_f = max(-99, min(999, temp_f))
        temp = f"t-{abs(temp_f):02d}" if temp_f < 0 else f"t{temp_f:03d}"

    info = f"@{timestamp}{format_lat(lat)}/{format_lon(lon)}_{wdir}/{speed}{gust}{temp}"
    if rain_1h_mm is not None:
        info += _wx_field("r", rain_1h_mm, 3, 100.0 / 25.4, 0, 999)
    if rain_24h_mm is not None:
        info += _wx_field("p", rain_24h_mm, 3, 100.0 / 25.4, 0, 999)
    if humidity is not None:
        hum = max(1, min(100, int(round(float(humidity)))))
        info += f"h{0 if hum == 100 else hum:02d}"
    if pressure_hpa:
        info += _wx_field("b", pressure_hpa, 5, 10.0, 0, 99999)
    comment = to_ascii(comment)
    return info + (comment[:36] if comment else "")


def format_object_info(name, timestamp, lat, lon, symbol_table, symbol_code, comment=""):
    """
    Objeto APRS vivo:  ;NOMBRE___*DDHHMMzLAT<tabla>LON<símbolo>comentario
    El nombre ocupa exactamente 9 caracteres.
    """
    obj_name = to_ascii(name)[:9].ljust(9)
    if len(symbol_table) != 1 or len(symbol_code) != 1:
        raise ValueError("La tabla y el código de símbolo son un carácter cada uno")
    text = to_ascii(comment)[:MAX_OBJECT_COMMENT]
    return f";{obj_name}*{timestamp}{format_lat(lat)}{symbol_table}{format_lon(lon)}{symbol_code}{text}"


def format_bulletin_info(bulletin_id, text):
    """
    Boletín APRS:  :BLNnNOMBRE:texto
    El destinatario se rellena a 9 caracteres y el texto se limita a 67.
    `bulletin_id` es, por ejemplo, «BLN1REMER» o «BLN3METEO».
    """
    addressee = to_ascii(bulletin_id).upper().replace(" ", "")
    if not re.match(r"^BLN[0-9A-Z][A-Z0-9]{0,5}$", addressee):
        raise ValueError(f"Identificador de boletín no válido: {bulletin_id!r}")
    return f":{addressee.ljust(9)}:{_message_text(text)}"


def build_packet(source, path, info, tocall=TOCALL):
    """Trama en formato TNC2: ORIGEN>DESTINO,RUTA:información."""
    header = f"{str(source).strip().upper()}>{tocall}"
    if path:
        header += f",{path}"
    return f"{header}:{info}"


# ------------------------------------------------------------------------------
# AX.25 / KISS
# ------------------------------------------------------------------------------
def _encode_address(callsign, last, repeated=False):
    parts = split_callsign(callsign)
    if not parts:
        raise ValueError(f"Dirección AX.25 no válida: {callsign!r}")
    base, ssid = parts
    out = bytearray((ord(c) << 1) for c in base.ljust(6))
    ssid_byte = 0x60 | (ssid << 1)
    if repeated:
        ssid_byte |= 0x80
    if last:
        ssid_byte |= 0x01
    out.append(ssid_byte)
    return bytes(out)


def encode_ax25_ui(source, destination, path, info):
    """
    Codifica una trama AX.25 UI (control 0x03, PID 0xF0) lista para KISS.
    `path` es una lista o cadena separada por comas de repetidores (máx. 8);
    un asterisco final marca el repetidor como ya usado.
    Lanza ValueError si alguna dirección no es AX.25 válida, de modo que
    nunca se emite por RF una ruta de Internet como «TCPIP*» o «qAC».
    """
    if isinstance(path, str):
        digis = [p.strip() for p in path.split(",") if p.strip()]
    else:
        digis = [str(p).strip() for p in (path or []) if str(p).strip()]
    if len(digis) > 8:
        raise ValueError("AX.25 admite un máximo de 8 repetidores")
    for digi in digis:
        if _INTERNET_PATH_RE.match(digi):
            raise ValueError(f"«{digi}» es una ruta de Internet y no puede emitirse por RF")

    payload = info.encode("ascii", errors="replace") if isinstance(info, str) else bytes(info)
    if not payload:
        raise ValueError("El campo de información está vacío")
    if len(payload) > MAX_AX25_INFO:
        raise ValueError("El campo de información supera los 256 bytes")

    frame = bytearray()
    frame += _encode_address(destination, last=False)
    frame += _encode_address(source, last=not digis)
    for i, digi in enumerate(digis):
        repeated = digi.endswith("*")
        frame += _encode_address(digi.rstrip("*"), last=(i == len(digis) - 1), repeated=repeated)
    frame += bytes([0x03, 0xF0])
    frame += payload
    return bytes(frame)


def kiss_encode(frame, port=0):
    """Encapsula una trama AX.25 en KISS (comando de datos) con su escapado."""
    out = bytearray([KISS_FEND, (port & 0x0F) << 4])
    for b in frame:
        if b == KISS_FEND:
            out += bytes([KISS_FESC, KISS_TFEND])
        elif b == KISS_FESC:
            out += bytes([KISS_FESC, KISS_TFESC])
        else:
            out.append(b)
    out.append(KISS_FEND)
    return bytes(out)
