import { TrailPoint, UserLocation, SimulatedRoute } from '../types';

export const PRESET_ROUTES: SimulatedRoute[] = [
  {
    id: 'sf-downtown',
    name: 'San Francisco Downtown Transit',
    city: 'San Francisco, CA',
    speedKmh: 28.5,
    coordinates: [
      [37.7749, -122.4194],
      [37.7762, -122.4178],
      [37.7785, -122.4150],
      [37.7812, -122.4115],
      [37.7845, -122.4072],
      [37.7880, -122.4025],
      [37.7915, -122.3980],
      [37.7942, -122.3948],
      [37.7958, -122.3965],
      [37.7925, -122.4010],
      [37.7885, -122.4060],
      [37.7835, -122.4120],
      [37.7780, -122.4165],
    ],
  },
  {
    id: 'nyc-central-park',
    name: 'New York Central Park Loop',
    city: 'New York, NY',
    speedKmh: 14.2,
    coordinates: [
      [40.785091, -73.968285],
      [40.789123, -73.965412],
      [40.793456, -73.961234],
      [40.796789, -73.957890],
      [40.792345, -73.953456],
      [40.786543, -73.957654],
      [40.781234, -73.962345],
      [40.776543, -73.967890],
      [40.772345, -73.972345],
      [40.776890, -73.975678],
      [40.781234, -73.971234],
    ],
  },
  {
    id: 'london-thames',
    name: 'London Thames Riverfront',
    city: 'London, UK',
    speedKmh: 42.0,
    coordinates: [
      [51.5033, -0.1195],
      [51.5050, -0.1120],
      [51.5075, -0.1030],
      [51.5085, -0.0950],
      [51.5070, -0.0870],
      [51.5055, -0.0760],
      [51.5040, -0.0650],
      [51.5020, -0.0750],
      [51.5045, -0.0880],
      [51.5060, -0.0990],
      [51.5040, -0.1130],
    ],
  },
  {
    id: 'tokyo-shibuya',
    name: 'Tokyo Shibuya Expressway',
    city: 'Tokyo, Japan',
    speedKmh: 58.4,
    coordinates: [
      [35.6595, 139.7005],
      [35.6625, 139.7040],
      [35.6660, 139.7085],
      [35.6700, 139.7130],
      [35.6740, 139.7180],
      [35.6710, 139.7220],
      [35.6670, 139.7170],
      [35.6630, 139.7120],
      [35.6590, 139.7070],
    ],
  },
];

/**
 * Calculates distance between two coordinates in kilometers (Haversine formula)
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate instantaneous speed between two timestamped points in km/h
 * Formula: v = (Distance / Elapsed Time) * 3600
 */
export function calculateSpeedBetweenPoints(p1: TrailPoint, p2: TrailPoint): number {
  if (!p1 || !p2 || !p1.timestamp || !p2.timestamp) return 0;
  const distKm = calculateDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
  const elapsedMs = Math.abs(p2.timestamp - p1.timestamp);
  if (elapsedMs < 100) return 0; // Avoid division by near-zero jitter
  const elapsedHours = elapsedMs / (1000 * 3600);
  const speed = distKm / elapsedHours;
  return isNaN(speed) || speed < 0 || speed > 350 ? 0 : Number(speed.toFixed(1));
}

/**
 * Calculate current travel speed (km/h) for a user based on their latest location updates and elapsed time
 */
export function getCurrentTravelSpeedKmh(user: UserLocation): number {
  if (user.calculatedSpeedKmh !== undefined && user.calculatedSpeedKmh !== null && !isNaN(user.calculatedSpeedKmh)) {
    return user.calculatedSpeedKmh;
  }
  if (user.trail && user.trail.length >= 2) {
    const len = user.trail.length;
    const pPrev = user.trail[len - 2];
    const pCurr = user.trail[len - 1];
    return calculateSpeedBetweenPoints(pPrev, pCurr);
  }
  if (user.speed !== null && user.speed !== undefined && !isNaN(user.speed) && user.speed >= 0) {
    return Number((user.speed * 3.6).toFixed(1));
  }
  return 0.0;
}

/**
 * Return speed classification category
 */
