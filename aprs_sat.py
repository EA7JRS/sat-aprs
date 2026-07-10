#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
                 S.A.T-APRS
                  Sentinel
                  by EA7JRS
          Servicio de Alerta Temprana para APRS
================================================================================
Este script actúa como agente centralizado para integrar y procesar:
- gpsd: Coordenadas GNSS en tiempo real (móvil/fijo).
- ntpsec: Sincronización temporal de alta precisión de microsegundos.
- OpenWeatherMap: Obtención y formateo de datos climáticos a APRS WX.
- Sismología IGN España / USGS: Detección y filtrado Haversine (< 200 km).
- NOAA Space Weather Alerts: Boletines espaciales (Escalas G, R, S).
- Transmisión dual: Puertos APRS-IS (14580) y KISS TCP de Direwolf (8001).

Licencia: SPDX-License-Identifier: Apache-2.0
================================================================================
"""

import os
import sys
import math
import time
import socket
import json
import ssl
import configparser
from datetime import datetime, timezone, timedelta
import urllib.request
import urllib.error

# ==============================================================================
# CONFIGURACIÓN DE LA ESTACIÓN (Modificar según necesidad)
# ==============================================================================
CALLSIGN = "CALLSING-13"          # Indicativo APRS con SSID de telemetría/WX
APRS_PASSCODE = ""          # Código de autenticación para APRS-IS
FILTER_RADIUS_KM = 200.0         # Radio de cobertura crítica para sismos
OWM_API_KEY = ""                 # Tu API Key de OpenWeatherMap (Opcional)

# Configuración de Pronóstico de Clima Avanzado y Alertas Meteorológicas (WeatherAPI)
WEATHERAPI_KEY = ""              # API Key para WeatherAPI (Opcional)
WEATHER_ALERT_WIND_KTS = 25.0    # Umbral de viento fuerte en nudos (Alertas > 25 kts)
WEATHER_ALERT_TEMP_MIN_C = 0.0   # Umbral de temperatura para heladas (°C)
WEATHER_ALERT_RAIN_MM = 20.0     # Umbral de lluvia intensa acumulada diaria (mm)
WEATHER_FORECAST_DAYS = 3        # Período de pronóstico a consultar en días (1 a 3 días, 24-72h)

# Coordenadas de Fallback (Madrid) por si gpsd no tiene fijación o está inactivo
FALLBACK_LAT = 40.416775
FALLBACK_LON = -3.703790
ALTITUDE_DEFAULT_M = 657.0

# Direcciones y puertos del ecosistema local
GPSD_HOST = "localhost"
GPSD_PORT = 2947

APRS_IS_SERVER = "euro.aprs2.net"
APRS_IS_PORT = 14580

DIREWOLF_KISS_HOST = "localhost"
DIREWOLF_KISS_PORT = 8001       # Puerto KISS sobre TCP de Direwolf

# Historial local para evitar duplicados en la red APRS
transmitidos_sismos = set()     # IDs de sismos anunciados
transmitido_sw_id = None        # ID de alerta clima espacial activa
ultima_baliza_wx = 0            # Timestamp Unix de última baliza meteorológica
last_known_weather = (20.4, 52, 5.0, 230, 1015.4, 8.0, 0.0, 0.0) # Datos iniciales de fallback/operación

# Historial para alertas meteorológicas del pronóstico (evita spam diario)
transmitidas_alertas_meteo = set()
ultima_consulta_pronostico = 0

# Configuración de Clima Local y Alertas para Estación Meteorológica Personal / API Local
LOCAL_WEATHER_SOURCE = "simulated"   # Puede ser 'simulated', una URL http://..., o una ruta de archivo .json
LOCAL_THRESHOLD_WIND_KTS = 20.0     # Umbral de ráfaga/viento local
LOCAL_THRESHOLD_TEMP_MAX_C = 35.0   # Umbral de temperatura máxima local
LOCAL_THRESHOLD_TEMP_MIN_C = 5.0    # Umbral de temperatura mínima local
LOCAL_THRESHOLD_RAIN_MM = 10.0      # Umbral de lluvia local (mm)
LOCAL_WEATHER_INTERVAL = 300        # Intervalo de monitoreo local en segundos

# Historial para alertas meteorológicas locales (evita spam de boletines idénticos seguidos)
transmitidas_alertas_locales = set()
ultima_consulta_clima_local = 0
last_local_weather = (20.0, 50, 5.0, 180, 1013.2, 0.0) # temp_c, humidity, wind_kts, wind_dir, pressure, rain_mm

# ==============================================================================
# FORMULAS DE INGENIERÍA Y TRADUCTORES APRS
# ==============================================================================
def haversine(lat1, lon1, lat2, lon2):
    """
    Calcula la distancia geodésica entre dos puntos en km mediante Haversine.
    """
    R = 6371.0  # Radio del planeta Tierra en kilómetros
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(d_lat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)

def decdeg_to_aprs_lat(lat):
    """
    Convierte latitud decimal (Ej: 40.416) a formato APRS (Ej: 4025.00N).
    """
    direction = 'N' if lat >= 0 else 'S'
    val = abs(lat)
    deg = int(val)
    minutes = (val - deg) * 60.0
    return f"{deg:02d}{minutes:05.2f}{direction}"

def decdeg_to_aprs_lon(lon):
    """
    Convierte longitud decimal (Ej: -3.703) a formato APRS (Ej: 00342.18W).
    """
    direction = 'E' if lon >= 0 else 'W'
    val = abs(lon)
    deg = int(val)
    minutes = (val - deg) * 60.0
    return f"{deg:03d}{minutes:05.2f}{direction}"

def format_aprs_wx_payload(temp_c, humidity, wind_speed_kts, wind_dir_deg, pressure_hpa, gust_kts, rain_1h_in=0.0, rain_24h_in=0.0):
    """
    Crea el payload de clima exacto bajo las especificaciones de APRS WX.
    Estructura: ccrrgggttthhbbbbbpPPPrr
    """
    wdir = f"{int(wind_dir_deg):03d}" if wind_dir_deg is not None else "000"
    wspeed = f"{int(wind_speed_kts):03d}" if wind_speed_kts is not None else "000"
    
    gust = f"g{int(gust_kts):03d}" if gust_kts else "g000"
    
    # Temperatura Fahrenheit
    temp_f = int((temp_c * 9/5) + 32)
    if temp_f < 0:
        temp_str = f"t-{abs(temp_f):02d}"  # Manejo de bajo cero
    else:
        temp_str = f"t{temp_f:03d}"
        
    # Precipitaciones
    r1h = f"r{int(rain_1h_in * 100):03d}"
    r24h = f"p{int(rain_24h_in * 100):03d}"
    
    # Humedad (00 representa 100%)
    hum_val = int(humidity)
    if hum_val >= 100:
        hum_val = 0
    hum = f"h{hum_val:02d}"
    
    # Presión en décimas de hPa/milibar
    press = f"b{int(pressure_hpa * 10):05d}" if pressure_hpa else "b00000"
    
    return f"_{wdir}/{wspeed}{gust}{temp_str}{r1h}{r24h}{hum}{press} (REMER S.A.T. Telemetria)"

# ==============================================================================
# DRIVERS DE CONSULTA POR HARDWARE Y API (Sockets locales / HTTP)
# ==============================================================================
def sync_local_config():
    """
    Carga dinámicamente la configuración desde el archivo externo config.ini (formato INI estándar).
    Si no existe el archivo config.ini, se genera automáticamente basándose en sat_config.json
    o en los valores predeterminados de la estación para asegurar alta disponibilidad.
    """
    global CALLSIGN, APRS_PASSCODE, FILTER_RADIUS_KM, OWM_API_KEY, FALLBACK_LAT, FALLBACK_LON, ALTITUDE_DEFAULT_M
    global GPSD_HOST, GPSD_PORT, APRS_IS_SERVER, APRS_IS_PORT, DIREWOLF_KISS_HOST, DIREWOLF_KISS_PORT
    global WEATHERAPI_KEY, WEATHER_ALERT_WIND_KTS, WEATHER_ALERT_TEMP_MIN_C, WEATHER_ALERT_RAIN_MM, WEATHER_FORECAST_DAYS
    global LOCAL_WEATHER_SOURCE, LOCAL_THRESHOLD_WIND_KTS, LOCAL_THRESHOLD_TEMP_MAX_C, LOCAL_THRESHOLD_TEMP_MIN_C, LOCAL_THRESHOLD_RAIN_MM, LOCAL_WEATHER_INTERVAL
    
    ini_path = "config.ini"
    json_path = "sat_config.json"
    
    # 1. Fallback secundario opcional a rutas absolutas si se ejecuta desde subdirectorios
    if not os.path.exists(ini_path):
        ini_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.ini")
    if not os.path.exists(json_path):
        json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sat_config.json")
        
    # Leer sat_config.json para obtener los valores más actualizados de la UI si config.ini no existe aún
    ui_cfg = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as jf:
                ui_cfg = json.load(jf)
        except Exception:
            pass

    # 2. Si config.ini no existe, crearlo con valores por defecto y del panel Web
    if not os.path.exists(ini_path):
        try:
            config = configparser.ConfigParser()
            config["GPSD"] = {
                "host": str(GPSD_HOST),
                "port": str(ui_cfg.get("gpsdPort", GPSD_PORT))
            }
            config["OpenWeatherMap"] = {
                "apiKey": str(ui_cfg.get("owmApiKey", OWM_API_KEY))
            }
            config["WeatherAPI"] = {
                "apiKey": str(ui_cfg.get("weatherApiKey", WEATHERAPI_KEY)),
                "thresholdWindKts": str(ui_cfg.get("thresholdWindKts", WEATHER_ALERT_WIND_KTS)),
                "thresholdTempMinC": str(ui_cfg.get("thresholdTempMinC", WEATHER_ALERT_TEMP_MIN_C)),
                "thresholdRainMm": str(ui_cfg.get("thresholdRainMm", WEATHER_ALERT_RAIN_MM)),
                "forecastDays": str(ui_cfg.get("forecastDays", WEATHER_FORECAST_DAYS))
            }
            config["LocalWeather"] = {
                "source": str(ui_cfg.get("localWeatherSource", LOCAL_WEATHER_SOURCE)),
                "thresholdWindKts": str(ui_cfg.get("localThresholdWindKts", LOCAL_THRESHOLD_WIND_KTS)),
                "thresholdTempMaxC": str(ui_cfg.get("localThresholdTempMaxC", LOCAL_THRESHOLD_TEMP_MAX_C)),
                "thresholdTempMinC": str(ui_cfg.get("localThresholdTempMinC", LOCAL_THRESHOLD_TEMP_MIN_C)),
                "thresholdRainMm": str(ui_cfg.get("localThresholdRainMm", LOCAL_THRESHOLD_RAIN_MM)),
                "interval": str(ui_cfg.get("localWeatherInterval", LOCAL_WEATHER_INTERVAL))
            }
            config["Fallback"] = {
                "latitude": str(ui_cfg.get("fallbackLat", FALLBACK_LAT)),
                "longitude": str(ui_cfg.get("fallbackLon", FALLBACK_LON)),
                "altitude": str(ALTITUDE_DEFAULT_M)
            }
            config["Alerts"] = {
                "filterRadiusKm": str(ui_cfg.get("filterRadiusKm", FILTER_RADIUS_KM))
            }
            config["APRS"] = {
                "callsign": str(ui_cfg.get("callsign", CALLSIGN)),
                "passcode": str(ui_cfg.get("aprsPasscode", APRS_PASSCODE)),
                "serverIp": str(ui_cfg.get("serverIp", APRS_IS_SERVER)),
                "serverPort": str(ui_cfg.get("aprscPort", APRS_IS_PORT)),
                "kissTcpHost": DIREWOLF_KISS_HOST,
                "kissTcpPort": str(ui_cfg.get("kissTcpPort", DIREWOLF_KISS_PORT))
            }
            with open(ini_path, "w", encoding="utf-8") as f:
                f.write("# S.A.T-APRS - Archivo de Configuracion Externa de la Estacion\n")
                f.write("# Generado automaticamente para simplificar la gestion de parametros de hardware y red.\n\n")
                config.write(f)
        except Exception as e:
            print(f"[CONFIG WARNING] No se pudo autogenerar config.ini: {e}")

    # 3. Leer valores desde config.ini de forma prioritaria
    if os.path.exists(ini_path):
        try:
            config = configparser.ConfigParser()
            config.read(ini_path, encoding="utf-8")
            
            # Cargar seccion GPSD
            if "GPSD" in config:
                GPSD_HOST = config["GPSD"].get("host", GPSD_HOST)
                GPSD_PORT = config["GPSD"].getint("port", GPSD_PORT)
                
            # Cargar seccion OpenWeatherMap
            if "OpenWeatherMap" in config:
                OWM_API_KEY = config["OpenWeatherMap"].get("apiKey", OWM_API_KEY)
                
            # Cargar seccion WeatherAPI
            if "WeatherAPI" in config:
                WEATHERAPI_KEY = config["WeatherAPI"].get("apiKey", WEATHERAPI_KEY)
                WEATHER_ALERT_WIND_KTS = config["WeatherAPI"].getfloat("thresholdWindKts", WEATHER_ALERT_WIND_KTS)
                WEATHER_ALERT_TEMP_MIN_C = config["WeatherAPI"].getfloat("thresholdTempMinC", WEATHER_ALERT_TEMP_MIN_C)
                WEATHER_ALERT_RAIN_MM = config["WeatherAPI"].getfloat("thresholdRainMm", WEATHER_ALERT_RAIN_MM)
                WEATHER_FORECAST_DAYS = config["WeatherAPI"].getint("forecastDays", WEATHER_FORECAST_DAYS)
                
            # Cargar seccion LocalWeather
            if "LocalWeather" in config:
                LOCAL_WEATHER_SOURCE = config["LocalWeather"].get("source", LOCAL_WEATHER_SOURCE)
                LOCAL_THRESHOLD_WIND_KTS = config["LocalWeather"].getfloat("thresholdWindKts", LOCAL_THRESHOLD_WIND_KTS)
                LOCAL_THRESHOLD_TEMP_MAX_C = config["LocalWeather"].getfloat("thresholdTempMaxC", LOCAL_THRESHOLD_TEMP_MAX_C)
                LOCAL_THRESHOLD_TEMP_MIN_C = config["LocalWeather"].getfloat("thresholdTempMinC", LOCAL_THRESHOLD_TEMP_MIN_C)
                LOCAL_THRESHOLD_RAIN_MM = config["LocalWeather"].getfloat("thresholdRainMm", LOCAL_THRESHOLD_RAIN_MM)
                LOCAL_WEATHER_INTERVAL = config["LocalWeather"].getint("interval", LOCAL_WEATHER_INTERVAL)
                
            # Cargar seccion Fallback
            if "Fallback" in config:
                FALLBACK_LAT = config["Fallback"].getfloat("latitude", FALLBACK_LAT)
                FALLBACK_LON = config["Fallback"].getfloat("longitude", FALLBACK_LON)
                ALTITUDE_DEFAULT_M = config["Fallback"].getfloat("altitude", ALTITUDE_DEFAULT_M)
                
            # Cargar seccion Alerts
            if "Alerts" in config:
                FILTER_RADIUS_KM = config["Alerts"].getfloat("filterRadiusKm", FILTER_RADIUS_KM)
                
            # Cargar seccion APRS
            if "APRS" in config:
                CALLSIGN = config["APRS"].get("callsign", CALLSIGN)
                APRS_PASSCODE = config["APRS"].get("passcode", APRS_PASSCODE)
                APRS_IS_SERVER = config["APRS"].get("serverIp", APRS_IS_SERVER)
                APRS_IS_PORT = config["APRS"].getint("serverPort", APRS_IS_PORT)
                DIREWOLF_KISS_HOST = config["APRS"].get("kissTcpHost", DIREWOLF_KISS_HOST)
                DIREWOLF_KISS_PORT = config["APRS"].getint("kissTcpPort", DIREWOLF_KISS_PORT)
                
        except Exception as e:
            print(f"[CONFIG WARNING] Error al leer config.ini ({e}). Utilizando fallback.")
            if ui_cfg:
                _apply_ui_config(ui_cfg)

def _apply_ui_config(cfg):
    global CALLSIGN, APRS_PASSCODE, FILTER_RADIUS_KM, OWM_API_KEY, FALLBACK_LAT, FALLBACK_LON
    global GPSD_PORT, APRS_IS_SERVER, APRS_IS_PORT, DIREWOLF_KISS_PORT
    global WEATHERAPI_KEY, WEATHER_ALERT_WIND_KTS, WEATHER_ALERT_TEMP_MIN_C, WEATHER_ALERT_RAIN_MM, WEATHER_FORECAST_DAYS
    global LOCAL_WEATHER_SOURCE, LOCAL_THRESHOLD_WIND_KTS, LOCAL_THRESHOLD_TEMP_MAX_C, LOCAL_THRESHOLD_TEMP_MIN_C, LOCAL_THRESHOLD_RAIN_MM, LOCAL_WEATHER_INTERVAL
    
    if "callsign" in cfg and cfg["callsign"]:
        CALLSIGN = str(cfg["callsign"])
    if "aprsPasscode" in cfg and cfg["aprsPasscode"]:
        APRS_PASSCODE = str(cfg["aprsPasscode"])
    if "filterRadiusKm" in cfg and cfg["filterRadiusKm"] is not None:
        FILTER_RADIUS_KM = float(cfg["filterRadiusKm"])
    if "owmApiKey" in cfg:
        OWM_API_KEY = str(cfg["owmApiKey"])
    if "weatherApiKey" in cfg:
        WEATHERAPI_KEY = str(cfg["weatherApiKey"])
    if "thresholdWindKts" in cfg and cfg["thresholdWindKts"] is not None:
        WEATHER_ALERT_WIND_KTS = float(cfg["thresholdWindKts"])
    if "thresholdTempMinC" in cfg and cfg["thresholdTempMinC"] is not None:
        WEATHER_ALERT_TEMP_MIN_C = float(cfg["thresholdTempMinC"])
    if "thresholdRainMm" in cfg and cfg["thresholdRainMm"] is not None:
        WEATHER_ALERT_RAIN_MM = float(cfg["thresholdRainMm"])
    if "forecastDays" in cfg and cfg["forecastDays"] is not None:
        WEATHER_FORECAST_DAYS = int(cfg["forecastDays"])
    if "localWeatherSource" in cfg and cfg["localWeatherSource"]:
        LOCAL_WEATHER_SOURCE = str(cfg["localWeatherSource"])
    if "localThresholdWindKts" in cfg and cfg["localThresholdWindKts"] is not None:
        LOCAL_THRESHOLD_WIND_KTS = float(cfg["localThresholdWindKts"])
    if "localThresholdTempMaxC" in cfg and cfg["localThresholdTempMaxC"] is not None:
        LOCAL_THRESHOLD_TEMP_MAX_C = float(cfg["localThresholdTempMaxC"])
    if "localThresholdTempMinC" in cfg and cfg["localThresholdTempMinC"] is not None:
        LOCAL_THRESHOLD_TEMP_MIN_C = float(cfg["localThresholdTempMinC"])
    if "localThresholdRainMm" in cfg and cfg["localThresholdRainMm"] is not None:
        LOCAL_THRESHOLD_RAIN_MM = float(cfg["localThresholdRainMm"])
    if "localWeatherInterval" in cfg and cfg["localWeatherInterval"] is not None:
        LOCAL_WEATHER_INTERVAL = int(cfg["localWeatherInterval"])
    if "fallbackLat" in cfg and cfg["fallbackLat"] is not None:
        FALLBACK_LAT = float(cfg["fallbackLat"])
    if "fallbackLon" in cfg and cfg["fallbackLon"] is not None:
        FALLBACK_LON = float(cfg["fallbackLon"])
    if "serverIp" in cfg and cfg["serverIp"]:
        APRS_IS_SERVER = str(cfg["serverIp"])
    if "aprscPort" in cfg and cfg["aprscPort"] is not None:
        APRS_IS_PORT = int(cfg["aprscPort"])
    if "kissTcpPort" in cfg and cfg["kissTcpPort"] is not None:
        DIREWOLF_KISS_PORT = int(cfg["kissTcpPort"])

def get_gpsd_coordinates():
    """
    Establece conexión TCP con el socket de gpsd local (puerto 2947)
    y decodifica la trama TPV para extraer coordenadas en tiempo real.
    Garantiza el cierre seguro de los sockets para evitar fugas de puertos.
    """
    print("[GPSD] Extrayendo coordenadas GNSS en tiempo real...")
    s = None
    f = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect((GPSD_HOST, GPSD_PORT))
        
        # Leer el mensaje de bienvenida de gpsd de forma segura
        f = s.makefile('r', encoding='utf-8', errors='ignore')
        f.readline()
        
        # Activar el streaming de JSON con gpsd
        s.sendall(b'?WATCH={"enable":true,"json":true};')
        
        # Esperar buscando el reporte de posición (TPV)
        for _ in range(10):
            line = f.readline()
            if not line:
                break
            try:
                trama = json.loads(line.strip())
                if trama.get("class") == "TPV":
                    lat = trama.get("lat")
                    lon = trama.get("lon")
                    alt = trama.get("alt", ALTITUDE_DEFAULT_M)
                    mode = trama.get("mode", 1) # 2=2D, 3=3D
                    if lat and lon:
                        print(f"[GPSD] Posición fijada con éxito: {lat}, {lon} (Modo: {mode})")
                        return lat, lon, alt, False
            except json.JSONDecodeError:
                continue
    except Exception as e:
        print(f"[GPSD WARNING] Fallo de conexión o lectura en puerto {GPSD_PORT} ({e}). Utilizando fallback estático.")
    finally:
        if f:
            try:
                f.close()
            except Exception:
                pass
        if s:
            try:
                s.close()
            except Exception:
                pass
    
    return FALLBACK_LAT, FALLBACK_LON, ALTITUDE_DEFAULT_M, True

def get_weather_data(lat, lon):
    """
    Consulta OpenWeatherMap utilizando HTTP con reintentos y backoff exponencial.
    Retorna estructura formateada. Si falla, usa los últimos datos conocidos (last_known_weather).
    """
    global last_known_weather
    if not OWM_API_KEY:
        # Clima por desajuste estático de simulación si no hay API Key
        print("[OWM] Sin API Key de OpenWeatherMap. Simulando clima estático de operación.")
        return last_known_weather
        
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OWM_API_KEY}&units=metric"
    
    max_retries = 3
    delay = 2.0  # Retardo inicial en segundos
    
    for attempt in range(1, max_retries + 1):
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            req = urllib.request.Request(url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=5) as response:
                data = json.loads(response.read().decode('utf-8'))
                temp_c = data["main"]["temp"]
                humidity = data["main"]["humidity"]
                wind_speed_ms = data["wind"]["speed"]
                wind_speed_kts = wind_speed_ms * 1.94384
                wind_dir = data["wind"].get("deg", 0)
                pressure = data["main"]["pressure"]
                gust_ms = data["wind"].get("gust", wind_speed_ms * 1.2)
                gust_kts = gust_ms * 1.94384
                
                rain_1h = data.get("rain", {}).get("1h", 0) / 25.4 # mm a pulgadas
                rain_24h = data.get("rain", {}).get("3h", 0) / 25.4 * 8 # aproximación de 3h a 24h
                
                # Guardar en el historial de últimos datos conocidos con éxito
                last_known_weather = (temp_c, humidity, wind_speed_kts, wind_dir, pressure, gust_kts, rain_1h, rain_24h)
                print(f"[OWM SUCCESS] Consulta realizada con éxito en el intento {attempt}.")
                return last_known_weather
                
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            # Captura excepciones de red y protocolo HTTP
            print(f"[OWM WARNING] Error de red/protocolo (HTTP/URL) en intento {attempt}/{max_retries}: {e}")
        except socket.timeout as e:
            # Captura excepciones de tiempo de espera (timeout)
            print(f"[OWM WARNING] Error de tiempo de espera (Timeout) en intento {attempt}/{max_retries}: {e}")
        except Exception as e:
            # Captura cualquier otra excepción (incluyendo requests.exceptions si se hubiese importado)
            print(f"[OWM WARNING] Excepción inesperada en intento {attempt}/{max_retries}: {e}")
            
        if attempt < max_retries:
            print(f"[OWM RETRY] Reintentando consulta en {delay} segundos...")
            time.sleep(delay)
            delay *= 2  # Backoff exponencial
            
    print("[OWM WARNING CRÍTICO] Todos los reintentos a OpenWeatherMap fallaron. Utilizando últimos datos climáticos conocidos.")
    return last_known_weather

def get_weatherapi_forecast(lat, lon):
    """
    Consulta WeatherAPI.com para obtener el pronóstico de 24-72 horas.
    Compara las métricas con umbrales personalizables y extrae alertas severas gubernamentales si existen.
    Si no hay API Key configurada, simula el pronóstico con datos operacionales realistas para demostración.
    """
    global WEATHERAPI_KEY, WEATHER_ALERT_WIND_KTS, WEATHER_ALERT_TEMP_MIN_C, WEATHER_ALERT_RAIN_MM, WEATHER_FORECAST_DAYS
    
    # Lista de alertas detectadas
    alertas_detectadas = []
    
    if not WEATHERAPI_KEY:
        # Simulador de pronóstico para demostración operativa en ausencia de clave
        print("[WeatherAPI] Sin API Key de WeatherAPI. Ejecutando simulador de pronóstico severo para pruebas.")
        # Generamos una alerta simulada basada en el día actual para validar la inyección APRS
        # Simulamos vientos fuertes de 28.5 nudos y heladas de -1.5 C en las próximas 48h
        alertas_detectadas.append({
            "tipo": "VIENTO_FUERTE",
            "valor": 28.5,
            "umbral": WEATHER_ALERT_WIND_KTS,
            "tiempo_h": 24,
            "mensaje": f"PREVISTO VIENTO MAX 28.5KTS EN 24H (UMBRAL: {WEATHER_ALERT_WIND_KTS}KTS)"
        })
        alertas_detectadas.append({
            "tipo": "HELADA",
            "valor": -1.5,
            "umbral": WEATHER_ALERT_TEMP_MIN_C,
            "tiempo_h": 48,
            "mensaje": f"PREVISTA HELADA MIN -1.5C EN 48H (UMBRAL: {WEATHER_ALERT_TEMP_MIN_C}C)"
        })
        return alertas_detectadas

    # URL oficial de Forecast API con alertas habilitadas
    url = f"https://api.weatherapi.com/v1/forecast.json?key={WEATHERAPI_KEY}&q={lat},{lon}&days={WEATHER_FORECAST_DAYS}&aqi=no&alerts=yes"
    
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=8) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            # 1. Analizar alertas meteorológicas oficiales/gubernamentales devueltas por la API
            alerts_section = data.get("alerts", {})
            alerts_list = alerts_section.get("alert", [])
            for alert in alerts_list:
                event = alert.get("event", "Alerta Meteorológica")
                severity = alert.get("severity", "Moderate")
                desc_short = alert.get("headline", event)
                
                alertas_detectadas.append({
                    "tipo": "OFICIAL",
                    "valor": severity,
                    "umbral": "N/D",
                    "tiempo_h": 24,
                    "mensaje": f"ALERTA OFICIAL: {event} ({severity}) - {desc_short[:30]}"
                })
            
            # 2. Analizar el pronóstico diario buscando transgresiones de umbrales
            forecast_days = data.get("forecast", {}).get("forecastday", [])
            for idx, f_day in enumerate(forecast_days):
                date_str = f_day.get("date", "")
                day_data = f_day.get("day", {})
                
                # Horas proyectadas aproximadas
                proy_horas = (idx + 1) * 24
                
                # A. Comprobar viento fuerte
                maxwind_kph = day_data.get("maxwind_kph", 0.0)
                maxwind_kts = maxwind_kph * 0.539957  # kph a nudos
                if maxwind_kts >= WEATHER_ALERT_WIND_KTS:
                    alertas_detectadas.append({
                        "tipo": "VIENTO_FUERTE",
                        "valor": round(maxwind_kts, 1),
                        "umbral": WEATHER_ALERT_WIND_KTS,
                        "tiempo_h": proy_horas,
                        "mensaje": f"VIENTO PREVISTO {round(maxwind_kts, 1)}KTS EN {proy_horas}H ({date_str})"
                    })
                
                # B. Comprobar heladas
                mintemp_c = day_data.get("mintemp_c", 10.0)
                if mintemp_c <= WEATHER_ALERT_TEMP_MIN_C:
                    alertas_detectadas.append({
                        "tipo": "HELADA",
                        "valor": mintemp_c,
                        "umbral": WEATHER_ALERT_TEMP_MIN_C,
                        "tiempo_h": proy_horas,
                        "mensaje": f"HELADA PREVISTA {mintemp_c}C EN {proy_horas}H ({date_str})"
                    })
                
                # C. Comprobar lluvias torrenciales/precipitación acumulada
                totalprecip_mm = day_data.get("totalprecip_mm", 0.0)
                if totalprecip_mm >= WEATHER_ALERT_RAIN_MM:
                    alertas_detectadas.append({
                        "tipo": "TORMENTA",
                        "valor": totalprecip_mm,
                        "umbral": WEATHER_ALERT_RAIN_MM,
                        "tiempo_h": proy_horas,
                        "mensaje": f"LLUVIA ACUM PREVISTA {totalprecip_mm}MM EN {proy_horas}H ({date_str})"
                    })
                    
            print(f"[WeatherAPI SUCCESS] Pronóstico analizado correctamente. Alertas generadas: {len(alertas_detectadas)}")
    except Exception as e:
        print(f"[WeatherAPI WARNING] Error al consultar pronóstico en WeatherAPI ({e})")
        
    return alertas_detectadas

def query_ign_earthquakes(station_lat, station_lon):
    """
    Consulta la sismología nacional del Instituto Geográfico Nacional de España.
    Aplica Haversine y filtra eventos significativos dentro de los 200 km.
    """
    print("[IGN] Analizando actividad geológica reciente...")
    eventos_detectados = []
    
    # URL de sismos oficial de España (FDSN Event Web Service)
    url_ign = "https://institucionales.ign.es/fdsnws/event/1/query?format=geojson&limit=15&minmagnitude=1.0"
    
    # Fallback seguro en caso de corte en la intranet institucional (USGS regionalizador)
    url_usgs_fallback = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=34&maxlatitude=44&minlongitude=-10&maxlongitude=5&limit=15&minmagnitude=1.0"
    
    json_bytes = None
    source = "IGN España"
    
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url_ign, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
            json_bytes = response.read()
    except Exception as e:
        print(f"[IGN WARNING] Falló consulta al IGN ({e}). Intentando fallback de USGS...")
        try:
            req = urllib.request.Request(url_usgs_fallback, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
                json_bytes = response.read()
                source = "USGS Fallback"
        except Exception as ex:
            print(f"[SISMOS CRITICAL ERROR] No fue posible contactar a ningún servidor geológico ({ex})")
            return []

    if json_bytes:
        try:
            data = json.loads(json_bytes.decode('utf-8'))
            for feature in data.get("features", []):
                geom = feature.get("geometry", {})
                props = feature.get("properties", {})
                
                coords = geom.get("coordinates", [])
                if len(coords) < 2: continue
                
                lon = coords[0]
                lat = coords[1]
                depth = coords[2] if len(coords) > 2 else 0
                mag = props.get("mag", 0.0)
                place = props.get("place", "Península Ibérica")
                eq_id = feature.get("id") or props.get("code") or str(props.get("time"))
                
                # Aplicar fórmula Haversine
                dist = haversine(station_lat, station_lon, lat, lon)
                
                if dist <= FILTER_RADIUS_KM:
                    print(f"  [ALERT] SISMO EN RANGO - {place} - M{mag} a {dist}km del nodo!")
                    eventos_detectados.append({
                        "id": eq_id,
                        "time": props.get("time") / 1000 if props.get("time") else time.time(),
                        "latitude": lat,
                        "longitude": lon,
                        "depth": depth,
                        "magnitude": mag,
                        "place": place,
                        "distance": dist
                    })
        except Exception as e:
            print(f"[SISMOS] Error al decodificar la trama geojson ({e})")
            
    return eventos_detectados

def query_noaa_space_weather():
    """
    Monitorea eventos severos de clima espacial de la NOAA (X-ray, Geomagnéticos).
    Filtra y emite Boletines de Emergencia en escalas críticas G, R, S.
    """
    print("[NOAA] Analizando el espectro ionosférico y solar de la NOAA...")
    url_noaa = "https://services.swpc.noaa.gov/products/alerts.json"
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url_noaa, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=5) as response:
            alerts = json.loads(response.read().decode('utf-8'))
            for item in alerts:
                message = item.get("message", "")
                
                # Expresión regular para capturar G-Scale, R-Scale o S-Scale
                # E.g., "Geomagnetic Storm Category G4", "Radio Blackout R3", etc.
                import re
                match = re.search(r'(Geomagnetic Storm|Solar Radiation Storm|Radio Blackout) (Level |Scale )?([G|R|S])([2-5])', message, re.IGNORECASE)
                if match:
                    scale = match.group(3).upper() # G, R, o S
                    level = int(match.group(4))    # Nivel (2 a 5)
                    issue_time = item.get("issue_datetime", "")
                    
                    # Filtramos de nivel 3 o superior para alertas críticas de REMER/Amateur
                    if level >= 3:
                        desc = "TORMENTA GEOMAGNETICA EXTREMA" if scale == 'G' else "APAGON RADIO HF EXTREMO" if scale == 'R' else "TORMENTA RADIACION FUERTE"
                        return {
                            "id": f"{scale}{level}_{issue_time.split()[0]}",
                            "scale": scale,
                            "level": level,
                            "time": issue_time,
                            "desc": desc,
                            "raw": message[:100]
                        }
    except Exception as e:
        print(f"[NOAA WARNING] Error consultando clima espacial NOAA ({e})")
    return None

def obtener_indice_gfz(index_name):
    """
    Descarga los índices Hp30 o Hp60 del GFZ Potsdam para el rango de hoy/ayer.
    Retorna una lista de diccionarios ordenada por tiempo.
    """
    try:
        import urllib.parse
        ahora = datetime.now(timezone.utc)
        ayer = ahora - timedelta(days=1)

        start_str = ayer.strftime("%Y-%m-%dT00:00:00Z")
        end_str = ahora.strftime("%Y-%m-%dT23:59:59Z")

        params = {"start": start_str, "end": end_str, "index": index_name}
        url = f"https://kp.gfz.de/app/json/?{urllib.parse.urlencode(params)}"

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
            res_json = json.loads(response.read().decode('utf-8'))
            datetimes = res_json.get("datetime", [])
            values = res_json.get(index_name, [])

            df_list = []
            for dt_str, val in zip(datetimes, values):
                if val is not None:
                    cleaned = dt_str.replace("Z", "")
                    dt_obj = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
                    df_list.append({"time_tag": dt_obj, index_name: float(val)})
            return sorted(df_list, key=lambda x: x["time_tag"])
    except Exception as e:
        print(f"[GFZ WARNING] Error al descargar {index_name} desde GFZ: {e}")
        return []

def parse_noaa_json_list_of_lists(data, required_cols):
    if not isinstance(data, list) or len(data) < 2:
        return []
    headers = data[0]
    rows = data[1:]
    col_indices = {}
    for col in required_cols:
        col_indices[col] = -1
        for idx, h in enumerate(headers):
            if h.lower() == col.lower() or h.lower() == f"proton_{col.lower()}":
                col_indices[col] = idx
                break
    time_idx = col_indices.get("time_tag", -1)
    if time_idx == -1:
        for idx, h in enumerate(headers):
            if 'time' in h.lower():
                time_idx = idx
                col_indices["time_tag"] = idx
                break
    if time_idx == -1:
        return []
    parsed_rows = []
    for row in rows:
        if not isinstance(row, list) or len(row) <= max(col_indices.values()):
            continue
        try:
            raw_time = row[time_idx]
            if not raw_time:
                continue
            cleaned_time = raw_time.strip()
            if "T" in cleaned_time:
                cleaned_time = cleaned_time.replace("Z", "")
                if "." in cleaned_time:
                    dt_obj = datetime.strptime(cleaned_time.split(".")[0], "%Y-%m-%dT%H:%M:%S")
                else:
                    dt_obj = datetime.strptime(cleaned_time, "%Y-%m-%dT%H:%M:%S")
            else:
                if "." in cleaned_time:
                    dt_obj = datetime.strptime(cleaned_time.split(".")[0], "%Y-%m-%d %H:%M:%S")
                else:
                    dt_obj = datetime.strptime(cleaned_time, "%Y-%m-%d %H:%M:%S")
            dt_obj = dt_obj.replace(tzinfo=timezone.utc)
            item = {"time_tag": dt_obj}
            for col, idx in col_indices.items():
                if col == "time_tag":
                    continue
                val = row[idx]
                item[col] = float(val) if (val is not None and val != "") else None
            parsed_rows.append(item)
        except Exception:
            continue
    return sorted(parsed_rows, key=lambda x: x["time_tag"])

def parse_noaa_json_flexible(data, required_cols):
    if not isinstance(data, list) or len(data) == 0:
        return []
    if isinstance(data[0], list):
        return parse_noaa_json_list_of_lists(data, required_cols)
    parsed_rows = []
    for row in data:
        if not isinstance(row, dict):
            continue
        raw_time = None
        for k in ["time_tag", "time", "datetime"]:
            if k in row:
                raw_time = row[k]
                break
        if not raw_time:
            continue
        try:
            cleaned_time = str(raw_time).strip()
            if "T" in cleaned_time:
                cleaned_time = cleaned_time.replace("Z", "")
                if "." in cleaned_time:
                    dt_obj = datetime.strptime(cleaned_time.split(".")[0], "%Y-%m-%dT%H:%M:%S")
                else:
                    dt_obj = datetime.strptime(cleaned_time, "%Y-%m-%dT%H:%M:%S")
            else:
                if "." in cleaned_time:
                    dt_obj = datetime.strptime(cleaned_time.split(".")[0], "%Y-%m-%d %H:%M:%S")
                else:
                    dt_obj = datetime.strptime(cleaned_time, "%Y-%m-%d %H:%M:%S")
            dt_obj = dt_obj.replace(tzinfo=timezone.utc)
            item = {"time_tag": dt_obj}
            for col in required_cols:
                if col == "time_tag":
                    continue
                val = None
                for k in [col, col.lower(), col.upper(), "proton_" + col, "proton_" + col.lower()]:
                    if k in row:
                        val = row[k]
                        break
                item[col] = float(val) if (val is not None and val != "") else None
            parsed_rows.append(item)
        except Exception:
            continue
    return sorted(parsed_rows, key=lambda x: x["time_tag"])

def obtener_pronostico_3h():
    """Descarga el reporte de NOAA y extrae el valor Kp esperado para las próximas 3 horas."""
    try:
        import urllib.request
        import ssl
        import re
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request("https://services.swpc.noaa.gov/text/3-day-forecast.txt", headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
            texto = response.read().decode('utf-8', errors='ignore')
            
        lineas = texto.split("\n")

        # Buscar la tabla de desglose de Kp
        inicio_tabla = -1
        for i, linea in enumerate(lineas):
            if "NOAA Kp index breakdown" in linea:
                inicio_tabla = i
                break

        if inicio_tabla != -1:
            # Determinar qué bloque de 3 horas UTC corresponde al momento actual
            from datetime import datetime, timezone
            hora_utc = datetime.now(timezone.utc).hour
            bloques_dict = {
                (0, 3): "00-03UT",
                (3, 6): "03-06UT",
                (6, 9): "06-09UT",
                (9, 12): "09-12UT",
                (12, 15): "12-15UT",
                (15, 18): "15-18UT",
                (18, 21): "18-21UT",
                (21, 24): "21-00UT",
            }

            bloque_actual_str = "00-03UT"
            for (start, end), label in bloques_dict.items():
                if start <= hora_utc < end:
                    # Queremos las próximas 3 horas, tomamos el siguiente bloque
                    proximo_bloque_hora = end if end < 24 else 0
                    for (s_next, e_next), label_next in bloques_dict.items():
                        if s_next <= proximo_bloque_hora < e_next:
                            bloque_actual_str = label_next
                            break
                    break

            # Buscar la línea del rango horario en la tabla
            for j in range(inicio_tabla, inicio_tabla + 15):
                if j < len(lineas) and bloque_actual_str in lineas[j]:
                    valores = re.findall(r"\d+\.\d+|\d+", lineas[j])
                    if valores:
                        # El primer valor corresponde al día de hoy
                        return f"{valores[0]} Kp ({bloque_actual_str} UTC)"
        return "No disponible en este bloque"
    except Exception as e:
        return f"Error al parsear el pronóstico ({e})"

def calculate_uv_index(sfi, lat, lon):
    """Calcula una aproximación del Índice UV Solar Global (IUV) basándose en coordenadas dinámicas."""
    try:
        now = datetime.utcnow()
        day_of_year = now.timetuple().tm_yday
        declination = 23.45 * math.sin(math.radians((360 / 365) * (284 + day_of_year)))
        
        hour_angle = (now.hour + now.minute/60 + lon/15 - 12) * 15
        
        sin_elevation = (math.sin(math.radians(lat)) * math.sin(math.radians(declination)) + 
                         math.cos(math.radians(lat)) * math.cos(math.radians(declination)) * math.cos(math.radians(hour_angle)))
        
        elevation = math.asin(max(-1.0, min(1.0, sin_elevation)))
        elevation_deg = math.degrees(elevation)
        
        if elevation_deg <= 0:
            return 0.0
            
        base_uv = 12.5 * math.sin(elevation)
        sfi_factor = 1.0 + ((float(sfi) - 70) / 200) if isinstance(sfi, (int, float)) else 1.0
        
        return max(0.0, round(base_uv * min(1.2, sfi_factor), 1))
    except Exception:
        return 0.0

def get_uv_category_and_colors(uv_val):
    """Retorna categoría, Pantone, RGB y código Hexadecimal para un índice UV dado."""
    try:
        val = float(uv_val)
    except Exception:
        val = 0.0
        
    if val <= 2:
        return "Bajo", "PMS 375", "(142, 211, 0)", "#8ED300"
    elif val <= 5:
        return "Moderado", "PMS 102", "(255, 242, 0)", "#FFF200"
    elif val <= 7:
        return "Alto", "PMS 151", "(255, 127, 0)", "#FF7F00"
    elif val <= 10:
        return "Muy Alto", "PMS 032", "(238, 28, 37)", "#EE1C25"
    else:
        return "Extremadamente Alto", "PMS 265", "(146, 75, 159)", "#924B9F"

def get_noaa_scales(xray_flux, proton_flux, kp):
    """Determina los niveles de las escalas R, S y G de la NOAA."""
    r_scale = "R0 (Normal)"
    if xray_flux >= 2e-4: r_scale = "R5 (Extremo)"
    elif xray_flux >= 1e-4: r_scale = "R4 (Grave)"
    elif xray_flux >= 1e-5: r_scale = "R3 (Fuerte)"
    elif xray_flux >= 5e-6: r_scale = "R2 (Moderado)"
    elif xray_flux >= 1e-6: r_scale = "R1 (Menor)"

    s_scale = "S0 (Normal)"
    if proton_flux >= 100000: s_scale = "S5 (Extremo)"
    elif proton_flux >= 10000: s_scale = "S4 (Grave)"
    elif proton_flux >= 1000: s_scale = "S3 (Fuerte)"
    elif proton_flux >= 100: s_scale = "S2 (Moderado)"
    elif proton_flux >= 10: s_scale = "S1 (Menor)"

    g_scale = "G0 (Normal)"
    if kp >= 9: g_scale = "G5 (Extremo)"
    elif kp == 8: g_scale = "G4 (Severo)"
    elif kp == 7: g_scale = "G3 (Fuerte)"
    elif kp == 6: g_scale = "G2 (Moderado)"
    elif kp == 5: g_scale = "G1 (Menor)"

    return r_scale, s_scale, g_scale

def estimate_solar_noise(sfi):
    """Calcula el Solar Noise adicional inducido en las bandas de HF."""
    try:
        sfi_val = float(sfi)
        if sfi_val <= 70: return "Mínimo (Fondo térmico normal)"
        elif sfi_val <= 120: return "Bajo (+0.5 dB)"
        elif sfi_val <= 200: return "Moderado (+1.5 dB en 10m/12m)"
        else: return "Elevado (Ruido constante en bandas altas)"
    except Exception:
        return "Indeterminado"

def get_detailed_forecast():
    """Extrae las tendencias de Kp y alertas para las próximas horas desde el pronóstico oficial de NOAA."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request("https://services.swpc.noaa.gov/text/3-day-forecast.txt", headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=6) as response:
            texto = response.read().decode('utf-8', errors='ignore')
        lines = texto.split("\n")
        forecast_lines = []
        start_capture = False
        
        for line in lines:
            if "rationale" in line.lower() or "noaa kp index breakdown" in line.lower():
                start_capture = True
                continue
            if start_capture and len(forecast_lines) < 4 and any(block in line for block in ["UT", "00-03", "06-09", "12-15"]):
                clean_line = line.strip()
                if clean_line:
                    forecast_lines.append(clean_line)
                    
        return forecast_lines if forecast_lines else ["No hay tendencias estructuradas."]
    except Exception:
        return ["Error al conectar con el servidor de predicción."]

