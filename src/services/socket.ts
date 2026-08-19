import { io, Socket } from 'socket.io-client';
import { UserLocation } from '../types';
import { enqueueOfflinePing, getOfflineQueue, clearOfflineQueue } from './backgroundTracker';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to telemetry server, ID:', socket?.id);
      flushOfflinePings();
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected from telemetry server:', reason);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
    });
  }
  return socket;
}

// Flush stored offline pings to server once reconnected
export async function flushOfflinePings(): Promise<void> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  console.log(`[OfflineSync] Flushing ${queue.length} buffered GPS pings to server...`);
  try {
    const res = await fetch('/api/locations/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pings: queue }),
    });
    if (res.ok) {
      clearOfflineQueue();
      console.log('[OfflineSync] Offline queue successfully synced to server.');
    }
  } catch (err) {
    console.warn('[OfflineSync] Could not sync offline pings yet:', err);
  }
}

/**
 * Resilient Location Update
 * 1. Emits via WebSocket if connected
 * 2. Falls back to REST POST /api/locations/ping
 * 3. Enqueues locally in case network/server is completely offline
 */
export async function emitLocationUpdate(data: Partial<UserLocation> & { lat: number; lng: number; userId: string; timestamp: number }) {
  const s = getSocket();
  
  if (s.connected) {
    s.emit('update-location', data);
    return;
  }

  // Socket offline -> try REST API
  try {
    const res = await fetch('/api/locations/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    // Network or server closed/offline -> Enqueue in local storage for later replay
    enqueueOfflinePing({
      userId: data.userId,
      userName: data.userName || 'User',
      userColor: data.userColor || '#2563EB',
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      altitude: data.altitude,
      speed: data.speed,
      calculatedSpeedKmh: data.calculatedSpeedKmh,
      heading: data.heading,
      battery: data.battery,
      isSimulated: data.isSimulated,
      timestamp: data.timestamp || Date.now(),
    });
  }
}

export function emitStopSharing(userId: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('stop-sharing', { userId });
  } else {
    fetch(`/api/locations/${userId}`, { method: 'DELETE' }).catch(() => {});
  }
}

export function emitClearTrail(userId: string) {
  const s = getSocket();
  if (s.connected) {
    s.emit('clear-trail', { userId });
  }
}