export function getSpeedCategory(speedKmh: number): { label: string; badgeColor: string; textColor: string } {
  if (speedKmh < 0.8) {
    return { label: 'Stationary', badgeColor: 'bg-slate-100 border-slate-200', textColor: 'text-slate-600' };
  }
  if (speedKmh < 7) {
    return { label: 'Walking', badgeColor: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700' };
  }
  if (speedKmh < 22) {
    return { label: 'Running / Cycling', badgeColor: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' };
  }
  if (speedKmh < 60) {
    return { label: 'City Transit', badgeColor: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700' };
  }
  return { label: 'Highway Travel', badgeColor: 'bg-purple-50 border-purple-200', textColor: 'text-purple-700' };
}

/**
 * Calculate total trail distance in km
 */
export function calculateTrailDistanceKm(trail: TrailPoint[]): number {
  if (!trail || trail.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < trail.length; i++) {
    total += calculateDistanceKm(
      trail[i - 1].lat,
      trail[i - 1].lng,
      trail[i].lat,
      trail[i].lng
    );
  }
  return total;
}

/**
 * Convert heading degrees to cardinal direction string
 */
export function getHeadingCardinal(deg?: number | null): string {
  if (deg === null || deg === undefined || isNaN(deg)) return '--';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return directions[index];
}

/**
 * Format speed in km/h
 */
export function formatSpeed(speedKmh?: number | null): string {
  if (speedKmh === undefined || speedKmh === null || isNaN(speedKmh) || speedKmh < 0) return '0.0 km/h';
  return `${speedKmh.toFixed(1)} km/h`;
}

/**
 * Format relative time (e.g., "5s ago", "2m ago")
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'Live now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  return `${diffHrs}h ago`;
}

/**
 * Converts Decimal Degrees to DMS (Degrees, Minutes, Seconds)
 * e.g., 37.774929, -122.419416 -> 37° 46' 29.7" N, 122° 25' 09.9" W
 */
export function formatDMS(lat: number, lng: number): string {
  const formatCoord = (deg: number, isLat: boolean): string => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
    const direction = isLat
      ? deg >= 0 ? 'N' : 'S'
      : deg >= 0 ? 'E' : 'W';
    return `${degrees}° ${String(minutes).padStart(2, '0')}' ${String(seconds).padStart(4, '0')}" ${direction}`;
  };

  return `${formatCoord(lat, true)}, ${formatCoord(lng, false)}`;
}

/**
 * Geocode cache to avoid rate limits
 */
const geocodeCache = new Map<string, { address: string; timestamp: number }>();

/**
 * Reverse geocode coordinates via OpenStreetMap Nominatim
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60) {
    return cached.address;
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      }
    );
    if (!res.ok) throw new Error('Geocoding request failed');
    const data = await res.json();
    
    if (data && data.address) {
      const a = data.address;
      const road = a.road || a.pedestrian || a.suburb || a.neighbourhood || '';
      const city = a.city || a.town || a.village || a.county || '';
      const state = a.state || a.country || '';
      const parts = [road, city, state].filter(Boolean);
      const formatted = parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
      geocodeCache.set(key, { address: formatted, timestamp: Date.now() });
      return formatted;
    }
    return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
  } catch (err) {
    return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
  }
}

/**
 * Generate deep external mapping URLs
 */
export function getExternalMapLinks(lat: number, lng: number, zoom = 19) {
  return {
    googleSatellite: `https://www.google.com/maps/@${lat},${lng},${zoom}z/data=!3m1!1e3`,
    googleStreet: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    appleMaps: `https://maps.apple.com/?ll=${lat},${lng}&q=Location&t=k`,
    openStreetMap: `https://www.openstreetmap.org/#map=${zoom}/${lat}/${lng}`,
  };
}

/**
 * Export breadcrumb trail to GPX (GPS Exchange Format) XML string
 */
export function exportToGPX(user: UserLocation): string {
  const trackpoints = user.trail
    .map(
      (p) =>
        `      <trkpt lat="${p.lat}" lon="${p.lng}">
        <time>${new Date(p.timestamp).toISOString()}</time>
        ${p.speedKmh ? `<speed>${(p.speedKmh / 3.6).toFixed(2)}</speed>` : ''}
      </trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LocateX Sync" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Track Log for ${user.userName}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${user.userName} GPS Track</name>
    <trkseg>
${trackpoints}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Export breadcrumb trail to GeoJSON FeatureCollection
 */
export function exportToGeoJSON(user: UserLocation): string {
  const lineCoordinates = user.trail.map((p) => [p.lng, p.lat]);
  const pointFeatures = user.trail.map((p, idx) => ({
    type: 'Feature',
    properties: {
      pointIndex: idx,
      timestamp: p.timestamp,
      isoTime: new Date(p.timestamp).toISOString(),
      speedKmh: p.speedKmh || 0,
      user: user.userName,
    },
    geometry: {
      type: 'Point',
      coordinates: [p.lng, p.lat],
    },
  }));

  const geoJson = {
    type: 'FeatureCollection',
    properties: {
      userId: user.userId,
      userName: user.userName,
      exportedAt: new Date().toISOString(),
      pointCount: user.trail.length,
      totalDistanceKm: calculateTrailDistanceKm(user.trail),
    },
    features: [
      {
        type: 'Feature',
        properties: {
          name: `${user.userName} Trail Path`,
          color: user.userColor,
        },
        geometry: {
          type: 'LineString',
          coordinates: lineCoordinates,
        },
      },
      ...pointFeatures,
    ],
  };

  return JSON.stringify(geoJson, null, 2);
}
