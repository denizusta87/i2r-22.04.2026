/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Search, RotateCcw, AlertCircle, CheckCircle2, TrendingUp, Euro, CreditCard, ShoppingCart, Info, Database } from 'lucide-react';
import { motion } from 'motion/react';
import { PricingSettings, SourceData, PricingResult, SearchResult } from '../types';
import { calculatePricing, reverseCalculateFromGms, formatCurrency, formatPercent, formatNumber } from '../lib/calculations';
import { cn } from '../lib/utils';
import { searchInCloud } from '../lib/db';

interface CalculatorViewProps {
  settings: PricingSettings;
  sources: SourceData[];
  pricingMode: 'TR' | 'OAS';
  setPricingMode: (mode: 'TR' | 'OAS') => void;
}

export default function CalculatorView({ settings, sources, pricingMode, setPricingMode }: CalculatorViewProps) {
  const [materialNo, setMaterialNo] = useState('');
  const [grossPrice, setGrossPrice] = useState<number>(0);
  const [manualGms, setManualGms] = useState<string>('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [extraSourceResult, setExtraSourceResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Perform search across sources
  useEffect(() => {
    async function performSearch() {
        if (!materialNo.trim()) {
          setSearchResult(null);
          setExtraSourceResult(null);
          return;
        }

        setIsSearching(true);
        let primaryMatch: SearchResult | null = null;
        let extraMatch: SearchResult | null = null;

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            let item = null;

            // Try local first
            if (source.data && source.data.length > 0) {
                item = source.data.find(row => 
                    String(row[source.searchColumn]).toLowerCase() === materialNo.toLowerCase().trim()
                );
            } else {
                // Try cloud search if data is not local
                item = await searchInCloud(source.id, source.searchColumn, materialNo.trim());
            }
            
            if (item) {
                const val = item[source.priceColumn];
                const fields: Record<string, any> = {};
                if (source.displayColumns) {
                    source.displayColumns.forEach(col => {
                        fields[col] = item[col];
                    });
                }

                const match: SearchResult = {
                    value: val,
                    fields: fields,
                    sourceName: source.name,
                    sourceIndex: i + 1,
                    found: true
                };

                // Index 3 is Source 4 (Ek Veri)
                if (i === 3) {
                    extraMatch = match;
                } else if (!primaryMatch) {
                    primaryMatch = match;
                    
                    // Update gross price from primary match
                    const numericVal = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
                    if (!isNaN(numericVal)) {
                        setGrossPrice(numericVal);
                    }
                }
            }
        }

        setSearchResult(primaryMatch || (extraMatch ? null : { value: null, fields: {}, sourceName: '', sourceIndex: 0, found: false }));
        setExtraSourceResult(extraMatch);
        
        // If no primary match but extra match found, use extra match's price
        if (!primaryMatch && extraMatch) {
            const numericVal = typeof extraMatch.value === 'number' ? extraMatch.value : parseFloat(String(extraMatch.value).replace(',', '.'));
            if (!isNaN(numericVal)) {
                setGrossPrice(numericVal);
            }
        }
        setIsSearching(false);
    }
    
    performSearch();
  }, [materialNo, sources]);

  const results = useMemo(() => {
    const defaultResults = calculatePricing(grossPrice, settings);
    
    // If user has entered a manual GMS, we use the reverse calculation as the main result
    const numericManualGms = parseFloat(manualGms.replace(',', '.')) / 100;
    if (!isNaN(numericManualGms) && grossPrice > 0) {
        const reversed = reverseCalculateFromGms(numericManualGms, grossPrice, settings);
        return {
            ...defaultResults,
            finalListPrice: reversed.finalListPrice || defaultResults.finalListPrice,
            tns: reversed.tns || defaultResults.tns,
            gms: reversed.gms || defaultResults.gms
        };
    }
    
    return defaultResults;
  }, [grossPrice, settings, manualGms]);

  const handleGmsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualGms(e.target.value);
  };

  // If manual GMS is entered, we calculate a "Suggested" price
  const suggestedResults = useMemo(() => {
    const numericGms = parseFloat(manualGms.replace(',', '.')) / 100;
    if (!isNaN(numericGms) && grossPrice > 0) {
        return reverseCalculateFromGms(numericGms, grossPrice, settings);
    }
    return null;
  }, [manualGms, grossPrice, settings]);

  const reset = () => {
    setMaterialNo('');
    setGrossPrice(0);
    setManualGms('');
    setSearchResult(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Input Section */}
      <div className="lg:col-span-12 space-y-6">
        <div className="bg-white/70 backdrop-blur-xl border border-white/60 p-6 rounded-3xl shadow-xl shadow-blue-900/5 relative group transition-all duration-500">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-teal-400/20 rounded-[25px] blur opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none"></div>
          
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[11px] font-bold tracking-widest text-slate-400 uppercase block">Hızlı Malzeme Sorgulama</label>
              
              <div className="flex bg-slate-200/50 p-1 rounded-xl backdrop-blur-sm border border-slate-300/30">
                <button 
                  onClick={() => setPricingMode('TR')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    pricingMode === 'TR' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  TR
                </button>
                <button 
                  onClick={() => setPricingMode('OAS')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    pricingMode === 'OAS' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  OAS
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={materialNo}
                  onChange={(e) => setMaterialNo(e.target.value)}
                  placeholder="Örn: 5412-XX-99..."
                  className="w-full bg-slate-100 border-none rounded-xl px-5 py-4 text-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-300"
                />
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              </div>
              <button 
                onClick={reset}
                className="bg-white/50 hover:bg-white text-slate-600 px-6 py-4 rounded-xl font-bold border border-white/60 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>TEMİZLE</span>
              </button>
            </div>
            
            <div className="flex flex-wrap gap-4 mt-6">
              {sources.map((source, idx) => {
                const isActive = searchResult?.found && searchResult.sourceIndex === idx + 1;
                const isNotFound = searchResult && !searchResult.found;
                const sourceNames = ["ManP", "Bitron", "CWS", "Ek Veri"];
                const label = sourceNames[idx] || `Kaynak ${idx + 1}`;
                
                return (
                  <div key={idx} className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[11px] font-bold uppercase tracking-tight",
                    isActive ? "bg-teal-50 border-teal-100 text-teal-700" : 
                    isNotFound ? "bg-slate-100 border-slate-200 text-slate-400" :
                    "bg-blue-50 border-blue-100 text-blue-700"
                  )}>
                    <span>{label}: {isActive ? 'BULUNDU ✓' : isNotFound ? 'VERİ YOK' : 'AKTİF'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Analysis Section */}
      <div className="lg:col-span-12 space-y-8">
        
        {searchResult?.found && Object.keys(searchResult.fields).length > 0 && (
          <div className="bg-white/40 backdrop-blur-md border border-white/80 p-6 rounded-3xl shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              Malzeme Detayları ({searchResult.sourceName}) <span className="h-px flex-1 bg-slate-100"></span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.entries(searchResult.fields).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter block">{key}</span>
                  <div className="text-xs font-black text-slate-700 truncate" title={String(val)}>{String(val)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8">
            {/* The Result Card */}
            <div className="bg-white backdrop-blur-2xl border-4 border-blue-600/5 p-8 rounded-[40px] shadow-2xl shadow-blue-900/10 relative overflow-hidden group">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50 group-hover:scale-110 transition-transform duration-700"></div>
                
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2 relative z-10">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div> Sonuç Ekranı
                </h3>

                <div className="space-y-10 relative z-10">
                    <div className="flex flex-col">
                        <label className="text-[11px] font-black text-blue-600/60 uppercase tracking-widest mb-1">Tanımlanacak Liste Fiyatı</label>
                        <div className="text-7xl font-black text-slate-900 tracking-tighter leading-none flex items-baseline">
                            {formatNumber(results.finalListPrice)}
                            <span className="text-2xl ml-3 text-slate-300 font-bold">TRY</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 shadow-inner group/gms">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Hedef GMS Oranı (%)</span>
                                <TrendingUp className="w-3 h-3 text-blue-300" />
                            </div>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={manualGms || (results.gms * 100).toFixed(2)}
                                    onChange={handleGmsChange}
                                    className="w-full bg-transparent border-none p-0 text-3xl font-black text-blue-600 outline-none focus:ring-0"
                                />
                                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-blue-200 text-xl font-black">%</span>
                            </div>
                            <div className="text-[9px] text-blue-300 font-bold mt-1 uppercase tracking-tighter">Değiştirmek için üzerine tıklayın</div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100-50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Net Satınalma</span>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-400 mb-1">{formatCurrency(grossPrice, "EUR")}</span>
                                <div className="text-2xl font-mono font-black text-slate-700">
                                    {formatCurrency(results.netPurchase)}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100-50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">TNS (Premium)</span>
                            <div className="text-2xl font-mono font-black text-slate-700">
                                {formatCurrency(results.tns)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Bottom Layout: Ek Veri Section (Full Width Now) */}
      <div className="lg:col-span-12 mt-4">
        {/* Ek Veri Katmanı Section - Dark Theme applied from removed summary */}
        <div className={cn(
          "bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden shadow-2xl flex flex-col min-h-[300px] transition-all duration-500",
          !extraSourceResult?.found && "opacity-80 grayscale-[0.5]"
        )}>
          {/* Decorative Background Blur */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] -mr-40 -mt-40"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-[80px] -ml-32 -mb-32"></div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Database className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-black tracking-tight uppercase">Ek Veri Katmanı</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Özel Veri Detay Analizi</p>
                </div>
              </div>
              
              {extraSourceResult?.found && (
                <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] block mb-1">Sorgulanan Parça</span>
                  <div className="text-2xl font-black text-white tracking-tighter tabular-nums">{materialNo}</div>
                </div>
              )}
            </div>
            
            {extraSourceResult?.found ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 flex-1">
                  {Object.entries(extraSourceResult.fields).map(([key, val]) => {
                      let displayValue = String(val);

                      // Custom mapping for 'Dağıtım znc.durumu'
                      if (key === 'Dağıtım znc.durumu') {
                          const statusMap: Record<string, string> = {
                              '01': 'Phase out',
                              '03': 'Teknik eksiklik',
                              '13': 'Satışa açık ve aktif'
                          };
                          const strVal = String(val).trim().padStart(2, '0');
                          displayValue = statusMap[strVal] || displayValue;
                      }

                      // Format 'ZYP1-Gç.Bş.' as date
                      if (key === 'ZYP1-Gç.Bş.' && val) {
                          try {
                              if (typeof val === 'number') {
                                  // Excel serial date
                                  const date = new Date((val - 25569) * 86400 * 1000);
                                  displayValue = date.toLocaleDateString('tr-TR');
                              } else if (typeof val === 'string' && !isNaN(Date.parse(val))) {
                                  displayValue = new Date(val).toLocaleDateString('tr-TR');
                              }
                          } catch (e) {
                              console.error('Date formatting error:', e);
                          }
                      }

                      return (
                          <div key={key} className="group relative">
                             <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-20 transition duration-300"></div>
                             <div className="relative p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all h-full">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{key}</span>
                                <div className="text-sm font-bold text-slate-200 break-words leading-relaxed">{displayValue}</div>
                             </div>
                          </div>
                      );
                  })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16 space-y-4">
                 <div className="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                    <Database className="w-8 h-8 opacity-20" />
                 </div>
                 <div className="text-center">
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] block">Veri Eşleşmesi Bekleniyor</span>
                    <p className="text-[9px] font-bold text-slate-600 uppercase mt-1">Ek veri kaynağında sonuç bulunamadı</p>
                 </div>
              </div>
            )}

            <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SİSTEM AKTİF</span>
                    </div>
                    <div className="w-px h-3 bg-white/10"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{sources.length} VERİ KAYNAĞI</span>
                </div>
                <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                   HC/SME-I2R AI PRICING 3.0
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
