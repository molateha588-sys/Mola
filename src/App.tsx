import React, { useState, useEffect } from 'react';
import { getSocket, emitClearTrail } from './services/socket';
import { UserLocation, ViewMode } from './types';
import { 
  loadPersistedDashboardUsers, 
  savePersistedDashboardUsers, 
  mergeUsersWithLocalCache,
  clearPersistedDashboardUsers 
} from './services/dashboardStorage';
import { Navbar } from './components/Navbar';
import { MapDashboard } from './components/MapDashboard';
import { LocationShareClient } from './components/LocationShareClient';
import { DualView } from './components/DualView';
import { MobileDevicePreview } from './components/MobileDevicePreview';
import { QRCodeModal } from './components/QRCodeModal';

function generateRandomId(): string {
  return 'Node_' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

const DEFAULT_COLORS = ['#2563EB', '#DC2626', '#059669', '#7C3AED', '#D97706', '#DB2777'];

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  // Auto-load saved users from local storage on initial mount
  const [users, setUsers] = useState<UserLocation[]>(() => {
    return loadPersistedDashboardUsers();
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  // Local client profile
  const [localUserId] = useState<string>(() => {
    const saved = sessionStorage.getItem('loc_user_id');
    if (saved) return saved;
    const newId = generateRandomId();
    sessionStorage.setItem('loc_user_id', newId);
    return newId;
  });

  const [localUserName, setLocalUserName] = useState<string>(() => {
    return sessionStorage.getItem('loc_user_name') || `Alpha-${localUserId.slice(-4)}`;
  });

  const [localUserColor, setLocalUserColor] = useState<string>(() => {
    return (
      sessionStorage.getItem('loc_user_color') ||
      DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]
    );
  });

  // View mode based on URL query param or default
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'share') return 'share';
    if (mode === 'mobile' || mode === 'device' || mode === 'preview') return 'mobile-preview';
    if (mode === 'split') return 'split';
    if (mode === 'dashboard' || mode === 'map') return 'dashboard';
    
    return window.innerWidth >= 1024 ? 'split' : 'dashboard';
  });

  const shareClientUrl = `${window.location.origin}${window.location.pathname}?mode=share`;

  // Automatically persist users state locally on every update & when leaving the site
  useEffect(() => {
    savePersistedDashboardUsers(users);

    const handleBeforeUnload = () => {
      savePersistedDashboardUsers(users);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [users]);

  // WebSocket event subscriptions & resilient state merging
  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('register-user', {
        userId: localUserId,
        userName: localUserName,
        userColor: localUserColor,
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      // Mark all current users as offline while retaining their trails and coordinates
      setUsers((prev) => prev.map((u) => ({ ...u, isOffline: true })));
    };

    const handleInitialState = (data: { users: UserLocation[] }) => {
      if (data && Array.isArray(data.users)) {
        setUsers((current) => mergeUsersWithLocalCache(data.users, current));
      }
    };

    const handleLocationBroadcast = (data: UserLocation) => {
      if (!data || !data.userId) return;

      setUsers((prev) => {
        const index = prev.findIndex((u) => u.userId === data.userId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...data, isOffline: false };
          return updated;
        } else {
          return [...prev, { ...data, isOffline: false }];
        }
      });
    };

    const handleUserLeft = (data: { userId: string }) => {
      if (!data?.userId) return;
      // Mark as offline instead of removing completely, keeping map trail
      setUsers((prev) =>
        prev.map((u) => (u.userId === data.userId ? { ...u, isOffline: true } : u))
      );
    };

    const handleUserUpdated = (data: UserLocation) => {
      if (!data?.userId) return;
      setUsers((prev) =>
        prev.map((u) => (u.userId === data.userId ? data : u))
      );
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('initial-state', handleInitialState);
    socket.on('location-broadcast', handleLocationBroadcast);
    socket.on('user-left', handleUserLeft);
    socket.on('user-updated', handleUserUpdated);

    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('initial-state', handleInitialState);
      socket.off('location-broadcast', handleLocationBroadcast);
      socket.off('user-left', handleUserLeft);
      socket.off('user-updated', handleUserUpdated);
    };
  }, [localUserId, localUserName, localUserColor, selectedUserId]);

  const handleUpdateProfile = (name: string, color: string) => {
    setLocalUserName(name);
    setLocalUserColor(color);
    sessionStorage.setItem('loc_user_name', name);
    sessionStorage.setItem('loc_user_color', color);

    const socket = getSocket();
    if (socket.connected) {
      socket.emit('register-user', {
        userId: localUserId,
        userName: name,
        userColor: color,
      });
    }
  };

  const handleClearTrail = (userId: string) => {
    emitClearTrail(userId);
    setUsers((prev) =>
      prev.map((u) => {
        if (u.userId === userId) {
          return {
            ...u,
            trail: [{ lat: u.lat, lng: u.lng, timestamp: Date.now() }],
          };
        }
        return u;
      })
    );
  };

  const handleClearAllTrails = () => {
    users.forEach((u) => {
      emitClearTrail(u.userId);
    });
    setUsers((prev) =>
      prev.map((u) => ({
        ...u,
        trail: [{ lat: u.lat, lng: u.lng, timestamp: Date.now() }],
      }))
    );
  };

  const handleResetStorage = () => {
    clearPersistedDashboardUsers();
    setUsers([]);
    setSelectedUserId(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans select-none">
      {/* Top Sleek Header */}
      <Navbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        isConnected={isConnected}
        activeUsersCount={users.length}
        onOpenQR={() => setIsQRModalOpen(true)}
        onClearAllTrails={users.length > 0 ? handleClearAllTrails : undefined}
        onResetStorage={users.length > 0 ? handleResetStorage : undefined}
        localUserName={localUserName}
        localUserId={localUserId}
      />

      {/* Main App Stage */}
      <main className="flex-1 w-full overflow-hidden relative">
        {viewMode === 'dashboard' && (
          <MapDashboard
            users={users}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onClearTrail={handleClearTrail}
            onOpenQR={() => setIsQRModalOpen(true)}
            isServerConnected={isConnected}
          />
        )}

        {viewMode === 'share' && (
          <div className="w-full h-full overflow-y-auto p-4 sm:p-6 bg-slate-50 flex items-center justify-center">
            <LocationShareClient
              userId={localUserId}
              userName={localUserName}
              userColor={localUserColor}
              onUpdateProfile={handleUpdateProfile}
              onOpenQR={() => setIsQRModalOpen(true)}
            />
          </div>
        )}

        {viewMode === 'mobile-preview' && (
          <MobileDevicePreview
            userId={localUserId}
            userName={localUserName}
            userColor={localUserColor}
            onUpdateProfile={handleUpdateProfile}
            onOpenQR={() => setIsQRModalOpen(true)}
          />
        )}

        {viewMode === 'split' && (
          <DualView
            userId={localUserId}
            userName={localUserName}
            userColor={localUserColor}
            users={users}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onUpdateProfile={handleUpdateProfile}
            onClearTrail={handleClearTrail}
            onOpenQR={() => setIsQRModalOpen(true)}
            isServerConnected={isConnected}
          />
        )}
      </main>

      {/* Sleek Bottom Meta Footer */}
      <footer className="h-9 px-6 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 shrink-0 font-medium select-none z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>LocateX Offline Engine: <strong>Auto-Saved to Browser Storage</strong></span>
        </div>
        <div className="hidden sm:flex gap-4 uppercase font-mono text-[10px]">
          <span>{isConnected ? 'Server Online' : 'Offline Cache Mode'}</span>
          <div className="w-px h-3 bg-slate-200 self-center" />
          <span>AES-256 Encrypted</span>
        </div>
      </footer>

      {/* Mobile QR Code Modal */}
      <QRCodeModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        shareUrl={shareClientUrl}
      />
    </div>
  );
}
