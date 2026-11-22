#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Manuel - EA7JRS
#
# wx3cfg - checks and fixes configuration files (*.cfg) of the
# Microsat WX3in1 Plus 2.0 (firmware / Configurator v1.13).
#
# The checks follow the range checks of the official Configurator v1.13
# plus good APRS practice. Fixed files keep the original byte encoding,
# line endings and key order, so they can be loaded again with
# "Read from file" in the official Configurator.
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version. This program is distributed in the hope that it will be
# useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
# Public License for more details: <https://www.gnu.org/licenses/>.
"""Check and fix Microsat WX3in1 Plus 2.0 configuration files (v1.13)."""

import argparse
import json
import os
import re
import secrets
import string
import sys

__version__ = '1.1.0'
CFG_VERSION = 'v1.13'

ERROR, WARN, INFO = 'error', 'warning', 'info'

# ---------------------------------------------------------------------------
# Combo box item lists of Configurator v1.13 (index stored in the .cfg file)
# ---------------------------------------------------------------------------
NO_YES = ['No', 'Yes']
ITEMS = {
    'Squelch': ['1 (lowest)', '2', '3', '4', '5', '6', '7', '8', '9', '10 (highest)'],
    'PTT': ['separate output', '2k2 resistor'],
    'Busydetect': ['analog signal level', 'digital detect'],
    'Quiettime_randomize': ['No', '+/- 16 ms', '+/- 32 ms', '+/- 64 ms', '+/- 128 ms'],
    'Baudrate': ['1200 / AFSK', '9600 / GMSK (experimental)'],
    'Consecutive_packets': ['in bursts', 'separately'],
    'Input_amplifier': ['+0 db', '+1.5 db', '+3 db', '+4.5 db', '+6 db', '+7.5 db', '+9 db',
                        '+10.5 db', '+12 db'],
    'Digion': NO_YES,
    'Callfilter_rule': ['Allow all, except below', 'Deny all, except below'],
    'ReportMode': ['Disabled', 'Enabled'],
    'ReportEncoding': ['Mic-E', 'Plain text', 'Base-91'],
    'MiceMessage': ['Off Duty', 'En Route', 'In Service', 'Returning', 'Committed', 'Special',
                    'Priority', 'Emergency'],
    'PositionTime': ['None', 'Hour, min, sec', 'Day, hour, min'],
    'CourseSpeed': NO_YES, 'PositionAltitude': NO_YES,
    'Netconfig': ['Static IP', 'DHCP'],
    'Aprsis_fromrf': NO_YES, 'Aprsis_msg2rf': NO_YES, 'Aprsis_packet2rf': NO_YES,
    'Aprsis_packet2rf_ifheard': NO_YES,
    'Kisstcpip_enable': NO_YES, 'Aprsisserver_enable': NO_YES, 'Aprsisserver_tois': NO_YES,
    'Aprsisserver_fromis': NO_YES, 'Statsupload_enable': NO_YES,
    'Tele_enable': ['Disabled', 'Enabled'],
    'Serial1_mode': ['None', 'Weather station', 'GPS', 'RSS-131 gamma monitor', 'KISS'],
    'Serial2_mode': ['None', 'Weather station', 'GPS', 'RSS-131 gamma monitor', 'KISS'],
    'Bluetooth_connected': NO_YES,
    'Telemodule_enable': ['Disabled', 'Enabled'], 'Bitsmodule_enable': ['Disabled', 'Enabled'],
    'Thermo_enable': ['Disabled', 'Enabled'], 'Thermo_type': ['DS18B20', 'DS18S20'],
    'Weather_stationtype': ['None', 'Peet Bros Ultimeter 100', 'Peet Bros Ultimeter 800',
                            'Peet Bros Ultimeter 2000', 'Peet Bros Ultimeter 2100', 'WS-2300',
                            'WS-2350', 'Davis Vantage Pro', 'Davis Vantage Pro2',
                            'Davis Vantage Pro Plus', 'Davis Vantage Pro2 Plus'],
    'GPS_baudrate': ['1200', '2400', '4800', '9600', '19200'],
    'KISS_baudrate': ['9600', '19200', '38400', '57600', '115200'],
    'KISS_direction': ['RF->serial', 'both'], 'KISS_check': NO_YES,
    'Gamma_baudrate': ['2400', '4800', '9600', '19200'],
    'Gamma_units': ['1.000 = 1u', '1.000 = 10u', '1.000 = 100u', '1.000 = 1m', '1.000 = 10m',
                    '1.000 = 100m'],
    'Voltage_calibration': ['- 5.0%', '- 4.5%', '- 4.0%', '- 3.5%', '- 3.0%', '- 2.5%', '- 2.0%',
                            '- 1.5%', '- 1.0%', '- 0.5%', '+/- 0%', '+ 0.5%', '+ 1.0%', '+ 1.5%',
                            '+ 2.0%', '+ 2.5%', '+ 3.0%', '+ 3.5%', '+ 4.0%', '+ 4.5%', '+ 5.0%'],
}
for _i in range(1, 9):
    ITEMS['Pathn%d_traceable' % _i] = NO_YES
    ITEMS['Pathn%d_active' % _i] = ['Never', 'Always', 'No APRS-IS']
    ITEMS['Beacon%d_enable' % _i] = ['Never', 'Always', 'GPS fixed', 'GPS not fixed', 'No APRS-IS']
for _i in range(1, 25):
    ITEMS['Packet2rf_filter_type%02d' % _i] = ['Not used', 'Allow all', 'Deny all', 'Beacons',
                                               'Destination', 'Telemetry', 'Bulletin']
# combo boxes whose index list is long (output level) or keyed by section
SECTION_ITEMS = {('WeatherUnderground', 'Enable'): ['Disabled', 'Enabled'],
                 ('WeatherUnderground', 'Sendmethod'): ['Normal', 'Rapid fire']}

