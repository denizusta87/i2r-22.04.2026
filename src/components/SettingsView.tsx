/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Save, Upload, Trash2, Database, AlertCircle, CheckCircle2, ChevronDown, Plus, Info, Euro, TrendingUp, Briefcase, Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react';
import { User, signOut } from 'firebase/auth';
import { auth, loginWithGoogle } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { PricingSettings, SourceData } from '../types';
import { saveSource, deleteSource, saveSettings, getSettings, getSources, saveFullBackupToCloud, loadFullBackupFromCloud } from '../lib/db';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/calculations';

interface SettingsViewProps {
  settings: PricingSettings;
  onUpdateSettings: (settings: PricingSettings) => void;
  sources: SourceData[];
  onUpdateSources: (sources: SourceData[]) => void;
  user: User | null;
}

export default function SettingsView({ settings, onUpdateSettings, sources, onUpdateSources, user }: SettingsViewProps) {
  const [localSettings, setLocalSettings] = useState<PricingSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadLoading, setUploadLoading] = useState<number | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSyncFromCloud = async () => {
    if (!user) return;
    setIsPulling(true);
    try {
      const backup = await loadFullBackupFromCloud(user.uid);
      if (backup) {
        // Update Local State
        setLocalSettings(backup.settings);
        onUpdateSettings(backup.settings);
        onUpdateSources(backup.sources);
        
        // Save to IndexedDB
        await saveSettings(backup.settings, false);
        for (const source of backup.sources) {
          await saveSource(source, false);
        }
        
        alert('Tüm verileriniz ve ayarlarınız başarıyla geri yüklendi!');
      } else {
        alert('Bulutta size ait bir yedek bulunamadı.');
      }
    } catch (error) {
      console.error('Sync failed', error);
      alert('Buluttan veri çekilirken hata oluştu.');
    } finally {
      setIsPulling(false);
    }
  };

  const handleSyncToCloud = async () => {
    if (!user) return;
    setIsPushing(true);
    try {
      await saveFullBackupToCloud(user.uid, localSettings, sources);
      alert('Tüm sistem buluta yedeklendi! Artık her yerden bu verilere ulaşabilirsiniz.');
    } catch (error: any) {
      console.error('Backup failed', error);
      alert(`Hata: ${error.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleSettingChange = (key: keyof PricingSettings, value: string) => {
    const numericValue = parseFloat(value.replace(',', '.'));
    setLocalSettings(prev => ({ ...prev, [key]: isNaN(numericValue) ? 0 : numericValue }));
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    await onUpdateSettings(localSettings);
    if (user) {
      await saveSettings(localSettings, true);
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, sourceIndex: number) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadLoading(sourceIndex);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
        
        if (jsonData.length === 0) throw new Error('Dosya boş');

        const headers = Object.keys(jsonData[0]);
        
        const newSource: SourceData = {
          id: `source-${Date.now()}`,
          name: file.name,
          headers: headers,
          searchColumn: headers[0],
          priceColumn: headers.length > 1 ? headers[1] : headers[0],
          displayColumns: headers.slice(0, 5), // Default to first 5 columns
          data: jsonData,
          lastUpdated: Date.now()
        };

        await saveSource(newSource);
        
        const updatedSources = [...sources];
        updatedSources[sourceIndex] = newSource;
        onUpdateSources(updatedSources);

      } catch (error) {
        console.error('File upload failed:', error);
        alert('Dosya yüklenirken bir hata oluştu.');
      } finally {
        setUploadLoading(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleSourceColumnChange = async (index: number, key: 'searchColumn' | 'priceColumn', value: string) => {
    const updatedSources = [...sources];
    updatedSources[index] = { ...updatedSources[index], [key]: value };
    await saveSource(updatedSources[index]);
    onUpdateSources(updatedSources);
  };

  const handleDisplayColumnToggle = async (sourceIndex: number, column: string) => {
    const updatedSources = [...sources];
    const source = updatedSources[sourceIndex];
    const currentCols = source.displayColumns || [];
    
    let nextCols;
    if (currentCols.includes(column)) {
        nextCols = currentCols.filter(c => c !== column);
    } else {
        nextCols = [...currentCols, column];
    }
    
    updatedSources[sourceIndex] = { ...source, displayColumns: nextCols };
    await saveSource(updatedSources[sourceIndex]);
    onUpdateSources(updatedSources);
  };

  const handleDeleteSource = async (index: number) => {
    const sourceId = sources[index]?.id;
    if (sourceId) {
        await deleteSource(sourceId);
    }
    const updatedSources = [...sources];
    updatedSources.splice(index, 1);
    onUpdateSources(updatedSources);
  };

  return (
    <div className="space-y-12">
      {/* Cloud Sync Section */}
      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white/20 rounded-3xl backdrop-blur-md flex items-center justify-center shadow-inner">
               {user ? <Cloud className="w-8 h-8" /> : <CloudOff className="w-8 h-8 opacity-50" />}
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">Bulut Senkronizasyonu</h2>
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em] mt-1">Verilerinize her cihazdan ulaşın</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {user ? (
              <>
                <div className="flex flex-col items-end mr-4">
                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">Aktif Hesap</span>
                  <span className="text-sm font-black tracking-tight">{user.email}</span>
                </div>
                <button 
                  onClick={handleSyncFromCloud}
                  disabled={isPulling || isPushing}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <RefreshCw className={cn("w-4 h-4", isPulling && "animate-spin")} />
                  Buluttan Çek
                </button>
                <button 
                  onClick={handleSyncToCloud}
                  disabled={isPulling || isPushing}
                  className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2"
                >
                  {isPushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Buluta Gönder
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-2.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/20 rounded-2xl transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-8 py-3 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-2xl transition-all active:scale-95 flex items-center gap-3"
              >
                <Cloud className="w-5 h-5" />
                Google ile Giriş Yap & Bulutu Aktif Et
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Coefficients Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Katsayılar & Formül Ayarları
            </h2>
            <p className="text-xs text-gray-400 mt-1">Hesaplama motoru için gerekli temel değişkenler.</p>
          </div>
          <button 
            onClick={handleSaveSettings}
            disabled={isSaving}
            className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                isSaving ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
            )}
          >
            {isSaving ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Kaydedildi' : 'Ayarları Kaydet'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-slate-400">
                <Euro className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Kur (EUR/TRY)</span>
            </div>
            <input 
                type="text" 
                value={localSettings.exchangeRate.toString()}
                onChange={(e) => handleSettingChange('exchangeRate', e.target.value)}
                className="text-2xl font-mono font-black w-full outline-none focus:text-blue-600 bg-transparent"
            />
          </div>

          <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-slate-400">
                <Info className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Premium Katsayı</span>
            </div>
            <input 
                type="text" 
                 value={localSettings.premiumCoefficient.toString()}
                 onChange={(e) => handleSettingChange('premiumCoefficient', e.target.value)}
                className="text-2xl font-mono font-black w-full outline-none focus:text-blue-600 bg-transparent"
            />
          </div>

          <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-slate-400">
                <Briefcase className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">% SG&AV Oranı</span>
            </div>
            <div className="flex items-baseline gap-1">
                <input 
                    type="text" 
                    value={(localSettings.sgAvRatio * 100).toString()}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value.replace(',', '.'));
                        setLocalSettings(prev => ({ ...prev, sgAvRatio: isNaN(val) ? 0 : val / 100 }));
                    }}
                    className="text-2xl font-mono font-black w-24 outline-none focus:text-blue-600 bg-transparent"
                />
                <span className="text-slate-400 font-black text-xl">%</span>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-slate-400">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Planlanan GM2</span>
            </div>
            <div className="flex items-baseline gap-1">
                <input 
                    type="text" 
                    value={(localSettings.plannedGm2 * 100).toString()}
                    onChange={(e) => {
                         const val = parseFloat(e.target.value.replace(',', '.'));
                         setLocalSettings(prev => ({ ...prev, plannedGm2: isNaN(val) ? 0 : val / 100 }));
                    }}
                    className="text-2xl font-mono font-black w-24 outline-none focus:text-blue-600 bg-transparent"
                />
                <span className="text-slate-400 font-black text-xl">%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources Section */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-900">
            <Database className="w-5 h-5 text-blue-600" />
            Çok Katmanlı Veri Kaynakları
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium italic">3 ayrı Excel/CSV kaynağı sisteme yükleyebilir ve arama önceliği belirleyebilirsiniz.</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {[0, 1, 2, 3].map((idx) => {
            const sourceNames = ["ManP", "Bitron", "CWS", "Ek Veri"];
            const currentLabel = sourceNames[idx] || `Kaynak ${idx + 1}`;
            
            return (
              <div key={idx} className="bg-white/60 backdrop-blur-md rounded-3xl border border-white/80 shadow-lg overflow-hidden flex flex-col md:flex-row transition-all hover:bg-white/80">
                {/* Index Badge */}
                <div className="w-full md:w-20 bg-slate-100/50 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/60 p-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Katman</span>
                  <span className="text-sm font-black text-blue-600">{currentLabel}</span>
                </div>

                <div className="flex-1 p-5">
                  {sources[idx] ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                      <div className="col-span-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-500 shadow-sm border border-white">
                            <Database className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-800 truncate max-w-[150px] uppercase tracking-tight">{sources[idx]?.name}</div>
                            <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-0.5">
                               {sources[idx]?.data.length} SATIR YÜKLÜ
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1.5">Arama Sütunu</label>
                        <div className="relative">
                          <select 
                            value={sources[idx]?.searchColumn}
                            onChange={(e) => handleSourceColumnChange(idx, 'searchColumn', e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200/50 rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/10 text-slate-600"
                          >
                            {sources[idx]?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="col-span-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1.5">Fiyat Sütunu</label>
                        <div className="relative mb-3">
                          <select 
                            value={sources[idx]?.priceColumn}
                            onChange={(e) => handleSourceColumnChange(idx, 'priceColumn', e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200/50 rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/10 text-slate-600"
                          >
                            {sources[idx]?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                        
                        <div className="space-y-1 mt-4">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1.5">Görüntülenecek Veriler</label>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50/50 rounded-lg border border-slate-100">
                            {sources[idx]?.headers.map(header => (
                              <button
                                  key={header}
                                  onClick={() => handleDisplayColumnToggle(idx, header)}
                                  className={cn(
                                      "px-2 py-1 rounded text-[9px] font-bold transition-all border",
                                      sources[idx]?.displayColumns?.includes(header)
                                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
                                  )}
                              >
                                  {header}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <button 
                          onClick={() => handleDeleteSource(idx)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 space-y-3 border-2 border-dashed border-slate-200 rounded-2xl bg-white/30 group cursor-pointer hover:bg-white/50 hover:border-blue-300 transition-all">
                      <div className="text-center">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Henüz Veri Yüklenmedi</div>
                      </div>
                      <label className="flex items-center gap-2 px-4 py-1.5 bg-white border border-white shadow-sm rounded-lg text-[10px] font-black text-blue-600 uppercase tracking-[0.1em] cursor-pointer active:scale-95 transition-all">
                        <Plus className="w-3 h-3" />
                        DOSYA SEÇ
                        <input 
                          type="file" 
                          className="hidden" 
                          accept=".xlsx, .xls, .csv" 
                          onChange={(e) => handleFileUpload(e, idx)} 
                          disabled={uploadLoading !== null}
                        />
                      </label>
                    </div>
                  )}

                  {uploadLoading === idx && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
                          <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl shadow-xl border border-gray-100">
                             <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                             <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Veriler İşleniyor...</span>
                          </div>
                      </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Formula Info */}
      <section className="bg-gray-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
                <h2 className="text-2xl font-black mb-4">Formül Şeffaflığı</h2>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Net Satınalma</div>
                        <p className="text-sm text-gray-400 font-mono">Brüt Fiyat (EUR) × Güncel Kur</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Liste Fiyatı (Ham)</div>
                        <p className="text-sm text-gray-400 font-mono">(Net Satınalma / (1 - GM2)) / 0.7</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Final Liste Fiyatı</div>
                        <p className="text-sm text-gray-400 font-mono">MROUND( Ham Liste Fiyatı, 5 )</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">GMS (Brüt Kar)</div>
                        <p className="text-sm text-gray-400 font-mono">((TNS - Net Satınalma) / TNS) - SG&AV</p>
                    </div>
                </div>
            </div>
            <div className="hidden lg:block relative">
                {/* Visual Representation of Formula */}
                <div className="p-8 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="px-3 py-1 bg-blue-500 rounded text-[10px] font-black tracking-widest uppercase">Input</div>
                            <div className="flex-1 h-px bg-white/20"></div>
                            <div className="text-xs font-mono text-gray-400">EUR Price</div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="px-3 py-1 bg-white/10 rounded text-[10px] font-black tracking-widest uppercase">Process</div>
                            <div className="flex-1 h-px bg-white/20"></div>
                            <div className="text-xs font-mono text-gray-400">Calculations</div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="px-3 py-1 bg-green-500 rounded text-[10px] font-black tracking-widest uppercase">Output</div>
                            <div className="flex-1 h-px bg-white/20"></div>
                            <div className="text-xs font-mono text-gray-400">Final Price</div>
                        </div>
                    </div>
                </div>
                <div className="absolute -bottom-6 -right-6 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                    <Info className="w-6 h-6" />
                </div>
            </div>
        </div>
      </section>
    </div>
  );
}
