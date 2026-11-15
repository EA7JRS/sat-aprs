// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Paquete APRS que guarda la consola en el navegador: mensajes y boletines
// recibidos para esta estación (aviso emergente) y los de Coordinación.

export interface AprsPacket {
  id: string;
  sourceEventId: string;
  eventType: 'sismo' | 'incendio' | 'meteo' | 'radiologico' | 'dgt' | 'manual';
  originalTitle: string;
  originalDetail: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  callsign: string;      // Source e.g. EA4SAT-1
  destination: string;   // Destination e.g. APCE01
  path: string;          // e.g. WIDE1-1,WIDE2-1
  aprsType: 'BULLETIN' | 'OBJECT' | 'BEACON' | 'MESSAGE';
  symbol: string;        // Symbol character e.g. [, \, #
  messageText: string;   // Synthesized message body
  packetString: string;  // Full raw APRS string
  status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'TRANSMITIDO';
  auditNotes?: string;
  auditedBy?: string;
  auditedAt?: string;
  transmittedAt?: string;
  isEmergency: boolean;  // Flags severe emergency broadcasts
  visualPriority?: 'Crítica' | 'Alta' | 'Informativa' | 'Normal';
}
