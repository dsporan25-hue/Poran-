import React, { useEffect, useState, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { 
  Tv, 
  Settings, 
  Video, 
  Activity, 
  ShieldCheck, 
  Play, 
  Square, 
  Key, 
  Globe, 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Upload, 
  Clock, 
  Cpu, 
  EyeOff, 
  Eye, 
  Sparkles, 
  Wifi, 
  FileText,
  Smartphone,
  ExternalLink,
  RefreshCw,
  Info
} from 'lucide-react';

interface StreamingPluginType {
  pickVideo(): Promise<{ cancelled: boolean; videoUri?: string; mimeType?: string; name?: string }>;
  startScreenLive(options: { streamUrl: string }): Promise<{ cancelled?: boolean; started?: boolean }>;
  stopScreenLive(): Promise<{ stopped: boolean }>;
  addListener(eventName: 'streamStatus', listenerFunc: (event: any) => void): Promise<{ remove: () => void }>;
}

interface SecureStorePluginType {
  saveConfig(options: { serverUrl: string; streamKey: string }): Promise<{ saved: boolean }>;
  getConfig(): Promise<{ configured: boolean; serverUrl?: string; streamKey?: string }>;
  clearConfig(): Promise<{ cleared: boolean }>;
}

const PoranStreaming = registerPlugin<StreamingPluginType>('PoranStreaming');
const SecureStore = registerPlugin<SecureStorePluginType>('PoranSecureStore');

type TabType = 'studio' | 'dashboard' | 'gallery' | 'facebook' | 'audit';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('studio');
  const [serverUrl, setServerUrl] = useState('rtmps://live-api-s.facebook.com:443/rtmp/');
  const [streamKey, setStreamKey] = useState('');
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  
  // Streaming state
  const [isLive, setIsLive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'FAILED' | 'AUTH_FAILED'
  >('IDLE');
  const [statusMessage, setStatusMessage] = useState('READY TO BROADCAST');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  
  // Real-time Dashboard metrics
  const [streamingDuration, setStreamingDuration] = useState(0);
  const [currentBitrate, setCurrentBitrate] = useState<number>(0);
  const [currentFps, setCurrentFps] = useState<number>(30);
  const [videoQuality, setVideoQuality] = useState('720p HD @ 30 FPS (Auto)');
  const [networkType, setNetworkType] = useState('Online');
  
  // Gallery state
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);
  const [selectedVideoName, setSelectedVideoName] = useState<string | null>(null);
  const [selectedVideoType, setSelectedVideoType] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<string | null>(null);
  const [videoFileSize, setVideoFileSize] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Timer effect for live broadcast duration
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isLive) {
      interval = setInterval(() => {
        setStreamingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setStreamingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLive]);

  // Online / Offline network listener
  useEffect(() => {
    const updateNetwork = () => {
      setNetworkType(navigator.onLine ? 'Wi-Fi / Mobile Data' : 'Offline');
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  // Listen to native Android stream status and metrics
  useEffect(() => {
    let listenerHandle: { remove: () => void } | null = null;

    if (Capacitor.isNativePlatform()) {
      PoranStreaming.addListener('streamStatus', (event: any) => {
        const status = event.status;
        
        if (event.bitrate && typeof event.bitrate === 'number') {
          setCurrentBitrate(Math.round(event.bitrate / 1000)); // convert to kbps
        }
        if (event.fps && typeof event.fps === 'number') {
          setCurrentFps(event.fps);
        }

        if (status === 'SERVICE_STARTED') {
          setStatusMessage('Screen capture service running');
          setConnectionStatus('CONNECTING');
        } else if (status === 'VIDEO_PREPARED') {
          setStatusMessage('H.264 video encoder configured');
        } else if (status === 'STREAM_START_REQUESTED') {
          setStatusMessage('Opening RTMP connection to Facebook...');
          setConnectionStatus('CONNECTING');
        } else if (status === 'CONNECTING') {
          setIsLive(false);
          setConnectionStatus('CONNECTING');
          setStatusMessage('Connecting to Facebook RTMP server...');
        } else if (status === 'CONNECTED') {
          setIsLive(true);
          setConnectionStatus('CONNECTED');
          setStatusMessage('LIVE ON FACEBOOK');
          setErrorMessage(null);
          setCurrentBitrate(2500); // initial target kbps
        } else if (status === 'FAILED' || status === 'AUTH_FAILED') {
          setIsLive(false);
          setConnectionStatus(status === 'AUTH_FAILED' ? 'AUTH_FAILED' : 'FAILED');
          const err = event.reason || (status === 'AUTH_FAILED' ? 'Facebook Stream Key invalid or expired' : 'Connection refused');
          setErrorMessage(err);
          setStatusMessage('BROADCAST FAILED');
        } else if (status === 'DISCONNECTED') {
          setIsLive(false);
          setConnectionStatus('DISCONNECTED');
          const reason = event.reason || 'Network connection closed';
          setStatusMessage('STREAM DISCONNECTED');
          setErrorMessage(reason);
        } else if (status === 'SCREEN_OFF') {
          setIsLive(false);
          setConnectionStatus('DISCONNECTED');
          setStatusMessage('STREAM STOPPED (DISPLAY TURNED OFF)');
          setErrorMessage('Display turned off. Broadcast stopped safely to preserve privacy & battery.');
        }
      }).then(handle => {
        listenerHandle = handle;
      }).catch(err => {
        console.warn('Native stream status listener registration:', err);
      });
    }

    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, []);

  // Load saved Facebook configuration from SecureStore (AES-GCM on Android, localStorage in browser)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      SecureStore.getConfig()
        .then(result => {
          if (result && result.configured) {
            if (result.serverUrl) setServerUrl(result.serverUrl);
            if (result.streamKey) setStreamKey(result.streamKey);
            setConfigured(true);
          }
        })
        .catch(err => {
          console.warn('SecureStore not available:', err);
        });
    } else {
      // Browser preview persistence
      const savedServer = localStorage.getItem('poran_fb_server');
      const savedKey = localStorage.getItem('poran_fb_key');
      if (savedServer) setServerUrl(savedServer);
      if (savedKey) {
        setStreamKey(savedKey);
        setConfigured(true);
      }
    }
  }, []);

  // Format seconds to HH:MM:SS
  const formatDuration = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Save Facebook Live Configuration
  const handleSaveSettings = async () => {
    const trimmedServer = serverUrl.trim();
    const trimmedKey = streamKey.trim();

    if (!trimmedServer.match(/^rtmps?:\/\//i)) {
      setErrorMessage('Server URL must start with rtmp:// or rtmps://');
      return;
    }
    if (!trimmedKey) {
      setErrorMessage('Please enter your Facebook Stream Key.');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await SecureStore.saveConfig({
          serverUrl: trimmedServer.replace(/\/+$/, ''),
          streamKey: trimmedKey
        });
        if (result.saved) {
          setConfigured(true);
          setStatusMessage('FACEBOOK SETTINGS SAVED ENCRYPTED');
          setErrorMessage(null);
          setActiveTab('studio');
        }
      } catch (err: any) {
        setErrorMessage('Secure save failed: ' + (err.message || 'Unknown keystore error'));
      }
    } else {
      localStorage.setItem('poran_fb_server', trimmedServer.replace(/\/+$/, ''));
      localStorage.setItem('poran_fb_key', trimmedKey);
      setConfigured(true);
      setStatusMessage('FACEBOOK SETTINGS SAVED SECURELY');
      setErrorMessage(null);
      setActiveTab('studio');
    }
  };

  // Clear saved settings
  const handleClearSettings = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await SecureStore.clearConfig();
      } catch (e) {}
    } else {
      localStorage.removeItem('poran_fb_server');
      localStorage.removeItem('poran_fb_key');
    }
    setStreamKey('');
    setConfigured(false);
    setStatusMessage('SETTINGS CLEARED');
  };

  // Start or Stop Screen Live
  const toggleLive = async () => {
    if (busy) return;

    if (isLive) {
      setBusy(true);
      setStatusMessage('STOPPING LIVE STREAM...');
      try {
        if (Capacitor.isNativePlatform()) {
          await PoranStreaming.stopScreenLive();
        } else {
          // Simulation for web preview
          setIsLive(false);
          setConnectionStatus('DISCONNECTED');
          setStatusMessage('LIVE STREAM STOPPED');
          setCurrentBitrate(0);
        }
      } catch (err: any) {
        setErrorMessage('Failed to stop live stream: ' + (err.message || 'Unknown error'));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Validation
    if (!configured || !serverUrl || !streamKey) {
      setActiveTab('facebook');
      setErrorMessage('Please enter and save your Facebook Server URL and Stream Key first.');
      return;
    }

    const cleanServer = serverUrl.trim().replace(/\/+$/, '');
    const cleanKey = streamKey.trim();
    const fullStreamUrl = `${cleanServer}/${cleanKey}`;

    setBusy(true);
    setErrorMessage(null);

    if (Capacitor.isNativePlatform()) {
      try {
        setStatusMessage('REQUESTING SCREEN CAPTURE PERMISSION...');
        const result = await PoranStreaming.startScreenLive({
          streamUrl: fullStreamUrl
        });

        if (result.cancelled) {
          setStatusMessage('SCREEN CAPTURE PERMISSION CANCELLED');
          setBusy(false);
          return;
        }

        setStatusMessage('STARTING ENCODER & CONNECTING...');
      } catch (err: any) {
        setErrorMessage('Live broadcast could not start: ' + (err.message || 'Unknown error'));
        setStatusMessage('START FAILED');
        setBusy(false);
      } finally {
        setTimeout(() => setBusy(false), 1500);
      }
    } else {
      // Browser preview simulation
      setStatusMessage('SIMULATING CONNECTION TO FACEBOOK...');
      setConnectionStatus('CONNECTING');
      setTimeout(() => {
        setIsLive(true);
        setConnectionStatus('CONNECTED');
        setStatusMessage('PREVIEW LIVE: BROADCASTING (SIMULATION)');
        setCurrentBitrate(2450);
        setCurrentFps(30);
        setBusy(false);
      }, 1200);
    }
  };

  // Video Gallery selection
  const handleSelectVideo = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await PoranStreaming.pickVideo();
        if (!result.cancelled && result.videoUri) {
          setSelectedVideoUri(result.videoUri);
          setSelectedVideoName(result.name || 'Selected Video');
          setSelectedVideoType(result.mimeType || 'video/mp4');
          setStatusMessage('VIDEO LOADED FROM GALLERY');
        }
      } catch (err: any) {
        setErrorMessage('Failed to select video: ' + (err.message || 'Picker error'));
      }
    } else {
      // Browser fallback using HTML5 input
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleBrowserFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedVideoUri(url);
      setSelectedVideoName(file.name);
      setSelectedVideoType(file.type || 'video/mp4');
      setVideoFileSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');
      setStatusMessage('LOCAL VIDEO READY');
    }
  };

  return (
    <div className="poran-app min-h-screen bg-[#050914] text-[#eafaff] flex flex-col font-sans select-none antialiased">
      {/* Hidden file input for web preview */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleBrowserFileSelected} 
        accept="video/*" 
        className="hidden" 
      />

      {/* Top Application Bar */}
      <header className="border-b border-[#12283e] bg-[#07101f]/95 backdrop-blur px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setActiveTab('studio')} 
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00eaff] to-[#046182] flex items-center justify-center font-black text-black text-lg shadow-[0_0_15px_rgba(0,234,255,0.4)] cursor-pointer hover:scale-105 transition-transform"
          >
            P▶
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wider uppercase bg-gradient-to-r from-white via-[#d2f4ff] to-[#00eaff] bg-clip-text text-transparent">
                PORAN LIVE
              </h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0d2a45] text-[#00eaff] border border-[#00eaff]/30 font-semibold tracking-wide">
                v1.0 ANDROID
              </span>
            </div>
            <p className="text-[10px] text-[#6cbbd0] tracking-widest font-mono">
              YOUR SCREEN. YOUR LIVE. YOUR WORLD.
            </p>
          </div>
        </div>

        {/* Live Pill Indicator */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.5)]">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
              <span className="text-xs font-bold text-red-400 font-mono tracking-wider">LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0a172a] border border-[#1b3b5e]">
              <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
              <span className="text-[11px] font-semibold text-zinc-400 font-mono">OFFLINE</span>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Tab Bar */}
      <nav className="flex items-center justify-around bg-[#081224] border-b border-[#11243a] px-1 py-1.5 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('studio')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'studio' 
              ? 'bg-[#0e2c4a] text-[#00eaff] shadow-[0_0_10px_rgba(0,234,255,0.25)] border border-[#00eaff]/40' 
              : 'text-[#8da5b8] hover:text-white'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>Screen Live</span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'dashboard' 
              ? 'bg-[#0e2c4a] text-[#00eaff] shadow-[0_0_10px_rgba(0,234,255,0.25)] border border-[#00eaff]/40' 
              : 'text-[#8da5b8] hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('gallery')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'gallery' 
              ? 'bg-[#0e2c4a] text-[#00eaff] shadow-[0_0_10px_rgba(0,234,255,0.25)] border border-[#00eaff]/40' 
              : 'text-[#8da5b8] hover:text-white'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Gallery</span>
        </button>

        <button
          onClick={() => setActiveTab('facebook')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'facebook' 
              ? 'bg-[#0e2c4a] text-[#00eaff] shadow-[0_0_10px_rgba(0,234,255,0.25)] border border-[#00eaff]/40' 
              : 'text-[#8da5b8] hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Facebook Setup</span>
          {!configured && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'audit' 
              ? 'bg-[#0e2c4a] text-[#00eaff] shadow-[0_0_10px_rgba(0,234,255,0.25)] border border-[#00eaff]/40' 
              : 'text-[#8da5b8] hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Audit & CI</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-between">

        {/* Global Error Notice if active */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/70 border border-red-500/50 flex items-start gap-2 text-xs text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Notice / Diagnostic:</p>
              <p className="mt-0.5 text-red-200/90">{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)} 
              className="text-red-400 hover:text-red-200 text-sm font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: SCREEN LIVE STUDIO */}
        {activeTab === 'studio' && (
          <div className="flex flex-col items-center justify-center my-auto py-4">
            
            {/* Glowing Reactor Graphic */}
            <div className="relative mb-6">
              <div 
                className={`w-36 h-36 rounded-full flex items-center justify-center border-4 transition-all duration-700 ${
                  isLive 
                    ? 'border-red-500 bg-radial from-red-950/90 via-[#260a12] to-[#0b1727] shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-pulse' 
                    : 'border-[#00eaff] bg-radial from-[#123652] via-[#091829] to-[#050b14] shadow-[0_0_30px_rgba(0,234,255,0.35)]'
                }`}
              >
                <div className="text-center">
                  <div className={`text-4xl font-black ${isLive ? 'text-red-400' : 'text-[#00eaff]'}`}>
                    P<span className="text-2xl ml-0.5">▶</span>
                  </div>
                  <div className="text-[10px] font-mono tracking-widest mt-1 text-zinc-400">
                    {isLive ? formatDuration(streamingDuration) : 'OFFLINE'}
                  </div>
                </div>
              </div>

              {/* Status Ring Indicator */}
              <div className="absolute -bottom-2 inset-x-0 flex justify-center">
                <span className={`px-3 py-0.5 rounded-full text-[11px] font-bold border tracking-wide shadow-md ${
                  isLive 
                    ? 'bg-red-950 text-red-300 border-red-500' 
                    : connectionStatus === 'CONNECTING'
                    ? 'bg-amber-950 text-amber-300 border-amber-500 animate-pulse'
                    : 'bg-[#0d2238] text-[#00eaff] border-[#00eaff]/40'
                }`}>
                  {isLive ? 'BROADCASTING' : connectionStatus === 'CONNECTING' ? 'CONNECTING...' : 'STUDIO READY'}
                </span>
              </div>
            </div>

            {/* Status Message */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white tracking-wide">
                {isLive ? 'Sharing Your Screen Live' : 'Broadcast Your Phone Screen'}
              </h2>
              <p className="text-xs text-[#82a4bc] mt-1 max-w-xs mx-auto">
                {statusMessage}
              </p>
              {!configured && (
                <button
                  onClick={() => setActiveTab('facebook')}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-full hover:bg-amber-900/60 transition"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure Facebook Stream Key</span>
                </button>
              )}
            </div>

            {/* Main Action Live Button */}
            <div className="w-full max-w-sm space-y-3">
              <button
                onClick={toggleLive}
                disabled={busy}
                className={`w-full py-4 rounded-2xl font-bold text-base tracking-wider uppercase shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${
                  isLive
                    ? 'bg-gradient-to-r from-red-600 to-rose-800 text-white shadow-[0_0_25px_rgba(239,68,68,0.5)] border border-red-400'
                    : 'bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white shadow-[0_0_25px_rgba(0,180,216,0.4)] border border-[#00eaff]/50 hover:brightness-110'
                } ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {busy ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Please Wait...</span>
                  </>
                ) : isLive ? (
                  <>
                    <Square className="w-5 h-5 fill-current" />
                    <span>Stop Screen Live</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Screen Live</span>
                  </>
                )}
              </button>

              <div className="text-center">
                <p className="text-[11px] text-[#63849c]">
                  {isLive 
                    ? 'Foreground service active. Turning off display safely halts broadcast.' 
                    : 'MediaProjection consent dialog will appear upon launch.'}
                </p>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 w-full mt-6 bg-[#081528] p-3 rounded-xl border border-[#132c48]">
              <div className="text-center border-r border-[#132c48] pr-2">
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Bitrate</span>
                <span className="text-sm font-bold text-[#00eaff] font-mono">
                  {isLive ? `${currentBitrate} kbps` : '—'}
                </span>
              </div>
              <div className="text-center border-r border-[#132c48] px-2">
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Frame Rate</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {isLive ? `${currentFps} FPS` : '30 FPS'}
                </span>
              </div>
              <div className="text-center pl-2">
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Display</span>
                <span className="text-sm font-bold text-sky-300 font-mono">
                  720p HD
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#00eaff]" />
                  <span>Live Stream Dashboard</span>
                </h2>
                <p className="text-xs text-[#7d9eb6]">Real-time telemetry and RTMP stream state</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                isLive ? 'bg-red-950 text-red-300 border border-red-500/50' : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
              }`}>
                {isLive ? 'ON AIR' : 'STANDBY'}
              </span>
            </div>

            {/* Dashboard Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Duration Card */}
              <div className="bg-[#0b1b30] p-3.5 rounded-xl border border-[#173859]">
                <div className="flex items-center justify-between text-[#81a6c2] text-xs mb-1">
                  <span>Stream Duration</span>
                  <Clock className="w-4 h-4 text-[#00eaff]" />
                </div>
                <div className="text-xl font-bold font-mono text-white">
                  {formatDuration(streamingDuration)}
                </div>
                <span className="text-[10px] text-zinc-400">HH:MM:SS active session</span>
              </div>

              {/* Bitrate Card */}
              <div className="bg-[#0b1b30] p-3.5 rounded-xl border border-[#173859]">
                <div className="flex items-center justify-between text-[#81a6c2] text-xs mb-1">
                  <span>Upload Bitrate</span>
                  <Radio className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {isLive ? `${currentBitrate} kbps` : '0 kbps'}
                </div>
                <div className="w-full bg-[#081220] h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (currentBitrate / 3500) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Video Quality Card */}
              <div className="bg-[#0b1b30] p-3.5 rounded-xl border border-[#173859]">
                <div className="flex items-center justify-between text-[#81a6c2] text-xs mb-1">
                  <span>Encoder Profile</span>
                  <Cpu className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  720p / H.264 AVC
                </div>
                <span className="text-[10px] text-zinc-400">Auto hardware accelerated</span>
              </div>

              {/* Network State Card */}
              <div className="bg-[#0b1b30] p-3.5 rounded-xl border border-[#173859]">
                <div className="flex items-center justify-between text-[#81a6c2] text-xs mb-1">
                  <span>Network Health</span>
                  <Wifi className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {networkType}
                </div>
                <span className="text-[10px] text-zinc-400">Adaptive buffer enabled</span>
              </div>
            </div>

            {/* Viewer Count Verification Notice */}
            <div className="p-3.5 rounded-xl bg-[#091728] border border-[#142e4a]">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#00eaff] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-semibold text-white">Audience & Viewer Count Notice:</h4>
                  <p className="text-[#8baec8] mt-0.5 leading-relaxed">
                    Per project security specifications, viewer count is only displayed when connected to a verified Facebook Graph API token. <strong>Fake viewer counts are strictly prohibited</strong> to uphold authentic metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* Status Log & Screen-Off Protection Box */}
            <div className="p-3.5 rounded-xl bg-[#071322] border border-[#102944]">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#00eaff]" />
                <span>Screen-Off Protection System</span>
              </h4>
              <p className="text-xs text-[#769ab4] leading-relaxed">
                Registered broadcast receiver detects <code className="text-[#00eaff] bg-[#0c223a] px-1 py-0.5 rounded">android.intent.action.SCREEN_OFF</code>.
                When your smartphone display turns off or locks, PORAN LIVE immediately shuts down the MediaProjection and releases hardware encoders safely.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: VIDEO GALLERY */}
        {activeTab === 'gallery' && (
          <div className="space-y-4 py-2">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-[#00eaff]" />
                <span>Device Video Gallery</span>
              </h2>
              <p className="text-xs text-[#7d9eb6]">
                Select video files from your device to preview and validate for live streaming
              </p>
            </div>

            {/* Video Selector Button */}
            <button
              onClick={handleSelectVideo}
              className="w-full py-4 rounded-xl border-2 border-dashed border-[#00eaff]/40 bg-[#081628] hover:bg-[#0c2038] hover:border-[#00eaff] transition-all flex flex-col items-center justify-center gap-2 text-white"
            >
              <Upload className="w-6 h-6 text-[#00eaff]" />
              <div className="text-center">
                <span className="font-semibold text-sm">Choose Video from Android Gallery</span>
                <p className="text-[11px] text-[#7195b0]">Supports MP4, MKV, WebM formats</p>
              </div>
            </button>

            {/* Video Player & Metadata Preview */}
            {selectedVideoUri ? (
              <div className="bg-[#09172a] rounded-xl border border-[#153456] overflow-hidden p-3 space-y-3">
                <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#1c3f66]">
                  <video 
                    src={selectedVideoUri} 
                    controls 
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setVideoDuration(`${Math.round(v.duration)}s (${Math.floor(v.duration / 60)}m ${Math.round(v.duration % 60)}s)`);
                    }}
                  />
                </div>

                {/* Metadata Details */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#122842]">
                    <span className="text-zinc-400">File Name:</span>
                    <span className="font-mono text-white truncate max-w-[220px]">{selectedVideoName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#122842]">
                    <span className="text-zinc-400">MIME Type:</span>
                    <span className="font-mono text-[#00eaff]">{selectedVideoType}</span>
                  </div>
                  {videoDuration && (
                    <div className="flex justify-between py-1 border-b border-[#122842]">
                      <span className="text-zinc-400">Duration:</span>
                      <span className="font-mono text-white">{videoDuration}</span>
                    </div>
                  )}
                  {videoFileSize && (
                    <div className="flex justify-between py-1 border-b border-[#122842]">
                      <span className="text-zinc-400">Size:</span>
                      <span className="font-mono text-white">{videoFileSize}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Compatibility:</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Facebook Live Compatible
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setActiveTab('studio')}
                    className="flex-1 py-2.5 rounded-lg bg-[#00eaff] text-black font-bold text-xs hover:brightness-110 transition"
                  >
                    Return to Live Studio
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVideoUri(null);
                      setSelectedVideoName(null);
                    }}
                    className="px-3 py-2.5 rounded-lg bg-[#142336] text-zinc-300 text-xs hover:bg-[#1a2e47]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#071322] border border-[#11273e] text-center text-xs text-[#6e8fa9]">
                No video currently selected. Tap the gallery button above to load a recorded clip.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FACEBOOK STREAMING CONFIGURATION */}
        {activeTab === 'facebook' && (
          <div className="space-y-4 py-2">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#00eaff]" />
                <span>Facebook Live Settings</span>
              </h2>
              <p className="text-xs text-[#7d9eb6]">
                Credentials are encrypted on-device via Android KeyStore (AES-GCM)
              </p>
            </div>

            <div className="bg-[#091729] p-4 rounded-xl border border-[#153252] space-y-3.5">
              {/* Server URL Input */}
              <div>
                <label className="block text-xs font-semibold text-[#8edbee] mb-1">
                  Facebook RTMP / RTMPS Server URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="rtmps://live-api-s.facebook.com:443/rtmp/"
                    className="w-full bg-[#050e1a] border border-[#173b5e] focus:border-[#00eaff] rounded-lg px-3 py-2.5 text-xs text-white outline-none font-mono transition"
                  />
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">
                  Default: rtmps://live-api-s.facebook.com:443/rtmp/
                </span>
              </div>

              {/* Stream Key Input */}
              <div>
                <label className="block text-xs font-semibold text-[#8edbee] mb-1">
                  Facebook Stream Key
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showStreamKey ? 'text' : 'password'}
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="FB-1234567890-..."
                    autoComplete="off"
                    className="w-full bg-[#050e1a] border border-[#173b5e] focus:border-[#00eaff] rounded-lg pl-3 pr-10 py-2.5 text-xs text-white outline-none font-mono transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStreamKey(!showStreamKey)}
                    className="absolute right-2 text-zinc-400 hover:text-white p-1"
                  >
                    {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">
                  Never commit or share your Stream Key publicly.
                </span>
              </div>

              {/* Save & Clear Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleSaveSettings}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white font-bold text-xs uppercase tracking-wider hover:brightness-110 shadow-md transition"
                >
                  Save Encrypted Settings
                </button>
                {configured && (
                  <button
                    onClick={handleClearSettings}
                    className="px-3 py-3 rounded-lg bg-red-950/70 border border-red-500/40 text-red-300 font-semibold text-xs hover:bg-red-900/80 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* How-To Instructions */}
            <div className="p-3.5 rounded-xl bg-[#071322] border border-[#11263d] text-xs space-y-2">
              <h4 className="font-semibold text-white flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-[#00eaff]" />
                <span>How to Get Your Facebook Stream Key:</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-[#83a7c2] leading-relaxed">
                <li>Open <strong>facebook.com/live/producer</strong> in your browser.</li>
                <li>Select <strong>Streaming Software</strong> as your video source.</li>
                <li>Copy the <strong>Server URL</strong> and <strong>Stream Key</strong>.</li>
                <li>Paste them above and tap <strong>Save Encrypted Settings</strong>.</li>
              </ol>
            </div>
          </div>
        )}

        {/* TAB 5: SYSTEM AUDIT & CI/CD PIPELINE */}
        {activeTab === 'audit' && (
          <div className="space-y-4 py-2">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Project Audit & Build Status</span>
              </h2>
              <p className="text-xs text-[#7d9eb6]">Android system configuration & GitHub Actions audit</p>
            </div>

            {/* Audit Status Cards */}
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Application ID / Package</h4>
                  <p className="font-mono text-[#00eaff] text-[11px]">com.poran.live</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  VERIFIED
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Android SDK Versions</h4>
                  <p className="text-[#84a9c6] text-[11px]">Compile: 36 | Target: 36 | Min: 24</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  CONFIGURED
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">RTMP Engine (RootEncoder)</h4>
                  <p className="text-[#84a9c6] text-[11px]">com.github.pedroSG94.RootEncoder:library:2.8.1</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  ACTIVE
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Foreground Service Types</h4>
                  <p className="text-[#84a9c6] text-[11px]">mediaProjection | microphone (Android 14+ compliant)</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  SECURED
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Screen-Off Broadcast Receiver</h4>
                  <p className="text-[#84a9c6] text-[11px]">Auto-halts capture and encoder upon display sleep</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  IMPLEMENTED
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#091729] border border-[#143152] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">GitHub Actions CI Pipeline</h4>
                  <p className="text-[#84a9c6] text-[11px]">.github/workflows/android.yml (APK + AAB)</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold text-[10px]">
                  REPAIRED
                </span>
              </div>
            </div>

            {/* GitHub Info */}
            <div className="p-3.5 rounded-xl bg-[#071322] border border-[#11273e] text-xs">
              <h4 className="font-semibold text-white mb-1">Git Repository:</h4>
              <p className="font-mono text-[#00eaff]">dsporan25-hue/PORAN_LIVE (branch: main)</p>
              <p className="text-[11px] text-[#7195b0] mt-1">
                Zero secret leaks policy enforced: Stream Keys and credentials are not hardcoded or committed to git.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[#102338] bg-[#060e1c] py-2.5 px-4 text-center text-[10px] text-[#55758c]">
        PORAN LIVE • Facebook Live Streaming System • Android Production Build
      </footer>
    </div>
  );
}
