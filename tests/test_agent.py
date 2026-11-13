# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Manuel - EA7JRS
"""Pruebas del agente: seguridad de emisión, sismos y avisos meteorológicos."""
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import aprs_proto
import aprs_sat
import weather_services as ws


def _feature(mag=4.2, when=None, eq_id="es2026abc", lat=37.15, lon=-4.01, time_value=None):
    when = time.time() - 600 if when is None else when
    return {
        "id": eq_id,
        "geometry": {"coordinates": [lon, lat, 8.0]},
        "properties": {"mag": mag, "place": "Salar, Granada",
                       "time": time_value if time_value is not None else when * 1000},
    }


class EarthquakeTests(unittest.TestCase):
    def setUp(self):
        aprs_sat.transmitidos_sismos = {}
        aprs_sat.MIN_MAGNITUDE = 3.0
        aprs_sat.MAX_QUAKE_AGE_HOURS = 24.0

    def test_parses_usgs_epoch_and_ign_iso_times(self):
        a = aprs_sat.parse_earthquake_feature(_feature(when=1_800_000_000), 37.39, -5.99)
        self.assertAlmostEqual(a["time"], 1_800_000_000, places=0)
        b = aprs_sat.parse_earthquake_feature(_feature(time_value="2026-11-09T15:30:00Z"), 37.39, -5.99)
        self.assertEqual(aprs_sat.earthquake_object_name(b), "EQ091530")

    def test_malformed_events_are_skipped_not_fatal(self):
        for bad in ({}, {"geometry": None}, _feature(mag=None), _feature(time_value="ayer"),
                    {"geometry": {"coordinates": [None, None]}, "properties": {"mag": 3}}):
            self.assertIsNone(aprs_sat.parse_earthquake_feature(bad, 37.39, -5.99))

    def test_announce_filters(self):
        parse = lambda **kw: aprs_sat.parse_earthquake_feature(_feature(**kw), 37.39, -5.99)
        self.assertTrue(aprs_sat.should_announce_earthquake(parse()))
        self.assertFalse(aprs_sat.should_announce_earthquake(parse(mag=1.4)))                       # floja
        self.assertFalse(aprs_sat.should_announce_earthquake(parse(when=time.time() - 3 * 86400)))  # antigua
        aprs_sat.transmitidos_sismos["es2026abc"] = time.time()
        self.assertFalse(aprs_sat.should_announce_earthquake(parse()))                              # repetida


