'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, FileText, CheckSquare, Upload, Search, HelpCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ModelConfig } from '@/services/configService';
import HubTopNav from '@/components/HubTopNav';
import PersonalizarIAModal from '@/components/PersonalizarIAModal';
import { reconcileSummaryModel, CURATED_SUMMARY_MODELS } from '@/lib/summaryModelCatalog';
import { loadSummaryModelCatalog, useSummaryModelCatalog } from '@/hooks/useSummaryModelCatalog';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { resolveAvailableBuiltinModel } from '@/lib/providerModelSelection';
import { formatSearchTimestamp, splitHighlightedText } from '@/lib/dashboardSearch';

interface CurrentMeeting {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DashboardScreenProps {
  sessions: CurrentMeeting[];
  onSelectSession: (id: string) => void;
  onStartNewRecording: () => void;
  activeModel: ModelConfig['provider'];
  setActiveModel: (provider: ModelConfig['provider'], model: string) => void;
  onOpenSettings: () => void;
  onImportAudioClick?: () => void;
}

interface DashboardStats {
  meetings_count: number;
  summaries_count: number;
  pending_commitments: number;
  latest_meeting_title: string | null;
  latest_meeting_created_at: string | null;
}

interface TranscriptSearchResult {
  id: string;
  title: string;
  matchContext: string;
  timestamp: string;
}

export default function DashboardScreen({
  sessions,
  onSelectSession,
  onStartNewRecording,
  activeModel,
  setActiveModel,
  onOpenSettings,
  onImportAudioClick
}: DashboardScreenProps) {
  const { t } = useTranslation();
  const { modelConfig, providerApiKeyStatus, modelOptions } = useConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [searchResults, setSearchResults] = useState<TranscriptSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [personalizarOpen, setPersonalizarOpen] = useState(false);
  const [personalizarProvider, setPersonalizarProvider] = useState<'openrouter' | 'openai' | 'claude' | 'groq' | null>(null);
  const activeCloudProvider = ['openrouter', 'openai', 'claude', 'groq'].includes(modelConfig.provider)
    ? modelConfig.provider as 'openrouter' | 'openai' | 'claude' | 'groq'
    : null;
  const { models: activeCatalogModels } = useSummaryModelCatalog(activeCloudProvider);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const result = await invoke<DashboardStats>('api_get_dashboard_stats');
        if (!cancelled) setStats(result);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
      }
    };
    loadStats();
    return () => { cancelled = true; };
  }, [sessions]);

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await invoke<TranscriptSearchResult[]>('api_search_transcripts', { query });
        if (!cancelled) setSearchResults(results);
      } catch (error) {
        console.error('Failed to search transcripts:', error);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const openPersonalizar = (provider: 'openrouter' | 'openai' | 'claude' | 'groq' | null = null) => {
    setPersonalizarProvider(provider);
    setPersonalizarOpen(true);
  };

  const getCachedProviderModel = (provider: ModelConfig['provider']) => {
    try {
      const cached = JSON.parse(localStorage.getItem('providerModelMap') || '{}') as Record<string, string>;
      return typeof cached[provider] === 'string' ? cached[provider] : '';
    } catch {
      return '';
    }
  };

  const getLocalFallbackModel = (provider: 'builtin-ai' | 'ollama') =>
    modelConfig.provider === provider && modelConfig.model
      ? modelConfig.model
      : getCachedProviderModel(provider);

  const selectProvider = async (provider: ModelConfig['provider']) => {
    const isCloudProvider = provider === 'openrouter' || provider === 'openai' || provider === 'claude' || provider === 'groq';
    const options = modelOptions[provider];
    const cachedModel = getCachedProviderModel(provider);
    const fallbackModel = options.includes(cachedModel) ? cachedModel : options[0];
    const catalogModels = isCloudProvider
      ? await loadSummaryModelCatalog(provider as 'openrouter' | 'openai' | 'claude' | 'groq').catch(() => CURATED_SUMMARY_MODELS[provider as 'openrouter' | 'openai' | 'claude' | 'groq'])
      : options;
    const catalogOptions = typeof catalogModels[0] === 'string'
      ? catalogModels as string[]
      : (catalogModels as typeof activeCatalogModels).map(model => model.id);
    if (catalogOptions.length) {
      setActiveModel(provider, isCloudProvider
        ? reconcileSummaryModel(catalogModels as typeof activeCatalogModels, cachedModel)
        : fallbackModel);
      return;
    }

    if (provider === 'builtin-ai') {
      try {
        const availableModel = await resolveAvailableBuiltinModel(
          () => invoke<string | null>('builtin_ai_get_available_summary_model'),
        );
        if (availableModel) {
          setActiveModel(provider, availableModel);
          return;
        }
      } catch (error) {
        console.error('Failed to resolve an available built-in model:', error);
      }
    } else if (provider === 'ollama') {
      const configuredModel = getLocalFallbackModel(provider);
      if (configuredModel) {
        setActiveModel(provider, configuredModel);
        return;
      }
    }

    // No usable local model exists. Open the full model settings instead of
    // presenting a successful-looking no-op.
    onOpenSettings();
  };

  // Re-run the onboarding tour: reset the completion flag and reload so the
  // OnboardingFlow guard in layout.tsx surfaces it again from step 1.
  const handleReplayOnboarding = async () => {
    try {
      await invoke('reset_onboarding_status_cmd');
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;
      return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    } catch { return dateString; }
  };

  /* ─── Brand tokens (design.md) ───
     Baltic Blue  #447794  — primary / CTA
     Ocean Teal   #2D5B75  — secondary / active
     Navy Ink     #123249  — text / nav / dark surfaces
     Obsidian     #061222  — premium dark bg
     Fonts: Inter (body), Jost (headings)                    */

  return (
    <div
      className="bg-grid-subtle h-dvh font-sans flex flex-col relative overflow-hidden"
      style={{ background: 'radial-gradient(circle at center, #0a1628 0%, #061222 100%)', color: '#e2e8f0' }}
    >
      <HubTopNav active="inicio" onOpenSettings={onOpenSettings} />

      <main className="flex-1 min-h-0 flex flex-col px-4 py-6 sm:px-6 xl:px-8 max-w-[1600px] mx-auto w-full overflow-y-auto">
        <header className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-5xl font-heading font-extrabold mb-2 tracking-tight text-white">MinutIA</h1>
            <p className="text-lg" style={{ color: '#7a9ab5' }}>Tu mejor transcriptor privado y local</p>
          </div>
          <button
            type="button"
            onClick={handleReplayOnboarding}
            aria-label="Ver tutorial de nuevo"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ borderColor: '#1a2d42', color: '#7a9ab5' }}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Ver tutorial</span>
          </button>
        </header>

        {/* ── Bento Grid ── */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8">

          {/* LEFT — Metrics & Model */}
          <div className="col-span-1 xl:col-span-3 space-y-4 flex flex-col min-w-0">

            {/* Metrics */}
            <section className="rounded-3xl p-4 flex-grow glow-border-impulso" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#7a9ab5' }}>
                MÉTRICAS CLAVE
              </h3>
              <div className="space-y-3">
                {[
                  { icon: <Mic className="w-5 h-5" />, iconBg: 'rgba(68,119,148,0.15)', iconBorder: 'rgba(68,119,148,0.25)', iconColor: '#447794', label: 'Reuniones Guardadas', value: `${stats?.meetings_count ?? sessions.length} sesiones` },
                  { icon: <FileText className="w-5 h-5" />, iconBg: 'rgba(45,91,117,0.15)', iconBorder: 'rgba(45,91,117,0.25)', iconColor: '#2D5B75', label: 'Resúmenes de IA', value: `${stats?.summaries_count ?? 0} generados` },
                  { icon: <CheckSquare className="w-5 h-5" />, iconBg: 'rgba(180,140,60,0.12)', iconBorder: 'rgba(180,140,60,0.25)', iconColor: '#b48c3c', label: 'Compromisos', value: `${stats?.pending_commitments ?? 0} pendientes` },
                ].map((m, i) => (
                  <div key={i} className="flex items-center p-3 rounded-2xl border hover:opacity-90 transition-all cursor-default"
                    style={{ background: 'rgba(6,18,34,0.5)', borderColor: '#1a2d42' }}>
                    <div className="p-2.5 rounded-xl mr-4 flex items-center justify-center border" style={{ background: m.iconBg, borderColor: m.iconBorder, color: m.iconColor }}>
                      {m.icon}
                    </div>
                    <div>
                      <span className="font-semibold block text-sm text-white">{m.label}</span>
                      <span className="text-xs font-mono" style={{ color: '#5a7a94' }}>{m.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* AI Provider */}
            <section className="rounded-3xl p-4 flex-grow" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#7a9ab5' }}>
                PROVEEDOR IA
              </h3>
              <div className="space-y-3">
                {([
                  { key: 'builtin-ai' as const, label: 'Local (En tu máquina)', sub: 'Proveedor:' },
                  { key: 'ollama' as const, label: 'Ollama Models', sub: 'Ollama Local:' },
                  { key: 'openrouter' as const, label: 'OpenRouter', sub: 'Nube flexible:' },
                  { key: 'claude' as const, label: 'Claude AI', sub: 'Nube Premium:' },
                  { key: 'openai' as const, label: 'OpenAI / ChatGPT', sub: 'Nube:' },
                  { key: 'groq' as const, label: 'Groq', sub: 'Nube rápida:' },
                ] as const).map((p, i) => {
                  const cloudProvider = p.key === 'openrouter' || p.key === 'openai' || p.key === 'claude' || p.key === 'groq';
                  const isConfigured = !cloudProvider || Boolean(providerApiKeyStatus[p.key as keyof typeof providerApiKeyStatus]);
                  const isActive = activeModel === p.key && isConfigured;
                  const needsLocalSetup = p.key === 'ollama'
                    && modelOptions.ollama.length === 0
                    && !getLocalFallbackModel('ollama');
                  return (
                  <div key={p.key} className={`flex items-center justify-between gap-3 ${i === 2 ? 'border-t pt-4' : ''}`} style={i === 2 ? { borderColor: '#1a2d42' } : undefined}>
                    <div>
                      <span className="text-xs block" style={{ color: '#5a7a94' }}>{p.sub}</span>
                      <span className="text-sm font-medium text-white">{p.label}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (cloudProvider && !providerApiKeyStatus[p.key as keyof typeof providerApiKeyStatus]) openPersonalizar(p.key);
                        else selectProvider(p.key);
                      }}
                      className="flex items-center text-[10px] px-3 py-1 rounded-full font-bold transition-all border"
                      style={isActive
                        ? { background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderColor: 'rgba(74,222,128,0.4)' }
                        : { background: '#061222', borderColor: '#1a2d42', color: '#5a7a94' }
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: isActive ? '#4ade80' : '#2a3a4a' }}></span>
                      {!isConfigured ? 'Por configurar' : isActive ? 'Activo' : needsLocalSetup ? 'Configurar' : 'Seleccionar'}
                    </button>
                  </div>
                  );
                })}
                <button type="button" onClick={() => openPersonalizar()} className="w-full rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors hover:bg-white/5" style={{ borderColor: '#447794', color: '#8db4cc' }}>
                  Personalizar IA
                </button>
              </div>
            </section>
          </div>

          {/* CENTER — Mic Button */}
          <div className="col-span-1 xl:col-span-5 flex flex-col items-center justify-center min-w-0">
            <section className="rounded-3xl w-full min-h-[420px] flex flex-col items-center justify-evenly p-8 sm:p-12 relative overflow-hidden group"
              style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(68,119,148,0.06), transparent)' }}></div>

              <h2 className="text-lg font-heading font-bold tracking-widest uppercase relative z-10 pt-4" style={{ color: '#7a9ab5' }}>EMPIEZA A GRABAR</h2>

              <button type="button" onClick={onStartNewRecording} aria-label="Empezar a grabar" className="group relative cursor-pointer flex flex-col items-center justify-center bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-full z-10">
                <div className="absolute w-52 h-52 rounded-full animate-pulse-impulso" style={{ background: 'rgba(68,119,148,0.1)' }}></div>
                <div className="absolute w-40 h-40 rounded-full animate-pulse opacity-50" style={{ background: 'rgba(68,119,148,0.2)' }}></div>
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center border-4 transition-transform duration-500 group-hover:scale-110 relative"
                  style={{ background: '#447794', boxShadow: '0 0 50px rgba(68,119,148,0.45)', borderColor: 'rgba(68,119,148,0.35)' }}
                >
                  <svg className="w-10 h-10" fill="none" stroke="#061222" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </button>

              <button type="button" onClick={onImportAudioClick} aria-label="Importar audio" className="mt-8 text-center group cursor-pointer relative z-10 bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-2xl">
                <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center border transition-colors group-hover:border-impulso-baltic"
                  style={{ background: '#061222', borderColor: '#1a2d42' }}>
                  <Upload className="w-6 h-6 transition-colors" style={{ color: '#5a7a94' }} />
                </div>
                <p className="font-medium transition-colors" style={{ color: '#5a7a94' }}>Importar Audio</p>
              </button>
            </section>
          </div>

          {/* RIGHT — Search & Sessions */}
          <div className="col-span-1 xl:col-span-4 space-y-6 flex flex-col min-w-0">
            <div className="relative">
              <input
                className="w-full rounded-2xl py-4 px-12 text-sm transition-all focus:outline-none"
                placeholder="Busca contenido de tus reuniones"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ background: '#0d1f33', border: '1px solid #1a2d42', color: '#e2e8f0', caretColor: '#447794' }}
              />
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#5a7a94' }} />
            </div>

            <section className="rounded-3xl p-6 sm:p-8 flex flex-col glow-border-impulso" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <div className="flex items-center justify-between mb-8 flex-shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#7a9ab5' }}>
                  {searchQuery.trim() ? t('search.results_title') : 'ÚLTIMAS SESIONES'}
                </h3>
              </div>

              {isSearching ? (
                <div className="text-center py-10 text-sm" style={{ color: '#5a7a94' }}>{t('search.searching')}</div>
              ) : searchQuery.trim() && filteredSessions.length === 0 && searchResults.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: '#5a7a94' }}>
                  {t('search.no_results_for').replace('{query}', searchQuery.trim())}
                </div>
              ) : (
                <div className="space-y-5 pr-1">
                  {filteredSessions.length > 0 && <ul className="space-y-4">
                    {filteredSessions.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        aria-label={`Abrir reunión ${session.title}`}
                        className="w-full text-left flex flex-col gap-1 p-4 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        style={{ background: '#0a1628', borderColor: '#1a2d42' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(68,119,148,0.5)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1a2d42')}
                      >
                        <span className="text-[10px] font-mono" style={{ color: '#5a7a94' }}>{formatDate(session.createdAt)}</span>
                        <span className="font-bold text-sm text-white hover:text-impulso-baltic transition-colors mt-1">
                          {session.title}
                        </span>
                      </button>
                    </li>
                    ))}
                  </ul>}
                  {searchQuery.trim() && searchResults.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#7a9ab5' }}>{t('search.transcript_matches')}</h4>
                      <ul className="space-y-3">
                        {searchResults.map((hit, index) => (
                          <li key={`${hit.id}-${hit.timestamp}-${index}`}>
                            <button type="button" onClick={() => onSelectSession(hit.id)} aria-label={`Abrir reunión ${hit.title}`} className="w-full text-left p-4 rounded-2xl border transition-all hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40" style={{ background: '#0a1628', borderColor: '#1a2d42' }}>
                              <span className="block font-bold text-sm text-white mb-2">{hit.title}</span>
                              <span className="block text-[10px] font-mono mb-1" style={{ color: '#8db4cc' }}>{formatSearchTimestamp(hit.timestamp)}</span>
                              <span className="block text-xs leading-relaxed" style={{ color: '#9eb3c4' }}>
                                {splitHighlightedText(hit.matchContext, searchQuery).map((part, partIndex) => part.highlighted
                                  ? <mark key={partIndex} className="text-inherit rounded px-0.5" style={{ background: 'rgba(68,119,148,0.3)', color: 'inherit' }}>{part.text}</mark>
                                  : <React.Fragment key={partIndex}>{part.text}</React.Fragment>)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

        </div>
      </main>
      <footer className="px-8 py-4 text-center text-[11px] flex-shrink-0" style={{ color: '#5a7a94' }}>
        {t('brand.developed_by')}
      </footer>
      <PersonalizarIAModal open={personalizarOpen} onOpenChange={setPersonalizarOpen} initialProvider={personalizarProvider} />
    </div>
  );
}
