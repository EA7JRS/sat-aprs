export interface WiresXNode {
  nodeId: string;
  roomId: string;
  callsign: string;
  frequency: number; // MHz
  squelch: string; // Tone, DSQ, DG-ID, or Direct
  city: string;
  state: string; // Province / region
  country: string;
  comment?: string;
  distance?: number; // Dynamic calculated distance
  coords?: { lat: number; lon: number };
}

export interface WiresXRoom {
  roomId: string;
  name: string;
  description: string;
  activeNodesCount: number;
}

// Preset popular Wires-X Rooms (mostly Spain and key international)
export const WIRESX_ROOMS_PRESET: WiresXRoom[] = [
  { roomId: "21005", name: "SPAIN-CQ", description: "Sala general de conversación de radioaficionados en España", activeNodesCount: 145 },
  { roomId: "21000", name: "SPAIN", description: "Sala principal para enlaces analógicos y digitales Yaesu Fusion en España", activeNodesCount: 92 },
  { roomId: "21015", name: "CATALUNYA", description: "Sala regional de Catalunya - Activistas de C4FM", activeNodesCount: 48 },
  { roomId: "21020", name: "ANDALUCIA", description: "Sala regional de Andalucía - Distrito 7 C4FM", activeNodesCount: 37 },
  { roomId: "21030", name: "MADRID", description: "Sala regional de la Comunidad de Madrid y zona centro", activeNodesCount: 54 },
  { roomId: "21040", name: "CANARIAS", description: "Sala regional de Islas Canarias y zona atlántica", activeNodesCount: 22 },
  { roomId: "21050", name: "GALICIA", description: "Sala regional de Galicia - Distrito 1", activeNodesCount: 29 },
  { roomId: "21060", name: "BASQUE-CQ", description: "Sala regional de Euskadi y Navarra C4FM", activeNodesCount: 18 },
  { roomId: "21100", name: "VALENCIA", description: "Sala regional de la Comunidad Valenciana", activeNodesCount: 41 },
  { roomId: "21110", name: "MURCIA", description: "Sala regional de Murcia - Distrito 5 C4FM", activeNodesCount: 15 },
  { roomId: "21080", name: "ASTURIAS", description: "Sala regional del Principado de Asturias", activeNodesCount: 12 },
  { roomId: "20001", name: "ARRL-ROOM", description: "American Radio Relay League general room (USA)", activeNodesCount: 310 },
  { roomId: "20555", name: "CALIFORNIA-CQ", description: "California C4FM & Wires-X Connection Group", activeNodesCount: 180 },
  { roomId: "21200", name: "UK-WIDE", description: "United Kingdom National Wires-X Linking Room", activeNodesCount: 245 },
  { roomId: "20005", name: "JAPAN-CQ", description: "Japan National C4FM & Wires-X Room (Worldwide)", activeNodesCount: 412 },
  { roomId: "21500", name: "FRANCE-ROOM", description: "France Nationale C4FM inter-connexion", activeNodesCount: 115 }
];