# ---------------------------------------------------------------------------
# Messages (Spanish / English)
# ---------------------------------------------------------------------------
MSG = {
    'missing_key': ('Falta la clave (el archivo no es de la v1.13 o está incompleto)',
                    'Key is missing (file is not v1.13 or it is incomplete)'),
    'version': ('El archivo es de la versión {v}; este validador es para la v1.13. Vuelva a guardarlo con el Configurador v1.13',
                'File version is {v}; this checker is for v1.13. Save it again with Configurator v1.13'),
    'not_int': ('Debe ser un número entero', 'Must be an integer number'),
    'range': ('Fuera de rango ({lo} - {hi})', 'Out of range ({lo} - {hi})'),
    'range0': ('Fuera de rango ({lo} - {hi}, o 0 para desactivar)', 'Out of range ({lo} - {hi}, or 0 to disable)'),
    'range_tele0': ('El Configurador v1.13 comprueba el rango {lo} - {hi}; el valor 0 puede no aceptarse',
                    'Configurator v1.13 checks the range {lo} - {hi}; value 0 may be rejected'),
    'item': ('Índice fuera de la lista del Configurador (0 - {hi})', 'Index outside the Configurator list (0 - {hi})'),
    'ssid': ('SSID fuera de rango (0 - 15)', 'SSID out of range (0 - 15)'),
    'ssid_wild': ("SSID fuera de rango (0 - 15, o comodín '*')", "SSID out of range (0 - 15, or wildcard '*')"),
    'call_default': ('El indicativo sigue siendo NOCALL: ponga su indicativo', 'Callsign is still NOCALL: set your callsign'),
    'call_short': ('Indicativo demasiado corto (p. ej. NOCALL-4)', 'Callsign too short (e.g. NOCALL-4)'),
    'call_long': ('Indicativo de más de 6 caracteres', 'Callsign longer than 6 characters'),
    'call_chars': ('El indicativo solo puede tener letras y números', 'Callsign may only contain letters and digits'),
    'lat': ('Latitud mal escrita (p. ej. 3723.10N, formato GGMM.mm)', 'Bad latitude syntax (e.g. 3723.10N, format DDMM.mm)'),
    'lon': ('Longitud mal escrita (p. ej. 00559.40W, formato GGGMM.mm)', 'Bad longitude syntax (e.g. 00559.40W, format DDDMM.mm)'),
    'pos_default': ('Posición por defecto de Microsat (Poznań, Polonia): ponga la de su estación',
                    'Microsat default position (Poznań, Poland): set your station position'),
    'pos_zero': ('Posición 0/0: ponga la de su estación', 'Position 0/0: set your station position'),
    'dest_short': ('Destino demasiado corto (p. ej. APMI06)', 'Destination too short (e.g. APMI06)'),
    'msg_long': ('Mensaje de {n} caracteres (máximo 95)', 'Message is {n} characters long (maximum 95)'),
    'msg_chars': ('Caracteres no permitidos (solo ASCII imprimible)', 'Forbidden characters (printable ASCII only)'),
    'msg_pipe': ("Los caracteres '|' y '~' no deben usarse en el texto APRS", "Characters '|' and '~' must not be used in APRS text"),
    'msg_temp': ('La baliza usa <temp>/<tempf> pero el termómetro está desactivado', 'Beacon uses <temp>/<tempf> but the thermometer is disabled'),
    'msg_gps': ('La baliza usa cadenas <gps...> pero ningún puerto RS-232 está en modo GPS', 'Beacon uses <gps...> strings but no RS-232 port is set to GPS'),
    'msg_gamma': ('La baliza usa <gamma> pero ningún puerto RS-232 está en modo RSS-131', 'Beacon uses <gamma> but no RS-232 port is set to RSS-131'),
    'msg_unknown_tag': ('Cadena especial desconocida: {t}', 'Unknown special string: {t}'),
    'beacon_gps_cond': ('Condición “{c}” pero ningún puerto RS-232 está en modo GPS', 'Condition “{c}” but no RS-232 port is set to GPS'),
    'beacon_rf_fast': ('Baliza por RF cada {n} min: para una estación fija lo habitual es 10 - 30 min',
                       'RF beacon every {n} min: 10 - 30 min is usual for a fixed station'),
    'path_long': ('Ruta de la baliza {p}: más de 2 saltos satura la red', 'Beacon path {p}: more than 2 hops floods the network'),
    'digi_wide_n': ('La regla {name}n-N acepta n hasta {n}; lo recomendado hoy es n≤2', 'Rule {name}n-N accepts n up to {n}; n≤2 is recommended today'),
    'digi_lower': ('“n>=” mayor que “n<=”: la regla no acepta nada', '“n>=” greater than “n<=”: the rule matches nothing'),
    'digi_sp': ('Regla SPn-N (ruta estatal polaca) activa con un indicativo no polaco', 'SPn-N rule (Polish state path) active with a non-Polish callsign'),
    'digi_noarea': ('La regla no tiene ninguna zona marcada: no repetirá nada', 'Rule has no area selected: it will digipeat nothing'),
    'digi_none': ('El digipetidor está activado pero no hay ninguna regla de ruta activa', 'Digipeater is on but no path rule is active'),
    'area_unused_default': ('Zona {a} activada con las coordenadas por defecto de Polonia', 'Area {a} enabled with the default Polish coordinates'),
    'ip': ('Octeto fuera de rango (0 - 255)', 'Octet out of range (0 - 255)'),
    'ip_default': ('IP fija 192.168.2.2 por defecto: compruebe que encaja en su red', 'Default static IP 192.168.2.2: check it fits your network'),
    'server_pl': ('Servidor APRS-IS polaco con un indicativo no polaco: use un servidor cercano (p. ej. {s})',
                  'Polish APRS-IS server with a non-Polish callsign: use a nearby server (e.g. {s})'),
    'server_none': ('No hay ningún servidor APRS-IS', 'No APRS-IS server is set'),
    'is_user': ('El usuario APRS-IS ({u}) no coincide con el indicativo ({c})', 'APRS-IS user ({u}) does not match the callsign ({c})'),
    'is_pass': ('Passcode APRS-IS incorrecto para {c}: debería ser {p}', 'Wrong APRS-IS passcode for {c}: it should be {p}'),
    'is_pass_ro': ('Passcode -1: conexión APRS-IS solo de recepción, el I-Gate no enviará nada', 'Passcode -1: receive-only APRS-IS login, the I-Gate will not send anything'),
    'is_filter_wide': ('Filtro APRS-IS muy amplio ({f}): puede llenar el canal de RF', 'Very wide APRS-IS filter ({f}): it can flood the RF channel'),
    'ntp_pl': ('Servidor NTP polaco con un indicativo no polaco: use {s}', 'Polish NTP server with a non-Polish callsign: use {s}'),
    'pass_default': ('Usuario/contraseña por defecto admin/admin: cámbielos', 'Default user/password admin/admin: change them'),
    'pass_weak': ('Contraseña de menos de 8 caracteres', 'Password shorter than 8 characters'),
    'is_server_open': ('Servidor APRS-IS simple con reenvío a T2/RF: cualquiera con la contraseña puede transmitir sin límites',
                       'APRS-IS simple server forwarding to T2/RF: anyone with the password can transmit without limits'),
    'stats_default': ('Envío de estadísticas activado con el servidor de ejemplo 192.168.2.1', 'Statistics upload enabled with the example server 192.168.2.1'),
    'wu_empty': ('Weather Underground activado sin Station ID o contraseña', 'Weather Underground enabled without Station ID or password'),
    'wu_nostation': ('Weather Underground activado sin estación meteorológica en ningún puerto', 'Weather Underground enabled without a weather station on any port'),
    'sb_nogps': ('SmartBeaconing activado pero ningún puerto RS-232 está en modo GPS', 'SmartBeaconing enabled but no RS-232 port is set to GPS'),
    'sb_bt': ('SmartBeaconing activado con la interfaz Bluetooth: Bluetooth ocupa los dos puertos serie', 'SmartBeaconing enabled with the Bluetooth interface: Bluetooth uses both serial ports'),
    'sb_emergency': ('Mensaje Mic-E “Emergency”: úselo solo en una emergencia real', 'Mic-E message “Emergency”: use it only in a real emergency'),
    'sb_speeds': ('Slow Speed debe ser menor que Fast Speed', 'Slow Speed must be lower than Fast Speed'),
    'sb_periods': ('Slow Period debe ser mayor que Fast Period', 'Slow Period must be greater than Fast Period'),
    'ws_23xx': ('Con WS-2300/WS-2350 el otro puerto solo puede trabajar en recepción (p. ej. GPS)', 'With WS-2300/WS-2350 the other port can only work RX-only (e.g. GPS)'),
    'ports_dup': ('Los dos puertos RS-232 tienen la misma función ({m})', 'Both RS-232 ports have the same function ({m})'),
    'bt_ports': ('Con Bluetooth solo funciona el puerto 1 (a 9600 baudios); el puerto 2 queda reservado', 'With Bluetooth only port 1 works (at 9600 baud); port 2 is reserved'),
    'tele_coef': ('Coeficientes {a},{b},{c} distintos de los de “Default parameters” ({e}) para {s}', 'Coefficients {a},{b},{c} differ from “Default parameters” ({e}) for {s}'),
    'debug_many': ('{n} mensajes de depuración telnet activados por defecto', '{n} telnet debug messages enabled by default'),
    'baud9600': ('9600/GMSK es experimental; recuerde cerrar el puente del filtro paso alto', '9600/GMSK is experimental; remember to close the high-pass filter jumper'),
    'output_hi': ('Nivel de salida alto ({v}): compruebe la desviación con el generador de tonos de la web', 'High output level ({v}): check deviation with the WWW tone generator'),
    'txdelay_low': ('TX delay inferior a 250 ms: algunos receptores pueden perder el inicio del paquete', 'TX delay below 250 ms: some receivers may miss the packet start'),
    'fixed': ('corregido: {old} → {new}', 'fixed: {old} → {new}'),
}


