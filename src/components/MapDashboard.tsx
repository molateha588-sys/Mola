import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UserLocation, MapTileLayer, TrailPoint } from '../types';
import {
  calculateTrailDistanceKm,
  formatSpeed,
  getCurrentTravelSpeedKmh,
  getSpeedCategory,
  getHeadingCardinal,
  formatRelativeTime,
  formatDMS,
  reverseGeocode,
  getExternalMapLinks,
  exportToGPX,
  exportToGeoJSON
} from '../utils/geoUtils';
import {
  Layers,
  Crosshair,
  Maximize2,
  Minimize2,
  Download,
  Users,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Radio,
  Share2,
  Trash2,
  Gauge,
  TrendingUp,
  MapPin,
  Compass,
  ExternalLink,
  ZoomIn,
  Search,
  Sparkles,
  Mountain,
  Satellite,
  Building2,
  Moon,
  Sun,
  Navigation
} from 'lucide-react';

interface MapDashboardProps {
  users: UserLocation[];
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  onClearTrail: (userId: string) => void;
  onOpenQR: () => void;
  isServerConnected?: boolean;
}

const TILE_LAYERS: Record<
  MapTileLayer,
  { name: string; description: string; url: string; attribution: string; maxZoom: number; maxNativeZoom: number; icon: string }
> = {
  streets: {
    name: 'Street View',
    description: 'Crisp OSM street network & labels',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'streets',
  },
  satellite: {
    name: 'Ultra-HD Satellite',
    description: 'High-resolution aerial satellite photography',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'satellite',
  },
  hybrid: {
    name: 'Satellite + Roads',
    description: 'Satellite imagery with high-contrast road overlays',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri & OpenStreetMap',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'hybrid',
  },
  detailed: {
    name: 'Humanitarian / POIs',
    description: 'High density buildings, addresses & transit',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, Humanitarian OSM Team',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'detailed',
  },
  light: {
    name: 'Clean Light',
    description: 'Carto Positron ultra-clear minimal map',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'light',
  },
  dark: {
    name: 'Dark Tactical',
    description: 'High-contrast dark mode for night tracking',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 21,
    maxNativeZoom: 19,
    icon: 'dark',
  },
  terrain: {
    name: 'Topographic Contours',
    description: 'Elevation curves, reliefs & mountain topology',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap',
    maxZoom: 19,
    maxNativeZoom: 17,
    icon: 'terrain',
  },
};