// Presets for WIRES-X active nodes list (Spain and key worldwide)
export const WIRESX_NODES_DATABASE: WiresXNode[] = [
  {
    nodeId: "11005",
    roomId: "21005",
    callsign: "EA1HFI-ND",
    frequency: 145.2875,
    squelch: "Tone 77.0",
    city: "Gijón",
    state: "Asturias",
    country: "Spain",
    comment: "Nodo activo en distrito 1. Enlace REMER / Proteccion Civil"
  },
  {
    nodeId: "18001",
    roomId: "21005",
    callsign: "EA1URA-ND",
    frequency: 144.9250,
    squelch: "Tone 77.0",
    city: "Santiago de Compostela",
    state: "Galicia",
    country: "Spain",
    comment: "Sección URE Santiago. Enlace a red nacional."
  },
  {
    nodeId: "11050",
    roomId: "21080",
    callsign: "EA1ZAE-ND",
    frequency: 145.5875,
    squelch: "DG-ID 01",
    city: "Gijón - Pico San Martín",
    state: "Asturias",
    country: "Spain",
    comment: "Repetidor D-Star / C4FM multimodo"
  },
  {
    nodeId: "12101",
    roomId: "21060",
    callsign: "EA2YAC-ND",
    frequency: 145.6000,
    squelch: "DSQ 24",
    city: "Bilbao - Monte Oiz",
    state: "País Vasco",
    country: "Spain",
    comment: "Excelente cobertura País Vasco y Cantabria oriental."
  },
  {
    nodeId: "13054",
    roomId: "21015",
    callsign: "EA3YBK-ND",
    frequency: 145.5750,
    squelch: "DG-ID 15",
    city: "Esparreguera",
    state: "Catalunya",
    country: "Spain",
    comment: "Comunidad C4FM Catalana activa"
  },
  {
    nodeId: "13210",
    roomId: "21015",
    callsign: "EA3CWQ-ND",
    frequency: 145.6000,
    squelch: "Tone 94.8",
    city: "Les Gabarres (Girona)",
    state: "Catalunya",
    country: "Spain",
    comment: "Excelente cobertura Costa Brava y Girona centro"
  },
  {
    nodeId: "14234",
    roomId: "21030",
    callsign: "EA4YAD-ND",
    frequency: 145.6000,
    squelch: "DSQ 50",
    city: "Alcorcón",
    state: "Comunidad de Madrid",
    country: "Spain",
    comment: "Estación repetidora zona suroeste metropolitana"
  },
  {
    nodeId: "14250",
    roomId: "21030",
    callsign: "EA4YAW-ND",
    frequency: 51.9500,
    squelch: "Tone 88.5",
    city: "Alto del León",
    state: "Comunidad de Madrid",
    country: "Spain",
    comment: "Repetidor de 6 metros FM/C4FM sintonizable"
  },
  {
    nodeId: "15123",
    roomId: "21100",
    callsign: "EA5YAM-ND",
    frequency: 145.5750,
    squelch: "DG-ID 55",
    city: "Castell de Castells",
    state: "Comunidad Valenciana",
    country: "Spain",
    comment: "Alicante interior con gran cobertura en comarcas"
  },
  {
    nodeId: "15004",
    roomId: "21110",
    callsign: "EA5YAK-ND",
    frequency: 145.6000,
    squelch: "DG-ID 01",
    city: "Sierra Espuña",
    state: "Murcia",
    country: "Spain",
    comment: "Nodo de alta cobertura regional de Murcia."
  },
  {
    nodeId: "15150",
    roomId: "21110",
    callsign: "EA5YAT-ND",
    frequency: 145.6250,
    squelch: "DG-ID 12",
    city: "Águilas",
    state: "Murcia",
    country: "Spain",
    comment: "Cobertura litoral murciano y Almería norte"
  },
  {
    nodeId: "16010",
    roomId: "21090",
    callsign: "EA6YAD-ND",
    frequency: 145.6000,
    squelch: "Tone 88.5",
    city: "Monte Toro (Menorca)",
    state: "Illes Balears",
    country: "Spain",
    comment: "Enlace interislas y cobertura marítima balear"
  },
  {
    nodeId: "17210",
    roomId: "21020",
    callsign: "EA7YAZ-ND",
    frequency: 145.6125,
    squelch: "Tone 88.5",
    city: "Almonaster Real (Huelva)",
    state: "Andalucía",
    country: "Spain",
    comment: "Cerro San Cristóbal, Huelva norte y Extremadura sur"
  },
  {
    nodeId: "17098",
    roomId: "21020",
    callsign: "EA7URA-ND",
    frequency: 145.6000,
    squelch: "DG-ID 77",
    city: "Tarifa",
    state: "Andalucía",
    country: "Spain",
    comment: "Sección URE Algeciras - Estrecho de Gibraltar"
  },
  {
    nodeId: "18045",
    roomId: "21040",
    callsign: "EA8YAA-ND",
    frequency: 145.6000,
    squelch: "DSQ 08",
    city: "Peñas del Chache (Lanzarote)",
    state: "Canarias",
    country: "Spain",
    comment: "Gran alcance en provincia de Las Palmas y mar"
  },
  {
    nodeId: "19001",
    roomId: "21005",
    callsign: "EA9CE-ND",
    frequency: 144.9500,
    squelch: "Tone 88.5",
    city: "Ceuta (Ciudad Autónoma)",
    state: "Ceuta",
    country: "Spain",
    comment: "Enlace norte de África con red general"
  },
  {
    nodeId: "19010",
    roomId: "21005",
    callsign: "EA9ML-ND",
    frequency: 145.3750,
    squelch: "Tone 82.5",
    city: "Melilla (Ciudad Autónoma)",
    state: "Melilla",
    country: "Spain",
    comment: "Sección URE Melilla enlace Wires-X activo"
  },
  {
    nodeId: "11400",
    roomId: "21005",
    callsign: "EA1YBT-ND",
    frequency: 145.6250,
    squelch: "Tone 77.0",
    city: "Burgos - Pico Trigaza",
    state: "Castilla y León",
    country: "Spain",
    comment: "Nodo repetidor de alta montaña"
  },
  {
    nodeId: "12045",
    roomId: "21005",
    callsign: "EA2YAI-ND",
    frequency: 145.6250,
    squelch: "Tone 123.0",
    city: "Calatayud",
    state: "Aragón",
    country: "Spain",
    comment: "Repetidor Valle del Jalón"
  },
  {
    nodeId: "13204",
    roomId: "21015",
    callsign: "EA3YBA-ND",
    frequency: 145.6250,
    squelch: "Direct C4FM",
    city: "Girona - Santa Magdalena",
    state: "Catalunya",
    country: "Spain",
    comment: "Girona interior e interconexión pirenaica"
  },
  // Key International Nodes from active_node2.php
  {
    nodeId: "10001",
    roomId: "20001",
    callsign: "W1AW-ND",
    frequency: 146.9400,
    squelch: "Tone 100.0",
    city: "Newington",
    state: "Connecticut",
    country: "USA",
    comment: "ARRL Headquarters Station Active Node"
  },
  {
    nodeId: "15432",
    roomId: "20555",
    callsign: "K6YUR-ND",
    frequency: 447.5000,
    squelch: "DSQ 10",
    city: "Los Angeles",
    state: "California",
    country: "USA",
    comment: "Socal Digital Link Gateway"
  },
  {
    nodeId: "13245",
    roomId: "21200",
    callsign: "G4YCR-ND",
    frequency: 430.0250,
    squelch: "Tone 77.0",
    city: "London",
    state: "Greater London",
    country: "United Kingdom",
    comment: "London Central Fusion Link Node"
  },
  {
    nodeId: "10543",
    roomId: "20005",
    callsign: "JA1YUA-ND",
    frequency: 439.1200,
    squelch: "DG-ID 01",
    city: "Tokyo",
    state: "Kanto",
    country: "Japan",
    comment: "Tokyo Yaesu Club Wires-X Main Node"
  },
  {
    nodeId: "11293",
    roomId: "21500",
    callsign: "F1ZUX-ND",
    frequency: 145.5500,
    squelch: "Tone 123.0",
    city: "Paris",
    state: "Île-de-France",
    country: "France",
    comment: "Relais C4FM Paris Centre"
  }
];

