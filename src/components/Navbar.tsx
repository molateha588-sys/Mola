import React from 'react';
import { ViewMode } from '../types';
import { 
  Map as MapIcon, 
  Radio, 
  Columns, 
  Smartphone, 
  Users,
  Trash2,
  HardDrive
} from 'lucide-react';

interface NavbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isConnected: boolean;
  activeUsersCount: number;
  onOpenQR: () => void;
  onClearAllTrails?: () => void;
  onResetStorage?: () => void;
  localUserName?: string;
  localUserId?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  setViewMode,
  isConnected,
  activeUsersCount,
  onOpenQR,
  onClearAllTrails,
  onResetStorage,
  localUserName = 'Alpha-Node-01',
  localUserId = '8829-QX-01',
}) => {
  return (
    <header className="h-16 px-4 md:px-8 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20">
            L
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            LocateX <span className="text-blue-600 italic">Sync</span>
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setViewMode('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'dashboard'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Live Map Dashboard"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Live Map</span>
          </button>

          <button
            onClick={() => setViewMode('share')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'share'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Location Share Client"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Share Client</span>
          </button>

          <button
            onClick={() => setViewMode('mobile-preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'mobile-preview'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Mobile Device Preview Simulator"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Device Mode</span>
          </button>

          <button
            onClick={() => setViewMode('split')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Dual Split View"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Split View</span>
          </button>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 md:gap-5">
        {/* Connection status pill */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider transition-colors ${
            isConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span className="text-[11px]">
            {isConnected ? 'Server Online' : 'Offline Cache'}
          </span>
        </div>

        {/* Active Sharers Counter */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold border border-slate-200"
          title="Tracked Sharers Saved on Dashboard"
        >
          <Users className="w-3.5 h-3.5 text-blue-600" />
          <span>{activeUsersCount}</span>
          <span className="hidden sm:inline text-slate-400 font-normal">nodes</span>
        </div>

        {/* Mobile QR trigger */}
        <button
          onClick={onOpenQR}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/80 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          title="Open GPS Tracker on Mobile Phone"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Mobile QR</span>
        </button>

        {onResetStorage && (
          <button
            onClick={onResetStorage}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
            title="Clear Auto-Saved Offline Browser History"
          >
            <HardDrive className="w-4 h-4" />
          </button>
        )}

        {onClearAllTrails && (
          <button
            onClick={onClearAllTrails}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Clear all recorded breadcrumbs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Node Profile Chip */}
        <div className="hidden md:flex items-center gap-3 pl-2 border-l border-slate-200">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800 leading-tight">{localUserName}</p>
            <p className="text-[10px] text-slate-400 font-mono leading-tight">ID: {localUserId.slice(0, 10)}</p>
          </div>
          <div className="w-9 h-9 bg-blue-600 text-white font-bold text-xs rounded-full border-2 border-white shadow-xs flex items-center justify-center">
            {localUserName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
};
