#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
                    WEATHER SERVICES INTEGRATION MODULE
                        S.A.T - APRS EMCON ADAPTER
================================================================================
Módulo adicional de integración meteorológica de alta disponibilidad para:
- AEMET (Agencia Estatal de Meteorología - España)
- MeteoAlarm (Red de Servicios Meteorológicos Europeos - CAP XML)
- DWD (Deutscher Wetterdienst - Alemania)
- UK Met Office (Servicio Meteorológico Británico)
- Fuentes dinámicas y configurables bajo demanda en formato JSON, XML o Texto.

Permite parsear formatos estándar, aplicar filtrado geográfico geodésico o nominal,
clasificar alertas por severidad (Yellow, Orange, Red) y emitir boletines APRS.

IMPORTANTE: este módulo solo entrega avisos REALES. Si una fuente no responde o
no hay clave API, no devuelve nada. Los avisos de ejemplo solo se generan con
allow_simulated=True (modo --simulate del agente, que nunca transmite).

Licencia: SPDX-License-Identifier: GPL-3.0-or-later
Copyright (c) 2026 Manuel - EA7JRS
================================================================================
"""

import os
import re
import json
import ssl
import hashlib
import unicodedata
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import aprs_proto

# ==============================================================================
# CONFIGURACIÓN FLEXIBLE Y FUENTES DE DATOS POR DEFECTO
# ==============================================================================

WEATHER_ALERTS_CONFIG_FILE = "weather_alerts_sources.json"

# El filtro geográfico de cada fuente es opcional: si se deja vacío se usa el
# filtro de zona de la estación ([Alerts] meteoAreaFilter en config.ini).
# Sin ningún filtro la fuente se omite, para no difundir avisos de todo el país.
DEFAULT_SOURCES_CONFIG = {
    "sources": [
        {
            "id": "meteoalarm",
            "name": "MeteoAlarm España (avisos oficiales AEMET)",
            "enabled": True,
            "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain",
            "format": "XML",
            "api_key_required": False,
            "geographic_filter": "",
            "parser_config": {}
        },
        {
            "id": "aemet",
            "name": "AEMET OpenData (experimental)",
            "enabled": False,
            "url": "https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/esp",
            "format": "JSON",
            "api_key_required": True,
            "api_key_env_var": "AEMET_API_KEY",
            "geographic_filter": "",
            "parser_config": {
                "root_path": "",
                "item_list_key": "datos",
                "mapping": {
                    "id": "id_aviso",
                    "event": "fenomeno",
                    "severity": "nivel",
                    "area": "ambito",
                    "description": "descripcion",
                    "start": "comienzo",
                    "end": "final"
                }
            }
        },
        {
            "id": "custom_txt_service",
            "name": "Servicio de Avisos Regionales (Texto Plano)",
            "enabled": False,
            "url": "http://servidor-local-emcom/avisos.txt",
            "format": "TEXT",
            "api_key_required": False,
            "geographic_filter": "Zona-Sur",
            "parser_config": {
                "regex_alert": r"AVISO_ID: (?P<id>\d+)\nEVENTO: (?P<event>[^\n]+)\nSEVERIDAD: (?P<severity>[^\n]+)\nAREA: (?P<area>[^\n]+)\nDESCRIPCION: (?P<description>[^\n]+)",
                "mapping": {
                    "id": "id",
                    "event": "event",
                    "severity": "severity",
                    "area": "area",
                    "description": "description"
                }
            }
        }
    ]
}


# ==============================================================================
# SISTEMA DE CLASIFICACIÓN DE SEVERIDAD
# ==============================================================================
def normalize_severity(raw_severity):
    """
    Normaliza el nivel de severidad de múltiples agencias a una escala unificada:
    - RED (Extrema/Crítica)
    - ORANGE (Severa/Grave)
    - YELLOW (Moderada/Aviso)
    - GREEN (Normal/Informativa)
    """
    if not raw_severity:
        return "GREEN"
    
    sev = str(raw_severity).strip().upper()
    
    # 1. Alertas rojas / extremas
    if any(keyword in sev for keyword in ["RED", "ROJO", "EXTREME", "EXTREMO", "CRITICAL", "CRITICO", "EMERGENCY", "EMERGENCIA", "LEVEL3", "NIVEL3"]):
        return "RED"
    
    # 2. Alertas naranjas / severas
    if any(keyword in sev for keyword in ["ORANGE", "NARANJA", "SEVERE", "SEVERO", "GELB_ORANGE", "LEVEL2", "NIVEL2", "AMBER", "AMBAR", "SIGNIFICANT"]):
        return "ORANGE"
        
    # 3. Alertas amarillas / moderadas
    if any(keyword in sev for keyword in ["YELLOW", "AMARILLO", "MODERATE", "MODERADO", "LEVEL1", "NIVEL1", "ALERT", "AVISO"]):
        return "YELLOW"
        
    # 4. Alertas verdes / informativas
    return "GREEN"


# ==============================================================================
# PARSERS MULTI-FORMATO (JSON, XML/CAP, TEXT)
# ==============================================================================

class AlertParserEngine:
    """
    Motor encargado de interpretar las estructuras de datos recibidas según
    el formato declarado y las claves de mapeo especificadas en la configuración.
    """
    
    @staticmethod
    def parse_json(raw_data, parser_config):
        """
        Parsea datos JSON aplicando rutas dinámicas de claves.
        """
        try:
            payload = json.loads(raw_data.decode("utf-8", errors="ignore"))
        except Exception as e:
            print(f"[PARSER JSON ERROR] No se pudo decodificar JSON: {e}")
            return []
            
        root_path = parser_config.get("root_path", "")
        item_list_key = parser_config.get("item_list_key", "")
        mapping = parser_config.get("mapping", {})
        
        # Navegar hasta la raíz declarada
        items_container = payload
        if root_path:
            for part in root_path.split("."):
                if isinstance(items_container, dict) and part in items_container:
                    items_container = items_container[part]
                else:
                    break
                    
        # Soporte para la doble llamada indirecta de AEMET OpenData
        if item_list_key and isinstance(items_container, dict) and item_list_key in items_container:
            items_container = items_container[item_list_key]
            
        # Si el resultado no es una lista, encapsular para iterar
        if isinstance(items_container, dict):
            items_list = [items_container]
        elif isinstance(items_container, list):
            items_list = items_container
        else:
            items_list = []
            
        parsed_alerts = []
        for item in items_list:
            if not isinstance(item, dict):
                continue
                
            alert_data = {}
            for target_field, json_key in mapping.items():
                # Permitir rutas de llaves anidadas separadas por punto (ej: properties.EVENT)
                val = item
                for part in json_key.split("."):
                    if isinstance(val, dict) and part in val:
                        val = val[part]
                    else:
                        val = "N/D"
                        break
                alert_data[target_field] = val
                
            parsed_alerts.append(alert_data)
            
        return parsed_alerts

    # Nombre local del elemento XML que alimenta cada campo, por orden de preferencia
    XML_FIELDS = {
        "id": ("identifier", "id"),
        "event": ("event", "title"),
        "severity": ("severity",),
        "area": ("areaDesc",),
        "description": ("description", "headline", "summary", "title"),
        "start": ("onset", "effective", "sent"),
        "end": ("expires",),
    }

    @staticmethod
    def _local(tag):
        """Nombre de la etiqueta sin su namespace."""
        return tag.split("}")[-1] if isinstance(tag, str) else ""

    @staticmethod
    def parse_xml_cap(raw_data, parser_config):
        """
        Parsea avisos en XML: documentos CAP (<alert><info>...) y feeds Atom con
        elementos CAP por entrada (<entry><cap:event>...), como el de MeteoAlarm.
        Los elementos se localizan por su nombre local, sin depender del namespace.
        """
        try:
            root = ET.fromstring(raw_data)
        except Exception as e:
            print(f"[PARSER XML ERROR] No se pudo parsear XML: {e}")
            return []

        local = AlertParserEngine._local
        item_tag = local(parser_config.get("item_tag", ""))
        if item_tag:
            nodes = [el for el in root.iter() if local(el.tag) == item_tag]
        else:
            nodes = [el for el in root.iter() if local(el.tag) == "entry"]
            if not nodes:
                nodes = [el for el in root.iter() if local(el.tag) == "info"]

        # En un documento CAP el identificador cuelga de <alert>, no de <info>
        root_fields = {}
        for el in root:
            name = local(el.tag)
            if name not in root_fields and el.text and el.text.strip():
                root_fields[name] = el.text.strip()

        parsed_alerts = []
        for node in nodes:
            found = {}
            for el in node.iter():
                name = local(el.tag)
                if name not in found and el.text and el.text.strip():
                    found[name] = el.text.strip()
            alert_data = {}
            for target_field, candidates in AlertParserEngine.XML_FIELDS.items():
                value = next((found[c] for c in candidates if c in found), None)
                if value is None:
                    value = next((root_fields[c] for c in candidates if c in root_fields), "N/D")
                alert_data[target_field] = value
            parsed_alerts.append(alert_data)

        return parsed_alerts

    @staticmethod
    def parse_plaintext(raw_data, parser_config):
        """
        Parsea datos de Texto Plano mediante la aplicación de expresiones regulares (Regex) configurables.
        """
        text = raw_data.decode("utf-8", errors="ignore")
        regex_pattern = parser_config.get("regex_alert", r"")
        mapping = parser_config.get("mapping", {})
        
        if not regex_pattern:
            print("[PARSER TEXT WARNING] Expresión regular vacía en configuración.")
            return []
            
        parsed_alerts = []
        try:
            matches = re.finditer(regex_pattern, text, re.IGNORECASE | re.MULTILINE)
            for m in matches:
                group_dict = m.groupdict()
                alert_data = {}
                for target_field, regex_group in mapping.items():
                    alert_data[target_field] = group_dict.get(regex_group, "N/D")
                parsed_alerts.append(alert_data)
        except Exception as e:
            print(f"[PARSER TEXT ERROR] Fallo al aplicar regex sobre texto plano: {e}")
            
        return parsed_alerts


# ==============================================================================
# CLASE PRINCIPAL: ADMINISTRADOR DE FUENTES METEOROLÓGICAS (ALTA DISPONIBILIDAD)
# ==============================================================================

class WeatherAlertsManager:
    """
    Gestor unificado de alertas meteorológicas nacionales y regionales.
    Permite cargar fuentes dinámicas desde un archivo JSON, consultar APIs oficiales,
    clasificar la criticidad de los avisos, aplicar filtros espaciales y generar 
    boletines listos para emitir sobre la red APRS.
    """
    
    def __init__(self, fallback_lat=40.416775, fallback_lon=-3.703790,
                 area_filter="", allow_simulated=False, config_path=None):
        self.config_path = config_path or WEATHER_ALERTS_CONFIG_FILE
        self.station_lat = fallback_lat
        self.station_lon = fallback_lon
        # Zonas de interés de la estación (separadas por comas), p. ej. "Sevilla,Cadiz"
        self.area_filter = area_filter or ""
        # Solo en pruebas: permite generar avisos de ejemplo cuando la fuente falla
        self.allow_simulated = bool(allow_simulated)
        self.sources = []
        self.load_config()

    def load_config(self):
        """
        Carga la configuración de fuentes de datos. Si el archivo no existe,
        se crea uno por defecto con servicios preestablecidos altamente confiables.
        """
        if not os.path.exists(self.config_path):
            try:
                with open(self.config_path, "w", encoding="utf-8") as f:
                    json.dump(DEFAULT_SOURCES_CONFIG, f, indent=2, ensure_ascii=False)
                self.sources = DEFAULT_SOURCES_CONFIG["sources"]
                print(f"[METEO MANAGER] Generado archivo de configuración por defecto: {self.config_path}")
            except Exception as e:
                print(f"[METEO MANAGER WARNING] No se pudo guardar configuración por defecto: {e}")
                self.sources = DEFAULT_SOURCES_CONFIG["sources"]
        else:
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.sources = data.get("sources", [])
                print(f"[METEO MANAGER] Cargadas {len(self.sources)} fuentes meteorológicas desde {self.config_path}")
            except Exception as e:
                print(f"[METEO MANAGER ERROR] Fallo al leer {self.config_path}: {e}. Cargando fallbacks integrados.")
                self.sources = DEFAULT_SOURCES_CONFIG["sources"]

    def set_station_coords(self, lat, lon):
        """
        Actualiza las coordenadas actuales del nodo (para filtros geográficos dinámicos).
        """
        self.station_lat = lat
        self.station_lon = lon

    def _fetch_url(self, url, api_key_value=None):
        """
        Descarga una URL verificando el certificado TLS del servidor.
        La clave API, si existe, solo se envía a la fuente que la requiere.
        """
        headers = {
            "User-Agent": "S.A.T. Weather Emergency System/3.1",
            "Accept": "application/json, application/xml, text/plain, */*"
        }
        if api_key_value:
            headers["api_key"] = api_key_value

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=10) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            print(f"[METEO HTTP ERROR] Código {e.code} al acceder a {url}: {e.reason}")
        except urllib.error.URLError as e:
            print(f"[METEO NET ERROR] Fallo de conexión de red hacia {url}: {e.reason}")
        except Exception as e:
            print(f"[METEO HTTP EXCEPTION] Error imprevisto al descargar de {url}: {e}")
        return None

    @staticmethod
    def _fold(text):
        """Minúsculas y sin tildes, para comparar nombres de zona."""
        text = unicodedata.normalize("NFKD", str(text or ""))
        return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()

    def _area_terms(self, source_filter):
        """Lista de zonas a vigilar: las de la fuente o, si no tiene, las de la estación."""
        raw = source_filter or self.area_filter
        return [self._fold(t) for t in str(raw).split(",") if t.strip()]

    @staticmethod
    def _is_expired(end_value):
        """True si el aviso tiene fecha de fin reconocible y ya ha pasado."""
        try:
            end = datetime.fromisoformat(str(end_value).strip().replace("Z", "+00:00"))
        except ValueError:
            return False
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return end < datetime.now(timezone.utc)

    def query_source(self, source_config, api_key_fallback=""):
        """
        Consulta una fuente meteorológica y devuelve sus avisos vigentes y filtrados.
        Si la fuente no responde devuelve una lista vacía: nunca se inventan avisos
        (salvo con allow_simulated=True, reservado a las pruebas sin transmisión).
        """
        src_id = source_config.get("id")
        name = source_config.get("name")
        url = source_config.get("url")
        fmt = source_config.get("format", "JSON").upper()
        geo_filter = source_config.get("geographic_filter", "")
        parser_cfg = source_config.get("parser_config", {})

        area_terms = self._area_terms(geo_filter)
        if not area_terms:
            print(f"[METEO POLLING] {name}: sin zona configurada (meteoAreaFilter en config.ini). Fuente omitida.")
            return []

        print(f"[METEO POLLING] Consultando {name} (Formato: {fmt})...")

        api_key_env = source_config.get("api_key_env_var")
        api_key_val = (os.environ.get(api_key_env) if api_key_env else "") or api_key_fallback

        raw_data = None
        if not source_config.get("api_key_required"):
            raw_data = self._fetch_url(url)
        elif api_key_val:
            raw_data = self._fetch_url(url, api_key_value=api_key_val)
        else:
            print(f"[METEO POLLING] {name} requiere clave API y no hay ninguna configurada.")

        if raw_data is None:
            if not self.allow_simulated:
                return []
            print(f"[METEO POLLING] MODO SIMULACIÓN: generando avisos de ejemplo para {name}.")
            raw_data = self._generate_fallback_raw_data(src_id, fmt, geo_filter or self.area_filter.split(",")[0])

        parsed_items = []
        if fmt == "JSON":
            parsed_items = AlertParserEngine.parse_json(raw_data, parser_cfg)
        elif fmt == "XML":
            parsed_items = AlertParserEngine.parse_xml_cap(raw_data, parser_cfg)
        elif fmt == "TEXT":
            parsed_items = AlertParserEngine.parse_plaintext(raw_data, parser_cfg)

        valid_alerts = []
        seen_ids = set()
        for item in parsed_items:
            # 1. Normalizar severidad; los niveles verdes no son avisos
            severity = normalize_severity(item.get("severity", ""))
            if severity == "GREEN":
                continue

            # 2. Filtro geográfico nominal (insensible a mayúsculas y tildes)
            area = str(item.get("area", "")).strip()
            folded_area = self._fold(area)
            if not any(term in folded_area for term in area_terms):
                continue

            # 3. Descartar avisos ya caducados
            if self._is_expired(item.get("end", "")):
                continue

            # 4. Identificador estable: si la fuente no da uno, se deriva del contenido
            event = str(item.get("event") or "METEOROLOGIA ADVERSA")
            alert_id = str(item.get("id") or "").strip()
            if not alert_id or alert_id == "N/D":
                digest = hashlib.sha1(f"{event}|{area}|{item.get('start', '')}".encode("utf-8")).hexdigest()[:12]
                alert_id = f"{src_id}_{digest}"
            if alert_id in seen_ids:
                continue
            seen_ids.add(alert_id)

            valid_alerts.append({
                "source_id": src_id,
                "source_name": name,
                "id": alert_id,
                "event": event,
                "severity": severity,
                "area": area,
                "description": item.get("description", ""),
                "start": item.get("start", "N/D"),
                "end": item.get("end", "N/D"),
                "timestamp": int(datetime.now().timestamp())
            })

        return valid_alerts

    def poll_all_services(self, aemet_key="", metoffice_key=""):
        """
        Consulta secuencialmente todas las fuentes de datos meteorológicas
        habilitadas y consolida las alertas vigentes.
        """
        all_alerts = []
        for src in self.sources:
            if not src.get("enabled", True):
                continue
                
            fallback_key = ""
            if src.get("id") == "aemet":
                fallback_key = aemet_key
            elif src.get("id") == "metoffice":
                fallback_key = metoffice_key
                
            try:
                alerts = self.query_source(src, api_key_fallback=fallback_key)
                all_alerts.extend(alerts)
            except Exception as e:
                print(f"[METEO SERVICE ERROR] Falló la consulta de la fuente {src.get('name')}: {e}")
                
        return all_alerts

    def _generate_fallback_raw_data(self, source_id, fmt, geo_filter):
        """
        Avisos de EJEMPLO para pruebas. Solo se usan con allow_simulated=True
        (modo --simulate del agente, que nunca transmite): no son avisos reales.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        end_str = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        
        if source_id == "aemet":
            # Formato JSON estructurado de AEMET
            data_dict = {
                "datos": [
                    {
                        "id_aviso": f"AEMET-2026-M4321",
                        "fenomeno": "LLUVIA INTENSA Y GRANIZO",
                        "nivel": "NARANJA",
                        "ambito": f"{geo_filter or 'Comunidad de Madrid'} - Sierra",
                        "descripcion": "Acumulación de precipitación en 1h: 30 mm acompañada de ráfagas fuertes.",
                        "comienzo": now_str,
                        "final": end_str
                    },
                    {
                        "id_aviso": f"AEMET-2026-T1122",
                        "fenomeno": "RACHAS FUERTES DE VIENTO",
                        "nivel": "AMARILLO",
                        "ambito": f"{geo_filter or 'Madrid'} Metropolitana y Henares",
                        "descripcion": "Rachas de viento que pueden superar los 80 Km/h.",
                        "comienzo": now_str,
                        "final": end_str
                    }
                ]
            }
            return json.dumps(data_dict, ensure_ascii=False).encode("utf-8")
            
        elif source_id == "meteoalarm":
            # Formato CAP XML estándar
            xml_str = f"""<?xml version="1.0" encoding="utf-8"?>
            <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
                <identifier>METEOALARM-CAP-SP9981</identifier>
                <sender>meteoalarm.org</sender>
                <sent>{now_str}</sent>
                <msgType>Alert</msgType>
                <info>
                    <event>Severe Snow/Ice Alert</event>
                    <severity>Severe</severity>
                    <onset>{now_str}</onset>
                    <expires>{end_str}</expires>
                    <description>Nevadas copiosas a cotas de montaña superiores a 900 metros.</description>
                    <area>
                        <areaDesc>{geo_filter or 'Madrid Sierra'}</areaDesc>
                    </area>
                </info>
            </alert>
            """
            return xml_str.encode("utf-8")
            
        elif source_id == "dwd":
            # JSON de DWD Alemania
            dwd_dict = {
                "features": [
                    {
                        "properties": {
                            "EVENT_CODE": "DWD-8812739",
                            "EVENT": "STARKREGEN (Lluvia Intensa)",
                            "SEVERITY": "SEVERE",
                            "A_NAME": f"Stadt {geo_filter or 'München'}",
                            "DESCRIPTION": "Heavy downpour expected with risk of localized urban flooding.",
                            "ONSET": now_str,
                            "EXPIRES": end_str
                        }
                    }
                ]
            }
            return json.dumps(dwd_dict, ensure_ascii=False).encode("utf-8")
            
        elif source_id == "metoffice":
            # JSON de Met Office UK
            mo_dict = {
                "warnings": [
                    {
                        "id": "MetOffice-London-88",
                        "type": "Extreme Yellow Storm",
                        "color": "Amber",
                        "regions": f"{geo_filter or 'London'} and South East England",
                        "headline": "Thunderstorms are expected to cause travel delays and localized power outages.",
                        "start": now_str,
                        "end": end_str
                    }
                ]
            }
            return json.dumps(mo_dict, ensure_ascii=False).encode("utf-8")
            
        else: # custom_txt_service / Texto Plano
            txt_content = f"""AVISO_ID: 99121
EVENTO: TORMENTA DE NIEVE EXTREMA
SEVERIDAD: ROJO (EXTREME)
AREA: {geo_filter or 'Zona-Sur'}
DESCRIPCION: Ventisca de nieve extrema bloqueando principales puertos de paso.
"""
            return txt_content.encode("utf-8")