def calculate_solar_elevation(lat, lon):
    """Calcula la elevación angular del sol en radianes."""
    try:
        now = datetime.utcnow()
        day_of_year = now.timetuple().tm_yday
        declination = 23.45 * math.sin(math.radians((360 / 365) * (284 + day_of_year)))
        hour_angle = (now.hour + now.minute/60 + lon/15 - 12) * 15
        sin_elevation = (math.sin(math.radians(lat)) * math.sin(math.radians(declination)) + 
                         math.cos(math.radians(lat)) * math.cos(math.radians(declination)) * math.cos(math.radians(hour_angle)))
        return math.asin(max(-1.0, min(1.0, sin_elevation)))
    except Exception:
        return 0.0

def calculate_muf_and_bands(sfi, lat, lon):
    """Estima la MUF (Máxima Frecuencia Usable) en MHz y el estado de apertura de bandas."""
    try:
        sfi_val = float(sfi)
        elevation_rad = calculate_solar_elevation(lat, lon)
        elevation_deg = math.degrees(elevation_rad)
        
        muf_base = 7.0 + (sfi_val - 65) * 0.06
        
        if elevation_deg > 0:
            diurnal_factor = math.sin(elevation_rad) * (12.0 + (sfi_val - 70) * 0.12)
            muf_total = muf_base + diurnal_factor
        else:
            muf_total = max(4.5, muf_base * 0.85)
            
        muf_total = round(muf_total, 2)
        
        status_20m = "Abierta" if muf_total >= 14.0 else "Cerrada"
        status_15m = "Abierta" if muf_total >= 21.0 else "Cerrada"
        status_10m = "Abierta" if muf_total >= 28.0 else ("Propagación Crítica" if muf_total >= 26.0 else "Cerrada")
        
        return muf_total, status_20m, status_15m, status_10m
    except Exception:
        return 14.0, "Indeterminado", "Indeterminado", "Indeterminado"

