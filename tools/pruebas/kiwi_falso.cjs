// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Uso: node tools/pruebas/kiwi_falso.cjs <puerto> <sonido.wav de 12 kS/s, 16 bits, mono>   (por ejemplo, de gen_packets -B 300 -r 12000)
// KiwiSDR de pega para S.A.T.-APRS+: en modo usb/lsb manda un sonido (PCM de 12 kS/s) en bucle; en cw, en las frecuencias IBP, un nivel que
// sube en la ranura de dos balizas (índices 14 y 0: CS3B y 4U1UN) según el horario IBP, con su indicativo en telegrafía a
// 22 ppm y las cuatro rayas (CS3B fuerte, 4U1UN demasiado floja para leerse); en otra frecuencia de cw, una baliza de
// pega «VVV DE EA7JRS/B IM76HR» a 14 ppm. Nunca se emite nada.
const net = require('net'), crypto = require('crypto'), fs = require('fs');
const RATE = 12000, PORT = +process.argv[2] || 8073, PCM = fs.readFileSync(process.argv[3]).subarray(44);
const BANDAS = [14100, 18110, 21150, 24930, 28200];
const M = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '/': '-..-.' };
// los tramos [empieza, acaba, amplitud relativa] de un texto en telegrafía; «_» es una raya de un segundo, cada una 10 dB menos
function tramos(texto, ppm) {
  const p = 1.2 / ppm, t = []; let x = 0.3, baja = 1;
  for (const c of texto) {
    if (c === ' ') { x += 4 * p; continue; }
    if (c === '_') { t.push([x, x + 1, baja]); x += 1 + 3 * p; baja *= 0.316; continue; }
    for (const e of M[c] || '') { const d = e === '.' ? p : 3 * p; t.push([x, x + d, 1]); x += d + p; }
    x += 2 * p;
  }
  return { t, dura: x + 1.5 };
}
const CLAVE = { 14: tramos('CS3B ____', 22), 0: tramos('4U1UN ____', 22) }, SUELTA = tramos('VVV DE EA7JRS/B IM76HR', 14);
const suena = (k, seg) => { for (const [a, b, amp] of k.t) if (seg >= a && seg < b) return amp; return 0; };
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
            if (modo === 'cw') {
              const banda = BANDAS.findIndex((f) => Math.abs(f - 0.5 - khz) < 0.01), ahora = Date.now() / 1000;
              for (let k = 0; k < 512; k++) {
                const seg = ahora + k / RATE;
                let amp = 0;
                if (banda < 0) amp = 2500 * suena(SUELTA, seg % SUELTA.dura);
                else {
                  const baliza = (((Math.floor((seg % 180) / 10) - banda) % 18) + 18) % 18;
                  if (baliza === 14 && banda <= 2) amp = 2500 * suena(CLAVE[14], seg % 10);
                  if (baliza === 0 && banda === 0) amp = 250 * suena(CLAVE[0], seg % 10);
                }
                b.writeInt16BE(Math.round(amp * Math.sin(2 * Math.PI * 500 * (i + k) / RATE) + 150 * (Math.random() + Math.random() + Math.random() - 1.5)), 10 + 2 * k);
              }
            }
            if (modo !== 'cw') for (let k = 0; k < 512; k++) b.writeInt16BE(PCM.readInt16LE(((i + k) * 2) % (PCM.length - 1) & ~1), 10 + 2 * k);
            i += 512; s.write(tr(b));
          }
        }, 20);
      }
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log('KiwiSDR de pega (sat-aprs) en', PORT));
