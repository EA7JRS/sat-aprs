#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Uso: IQ_FALSO=<muestras de 8 bits a 2,4 MS/s> y dar este archivo como programa a EstacionHackrf (quinto argumento).
// hackrf_transfer de pega: manda un archivo de muestras a 2,4 MS/s, en bucle. Nunca se emite nada.
const fs = require('fs'); const d = fs.readFileSync(process.env.IQ_FALSO); let i = 0; const t0 = Date.now(); let dado = 0;
process.stderr.write('call hackrf_set_sample_rate(2400000 Hz/2.400 MHz)\n');
process.stdout.on('error', () => process.exit(0));
setInterval(() => { const quiero = Math.floor((Date.now() - t0) / 1000 * 4800000); while (dado < quiero) { const n = Math.min(262144, quiero - dado, d.length - i); process.stdout.write(d.subarray(i, i + n)); i = (i + n) % d.length; dado += n; } }, 20);