def calculate_luf(sfi, xray_flux, lat, lon):
    """Estima la LUF (Lowest Usable Frequency) en MHz basada en absorción e inclinación solar."""
    try:
        sfi_val = float(sfi)
        elevation_rad = calculate_solar_elevation(lat, lon)
        elevation_deg = math.degrees(elevation_rad)
        
        # LUF nocturna base
        luf_base = 1.5 + (sfi_val - 65) * 0.005
        
        if elevation_deg > 0:
            # Absorción diurna por inclinación solar y fotoionización
            diurnal_abs = math.sin(elevation_rad) * (2.0 + (sfi_val - 70) * 0.015)
            luf_total = luf_base + diurnal_abs
        else:
            luf_total = max(1.0, luf_base * 0.7)
            
        # Impacto de Rayos X (Solar Flares elevan absorción en capa D)
        if xray_flux is not None:
            if xray_flux > 1e-4:    # Clase X
                luf_total += 8.0
            elif xray_flux > 1e-5:  # Clase M
                luf_total += 4.0
            elif xray_flux > 1e-6:  # Clase C
                luf_total += 1.5
            elif xray_flux > 1e-7:  # Clase B
                luf_total += 0.5
                
        return round(max(0.5, luf_total), 2)
    except Exception:
        return 2.0

