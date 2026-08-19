import React, { useState, useEffect } from 'react';
import { LocationShareClient } from './LocationShareClient';
import { 
  Smartphone, 
  Wifi, 
  BatteryCharging, 
  Signal, 
  Radio, 
  Sparkles, 
  Share2, 
  MapPin, 
  Compass,
  Layers,
  Settings2,
  ShieldAlert,
  Triangle,
  Circle,
  Square as SquareIcon,
  Bell,
  Check,
  Zap
} from 'lucide-react';

interface MobileDevicePreviewProps {
  userId: string;
  userName: string;
  userColor: string;
  onUpdateProfile: (name: string, color: string) => void;
  onOpenQR: () => void;
}

type OSType = 'android' | 'ios';

type AndroidDeviceModel = 'pixel-9-pro' | 'galaxy-s24-ultra' | 'android-rugged-tab';
type IOSDeviceModel = 'iphone-16-pro';

interface DeviceSpec {
  id: string;
  name: string;
  os: OSType;
  brand: string;
  width: number;
  height: number;
  outerRadius: string;
  innerRadius: string;
  notchType: 'punch-hole-center' | 'punch-hole-corner' | 'dynamic-island' | 'tablet-bezel';
  navStyle: 'android-3-button' | 'android-gesture' | 'ios-bar';
  chassisColor: string;
}

const ANDROID_DEVICES: Record<AndroidDeviceModel, DeviceSpec> = {
  'pixel-9-pro': {
    id: 'pixel-9-pro',
    name: 'Google Pixel 9 Pro',
    os: 'android',
    brand: 'Android 15 (Material You)',
    width: 395,
    height: 790,
    outerRadius: 'rounded-[44px]',
    innerRadius: 'rounded-[34px]',
    notchType: 'punch-hole-center',
    navStyle: 'android-gesture',
    chassisColor: 'from-slate-800 via-slate-900 to-black',
  },
  'galaxy-s24-ultra': {
    id: 'galaxy-s24-ultra',
    name: 'Galaxy S24 Ultra',
    os: 'android',
    brand: 'Samsung One UI 6.1',
    width: 410,
    height: 800,
    outerRadius: 'rounded-[20px]', // Sharp boxy corners
    innerRadius: 'rounded-[12px]',
    notchType: 'punch-hole-center',
    navStyle: 'android-3-button',
    chassisColor: 'from-zinc-800 via-zinc-900 to-zinc-950',
  },
  'android-rugged-tab': {
    id: 'android-rugged-tab',
    name: 'Android GPS Field Terminal',
    os: 'android',
    brand: 'Industrial Android 14',
    width: 430,
    height: 770,
    outerRadius: 'rounded-[32px]',
    innerRadius: 'rounded-[20px]',
    notchType: 'tablet-bezel',
    navStyle: 'android-3-button',
    chassisColor: 'from-amber-950 via-slate-900 to-black',
  },
};

const IOS_DEVICES: Record<IOSDeviceModel, DeviceSpec> = {
  'iphone-16-pro': {
    id: 'iphone-16-pro',
    name: 'iPhone 16 Pro',
    os: 'ios',
    brand: 'Apple iOS 18',
    width: 390,
    height: 790,
    outerRadius: 'rounded-[48px]',
    innerRadius: 'rounded-[38px]',
    notchType: 'dynamic-island',
    navStyle: 'ios-bar',
    chassisColor: 'from-slate-800 via-slate-900 to-slate-950',
  },
};