def tr(key, lang, **kw):
    s = MSG[key][0 if lang == 'es' else 1]
    return s.format(**kw) if kw else s


# ---------------------------------------------------------------------------
# Small APRS helpers
# ---------------------------------------------------------------------------
def aprs_passcode(callsign):
    """Standard APRS-IS passcode of a callsign (SSID is ignored)."""
    call = callsign.upper().split('-')[0].strip()
    h = 0x73E2
    for i in range(0, len(call), 2):
        h ^= ord(call[i]) << 8
        if i + 1 < len(call):
            h ^= ord(call[i + 1])
    return h & 0x7FFF


POLISH = re.compile(r'^(SP|SQ|SN|SO|SR|3Z|HF)\d', re.I)

# country NTP pool and nearby APRS-IS server by callsign prefix
COUNTRY = [
    (r'^(E[A-H])\d', 'es'), (r'^(C[T-U])\d', 'pt'), (r'^(D[A-R])\d', 'de'), (r'^F\d', 'fr'),
    (r'^(G|M|2[EIMUW])', 'uk'), (r'^I[A-Z]?\d', 'it'), (r'^(ON|OO|OR|OT)\d', 'be'),
    (r'^(P[A-I])\d', 'nl'), (r'^OE\d', 'at'), (r'^(HB|HE)\d', 'ch'), (r'^(OK|OL)\d', 'cz'),
    (r'^(OM)\d', 'sk'), (r'^(HA|HG)\d', 'hu'), (r'^(S5)\d', 'si'), (r'^(9A)\d', 'hr'),
    (r'^(SV|SX|SY|SZ)\d', 'gr'), (r'^(OZ|5P|5Q)\d', 'dk'), (r'^(SM|SA|SB|SC|SD|SE|SF|SG|SH|SI|SJ|SK|SL|7S|8S)\d', 'se'),
    (r'^(LA|LB|LC|LD|LE|LF|LG|LH|LI|LJ|LK|LL|LM|LN)\d', 'no'), (r'^(OH|OG|OF|OI)\d', 'fi'),
    (r'^(EI|EJ)\d', 'ie'), (r'^(LX)\d', 'lu'), (r'^(YO|YP|YQ|YR)\d', 'ro'), (r'^(LZ)\d', 'bg'),
    (r'^(SP|SQ|SN|SO|SR|3Z|HF)\d', 'pl'),
]


def country_of(callsign):
    c = callsign.upper()
    for rx, cc in COUNTRY:
        if re.match(rx, c):
            return cc
    return None


def ntp_for(callsign):
    cc = country_of(callsign)
    return '0.%s.pool.ntp.org' % cc if cc else 'pool.ntp.org'


def server_for(callsign):
    # aprs2.net regional rotates: euro, noam, soam, asia, aunz
    return 'euro.aprs2.net' if country_of(callsign) else 'rotate.aprs2.net'


LAT_RX = re.compile(r'^(\d{2})(\d{2})\.(\d{2})([NS])$')
LON_RX = re.compile(r'^(\d{3})(\d{2})\.(\d{2})([EW])$')


def lat_ok(v):
    m = LAT_RX.match(v or '')
    return bool(m) and int(m.group(1)) <= 90 and int(m.group(2)) < 60 and \
        not (int(m.group(1)) == 90 and (int(m.group(2)) or int(m.group(3))))


def lon_ok(v):
    m = LON_RX.match(v or '')
    return bool(m) and int(m.group(1)) <= 180 and int(m.group(2)) < 60 and \
        not (int(m.group(1)) == 180 and (int(m.group(2)) or int(m.group(3))))


SPECIAL = {'date', 'lat', 'long', 'gpslat', 'gpslong', 'gpsdate', 'volt', 'temp', 'tempf', 'gamma'}

# telemetry defaults of “Default parameters” we know from the default .cfg
TELE_DEFAULT_COEF = {13: (0.0, 0.075, 0.0), 14: (0.0, 10.0, 0.0), 16: (0.0, 10.0, 0.0),
                     19: (0.0, 1.0, 0.0)}
TELE_SOURCES = ['Not used', '(M) Current1 5A', '(M) Current1 2.5A', '(M) Current1 1.25A',
                '(M) Current2 5A', '(M) Current2 2.5A', '(M) Current2 1.25A', '(M) Voltage1',
                '(M) Voltage2', '(M) DS18B20', '(M) DS18S20', '(E) DS18B20', '(E) DS18S20',
                '(I) Input voltage', "(I) RX'ed 1h", "(I) RX'ed 10min", "(I) DIGI'ed 1h",
                "(I) DIGI'ed 10min", '(I) Decode eff. total', '(I) Decode eff. 1h',
                "(I) DIGI'ed/RX'ed 1h", "(I) DIGI'ed/RX'ed total", "(I) DIGI'ed/pkt starts 1h",
                "(I) DIGI'ed/pkt starts total"]


# ---------------------------------------------------------------------------
# .cfg file model (keeps bytes, line endings and order)
# ---------------------------------------------------------------------------
class Cfg:
    ENC = 'latin-1'   # byte-transparent round trip of the Windows ANSI file

    def __init__(self, path):
        self.path = path
        raw = open(path, 'rb').read()
        self.text = raw.decode(self.ENC)
        self.eol = '\r\n' if '\r\n' in self.text else '\n'
        self.lines = self.text.split(self.eol)
        self.index = {}   # (section, key) -> line number
        sec = None
        for n, line in enumerate(self.lines):
            s = line.strip()
            if s.startswith('[') and s.endswith(']'):
                sec = s[1:-1]
            elif '=' in line and sec is not None:
                k = line.split('=', 1)[0]
                self.index.setdefault((sec, k), n)
        self.changes = []

    def get(self, sec, key, default=None):
        n = self.index.get((sec, key))
        if n is None:
            return default
        return self.lines[n].split('=', 1)[1]

    def has(self, sec, key):
        return (sec, key) in self.index

    def set(self, sec, key, value):
        value = str(value)
        n = self.index.get((sec, key))
        if n is None:
            raise KeyError('%s/%s' % (sec, key))
        old = self.lines[n].split('=', 1)[1]
        if old != value:
            self.lines[n] = '%s=%s' % (key, value)
            self.changes.append((sec, key, old, value))

    def find(self, key):
        for (s, k) in self.index:
            if k == key:
                return s
        return None

    def save(self, path):
        with open(path, 'wb') as f:
            f.write(self.eol.join(self.lines).encode(self.ENC))