def get_xray_class(flux_value):
    """Convierte el flujo de rayos X a nomenclatura estándar."""
    if flux_value is None or flux_value == 0: return "A0.0"
    if flux_value < 1e-8: return "A0.0"
    elif flux_value < 1e-7: return f"A{flux_value / 1e-9:.1f}"
    elif flux_value < 1e-6: return f"B{flux_value / 1e-8:.1f}"
    elif flux_value < 1e-5: return f"C{flux_value / 1e-7:.1f}"
    elif flux_value < 1e-4: return f"M{flux_value / 1e-6:.1f}"
    else: return f"X{flux_value / 1e-5:.1f}"

def estimate_s_units_noise(kp, sfi):
    """Estima el piso de ruido en el S-Meter del receptor."""
    try:
        if kp <= 1: geomag_noise = 0.5
        elif kp <= 2: geomag_noise = 1.0
        elif kp <= 3: geomag_noise = 2.0
        elif kp <= 4: geomag_noise = 3.5
        elif kp == 5: geomag_noise = 5.0
        elif kp == 6: geomag_noise = 6.5
        else: geomag_noise = 8.0
        sfi_extra = 0.5 if float(sfi) > 150 else (1.0 if float(sfi) > 220 else 0.0)
        return f"S{geomag_noise + sfi_extra:.1f}"
    except Exception:
        return "S2.0"

