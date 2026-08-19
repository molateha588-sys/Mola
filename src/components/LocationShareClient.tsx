import React, { useState, useEffect, useRef } from 'react';
import { emitLocationUpdate, emitStopSharing } from '../services/socket';
import { 
  requestScreenWakeLock, 
  releaseScreenWakeLock, 
  startBackgroundAudioKeepAlive, 
  stopBackgroundAudioKeepAlive, 
  registerServiceWorker,
  getOfflineQueue 
} from '../services/backgroundTracker';
import { PRESET_ROUTES, calculateDistanceKm, getSpeedCategory } from '../utils/geoUtils';
import { 
  Radio, 
  MapPin, 
  Compass, 
  Play, 
  Square, 
  RefreshCw, 
  Smartphone, 
  AlertCircle,
  CheckCircle2,
  Download,
  Sliders,
  Terminal,
  Activity,
  ShieldCheck,
  Zap,
  Gauge,
  Lock,
  Moon,
  VolumeX,
  Layers,
  WifiOff
} from 'lucide-react';

interface LocationShareClientProps {
  userId: string;
  userName: string;
  userColor: string;
  onUpdateProfile: (name: string, color: string) => void;
  onOpenQR: () => void;
}

interface TelemetryLog {
  id: string;
  type: 'LOG' | 'PUSH' | 'WARN' | 'GPS' | 'SPD' | 'BKG';
  text: string;
  timestamp: string;
}

interface TransmissionPacket {
  id: number;
  time: string;
  lat: number;
  lng: number;
  speedKmh: number;
  deltaMs: number;
}

const COLOR_PRESETS = [
  '#2563EB', // Blue
  '#DC2626', // Red
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#D97706', // Amber
  '#DB2777', // Pink
];