# keys every v1.13 file must contain (subset per section, enough to detect old files)
REQUIRED = {
    'Radio': ['Callsign', 'SSID', 'Latitude', 'Longitude', 'TXdelay', 'Quiettime', 'PTT', 'Baudrate'],
    'Digipeater': ['Digion', 'Floodtimeout', 'Pathn1_name', 'Callfilter_rule', 'Callfilter_callsign20'],
    'Beacons': ['Beacon1_msg', 'Beacon8_msg'],
    'PositionReports': ['ReportMode', 'ReportEncoding', 'SlowSpeed', 'FastSpeed'],
    'Network': ['Netconfig', 'Ipaddr0'],
    'APRS-IS': ['Aprsis1_servername', 'Aprsis_user', 'Aprsis_pass', 'Aprsis_filter'],
    'I-Gate': ['Aprsis_fromrf', 'Packet2rf_filter_type24'],
    'RTC': ['Ntp_enable', 'Ntp_servername'],
    'WWW': ['Www_user', 'Www_pass', 'Www_port', 'Www_altlogo'],
    'Telnet': ['Telnet_user', 'Telnet_pass'],
    'Statsupload': ['Statsupload_enable', 'Statsupload_txrate'],
    'Telemetry': ['Tele_enable', 'Teleanalog1_source'],
    'Weather': ['Weather_stationtype'],
    'WeatherUnderground': ['Enable', 'StationID'],
    'ExternalDevices': ['Bluetooth_connected', 'Serial1_mode', 'Serial2_mode'],
    'Other': ['Voltage_calibration'],
}


