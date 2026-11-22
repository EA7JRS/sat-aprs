// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Uso: node tools/pruebas/kiwi_falso.js <puerto> <sonido.wav de 12 kS/s, 16 bits, mono>   (por ejemplo, de gen_packets -B 300 -r 12000)
// KiwiSDR de pega para S.A.T.-APRS+: en modo usb/lsb manda un sonido (PCM de 12 kS/s) en bucle; en cw, un nivel que
// sube en la ranura de dos balizas (índices 14 y 0: CS3B y 4U1UN) según el horario IBP. Nunca se emite nada.
const net = require('net'), crypto = require('crypto'), fs = require('fs');
const RATE = 12000, PORT = +process.argv[2] || 8073, PCM = fs.readFileSync(process.argv[3]).subarray(44);
const BANDAS = [14100, 18110, 21150, 24930, 28200];
const tr = (b) => Buffer.concat([b.length < 126 ? Buffer.from([0x82, b.length]) : Buffer.from([0x82, 126, b.length >> 8, b.length & 255]), b]);
net.createServer((s) => {
  let buf = Buffer.alloc(0), up = false, timer = null, i = 0, seq = 0, modo = '', khz = 0;
  s.on('error', () => {}); s.on('close', () => clearInterval(timer));
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!up) {
      const e = buf.indexOf('\r\n\r\n'); if (e < 0) return;
      const key = /Sec-WebSocket-Key: (.+)/.exec(buf.subarray(0, e).toString())[1].trim(); buf = buf.subarray(e + 4); up = true;
      s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
    }
    for (;;) {
      if (buf.length < 6) return;
      let n = buf[1] & 127, h = 2; if (n === 126) { n = buf.readUInt16BE(2); h = 4; }
      if (buf.length < h + 4 + n) return;
      const p = Buffer.from(buf.subarray(h + 4, h + 4 + n)); for (let k = 0; k < n; k++) p[k] ^= buf[h + (k & 3)];
      buf = buf.subarray(h + 4 + n);
      const t = p.toString();
      if (t.startsWith('SET auth')) {
        s.write(tr(Buffer.from('MSG load_cfg=' + encodeURIComponent(JSON.stringify({ rx_gps: encodeURIComponent('(36.530000, -6.290000)') })))));
        s.write(tr(Buffer.from('MSG audio_init=0 audio_rate=12000'))); s.write(tr(Buffer.from('MSG sample_rate=' + RATE)));
      }
      const m = /SET mod=(\w+) .*freq=([0-9.]+)/.exec(t);
      if (m) { modo = m[1]; khz = +m[2]; console.log('canal', modo, khz); }
      if (m && !timer) {
        const t0 = Date.now();
        timer = setInterval(() => {
          const want = Math.floor((Date.now() - t0) / 1000 * RATE);
          while (i + 512 <= want) {
            const b = Buffer.alloc(3 + 7 + 2 * 512); b.write('SND'); b.writeUInt32LE(seq++, 4);
            let dbm = -118 + Math.random();
            if (modo === 'cw') {
              const banda = BANDAS.findIndex((f) => Math.abs(f - 0.5 - khz) < 0.01), sec = Math.floor(Date.now() / 1000) % 86400, ranura = Math.floor((sec % 180) / 10);
              const baliza = ((ranura - banda) % 18 + 18) % 18;
              if (baliza === 14 && banda <= 2) dbm = -96;            // CS3B, fuerte en 20, 17 y 15 m
              if (baliza === 0 && banda === 0) dbm = -109;           // 4U1UN, floja, solo en 20 m
            }
            b.writeUInt16BE(Math.round((dbm + 127) * 10), 8);
            if (modo !== 'cw') for (let k = 0; k < 512; k++) b.writeInt16BE(PCM.readInt16LE(((i + k) * 2) % (PCM.length - 1) & ~1), 10 + 2 * k);
            i += 512; s.write(tr(b));
          }
        }, 20);
      }
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log('KiwiSDR de pega (sat-aprs) en', PORT));