export const LocationShareClient: React.FC<LocationShareClientProps> = ({
  userId,
  userName,
  userColor,
  onUpdateProfile,
  onOpenQR,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [statusText, setStatusText] = useState('Status: Waiting');
  const [statusType, setStatusType] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  
  // Background & Resilience Settings
  const [wakeLockActive, setWakeLockActive] = useState(true);
  const [audioKeepAliveActive, setAudioKeepAliveActive] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Coordinates & Telemetry
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState<number>(0);
  const [pingDeltaMs, setPingDeltaMs] = useState<number>(1000);
  const [heading, setHeading] = useState<number | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [packetCount, setPacketCount] = useState(880);
  const [sessionStartTime] = useState<number>(Date.now());
  const [sessionDuration, setSessionDuration] = useState('00:00:00');

  const lastCoordsRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  // Logs and Transmission History
  const [logs, setLogs] = useState<TelemetryLog[]>([
    { id: '1', type: 'LOG', text: 'LocateX Persistent Telemetry initialized...', timestamp: new Date().toLocaleTimeString() },
    { id: '2', type: 'BKG', text: 'Background Keep-Alive & Wake Lock Engine active', timestamp: new Date().toLocaleTimeString() },
    { id: '3', type: 'SPD', text: 'High-precision travel speed calculator active (km/h)', timestamp: new Date().toLocaleTimeString() },
    { id: '4', type: 'GPS', text: 'Real GPS hardware standby', timestamp: new Date().toLocaleTimeString() },
  ]);
  const [transmissions, setTransmissions] = useState<TransmissionPacket[]>([]);

  // Settings
  const [highAccuracy, setHighAccuracy] = useState(true);
  const [customName, setCustomName] = useState(userName);
  const [selectedColor, setSelectedColor] = useState(userColor);

  // Simulation mode
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(PRESET_ROUTES[0].id);
  const [simulationSpeedMultiplier, setSimulationSpeedMultiplier] = useState(1);

  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const simStepRef = useRef<number>(0);
  const fallbackIntervalRef = useRef<number | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Register PWA service worker on mount
  useEffect(() => {
    registerServiceWorker();
    const q = getOfflineQueue();
    setOfflineQueueCount(q.length);
  }, []);

  // Update session duration timer & check offline queue
  useEffect(() => {
    const timer = setInterval(() => {
      const diffSec = Math.floor((Date.now() - sessionStartTime) / 1000);
      const hours = String(Math.floor(diffSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
      const secs = String(diffSec % 60).padStart(2, '0');
      setSessionDuration(`${hours}:${mins}:${secs}`);
      setOfflineQueueCount(getOfflineQueue().length);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Read battery status
  useEffect(() => {
    if ('getBattery' in navigator) {
      // @ts-expect-error - navigator.getBattery experimental API
      navigator.getBattery().then((battery: { level: number; addEventListener: (type: string, cb: () => void) => void }) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  const addLog = (type: 'LOG' | 'PUSH' | 'WARN' | 'GPS' | 'SPD' | 'BKG', text: string) => {
    setLogs((prev) => [
      ...prev.slice(-25),
      { id: String(Date.now() + Math.random()), type, text, timestamp: new Date().toLocaleTimeString() },
    ]);
  };

  // Start real GPS tracking with Background Mode (Wake Lock + Audio Keepalive)
  const startRealLocationTracking = async () => {
    if (!navigator.geolocation) {
      setStatusText('Status: Geolocation is not supported.');
      setStatusType('error');
      addLog('WARN', 'Geolocation API unavailable');
      return;
    }

    stopSimulation();
    setStatusText('Status: Requesting real GPS...');
    setStatusType('loading');
    setIsSharing(true);
    lastCoordsRef.current = null;

    // Enable Background Keep-Alive
    if (wakeLockActive) {
      const lockAcquired = await requestScreenWakeLock();
      if (lockAcquired) {
        addLog('BKG', 'Screen Wake Lock acquired (prevents sleep)');
      }
    }

    if (audioKeepAliveActive) {
      startBackgroundAudioKeepAlive();
      addLog('BKG', 'Silent background heartbeat active (prevents mobile OS throttling)');
    }

    addLog('GPS', 'Acquiring real GPS fix with high accuracy...');

    const handleNewPosition = (position: GeolocationPosition) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const acc = position.coords.accuracy;
      const alt = position.coords.altitude;
      const head = position.coords.heading;
      const now = position.timestamp || Date.now();

      // Calculate travel speed (km/h) between location updates and time elapsed between pings
      let calculatedKmh = 0;
      let deltaMs = 1000;

      if (lastCoordsRef.current) {
        const distKm = calculateDistanceKm(
          lastCoordsRef.current.lat,
          lastCoordsRef.current.lng,
          latitude,
          longitude
        );
        deltaMs = Math.max(50, now - lastCoordsRef.current.time);
        const elapsedHours = deltaMs / (1000 * 3600);
        
        if (elapsedHours > 0 && elapsedHours < (120 / 3600)) {
          calculatedKmh = distKm / elapsedHours;
        } else if (position.coords.speed !== null && position.coords.speed !== undefined && position.coords.speed >= 0) {
          calculatedKmh = position.coords.speed * 3.6;
        }
      } else if (position.coords.speed !== null && position.coords.speed !== undefined && position.coords.speed >= 0) {
        calculatedKmh = position.coords.speed * 3.6;
      }

      if (position.coords.speed && position.coords.speed > 0 && calculatedKmh === 0) {
        calculatedKmh = position.coords.speed * 3.6;
      }

      if (calculatedKmh > 350) calculatedKmh = 0;

      lastCoordsRef.current = { lat: latitude, lng: longitude, time: now };

      const formattedKmh = Number(calculatedKmh.toFixed(1));
      setLat(latitude);
      setLng(longitude);
      setAccuracy(acc);
      setAltitude(alt);
      setSpeedKmh(formattedKmh);
      setMaxSpeedKmh((prev) => Math.max(prev, formattedKmh));
      setPingDeltaMs(deltaMs);
      setHeading(head);
      setPacketCount((p) => p + 1);

      setStatusText(`Status: Real GPS Active • ${formattedKmh} km/h`);
      setStatusType('active');

      addLog('PUSH', `Packet #${packetCount + 1} (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) • ${formattedKmh} km/h`);
      
      setTransmissions((prev) => [
        {
          id: packetCount + 1,
          time: new Date().toLocaleTimeString(),
          lat: latitude,
          lng: longitude,
          speedKmh: formattedKmh,
          deltaMs,
        },
        ...prev.slice(0, 15),
      ]);

      emitLocationUpdate({
        userId,
        userName: customName.trim() || userName,
        userColor: selectedColor,
        lat: latitude,
        lng: longitude,
        accuracy: acc,
        altitude: alt,
        speed: calculatedKmh / 3.6,
        calculatedSpeedKmh: formattedKmh,
        heading: head,
        battery: batteryLevel,
        isSimulated: false,
        backgroundActive: true,
        timestamp: now,
      });
    };

    const id = navigator.geolocation.watchPosition(
      handleNewPosition,
      (error) => {
        setStatusText(`GPS Warning: ${error.message} (retrying)`);
        addLog('WARN', `GPS notice: ${error.message}`);
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 1000,
        timeout: 20000,
      }
    );

    watchIdRef.current = id;

    // Fallback heartbeat interval to ensure continuous background GPS pings even if watchPosition pauses
    fallbackIntervalRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handleNewPosition,
        () => {},
        { enableHighAccuracy: highAccuracy, maximumAge: 2000, timeout: 5000 }
      );
    }, 5000);
  };

  const stopRealLocationTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackIntervalRef.current !== null) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }

    releaseScreenWakeLock();
    stopBackgroundAudioKeepAlive();

    setIsSharing(false);
    setStatusText('Status: Stopped');
    setStatusType('idle');
    setSpeedKmh(0);
    addLog('LOG', 'Transmission & background service stopped by user');
    emitStopSharing(userId);
  };

  // Start simulation track
  const startSimulation = () => {
    stopRealLocationTracking();
    setIsSimulating(true);
    setIsSharing(true);
    setStatusType('active');

    const route = PRESET_ROUTES.find((r) => r.id === selectedRouteId) || PRESET_ROUTES[0];
    const coords = route.coordinates;
    simStepRef.current = 0;
    lastCoordsRef.current = null;
    addLog('LOG', `Simulator started route: ${route.name} (${route.speedKmh} km/h)`);

    const intervalMs = Math.max(800 / simulationSpeedMultiplier, 200);

    simIntervalRef.current = window.setInterval(() => {
      const totalSteps = coords.length * 10;
      const progress = (simStepRef.current % totalSteps) / totalSteps;
      const index = Math.floor(progress * (coords.length - 1));
      const nextIndex = (index + 1) % coords.length;
      const subProgress = (progress * (coords.length - 1)) - index;

      const p1 = coords[index];
      const p2 = coords[nextIndex];

      const simLat = p1[0] + (p2[0] - p1[0]) * subProgress;
      const simLng = p1[1] + (p2[1] - p1[1]) * subProgress;
      
      const dLng = p2[1] - p1[1];
      const dLat = p2[0] - p1[0];
      const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      const simHeading = (angle + 360) % 360;
      const targetSpeedKmh = route.speedKmh * simulationSpeedMultiplier;
      const simSpeedMs = targetSpeedKmh / 3.6;
      const simAcc = Math.floor(3 + Math.random() * 4);
      const now = Date.now();

      let calculatedKmh = targetSpeedKmh;
      let deltaMs = intervalMs;
      if (lastCoordsRef.current) {
        const distKm = calculateDistanceKm(lastCoordsRef.current.lat, lastCoordsRef.current.lng, simLat, simLng);
        deltaMs = Math.max(50, now - lastCoordsRef.current.time);
        const elapsedHours = deltaMs / (1000 * 3600);
        if (elapsedHours > 0) {
          calculatedKmh = distKm / elapsedHours;
        }
      }
      lastCoordsRef.current = { lat: simLat, lng: simLng, time: now };

      const formattedKmh = Number(calculatedKmh.toFixed(1));
      setLat(simLat);
      setLng(simLng);
      setAccuracy(simAcc);
      setAltitude(20 + Math.sin(simStepRef.current * 0.1) * 6);
      setSpeedKmh(formattedKmh);
      setMaxSpeedKmh((prev) => Math.max(prev, formattedKmh));
      setPingDeltaMs(deltaMs);
      setHeading(simHeading);
      setPacketCount((p) => p + 1);

      setStatusText(`Status: Simulating • ${formattedKmh} km/h`);
      addLog('PUSH', `Packet #${packetCount + 1} (${simLat.toFixed(4)}, ${simLng.toFixed(4)}) • ${formattedKmh} km/h`);

      setTransmissions((prev) => [
        {
          id: packetCount + 1,
          time: new Date().toLocaleTimeString(),
          lat: simLat,
          lng: simLng,
          speedKmh: formattedKmh,
          deltaMs,
        },
        ...prev.slice(0, 15),
      ]);

      emitLocationUpdate({
        userId,
        userName: customName.trim() || userName,
        userColor: selectedColor,
        lat: simLat,
        lng: simLng,
        accuracy: simAcc,
        altitude: 20,
        speed: simSpeedMs,
        calculatedSpeedKmh: formattedKmh,
        heading: simHeading,
        battery: batteryLevel || 94,
        isSimulated: true,
        backgroundActive: false,
        timestamp: now,
      });

      simStepRef.current += 1;
    }, intervalMs);
  };

  const stopSimulation = () => {
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsSimulating(false);
    setIsSharing(false);
    setStatusText('Status: Waiting');
    setStatusType('idle');
    setSpeedKmh(0);
    addLog('LOG', 'Simulator stopped');
    emitStopSharing(userId);
  };

  const handleToggleShare = () => {
    if (isSharing) {
      if (isSimulating) {
        stopSimulation();
      } else {
        stopRealLocationTracking();
      }
    } else {
      startRealLocationTracking();
    }
  };

  const handleDownloadLogs = () => {
    const logData = transmissions.map((t) => ({
      packetId: t.id,
      timestamp: t.time,
      latitude: t.lat,
      longitude: t.lng,
      travelSpeedKmh: t.speedKmh,
      pingIntervalMs: t.deltaMs,
    }));
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry_logs_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (fallbackIntervalRef.current !== null) {
        clearInterval(fallbackIntervalRef.current);
      }
      if (simIntervalRef.current !== null) {
        clearInterval(simIntervalRef.current);
      }
      releaseScreenWakeLock();
      stopBackgroundAudioKeepAlive();
    };
  }, []);

  const speedCat = getSpeedCategory(speedKmh);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col xl:flex-row gap-6 animate-fade-in font-sans text-slate-900">
      {/* Left Column: Connection Status & Telemetry Terminal */}
      <aside className="w-full xl:w-80 flex flex-col sm:flex-row xl:flex-col gap-6 shrink-0">
        {/* Connection & Background Status Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 sm:w-1/2 xl:w-full">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
            <span>Transmission & Background</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                Screen Wake Lock
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSharing && wakeLockActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                {isSharing && wakeLockActive ? 'Locked On' : 'Standby'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600 flex items-center gap-1.5">
                <VolumeX className="w-3.5 h-3.5 text-purple-600" />
                Audio Keep-Alive
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSharing && audioKeepAliveActive ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'}`}>
                {isSharing && audioKeepAliveActive ? 'Active' : 'Standby'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600 flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                Offline Queue
              </span>
              <span className="text-xs font-mono font-bold text-slate-700">
                {offlineQueueCount} buffered
              </span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-600">Travel Speed</span>
              <span className="text-xs font-mono font-extrabold text-blue-700">{speedKmh.toFixed(1)} km/h</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">Peak Recorded</span>
              <span className="text-xs font-mono font-semibold text-slate-800">{maxSpeedKmh.toFixed(1)} km/h</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">Accuracy</span>
              <span className="text-xs font-mono font-semibold text-emerald-600">
                {accuracy ? `±${Math.round(accuracy)}m` : 'High (Real GPS)'}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Background Telemetry</span>
              <span className="text-xs text-emerald-600 font-bold">
                {isSharing ? 'Continuous' : 'Standby'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
              <div className={`h-full w-1/4 ${isSharing ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className={`h-full w-1/4 ${isSharing ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className={`h-full w-1/4 ${isSharing ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className={`h-full w-1/4 ${isSharing ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>
          </div>
        </div>

        {/* Telemetry Raw Terminal Box */}
        <div className="bg-slate-900 p-5 rounded-2xl text-white flex-1 sm:w-1/2 xl:w-full flex flex-col h-72 xl:h-80 shadow-md">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span>Real-Time Logs</span>
            </h3>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="font-mono text-[11px] space-y-1.5 overflow-y-auto flex-1 opacity-90 pr-1 select-text">
            {logs.map((log) => (
              <p key={log.id} className="leading-tight">
                {log.type === 'LOG' && <span className="text-emerald-400 font-bold">[LOG] </span>}
                {log.type === 'PUSH' && <span className="text-blue-400 font-bold">[PUSH] </span>}
                {log.type === 'GPS' && <span className="text-cyan-400 font-bold">[GPS] </span>}
                {log.type === 'BKG' && <span className="text-emerald-300 font-bold">[BKG] </span>}
                {log.type === 'SPD' && <span className="text-purple-400 font-bold">[SPD] </span>}
                {log.type === 'WARN' && <span className="text-amber-400 font-bold">[WARN] </span>}
                <span className="text-slate-300">{log.text}</span>
              </p>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </aside>

      {/* Center Main Stage: Broadcasting Core */}
      <section className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden p-6 sm:p-10 min-h-[480px]">
        <div className="absolute inset-0 bg-dot-pattern opacity-[0.03]" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full">
          {/* Pulsing Radar Beacon */}
          <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mb-6 relative">
            <div
              className={`absolute inset-0 rounded-full ${
                isSharing ? 'bg-blue-400 animate-pulse opacity-25' : 'bg-slate-200 opacity-20'
              }`}
            />
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md transition-transform duration-300"
              style={{ backgroundColor: selectedColor }}
            >
              <Radio className={`w-7 h-7 ${isSharing ? 'animate-pulse' : ''}`} />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 tracking-tight">
            {isSharing ? 'Transmitting Real Location' : 'Real-Time Location Transmitter'}
          </h1>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed max-w-md">
            Broadcasts your real physical coordinates in background mode. Keeps tracking even if screen locks or server restarts.
          </p>

          {/* Background Mode Notice Pill */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              Background Keep-Alive Active
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Auto-Replay on Reconnect
            </span>
          </div>

          {/* Real-Time Travel Speedometer Display Card */}
          <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-6 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-blue-600" />
                Current Travel Speed
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${speedCat.badgeColor} ${speedCat.textColor}`}>
                {speedCat.label}
              </span>
            </div>

            <div className="flex items-baseline justify-center gap-2 py-2">
              <span className="text-4xl sm:text-5xl font-extrabold font-mono text-slate-900 tracking-tight">
                {speedKmh.toFixed(1)}
              </span>
              <span className="text-lg sm:text-xl font-bold text-blue-600">km/h</span>
            </div>

            <div className="flex items-center justify-around pt-2 border-t border-slate-200/60 text-xs text-slate-500">
              <span>Peak: <strong className="text-slate-800 font-mono">{maxSpeedKmh.toFixed(1)} km/h</strong></span>
              <span className="w-px h-3 bg-slate-200" />
              <span>Ping Interval: <strong className="text-slate-800 font-mono">{(pingDeltaMs / 1000).toFixed(1)}s</strong></span>
            </div>
          </div>

          {/* Main Action Button (Real GPS) */}
          <button
            id="share-btn"
            onClick={handleToggleShare}
            className={`w-full sm:w-auto px-10 sm:px-12 py-4 rounded-2xl font-bold text-base sm:text-lg transition-all shadow-xl flex items-center justify-center gap-3 cursor-pointer select-none active:scale-98 ${
              isSharing
                ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-300 ring-4 ring-slate-100'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/25 ring-4 ring-blue-50'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                isSharing ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span>{isSharing ? 'Stop Transmission' : 'Transmit Real GPS (Background)'}</span>
          </button>

          {/* Status Display Pill */}
          <div
            id="status"
            className={`mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              statusType === 'active'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : statusType === 'loading'
                ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                : statusType === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {statusType === 'active' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {statusType === 'loading' && <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />}
            {statusType === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
            <span>{statusText}</span>
          </div>

          {/* Big Coordinate Readouts */}
          <div className="mt-8 flex items-center justify-center gap-6 sm:gap-10 pt-6 border-t border-slate-100 w-full">
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latitude</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-slate-800">
                {lat !== null ? `${lat.toFixed(5)}° N` : '--.-----°'}
              </p>
            </div>
            <div className="w-px h-10 bg-slate-200" />
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Longitude</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-slate-800">
                {lng !== null ? `${lng.toFixed(5)}° W` : '--.-----°'}
              </p>
            </div>
          </div>

          {/* Quick Controls (Profile + Simulation Fallback) */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
            {/* Identity Customization */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-600" />
                  Node Identity
                </span>
                <div className="flex gap-1.5">
                  {COLOR_PRESETS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedColor(c);
                        onUpdateProfile(customName, c);
                      }}
                      className={`w-3.5 h-3.5 rounded-full transition-transform ${
                        selectedColor === c ? 'scale-125 ring-1 ring-slate-800' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  onUpdateProfile(e.target.value, selectedColor);
                }}
                placeholder="Device Name..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Test Route Simulator */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-blue-600" />
                  Route Simulator
                </span>
                <button
                  type="button"
                  onClick={isSimulating ? stopSimulation : startSimulation}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                    isSimulating
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSimulating ? 'Stop Demo' : 'Test Route'}
                </button>
              </div>
              <select
                value={selectedRouteId}
                disabled={isSimulating}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PRESET_ROUTES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.speedKmh} km/h)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Tunnel Meta Bar */}
        <div className="mt-8 w-full flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-medium text-slate-400 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
          <span>Background Mode: <strong className="text-emerald-600 font-semibold">PERSISTENT (WAKE LOCK + BUFFER)</strong></span>
          <span>Offline Queue: <strong className="text-slate-600 font-semibold">{offlineQueueCount} packets</strong></span>
          <span>Session Time: <strong className="text-slate-600 font-mono font-semibold">{sessionDuration}</strong></span>
        </div>
      </section>

      {/* Right Column: Recent Transmissions Log */}
      <aside className="w-full xl:w-80 flex flex-col gap-6 shrink-0">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[380px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Transmissions</h3>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[360px] pr-1">
            {transmissions.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-xs font-medium">No packets sent yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">Press "Transmit Real GPS" to start streaming.</p>
              </div>
            ) : (
              transmissions.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 transition-colors hover:bg-slate-100/80"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                    TX
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">Packet #{t.id}</span>
                      <span className="text-[10px] text-blue-600 font-mono font-bold">{t.speedKmh.toFixed(1)} km/h</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono truncate">
                      Coords: {t.lat.toFixed(5)}, {t.lng.toFixed(5)} (Δt: {(t.deltaMs / 1000).toFixed(1)}s)
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleDownloadLogs}
            disabled={transmissions.length === 0}
            className="w-full py-3 mt-4 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-2 border border-blue-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Download Telemetry Logs
          </button>
        </div>
      </aside>
    </div>
  );
};