# ---------------------------------------------------------------------------
# Checker
# ---------------------------------------------------------------------------
class Checker:
    def __init__(self, cfg, lang='es'):
        self.c, self.lang, self.items = cfg, lang, []

    def add(self, level, sec, key, msgkey, **kw):
        self.items.append((level, sec, key, tr(msgkey, self.lang, **kw)))

    # -- helpers ---------------------------------------------------------
    def int_of(self, sec, key, lo=None, hi=None, zero_ok=False, level=ERROR, tele=False):
        v = self.c.get(sec, key)
        if v is None:
            return None
        try:
            n = int(v.strip())
        except ValueError:
            self.add(ERROR, sec, key, 'not_int')
            return None
        if lo is not None and not (lo <= n <= hi):
            if zero_ok and n == 0:
                return n
            if tele and n == 0:
                self.add(WARN, sec, key, 'range_tele0', lo=lo, hi=hi)
            else:
                self.add(level, sec, key, 'range0' if zero_ok else 'range', lo=lo, hi=hi)
        return n

    def ssid(self, sec, key, wildcard=False, allow_empty=False):
        v = (self.c.get(sec, key) or '').strip()
        if allow_empty and v == '':
            return
        if wildcard and v == '*':
            return
        if not v.isdigit() or not 0 <= int(v) <= 15:
            self.add(ERROR, sec, key, 'ssid_wild' if wildcard else 'ssid')

    def combo(self, sec, key):
        items = SECTION_ITEMS.get((sec, key)) or ITEMS.get(key)
        v = self.c.get(sec, key)
        if items is None or v is None:
            return
        try:
            n = int(v)
        except ValueError:
            self.add(ERROR, sec, key, 'not_int')
            return
        if not 0 <= n < len(items):
            self.add(ERROR, sec, key, 'item', hi=len(items) - 1)

    def gps_port(self):
        return '2' in (self.c.get('ExternalDevices', 'Serial1_mode'),
                       self.c.get('ExternalDevices', 'Serial2_mode'))

    def port_mode(self, mode):
        return str(mode) in (self.c.get('ExternalDevices', 'Serial1_mode'),
                             self.c.get('ExternalDevices', 'Serial2_mode'))

    def callsign(self):
        return (self.c.get('Radio', 'Callsign') or '').strip().upper()

    # -- checks ----------------------------------------------------------
    def run(self):
        c = self.c
        for sec, keys in REQUIRED.items():
            for k in keys:
                if not c.has(sec, k):
                    self.add(ERROR, sec, k, 'missing_key')
        ver = c.get('!WARNING', 'Version')
        if ver and ver.strip() != CFG_VERSION:
            self.add(WARN, '!WARNING', 'Version', 'version', v=ver.strip())
        for (sec, key) in list(c.index):
            self.combo(sec, key)
        self.radio()
        self.digipeater()
        self.beacons()
        self.position_reports()
        self.network()
        self.aprsis()
        self.remote()
        self.telemetry()
        self.weather()
        self.external()
        return self.items

    def radio(self):
        c, call = self.c, self.callsign()
        if call in ('NOCALL', 'N0CALL', ''):
            self.add(ERROR, 'Radio', 'Callsign', 'call_default')
        elif len(call) < 3:
            self.add(ERROR, 'Radio', 'Callsign', 'call_short')
        elif len(call) > 6:
            self.add(ERROR, 'Radio', 'Callsign', 'call_long')
        elif not call.isalnum():
            self.add(ERROR, 'Radio', 'Callsign', 'call_chars')
        self.ssid('Radio', 'SSID')
        lat, lon = c.get('Radio', 'Latitude'), c.get('Radio', 'Longitude')
        if not lat_ok(lat):
            self.add(ERROR, 'Radio', 'Latitude', 'lat')
        if not lon_ok(lon):
            self.add(ERROR, 'Radio', 'Longitude', 'lon')
        if (lat, lon) == ('5223.08N', '01658.14E'):
            self.add(WARN, 'Radio', 'Latitude', 'pos_default')
        elif lat and lon and lat[:-1] == '0000.00' and lon[:-1] == '00000.00':
            self.add(WARN, 'Radio', 'Latitude', 'pos_zero')
        txd = self.int_of('Radio', 'TXdelay', 200, 1000)
        if txd is not None and 200 <= txd < 250:
            self.add(INFO, 'Radio', 'TXdelay', 'txdelay_low')
        self.int_of('Radio', 'Quiettime', 200, 3000)
        out = self.int_of('Radio', 'Output_level', 0, 27)
        if out is not None and out >= 24:
            self.add(INFO, 'Radio', 'Output_level', 'output_hi', v=out)
        if c.get('Radio', 'Baudrate') == '1':
            self.add(INFO, 'Radio', 'Baudrate', 'baud9600')

    def digipeater(self):
        c, call = self.c, self.callsign()
        S = 'Digipeater'
        self.int_of(S, 'Floodtimeout', 15, 180)
        active = 0
        for i in range(1, 9):
            p = 'Pathn%d_' % i
            name = (c.get(S, p + 'name') or '').strip().upper()
            lo = self.int_of(S, p + 'lower', 1, 7)
            hi = self.int_of(S, p + 'higher', 1, 7)
            on = c.get(S, p + 'active') in ('1', '2')
            if not (name and on):
                continue
            active += 1
            if lo is not None and hi is not None and lo > hi:
                self.add(ERROR, S, p + 'lower', 'digi_lower')
            if name == 'WIDE' and hi is not None and hi > 2:
                self.add(WARN, S, p + 'higher', 'digi_wide_n', name=name, n=hi)
            if name == 'SP' and call not in ('', 'NOCALL') and not POLISH.match(call):
                self.add(WARN, S, p + 'active', 'digi_sp')
            if not any(c.get(S, p + a) == '1' for a in ('areaall', 'arearad0', 'arearad1', 'arearect0')):
                self.add(ERROR, S, p + 'areaall', 'digi_noarea')
            if c.get(S, p + 'arearad1') == '1' and c.get(S, 'Arearad1_latitude') == '5221.05N':
                self.add(WARN, S, 'Arearad1_latitude', 'area_unused_default', a='RAD1')
            if c.get(S, p + 'arearect0') == '1' and c.get(S, 'Arearect0_nwlatitude') == '5232.05N':
                self.add(WARN, S, 'Arearect0_nwlatitude', 'area_unused_default', a='RECT0')
        if c.get(S, 'Digion') == '1' and active == 0:
            self.add(WARN, S, 'Digion', 'digi_none')
        self.int_of(S, 'Arearad0_distance', 1, 3000)
        self.int_of(S, 'Arearad1_distance', 1, 3000)
        for k in ('Arearad1_latitude', 'Arearect0_nwlatitude', 'Arearect0_selatitude'):
            if not lat_ok(c.get(S, k)):
                self.add(ERROR, S, k, 'lat')
        for k in ('Arearad1_longitude', 'Arearect0_nwlongitude', 'Arearect0_selongitude'):
            if not lon_ok(c.get(S, k)):
                self.add(ERROR, S, k, 'lon')
        for i in range(1, 21):
            self.ssid(S, 'Callfilter_ssid%d' % i, wildcard=True)

    def text_checks(self, sec, key, beacon=False):
        msg = self.c.get(sec, key) or ''
        if beacon and len(msg) > 95:
            self.add(ERROR, sec, key, 'msg_long', n=len(msg))
        if any(ord(ch) < 32 or ord(ch) > 126 for ch in msg):
            self.add(ERROR, sec, key, 'msg_chars')
        elif '|' in msg or '~' in msg:
            self.add(WARN, sec, key, 'msg_pipe')
        return msg

    def beacons(self):
        c, S = self.c, 'Beacons'
        digi_on = c.get('Digipeater', 'Digion') == '1'
        for i in range(1, 9):
            b = 'Beacon%d_' % i
            msg = self.text_checks(S, b + 'msg', beacon=True)
            en = c.get(S, b + 'enable')
            rf = self.int_of(S, b + 'txrate_rf', 5, 1440, zero_ok=True)
            self.int_of(S, b + 'txrate_aprsis', 5, 1440, zero_ok=True)
            self.ssid(S, b + 'dest_ssid')
            self.ssid(S, b + 'path_ssid', allow_empty=True)
            if len((c.get(S, b + 'dest_string') or '').strip()) < 3:
                self.add(ERROR, S, b + 'dest_string', 'dest_short')
            if en in (None, '0') or not msg:
                continue
            tags = set(re.findall(r'<([a-z]+)>', msg))
            for t in sorted(tags - SPECIAL):
                self.add(WARN, S, b + 'msg', 'msg_unknown_tag', t='<%s>' % t)
            if tags & {'temp', 'tempf'} and c.get('Thermo', 'Thermo_enable') != '1':
                self.add(WARN, S, b + 'msg', 'msg_temp')
            if tags & {'gpslat', 'gpslong', 'gpsdate'} and not self.gps_port():
                self.add(WARN, S, b + 'msg', 'msg_gps')
            if 'gamma' in tags and not self.port_mode(3):
                self.add(WARN, S, b + 'msg', 'msg_gamma')
            if en in ('2', '3') and not self.gps_port():
                self.add(WARN, S, b + 'enable', 'beacon_gps_cond', c=ITEMS['Beacon1_enable'][int(en)])
            path = (c.get(S, b + 'path_string') or '').upper()
            pssid = c.get(S, b + 'path_ssid') or ''
            m = re.match(r'^WIDE([1-7])$', path)
            if m and pssid.isdigit() and int(pssid) > 2:
                self.add(WARN, S, b + 'path_ssid', 'path_long', p='%s-%s' % (path, pssid))
            if rf and rf < 10 and c.get('PositionReports', 'ReportMode') != '1' and digi_on:
                self.add(INFO, S, b + 'txrate_rf', 'beacon_rf_fast', n=rf)

    def position_reports(self):
        c, S = self.c, 'PositionReports'
        for i in (1, 2, 3):
            self.ssid(S, 'SSID%d' % i, allow_empty=True)
        st = c.get(S, 'Status') or ''
        if len(st) > 40:
            self.add(ERROR, S, 'Status', 'range', lo=0, hi=40)
        if c.get(S, 'ReportMode') != '1':
            return
        if not self.gps_port():
            self.add(ERROR, S, 'ReportMode', 'sb_nogps')
        if c.get('ExternalDevices', 'Bluetooth_connected') == '1':
            self.add(ERROR, S, 'ReportMode', 'sb_bt')
        if c.get(S, 'MiceMessage') == '7':
            self.add(WARN, S, 'MiceMessage', 'sb_emergency')
        try:
            if int(c.get(S, 'SlowSpeed')) >= int(c.get(S, 'FastSpeed')):
                self.add(ERROR, S, 'SlowSpeed', 'sb_speeds')
            if int(c.get(S, 'SlowPeriod')) <= int(c.get(S, 'FastPeriod')):
                self.add(ERROR, S, 'SlowPeriod', 'sb_periods')
        except (TypeError, ValueError):
            pass

    def network(self):
        c, S = self.c, 'Network'
        for base in ('Ipaddr', 'Ipmask', 'Ipgate', 'Ipdns'):
            for j in range(4):
                self.int_of(S, '%s%d' % (base, j), 0, 255)
        if c.get(S, 'Netconfig') == '0' and [c.get(S, 'Ipaddr%d' % j) for j in range(4)] == ['192', '168', '2', '2']:
            self.add(INFO, S, 'Ipaddr0', 'ip_default')

    def aprsis(self):
        c, call = self.c, self.callsign()
        S = 'APRS-IS'
        servers = [(c.get(S, 'Aprsis%d_servername' % i) or '').strip() for i in (1, 2, 3)]
        for i in (1, 2, 3):
            self.int_of(S, 'Aprsis%d_port' % i, 0, 65535)
        self.int_of(S, 'Aprsis_timeout', 1, 60)
        igate = c.get('I-Gate', 'Aprsis_fromrf') == '1' or c.get('I-Gate', 'Aprsis_msg2rf') == '1'
        if not any(servers):
            if igate:
                self.add(WARN, S, 'Aprsis1_servername', 'server_none')
        elif call and call != 'NOCALL' and not POLISH.match(call):
            for i, s in enumerate(servers, 1):
                if s.lower() == 'poland.aprs2.net':
                    self.add(WARN, S, 'Aprsis%d_servername' % i, 'server_pl', s=server_for(call))
        user = (c.get(S, 'Aprsis_user') or '').strip().upper()
        ssid = (c.get('Radio', 'SSID') or '0').strip()
        full = call if ssid in ('', '0') else '%s-%s' % (call, ssid)
        if call and call != 'NOCALL' and user != full:
            self.add(WARN, S, 'Aprsis_user', 'is_user', u=user or '-', c=full)
        pw = (c.get(S, 'Aprsis_pass') or '').strip()
        login = user or call
        if pw == '-1':
            if c.get('I-Gate', 'Aprsis_fromrf') == '1':
                self.add(WARN, S, 'Aprsis_pass', 'is_pass_ro')
        elif login and login not in ('NOCALL',):
            want = aprs_passcode(login)
            if pw != str(want):
                self.add(ERROR, S, 'Aprsis_pass', 'is_pass', c=login.split('-')[0], p=want)
        flt = (c.get(S, 'Aprsis_filter') or '').strip()
        m = re.search(r'\b[mr]/[-\d.]*/?[-\d.]*/?(\d+)', flt)
        if m and int(m.group(1)) > 150 and c.get('I-Gate', 'Aprsis_packet2rf') == '1':
            self.add(WARN, S, 'Aprsis_filter', 'is_filter_wide', f=flt)
        G = 'I-Gate'
        self.int_of(G, 'Aprsis_heardtimeout', 1, 240)
        self.int_of(G, 'Rfheard_local_maxhops', 0, 8)
        self.int_of(G, 'Rfheard_local_timeout', 1, 240)
        self.int_of(G, 'Rfheard_timeout', 1, 240)
        for k in ('Aprsis_packet2rf_1min', 'Aprsis_packet2rf_2min', 'Aprsis_packet2rf_3min'):
            self.int_of(G, k, 1, 240)
        for k in ('Aprsis_2rf_dest_ssid', 'Aprsis_msg2rf_ssid', 'Aprsis_packet2rf_ssid'):
            self.ssid(G, k)
        for i in range(1, 25):
            self.ssid(G, 'Packet2rf_filter_ssid%02d' % i, wildcard=True)
        ntp = (c.get('RTC', 'Ntp_servername') or '').strip().lower()
        if c.get('RTC', 'Ntp_enable') == '1' and '.pl.' in ntp and call != 'NOCALL' and not POLISH.match(call):
            self.add(WARN, 'RTC', 'Ntp_servername', 'ntp_pl', s=ntp_for(call))

    def remote(self):
        c = self.c
        for sec, u, p in (('WWW', 'Www_user', 'Www_pass'), ('Telnet', 'Telnet_user', 'Telnet_pass'),
                          ('APRSISServer', 'Aprsisserver_username', 'Aprsisserver_password')):
            if sec == 'APRSISServer' and c.get(sec, 'Aprsisserver_enable') != '1':
                continue
            if c.get(sec, u) == 'admin' and c.get(sec, p) == 'admin':
                self.add(WARN, sec, p, 'pass_default')
            elif len(c.get(sec, p) or '') < 8:
                self.add(INFO, sec, p, 'pass_weak')
        if c.get('APRSISServer', 'Aprsisserver_enable') == '1' and \
                c.get('APRSISServer', 'Aprsisserver_tois') == '1':
            self.add(WARN, 'APRSISServer', 'Aprsisserver_tois', 'is_server_open')
        S = 'Statsupload'
        self.int_of(S, 'Statsupload_port', 0, 65535)
        self.int_of(S, 'Statsupload_txrate', 1, 240)
        if c.get(S, 'Statsupload_enable') == '1' and c.get(S, 'Statsupload_hostname') == '192.168.2.1':
            self.add(WARN, S, 'Statsupload_hostname', 'stats_default')
        dbg = sum(1 for (s, k) in c.index if s == 'Debug' and c.get(s, k) == '1')
        if dbg > 6:
            self.add(INFO, 'Debug', '*', 'debug_many', n=dbg)

    def telemetry(self):
        c, S = self.c, 'Telemetry'
        for pre in ('Teleparams', 'Teledata'):
            self.ssid(S, pre + '_dest_ssid')
            self.ssid(S, pre + '_path_ssid', allow_empty=True)
            if len((c.get(S, pre + '_dest_string') or '').strip()) < 3:
                self.add(ERROR, S, pre + '_dest_string', 'dest_short')
            self.int_of(S, pre + '_txrate_rf', 5, 1440, tele=True)
            self.int_of(S, pre + '_txrate_aprsis', 5, 1440, tele=True)
        self.int_of(S, 'Tele_holdoff', 0, 250)
        if len(c.get(S, 'Tele_title') or '') > 23:
            self.add(ERROR, S, 'Tele_title', 'range', lo=0, hi=23)
        if c.get(S, 'Tele_enable') != '1':
            return
        for i in range(1, 6):
            p = 'Teleanalog%d_' % i
            try:
                src = int(c.get(S, p + 'source'))
                coef = tuple(float(c.get(S, p + k)) for k in ('coefa', 'coefb', 'coefc'))
            except (TypeError, ValueError):
                continue
            exp = TELE_DEFAULT_COEF.get(src)
            if exp and coef != exp:
                self.add(WARN, S, p + 'coefa', 'tele_coef', a=coef[0], b=coef[1], c=coef[2],
                         e=','.join(str(x) for x in exp), s=TELE_SOURCES[src])

    def weather(self):
        c = self.c
        S = 'Weather'
        self.ssid(S, 'Weather_dest_ssid')
        self.ssid(S, 'Weather_path_ssid', allow_empty=True)
        self.int_of(S, 'Weather_txrate_rf', 5, 1440, tele=True)
        self.int_of(S, 'Weather_txrate_aprsis', 5, 1440, tele=True)
        com = self.text_checks(S, 'Weather_comment')
        if len(com) > 32:
            self.add(ERROR, S, 'Weather_comment', 'range', lo=0, hi=32)
        W = 'WeatherUnderground'
        self.int_of(W, 'Normal_rate', 1, 240)
        self.int_of(W, 'Rapidfire_rate', 5, 60)
        if c.get(W, 'Enable') == '1':
            if not (c.get(W, 'StationID') or '').strip() or not (c.get(W, 'Password') or '').strip():
                self.add(ERROR, W, 'StationID', 'wu_empty')
            if not self.port_mode(1) or c.get(S, 'Weather_stationtype') == '0':
                self.add(WARN, W, 'Enable', 'wu_nostation')

    def external(self):
        c, S = self.c, 'ExternalDevices'
        m1, m2 = c.get(S, 'Serial1_mode'), c.get(S, 'Serial2_mode')
        if c.get(S, 'Bluetooth_connected') == '1':
            if m2 not in ('0', None):
                self.add(INFO, S, 'Serial2_mode', 'bt_ports')
            return
        if m1 == m2 and m1 not in ('0', None):
            self.add(WARN, S, 'Serial2_mode', 'ports_dup', m=ITEMS['Serial1_mode'][int(m1)])
        st = c.get('Weather', 'Weather_stationtype')
        if st in ('5', '6') and '1' in (m1, m2):
            other = m2 if m1 == '1' else m1
            if other not in ('0', '2'):
                self.add(WARN, S, 'Serial2_mode', 'ws_23xx')