class TxSafetyTests(unittest.TestCase):
    def setUp(self):
        aprs_sat.DRY_RUN = False
        aprs_sat.APRS_IS_ENABLED = True
        aprs_sat.RF_ENABLED = True
        aprs_sat.RF_PATH = "WIDE1-1,WIDE2-1"

    def test_placeholder_callsign_blocks_everything(self):
        aprs_sat.CALLSIGN, aprs_sat.APRS_PASSCODE = "CALLSING-13", ""
        with mock.patch("socket.create_connection") as conn:
            self.assertFalse(aprs_sat.transmit_aprs(">prueba"))
            conn.assert_not_called()

    def test_wrong_passcode_blocks_aprs_is_only(self):
        aprs_sat.CALLSIGN, aprs_sat.APRS_PASSCODE = "EA7JRS-13", "12345"
        self.assertEqual(aprs_sat.tx_readiness()[:2], (False, True))

    def test_dry_run_never_opens_a_socket(self):
        aprs_sat.CALLSIGN = "EA7JRS-13"
        aprs_sat.APRS_PASSCODE = str(aprs_proto.aprs_passcode("EA7JRS"))
        aprs_sat.DRY_RUN = True
        with mock.patch("socket.create_connection") as conn:
            self.assertFalse(aprs_sat.transmit_aprs(">prueba"))
            conn.assert_not_called()

    def test_simulated_sources_are_silent_without_simulate_flag(self):
        aprs_sat.SIMULATE = False
        aprs_sat.WEATHERAPI_KEY = ""
        aprs_sat.OWM_API_KEY = ""
        aprs_sat.LOCAL_WEATHER_SOURCE = "simulated"
        self.assertEqual(aprs_sat.get_weatherapi_forecast(40.4, -3.7), [])
        self.assertIsNone(aprs_sat.get_weather_data(40.4, -3.7))
        self.assertIsNone(aprs_sat.fetch_local_weather_data())

    def test_simulate_flag_forces_dry_run(self):
        with mock.patch.object(aprs_sat, "sync_local_config"), \
             mock.patch.object(aprs_sat, "load_state"), \
             mock.patch.object(aprs_sat, "get_gpsd_coordinates", return_value=(40.4, -3.7, 650, True)), \
             mock.patch.object(aprs_sat, "query_ign_earthquakes", return_value=[]), \
             mock.patch.object(aprs_sat, "query_noaa_space_weather", return_value=None), \
             mock.patch.object(aprs_sat, "obtener_clima_espacial_avanzado"), \
             mock.patch.object(aprs_sat, "WeatherAlertsManager", None), \
             mock.patch("socket.create_connection") as conn:
            aprs_sat.main(["--simulate", "--once"])
            self.assertTrue(aprs_sat.DRY_RUN)
            conn.assert_not_called()

    def test_real_transmission_end_to_end(self):
        """Servidores locales de pega: APRS-IS con verificación de login y TNC KISS."""
        received = {}

        def fake_aprs_is(server):
            conn, _ = server.accept()
            with conn:
                conn.sendall(b"# aprsc 2.1.19\r\n")
                reader = conn.makefile("r", newline="\n")
                received["login"] = reader.readline().strip()
                conn.sendall(b"# logresp EA7JRS-13 verified, server T2TEST\r\n")
                received["packet"] = reader.readline().strip()

        def fake_kiss(server):
            conn, _ = server.accept()
            with conn:
                received["kiss"] = conn.recv(1024)

        servers = []
        for target in (fake_aprs_is, fake_kiss):
            srv = socket.socket()
            srv.bind(("127.0.0.1", 0))
            srv.listen(1)
            servers.append(srv)
            threading.Thread(target=target, args=(srv,), daemon=True).start()

        aprs_sat.CALLSIGN = "EA7JRS-13"
        aprs_sat.APRS_PASSCODE = str(aprs_proto.aprs_passcode("EA7JRS"))
        aprs_sat.APRS_IS_SERVER, aprs_sat.APRS_IS_PORT = "127.0.0.1", servers[0].getsockname()[1]
        aprs_sat.DIREWOLF_KISS_HOST, aprs_sat.DIREWOLF_KISS_PORT = "127.0.0.1", servers[1].getsockname()[1]

        info = aprs_proto.format_bulletin_info("BLN1REMER", "PRUEBA")
        self.assertTrue(aprs_sat.transmit_aprs(info))
        time.sleep(0.3)
        for srv in servers:
            srv.close()

        self.assertTrue(received["login"].startswith("user EA7JRS-13 pass "))
        self.assertEqual(received["packet"], "EA7JRS-13>APZSAT,TCPIP*::BLN1REMER:PRUEBA")
        self.assertEqual(received["kiss"][:2], b"\xc0\x00")
        self.assertEqual(received["kiss"][-1], 0xC0)
        self.assertIn(b"\x03\xf0:BLN1REMER:PRUEBA", received["kiss"])
        self.assertNotIn(b"TCPIP", received["kiss"])


ATOM_FEED = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <entry>
    <cap:areaDesc>Campiña sevillana</cap:areaDesc>
    <cap:event>Aviso de temperaturas máximas de nivel naranja</cap:event>
    <cap:severity>Severe</cap:severity>
    <cap:onset>2026-07-01T11:00:00+00:00</cap:onset>
    <cap:expires>2999-07-01T19:00:00+00:00</cap:expires>
    <cap:identifier>2.49.0.0.724.0.ES.260701.SEVILLA</cap:identifier>
    <title>Orange high-temperature warning</title>
  </entry>
  <entry>
    <cap:areaDesc>Litoral de Barcelona</cap:areaDesc>
    <cap:event>Aviso de lluvias</cap:event>
    <cap:severity>Moderate</cap:severity>
    <cap:expires>2999-07-01T19:00:00+00:00</cap:expires>
    <cap:identifier>2.49.0.0.724.0.ES.260701.BCN</cap:identifier>
  </entry>
  <entry>
    <cap:areaDesc>Sierra norte de Sevilla</cap:areaDesc>
    <cap:event>Aviso caducado</cap:event>
    <cap:severity>Extreme</cap:severity>
    <cap:expires>2020-01-01T00:00:00+00:00</cap:expires>
    <cap:identifier>2.49.0.0.724.0.ES.OLD</cap:identifier>
  </entry>