def obtener_clima_espacial_avanzado():
    """
    Descarga telemetría de satélite y geomagnética en tiempo real (NOAA y GFZ),
    aplica compensación de desfase físico y alinea todos los índices en la Tierra.
    Incorpora la lógica avanzada del monitor espacial con cálculo dinámico del IUV,
    ruido solar en HF, escalas oficiales R, S y G, y pronóstico de tendencias.
    """
    print("[CLIMA ESPACIAL] Iniciando procesamiento de telemetría unificada avanzada (NOAA/GFZ Potsdam)...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        plasma_url = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"
        mag_url = "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json"
        kp_url = "https://services.swpc.noaa.gov/json/estimated_kp_1d.json"
        solar_url = "https://services.swpc.noaa.gov/text/daily-solar-indices.txt"
        xray_url = "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json"
        protons_url = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"

        # 1. Obtener ubicación GNSS actual de gpsd o fallback
        lat, lon, alt, is_fallback = get_gpsd_coordinates()
        gps_status = "Estática (Fallback / Config)" if is_fallback else "GPS Real (GNSS Fijado)"

        # Plasma
        plasma_data = []
        try:
            req = urllib.request.Request(plasma_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                plasma_data = parse_noaa_json_flexible(json.loads(r.read().decode('utf-8')), ["time_tag", "speed", "density"])
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar plasma: {e}")

        # Campo Magnético
        mag_data = []
        try:
            req = urllib.request.Request(mag_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                mag_data = parse_noaa_json_flexible(json.loads(r.read().decode('utf-8')), ["time_tag", "bt", "bx_gsm", "by_gsm", "bz_gsm", "bx", "by", "bz"])
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar IMF: {e}")

        # Kp
        kp_data = []
        try:
            req = urllib.request.Request(kp_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                kp_data = parse_noaa_json_flexible(json.loads(r.read().decode('utf-8')), ["time_tag", "kp"])
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar Kp: {e}")

        # Solar Indices
        solar_indices = []
        try:
            req = urllib.request.Request(solar_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                lines = r.read().decode('utf-8').strip().split('\n')
                for line in reversed(lines):
                    line = line.strip()
                    if not line or line.startswith('#') or line.startswith(':'):
                        continue
                    parts = line.split()
                    if len(parts) >= 5:
                        year, month, day, sfi, ssn = parts[:5]
                        solar_indices = [{
                            'flux': sfi,
                            'f10.7': sfi,
                            'f10_7': sfi,
                            'ssn': ssn,
                            'time_tag': f"{year}-{month}-{day}"
                        }]
                        break
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar índices solares: {e}")

        # Rayos X (GOES)
        xray_flux = 0.0
        try:
            req = urllib.request.Request(xray_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                xray_data = json.loads(r.read().decode('utf-8'))
                xray_long = [d for d in xray_data if d.get("energy_band") == "0.1-0.8nm" or d.get("energy") == "0.1-0.8nm"]
                if xray_long:
                    xray_flux = float(xray_long[-1].get("flux", 0.0))
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar Rayos X: {e}")

        # Protones (GOES)
        proton_flux = 0.0
        try:
            req = urllib.request.Request(protons_url, headers={'User-Agent': 'APRS_SAT_Agent/2.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=6) as r:
                proton_data = json.loads(r.read().decode('utf-8'))
                if proton_data:
                    filtered = [d for d in proton_data if d.get("energy") in [">=10 MeV", ">=10MeV"]]
                    if filtered:
                        proton_flux = float(filtered[-1].get("flux", 0.0))
                    else:
                        proton_flux = float(proton_data[-1].get("flux", 0.0))
        except Exception as e:
            print(f"  [NOAA WARNING] Error al descargar Protones: {e}")

        # Hp30 y Hp60 desde GFZ Potsdam
        hp30_data = obtener_indice_gfz("Hp30")
        hp60_data = obtener_indice_gfz("Hp60")

        # Pronóstico de tendencias futuras (Cálculo dinámico extraído)
        kp_predicho = obtener_pronostico_3h()

        # Fusionar Plasma + Mag sobre time_tag de satélite
        if not plasma_data or not mag_data:
            print("  [CLIMA ESPACIAL ERROR] Datos insuficientes en satélite para realizar fusión.")
            return

        plasma_map = {p["time_tag"].strftime("%Y-%m-%d %H:%M"): p for p in plasma_data}
        mag_map = {m["time_tag"].strftime("%Y-%m-%d %H:%M"): m for m in mag_data}

        merged_sat = []
        all_minutes = sorted(list(set(plasma_map.keys()) & set(mag_map.keys())))
        for m_str in all_minutes:
            p_item = plasma_map[m_str]
            m_item = mag_map[m_str]
            
            # Cálculo de retardo físico dinámico L1-Tierra basado en la velocidad del viento solar
            speed_val = p_item.get("speed")
            try:
                v = float(speed_val) if speed_val is not None else 400.0
                if v <= 0:
                    v = 400.0
                delay_minutes = (1500000.0 / v) / 60.0
            except Exception:
                delay_minutes = 45.0
                
            merged_sat.append({
                "time_tag": p_item["time_tag"],
                "speed": p_item.get("speed"),
                "density": p_item.get("density"),
                "bt": m_item.get("bt"),
                "bx_gsm": m_item.get("bx_gsm") or m_item.get("bx") or 0.0,
                "by_gsm": m_item.get("by_gsm") or m_item.get("by") or 0.0,
                "bz_gsm": m_item.get("bz_gsm") or m_item.get("bz") or 0.0,
                "dinamic_delay": delay_minutes,
                "tiempo_tierra": p_item["time_tag"] + timedelta(minutes=delay_minutes)
            })

        if not merged_sat:
            print("  [CLIMA ESPACIAL ERROR] La intersección temporal de telemetría de satélite está vacía.")
            return

        actual_sat = merged_sat[-1]
        tiempo_tierra = actual_sat["tiempo_tierra"]
        delay_actual = actual_sat["dinamic_delay"]

        def find_nearest_val(sorted_list, target_time, key_name):
            if not sorted_list:
                return None
            closest = min(sorted_list, key=lambda x: abs((x["time_tag"] - target_time).total_seconds()))
            if abs((closest["time_tag"] - target_time).total_seconds()) > 21600:
                return None
            return closest.get(key_name)

        # Alinear Kp de NOAA, Hp30 de GFZ y Hp60 de GFZ con tiempo de tierra
        kp_val = find_nearest_val(kp_data, tiempo_tierra, "kp")
        hp30_val = find_nearest_val(hp30_data, tiempo_tierra, "Hp30")
        hp60_val = find_nearest_val(hp60_data, tiempo_tierra, "Hp60")

        ultimo_solar = solar_indices[-1] if solar_indices else {}
        ultimo_sfi = {'flux': 150, 'f10.7': 150, 'ssn': '110', 'time_tag': 'N/D'}
        if ultimo_solar:
            sfi_val = float(ultimo_solar.get('f10.7') or ultimo_solar.get('f10_7') or ultimo_solar.get('flux') or 150)
            ssn_val = ultimo_solar.get('ssn') or '110'
            time_tag_val = ultimo_solar.get('time_tag') or 'N/D'
            ultimo_sfi = {
                'flux': sfi_val,
                'f10.7': sfi_val,
                'ssn': ssn_val,
                'time_tag': time_tag_val
            }

        # Cómputos dinámicos del script de usuario
        sfi_computado = float(ultimo_sfi['flux'])
        iuv = calculate_uv_index(sfi_computado, lat, lon)
        solar_noise = estimate_solar_noise(sfi_computado)

        # Usar Kp efectivo para escalas NOAA (si no hay kp_val, usar hp30_val, si no usar estimación por viento solar)
        kp_efectivo = kp_val
        if kp_efectivo is None:
            kp_efectivo = hp30_val
        if kp_efectivo is None:
            kp_efectivo = 1
            viento_spd = actual_sat.get('speed') or 350.0
            magn_bz = actual_sat.get('bz_gsm') or 0.0
            if viento_spd > 600 or magn_bz < -8: kp_efectivo = 5
            elif viento_spd > 500 or magn_bz < -4: kp_efectivo = 3
            elif viento_spd > 400: kp_efectivo = 2

        # Conversión del flujo de Rayos X a nomenclatura estándar
        xray_class = get_xray_class(xray_flux)

        # Piso de ruido estimado en unidades S (S-Meter)
        noise_s = estimate_s_units_noise(kp_efectivo, sfi_computado)

        # Escalas NOAA oficiales
        r_scale, s_scale, g_scale = get_noaa_scales(xray_flux, proton_flux, kp_efectivo)

        # Cálculo dinámico de la MUF y apertura de bandas HF (20m, 15m, 10m)
        muf, b20, b15, b10 = calculate_muf_and_bands(sfi_computado, lat, lon)
        luf = calculate_luf(sfi_computado, xray_flux, lat, lon)

        forecast_lines = get_detailed_forecast()

        print("==================================================")
        print(" LIVE MONITOR: NOAA /json/ & GFZ POTSDAM API")
        print("==================================================")
        print(f"Última actualización local : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Telemetría por satélite (L1 UTC) : {actual_sat['time_tag']}")
        print(f"Impacto estimado en la Tierra (UTC) : {tiempo_tierra}")
        print(f"Retardo de viaje dinámico L1-Tierra: {delay_actual:.1f} minutos")
        print(f"Ubicación GPS (IUV Dinámico) : LAT: {lat:.3f} | LON: {lon:.3f} ({gps_status})")
        print("-" * 50)
        print(" [PLASMA RTSW Y VIENTO SOLAR]")
        print(f" • Velocidad del viento solar : {actual_sat['speed']:.1f} km/s" if actual_sat['speed'] is not None else " • Velocidad del viento solar : N/A km/s")
        print(f" • Densidad de plasma : {actual_sat['density']:.1f} p/cm³" if actual_sat['density'] is not None else " • Densidad de plasma : N/A p/cm³")
        print("-" * 50)
        print(" [CAMPO MAGNÉTICO INTERPLANETARIO - GSM DEL IMF]")
        print(f" • Magnitud Total (Bt) : {actual_sat.get('bt', 'N/A')} nT")
        print(f" • Vector GSM (Bx, By, Bz) : ({actual_sat.get('bx_gsm', 0.0):.2f}, {actual_sat.get('by_gsm', 0.0):.2f}, {actual_sat.get('bz_gsm', 0.0):.2f}) nT")
        print("-" * 50)
        print(" [ÍNDICES GEOMAGNÉTICOS EN LA TIERRA]")
        print(f" • Kp Index (NOAA /json/) : {kp_val if kp_val is not None else 'N/A'}")
        print(f" • Índice Hp60 (GFZ Potsdam) : {hp60_val if hp60_val is not None else 'N/A'}")
        print(f" • Índice Hp30 (GFZ Potsdam) : {hp30_val if hp30_val is not None else 'N/A'}")
        print("-" * 50)
        print(" [ESTIMACIÓN DE MUF/LUF Y APERTURA DE BANDAS HF]")
        print(f" • MUF Calculada (Local) : {muf} MHz")
        print(f" • LUF Calculada (Local) : {luf} MHz")
        print(f" • Estado Banda 20m (14 MHz) : {b20}")
        print(f" • Estado Banda 15m (21 MHz) : {b15}")
        print(f" • Estado Banda 10m (28 MHz) : {b10}")
        print("-" * 50)
        print(" [PRÓXIMO BLOQUE DE PRONÓSTICO GEOMAGNÉTICO]")
        print(f" • Tendencia estimada de Kp : {kp_predicho}")
        print("-" * 50)
        print(" [ACTIVIDAD SOLAR DIARIA INTERNACIONAL]")
        print(f" • Radio Flux (SFI/F10.7) : {sfi_computado} sfu")
        print(f" • Número de mancha solar (SSN): {ultimo_sfi['ssn']}")
        print(f" • Flujo de Rayos X (Clase) : {xray_class} ({xray_flux:.2e} W/m²)")
        print(f" • Fecha oficial de validación : {ultimo_sfi['time_tag']}")
        print("-" * 50)
        print(" [ALERTAS ADICIONALES DE PROPAGACIÓN HF / IUV]")
        print(f" • Piso de Ruido en Dial (SNR) : {noise_s} (Unidades S)")
        uv_cat, uv_pms, uv_rgb, uv_hex = get_uv_category_and_colors(iuv)
        print(f" • Índice UV Solar Global (IUV): {iuv} - {uv_cat} (Pantone: {uv_pms} | RGB: {uv_rgb} | Hex: {uv_hex})")
        print(f" • ESCALAS NOAA METEOROLOGÍA : R: {r_scale} | S: {s_scale} | G: {g_scale}")
        print("==================================================")

    except Exception as e:
        print(f"[ERROR CLIMA ESPACIAL] Error general en el procesamiento de telemetría: {e}")

# ==============================================================================
# TRANSPORTE DE DATOS (APRS-IS por internet y KISS de Direwolf vía radio)
# ==============================================================================
def transmit_aprs_packet(packet_string):
    """
    Realiza transmisión dual redundante del paquete APRS con alta estabilidad y control de puertos:
    1. APRS-IS (Servidor de Internet principal) - Con reintento automático y backoff de contingencia
    2. KISS sobre TCP (Hardware Direwolf / aprx local para irradiar por radio VHF) - Sockets seguros frente a caídas
    """
    print(f"\n[APRS TX] Preparando envio de paquete:\n{packet_string}")
    
    # 1. Enviar a APRS-IS (con reintento automático rápido en caso de microcorte de red)
    is_success = False
    for attempt in range(1, 3):
        is_sock = None
        try:
            is_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            is_sock.settimeout(4.0)
            is_sock.connect((APRS_IS_SERVER, APRS_IS_PORT))
            
            # Enviar login de APRS-IS
            login_string = f"user {CALLSIGN} pass {APRS_PASSCODE} vers APRS_SAT_Agent 2.0\r\n"
            is_sock.sendall(login_string.encode('ascii'))
            
            # Recibir línea de autenticación de forma controlada
            is_sock.recv(512)
            
            # Enviar el paquete real
            full_packet = f"{packet_string}\r\n"
            is_sock.sendall(full_packet.encode('utf-8'))
            print(f"[APRS-IS SUCCESS] Paquete inyectado correctamente en {APRS_IS_SERVER}:{APRS_IS_PORT} (Intento {attempt}).")
            is_success = True
            break
        except socket.timeout:
            print(f"[APRS-IS WARNING] Tiempo de espera agotado al conectar a {APRS_IS_SERVER}:{APRS_IS_PORT} (Intento {attempt}/2).")
        except ConnectionRefusedError:
            print(f"[APRS-IS WARNING] Conexión rechazada por el servidor APRS-IS {APRS_IS_SERVER}:{APRS_IS_PORT}. ¿Filtro activo?")
        except Exception as e:
            print(f"[APRS-IS WARNING] Error de red en puerto {APRS_IS_PORT} ({e}) (Intento {attempt}/2).")
        finally:
            if is_sock:
                try:
                    is_sock.close()
                except Exception:
                    pass
        if attempt < 2:
            time.sleep(1.5) # Espera rápida antes del reintento de contingencia
            
    if not is_success:
        print(f"[APRS-IS ERROR CRÍTICO] Imposible conectar al canal APRS-IS ({APRS_IS_SERVER}:{APRS_IS_PORT}) tras todos los intentos.")

    # 2. Enviar a Direwolf por KISS sobre TCP
    # Formato KISS Frame:
    # FEND (0xC0), Command Byte (0x00 para datos en puerto 0), Datos (TNC2 Packet), FEND (0xC0)
    # Algunas integraciones con Direwolf se configuran por KISS sobre TCP
    kiss_sock = None
    try:
        kiss_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        kiss_sock.settimeout(2.0)
        kiss_sock.connect((DIREWOLF_KISS_HOST, DIREWOLF_KISS_PORT))
        
        # El paquete requiere preámbulo AX.25, pero Direwolf en KISS TCP
        # acepta tramas crudas o KISS encapsuladas. Mandamos encapsulación KISS estándar:
        raw_packet_bytes = packet_string.encode('utf-8', errors='ignore')
        
        # Encapsulado KISS simple: 0xC0 (FEND) + 0x00 (Port 0, Data) + Payload + 0xC0 (FEND)
        kiss_frame = bytearray([0xC0, 0x00]) + bytearray(raw_packet_bytes) + bytearray([0xC0])
        
        kiss_sock.sendall(kiss_frame)
        print(f"[DIREWOLF KISS SUCCESS] Paquete enviado al TNC local en puerto {DIREWOLF_KISS_PORT} (144.800 MHz RF).")
    except socket.timeout:
        print(f"[DIREWOLF KISS DEBUG] Timeout de conexión con Direwolf en {DIREWOLF_KISS_HOST}:{DIREWOLF_KISS_PORT}.")
    except ConnectionRefusedError:
        print(f"[DIREWOLF KISS DEBUG] Puerto local {DIREWOLF_KISS_PORT} inactivo/ocupado. Direwolf o APRX no están listos.")
    except Exception as e:
        # Esto es esperable si se corre en un entorno que no tiene una TNC local física
        print(f"[DIREWOLF KISS DEBUG] Canal RF local en puerto {DIREWOLF_KISS_PORT} inaccesible ({e}). Omisión RF.")
    finally:
        if kiss_sock:
            try:
                kiss_sock.close()
            except Exception:
                pass

# ==============================================================================
# MONITOREO METEOROLÓGICO LOCAL Y ALERTAS DE UMBRAL PERSONALIZADAS
# ==============================================================================
def fetch_local_weather_data():
    """
    Obtiene los datos meteorológicos locales según la fuente configurada.
    Soporta:
      - 'simulated': Simula lecturas realistas con posibilidad de variaciones dinámicas.
      - HTTP/HTTPS URLs (e.g. 'http://...'): Realiza un request GET y parsea un JSON con campos climáticos estándar.
      - Archivo local (e.g. 'local_weather.json'): Carga y parsea el archivo JSON.
    Retorna un diccionario con: {temp_c, humidity, wind_kts, wind_dir, pressure, rain_mm} o None si falla.
    """
    global last_local_weather
    
    # 1. Simulación
    if LOCAL_WEATHER_SOURCE.lower() == "simulated":
        import random
        # Drifting from last readings to maintain realism
        last_temp, last_hum, last_wind, last_dir, last_press, last_rain = last_local_weather
        
        # We can occasionally inject a spike above thresholds to test alerts (15% chance)
        trigger_extreme = (random.random() < 0.15)
        
        if trigger_extreme:
            # Let's decide which threshold to exceed
            choice = random.choice(["wind", "temp_max", "temp_min", "rain"])
            if choice == "wind":
                temp_c = last_temp + random.uniform(-1, 1)
                humidity = max(10, min(100, last_hum + random.randint(-5, 5)))
                wind_kts = LOCAL_THRESHOLD_WIND_KTS + random.uniform(1.0, 5.0)
                wind_dir = (last_dir + random.randint(-15, 15)) % 360
                pressure = last_press + random.uniform(-0.5, 0.5)
                rain_mm = last_rain + random.uniform(0.0, 0.5)
            elif choice == "temp_max":
                temp_c = LOCAL_THRESHOLD_TEMP_MAX_C + random.uniform(0.5, 3.0)
                humidity = max(10, min(100, last_hum + random.randint(-10, 5)))
                wind_kts = last_wind + random.uniform(-1, 1)
                wind_dir = (last_dir + random.randint(-15, 15)) % 360
                pressure = last_press + random.uniform(-1.0, 0.5)
                rain_mm = 0.0
            elif choice == "temp_min":
                temp_c = LOCAL_THRESHOLD_TEMP_MIN_C - random.uniform(0.5, 3.0)
                humidity = max(10, min(100, last_hum + random.randint(-5, 10)))
                wind_kts = last_wind + random.uniform(-1, 1)
                wind_dir = (last_dir + random.randint(-15, 15)) % 360
                pressure = last_press + random.uniform(0.5, 1.5)
                rain_mm = last_rain
            else: # rain
                temp_c = last_temp - random.uniform(1.0, 3.0)
                humidity = max(80, min(100, last_hum + random.randint(10, 20)))
                wind_kts = last_wind + random.uniform(2.0, 6.0)
                wind_dir = (last_dir + random.randint(-20, 20)) % 360
                pressure = last_press - random.uniform(1.5, 3.0)
                rain_mm = LOCAL_THRESHOLD_RAIN_MM + random.uniform(0.5, 5.0)
        else:
            # Normal drift
            temp_c = last_temp + random.uniform(-0.5, 0.5)
            humidity = max(10, min(100, last_hum + random.randint(-3, 3)))
            wind_kts = max(0.0, last_wind + random.uniform(-1.0, 1.0))
            wind_dir = (last_dir + random.randint(-10, 10)) % 360
            pressure = max(950.0, min(1050.0, last_press + random.uniform(-0.2, 0.2)))
            rain_mm = max(0.0, last_rain + (random.uniform(-0.1, 0.2) if humidity > 75 else random.uniform(-0.1, 0.0)))
            
        last_local_weather = (temp_c, humidity, wind_kts, wind_dir, pressure, rain_mm)
        return {
            "temp_c": round(temp_c, 1),
            "humidity": int(humidity),
            "wind_kts": round(wind_kts, 1),
            "wind_dir": int(wind_dir),
            "pressure": round(pressure, 1),
            "rain_mm": round(rain_mm, 1)
        }
        
    # 2. HTTP/HTTPS URL
    elif LOCAL_WEATHER_SOURCE.startswith("http://") or LOCAL_WEATHER_SOURCE.startswith("https://"):
        import urllib.request
        import json
        try:
            req = urllib.request.Request(LOCAL_WEATHER_SOURCE, headers={'User-Agent': 'S.A.T. Local Weather Daemon'})
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode('utf-8'))
                # Parsea campos habituales de clima en JSON
                return {
                    "temp_c": float(data.get("temp_c", data.get("temp", data.get("temperature", 20.0)))),
                    "humidity": int(data.get("humidity", data.get("hum", 50))),
                    "wind_kts": float(data.get("wind_kts", data.get("wind_speed", data.get("wind", 5.0)))),
                    "wind_dir": int(data.get("wind_dir", data.get("wind_degree", data.get("direction", 180)))),
                    "pressure": float(data.get("pressure", data.get("press", 1013.2))),
                    "rain_mm": float(data.get("rain_mm", data.get("rain", data.get("precip", 0.0))))
                }
        except Exception as e:
            print(f"[LOCAL WEATHER] Error fetching local weather URL ({LOCAL_WEATHER_SOURCE}): {e}")
            return None
            
    # 3. Archivo Local
    else:
        import json
        try:
            file_path = LOCAL_WEATHER_SOURCE
            if not os.path.exists(file_path):
                file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), LOCAL_WEATHER_SOURCE)
            
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return {
                        "temp_c": float(data.get("temp_c", data.get("temp", data.get("temperature", 20.0)))),
                        "humidity": int(data.get("humidity", data.get("hum", 50))),
                        "wind_kts": float(data.get("wind_kts", data.get("wind_speed", data.get("wind", 5.0)))),
                        "wind_dir": int(data.get("wind_dir", data.get("wind_degree", data.get("direction", 180)))),
                        "pressure": float(data.get("pressure", data.get("press", 1013.2))),
                        "rain_mm": float(data.get("rain_mm", data.get("rain", data.get("precip", 0.0))))
                    }
            else:
                print(f"[LOCAL WEATHER] Archivo meteorologico local no encontrado en {LOCAL_WEATHER_SOURCE}")
                return None
        except Exception as e:
            print(f"[LOCAL WEATHER] Error leyendo archivo de clima local: {e}")
            return None

def monitorear_clima_local():
    """
    Consulta los datos climaticos locales de la fuente configurada por el usuario,
    compara los datos contra los umbrales personalizados de viento, calor/helada y lluvia,
    y transmite boletines APRS estandarizados y marcados adecuadamente cuando se superan dichos umbrales.
    """
    global transmitidas_alertas_locales
    
    clima = fetch_local_weather_data()
    if not clima:
        return
        
    temp = clima["temp_c"]
    hum = clima["humidity"]
    wind = clima["wind_kts"]
    wdir = clima["wind_dir"]
    press = clima["pressure"]
    rain = clima["rain_mm"]
    
    print(f"[LOCAL WEATHER CHECK] Temp: {temp}°C, Hum: {hum}%, Viento: {wind} kts, Dir: {wdir}°, Pres: {press} hPa, Lluvia: {rain} mm")
    
    # Comprobar umbrales
    alertas_disparadas = []
    
    # 1. Viento Fuerte
    if wind >= LOCAL_THRESHOLD_WIND_KTS:
        alertas_disparadas.append({
            "tipo": "VIENTO_LOCAL",
            "msg": f"Viento fuerte detectado de {wind} kts (Umbral: {LOCAL_THRESHOLD_WIND_KTS} kts)"
        })
        
    # 2. Temperatura Maxima (Ola de calor)
    if temp >= LOCAL_THRESHOLD_TEMP_MAX_C:
        alertas_disparadas.append({
            "tipo": "TEMPERATURA_MAX_LOCAL",
            "msg": f"Ola de calor detectada de {temp}°C (Umbral: {LOCAL_THRESHOLD_TEMP_MAX_C}°C)"
        })
        
    # 3. Temperatura Minima (Helada / Frio extremo)
    if temp <= LOCAL_THRESHOLD_TEMP_MIN_C:
        alertas_disparadas.append({
            "tipo": "TEMPERATURA_MIN_LOCAL",
            "msg": f"Helada extrema detectada de {temp}°C (Umbral: {LOCAL_THRESHOLD_TEMP_MIN_C}°C)"
        })
        
    # 4. Lluvia Intensa/Torrencial
    if rain >= LOCAL_THRESHOLD_RAIN_MM:
        alertas_disparadas.append({
            "tipo": "LLUVIA_LOCAL",
            "msg": f"Lluvia torrencial detectada de {rain} mm (Umbral: {LOCAL_THRESHOLD_RAIN_MM} mm)"
        })
        
    # Procesar y transmitir las alertas disparadas
    import datetime
    today_str = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    
    for alerta in alertas_disparadas:
        # Generar clave unica para evitar saturacion/spam del boletin en el mismo dia
        alert_key = f"{alerta['tipo']}_{today_str}"
        
        if alert_key not in transmitidas_alertas_locales:
            msg = alerta["msg"]
            
            # Boletin APRS (BLN) estandar marcado para distribucion del S.A.T.
            # Identificador de boletin especial 'BLN3METEO' de 9 caracteres
            bulletin_packet = f"{CALLSIGN}>APRS,TCPIP*,qAC,WEATHER:BLN3METEO: [ALERTA SAT LOCAL] {msg}"
            
            print(f"\n[ALERTA METEOROLOGICA LOCAL DISPARADA] Emitiendo Boletin APRS: {msg}")
            transmit_aprs_packet(bulletin_packet)
            transmitidas_alertas_locales.add(alert_key)

# ==============================================================================
# HILO PRINCIPAL DE OPERACIÓN (Loop de control permanente)
# ==============================================================================
def main():
    global transmitido_sw_id, ultima_baliza_wx, transmitidas_alertas_meteo, ultima_consulta_pronostico, ultima_consulta_clima_local
    
    print("======================================================================")
    print("     APRS S.A.T. INICIADO - CONSOLA DE EMERGENCIAS REMER")
    print(f"     Callsign: {CALLSIGN} | Rango Crítico: {FILTER_RADIUS_KM} km")
    print("======================================================================")
    
    # Carga inicial de configuración unificada
    sync_local_config()
    
    ultima_lectura_clima_espacial = 0
    
    while True:
        try:
            # Sincronización en cada iteración por si hay cambios en el panel de administración
            sync_local_config()
            
            # 1. Consultar geoposicionamiento en tiempo real desde gpsd
            lat, lon, alt, is_fallback = get_gpsd_coordinates()
            aprs_lat = decdeg_to_aprs_lat(lat)
            aprs_lon = decdeg_to_aprs_lon(lon)
            
            # Formatear sellado temporal APRS en coordenadas UTC
            utc_now = datetime.now(timezone.utc)
            timestamp = utc_now.strftime("%d%H%Mz") # Formato APRS DDHHMMz
            
            # 2. Telemetría de Clima (Intervalo de 15 minutos / 900 segs)
            curr_time = time.time()
            if curr_time - ultima_baliza_wx >= 900 or ultima_baliza_wx == 0:
                print("\n[SENSOR CLIMA] Adquiriendo telemetría actual de sensores integrados...")
                weather_metrics = get_weather_data(lat, lon)
                wx_payload = format_aprs_wx_payload(*weather_metrics)
                
                # Baliza meteorológica APRS (Símbolo _ en la posición de la estación)
                # Sintaxis: @ <timestamp> <lat> / <lon> _ <wx_payload>
                wx_packet = f"{CALLSIGN}>APRS,TCPIP*,qAC,GATEWAY:@{timestamp}{aprs_lat}/{aprs_lon}{wx_payload}"
                transmit_aprs_packet(wx_packet)
                ultima_baliza_wx = curr_time
                
            # 3. Procesamiento y Alerta Geofísica (IGN España)
            sismos_en_rango = query_ign_earthquakes(lat, lon)
            for sismo in sismos_en_rango:
                eq_id = sismo["id"]
                if eq_id not in transmitidos_sismos:
                    mag = sismo["magnitude"]
                    dist = sismo["distance"]
                    place = sismo["place"]
                    depth = sismo["depth"]
                    
                    # Generar Objeto APRS de Sismo (Símbolo [ o o)
                    # El nombre del objeto debe tener exactamente 9 caracteres
                    obj_name = f"EQ_M{int(mag*10)}".ljust(9)
                    
                    # Timestamp del evento sísmico
                    eq_time = datetime.fromtimestamp(sismo["time"], tz=timezone.utc)
                    eq_timestamp = eq_time.strftime("%d%H%Mz")
                    
                    eq_lat = decdeg_to_aprs_lat(sismo["latitude"])
                    eq_lon = decdeg_to_aprs_lon(sismo["longitude"])
                    
                    comment = f"SISMO M{mag} {place} Prof:{depth}km a {dist}km - REMER S.A.T."
                    
                    # Objeto APRS: ; <9_NAME> * <timestamp> <lat> / <lon> [ <comment>
                    eq_object_packet = f"{CALLSIGN}>APRS,TCPIP*,qAC,SISMOS:;{obj_name}*{eq_timestamp}{eq_lat}/{eq_lon}[{comment}"
                    
                    # Inyección dual urgente
                    print(f"\n[ALERTA GEOLÓGICA CRÍTICA] Terremoto a {dist}km! Transmitiendo objeto sísmico...")
                    transmit_aprs_packet(eq_object_packet)
                    transmitidos_sismos.add(eq_id)
            
            # 4. Alertas Clima Espacial NOAA
            noaa_alert = query_noaa_space_weather()
            if noaa_alert:
                alert_id = noaa_alert["id"]
                if alert_id != transmitido_sw_id:
                    scale = noaa_alert["scale"]
                    level = noaa_alert["level"]
                    desc = noaa_alert["desc"]
                    
                    # Alerta emitida mediante un Boletín APRS (BLN)
                    # Sintaxis: CALLSIGN > APRS,TCPIP*: BLN <N> <ASOCIACION>: Mensaje
                    bulletin_packet = f"{CALLSIGN}>APRS,TCPIP*,qAC,WEATHER:BLN1REMER: NOAA SPACE CLIMA:{scale}{level} - {desc}"
                    
                    print(f"\n[ALERTA CLIMA ESPACIAL NOAA] Escala {scale}{level} detectada! Emitiendo boletín...")
                    transmit_aprs_packet(bulletin_packet)
                    transmitido_sw_id = alert_id
            
            # 5. Adquisición de Clima Espacial Avanzado y Alineamiento (Intervalo de 5 minutos / 300 segs)
            if curr_time - ultima_lectura_clima_espacial >= 300 or ultima_lectura_clima_espacial == 0:
                obtener_clima_espacial_avanzado()
                ultima_lectura_clima_espacial = curr_time

            # 6. Alertas de Pronóstico Meteorológico Avanzado (WeatherAPI) - Intervalo de 30 minutos (1800 segs)
            if curr_time - ultima_consulta_pronostico >= 1800 or ultima_consulta_pronostico == 0:
                print("\n[PRONÓSTICO METEO] Consultando pronóstico avanzado de 24-72 horas...")
                alertas_meteo = get_weatherapi_forecast(lat, lon)
                
                for alerta in alertas_meteo:
                    # Crear una clave única que combine tipo, proyección en horas y fecha de hoy para no repetir el mismo día
                    hoy_str = utc_now.strftime("%Y-%m-%d")
                    alert_key = f"{alerta['tipo']}_{alerta['tiempo_h']}_{hoy_str}"
                    
                    if alert_key not in transmitidas_alertas_meteo:
                        msg = alerta["mensaje"]
                        
                        # Boletín APRS (BLN) con identificador de Boletín Meteo exclusivo "BLN2METEO"
                        bulletin_packet = f"{CALLSIGN}>APRS,TCPIP*,qAC,WEATHER:BLN2METEO: ALERTA METEO: {msg}"
                        
                        print(f"  [ALERTA METEO] Emitiendo Boletín APRS para alerta: {msg}")
                        transmit_aprs_packet(bulletin_packet)
                        transmitidas_alertas_meteo.add(alert_key)
                        
                ultima_consulta_pronostico = curr_time
                
            # 7. Monitoreo de Estación Meteorológica Local y Alertas de Umbral Personalizadas
            if curr_time - ultima_consulta_clima_local >= LOCAL_WEATHER_INTERVAL or ultima_consulta_clima_local == 0:
                print("\n[MONITOREO CLIMA LOCAL] Evaluando condiciones de la estación local...")
                monitorear_clima_local()
                ultima_consulta_clima_local = curr_time
                    
        except KeyboardInterrupt:
            print("\n[INFO] Sistema APRS S.A.T. detenido de forma controlada por el operador.")
            sys.exit(0)
        except Exception as e:
            print(f"[LOOP ERROR] Error imprevisto en el bus del sistema ({e}). Auto-recuperación en 30s...")
            time.sleep(30)
            continue
            
        # Tasa de sondeo del bucle (cada 30 segundos) como exige el IGN y NOAA
        time.sleep(30)

if __name__ == "__main__":
    main()