export const MapDashboard: React.FC<MapDashboardProps> = ({
  users,
  selectedUserId,
  onSelectUser,
  onClearTrail,
  onOpenQR,
  isServerConnected = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const hybridRoadLayerRef = useRef<L.TileLayer | null>(null);
  
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const circlesRef = useRef<Map<string, L.Circle>>(new Map());
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const breadcrumbDotsRef = useRef<Map<string, L.CircleMarker[]>>(new Map());

  const [activeLayer, setActiveLayer] = useState<MapTileLayer>('streets');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [hiddenTrails, setHiddenTrails] = useState<Set<string>>(new Set());
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(15);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTacticalReticle, setShowTacticalReticle] = useState(false);
  const [coordFormat, setCoordFormat] = useState<'DD' | 'DMS'>('DD');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPointInfo, setSelectedPointInfo] = useState<{ point: TrailPoint; index: number; total: number; userName: string } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string>('Resolving street address...');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [showDeepDetailModal, setShowDeepDetailModal] = useState(false);

  const selectedUser = users.find((u) => u.userId === selectedUserId) || (users.length > 0 ? users[0] : null);

  // Reverse geocode selected user address whenever user or coordinates change
  useEffect(() => {
    if (!selectedUser) {
      setResolvedAddress('No location selected');
      return;
    }
    let isCancelled = false;
    setIsResolvingAddress(true);

    reverseGeocode(selectedUser.lat, selectedUser.lng)
      .then((addr) => {
        if (!isCancelled) {
          setResolvedAddress(addr);
          setIsResolvingAddress(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setResolvedAddress(`${selectedUser.lat.toFixed(5)}°, ${selectedUser.lng.toFixed(5)}°`);
          setIsResolvingAddress(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedUser?.lat, selectedUser?.lng, selectedUser?.userId]);

  // Initialize Leaflet Map with Deep Zoom support
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = users[0]?.lat || 37.7749;
    const initialLng = users[0]?.lng || -122.4194;
    const initialZoom = users.length > 0 ? 16 : 14;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      maxZoom: 21,
      zoomControl: false,
    });

    // Custom Zoom & Scale Controls
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);

    const config = TILE_LAYERS[activeLayer];
    const tileLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      maxNativeZoom: config.maxNativeZoom,
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    mapRef.current = map;
    setCurrentZoom(map.getZoom());

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('zoomend', () => {
      if (mapRef.current) {
        setCurrentZoom(mapRef.current.getZoom());
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Tile Layer dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    if (hybridRoadLayerRef.current) {
      map.removeLayer(hybridRoadLayerRef.current);
      hybridRoadLayerRef.current = null;
    }

    const config = TILE_LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      maxNativeZoom: config.maxNativeZoom,
    }).addTo(map);

    // If hybrid, add Carto Voyager or Stamen toner labels on top of Esri imagery
    if (activeLayer === 'hybrid') {
      hybridRoadLayerRef.current = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 21,
          maxNativeZoom: 19,
          opacity: 0.95,
        }
      ).addTo(map);
    }
  }, [activeLayer]);

  // Create High-Definition Custom Marker with heading, live speed badge, and precision pulse
  const createCustomIcon = (user: UserLocation, isSelected: boolean) => {
    const color = user.userColor || '#2563EB';
    const heading = user.heading || 0;
    const hasHeading = user.heading !== null && user.heading !== undefined && user.heading >= 0;
    const speedKmh = getCurrentTravelSpeedKmh(user);
    const isOffline = user.isOffline;

    const html = `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none ${isOffline ? 'opacity-70' : ''}">
        ${!isOffline ? `
          <span class="absolute w-14 h-14 rounded-full opacity-35 animate-ping" style="background-color: ${color};"></span>
          <span class="absolute w-10 h-10 rounded-full opacity-20" style="background-color: ${color};"></span>
        ` : ''}

        ${
          hasHeading
            ? `<div class="absolute -top-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px]" 
                  style="border-bottom-color: ${color}; transform: rotate(${heading}deg); transform-origin: center 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
               </div>`
            : ''
        }

        <div class="relative w-9 h-9 rounded-full border-2 ${
          isSelected ? 'border-white shadow-2xl scale-125 ring-2 ring-blue-500 ring-offset-2' : 'border-white shadow-md'
        } flex items-center justify-center text-white font-black text-xs transition-transform duration-300"
             style="background-color: ${color};">
          ${user.userName ? user.userName.charAt(0).toUpperCase() : 'U'}
        </div>

        <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white bg-slate-900/95 backdrop-blur-sm shadow-xl whitespace-nowrap pointer-events-none font-mono flex items-center gap-1.5 border border-slate-700/80">
          <span>${user.userName}</span>
          ${isOffline ? `<span class="text-amber-400 font-normal">[Offline]</span>` : `<span class="text-emerald-400 font-black">${speedKmh.toFixed(1)} km/h</span>`}
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-location-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  // Sync users, markers, breadcrumbs, accuracy radiuses and trails
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(users.map((u) => u.userId));

    // Remove deleted nodes
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });
    circlesRef.current.forEach((circle, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(circle);
        circlesRef.current.delete(id);
      }
    });
    polylinesRef.current.forEach((polyline, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(polyline);
        polylinesRef.current.delete(id);
      }
    });
    breadcrumbDotsRef.current.forEach((dots, id) => {
      if (!currentIds.has(id)) {
        dots.forEach((dot) => map.removeLayer(dot));
        breadcrumbDotsRef.current.delete(id);
      }
    });

    users.forEach((user) => {
      const isSelected = user.userId === selectedUserId;
      const latLng: L.LatLngExpression = [user.lat, user.lng];

      // Update or create main marker
      let marker = markersRef.current.get(user.userId);
      if (marker) {
        marker.setLatLng(latLng);
        marker.setIcon(createCustomIcon(user, isSelected));
      } else {
        marker = L.marker(latLng, {
          icon: createCustomIcon(user, isSelected),
        }).addTo(map);

        marker.on('click', () => {
          onSelectUser(user.userId);
        });

        markersRef.current.set(user.userId, marker);
      }

      // Accuracy circle
      let circle = circlesRef.current.get(user.userId);
      if (user.accuracy && user.accuracy > 0) {
        if (circle) {
          circle.setLatLng(latLng);
          circle.setRadius(user.accuracy);
          circle.setStyle({
            color: user.userColor || '#2563EB',
            fillColor: user.userColor || '#2563EB',
          });
        } else {
          circle = L.circle(latLng, {
            radius: user.accuracy,
            color: user.userColor || '#2563EB',
            fillColor: user.userColor || '#2563EB',
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '3, 6',
          }).addTo(map);
          circlesRef.current.set(user.userId, circle);
        }
      } else if (circle) {
        map.removeLayer(circle);
        circlesRef.current.delete(user.userId);
      }

      // Breadcrumb polyline
      const isHidden = hiddenTrails.has(user.userId);
      let polyline = polylinesRef.current.get(user.userId);

      if (!isHidden && user.trail && user.trail.length > 1) {
        const path = user.trail.map((p) => [p.lat, p.lng] as [number, number]);
        if (polyline) {
          polyline.setLatLngs(path);
          polyline.setStyle({
            color: user.userColor || '#2563EB',
            weight: isSelected ? 4.5 : 3,
            opacity: isSelected ? 0.95 : 0.7,
          });
        } else {
          polyline = L.polyline(path, {
            color: user.userColor || '#2563EB',
            weight: isSelected ? 4.5 : 3,
            opacity: isSelected ? 0.95 : 0.7,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(map);
          polylinesRef.current.set(user.userId, polyline);
        }

        // Add interactive inspection dots for each breadcrumb point
        let existingDots = breadcrumbDotsRef.current.get(user.userId) || [];
        existingDots.forEach((dot) => map.removeLayer(dot));
        const newDots: L.CircleMarker[] = [];

        // Sample breadcrumbs so map stays performant while remaining inspectable
        const step = user.trail.length > 100 ? 5 : user.trail.length > 40 ? 2 : 1;
        user.trail.forEach((point, index) => {
          if (index % step === 0 || index === user.trail.length - 1) {
            const dot = L.circleMarker([point.lat, point.lng], {
              radius: isSelected ? 4 : 3,
              color: '#ffffff',
              weight: 1.5,
              fillColor: user.userColor || '#2563EB',
              fillOpacity: 0.9,
            }).addTo(map);

            dot.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              setSelectedPointInfo({
                point,
                index: index + 1,
                total: user.trail.length,
                userName: user.userName,
              });
            });

            newDots.push(dot);
          }
        });
        breadcrumbDotsRef.current.set(user.userId, newDots);
      } else {
        if (polyline) {
          map.removeLayer(polyline);
          polylinesRef.current.delete(user.userId);
        }
        let existingDots = breadcrumbDotsRef.current.get(user.userId) || [];
        existingDots.forEach((dot) => map.removeLayer(dot));
        breadcrumbDotsRef.current.delete(user.userId);
      }
    });

    // Auto Follow selected user if enabled
    if (autoFollow && selectedUser && map) {
      map.panTo([selectedUser.lat, selectedUser.lng], { animate: true, duration: 0.6 });
    }
  }, [users, selectedUserId, autoFollow, hiddenTrails]);

  // Deep Zoom to Level 19/20 on target location
  const handleDeepZoomTarget = (user: UserLocation, targetZoom = 19) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([user.lat, user.lng], targetZoom, {
      animate: true,
      duration: 1.2,
      easeLinearity: 0.25,
    });
    onSelectUser(user.userId);
  };

  const handleCenterUser = (user: UserLocation) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([user.lat, user.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.8 });
    onSelectUser(user.userId);
  };

  const handleFitAllUsers = () => {
    const map = mapRef.current;
    if (!map || users.length === 0) return;

    if (users.length === 1) {
      map.flyTo([users[0].lat, users[0].lng], 16, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(users.map((u) => [u.lat, u.lng]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18, animate: true });
  };

  const handleToggleTrail = (userId: string) => {
    setHiddenTrails((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCopyCoords = (lat: number, lng: number, id: string) => {
    const text = coordFormat === 'DD'
      ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      : formatDMS(lat, lng);
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadGPX = (user: UserLocation) => {
    const gpxData = exportToGPX(user);
    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user.userName.replace(/\s+/g, '_')}_track_${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadGeoJSON = (user: UserLocation) => {
    const geoJsonData = exportToGeoJSON(user);
    const blob = new Blob([geoJsonData], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user.userName.replace(/\s+/g, '_')}_trail_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapContainerRef.current?.parentElement?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentSelectedSpeedKmh = selectedUser ? getCurrentTravelSpeedKmh(selectedUser) : 0;
  const speedCategory = getSpeedCategory(currentSelectedSpeedKmh);
  const extLinks = selectedUser ? getExternalMapLinks(selectedUser.lat, selectedUser.lng, currentZoom) : null;

  return (
    <div className="relative w-full h-[calc(100vh-4rem-2.25rem)] flex overflow-hidden bg-slate-900 select-none">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10 cursor-crosshair" />

      {/* Center Tactical Crosshair Reticle Overlay */}
      {showTacticalReticle && (
        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Concentric rings */}
            <div className="absolute w-32 h-32 rounded-full border border-blue-500/30 animate-pulse" />
            <div className="absolute w-20 h-20 rounded-full border border-blue-400/50" />
            <div className="absolute w-8 h-8 rounded-full border-2 border-emerald-400/80 shadow-lg" />
            {/* Crosshair lines */}
            <div className="absolute w-full h-[1px] bg-emerald-400/40" />
            <div className="absolute h-full w-[1px] bg-emerald-400/40" />
            {/* Center dot */}
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/80" />
            {/* Precision label */}
            <div className="absolute -bottom-7 px-2 py-0.5 bg-slate-900/90 rounded text-[10px] font-mono text-emerald-300 font-bold border border-emerald-500/40">
              TARGET LOCK
            </div>
          </div>
        </div>
      )}

      {/* Top-Center Storage & Telemetry Banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-700/80 text-white shadow-xl text-xs font-medium">
          <span className={`w-2 h-2 rounded-full ${isServerConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>
            {isServerConnected
              ? `Live Sync Active • ${users.length} Nodes Saved`
              : `Offline Storage Mode • ${users.length} Cached Nodes Trackable`}
          </span>
          <span className="text-slate-400 border-l border-slate-700 pl-2 font-mono text-[11px]">
            Zoom: {currentZoom}x
          </span>
        </div>
      </div>

      {/* Floating Map Controls Top-Left */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        {/* Layer Switcher with HD Satellite, Street, Hybrid, Topo */}
        <div className="relative">
          <button
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 rounded-2xl shadow-md border border-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="capitalize">{TILE_LAYERS[activeLayer].name}</span>
          </button>

          {isLayerMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200 p-2 space-y-1 animate-fade-in z-30">
              <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                High-Definition Map Layers
              </div>
              {(Object.keys(TILE_LAYERS) as MapTileLayer[]).map((layerKey) => {
                const layer = TILE_LAYERS[layerKey];
                return (
                  <button
                    key={layerKey}
                    onClick={() => {
                      setActiveLayer(layerKey);
                      setIsLayerMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                      activeLayer === layerKey
                        ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200/80 shadow-xs'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        {layerKey === 'satellite' && <Satellite className="w-3.5 h-3.5 text-blue-600" />}
                        {layerKey === 'terrain' && <Mountain className="w-3.5 h-3.5 text-emerald-600" />}
                        {layerKey === 'detailed' && <Building2 className="w-3.5 h-3.5 text-purple-600" />}
                        {layerKey === 'dark' && <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                        {layerKey === 'light' && <Sun className="w-3.5 h-3.5 text-amber-600" />}
                        <span>{layer.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-normal">{layer.description}</p>
                    </div>
                    {activeLayer === layerKey && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Deep Street Focus (Zoom 19) Button */}
        {selectedUser && (
          <button
            onClick={() => handleDeepZoomTarget(selectedUser, 19)}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md text-xs font-bold transition-all cursor-pointer shadow-blue-500/20"
            title="Deep Street-Level Magnification (Zoom 19x)"
          >
            <ZoomIn className="w-4 h-4" />
            <span>Deep Focus (19x)</span>
          </button>
        )}

        {/* Tactical Crosshair Reticle Toggle */}
        <button
          onClick={() => setShowTacticalReticle(!showTacticalReticle)}
          className={`flex items-center gap-2 px-3.5 py-2 backdrop-blur-md rounded-2xl shadow-sm border text-xs font-bold transition-all cursor-pointer ${
            showTacticalReticle
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20'
              : 'bg-white/95 hover:bg-white text-slate-800 border-slate-200'
          }`}
          title="Toggle Center Tactical Reticle"
        >
          <Crosshair className="w-4 h-4" />
          <span>Reticle</span>
        </button>

        {/* Follow Mode Toggle */}
        <button
          onClick={() => setAutoFollow(!autoFollow)}
          className={`flex items-center gap-2 px-3.5 py-2 backdrop-blur-md rounded-2xl shadow-sm border text-xs font-bold transition-all cursor-pointer ${
            autoFollow
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-white/95 hover:bg-white text-slate-800 border-slate-200'
          }`}
          title="Auto-center & Follow Selected Sharer"
        >
          <Navigation className={`w-4 h-4 ${autoFollow ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span>{autoFollow ? 'Tracking' : 'Free View'}</span>
        </button>

        {/* Fit All Sharers */}
        <button
          onClick={handleFitAllUsers}
          className="flex items-center gap-2 px-3.5 py-2 bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-200 text-xs font-bold transition-all cursor-pointer"
          title="Fit All Connected Devices in View"
        >
          <Maximize2 className="w-4 h-4 text-slate-600" />
          <span>Fit All ({users.length})</span>
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-2 px-3.5 py-2 bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-200 text-xs font-bold transition-all cursor-pointer"
          title="Toggle Fullscreen Map View"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4 text-slate-600" /> : <Maximize2 className="w-4 h-4 text-slate-600" />}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </div>

      {/* Floating Precision Coordinates Bar (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-20 hidden md:flex items-center gap-3 px-3.5 py-2 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-slate-800 text-[11px] font-mono">
        <span className="text-emerald-400 font-black tracking-wider">[GPS GEO]</span>
        <button
          onClick={() => setCoordFormat(coordFormat === 'DD' ? 'DMS' : 'DD')}
          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded text-[10px] font-bold transition-colors cursor-pointer"
          title="Toggle DD / DMS format"
        >
          {coordFormat}
        </button>
        <span>
          {cursorCoords
            ? coordFormat === 'DD'
              ? `${cursorCoords.lat.toFixed(6)}° N, ${cursorCoords.lng.toFixed(6)}° W`
              : formatDMS(cursorCoords.lat, cursorCoords.lng)
            : '--.------, --.------'}
        </span>
      </div>

      {/* Selected Breadcrumb Point Inspector Popover */}
      {selectedPointInfo && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <h4 className="font-bold text-xs text-slate-900">
                Breadcrumb #{selectedPointInfo.index} of {selectedPointInfo.total}
              </h4>
            </div>
            <button
              onClick={() => setSelectedPointInfo(null)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600 font-mono">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Node:</span>
              <span className="font-bold text-slate-800">{selectedPointInfo.userName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Recorded Time:</span>
              <span className="font-bold text-slate-800">
                {new Date(selectedPointInfo.point.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Recorded Speed:</span>
              <span className="font-bold text-blue-600">
                {formatSpeed(selectedPointInfo.point.speedKmh)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Coordinates:</span>
              <span className="font-bold text-slate-800">
                {selectedPointInfo.point.lat.toFixed(6)}, {selectedPointInfo.point.lng.toFixed(6)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Sharer High-Clarity HUD & Deep Location Inspector */}
      {selectedUser && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-2xl w-[calc(100%-2rem)] bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl border border-slate-200/90 p-4.5 animate-slide-up">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-md shrink-0 mt-0.5"
                style={{ backgroundColor: selectedUser.userColor }}
              >
                {selectedUser.userName.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-slate-900 text-sm tracking-tight truncate">
                    {selectedUser.userName}
                  </h4>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold rounded-full ${speedCategory.badgeColor} ${speedCategory.textColor}`}>
                    {speedCategory.label}
                  </span>
                  {selectedUser.isOffline ? (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold rounded-full">
                      Offline Cache
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Tracking
                    </span>
                  )}
                </div>

                {/* Reverse Geocoded Physical Address */}
                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-700 font-medium truncate">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate" title={resolvedAddress}>
                    {isResolvingAddress ? 'Resolving street location...' : resolvedAddress}
                  </span>
                </div>

                {/* Coordinates & Accuracy */}
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {coordFormat === 'DD'
                    ? `${selectedUser.lat.toFixed(6)}°, ${selectedUser.lng.toFixed(6)}°`
                    : formatDMS(selectedUser.lat, selectedUser.lng)}
                  {selectedUser.accuracy ? ` (±${Math.round(selectedUser.accuracy)}m)` : ''}
                </p>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setCoordFormat(coordFormat === 'DD' ? 'DMS' : 'DD')}
                className="px-2 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer border border-slate-200/60"
                title="Toggle Decimal Degrees / Degrees Minutes Seconds"
              >
                {coordFormat}
              </button>

              <button
                onClick={() => handleCopyCoords(selectedUser.lat, selectedUser.lng, selectedUser.userId)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Copy Coordinates to Clipboard"
              >
                {copiedId === selectedUser.userId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>

              <button
                onClick={() => handleDeepZoomTarget(selectedUser, 19)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                title="Deep 19x Zoom on Target"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                Deep Focus
              </button>
            </div>
          </div>

          {/* Deep Location Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-slate-100 text-center">
            {/* Travel Speed */}
            <div className="bg-blue-50/70 p-2 rounded-xl border border-blue-200/80">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tighter flex items-center justify-center gap-1">
                <Gauge className="w-3 h-3" /> Speed
              </span>
              <span className="text-sm sm:text-base font-extrabold text-blue-950 font-mono block mt-0.5">
                {currentSelectedSpeedKmh.toFixed(1)} <span className="text-xs font-bold text-blue-600">km/h</span>
              </span>
            </div>

            {/* Direction & Bearing */}
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter flex items-center justify-center gap-1">
                <Compass className="w-3 h-3 text-slate-400" /> Bearing
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono block mt-0.5">
                {selectedUser.heading !== null && selectedUser.heading !== undefined
                  ? `${Math.round(selectedUser.heading)}° (${getHeadingCardinal(selectedUser.heading)})`
                  : '--'}
              </span>
            </div>

            {/* Altitude / Elevation */}
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter flex items-center justify-center gap-1">
                <Mountain className="w-3 h-3 text-slate-400" /> Elevation
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono block mt-0.5">
                {selectedUser.altitude !== null && selectedUser.altitude !== undefined
                  ? `${Math.round(selectedUser.altitude)} m`
                  : 'Sea level'}
              </span>
            </div>

            {/* Traveled Trail Distance */}
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3 text-slate-400" /> Traveled
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono block mt-0.5">
                {calculateTrailDistanceKm(selectedUser.trail || []).toFixed(2)} km
              </span>
            </div>
          </div>

          {/* External High-Resolution Satellite & Street View Links */}
          {extLinks && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" /> Deep External Views:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={extLinks.googleSatellite}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
                >
                  Google 3D Satellite
                </a>
                <a
                  href={extLinks.googleStreet}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
                >
                  Street View
                </a>
                <a
                  href={extLinks.openStreetMap}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors inline-flex items-center gap-1"
                >
                  OpenStreetMap
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sleek Connected Nodes Sidebar Drawer */}
      <div
        className={`absolute top-0 right-0 h-full z-20 bg-white/95 backdrop-blur-lg border-l border-slate-200 shadow-2xl transition-all duration-300 flex flex-col ${
          showSidebar ? 'w-80 md:w-96' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-widest">Connected Nodes ({users.length})</h3>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Hide sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Sharers List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {users.length === 0 ? (
            <div className="py-14 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Active Transmissions</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Connect via the Share Client or scan the QR code on a mobile device to begin live streaming.
              </p>
              <button
                onClick={onOpenQR}
                className="mt-5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 mx-auto shadow-sm transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                Mobile QR Code
              </button>
            </div>
          ) : (
            users.map((user) => {
              const isSelected = user.userId === selectedUserId;
              const isTrailHidden = hiddenTrails.has(user.userId);
              const trailDist = calculateTrailDistanceKm(user.trail || []);
              const speedKmh = getCurrentTravelSpeedKmh(user);

              return (
                <div
                  key={user.userId}
                  className={`p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-blue-50/50 border-blue-300 shadow-sm ring-1 ring-blue-400/40'
                      : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs"
                        style={{ backgroundColor: user.userColor }}
                      >
                        {user.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900">{user.userName}</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block">
                          {formatRelativeTime(user.timestamp)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleTrail(user.userId)}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isTrailHidden
                            ? 'text-slate-400 hover:text-slate-600 bg-slate-100'
                            : 'text-blue-600 hover:bg-blue-100 bg-blue-50'
                        }`}
                        title={isTrailHidden ? 'Show Breadcrumb Trail' : 'Hide Trail'}
                      >
                        {isTrailHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => handleDeepZoomTarget(user, 19)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Deep Street-Level Focus (Zoom 19x)"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleCenterUser(user)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Center map on this node"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Telemetry Stats Grid highlighting Current Travel Speed (km/h) */}
                  <div className="grid grid-cols-3 gap-1.5 py-2 px-2.5 bg-slate-50 rounded-xl text-center text-xs mb-3 border border-slate-100">
                    <div className="bg-white/80 rounded-lg p-1 border border-slate-200/60">
                      <span className="text-[9px] text-blue-700 font-bold uppercase tracking-tighter block">Travel Speed</span>
                      <span className="font-extrabold text-blue-950 font-mono text-xs block mt-0.5">
                        {speedKmh.toFixed(1)} km/h
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter block">Distance</span>
                      <span className="font-bold text-slate-800 font-mono block mt-0.5">{trailDist.toFixed(2)} km</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter block">Accuracy</span>
                      <span className="font-bold text-slate-800 font-mono block mt-0.5">
                        {user.accuracy ? `±${Math.round(user.accuracy)}m` : '--'}
                      </span>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDownloadGPX(user)}
                        className="hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        GPX
                      </button>
                      <button
                        onClick={() => handleDownloadGeoJSON(user)}
                        className="hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        GeoJSON
                      </button>
                    </div>

                    <button
                      onClick={() => onClearTrail(user.userId)}
                      className="text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Clear trail breadcrumbs"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Show Sidebar Toggle */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3.5 py-2 bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 rounded-2xl shadow-md border border-slate-200 text-xs font-bold transition-all cursor-pointer"
        >
          <Users className="w-4 h-4 text-blue-600" />
          <span>Nodes ({users.length})</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
