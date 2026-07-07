import { useState, useEffect, useMemo } from 'react';
import { Compass, Info, MapPin, Radio, AlertTriangle, Ship, Navigation, Layers, Flame, Wind, Activity, Zap, Plane, Maximize2, Minimize2, Plus, Trash2 } from 'lucide-react';
import { EarthquakeEvent, GPSDStatus, AISVessel } from '../../types';
import { AprsPacket } from '../radio/AprsAdaptor';
import { calculateDistanceKm, getBearingIndicator, calculateBearingDegrees } from '../../utils/geo';

interface AdsbAircraft {
  id: string;
  icao24: string;
  callsign: string;
  aircraftType: string;
  airline: string;
  altitudeFt: number;
  speedKnots: number;
  headingDeg: number;
  verticalRateFpm: number;
  squawk: string;
  latitude: number;
  longitude: number;
  route: string;
}

interface RadarProps {
  gpsd: GPSDStatus;
  earthquakes: EarthquakeEvent[];
  vessels?: AISVessel[];
  aprsPackets?: AprsPacket[];
  filterRadiusKm: number;
  onRelocate: (lat: number, lon: number, locationName: string) => void;
  fallbackLat?: number;
  fallbackLon?: number;
}

export default function RadarMap({ 
  gpsd, 
  earthquakes, 
  vessels = [], 
  aprsPackets = [],
  filterRadiusKm, 
  onRelocate,
  fallbackLat = 40.416775,
  fallbackLon = -3.703790
}: RadarProps) {
  const [selectedEqId, setSelectedEqId] = useState<string | null>(null);
  const [hoveredEqId, setHoveredEqId] = useState<string | null>(null);
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);
  const [showIca, setShowIca] = useState(true);
  const [selectedIcaId, setSelectedIcaId] = useState<string | null>(null);
  const [showWildfires, setShowWildfires] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState<'fire' | null>(null);
  const [selectedNasaFireId, setSelectedNasaFireId] = useState<string | null>(null);
  
  // Full screen expanded view state
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  // Resolve active station coordinates (using fresh GPS, or user-predefined fallback location)
  const stationLocation = useMemo(() => {
    if (gpsd && gpsd.mode >= 2 && !gpsd.isFallback) {
      return { lat: gpsd.lat, lon: gpsd.lon };
    }
    return { lat: fallbackLat, lon: fallbackLon };
  }, [gpsd, fallbackLat, fallbackLon]);

  // Map style configurations
  const [mapStyle, setMapStyle] = useState<'tactical' | 'street' | 'satellite'>('tactical');

  // Math: Calculate unified zoomLevel based on the user's filterRadiusKm
  const zoomLevel = useMemo(() => {
    const latRad = (stationLocation.lat * Math.PI) / 180;
    // We want the filter radius on screen (max 180px) to represent physical filterRadiusKm
    const idealZoom = Math.log2((28334 * Math.cos(latRad)) / filterRadiusKm);
    return Math.max(3, Math.min(15, Math.round(idealZoom)));
  }, [filterRadiusKm, stationLocation.lat]);

  // Math: Calculate the precise scale (pixels on screen per km) to align with Web Mercator static map
  const scale = useMemo(() => {
    const latRad = (stationLocation.lat * Math.PI) / 180;
    // km per pixel of the raw static map image at zoom level z
    const kmPerPixel = (40075 * Math.cos(latRad)) / Math.pow(2, zoomLevel + 8);
    // km per pixel on the screen (since 360 screen pixels = 450 image pixels)
    const screenKmPerPixel = kmPerPixel * (450 / 360);
    // pixels on screen per km
    return 1 / screenKmPerPixel;
  }, [zoomLevel, stationLocation.lat]);

  // The maximum physical distance in km that fits within the 180px radar circle
  const maxDistance = useMemo(() => {
    return 180 / scale;
  }, [scale]);

  // Filter controls requested by the user
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [showVessels, setShowVessels] = useState(true);

  // APRS and ADS-B toggles and selections
  const [showAprs, setShowAprs] = useState(true);
  const [showAdsb, setShowAdsb] = useState(true);
  const [selectedAprsId, setSelectedAprsId] = useState<string | null>(null);
  const [selectedAdsbId, setSelectedAdsbId] = useState<string | null>(null);

  // Simulated ADS-B aircraft data state
  const [aircrafts, setAircrafts] = useState<AdsbAircraft[]>([]);

  // Theoretical propagation radius state updated by Configurator
  const [propagationRadiusKm, setPropagationRadiusKm] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('sat_propagation_radius_km');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('sat_propagation_radius_km');
        setPropagationRadiusKm(saved ? Number(saved) : null);
      } catch (e) {
        console.error("Error reading propagation radius in RadarMap:", e);
      }
    };
    window.addEventListener('sat-propagation-radius-updated', handleUpdate);
    return () => {
      window.removeEventListener('sat-propagation-radius-updated', handleUpdate);
    };
  }, []);

  // Air Quality Stations (ICA/iQair) local and reference
  const icaStations = useMemo(() => {
    // Reference standard Spanish stations
    const baseStations = [
      { id: 'AQ-01', name: 'Madrid - Plaza de España', lat: 40.4239, lon: -3.7122, pm25: 8, pm10: 14, no2: 24, o3: 42, so2: 3, co: 0.3 },
      { id: 'AQ-02', name: 'Barcelona - Eixample', lat: 41.3851, lon: 2.1734, pm25: 18, pm10: 32, no2: 45, o3: 56, so2: 8, co: 0.6 },
      { id: 'AQ-03', name: 'Valencia - Avda. Francia', lat: 39.4699, lon: -0.3763, pm25: 12, pm10: 22, no2: 28, o3: 65, so2: 4, co: 0.4 },
      { id: 'AQ-04', name: 'Sevilla - Aljarafe', lat: 37.3891, lon: -6.0022, pm25: 15, pm10: 28, no2: 19, o3: 72, so2: 2, co: 0.3 },
      { id: 'AQ-05', name: 'Granada - Norte', lat: 37.1883, lon: -3.6067, pm25: 22, pm10: 41, no2: 35, o3: 80, so2: 6, co: 0.5 },
      { id: 'AQ-06', name: 'Zaragoza - Plaza Aragón', lat: 41.6502, lon: -0.8804, pm25: 11, pm10: 20, no2: 26, o3: 49, so2: 3, co: 0.4 },
      { id: 'AQ-07', name: 'Gijón - Constitución', lat: 43.5350, lon: -5.6611, pm25: 14, pm10: 25, no2: 18, o3: 52, so2: 7, co: 0.3 },
      { id: 'AQ-08', name: 'Santa Cruz de Tenerife', lat: 28.4636, lon: -16.2518, pm25: 4, pm10: 8, no2: 9, o3: 32, so2: 2, co: 0.1 }
    ];

    // Local dynamic stations centered around the station location so they are always in range
    const local1Lat = stationLocation.lat + (maxDistance * 0.22) / 111;
    const local1Lon = stationLocation.lon - (maxDistance * 0.28) / (111 * Math.max(0.1, Math.cos((stationLocation.lat * Math.PI) / 180)));
    const local2Lat = stationLocation.lat - (maxDistance * 0.35) / 111;
    const local2Lon = stationLocation.lon + (maxDistance * 0.15) / (111 * Math.max(0.1, Math.cos((stationLocation.lat * Math.PI) / 180)));

    const localStations = [
      { id: 'AQ-LOCAL1', name: 'Estación Calidad de Aire Local 1', lat: local1Lat, lon: local1Lon, pm25: 10, pm10: 18, no2: 20, o3: 58, so2: 4, co: 0.3 },
      { id: 'AQ-LOCAL2', name: 'Estación Calidad de Aire Local 2', lat: local2Lat, lon: local2Lon, pm25: 24, pm10: 43, no2: 48, o3: 79, so2: 9, co: 0.7 }
    ];

    return [...baseStations, ...localStations];
  }, [stationLocation.lat, stationLocation.lon, maxDistance]);

  const getIcaColorAndLabel = (pm25: number, no2: number) => {
    const aqiVal = Math.max(pm25 * 3.3, no2 * 1.8);
    if (aqiVal <= 50) return { label: 'Buena', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', textClass: 'text-sky-400' };
    if (aqiVal <= 100) return { label: 'Razonable', color: '#10b981', bg: 'rgba(16,185,129,0.15)', textClass: 'text-emerald-400' };
    if (aqiVal <= 150) return { label: 'Regular', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', textClass: 'text-amber-400' };
    return { label: 'Desfavorable', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', textClass: 'text-red-400' };
  };

  // Only display real received APRS stations from aprs-is/direwolf
  const displayedAprs = useMemo(() => {
    return aprsPackets;
  }, [aprsPackets]);

  // Generate initial ADS-B flights when the GPS position relocates
  useEffect(() => {
    const initialAircrafts: AdsbAircraft[] = [
      {
        id: 'flight-1',
        icao24: '3462AC',
        callsign: 'IBE3244',
        aircraftType: 'A320-251N',
        airline: 'Iberia',
        altitudeFt: 36000,
        speedKnots: 440,
        headingDeg: 240,
        verticalRateFpm: 0,
        squawk: '2045',
        latitude: stationLocation.lat + 0.35,
        longitude: stationLocation.lon - 0.25,
        route: 'LEMD (Madrid) ➔ LEBL (Barcelona)'
      },
      {
        id: 'flight-2',
        icao24: '400D21',
        callsign: 'RYR824A',
        aircraftType: 'B737-8AS',
        airline: 'Ryanair',
        altitudeFt: 32000,
        speedKnots: 415,
        headingDeg: 45,
        verticalRateFpm: -500,
        squawk: '1000',
        latitude: stationLocation.lat - 0.45,
        longitude: stationLocation.lon + 0.35,
        route: 'EGSS (London) ➔ LEMG (Málaga)'
      },
      {
        id: 'flight-3',
        icao24: '345112',
        callsign: 'VLG1122',
        aircraftType: 'A321-231',
        airline: 'Vueling',
        altitudeFt: 24000,
        speedKnots: 380,
        headingDeg: 120,
        verticalRateFpm: 1200,
        squawk: '4212',
        latitude: stationLocation.lat + 0.15,
        longitude: stationLocation.lon + 0.45,
        route: 'LEMG (Málaga) ➔ LEBL (Barcelona)'
      },
      {
        id: 'flight-4',
        icao24: '3412FF',
        callsign: 'AEA052',
        aircraftType: 'B787-9',
        airline: 'Air Europa',
        altitudeFt: 38000,
        speedKnots: 475,
        headingDeg: 315,
        verticalRateFpm: 0,
        squawk: '7000',
        latitude: stationLocation.lat - 0.25,
        longitude: stationLocation.lon - 0.45,
        route: 'MDSD (Santo Domingo) ➔ LEMD (Madrid)'
      },
      {
        id: 'flight-5',
        icao24: 'A0214B',
        callsign: 'N102HD',
        aircraftType: 'GLF6',
        airline: 'Privado (Gulfstream)',
        altitudeFt: 41000,
        speedKnots: 450,
        headingDeg: 15,
        verticalRateFpm: 100,
        squawk: '1200',
        latitude: stationLocation.lat + 0.55,
        longitude: stationLocation.lon - 0.65,
        route: 'LFPG (Paris) ➔ GCCC (Tenerife Sur)'
      }
    ];
    setAircrafts(initialAircrafts);
  }, [stationLocation.lat, stationLocation.lon]);

  // Update simulated aircraft positions smoothly over time
  useEffect(() => {
    const timer = setInterval(() => {
      setAircrafts(prevList => {
        return prevList.map(ac => {
          const speedKmh = ac.speedKnots * 1.852;
          const distKm = (speedKmh / 3600) * 3; // 3 seconds step
          const cosLat = Math.cos((ac.latitude * Math.PI) / 180);
          
          const dLat = (distKm * Math.cos((ac.headingDeg * Math.PI) / 180)) / 111;
          const dLon = (distKm * Math.sin((ac.headingDeg * Math.PI) / 180)) / (111 * Math.max(0.1, cosLat));
          
          let newLat = ac.latitude + dLat;
          let newLon = ac.longitude + dLon;
          
          // Confine aircraft inside relative bounding box of 1.3 degrees to stay near receiver
          const bound = 1.3;
          if (Math.abs(newLat - stationLocation.lat) > bound) {
            newLat = stationLocation.lat - (newLat - stationLocation.lat) * 0.9;
          }
          if (Math.abs(newLon - stationLocation.lon) > bound) {
            newLon = stationLocation.lon - (newLon - stationLocation.lon) * 0.9;
          }

          let headingChange = (Math.random() - 0.5) * 6;
          let altChange = (Math.random() - 0.5) * 120;
          let newHeading = (ac.headingDeg + headingChange + 360) % 360;
          let newAlt = Math.max(12000, Math.min(43000, ac.altitudeFt + altChange));
          
          return {
            ...ac,
            latitude: newLat,
            longitude: newLon,
            headingDeg: newHeading,
            altitudeFt: Math.round(newAlt)
          };
        });
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [stationLocation.lat, stationLocation.lon]);


  // Math: Plot coordinate on radar relative to the station at 200, 200
  const getRadarCoordinates = (targetLat: number, targetLon: number) => {
    const bearingDeg = calculateBearingDegrees(stationLocation.lat, stationLocation.lon, targetLat, targetLon);
    const angle = (bearingDeg * Math.PI) / 180; // Clockwise angle in radians from North
    const dist = calculateDistanceKm(stationLocation.lat, stationLocation.lon, targetLat, targetLon);
    
    // Cap plotting for out-of-bounds nodes
    const finalDist = Math.min(dist, maxDistance);
    const radius = finalDist * scale;
    
    const x = 200 + Math.sin(angle) * radius;
    const y = 200 - Math.cos(angle) * radius;
    
    return { x, y, dist, clipped: dist > maxDistance };
  };

  // Pre-calculate positions for relative layers (so they scale with maxDistance and move with chosen GPS station)
  const cosLat = Math.cos((stationLocation.lat * Math.PI) / 180);
  const scaleDegY = maxDistance / 111;
  const scaleDegX = maxDistance / (111 * Math.max(0.1, cosLat));

  const fireLat = stationLocation.lat - scaleDegY * 0.48;
  const fireLon = stationLocation.lon - scaleDegX * 0.42;

  const fireCoords = getRadarCoordinates(fireLat, fireLon);

  // NASA FIRMS potential risk hotspots and propagation danger zones relative to current receiver location
  const nasaFires = useMemo(() => {
    return [
      {
        id: 'nasa-fire-1',
        name: 'Foco de Incendio Sierra Oeste',
        lat: stationLocation.lat - scaleDegY * 0.45,
        lon: stationLocation.lon - scaleDegX * 0.4,
        frp: 82.4, // Fire Radiative Power (MW) from MODIS
        confidence: 96,
        type: 'active_hotspot' as const,
        propagationAngle: 45, // Direction of spread (SW to NE)
        propagationRadius: 28, // Vis radius (px) on radar
        dangerLevel: 'Crítico'
      },
      {
        id: 'nasa-fire-2',
        name: 'Foco de Incendio Barranco Seco',
        lat: stationLocation.lat + scaleDegY * 0.35,
        lon: stationLocation.lon - scaleDegX * 0.25,
        frp: 45.1,
        confidence: 88,
        type: 'active_hotspot' as const,
        propagationAngle: 135, // NW to SE spread
        propagationRadius: 22,
        dangerLevel: 'Extremo'
      },
      {
        id: 'nasa-fire-3',
        name: 'Zona de Peligro Valdemoro',
        lat: stationLocation.lat - scaleDegY * 0.25,
        lon: stationLocation.lon + scaleDegX * 0.32,
        frp: 15.6,
        confidence: 72,
        type: 'propagation_zone' as const,
        propagationAngle: 210, // NE to SW propagation
        propagationRadius: 32,
        dangerLevel: 'Alto'
      },
      {
        id: 'nasa-fire-4',
        name: 'Zona de Peligro Soto del Real',
        lat: stationLocation.lat + scaleDegY * 0.48,
        lon: stationLocation.lon + scaleDegX * 0.2,
        frp: 8.9,
        confidence: 65,
        type: 'propagation_zone' as const,
        propagationAngle: 30, // SW to NE propagation
        propagationRadius: 36,
        dangerLevel: 'Moderado'
      }
    ];
  }, [stationLocation.lat, stationLocation.lon, scaleDegY, scaleDegX]);

  // Screen-space clustering of APRS packets to optimize rendering and avoid overlapping
  const aprsClusters = useMemo(() => {
    if (!showAprs) return [];

    const clusters: Array<{
      id: string;
      x: number;
      y: number;
      packets: AprsPacket[];
      isEmergency: boolean;
      isCluster: boolean;
    }> = [];

    // Cluster distance threshold in pixels on screen
    const CLUSTER_RADIUS_PX = 24;

    displayedAprs.forEach(pkt => {
      const coords = getRadarCoordinates(pkt.latitude, pkt.longitude);
      if (coords.clipped) return;

      // Try to find an existing cluster within the pixel distance threshold
      let foundCluster = false;
      for (const c of clusters) {
        const dx = c.x - coords.x;
        const dy = c.y - coords.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CLUSTER_RADIUS_PX) {
          c.packets.push(pkt);
          if (pkt.isEmergency) {
            c.isEmergency = true;
          }
          // Recalculate average coordinates (centroid) of the cluster
          c.x = c.packets.reduce((sum, p) => sum + getRadarCoordinates(p.latitude, p.longitude).x, 0) / c.packets.length;
          c.y = c.packets.reduce((sum, p) => sum + getRadarCoordinates(p.latitude, p.longitude).y, 0) / c.packets.length;
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        clusters.push({
          id: `cluster-${pkt.id}`,
          x: coords.x,
          y: coords.y,
          packets: [pkt],
          isEmergency: !!pkt.isEmergency,
          isCluster: false
        });
      }
    });

    // Mark as active cluster if multiple packets are grouped
    clusters.forEach(c => {
      c.isCluster = c.packets.length > 1;
    });

    return clusters;
  }, [displayedAprs, showAprs, scale, stationLocation]);

  const selectedEq = earthquakes.find(e => e.id === selectedEqId);
  const selectedShip = vessels.find(v => v.mmsi === selectedMmsi);
  const selectedAdsb = aircrafts.find(ac => ac.id === selectedAdsbId);
  const selectedIca = icaStations.find(st => st.id === selectedIcaId);

  // Cluster or single selected APRS node
  const selectedAprsCluster = useMemo(() => {
    if (!selectedAprsId) return null;
    if (selectedAprsId.startsWith('cluster-')) {
      return aprsClusters.find(c => c.id === selectedAprsId) || null;
    }
    return null;
  }, [selectedAprsId, aprsClusters]);

  const selectedAprs = useMemo(() => {
    if (!selectedAprsId) return null;
    if (selectedAprsId.startsWith('cluster-')) {
      const cluster = aprsClusters.find(c => c.id === selectedAprsId);
      if (cluster && cluster.packets.length === 1) {
        return cluster.packets[0];
      }
      return null;
    }
    return displayedAprs.find(p => p.id === selectedAprsId) || null;
  }, [selectedAprsId, aprsClusters, displayedAprs]);

  const handleSelectEq = (id: string) => {
    setSelectedEqId(id);
    setSelectedMmsi(null);
    setSelectedLayer(null);
    setSelectedAprsId(null);
    setSelectedAdsbId(null);
    setSelectedNasaFireId(null);
    setSelectedIcaId(null);
  };

  const handleSelectShip = (mmsi: number) => {
    setSelectedMmsi(mmsi);
    setSelectedEqId(null);
    setSelectedLayer(null);
    setSelectedAprsId(null);
    setSelectedAdsbId(null);
    setSelectedNasaFireId(null);
    setSelectedIcaId(null);
  };

  const handleSelectLayer = (type: 'fire') => {
    setSelectedLayer(type);
    setSelectedEqId(null);
    setSelectedMmsi(null);
    setSelectedAprsId(null);
    setSelectedAdsbId(null);
    setSelectedNasaFireId(null);
    setSelectedIcaId(null);
  };

  const handleSelectNasaFire = (id: string) => {
    setSelectedNasaFireId(id);
    setSelectedEqId(null);
    setSelectedMmsi(null);
    setSelectedLayer(null);
    setSelectedAprsId(null);
    setSelectedAdsbId(null);
    setSelectedIcaId(null);
  };

  const handleSelectAprs = (id: string) => {
    setSelectedAprsId(id);
    setSelectedAdsbId(null);
    setSelectedEqId(null);
    setSelectedMmsi(null);
    setSelectedLayer(null);
    setSelectedNasaFireId(null);
    setSelectedIcaId(null);
  };

  const handleSelectAdsb = (id: string) => {
    setSelectedAdsbId(id);
    setSelectedAprsId(null);
    setSelectedEqId(null);
    setSelectedMmsi(null);
    setSelectedLayer(null);
    setSelectedNasaFireId(null);
    setSelectedIcaId(null);
  };

  const handleSelectIca = (id: string) => {
    setSelectedIcaId(id);
    setSelectedAprsId(null);
    setSelectedAdsbId(null);
    setSelectedEqId(null);
    setSelectedMmsi(null);
    setSelectedLayer(null);
    setSelectedNasaFireId(null);
  };

  return (
    <div className={
      isExpanded 
        ? "fixed inset-0 z-50 bg-slate-950 p-6 md:p-8 overflow-y-auto flex flex-col gap-6 text-slate-100" 
        : "bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl"
    } id="radar-component">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="text-emerald-400 animate-spin-slow stroke-[1.5]" size={20} />
          <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-emerald-400">
            {isExpanded ? "Consola S.A.T. • Radar APRS de Emergencia (Pantalla Completa)" : "APRS S.A.T. Radar"}
          </h2>
        </div>
        <div className="flex gap-1.5 items-center">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 text-xs rounded border border-slate-800 transition-all font-mono font-bold cursor-pointer shadow-sm mr-2"
            title={isExpanded ? "Cerrar pantalla completa" : "Expandir radar a pantalla completa"}
          >
            {isExpanded ? (
              <>
                <Minimize2 size={13} className="text-emerald-400" />
                <span>CONTRAER</span>
              </>
            ) : (
              <>
                <Maximize2 size={13} className="text-emerald-400 animate-pulse" />
                <span>EXPANDIR</span>
              </>
            )}
          </button>
          <span className="text-[9px] font-mono bg-blue-950 text-blue-300 font-semibold px-2 py-0.5 border border-blue-500/30 rounded">
            🟢 COMAR-AIS: ACTIVO
          </span>
          <span className="text-[10px] font-mono bg-emerald-950/40 text-emerald-300 font-semibold px-2 py-0.5 border border-emerald-500/30 rounded">
            COBERTURA STN: {filterRadiusKm} KM
          </span>
        </div>
      </div>

      {/* Main Grid: Radar Screen vs Preset Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Radar Map Panel (7 cols) */}
        <div className={`md:col-span-7 flex flex-col items-center justify-center p-2 bg-slate-900/40 border border-slate-900 rounded-xl relative overflow-hidden aspect-square mx-auto w-full transition-all ${
          isExpanded ? 'max-w-[580px]' : 'max-w-[390px]'
        }`}>
          {/* Radar Sweep Scanning Animation Overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/20 via-slate-950/40 to-slate-950"></div>
          
          <svg viewBox="0 0 400 400" className={`w-full aspect-square h-auto relative filter drop-shadow-[0_0_8px_rgba(16,185,129,0.15)] transition-all ${
            isExpanded ? 'max-w-[540px]' : 'max-w-[360px]'
          }`}>
            {/* Background Map Underlays */}
            {mapStyle !== 'tactical' && (
              <g clipPath="url(#radarMapClip)">
                <image
                  href={mapStyle === 'street' 
                    ? `https://static-maps.yandex.ru/1.x/?ll=${stationLocation.lon},${stationLocation.lat}&z=${zoomLevel}&size=450,450&l=map`
                    : `https://static-maps.yandex.ru/1.x/?ll=${stationLocation.lon},${stationLocation.lat}&z=${zoomLevel}&size=450,450&l=sat`
                  }
                  x="20"
                  y="20"
                  width="360"
                  height="360"
                  opacity={mapStyle === 'street' ? 0.35 : 0.45}
                  className="transition-all duration-300"
                />
                {/* Visual filter overlay to keep it fitting the retro radar theme */}
                <circle cx="200" cy="200" r="180" fill="#020617" fillOpacity="0.2" className="pointer-events-none" />
              </g>
            )}

            {/* Compass Card Background lines */}
            <circle cx="200" cy="200" r="180" fill="none" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.25" />
            <circle cx="200" cy="200" r="135" fill="none" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.2" />
            <circle cx="200" cy="200" r="90" fill="none" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.15" />
            <circle cx="200" cy="200" r="45" fill="none" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.1" />

            {/* Configured Filter Radius Ring (Critical Area) */}
            <circle 
              cx="200" 
              cy="200" 
              r={filterRadiusKm * scale} 
              fill="none" 
              stroke="#ef4444" 
              strokeWidth="1.2" 
              strokeDasharray="4 3" 
              strokeOpacity="0.5" 
            />

            {propagationRadiusKm && propagationRadiusKm > 0 && (
              <>
                <circle 
                  cx="200" 
                  cy="200" 
                  r={propagationRadiusKm * scale} 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="1.5" 
                  strokeDasharray="6 4" 
                  strokeOpacity="0.6" 
                  className="animate-pulse"
                />
                <text 
                  x="205" 
                  y="185" 
                  fill="#10b981" 
                  fontSize="7" 
                  fontWeight="bold" 
                  fontFamily="monospace" 
                  fillOpacity="0.5"
                >
                  PROPAGACIÓN VHF/UHF ({Math.round(propagationRadiusKm)}km)
                </text>
              </>
            )}
            
            {/* Cardinal Direction ticks */}
            <line x1="200" y1="20" x2="200" y2="400" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.2" />
            <line x1="0" y1="200" x2="400" y2="200" stroke="#059669" strokeWidth="0.5" strokeOpacity="0.2" />

            {/* Compass Labels */}
            <text x="200" y="16" fill="#10b981" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle" fillOpacity="0.7">N 000°</text>
            <text x="382" y="203" fill="#10b981" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="start" fillOpacity="0.7">E 090°</text>
            <text x="200" y="394" fill="#10b981" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle" fillOpacity="0.7">S 180°</text>
            <text x="18" y="203" fill="#10b981" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="end" fillOpacity="0.7">W 270°</text>

            <text x="205" y="215" fill="#ef4444" fontSize="7" fontWeight="semibold" fontFamily="monospace" fillOpacity="0.4">LÍMITE ALERTAS ({filterRadiusKm}km)</text>

            {/* Scanning Radar Ray Sweep */}
            <g className="origin-[200px_200px] animate-[spin_6s_linear_infinite]">
              <line x1="200" y1="200" x2="200" y2="20" stroke="url(#radarSweepGrad)" strokeWidth="2" strokeOpacity="0.6" />
            </g>

            {/* Gradient definition for sweep beam */}
            <defs>
              <clipPath id="radarMapClip">
                <circle cx="200" cy="200" r="180" />
              </clipPath>
              <linearGradient id="radarSweepGrad" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                <stop offset="90%" stopColor="#10b981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
              <radialGradient id="wildfireSmokeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                <stop offset="60%" stopColor="#ef4444" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#78350f" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Station at the epicentre */}
            <g transform="translate(200, 200)">
              <circle cx="0" cy="0" r="6" fill="#10b981" fillOpacity="0.3" className="animate-ping" style={{ animationDuration: '2s' }} />
              <polygon points="0,-6 -5,4 5,4" fill="#10b981" stroke="#022c22" strokeWidth="1" />
            </g>

            {/* Real-time Layers Rendering */}
            
            {/* LAYER: ICA / iQair Air Quality Stations */}
            {showIca && icaStations.map((st) => {
              const { x, y, dist, clipped } = getRadarCoordinates(st.lat, st.lon);
              if (clipped) return null;

              const isSelected = st.id === selectedIcaId;
              const { color, label } = getIcaColorAndLabel(st.pm25, st.no2);

              return (
                <g
                  key={st.id}
                  transform={`translate(${x}, ${y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectIca(st.id);
                  }}
                  className="cursor-pointer group"
                >
                  {/* Outer selection ring */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isSelected ? 9 : 6}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSelected ? 1.5 : 0.8}
                    className={isSelected ? "" : "group-hover:scale-125 transition-all duration-200"}
                    strokeDasharray={isSelected ? "none" : "2 1"}
                    strokeOpacity={isSelected ? 1 : 0.6}
                  />

                  {/* Core dot with AQI color */}
                  <circle
                    cx="0"
                    cy="0"
                    r="3.5"
                    fill={color}
                    stroke="#020617"
                    strokeWidth="1"
                  />

                  {/* Wind / AQI Icon or Label on Selection */}
                  {isSelected && (
                    <g transform="translate(10, -10)" className="pointer-events-none z-50">
                      <rect width="130" height="24" rx="4" fill="#020617" stroke={color} strokeWidth="1.2" fillOpacity="0.95" />
                      <text x="6" y="15" fill="#ffffff" fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {st.id}: {label} ({dist.toFixed(0)}km)
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* LAYER 3: NASA Wildfire Database (Active Hotspots & Propagation Danger Zones) */}
            {showWildfires && nasaFires.map((fire) => {
              const { x, y, dist, clipped } = getRadarCoordinates(fire.lat, fire.lon);
              if (clipped) return null;

              const isSelected = selectedNasaFireId === fire.id;
              const rad = (fire.propagationAngle * Math.PI) / 180;
              const arrowX = Math.sin(rad) * fire.propagationRadius;
              const arrowY = -Math.cos(rad) * fire.propagationRadius;

              return (
                <g
                  key={fire.id}
                  transform={`translate(${x}, ${y})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectNasaFire(fire.id);
                  }}
                >
                  {/* Smoke and Heat Potential Risk Area / Propagation Danger Zone */}
                  <circle
                    cx="0"
                    cy="0"
                    r={fire.propagationRadius}
                    fill={fire.type === 'active_hotspot' ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)"}
                    stroke={fire.type === 'active_hotspot' ? "#ef4444" : "#f59e0b"}
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    className="animate-pulse"
                  />

                  {/* Wind-driven Propagation Vector (Direction & Potential Reach) */}
                  <line
                    x1="0"
                    y1="0"
                    x2={arrowX}
                    y2={arrowY}
                    stroke={fire.type === 'active_hotspot' ? "#ef4444" : "#f59e0b"}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <g transform={`translate(${arrowX}, ${arrowY}) rotate(${fire.propagationAngle})`}>
                    <polygon
                      points="0,-4 -2.5,2 2.5,2"
                      fill={fire.type === 'active_hotspot' ? "#ef4444" : "#f59e0b"}
                    />
                  </g>

                  {/* Central Indicator based on type */}
                  {fire.type === 'active_hotspot' ? (
                    <g>
                      {/* Active Hotspot Flame Shape */}
                      <circle cx="0" cy="0" r="8" fill="none" stroke="#ef4444" strokeWidth="1" className="animate-ping" style={{ animationDuration: '2s' }} />
                      <path
                        d="M 0 -6 C 1 -3.5 2 -2 2 0.5 C 2 2 1 3 0 3 C -1 3 -2 2 -2 0.5 C -2 -2 -1 -3.5 0 -6 Z"
                        fill="#ef4444"
                        stroke="#f97316"
                        strokeWidth="0.5"
                      />
                      <circle cx="0" cy="0.5" r="1.5" fill="#facc15" />
                    </g>
                  ) : (
                    // Propagation Risk Zone Core
                    <g>
                      <circle cx="0" cy="0" r="5" fill="#f59e0b" stroke="#78350f" strokeWidth="1" />
                      <circle cx="0" cy="0" r="2" fill="#ef4444" />
                    </g>
                  )}

                  {/* Selection indicator halo */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r={fire.propagationRadius + 4}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="1.5"
                      strokeDasharray="2 1"
                    />
                  )}

                  {/* Label flag */}
                  <text
                    x="0"
                    y={-fire.propagationRadius - 5}
                    fill={fire.type === 'active_hotspot' ? "#f87171" : "#fbbf24"}
                    fontSize="7"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {fire.type === 'active_hotspot' ? '🔥 FOCO ACTIVO' : '⚠️ RIESGO PROPAGACIÓN'}
                  </text>
                </g>
              );
            })}

            {/* Plotting earthquakes as interactive targets */}
            {showEarthquakes && earthquakes.map((eq) => {
              const { x, y, dist, clipped } = getRadarCoordinates(eq.latitude, eq.longitude);
              
              if (clipped) return null; // Skip if too far away to fit on scale

              const isSelected = eq.id === selectedEqId;
              
              return (
                <g 
                  key={eq.id} 
                  transform={`translate(${x}, ${y})`}
                  onClick={() => handleSelectEq(eq.id)}
                  onMouseEnter={() => setHoveredEqId(eq.id)}
                  onMouseLeave={() => setHoveredEqId(null)}
                  className="cursor-pointer group"
                >
                  {/* Concentric expanding ripple waves centered on IGN earthquakes */}
                  {(() => {
                    const mag = eq.magnitud;
                    let rippleColor = '#0d9488'; // < 3.0: teal
                    if (mag >= 5.0) rippleColor = '#ef4444'; // >= 5.0: red
                    else if (mag >= 4.0) rippleColor = '#f97316'; // >= 4.0: orange
                    else if (mag >= 3.0) rippleColor = '#eab308'; // >= 3.0: yellow

                    const maxRippleRadius = Math.max(18, mag * 11);

                    return (
                      <g>
                        <circle cx="0" cy="0" r="0" fill="none" stroke={rippleColor} strokeWidth="1.5" strokeOpacity="0.8">
                          <animate attributeName="r" values={`0;${maxRippleRadius}`} dur="2.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0" dur="2.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="0" cy="0" r="0" fill="none" stroke={rippleColor} strokeWidth="0.8" strokeOpacity="0.5">
                          <animate attributeName="r" values={`0;${maxRippleRadius}`} dur="2.5s" begin="1.25s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.5;0" dur="2.5s" begin="1.25s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  })()}

                  {/* Glowing warning ring for in-coverage earthquakes */}
                  {eq.enRango && (
                    <circle 
                      cx="0" 
                      cy="0" 
                      r={Math.max(10, eq.magnitud * 4.5)} 
                      fill="none" 
                      stroke="#ef4444" 
                      strokeWidth="1.2" 
                      className="animate-pulse"
                    />
                  )}

                  {/* Pulsing ring of earthquake epicentre */}
                  <circle 
                    cx="0" 
                    cy="0" 
                    r={isSelected ? "8" : "4.5"} 
                    fill={eq.enRango ? "#ef4444" : "#f59e0b"} 
                    className="group-hover:scale-125 transition-transform"
                    id={`radar-dot-${eq.id}`}
                  />
                  
                  {/* Blinking central Core */}
                  <circle cx="0" cy="0" r="1.5" fill="#ffffff" />

                  {/* High fidelity interactive detailed tooltip on hover */}
                  {hoveredEqId === eq.id && (
                    <g transform="translate(15, -95)" className="pointer-events-none z-50">
                      {/* Tooltip background card */}
                      <rect 
                        width="215" 
                        height="88" 
                        rx="6" 
                        fill="#020617" 
                        stroke={eq.enRango ? "#ef4444" : "#f59e0b"} 
                        strokeWidth="1.5" 
                        fillOpacity="0.98" 
                      />
                      
                      {/* Header with magnitude and warning badge */}
                      <text x="10" y="16" fill={eq.enRango ? "#ef4444" : "#f59e0b"} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                        {`⚠️ SISMO DETECTADO [M${eq.magnitud.toFixed(1)}]`}
                      </text>
                      
                      <line x1="10" y1="22" x2="205" y2="22" stroke="#1e293b" strokeWidth="1" />

                      {/* Location details */}
                      <text x="10" y="34" fill="#f8fafc" fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {`📍 Loc: ${eq.localizacion.length > 25 ? eq.localizacion.slice(0, 24) + '...' : eq.localizacion}`}
                      </text>

                      {/* Depth info */}
                      <text x="10" y="46" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
                        {`↕️ Profundidad: ${eq.depthKm.toFixed(1)} km`}
                      </text>

                      {/* Exact Date / Time */}
                      <text x="10" y="58" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
                        {`📅 Fecha: ${new Date(eq.time).toLocaleString('es-ES')}`}
                      </text>

                      {/* Scaled distances */}
                      <text x="10" y="70" fill="#cbd5e1" fontSize="8" fontFamily="monospace">
                        {`📡 Dist. Epicentro: ${dist.toFixed(1)} km`}
                      </text>

                      {/* Range Status */}
                      <text x="10" y="80" fill={eq.enRango ? "#f87171" : "#a7f3d0"} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                        {eq.enRango ? "🚨 RIESGO: DENTRO DE RANGO OPERATIVO" : "✓ SEGURO: FUERA DE RANGO CRÍTICO"}
                      </text>
                    </g>
                  )}

                  {/* Simple text indicator on click when not hovered */}
                  {isSelected && hoveredEqId !== eq.id && (
                    <g transform="translate(10, -10)" className="pointer-events-none z-50">
                      <rect width="90" height="24" rx="4" fill="#020617" stroke={eq.enRango ? "#ef4444" : "#f59e0b"} strokeWidth="1" fillOpacity="0.95" />
                      <text x="8" y="15" fill="#f8fafc" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                        M{eq.magnitud.toFixed(1)} - {dist.toFixed(0)}km
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Plotting high fidelity AIS maritime vessels */}
            {showVessels && vessels.map((s) => {
              const { x, y, dist, clipped } = getRadarCoordinates(s.latitude, s.longitude);
              if (clipped) return null;

              const isSelected = s.mmsi === selectedMmsi;

              return (
                <g
                  key={s.mmsi}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => handleSelectShip(s.mmsi)}
                  className="cursor-pointer group"
                >
                  {/* Ring selector indicator */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isSelected ? "9" : "6"}
                    className="stroke-blue-400 group-hover:scale-110 fill-none transition-all duration-300"
                    strokeWidth={isSelected ? "1.5" : "0.5"}
                    strokeDasharray={isSelected ? "none" : "2 1"}
                    strokeOpacity={isSelected ? "0.9" : "0.5"}
                  />

                  {/* Rotatable ship arrow based on actual heading */}
                  <g transform={`rotate(${s.headingDeg})`}>
                    <polygon
                      points="0,-5 -3.5,3 3.5,3"
                      fill={s.enRango ? "#3b82f6" : "#475569"}
                      stroke="#1d4ed8"
                      strokeWidth="1"
                    />
                    {/* Velocity vector line indicating course */}
                    <line x1="0" y1="-5" x2="0" y2={-5 - Math.max(2, s.speedKnots * 0.4)} stroke="#60a5fa" strokeWidth="1" />
                  </g>

                  {/* Label tag for clicked vessel */}
                  {isSelected && (
                    <g transform="translate(10, -10)" className="pointer-events-none z-50">
                      <rect width="105" height="24" rx="4" fill="#020617" stroke="#3b82f6" strokeWidth="1" fillOpacity="0.95" />
                      <text x="8" y="15" fill="#ffffff" fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {s.shipName.split(' ')[0]} - {dist.toFixed(0)}km
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* LAYER 4: APRS Packets & Balizas with Marker Clustering */}
            {showAprs && aprsClusters.map((cluster) => {
              const isSelected = selectedAprsId === cluster.id;

              if (!cluster.isCluster) {
                // Render single isolated APRS station
                const pkt = cluster.packets[0];
                const { dist } = getRadarCoordinates(pkt.latitude, pkt.longitude);
                return (
                  <g
                    key={cluster.id}
                    transform={`translate(${cluster.x}, ${cluster.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectAprs(cluster.id);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Outer pulsing ring for emergency packets */}
                    {pkt.isEmergency && (
                      <circle
                        cx="0"
                        cy="0"
                        r="12"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="1"
                        className="animate-ping"
                        style={{ animationDuration: '2s' }}
                      />
                    )}

                    {/* Pulsing ring selector indicator */}
                    <circle
                      cx="0"
                      cy="0"
                      r={isSelected ? "8" : "5"}
                      className={`${isSelected ? 'stroke-emerald-400' : 'stroke-emerald-600/70'} fill-none group-hover:scale-110 transition-all`}
                      strokeWidth={isSelected ? "1.5" : "1"}
                      strokeDasharray={isSelected ? "none" : "3 1"}
                    />

                    {/* Tower icon base */}
                    <line x1="-3" y1="4" x2="3" y2="4" stroke={pkt.isEmergency ? "#f87171" : "#34d399"} strokeWidth="1" />
                    <line x1="0" y1="4" x2="0" y2="-2" stroke={pkt.isEmergency ? "#f87171" : "#34d399"} strokeWidth="1.2" />
                    
                    {/* Blinking signal dot at the top */}
                    <circle 
                      cx="0" 
                      cy="-3" 
                      r="1.8" 
                      fill={pkt.isEmergency ? "#ef4444" : "#10b981"} 
                      className="animate-pulse"
                    />

                    {/* Small callsign indicator */}
                    <text
                      x="0"
                      y="12"
                      fill={pkt.isEmergency ? "#f87171" : "#a7f3d0"}
                      fontSize="7"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="opacity-80 group-hover:opacity-100"
                    >
                      {pkt.callsign}
                    </text>

                    {/* Detailed label card on selection */}
                    {isSelected && (
                      <g transform="translate(10, -20)" className="pointer-events-none z-50">
                        <rect width="110" height="24" rx="4" fill="#020617" stroke="#10b981" strokeWidth="1" fillOpacity="0.95" />
                        <text x="8" y="15" fill="#ffffff" fontSize="8" fontFamily="monospace" fontWeight="bold">
                          {pkt.callsign} - {dist.toFixed(0)}km
                        </text>
                      </g>
                    )}
                  </g>
                );
              } else {
                // Render dynamic Cluster marker
                const count = cluster.packets.length;
                const leadPkt = cluster.packets[0];
                const avgDist = cluster.packets.reduce((sum, p) => sum + getRadarCoordinates(p.latitude, p.longitude).dist, 0) / count;
                
                return (
                  <g
                    key={cluster.id}
                    transform={`translate(${cluster.x}, ${cluster.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectAprs(cluster.id);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Outer glowing background ring for the cluster */}
                    <circle
                      cx="0"
                      cy="0"
                      r={isSelected ? "15" : "12"}
                      fill="rgba(16,185,129,0.1)"
                      stroke={cluster.isEmergency ? "#ef4444" : "#10b981"}
                      strokeWidth={isSelected ? "2" : "1.2"}
                      strokeDasharray={isSelected ? "none" : "3 2"}
                      className={`transition-all ${cluster.isEmergency ? "animate-pulse" : ""}`}
                    />

                    {/* Concentric inner circle for clean military radar visual depth */}
                    <circle
                      cx="0"
                      cy="0"
                      r="8"
                      fill="#020617"
                      stroke={cluster.isEmergency ? "#f87171" : "#34d399"}
                      strokeWidth="1"
                    />

                    {/* Cluster Count Text in center */}
                    <text
                      x="0"
                      y="2.5"
                      fill={cluster.isEmergency ? "#ef4444" : "#10b981"}
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight="black"
                      textAnchor="middle"
                    >
                      {count}
                    </text>

                    {/* Floating helper showing main callsign in the cluster */}
                    <text
                      x="0"
                      y={isSelected ? "22" : "19"}
                      fill={cluster.isEmergency ? "#f87171" : "#a7f3d0"}
                      fontSize="7"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="opacity-80 group-hover:opacity-100"
                    >
                      {leadPkt.callsign}+{count - 1}
                    </text>

                    {/* Tooltip badge for selected cluster */}
                    {isSelected && (
                      <g transform="translate(15, -25)" className="pointer-events-none z-50">
                        <rect width="130" height="34" rx="4" fill="#020617" stroke="#10b981" strokeWidth="1" fillOpacity="0.95" />
                        <text x="8" y="14" fill="#ffffff" fontSize="8" fontFamily="monospace" fontWeight="bold">
                          🏢 CLUSTER: {count} Nodos
                        </text>
                        <text x="8" y="25" fill="#a7f3d0" fontSize="7.5" fontFamily="monospace">
                          Dist. promedio: {avgDist.toFixed(0)} km
                        </text>
                      </g>
                    )}
                  </g>
                );
              }
            })}

            {/* LAYER 5: ADS-B Flight Transponders */}
            {showAdsb && aircrafts.map((ac) => {
              const { x, y, dist, clipped } = getRadarCoordinates(ac.latitude, ac.longitude);
              if (clipped) return null;

              const isSelected = ac.id === selectedAdsbId;

              // Calculate flight path tail vector (behind the aircraft heading)
              const tailAngleRad = ((ac.headingDeg + 180) * Math.PI) / 180;
              const tailX = Math.sin(tailAngleRad) * 12;
              const tailY = -Math.cos(tailAngleRad) * 12;

              return (
                <g
                  key={ac.id}
                  transform={`translate(${x}, ${y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAdsb(ac.id);
                  }}
                  className="cursor-pointer group"
                >
                  {/* Subtle flight trail line */}
                  <line
                    x1="0"
                    y1="0"
                    x2={tailX}
                    y2={tailY}
                    stroke="#38bdf8"
                    strokeWidth="0.8"
                    strokeDasharray="2 2"
                    strokeOpacity="0.4"
                  />
                  
                  {/* Small dots on trail */}
                  <circle cx={tailX * 0.5} cy={tailY * 0.5} r="0.8" fill="#38bdf8" fillOpacity="0.3" />
                  <circle cx={tailX} cy={tailY} r="0.6" fill="#38bdf8" fillOpacity="0.2" />

                  {/* Ring selector indicator */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isSelected ? "11" : "8"}
                    className="stroke-sky-400 group-hover:scale-110 fill-none transition-all duration-300"
                    strokeWidth={isSelected ? "1.5" : "0.5"}
                    strokeDasharray={isSelected ? "none" : "4 2"}
                    strokeOpacity={isSelected ? "0.9" : "0.4"}
                  />

                  {/* Rotated custom airplane icon (SVG) */}
                  <g transform={`rotate(${ac.headingDeg})`}>
                    {/* Airplane Path */}
                    <path
                      d="M 0,-7 L 1.5,-4 L 6.5,-1 L 6.5,0.5 L 1.5,-0.5 L 1.5,3 L 3.5,4.5 L 3.5,5.5 L 0,4.5 L -3.5,5.5 L -3.5,4.5 L -1.5,3 L -1.5,-0.5 L -6.5,0.5 L -6.5,-1 L -1.5,-4 Z"
                      fill={isSelected ? "#38bdf8" : "#0ea5e9"}
                      stroke="#0284c7"
                      strokeWidth="0.8"
                    />
                  </g>

                  {/* Display Flight callsing + Altitude (e.g. IBE3244 FL360) */}
                  <text
                    x="9"
                    y="3"
                    fill="#38bdf8"
                    fontSize="7"
                    fontFamily="monospace"
                    fontWeight="bold"
                    className="opacity-70 group-hover:opacity-100"
                  >
                    {ac.callsign} FL{(ac.altitudeFt/100).toFixed(0)}
                  </text>

                  {/* Detailed label tag on selection */}
                  {isSelected && (
                    <g transform="translate(10, -22)" className="pointer-events-none z-50">
                      <rect width="115" height="24" rx="4" fill="#020617" stroke="#38bdf8" strokeWidth="1" fillOpacity="0.95" />
                      <text x="8" y="15" fill="#ffffff" fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {ac.callsign} - FL{(ac.altitudeFt/100).toFixed(0)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Details & Simulation Panel (5 cols) */}
        <div className="md:col-span-5 flex flex-col gap-3 justify-between">
          {/* Station Position Status Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 font-mono text-xs">
            <span className="text-[10px] text-slate-500 uppercase font-black block mb-2 tracking-wider">Antena Receptora Local</span>
            <div className="flex items-start gap-2.5">
              <MapPin className="text-yellow-500 mt-0.5 shrink-0" size={16} />
              <div>
                <div className="text-slate-200 font-bold flex items-center gap-1.5 flex-wrap">
                  {gpsd.isFallback ? 'COOR-ESTÁTICAS FIX' : 'RECEPTOR GPS ACTIVO'}
                  {gpsd.isFallback && (
                    <span className="text-[9px] bg-yellow-950 text-yellow-400 px-1 rounded border border-yellow-500/30">Aislada</span>
                  )}
                </div>
                <div className="text-slate-400 mt-1">
                  Lat: <span className="text-slate-100 font-semibold">{gpsd.lat.toFixed(5)}°N</span>
                </div>
                <div className="text-slate-400">
                  Lon: <span className="text-slate-100 font-semibold">{gpsd.lon.toFixed(5)}°W</span>
                </div>
                <div className="text-slate-400 mt-1">
                  Elevación: <span className="text-emerald-400">{gpsd.alt.toFixed(0)} m s.n.m</span>
                </div>
                {gpsd.speedKmh > 0 && (
                  <div className="text-blue-400 animate-pulse font-bold mt-1">
                    Coche Móvil: {gpsd.speedKmh} km/h
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN: MAPA BASE / CAPA TERRESTRE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] text-emerald-400 uppercase font-black block mb-2.5 tracking-wider flex items-center gap-1.5">
              <Layers size={12} /> Estilo de Mapa Base (Radar)
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'tactical', label: 'Táctico', desc: 'Fondo negro' },
                { id: 'street', label: 'Callejero', desc: 'Urbano/Vías' },
                { id: 'satellite', label: 'Satélite', desc: 'Rural/Copern.' }
              ].map((style) => {
                const isActive = mapStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setMapStyle(style.id as any)}
                    className={`py-2 px-1.5 bg-slate-950 hover:bg-slate-800 text-[10px] rounded border text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isActive 
                        ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300 ring-1 ring-emerald-500/20 font-bold' 
                        : 'border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate w-full font-bold">{style.label}</span>
                    <span className="text-[7.5px] text-slate-500 truncate w-full mt-0.5">{style.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Layer Overlay Switcher Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3" id="layer-selector">
            <span className="text-[10px] text-emerald-400 uppercase font-bold block mb-2 tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-black"><Layers size={13} strokeWidth={2} /> Visualización de Capas</span>
              {selectedLayer && (
                <button 
                  onClick={() => setSelectedLayer(null)}
                  className="text-[8px] bg-slate-950 px-1 border border-slate-800 text-slate-400 hover:text-white rounded transition-colors"
                >
                  Limpiar Selección
                </button>
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              {/* Sismos Layer Toggle (Requested by user) */}
              <button
                onClick={() => {
                  setShowEarthquakes(!showEarthquakes);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showEarthquakes 
                    ? 'border-red-500 bg-red-950/20 text-red-300 ring-1 ring-red-500/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-sismos"
              >
                <div className="flex items-center gap-2">
                  <Activity size={13} className={showEarthquakes ? "text-red-400 animate-pulse" : "text-slate-500"} />
                  <span className="font-medium">Sismos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showEarthquakes && (
                    <span className="text-[7.5px] px-1 bg-red-950 text-red-400 border border-red-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showEarthquakes ? 'border-red-500 bg-red-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showEarthquakes && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                  </span>
                </div>
              </button>

              {/* Boyas Portus Layer Toggle (Requested by user) */}
              <button
                onClick={() => {
                  setShowVessels(!showVessels);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showVessels 
                    ? 'border-blue-600 bg-blue-950/20 text-blue-300 ring-1 ring-blue-600/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-boyas-portus"
              >
                <div className="flex items-center gap-2">
                  <Ship size={13} className={showVessels ? "text-blue-400 animate-pulse" : "text-slate-500"} />
                  <span className="font-medium">Boyas Portus (AIS)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showVessels && (
                    <span className="text-[7.5px] px-1 bg-blue-950 text-blue-300 border border-blue-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showVessels ? 'border-blue-500 bg-blue-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showVessels && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </span>
                </div>
              </button>

              {/* Incendios Layer Toggle (Requested by user) */}
              <button
                onClick={() => {
                  const val = !showWildfires;
                  setShowWildfires(val);
                  if (!val && selectedLayer === 'fire') setSelectedLayer(null);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showWildfires 
                    ? 'border-orange-600 bg-orange-950/20 text-orange-300 ring-1 ring-orange-600/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-incendios"
              >
                <div className="flex items-center gap-2">
                  <Flame size={13} className={showWildfires ? "text-orange-400 animate-bounce" : "text-slate-500"} />
                  <span className="font-medium">Incendios (Focos/Trayect.)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showWildfires && (
                    <span className="text-[7.5px] px-1 bg-orange-950 text-orange-400 border border-orange-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showWildfires ? 'border-orange-500 bg-orange-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showWildfires && <div className="w-1 h-1 rounded-full bg-orange-400" />}
                  </span>
                </div>
              </button>

              {/* ICA / iQair Calidad de Aire Layer Toggle */}
              <button
                onClick={() => {
                  const val = !showIca;
                  setShowIca(val);
                  if (!val) setSelectedIcaId(null);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showIca 
                    ? 'border-sky-500 bg-sky-950/20 text-sky-300 ring-1 ring-sky-500/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-ica-air"
              >
                <div className="flex items-center gap-2">
                  <Wind size={13} className={showIca ? "text-sky-400 animate-pulse" : "text-slate-500"} />
                  <span className="font-medium">ICA / iQair Calidad Aire</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showIca && (
                    <span className="text-[7.5px] px-1 bg-sky-950 text-sky-400 border border-sky-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showIca ? 'border-sky-500 bg-sky-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showIca && <div className="w-1 h-1 rounded-full bg-sky-400" />}
                  </span>
                </div>
              </button>

              {/* APRS Packets Layer Toggle */}
              <button
                onClick={() => {
                  const val = !showAprs;
                  setShowAprs(val);
                  if (!val) setSelectedAprsId(null);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showAprs 
                    ? 'border-emerald-600 bg-emerald-950/20 text-emerald-300 ring-1 ring-emerald-600/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-aprs"
              >
                <div className="flex items-center gap-2">
                  <Radio size={13} className={showAprs ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                  <span className="font-medium">Paquetes y Balizas APRS</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showAprs && (
                    <span className="text-[7.5px] px-1 bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showAprs ? 'border-emerald-500 bg-emerald-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showAprs && <div className="w-1 h-1 rounded-full bg-emerald-400" />}
                  </span>
                </div>
              </button>

              {/* ADS-B Flight Layer Toggle */}
              <button
                onClick={() => {
                  const val = !showAdsb;
                  setShowAdsb(val);
                  if (!val) setSelectedAdsbId(null);
                }}
                className={`py-2 px-2.5 bg-slate-950 hover:bg-slate-800/80 text-[10.5px] rounded border flex items-center justify-between transition-all cursor-pointer ${
                  showAdsb 
                    ? 'border-sky-600 bg-sky-950/20 text-sky-300 ring-1 ring-sky-600/10' 
                    : 'border-slate-800 text-slate-400'
                }`}
                id="toggle-adsb"
              >
                <div className="flex items-center gap-2">
                  <Plane size={13} className={showAdsb ? "text-sky-400 animate-pulse" : "text-slate-500"} />
                  <span className="font-medium">Tránsito de Vuelos ADS-B</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {showAdsb && (
                    <span className="text-[7.5px] px-1 bg-sky-950 text-sky-400 border border-sky-500/20 font-black rounded">
                      VER
                    </span>
                  )}
                  <span className={`w-3 h-3 rounded border flex items-center justify-center ${showAdsb ? 'border-sky-500 bg-sky-500/25' : 'border-slate-800 bg-slate-950'}`}>
                    {showAdsb && <div className="w-1 h-1 rounded-full bg-sky-400" />}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Selected Earthquake OR Vessel Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 min-h-[115px] flex flex-col justify-center">
            {selectedIca ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-sky-400 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Wind className="text-sky-400 animate-pulse" size={14} />
                  <span>Estación de Calidad de Aire (ICA / iQair)</span>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div className="flex justify-between font-bold text-slate-100">
                    <span>{selectedIca.name}</span>
                    <span className="text-slate-500 font-normal">ID: {selectedIca.id}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-[11px]">
                    <div>PM2.5: <span className="text-slate-200 font-bold">{selectedIca.pm25} µg/m³</span></div>
                    <div>PM10: <span className="text-slate-200 font-bold">{selectedIca.pm10} µg/m³</span></div>
                    <div>NO₂: <span className="text-slate-200 font-bold">{selectedIca.no2} µg/m³</span></div>
                    <div>O₃: <span className="text-slate-200 font-bold">{selectedIca.o3} µg/m³</span></div>
                    <div>SO₂: <span className="text-slate-200 font-bold">{selectedIca.so2} µg/m³</span></div>
                    <div>CO: <span className="text-slate-200 font-bold">{selectedIca.co} mg/m³</span></div>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-1 border-t border-slate-850">
                    <span>Estado General: <span className={getIcaColorAndLabel(selectedIca.pm25, selectedIca.no2).textClass + " font-black"}>{getIcaColorAndLabel(selectedIca.pm25, selectedIca.no2).label}</span></span>
                    <span className="text-[8.5px] text-slate-500">Actualizado vía MITECO/iQair</span>
                  </div>
                </div>
              </div>
            ) : selectedLayer === 'fire' ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-orange-500 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Flame className="text-orange-400 animate-bounce" size={14} />
                  <span>Campaña Incendio Forestal (Copernicus)</span>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div>Área: <span className="text-orange-300 font-bold">Trayectoria Frente Térmico Activo</span></div>
                  <div className="flex justify-between">
                    <span>Focos Activos: <span className="text-orange-400 font-bold">3 Hotspots</span></span>
                    <span>Viento Propagador: <span className="text-red-400 font-bold">NE (45°) - 24 km/h</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alerta: <span className="text-red-405 text-red-400 font-bold">NIVEL 1 C.A.</span></span>
                    <span>Velocidad Avance: <span className="text-orange-400 font-mono">1.2 km/h</span></span>
                  </div>
                  <div className="p-1.5 bg-orange-950/30 text-[9.5px] text-orange-300 rounded border border-orange-900/40 leading-relaxed mt-1">
                    Trayectoria de propagación estimada por imágenes Sentinel-3 y datos meteorológicos locales. Zona de exclusión aérea coordinada con medios de extinción.
                  </div>
                </div>
              </div>
            ) : selectedEq ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-slate-200 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <AlertTriangle className={selectedEq.enRango ? "text-red-500 animate-bounce" : "text-yellow-500"} size={14} />
                  <span>Sismo Seleccionado Gonio</span>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div>Localización: <span className="text-slate-100 font-bold">{selectedEq.localizacion}</span></div>
                  <div className="flex justify-between">
                    <span>Distancia: <span className="text-yellow-400 font-bold">{selectedEq.distanciaKm} km</span></span>
                    <span>Magnitud: <span className={`font-bold ${selectedEq.magnitud >= 4 ? 'text-red-400' : 'text-slate-200'}`}>M {selectedEq.magnitud.toFixed(1)} ({selectedEq.magType})</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profundidad: <span className="text-emerald-400">{selectedEq.depthKm} km</span></span>
                    <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                      selectedEq.enRango ? 'bg-red-950 text-red-400 border border-red-500/30' : 'bg-slate-950 text-slate-500'
                    }`}>
                      {selectedEq.enRango ? 'EN RANGO CRÍTICO' : 'FUERA DE COBERTURA'}
                    </span>
                  </div>
                  {selectedEq.aprsPacket && (
                    <div className="mt-2 p-1.5 bg-slate-950 text-[10px] text-emerald-300 rounded border border-slate-800 truncate font-bold">
                      {selectedEq.aprsPacket}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedShip ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-slate-200 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Ship className="text-blue-400 shrink-0" size={14} />
                  <span className="truncate">Vaso AIS/AIS-IS Comar SLR200G</span>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div className="flex justify-between font-bold text-slate-100">
                    <span>{selectedShip.shipName}</span>
                    <span className="text-slate-500 font-normal">MMSI: {selectedShip.mmsi}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Tipo: <span className="text-slate-300 font-bold">{selectedShip.type}</span></span>
                    <span>Distancia: <span className="text-blue-400 font-bold">{selectedShip.distanciaKm.toFixed(1)} km</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">Vel: <Navigation size={9} className="rotate-90 text-blue-400" /> <span className="text-slate-200 font-bold">{selectedShip.speedKnots} Kts</span></span>
                    <span>Rumbo: <span className="text-slate-200 font-bold">{selectedShip.headingDeg}°</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Destino: <span className="text-yellow-400 font-bold">{selectedShip.destination}</span></span>
                    <span className={`px-1 rounded text-[8px] font-bold ${
                      selectedShip.enRango ? 'bg-blue-950/60 text-blue-400 border border-blue-800/40' : 'bg-slate-900 text-slate-500'
                    }`}>
                      {selectedShip.enRango ? 'DENTRO DE VHF' : 'REVENTA SATELITAL'}
                    </span>
                  </div>
                  {selectedShip.aprsPacket && (
                    <div className="mt-2 p-1.5 bg-slate-950 text-[9px] text-emerald-400 rounded border border-slate-800 truncate font-bold" title={selectedShip.aprsPacket}>
                      {selectedShip.aprsPacket}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedAprsCluster && selectedAprsCluster.isCluster ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-emerald-400 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Radio className={selectedAprsCluster.isEmergency ? "text-red-500 animate-ping" : "text-emerald-400"} size={14} />
                  <span>Cluster de Nodos APRS ({selectedAprsCluster.packets.length} Estaciones)</span>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {selectedAprsCluster.packets.map((pkt) => {
                    const { dist } = getRadarCoordinates(pkt.latitude, pkt.longitude);
                    return (
                      <div 
                        key={pkt.id} 
                        onClick={() => handleSelectAprs(pkt.id)}
                        className="p-1.5 bg-slate-950/70 rounded border border-slate-800 hover:border-emerald-500/50 transition-colors cursor-pointer flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-black ${pkt.isEmergency ? 'text-red-400' : 'text-emerald-300'}`}>
                            {pkt.callsign}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {pkt.aprsType} • {dist.toFixed(0)} km
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 truncate leading-relaxed">
                          {pkt.messageText}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[8px] text-slate-500 italic mt-2 text-center">
                  Haz clic en una estación para desglosar sus tramas individuales.
                </p>
              </div>
            ) : selectedAprs ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-emerald-400 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Radio className={selectedAprs.isEmergency ? "text-red-500 animate-ping" : "text-emerald-400"} size={14} />
                  <div className="flex items-center gap-1.5">
                    <span>Baliza de Radio / Nodo APRS</span>
                    {selectedAprsId && !selectedAprsId.startsWith('cluster-') && (
                      (() => {
                        const parentCluster = aprsClusters.find(c => c.isCluster && c.packets.some(p => p.id === selectedAprs.id));
                        if (parentCluster) {
                          return (
                            <button 
                              onClick={() => {
                                handleSelectAprs(parentCluster.id);
                              }}
                              className="text-[8px] bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-300 font-semibold hover:bg-emerald-900 transition-colors"
                            >
                              ← Volver al Cluster
                            </button>
                          );
                        }
                        return null;
                      })()
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div className="flex justify-between font-bold text-slate-100">
                    <span>{selectedAprs.callsign}</span>
                    <span className="text-slate-500 font-normal">Tipo: {selectedAprs.aprsType}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Evento: <span className="text-slate-300 font-bold uppercase">{selectedAprs.eventType}</span></span>
                    <span>Distancia: <span className="text-emerald-400 font-bold">{getRadarCoordinates(selectedAprs.latitude, selectedAprs.longitude).dist.toFixed(1)} km</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Coordenadas: <span className="text-slate-300">{selectedAprs.latitude.toFixed(4)}°, {selectedAprs.longitude.toFixed(4)}°</span></span>
                    <span className={`px-1 rounded text-[8px] font-bold ${
                      selectedAprs.isEmergency ? 'bg-red-950 text-red-400 border border-red-500/30 animate-pulse' : 'bg-emerald-950 text-emerald-400 border border-emerald-900/30'
                    }`}>
                      {selectedAprs.isEmergency ? 'EMERGENCIA' : 'ESTADO OK'}
                    </span>
                  </div>
                  <div className="p-1.5 bg-slate-950 text-[9px] text-slate-300 rounded border border-slate-900 leading-normal mt-1 break-words">
                    <span className="text-slate-500 block text-[8px] uppercase tracking-wider font-bold mb-0.5">Mensaje Decodificado:</span>
                    {selectedAprs.messageText}
                  </div>
                  {selectedAprs.packetString && (
                    <div className="p-1 bg-slate-950/60 text-[8.5px] text-emerald-500 rounded border border-slate-900/50 mt-1 truncate font-bold" title={selectedAprs.packetString}>
                      RAW: {selectedAprs.packetString}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedAdsb ? (
              <div className="font-mono text-xs">
                <div className="flex items-center gap-1.5 text-sky-400 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                  <Plane className="text-sky-400 animate-pulse" size={14} />
                  <span>Transpondedor ADS-B (1090 MHz Mode-S)</span>
                </div>
                <div className="space-y-1 text-slate-400">
                  <div className="flex justify-between font-bold text-slate-100">
                    <span>{selectedAdsb.callsign} ({selectedAdsb.airline})</span>
                    <span className="text-slate-500 font-normal">ICAO: {selectedAdsb.icao24}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Aeronave: <span className="text-slate-300 font-bold">{selectedAdsb.aircraftType}</span></span>
                    <span>Altitud: <span className="text-sky-400 font-bold">{selectedAdsb.altitudeFt.toLocaleString()} ft</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Velocidad: <span className="text-slate-200 font-bold">{selectedAdsb.speedKnots} Kts</span></span>
                    <span>Rumbo: <span className="text-slate-200 font-bold">{selectedAdsb.headingDeg}°</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ruta: <span className="text-slate-300 truncate max-w-[150px]" title={selectedAdsb.route}>{selectedAdsb.route.split(' ➔ ')[0]} ➔ ...</span></span>
                    <span>Squawk: <span className="text-amber-400 font-bold">{selectedAdsb.squawk}</span></span>
                  </div>
                  <div className="p-1.5 bg-sky-950/20 text-[9.5px] text-sky-300 rounded border border-sky-900/30 leading-relaxed mt-1">
                    Señal captada por receptor local SDR de 1090 MHz. Trayectoria comercial activa cruzando el espacio aéreo del centro de mando.
                  </div>
                </div>
              </div>
            ) : selectedNasaFireId && nasaFires.find(f => f.id === selectedNasaFireId) ? (
              (() => {
                const fire = nasaFires.find(f => f.id === selectedNasaFireId)!;
                return (
                  <div className="font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-orange-400 border-b border-slate-800 pb-1.5 mb-2 font-bold">
                      <Flame className="text-red-500 animate-pulse" size={14} />
                      <span>Satelital FIRMS NASA (MODIS/VIIRS)</span>
                    </div>
                    <div className="space-y-1 text-slate-400">
                      <div className="flex justify-between font-bold text-slate-100">
                        <span>{fire.name}</span>
                        <span className="text-slate-500 font-normal">ID: {fire.id}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span>Tipo de Registro: <span className="text-slate-300 font-bold uppercase">{fire.type === 'active_hotspot' ? '🔥 Foco Activo' : '⚠️ Zona de Riesgo'}</span></span>
                      </div>
                      <div className="flex justify-between">
                        <span>Potencia Térmica (FRP): <span className="text-red-400 font-bold">{fire.frp} MW</span></span>
                        <span>Confianza: <span className="text-amber-400 font-bold">{fire.confidence}%</span></span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ángulo Propagación: <span className="text-slate-200 font-bold">{fire.propagationAngle}°</span></span>
                        <span>Nivel de Peligro: <span className="text-red-500 font-bold uppercase font-black">{fire.dangerLevel}</span></span>
                      </div>
                      <div className="p-1.5 bg-red-950/20 text-[9.5px] text-red-300 rounded border border-red-900/30 leading-relaxed mt-1">
                        Detección infrarroja procesada por la base de datos FIRMS de la NASA. Muestra la dirección estimada del avance de propagación forestal basándose en el vector de viento local.
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-4 text-slate-500 font-mono text-xs flex flex-col items-center gap-1">
                <Info size={16} className="text-slate-600" />
                <span>Haz clic sobre un círculo sismográfico, buque marino, baliza APRS, avión ADS-B, foco de incendio o estación ICA para desglosar su telemetría.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
