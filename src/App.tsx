import React, { useState, useEffect, useRef } from 'react';
import { Calculator, Settings as SettingsIcon, Package, Database, Info, Loader2, Cloud, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { PricingSettings, SourceData } from './types';
import { DEFAULT_SETTINGS } from './lib/calculations';
import { getSettings, getSources, saveSettings, loadFullBackupFromCloud, saveFullBackupToCloud, saveSource } from './lib/db';
import CalculatorView from './components/CalculatorView';
import SettingsView from './components/SettingsView';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'calculator' | 'settings'>('calculator');
  const [pricingMode, setPricingMode] = useState<'TR' | 'OAS'>('TR');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_SETTINGS);
  const [sources, setSources] = useState<SourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const sessionPin = sessionStorage.getItem('pin_verified');
    if (sessionPin === 'true') {
      setIsPinVerified(true);
    }

    async function initialLoad() {
      try {
        setLoading(true);
        // Load local data first for speed
        const storedSettings = await getSettings(false);
        if (storedSettings) setSettings(storedSettings);
        
        const storedSources = await getSources(false);
        setSources(storedSources);
      } catch (error) {
        console.error('Failed to load local data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    initialLoad();

    // Auth listener
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      
      if (authUser) {
        setSyncStatus('syncing');
        try {
          const cloudBackup = await loadFullBackupFromCloud(authUser.uid);
          if (cloudBackup) {
            // Check if local is empty or it's the very first load
            const localSources = await getSources(false);
            if (localSources.length === 0 || isInitialLoad.current) {
              setSettings(cloudBackup.settings);
              setSources(cloudBackup.sources);
              // Save to local DB
              await saveSettings(cloudBackup.settings, false);
              for (const s of cloudBackup.sources) {
                await saveSource(s, false);
              }
              console.log("System synchronized with latest cloud backup.");
              setSyncStatus('synced');
            }
          } else {
            setSyncStatus('idle');
          }
        } catch (e) {
          console.error("Auto-pull failed", e);
          setSyncStatus('error');
        }
      } else {
        setSyncStatus('idle');
      }
      isInitialLoad.current = false;
    });

    return () => unsubscribe();
  }, []);

  const isSyncing = useRef(false);
  const lastSyncTime = useRef(0);

  // Automatic Background Save to Cloud
  useEffect(() => {
    if (!user || isInitialLoad.current || loading) return;

    const autoSave = async () => {
      // Don't sync more than once every 60 seconds automatically, unless forced
      const now = Date.now();
      const lastSync = lastSyncTime.current;
      const cooldown = syncStatus === 'error' ? 300000 : 60000; // 5 mins if error, 1 min normal
      
      if (now - lastSync < cooldown) {
        return;
      }

      if (isSyncing.current) return;
      
      isSyncing.current = true;
      setSyncStatus('syncing');
      try {
        await saveFullBackupToCloud(user.uid, settings, sources);
        setSyncStatus('synced');
        lastSyncTime.current = Date.now();
      } catch (e: any) {
        console.error("Auto-push failed", e);
        setSyncStatus('error');
        lastSyncTime.current = Date.now(); // Start cooldown even on error
      } finally {
        isSyncing.current = false;
      }
    };

    const timer = setTimeout(autoSave, 15000); 
    return () => clearTimeout(timer);
  }, [settings, sources, user, syncStatus]);

  const forceSync = async () => {
    if (!user || isSyncing.current) return;
    
    isSyncing.current = true;
    setSyncStatus('syncing');
    try {
      await saveFullBackupToCloud(user.uid, settings, sources);
      setSyncStatus('synced');
      lastSyncTime.current = Date.now();
      alert("Bulut yedeklemesi başarıyla tamamlandı.");
    } catch (e: any) {
      console.error("Force sync failed", e);
      setSyncStatus('error');
      alert("Eşitleme hatası: Kota dolmuş olabilir veya bağlantı kesildi.");
    } finally {
      isSyncing.current = false;
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '829852') {
      setIsPinVerified(true);
      setPinError(false);
      sessionStorage.setItem('pin_verified', 'true');
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleUpdateSettings = async (newSettings: PricingSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleUpdateSources = (newSources: SourceData[]) => {
    setSources(newSources);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!isPinVerified) {
    return (
      <div className="fixed inset-0 bg-[#0f172a] flex items-center justify-center p-6 z-[9999] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-teal-500/10 opacity-50"></div>
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px]"></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-3xl border border-white/10 p-10 rounded-[48px] shadow-2xl w-full max-w-sm relative z-10 text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-500/20 rotate-6 transform transition-transform hover:rotate-0">
             <Package className="text-white w-10 h-10" />
          </div>
          
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Sistem Girişi</h1>
          <p className="text-slate-400 text-[10px] font-bold mb-10 uppercase tracking-[0.3em]">HC/SME-I2R AI PRICING 3.0</p>
          
          <form onSubmit={handlePinSubmit} className="space-y-6">
            <div className="relative group">
              <input 
                type="password" 
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full bg-white/5 border-2 border-white/10 rounded-3xl py-6 text-center text-3xl font-black text-white tracking-[0.8em] focus:border-blue-500 focus:bg-white/10 outline-none transition-all placeholder:text-white/10"
                placeholder="000000"
                autoFocus
              />
            </div>
            
            <AnimatePresence>
              {pinError && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-400 text-[10px] font-black uppercase tracking-widest"
                >
                  X Hatalı Doğrulama Kodu X
                </motion.p>
              )}
            </AnimatePresence>
            
            <button 
              type="submit"
              className="w-full bg-white text-slate-900 hover:bg-blue-50 font-black py-6 rounded-3xl uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
            >
              Uygulamayı Başlat
            </button>
          </form>
          
          <div className="mt-12 flex items-center justify-center gap-3">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sunucu Bağlantısı Aktif</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900 relative overflow-x-hidden">
      {/* Frosted Background Decorative Circles */}
      <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] bg-blue-100 rounded-full blur-[120px] opacity-50 z-0 pointer-events-none"></div>
      <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-teal-50 rounded-full blur-[100px] opacity-40 z-0 pointer-events-none"></div>
      
      {/* Header / Nav */}
      <header className="sticky top-0 z-50 bg-white/30 backdrop-blur-md border-b border-white/40 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-lg shadow-blue-200/50">
              <Package className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter text-slate-900 uppercase leading-none">I2R 2026 usd1iz</h1>
              <p className="text-[9px] font-bold text-blue-600 mt-0.5 uppercase tracking-wider">
                {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          </div>

          <nav className="flex bg-slate-200/50 p-1 rounded-lg backdrop-blur-sm">
            <button
              id="nav-calculator"
              onClick={() => setActiveTab('calculator')}
              className={cn(
                "px-6 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'calculator' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Calculator className="w-4 h-4" />
              Hesaplayıcı
            </button>
            <button
              id="nav-settings"
              onClick={() => setActiveTab('settings')}
              className={cn(
                "px-6 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'settings' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <SettingsIcon className="w-4 h-4" />
              Ayarlar
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={forceSync}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
              title="Şimdi Buluta Yedekle"
            >
              <AnimatePresence mode="wait">
                {syncStatus === 'syncing' ? (
                  <motion.div
                    key="syncing"
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Loader2 className="w-4 h-4 text-blue-600" />
                  </motion.div>
                ) : syncStatus === 'synced' ? (
                  <Cloud className="w-4 h-4 text-emerald-600" />
                ) : (
                  <CloudOff className="w-4 h-4 text-red-600" />
                )}
              </AnimatePresence>
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Sistem</span>
                <span className={`text-[11px] font-bold uppercase ${
                  syncStatus === 'syncing' ? 'text-blue-600' : 
                  syncStatus === 'synced' ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {syncStatus === 'syncing' ? 'Eşitleniyor' : 
                   syncStatus === 'synced' ? 'Bulut Güncel' : 'Kota/Hata'}
                </span>
              </div>
            </button>

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Operatör</span>
              <span className="text-xs font-black text-slate-900 tracking-tight uppercase">Deniz Usta</span>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-tight">AKTİF</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'calculator' ? (
            <motion.div
              key="calculator"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <CalculatorView 
                settings={settings} 
                sources={sources}
                pricingMode={pricingMode}
                setPricingMode={setPricingMode}
              />
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <SettingsView 
                settings={settings} 
                onUpdateSettings={handleUpdateSettings} 
                sources={sources} 
                onUpdateSources={handleUpdateSources} 
                user={user}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-4 py-12 flex flex-col md:flex-row items-center justify-between border-t border-gray-200 mt-12 text-gray-400 text-xs">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Sistem Çevrimiçi
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3" />
            {sources.length} Veri Kaynağı Aktif
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="font-black text-slate-500 uppercase tracking-widest">Deniz Usta</span>
          <a href="#" className="hover:text-blue-600 transition-colors">Kullanım Kılavuzu</a>
          <a href="#" className="hover:text-blue-600 transition-colors">Versiyon Notları</a>
          <div className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            V3.0.4
          </div>
        </div>
      </footer>
    </div>
  );
}
