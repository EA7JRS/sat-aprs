// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Biblioteca de fórmulas de S.A.T.-APRS.
//
// geo, astro, wxcalc, wind, motion, units y wmm son el porte fiel del núcleo
// del plotter APRS LoRa+ (mismos nombres y mismos resultados, comprobados
// contra el código original). wxextra, nautica, radio y fisica añaden lo que
// necesita esta estación, con la referencia de cada fórmula.
export * as geo from './geo';
export * as astro from './astro';
export * as wxcalc from './wxcalc';
export * as wxextra from './wxextra';
export * as wind from './wind';
export * as motion from './motion';
export * as units from './units';
export * as wmm from './wmm';
export * as nautica from './nautica';
export * as radio from './radio';
export * as fisica from './fisica';