export const MobileDevicePreview: React.FC<MobileDevicePreviewProps> = ({
  userId,
  userName,
  userColor,
  onUpdateProfile,
  onOpenQR,
}) => {
  const [selectedOS, setSelectedOS] = useState<OSType>('android');
  const [selectedAndroidModel, setSelectedAndroidModel] = useState<AndroidDeviceModel>('pixel-9-pro');
  const [selectedIOSModel, setSelectedIOSModel] = useState<IOSDeviceModel>('iphone-16-pro');
  const [navBarMode, setNavBarMode] = useState<'gesture' | '3-button'>('gesture');
  const [showAndroidNotification, setShowAndroidNotification] = useState(true);
  const [scale, setScale] = useState<number>(0.92);
  const [currentTime, setCurrentTime] = useState('');

  // Clock tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeDevice: DeviceSpec =
    selectedOS === 'android'
      ? ANDROID_DEVICES[selectedAndroidModel]
      : IOS_DEVICES[selectedIOSModel];

  return (
    <div className="w-full h-[calc(100vh-4rem-2.25rem)] overflow-y-auto bg-slate-100 flex flex-col xl:flex-row items-center justify-center p-4 sm:p-6 gap-8 select-none">
      {/* Device Frame Stage */}
      <div className="flex-1 flex items-center justify-center py-2">
        <div
          className="relative transition-all duration-300 transform origin-center"
          style={{ transform: `scale(${scale})` }}
        >
          {/* External Hardware Chassis */}
          <div
            className={`p-[14px] bg-gradient-to-b ${activeDevice.chassisColor} ${activeDevice.outerRadius} shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.15)] ring-1 ring-slate-800 relative transition-all duration-300`}
            style={{ width: activeDevice.width + 28, height: activeDevice.height + 28 }}
          >
            {/* Physical Hardware Buttons */}
            <div className="absolute -left-[16px] top-28 w-[3px] h-10 bg-slate-700 rounded-l-sm" />
            <div className="absolute -left-[16px] top-44 w-[3px] h-14 bg-slate-700 rounded-l-sm" />
            <div className="absolute -right-[16px] top-36 w-[3px] h-14 bg-slate-700 rounded-r-sm" />

            {/* Inner Display Screen */}
            <div
              className={`w-full h-full bg-slate-50 ${activeDevice.innerRadius} overflow-hidden flex flex-col relative shadow-inner`}
            >
              {/* OS Status Bar */}
              {selectedOS === 'android' ? (
                /* Authentic Android 15 / Material You Status Bar */
                <div className="h-10 px-5 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30 border-b border-slate-100/70">
                  {/* Left: Clock and Notification Badges */}
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-slate-900 font-sans tracking-tight">
                      {currentTime || '09:41'}
                    </span>
                    <div className="flex items-center gap-1 pl-1 text-slate-700">
                      {/* Android GPS Location Pin Icon */}
                      <MapPin className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                      <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                    </div>
                  </div>

                  {/* Center: Camera Punch Hole Lens */}
                  <div className="relative flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-black border border-slate-700 shadow-xs flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-900 border border-blue-900/60" />
                    </div>
                  </div>

                  {/* Right: Android Status Icons */}
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <span className="text-[10px] font-bold tracking-tighter text-slate-600">5G</span>
                    <Signal className="w-3.5 h-3.5" />
                    <Wifi className="w-3.5 h-3.5" />
                    <div className="flex items-center gap-0.5">
                      <span className="text-[10px] font-bold">96%</span>
                      <BatteryCharging className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                    </div>
                  </div>
                </div>
              ) : (
                /* iOS 18 Dynamic Island Status Bar */
                <div className="h-11 px-6 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30 border-b border-slate-100/60">
                  <span className="text-[13px] font-semibold text-slate-900 font-sans tracking-tight">
                    {currentTime || '09:41'}
                  </span>
                  <div className="w-24 h-6 bg-black rounded-full flex items-center justify-between px-2.5 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-[9px] font-bold text-white uppercase tracking-tighter">LocateX</span>
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Signal className="w-3.5 h-3.5" />
                    <Wifi className="w-3.5 h-3.5" />
                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                  </div>
                </div>
              )}

              {/* Android Foreground Service Live Location Banner */}
              {selectedOS === 'android' && showAndroidNotification && (
                <div className="mx-3 mt-2 p-2.5 bg-blue-50/90 border border-blue-200/90 rounded-xl flex items-center justify-between text-xs animate-fade-in shadow-xs z-20">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                      L
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-[11px] leading-tight truncate">
                        LocateX Sync • GPS Service Active
                      </p>
                      <p className="text-[10px] text-slate-600 truncate">
                        High accuracy streaming to master dashboard
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAndroidNotification(false)}
                    className="text-[10px] text-blue-600 font-bold px-1.5 py-0.5 hover:bg-blue-100 rounded cursor-pointer shrink-0"
                  >
                    Hide
                  </button>
                </div>
              )}

              {/* Scrollable Mobile App Body */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 relative pb-6">
                <LocationShareClient
                  userId={userId}
                  userName={userName}
                  userColor={userColor}
                  onUpdateProfile={onUpdateProfile}
                  onOpenQR={onOpenQR}
                />
              </div>

              {/* Android / iOS Bottom Navigation Bar */}
              {selectedOS === 'android' ? (
                navBarMode === '3-button' ? (
                  /* Classic Android 3-Button Nav (Back, Home, Recents) */
                  <div className="h-10 bg-slate-900 flex items-center justify-around px-8 shrink-0 z-30 select-none">
                    <button
                      className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Android Back Button"
                    >
                      <Triangle className="w-3.5 h-3.5 -rotate-90 fill-current" />
                    </button>
                    <button
                      className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Android Home Button"
                    >
                      <Circle className="w-4 h-4 fill-current" />
                    </button>
                    <button
                      className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Android Recents / Overview Button"
                    >
                      <SquareIcon className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                ) : (
                  /* Android Material 3 Gesture Handle */
                  <div className="h-6 bg-white flex items-center justify-center shrink-0 border-t border-slate-100 z-30">
                    <div className="w-20 h-1 bg-slate-400 rounded-full" />
                  </div>
                )
              ) : (
                /* iOS Home Gesture Bar */
                <div className="h-5 bg-white flex items-center justify-center shrink-0 border-t border-slate-100 z-30">
                  <div className="w-32 h-1 bg-slate-300 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Side Device Configuration & Controls Panel */}
      <aside className="w-full xl:w-96 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Android & Mobile Viewport</h2>
              <p className="text-xs text-slate-500">Test live GPS streaming inside Android screen layouts</p>
            </div>
          </div>
        </div>

        {/* OS Platform Switcher */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Operating System Mode
          </label>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => setSelectedOS('android')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                selectedOS === 'android'
                  ? 'bg-white text-emerald-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              <span>Android Mode</span>
            </button>
            <button
              onClick={() => setSelectedOS('ios')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                selectedOS === 'ios'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-500" />
              <span>iOS Mode</span>
            </button>
          </div>
        </div>

        {/* Device Model Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            {selectedOS === 'android' ? 'Android Device Models' : 'Apple iPhone Models'}
          </label>
          <div className="space-y-2">
            {selectedOS === 'android'
              ? (Object.keys(ANDROID_DEVICES) as AndroidDeviceModel[]).map((key) => {
                  const item = ANDROID_DEVICES[key];
                  const isSelected = selectedAndroidModel === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedAndroidModel(key)}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-400/30'
                          : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                          <p className="text-[10px] text-slate-500">{item.brand} • {item.width}×{item.height} px</p>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })
              : (Object.keys(IOS_DEVICES) as IOSDeviceModel[]).map((key) => {
                  const item = IOS_DEVICES[key];
                  const isSelected = selectedIOSModel === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedIOSModel(key)}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-300 shadow-xs ring-1 ring-blue-400/30'
                          : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                          <p className="text-[10px] text-slate-500">{item.brand} • {item.width}×{item.height} px</p>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Android Navigation Bar Style Switcher */}
        {selectedOS === 'android' && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
              Android Navigation Bar
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setNavBarMode('gesture')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  navBarMode === 'gesture'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Gesture Bar
              </button>
              <button
                onClick={() => setNavBarMode('3-button')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  navBarMode === '3-button'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                3-Button (◀ ● ■)
              </button>
            </div>
          </div>
        )}

        {/* Scale Slider */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-600">Viewport Scale</span>
            <span className="font-mono font-bold text-emerald-600">{Math.round(scale * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.7"
            max="1.1"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
          />
        </div>

        {/* Mobile Smartphone QR Link */}
        <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Real Android Phone Pairing</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Scan this QR code with your Android or iOS camera to broadcast true outdoor GPS coordinates directly from your pocket.
          </p>
          <button
            onClick={onOpenQR}
            className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Scan QR on Android Phone
          </button>
        </div>
      </aside>
    </div>
  );
};
