# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Manuel - EA7JRS
"""Pruebas de las primitivas APRS / AX.25 / KISS."""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import aprs_proto as ap


class CallsignTests(unittest.TestCase):
    def test_valid_callsigns(self):
        for call in ("EA7JRS", "EA7JRS-13", "ea7jrs-9", "W1AW", "EB1TR-15", "ED3YNZ-10"):
            self.assertTrue(ap.is_valid_callsign(call), call)

    def test_placeholders_and_malformed_are_rejected(self):
        for call in ("", None, "CALLSING-13", "N0CALL", "EA1URG-13", "MYCALL", "EA7JRS-16",
                     "EA7JRS-", "TOOLONG7", "EA7 JRS", "123456", "ABCDEF", "TCPIP*", "A1"):
            self.assertFalse(ap.is_valid_callsign(call), call)

    def test_passcode_known_values(self):
        self.assertEqual(ap.aprs_passcode("N0CALL"), 13023)
        self.assertEqual(ap.aprs_passcode("EA7JRS-13"), ap.aprs_passcode("ea7jrs"))
        self.assertTrue(ap.passcode_matches("N0CALL-5", "13023"))
        self.assertFalse(ap.passcode_matches("N0CALL", ""))
        self.assertFalse(ap.passcode_matches("N0CALL", "-1"))
        self.assertFalse(ap.passcode_matches("N0CALL", "abc"))


class PositionTests(unittest.TestCase):
    def test_basic_formatting(self):
        self.assertEqual(ap.format_lat(40.416775), "4025.01N")
        self.assertEqual(ap.format_lon(-3.70379), "00342.23W")
        self.assertEqual(ap.format_lat(-33.5), "3330.00S")
        self.assertEqual(ap.format_lon(2.5), "00230.00E")

    def test_minutes_never_round_to_sixty(self):
        self.assertEqual(ap.format_lat(36.99999), "3700.00N")
        self.assertEqual(ap.format_lon(-5.999999), "00600.00W")
        self.assertNotIn("60.00", ap.format_lat(40.9999999))

    def test_fixed_width(self):
        for lat in (0, 0.001, 9.5, 89.99999, 90):
            self.assertEqual(len(ap.format_lat(lat)), 8)
        for lon in (0, -0.001, 9.5, 179.99999, -180):
            self.assertEqual(len(ap.format_lon(lon)), 9)

    def test_timestamp(self):
        dt = datetime(2026, 11, 3, 7, 5, tzinfo=timezone.utc)
        self.assertEqual(ap.format_timestamp(dt), "030705z")


class InfoFieldTests(unittest.TestCase):
    def test_weather_report_units_and_layout(self):
        info = ap.format_wx_info("091530z", 37.39, -5.99, temp_c=20.0, humidity=100,
                                 wind_kts=10.0, wind_dir_deg=230, pressure_hpa=1015.4,
                                 gust_kts=20.0, rain_1h_mm=2.54)
        # 10 kt = 12 mph, 20 kt = 23 mph, 20 C = 68 F, 2.54 mm = 0.10 in, 100 % -> h00
        self.assertEqual(info, "@091530z3723.40N/00559.40W_230/012g023t068r010h00b10154")

    def test_weather_report_never_invents_missing_data(self):
        info = ap.format_wx_info("091530z", 37.39, -5.99, temp_c=-20.0)
        self.assertEqual(info, "@091530z3723.40N/00559.40W_.../...g...t-04")

    def test_object(self):
        info = ap.format_object_info("EQ091530", "091530z", 37.15, -4.01, "\\", "Q", "M4.2 Salar, Granada")
        self.assertEqual(info, ";EQ091530 *091530z3709.00N\\00400.60WQM4.2 Salar, Granada")
        self.assertEqual(info[10], "*")

    def test_bulletin_is_a_valid_aprs_message(self):
        info = ap.format_bulletin_info("BLN2AQI", "Calidad del aire: ¡Ñandú! " + "x" * 80)
        self.assertTrue(info.startswith(":BLN2AQI  :"))
        addressee, text = info[1:10], info[11:]
        self.assertEqual(len(addressee), 9)
        self.assertLessEqual(len(text), ap.MAX_BULLETIN_TEXT)
        self.assertTrue(all(32 <= ord(c) < 127 for c in info))
        self.assertIn("Nandu", text)

    def test_bulletin_rejects_bad_id(self):
        with self.assertRaises(ValueError):
            ap.format_bulletin_info("METEO", "texto")

    def test_to_ascii_strips_emoji_and_accents(self):
        self.assertEqual(ap.to_ascii("⚠️ Tormenta en Cádiz 35°C"), "Tormenta en Cadiz 35oC")

    def test_build_packet(self):
        self.assertEqual(ap.build_packet("ea7jrs-13", "TCPIP*", ">hola"), "EA7JRS-13>APZSAT,TCPIP*:>hola")


class Ax25KissTests(unittest.TestCase):
    def test_ui_frame_layout(self):
        frame = ap.encode_ax25_ui("EA7JRS-13", "APZSAT", "WIDE1-1,WIDE2-1", ">test")
        self.assertEqual(len(frame), 7 * 4 + 2 + 5)
        self.assertEqual(bytes(b >> 1 for b in frame[0:6]), b"APZSAT")
        self.assertEqual(bytes(b >> 1 for b in frame[7:13]), b"EA7JRS")
        self.assertEqual((frame[13] >> 1) & 0x0F, 13)       # SSID del origen
        # Solo la última dirección lleva el bit de fin de cabecera
        self.assertEqual([frame[i] & 0x01 for i in (6, 13, 20, 27)], [0, 0, 0, 1])
        self.assertEqual(frame[28:30], b"\x03\xf0")
        self.assertEqual(frame[30:], b">test")

    def test_no_path_marks_source_as_last(self):
        frame = ap.encode_ax25_ui("EA7JRS", "APZSAT", "", "x")
        self.assertEqual(frame[13] & 0x01, 1)

    def test_internet_paths_never_reach_rf(self):
        for path in ("TCPIP*,qAC,GATEWAY", "qAC", "WIDE1-1,TOOLONGCALL"):
            with self.assertRaises(ValueError):
                ap.encode_ax25_ui("EA7JRS-13", "APZSAT", path, "x")

    def test_repeated_flag(self):
        frame = ap.encode_ax25_ui("EA7JRS", "APZSAT", "WIDE1*", "x")
        self.assertTrue(frame[20] & 0x80)

    def test_kiss_escaping(self):
        encoded = ap.kiss_encode(bytes([0x01, 0xC0, 0x02, 0xDB, 0x03]))
        self.assertEqual(encoded, bytes([0xC0, 0x00, 0x01, 0xDB, 0xDC, 0x02, 0xDB, 0xDD, 0x03, 0xC0]))


if __name__ == "__main__":
    unittest.main()