# ---------------------------------------------------------------------------
# Fixer
# ---------------------------------------------------------------------------
def random_password(n=12):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))


def apply_fixes(cfg, args):
    """Safe automatic fixes plus the values given on the command line."""
    c = cfg
    if args.callsign:
        call, _, ssid = args.callsign.upper().partition('-')
        c.set('Radio', 'Callsign', call)
        c.set('Radio', 'SSID', ssid or '0')
    if args.lat:
        c.set('Radio', 'Latitude', args.lat.upper())
    if args.lon:
        c.set('Radio', 'Longitude', args.lon.upper())
    call = (c.get('Radio', 'Callsign') or '').upper()
    ssid = (c.get('Radio', 'SSID') or '0')
    have_call = call not in ('', 'NOCALL', 'N0CALL')
    if have_call:
        full = call if ssid in ('', '0') else '%s-%s' % (call, ssid)
        c.set('APRS-IS', 'Aprsis_user', full)
        if (c.get('APRS-IS', 'Aprsis_pass') or '').strip() != '-1' or args.passcode or args.callsign:
            c.set('APRS-IS', 'Aprsis_pass', aprs_passcode(call))
    if not args.keep_digi:
        for i in range(1, 9):
            p = 'Pathn%d_' % i
            name = (c.get('Digipeater', p + 'name') or '').upper()
            if name == 'WIDE' and int(c.get('Digipeater', p + 'higher') or 0) > 2:
                c.set('Digipeater', p + 'higher', 2)
            if name == 'SP' and have_call and not POLISH.match(call):
                c.set('Digipeater', p + 'active', 0)
    if have_call and not POLISH.match(call):
        for i in (1, 2, 3):
            k = 'Aprsis%d_servername' % i
            if (c.get('APRS-IS', k) or '').lower() == 'poland.aprs2.net':
                c.set('APRS-IS', k, server_for(call))
        if '.pl.' in (c.get('RTC', 'Ntp_servername') or ''):
            c.set('RTC', 'Ntp_servername', ntp_for(call))
    if args.server:
        c.set('APRS-IS', 'Aprsis1_servername', args.server)
    if args.ntp:
        c.set('RTC', 'Ntp_servername', args.ntp)
    for kv in args.set or []:
        if '=' not in kv:
            raise SystemExit('--set needs SECTION/KEY=VALUE or KEY=VALUE: %s' % kv)
        k, v = kv.split('=', 1)
        if '/' in k:
            sec, k = k.split('/', 1)
        else:
            sec = c.find(k)
            if sec is None:
                raise SystemExit('unknown key: %s' % k)
        c.set(sec, k, v)
    passwords = {}
    if args.random_passwords:
        for sec, k in (('WWW', 'Www_pass'), ('Telnet', 'Telnet_pass'),
                       ('APRSISServer', 'Aprsisserver_password')):
            if c.get(sec, k) == 'admin':
                pw = random_password()
                c.set(sec, k, pw)
                passwords['%s/%s' % (sec, k)] = pw
    return passwords


