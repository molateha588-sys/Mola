import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const DB_FILE = path.join(process.cwd(), 'locations_db.json');

interface TrailPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number | null;
  speedKmh?: number | null;
}

interface UserLocation {
  userId: string;
  userName: string;
  userColor: string;
  userAvatar?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null;
  calculatedSpeedKmh?: number | null;
  lastPingDeltaMs?: number | null;
  maxSpeedKmh?: number | null;
  avgSpeedKmh?: number | null;
  heading?: number | null;
  battery?: number | null;
  isSimulated?: boolean;
  isOffline?: boolean;
  timestamp: number;
  trail: TrailPoint[];
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

function calculateTrailDistance(trail: TrailPoint[]): number {
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

// Load saved locations from persistent storage on startup
function loadPersistedLocations(): Map<string, UserLocation> {
  const map = new Map<string, UserLocation>();
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed: UserLocation[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        parsed.forEach((user) => {
          user.isOffline = true; // Set to offline until socket/REST reconnects
          map.set(user.userId, user);
        });
        console.log(`[Database] Loaded ${map.size} persistent tracking sessions from disk.`);
      }
    }
  } catch (err) {
    console.warn('[Database] Could not read disk locations:', err);
  }
  return map;
}

// Save locations to persistent storage
function savePersistedLocations(usersMap: Map<string, UserLocation>) {
  try {
    const list = Array.from(usersMap.values());
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Database] Could not write to disk:', err);
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const PORT = 3000;

  // In-memory store initialized with disk backup
  const activeUsers = loadPersistedLocations();
  const socketToUser = new Map<string, string>();

  app.use(express.json({ limit: '10mb' }));

  // Process a location update (shared between WebSocket and REST API)
  function processLocationUpdate(data: {
    userId: string;
    userName?: string;
    userColor?: string;
    userAvatar?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number | null;
    speed?: number | null;
    calculatedSpeedKmh?: number | null;
    heading?: number | null;
    battery?: number | null;
    isSimulated?: boolean;
    timestamp?: number;
  }): UserLocation {
    const userId = data.userId;
    const userName = data.userName || `User_${userId.slice(0, 4)}`;
    const userColor = data.userColor || '#3B82F6';
    const timestamp = data.timestamp || Date.now();

    const existing = activeUsers.get(userId);
    const previousTrail = existing?.trail || [];

    let calculatedSpeedKmh = 0;
    let lastPingDeltaMs = 1000;

    if (existing && existing.timestamp) {
      const deltaDistanceKm = calculateDistanceKm(existing.lat, existing.lng, data.lat, data.lng);
      lastPingDeltaMs = Math.max(50, timestamp - existing.timestamp);
      const deltaHours = lastPingDeltaMs / (1000 * 3600);

      if (deltaHours > 0 && deltaHours < (120 / 3600)) {
        calculatedSpeedKmh = deltaDistanceKm / deltaHours;
      } else if (data.speed !== null && data.speed !== undefined && data.speed >= 0) {
        calculatedSpeedKmh = data.speed * 3.6;
      }
    } else if (data.speed !== null && data.speed !== undefined && data.speed >= 0) {
      calculatedSpeedKmh = data.speed * 3.6;
    } else if (data.calculatedSpeedKmh) {
      calculatedSpeedKmh = data.calculatedSpeedKmh;
    }

    if (data.isSimulated && data.calculatedSpeedKmh && data.calculatedSpeedKmh > 0) {
      calculatedSpeedKmh = data.calculatedSpeedKmh;
    } else if (data.speed && data.speed > 0 && calculatedSpeedKmh === 0) {
      calculatedSpeedKmh = data.speed * 3.6;
    }

    if (calculatedSpeedKmh > 350) {
      calculatedSpeedKmh = (data.speed && data.speed >= 0) ? data.speed * 3.6 : 0;
    }

    const currentMaxSpeed = Math.max(existing?.maxSpeedKmh || 0, calculatedSpeedKmh);

    const newPoint: TrailPoint = {
      lat: data.lat,
      lng: data.lng,
      timestamp,
      speed: data.speed ?? (calculatedSpeedKmh / 3.6),
      speedKmh: Number(calculatedSpeedKmh.toFixed(1)),
    };
    const updatedTrail = [...previousTrail, newPoint].slice(-300);

    let avgSpeedKmh = calculatedSpeedKmh;
    if (updatedTrail.length > 1) {
      const totalDist = calculateTrailDistance(updatedTrail);
      const totalElapsedHours = (updatedTrail[updatedTrail.length - 1].timestamp - updatedTrail[0].timestamp) / (1000 * 3600);
      if (totalElapsedHours > 0) {
        avgSpeedKmh = totalDist / totalElapsedHours;
      }
    }

    const userLocation: UserLocation = {
      userId,
      userName,
      userColor,
      userAvatar: data.userAvatar || existing?.userAvatar,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      altitude: data.altitude,
      speed: data.speed ?? (calculatedSpeedKmh / 3.6),
      calculatedSpeedKmh: Number(calculatedSpeedKmh.toFixed(1)),
      lastPingDeltaMs,
      maxSpeedKmh: Number(currentMaxSpeed.toFixed(1)),
      avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
      heading: data.heading,
      battery: data.battery,
      isSimulated: data.isSimulated || false,
      isOffline: false,
      timestamp,
      trail: updatedTrail,
    };

    activeUsers.set(userId, userLocation);
    savePersistedLocations(activeUsers);

    io.emit('location-broadcast', userLocation);
    return userLocation;
  }

  // REST API endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeUsersCount: activeUsers.size,
      timestamp: Date.now(),
    });
  });

  app.get('/api/locations', (req, res) => {
    const locations = Array.from(activeUsers.values());
    res.json({
      count: locations.length,
      users: locations,
    });
  });

  // REST single background GPS ping endpoint
  app.post('/api/locations/ping', (req, res) => {
    const data = req.body;
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number' || !data.userId) {
      res.status(400).json({ error: 'Missing lat, lng, or userId' });
      return;
    }
    const location = processLocationUpdate(data);
    res.json({ success: true, location });
  });

  // REST batch replay endpoint for offline queued pings
  app.post('/api/locations/batch', (req, res) => {
    const { pings } = req.body;
    if (!Array.isArray(pings) || pings.length === 0) {
      res.status(400).json({ error: 'Expected non-empty pings array' });
      return;
    }
    let lastLocation: UserLocation | null = null;
    pings.forEach((ping) => {
      if (typeof ping.lat === 'number' && typeof ping.lng === 'number' && ping.userId) {
        lastLocation = processLocationUpdate(ping);
      }
    });
    res.json({ success: true, count: pings.length, lastLocation });
  });

  app.delete('/api/locations/:userId', (req, res) => {
    const { userId } = req.params;
    activeUsers.delete(userId);
    savePersistedLocations(activeUsers);
    io.emit('user-left', { userId });
    res.json({ success: true });
  });

  // Socket.io event handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('initial-state', {
      users: Array.from(activeUsers.values()),
    });

    socket.on('register-user', (userData: { userId: string; userName: string; userColor?: string; userAvatar?: string }) => {
      socketToUser.set(socket.id, userData.userId);
      const existing = activeUsers.get(userData.userId);
      if (existing) {
        existing.userName = userData.userName || existing.userName;
        existing.userColor = userData.userColor || existing.userColor;
        existing.userAvatar = userData.userAvatar || existing.userAvatar;
        existing.isOffline = false;
        io.emit('user-updated', existing);
      }
    });

    socket.on('update-location', (data: any) => {
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
      const userId = data.userId || socketToUser.get(socket.id) || socket.id;
      socketToUser.set(socket.id, userId);
      processLocationUpdate({ ...data, userId });
    });

    socket.on('stop-sharing', (data: { userId?: string }) => {
      const userId = data?.userId || socketToUser.get(socket.id) || socket.id;
      const existing = activeUsers.get(userId);
      if (existing) {
        existing.isOffline = true;
        io.emit('user-updated', existing);
      }
    });

    socket.on('clear-trail', (data: { userId?: string }) => {
      const userId = data?.userId || socketToUser.get(socket.id) || socket.id;
      const existing = activeUsers.get(userId);
      if (existing) {
        existing.trail = [{ lat: existing.lat, lng: existing.lng, timestamp: Date.now(), speed: 0, speedKmh: 0 }];
        existing.maxSpeedKmh = 0;
        existing.avgSpeedKmh = 0;
        existing.calculatedSpeedKmh = 0;
        savePersistedLocations(activeUsers);
        io.emit('user-updated', existing);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const userId = socketToUser.get(socket.id);
      if (userId) {
        socketToUser.delete(socket.id);
        const existing = activeUsers.get(userId);
        if (existing) {
          // Mark as offline instead of deleting immediately, retaining full history
          existing.isOffline = true;
          savePersistedLocations(activeUsers);
          io.emit('user-updated', existing);
        }
      }
    });
  });

  // Vite middleware in dev / static in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LocateX Telemetry Server running on http://localhost:${PORT}`);
  });
}

startServer();