</feed>""".encode("utf-8")


class WeatherServicesTests(unittest.TestCase):
    def _manager(self, **kw):
        tmp = tempfile.mkdtemp()
        return ws.WeatherAlertsManager(config_path=os.path.join(tmp, "sources.json"), **kw)

    def test_failed_source_returns_nothing_instead_of_fake_alerts(self):
        manager = self._manager(area_filter="Sevilla")
        with mock.patch.object(manager, "_fetch_url", return_value=None):
            self.assertEqual(manager.poll_all_services(), [])

    def test_source_is_skipped_without_area_filter(self):
        manager = self._manager()
        with mock.patch.object(manager, "_fetch_url", return_value=ATOM_FEED) as fetch:
            self.assertEqual(manager.poll_all_services(), [])
            fetch.assert_not_called()

    def test_meteoalarm_atom_feed_is_parsed_and_filtered(self):
        manager = self._manager(area_filter="sevilla, cádiz")
        with mock.patch.object(manager, "_fetch_url", return_value=ATOM_FEED):
            alerts = manager.poll_all_services()
        self.assertEqual(len(alerts), 1)                       # otra zona y caducado, fuera
        alert = alerts[0]
        self.assertEqual(alert["severity"], "ORANGE")
        self.assertEqual(alert["id"], "2.49.0.0.724.0.ES.260701.SEVILLA")
        info = ws.generate_aprs_weather_bulletin(alert, bulletin_index=4)
        self.assertTrue(info.startswith(":BLN4METEO:NARANJA AVISO DE TEMPERATURAS"))
        self.assertTrue(info.endswith("CAMPINA SEVILLANA"))
        self.assertLessEqual(len(info) - 11, aprs_proto.MAX_BULLETIN_TEXT)
        self.assertTrue(all(32 <= ord(c) < 127 for c in info))

    def test_cap_document_uses_alert_level_identifier(self):
        cap = b"""<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>CAP-1</identifier>
        <info><event>Viento</event><severity>Extreme</severity>
        <area><areaDesc>Cadiz</areaDesc></area></info></alert>"""
        items = ws.AlertParserEngine.parse_xml_cap(cap, {})
        self.assertEqual(items[0]["id"], "CAP-1")
        self.assertEqual(items[0]["area"], "Cadiz")

    def test_simulated_alerts_only_when_explicitly_allowed(self):
        manager = self._manager(area_filter="Sevilla", allow_simulated=True)
        with mock.patch.object(manager, "_fetch_url", return_value=None):
            self.assertTrue(manager.poll_all_services())


class StateTests(unittest.TestCase):
    def test_state_roundtrip_and_pruning(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(aprs_sat, "STATE_FILE", os.path.join(tmp, "state.json")):
                aprs_sat.DRY_RUN = False
                aprs_sat.transmitidos_sismos = {"nuevo": time.time(), "viejo": time.time() - 30 * 86400}
                aprs_sat.transmitido_sw_id = "G3_2026-11-09"
                aprs_sat.save_state()
                aprs_sat.transmitidos_sismos, aprs_sat.transmitido_sw_id = {}, None
                aprs_sat.load_state()
                self.assertEqual(list(aprs_sat.transmitidos_sismos), ["nuevo"])
                self.assertEqual(aprs_sat.transmitido_sw_id, "G3_2026-11-09")


if __name__ == "__main__":
    unittest.main()