# ---------------------------------------------------------------------------
# Summary of what the station does (for other programs, e.g. S.A.T.-APRS+)
# ---------------------------------------------------------------------------
def summary(cfg):
    """Functions of the device according to the file. No passwords."""
    c = cfg
    g = lambda s, k, d='': (c.get(s, k) or d).strip()
    num = lambda s, k: int(g(s, k, '0')) if g(s, k, '0').lstrip('-').isdigit() else 0
    call = g('Radio', 'Callsign').upper()
    ssid = g('Radio', 'SSID', '0')
    rules = []
    for i in range(1, 9):
        p = 'Pathn%d_' % i
        name = g('Digipeater', p + 'name').upper()
        act = g('Digipeater', p + 'active', '0')
        if name and act in ('1', '2'):
            rules.append({'name': name, 'n_min': num('Digipeater', p + 'lower'), 'n_max': num('Digipeater', p + 'higher'),
                          'enable_if': 'always' if act == '1' else 'no_aprsis'})
    servers = [g('APRS-IS', 'Aprsis%d_servername' % i) for i in (1, 2, 3)]
    servers = ['%s:%s' % (s_, g('APRS-IS', 'Aprsis%d_port' % (n + 1), '14580')) for n, s_ in enumerate(servers) if s_]
    beacons = []
    for i in range(1, 9):
        b = 'Beacon%d_' % i
        en = g('Beacons', b + 'enable', '0')
        if en != '0' and g('Beacons', b + 'msg') and (num('Beacons', b + 'txrate_rf') or num('Beacons', b + 'txrate_aprsis')):
            beacons.append({'n': i, 'rf_min': num('Beacons', b + 'txrate_rf'), 'is_min': num('Beacons', b + 'txrate_aprsis'),
                            'enable_if': ITEMS['Beacon1_enable'][int(en)] if en.isdigit() and int(en) < 5 else en,
                            'path': ('%s-%s' % (g('Beacons', b + 'path_string'), g('Beacons', b + 'path_ssid'))).strip('-')})
    modes = [g('ExternalDevices', 'Serial1_mode', '0'), g('ExternalDevices', 'Serial2_mode', '0')]
    station = '1' in modes and g('Weather', 'Weather_stationtype', '0') != '0'
    st = num('Weather', 'Weather_stationtype')
    return {
        'version': g('!WARNING', 'Version'),
        'callsign': call if ssid in ('', '0') else '%s-%s' % (call, ssid),
        'position': {'lat': g('Radio', 'Latitude'), 'lon': g('Radio', 'Longitude')},
        'baudrate': '9600' if g('Radio', 'Baudrate') == '1' else '1200',
        'digipeater': {'on': g('Digipeater', 'Digion') == '1' and bool(rules), 'rules': rules},
        'igate': {'rf_to_is': g('I-Gate', 'Aprsis_fromrf') == '1' and bool(servers),
                  'msg_to_rf': g('I-Gate', 'Aprsis_msg2rf') == '1' and bool(servers),
                  'packets_to_rf': g('I-Gate', 'Aprsis_packet2rf') == '1' and bool(servers),
                  'servers': servers, 'user': g('APRS-IS', 'Aprsis_user'),
                  'passcode_ok': g('APRS-IS', 'Aprsis_pass') == str(aprs_passcode(g('APRS-IS', 'Aprsis_user') or call)) if call else False},
        'beacons': beacons,
        'weather': {'station': ITEMS['Weather_stationtype'][st] if station and st < len(ITEMS['Weather_stationtype']) else None,
                    'rf_min': num('Weather', 'Weather_txrate_rf') if station else 0,
                    'is_min': num('Weather', 'Weather_txrate_aprsis') if station else 0,
                    'wunderground': g('WeatherUnderground', 'Enable') == '1'},
        'telemetry': g('Telemetry', 'Tele_enable') == '1',
        'smartbeaconing': g('PositionReports', 'ReportMode') == '1',
        'serial': [ITEMS['Serial1_mode'][int(m)] if m.isdigit() and int(m) < 5 else m for m in modes],
        'bluetooth': g('ExternalDevices', 'Bluetooth_connected') == '1',
        'network': {'dhcp': g('Network', 'Netconfig') == '1',
                    'ip': '.'.join(g('Network', 'Ipaddr%d' % j) for j in range(4))},
        'telnet': {'port': num('Telnet', 'Telnet_port') or 23, 'user': g('Telnet', 'Telnet_user')},
        'www': {'port': num('WWW', 'Www_port') or 80},
        'aprsis_server': {'on': g('APRSISServer', 'Aprsisserver_enable') == '1', 'port': num('APRSISServer', 'Aprsisserver_port'),
                          'user': g('APRSISServer', 'Aprsisserver_username'),
                          'to_t2': g('APRSISServer', 'Aprsisserver_tois') == '1', 'from_t2': g('APRSISServer', 'Aprsisserver_fromis') == '1'},
        'kiss_tcp': {'on': g('KISSTCPIP', 'Kisstcpip_enable') == '1', 'port': num('KISSTCPIP', 'Kisstcpip_port')},
        'stats_upload': {'on': g('Statsupload', 'Statsupload_enable') == '1', 'id': g('Statsupload', 'Statsupload_id'),
                         'host': g('Statsupload', 'Statsupload_hostname'), 'port': num('Statsupload', 'Statsupload_port'),
                         'path': g('Statsupload', 'Statsupload_path'), 'interval_min': num('Statsupload', 'Statsupload_txrate')},
        'ntp': g('RTC', 'Ntp_servername') if g('RTC', 'Ntp_enable') == '1' else None,
    }


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------
COL = {ERROR: '\033[31m', WARN: '\033[33m', INFO: '\033[36m'}
LABEL = {'es': {ERROR: 'ERROR', WARN: 'AVISO', INFO: 'INFO'},
         'en': {ERROR: 'ERROR', WARN: 'WARNING', INFO: 'INFO'}}