// Helper to parse Wires-X HTML or Raw Text from active_node2.php copy-paste
export function parseWiresXRawText(text: string): WiresXNode[] {
  const parsedNodes: WiresXNode[] = [];
  
  // Wires-X active_node2.php structure usually contains rows or lines with DTMF/User ID, Callsign, Frequency, Squelch, City, State, Country, Room ID, etc.
  // In raw text format, it is often separated by tabs or spaces.
  // Example lines from active_node2.php:
  // "11005   EA1HFI-ND   145.2875   Tone 77.0   Gijon   Asturias   Spain   21005   SPAIN-CQ"
  // "18001   EA1URA-ND   144.9250   Tone 77.0   Santiago de Compostela   Galicia   Spain   21005   SPAIN-CQ"
  
  // Let's support split lines
  const lines = text.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.toUpperCase().startsWith("USER ID") || trimmed.toUpperCase().startsWith("NODE ID")) {
      continue;
    }
    
    // Check if it's CSV-like, tab-separated, or multi-space separated
    let parts: string[] = [];
    if (trimmed.includes("\t")) {
      parts = trimmed.split("\t");
    } else if (trimmed.includes(",")) {
      parts = trimmed.split(",");
    } else {
      parts = trimmed.split(/\s{2,}/); // 2 or more spaces
    }
    
    // Clean parts
    parts = parts.map(p => p.trim()).filter(p => p !== "");
    
    // Minimal valid columns: Callsign, NodeId, Frequency (at least 3-4 columns)
    if (parts.length >= 3) {
      // Find which part looks like NodeId (5 digits), Frequency (number with dot), Callsign (alpha-numeric)
      let nodeId = "";
      let callsign = "";
      let frequency = 0;
      let squelch = "Direct / DSQ";
      let city = "Desconocida";
      let state = "Desconocido";
      let country = "España";
      let roomId = "";
      
      // Heuristic parsing
      for (const part of parts) {
        if (/^\d{5}$/.test(part)) {
          if (!nodeId) nodeId = part;
          else if (!roomId) roomId = part;
        } else if (/^\d{3}\.\d+$/.test(part)) {
          frequency = parseFloat(part);
        } else if (/^[A-Z0-9]{3,10}(-ND)?$/i.test(part)) {
          callsign = part.toUpperCase();
        }
      }
      
      // If we didn't find by strict regex, map by indices (assuming default columns)
      // Standard active_node2.php:
      // Column index representation:
      // 0: Node/User ID, 1: Callsign, 2: Frequency, 3: Squelch/Tone, 4: City, 5: State, 6: Country, 7: Room ID/Name
      if (!nodeId && /^\d+$/.test(parts[0])) nodeId = parts[0];
      if (!callsign && parts[1]) callsign = parts[1].toUpperCase();
      if (frequency === 0 && parts[2]) {
        const parsedFreq = parseFloat(parts[2].replace(/[^\d.]/g, ""));
        if (!isNaN(parsedFreq)) frequency = parsedFreq;
      }
      
      if (nodeId && callsign && frequency > 0) {
        // Collect others
        squelch = parts[3] || "Directo";
        city = parts[4] || "Sintonía Local";
        state = parts[5] || "Provincia";
        country = parts[6] || "Spain";
        roomId = parts[7] || "21005"; // Default SPAIN-CQ
        
        parsedNodes.push({
          nodeId,
          roomId,
          callsign,
          frequency,
          squelch,
          city,
          state,
          country,
          comment: `Importado de Yaesu active_node2.php (${new Date().toLocaleDateString()})`
        });
      }
    }
  }
  
  return parsedNodes;
}

