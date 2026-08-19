import { UserLocation } from '../types';

const DASHBOARD_SAVED_USERS_KEY = 'locatex_dashboard_saved_users_v2';
const DASHBOARD_LAST_SYNC_KEY = 'locatex_dashboard_last_sync_time';

/**
 * Loads all saved user tracking sessions from local persistent storage.
 * Works even if the server is offline or when returning to the site.
 */
export function loadPersistedDashboardUsers(): UserLocation[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_SAVED_USERS_KEY);
    if (!raw) return [];
    const parsed: UserLocation[] = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('[DashboardStorage] Error reading saved users:', err);
  }
  return [];
}

/**
 * Saves the current list of all tracked users, trails, and speed analytics
 * to browser storage automatically.
 */
export function savePersistedDashboardUsers(users: UserLocation[]): void {
  try {
    if (!Array.isArray(users)) return;
    localStorage.setItem(DASHBOARD_SAVED_USERS_KEY, JSON.stringify(users));
    localStorage.setItem(DASHBOARD_LAST_SYNC_KEY, String(Date.now()));
  } catch (err) {
    console.warn('[DashboardStorage] Error saving users to disk:', err);
  }
}

/**
 * Merges incoming server users with locally saved users, preserving
 * previous historical trails even if the server recently restarted.
 */
export function mergeUsersWithLocalCache(
  serverUsers: UserLocation[],
  cachedUsers: UserLocation[]
): UserLocation[] {
  const map = new Map<string, UserLocation>();

  // First populate with cached users
  cachedUsers.forEach((u) => {
    map.set(u.userId, { ...u, isOffline: true });
  });

  // Overwrite with live server users
  serverUsers.forEach((su) => {
    const existing = map.get(su.userId);
    if (existing) {
      // Merge trails to prevent loss of older points
      const combinedTrailMap = new Map<number, (typeof su.trail)[0]>();
      (existing.trail || []).forEach((pt) => combinedTrailMap.set(pt.timestamp, pt));
      (su.trail || []).forEach((pt) => combinedTrailMap.set(pt.timestamp, pt));

      const mergedTrail = Array.from(combinedTrailMap.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-500);

      map.set(su.userId, {
        ...su,
        trail: mergedTrail,
        maxSpeedKmh: Math.max(existing.maxSpeedKmh || 0, su.maxSpeedKmh || 0),
      });
    } else {
      map.set(su.userId, su);
    }
  });

  return Array.from(map.values());
}

export function getLastSyncTime(): number | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAST_SYNC_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function clearPersistedDashboardUsers(): void {
  try {
    localStorage.removeItem(DASHBOARD_SAVED_USERS_KEY);
    localStorage.removeItem(DASHBOARD_LAST_SYNC_KEY);
  } catch {}
}