def report(items, lang, color, out=None):
    out = out or sys.stdout
    for level in (ERROR, WARN, INFO):
        for lv, sec, key, text in items:
            if lv != level:
                continue
            lab = LABEL[lang][lv]
            if color:
                lab = COL[lv] + lab + '\033[0m'
            out.write('%-7s [%s] %s: %s\n' % (lab, sec, key, text))
    n = {lv: sum(1 for i in items if i[0] == lv) for lv in (ERROR, WARN, INFO)}
    if lang == 'es':
        out.write('\n%d errores, %d avisos, %d informativos\n' % (n[ERROR], n[WARN], n[INFO]))
    else:
        out.write('\n%d errors, %d warnings, %d info\n' % (n[ERROR], n[WARN], n[INFO]))
    return 2 if n[ERROR] else (1 if n[WARN] else 0)


def default_lang():
    env = os.environ.get('LC_ALL') or os.environ.get('LC_MESSAGES') or os.environ.get('LANG') or ''
    return 'es' if env.lower().startswith('es') else 'en'


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog='wx3cfg',
        description='Check and fix Microsat WX3in1 Plus 2.0 configuration files (Configurator v1.13). '
                    'Copyright (C) 2026 Manuel - EA7JRS, GPL-3.0-or-later.')
    ap.add_argument('--lang', choices=('es', 'en'), default=default_lang(), help='report language')
    ap.add_argument('--no-color', action='store_true', help='plain output')
    ap.add_argument('--version', action='version', version='wx3cfg ' + __version__)
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('check', help='check a .cfg file')
    p.add_argument('file')
    p.add_argument('--json', action='store_true', help='machine-readable result with a summary of the station functions')

    p = sub.add_parser('fix', help='write a corrected copy of a .cfg file')
    p.add_argument('file')
    p.add_argument('-o', '--output', required=True, help='output .cfg file (may be the same file)')
    p.add_argument('--callsign', help='callsign with SSID, e.g. EA7JRS-10')
    p.add_argument('--lat', help='latitude, e.g. 3723.10N')
    p.add_argument('--lon', help='longitude, e.g. 00559.40W')
    p.add_argument('--server', help='APRS-IS server 1')
    p.add_argument('--ntp', help='NTP server')
    p.add_argument('--passcode', action='store_true', help='also replace a -1 (receive-only) passcode (done anyway with --callsign)')
    p.add_argument('--keep-digi', action='store_true', help='do not touch the digipeater path rules')
    p.add_argument('--random-passwords', action='store_true',
                   help='replace admin/admin passwords with random ones (printed once)')
    p.add_argument('--set', action='append', metavar='[SECTION/]KEY=VALUE', help='set any key (repeatable)')

    p = sub.add_parser('passcode', help='print the APRS-IS passcode of a callsign')
    p.add_argument('callsign')

    p = sub.add_parser('show', help='print a .cfg file with combo values in words')
    p.add_argument('file')
    p.add_argument('section', nargs='?', help='only this section')

    a = ap.parse_args(argv)
    color = sys.stdout.isatty() and not a.no_color and os.name != 'nt'

    if a.cmd == 'passcode':
        print(aprs_passcode(a.callsign))
        return 0
    cfg = Cfg(a.file)
    if a.cmd == 'show':
        sec = None
        for line in cfg.lines:
            s = line.strip()
            if s.startswith('['):
                sec = s[1:-1]
                if not a.section or a.section == sec:
                    print(s)
                continue
            if '=' not in line or (a.section and a.section != sec):
                continue
            k, v = line.split('=', 1)
            items = SECTION_ITEMS.get((sec, k)) or ITEMS.get(k)
            if items and v.lstrip('-').isdigit() and 0 <= int(v) < len(items):
                print('%s=%s  (%s)' % (k, v, items[int(v)]))
            else:
                print(line)
        return 0
    if a.cmd == 'check':
        items = Checker(cfg, a.lang).run()
        if a.json:
            n = {lv: sum(1 for i in items if i[0] == lv) for lv in (ERROR, WARN, INFO)}
            json.dump({'wx3cfg': __version__, 'counts': n,
                       'items': [{'level': lv, 'section': sec, 'key': key, 'text': text} for lv, sec, key, text in items],
                       'summary': summary(cfg)}, sys.stdout, ensure_ascii=False, indent=1)
            sys.stdout.write('\n')
            return 2 if n[ERROR] else (1 if n[WARN] else 0)
        return report(items, a.lang, color)
    if a.cmd == 'fix':
        pw = apply_fixes(cfg, a)
        cfg.save(a.output)
        for sec, k, old, new in cfg.changes:
            shown_old = '***' if k.lower().endswith(('pass', 'password')) else old
            shown_new = '***' if k.lower().endswith(('pass', 'password')) and k != 'Aprsis_pass' else new
            print('[%s] %s: %s' % (sec, k, tr('fixed', a.lang, old=shown_old or '""', new=shown_new or '""')))
        for k, v in pw.items():
            print(('Contraseña nueva %s: %s' if a.lang == 'es' else 'New password %s: %s') % (k, v))
        print()
        return report(Checker(Cfg(a.output), a.lang).run(), a.lang, color)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