// Helper to parse Wires-X Rooms HTML or Raw Text from active_room2.php copy-paste
export function parseWiresXRoomsRawText(text: string): WiresXRoom[] {
  const parsedRooms: WiresXRoom[] = [];
  
  // Wires-X active_room2.php structure contains lines with:
  // Room ID (DTMF ID, 5 digits), Room Name, City, State, Country, Active Nodes Count, Description
  // Example lines:
  // "21005   SPAIN-CQ   Alicante   Comunidad Valenciana   Spain   145   Sala general de conversación de España"
  // "21015   CATALUNYA   Barcelona   Catalunya   Spain   48   Sala de C4FM regional catalana"
  
  const lines = text.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.toUpperCase().startsWith("USER ID") || trimmed.toUpperCase().startsWith("ROOM ID")) {
      continue;
    }
    
    let parts: string[] = [];
    if (trimmed.includes("\t")) {
      parts = trimmed.split("\t");
    } else if (trimmed.includes(",")) {
      parts = trimmed.split(",");
    } else {
      parts = trimmed.split(/\s{2,}/); // 2 or more spaces
    }
    
    parts = parts.map(p => p.trim()).filter(p => p !== "");
    
    if (parts.length >= 2) {
      let roomId = "";
      let name = "";
      let city = "Desconocida";
      let state = "Desconocido";
      let country = "España";
      let activeNodesCount = 0;
      let description = "Sala de conferencia activa";
      
      // Parse by heuristic or strict layout
      // Standard active_room2.php format:
      // Column index:
      // 0: Room ID (5 digits), 1: Room Name, 2: City, 3: State, 4: Country, 5: Count of nodes, 6: Comment/Description
      if (/^\d{5}$/.test(parts[0])) {
        roomId = parts[0];
      }
      
      if (parts[1]) {
        name = parts[1].toUpperCase();
      }
      
      if (roomId && name) {
        city = parts[2] || "Sintonía Local";
        state = parts[3] || "Provincia";
        country = parts[4] || "Spain";
        
        // Count parsing
        if (parts[5]) {
          const parsedCount = parseInt(parts[5].replace(/[^\d]/g, ""), 10);
          if (!isNaN(parsedCount)) {
            activeNodesCount = parsedCount;
          }
        }
        
        description = parts[6] || `Sala enlazada activa en ${city}`;
        
        parsedRooms.push({
          roomId,
          name,
          description,
          activeNodesCount
        });
      }
    }
  }
  
  return parsedRooms;
}

