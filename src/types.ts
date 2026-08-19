export interface TrailPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number | null;
  speedKmh?: number | null;
  altitude?: number | null;
}

export interface UserLocation {
  userId: string;
  userName: string;
  userColor: string;
  userAvatar?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null; // in m/s
  calculatedSpeedKmh?: number | null; // calculated in km/h based on delta distance and elapsed time
  lastPingDeltaMs?: number | null; // elapsed ms between consecutive pings
  maxSpeedKmh?: number | null;
  avgSpeedKmh?: number | null;
  heading?: number | null;
  battery?: number | null;
  isSimulated?: boolean;
  isOffline?: boolean;
  backgroundActive?: boolean;
  timestamp: number;
  trail: TrailPoint[];
}

export type ViewMode = 'dashboard' | 'share' | 'split' | 'mobile-preview';

export type MapTileLayer = 'streets' | 'satellite' | 'hybrid' | 'detailed' | 'dark' | 'light' | 'terrain';

export interface SimulatedRoute {
  id: string;
  name: string;
  city: string;
  coordinates: [number, number][];
  speedKmh: number;
}