# ==============================================================================
# GENERADOR DE BOLETINES ESTANDARIZADOS APRS
# ==============================================================================

SEVERITY_LABELS = {"RED": "ROJO", "ORANGE": "NARANJA", "YELLOW": "AMARILLO"}


def generate_aprs_weather_bulletin(alert, bulletin_index=1):
    """
    Toma un aviso normalizado y devuelve el campo de información de un Boletín APRS:

        :BLN<N>METEO:<NIVEL> <FENOMENO> - <ZONA>

    - <N>: número correlativo del boletín (1 al 9).
    - El destinatario ocupa 9 caracteres y el texto se limita a 67, en ASCII puro,
      para que se lea en cualquier TNC o pantalla de transceptor.
    El agente añade la cabecera (indicativo, destino y ruta) al transmitir.
    """
    level = SEVERITY_LABELS.get(alert.get("severity"), "AVISO")
    event = normalize_characters(alert.get("event", ""))
    area = normalize_characters(alert.get("area", ""))
    text = f"{level} {event}"
    if area:
        # Reservar sitio para la zona recortando primero el fenómeno
        room = aprs_proto.MAX_BULLETIN_TEXT - len(level) - 4
        area = area[:24]
        event = event[:max(10, room - len(area))]
        text = f"{level} {event} - {area}"
    index = min(9, max(1, int(bulletin_index)))
    return aprs_proto.format_bulletin_info(f"BLN{index}METEO", text)


def normalize_characters(text):
    """
    Elimina tildes, diacríticos y símbolos para asegurar que la trama AX.25
    se decodifique perfectamente en cualquier TNC o pantalla LCD.
    """
    text = aprs_proto.to_ascii(text)
    text = re.sub(r'[^a-zA-Z0-9\s\-\/\_\.\:\,]', '', text)
    return re.sub(r'\s+', ' ', text).strip().upper()
