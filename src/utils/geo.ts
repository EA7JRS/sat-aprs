/**
 * GEOGRAPHIC UTILITIES FOR APRS S.A.T.
 * Uniform Distance (Haversine) and Bearing (Rumbo) computations.
 */

export interface GeoLocation {
  lat: number;
  lon: number;
}

/**
 * Calculates the Haversine distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

/**
 * Calculates the bearing (rumbo) in degrees from point 1 to point 2.
 */
export function calculateBearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
            
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Translates a bearing in degrees into a beautiful cardinal indicator (e.g. "▲ N", "► NE").
 */
export function getBearingIndicator(lat1: number, lon1: number, lat2: number, lon2: number): string {
  if (Math.abs(lat1 - lat2) < 0.0001 && Math.abs(lon1 - lon2) < 0.0001) return '● AQUÍ';
  
  const bearing = calculateBearingDegrees(lat1, lon1, lat2, lon2);
  const index = Math.round(bearing / 22.5) % 16;
  
  const sectors = [
    { label: 'N', icon: '▲' },
    { label: 'NNE', icon: '▲' },
    { label: 'NE', icon: '►' },
    { label: 'ENE', icon: '►' },
    { label: 'E', icon: '►' },
    { label: 'ESE', icon: '►' },
    { label: 'SE', icon: '▼' },
    { label: 'SSE', icon: '▼' },
    { label: 'S', icon: '▼' },
    { label: 'SSW', icon: '▼' },
    { label: 'SO', icon: '◀' },
    { label: 'OSO', icon: '◀' },
    { label: 'O', icon: '◀' },
    { label: 'ONO', icon: '◀' },
    { label: 'NO', icon: '▲' },
    { label: 'NNO', icon: '▲' }
  ];
  
  const sector = sectors[index];
  return `${sector.icon} ${sector.label} (${Math.round(bearing)}°)`;
}
