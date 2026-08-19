/**
 * Background Tracker Service
 * Provides Wake Lock, Silent Audio Heartbeat, and Offline Queueing
 * ensuring location tracking continues even if phone sleeps, tabs change, or server temporarily disconnects.
 */

export interface QueuedLocationPing {
  userId: string;
  userName: string;
  userColor: string;
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null;
  calculatedSpeedKmh?: number | null;
  heading?: number | null;
  battery?: number | null;
  isSimulated?: boolean;
  timestamp: number;
}

const OFFLINE_QUEUE_KEY = 'locatex_offline_pings_queue';

// Screen Wake Lock Handler
let wakeLockSentinel: any = null;

export async function requestScreenWakeLock(): Promise<boolean> {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      return false;
    }
  }
  return false;
}

export function releaseScreenWakeLock(): void {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// Silent Audio Keep-Alive for iOS / Android mobile browsers
let audioContext: AudioContext | null = null;
let keepAliveOscillator: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;

export function startBackgroundAudioKeepAlive(): boolean {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return false;

    if (!audioContext) {
      audioContext = new AudioCtx();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    if (!keepAliveOscillator) {
      keepAliveOscillator = audioContext.createOscillator();
      keepAliveGain = audioContext.createGain();

      // Set frequency and near-zero volume (silent to human ears)
      keepAliveOscillator.type = 'sine';
      keepAliveOscillator.frequency.setValueAtTime(20, audioContext.currentTime); // Infrasonic / Sub-bass
      keepAliveGain.gain.setValueAtTime(0.0001, audioContext.currentTime); // Inaudible

      keepAliveOscillator.connect(keepAliveGain);
      keepAliveGain.connect(audioContext.destination);
      keepAliveOscillator.start();
    }
    return true;
  } catch (err) {
    console.warn('Background audio keepalive could not start:', err);
    return false;
  }
}

export function stopBackgroundAudioKeepAlive(): void {
  try {
    if (keepAliveOscillator) {
      keepAliveOscillator.stop();
      keepAliveOscillator.disconnect();
      keepAliveOscillator = null;
    }
    if (keepAliveGain) {
      keepAliveGain.disconnect();
      keepAliveGain = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
      audioContext = null;
    }
  } catch (err) {
    console.warn('Error stopping audio keepalive:', err);
  }
}

// Offline Storage Queue
export function enqueueOfflinePing(ping: QueuedLocationPing): void {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: QueuedLocationPing[] = raw ? JSON.parse(raw) : [];
    queue.push(ping);
    // Keep max 1000 offline points
    if (queue.length > 1000) {
      queue.shift();
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to enqueue offline ping:', e);
  }
}

export function getOfflineQueue(): QueuedLocationPing[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
}

// Register Service Worker
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}
