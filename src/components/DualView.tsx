import React from 'react';
import { LocationShareClient } from './LocationShareClient';
import { MapDashboard } from './MapDashboard';
import { UserLocation } from '../types';

interface DualViewProps {
  userId: string;
  userName: string;
  userColor: string;
  users: UserLocation[];
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  onUpdateProfile: (name: string, color: string) => void;
  onClearTrail: (userId: string) => void;
  onOpenQR: () => void;
  isServerConnected?: boolean;
}

export const DualView: React.FC<DualViewProps> = ({
  userId,
  userName,
  userColor,
  users,
  selectedUserId,
  onSelectUser,
  onUpdateProfile,
  onClearTrail,
  onOpenQR,
  isServerConnected = true,
}) => {
  return (
    <div className="w-full h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden bg-slate-50">
      {/* Left panel: Share Client */}
      <div className="w-full lg:w-[480px] xl:w-[540px] h-full overflow-y-auto border-r border-slate-200 bg-slate-50 shrink-0 p-3 sm:p-5">
        <LocationShareClient
          userId={userId}
          userName={userName}
          userColor={userColor}
          onUpdateProfile={onUpdateProfile}
          onOpenQR={onOpenQR}
        />
      </div>

      {/* Right panel: Live Map */}
      <div className="flex-1 h-full relative bg-slate-900">
        <MapDashboard
          users={users}
          selectedUserId={selectedUserId}
          onSelectUser={onSelectUser}
          onClearTrail={onClearTrail}
          onOpenQR={onOpenQR}
          isServerConnected={isServerConnected}
        />
      </div>
    </div>
  );
};
