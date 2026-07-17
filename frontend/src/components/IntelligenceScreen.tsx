'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Mic, Square, Sparkles, Check, Plus, Edit2, Lightbulb, Save, Pause, Play,
  ListTodo, FileText, Sliders, LayoutTemplate,
  Lock, Eye, EyeOff, Info, Download, HelpCircle, Trash2, RefreshCw,
  Search, X, MessageSquare,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { recordingService } from '@/services/recordingService';
import { useTemplates } from '@/hooks/meeting-details/useTemplates';
import { TemplateManagerDialog } from '@/components/MeetingDetails/TemplateManagerDialog';
import HubTopNav from '@/components/HubTopNav';
import { SummaryModelSelector } from '@/components/SummaryModelSelector';
import { CURATED_SUMMARY_MODELS } from '@/lib/summaryModelCatalog';
import type { ModelConfig } from '@/services/configService';
import { invalidateSummaryModelCatalog } from '@/hooks/useSummaryModelCatalog';
import { splitHighlightedText } from '@/lib/dashboardSearch';
import { MeetingChat } from '@/components/MeetingChat';

interface TranscriptLine {
  id: string;
  speaker?: string;
  timestamp: string;
  text: string;
}

interface IntelligenceScreenProps {
  meetingId: string;
  meetingTitle: string;
  onBackToDashboard: () => void;
  onOpenSettings: () => void;
  onMeetingTitleUpdated?: (title: string) => void;
  isRecording: boolean;
  onRecordingStop: () => void;
  onRecordingStart: () => void;
  isRecordingDisabled: boolean;
  barHeights: string[];
}

/* ─── Brand tokens (design.md) ───
   Baltic Blue  #447794  — primary / CTA
   Ocean Teal   #2D5B75  — secondary / active
   Navy Ink     #123249  — text / nav / dark surfaces
   Obsidian     #061222  — premium dark bg
   Fonts: Inter (body), Jost (headings)                    */

// Format a recording-relative time (seconds) as [MM:SS], falling back to a raw timestamp.
const formatTime = (seconds: unknown, fallback = '00:00'): string => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return fallback;
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export default function IntelligenceScreen({
  meetingId,
  meetingTitle,
  onBackToDashboard,
  onOpenSettings,
  onMeetingTitleUpdated,
  isRecording,
  onRecordingStop,
  onRecordingStart,
  isRecordingDisabled,
  barHeights
}: IntelligenceScreenProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'resumen' | 'auto' | 'modelo' | 'plantilla'>('resumen');
  const [copied, setCopied] = useState(false);
  // Transcripts loaded from the database for an existing (saved) meeting.
  const [dbTranscripts, setDbTranscripts] = useState<TranscriptLine[]>([]);
  const [meetingDetails, setMeetingDetails] = useState<any>(null);
  const [editingTranscriptId, setEditingTranscriptId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Inline meeting-name editing. Only editable for saved meetings — live
  // recordings own their title through the recording pipeline.
  const [editingTitle, setEditingTitle] = useState(false);

  // Transcript search within the "Detalles" panel — reuses the same highlight
  // helper as the Home search so matching words are visually consistent.
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [titleDraft, setTitleDraft] = useState(meetingTitle);
  useEffect(() => { setTitleDraft(meetingTitle); }, [meetingTitle]);

  const canEditTitle = !!meetingId && meetingId !== 'intro-call' && !isRecording;

  const commitTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === meetingTitle) {
      setEditingTitle(false);
      setTitleDraft(meetingTitle);
      return;
    }
    try {
      await invoke('api_save_meeting_title', { meetingId, title: next });
      onMeetingTitleUpdated?.(next);
      toast.success('Nombre de reunión actualizado.');
    } catch (error) {
      toast.error('No se pudo actualizar el nombre.');
      console.error('rename meeting failed:', error);
      setTitleDraft(meetingTitle);
    } finally {
      setEditingTitle(false);
    }
  };

  // Live transcripts stream through the TranscriptContext while recording.
  const { transcripts: liveTranscriptsRaw } = useTranscripts();

  // Pause/resume state comes from the global recording state (synced with the tray).
  const { isPaused } = useRecordingState();
  const [isTogglingPause, setIsTogglingPause] = useState(false);

  const handleTogglePause = async () => {
    if (isTogglingPause) return;
    setIsTogglingPause(true);
    try {
      if (isPaused) await recordingService.resumeRecording();
      else await recordingService.pauseRecording();
    } catch (error) {
      toast.error('No se pudo ' + (isPaused ? 'reanudar' : 'pausar') + ' la grabación.');
      console.error('pause/resume failed:', error);
    } finally {
      setIsTogglingPause(false);
    }
  };

  // Summary
  const [summaryText, setSummaryText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const summaryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Model (whisperModel is preserved so saving the LLM config never clobbers it)
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ provider: 'builtin-ai', model: '', whisperModel: 'large-v3', apiKey: '', apiKeyConfigured: false, ollamaEndpoint: '' });
  // API key input UX: show/hide toggle + saved-lock indicator (users don't accidentally reveal their key).
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyLocked, setApiKeyLocked] = useState(true); // Locked once loaded from backend; unlock to edit
  const [showProviderHelp, setShowProviderHelp] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);

  // Available built-in models for one-click download (mirrors the summary engine registry).
  interface BuiltInModelItem {
    name: string;
    display_name: string;
    status: { type: 'not_downloaded' | 'downloading' | 'available' | 'corrupted' | 'error'; progress?: number };
    size_mb: number;
    description: string;
  }
  const [builtInModels, setBuiltInModels] = useState<BuiltInModelItem[]>([]);
  const [downloadingProgress, setDownloadingProgress] = useState<Record<string, number>>({});

  // Commitments extracted from this meeting's summary (auto-generated by the LLM).
  interface CommitmentItem {
    id: string;
    meeting_id: string;
    meeting_title: string;
    responsible: string | null;
    description: string;
    due_date: string | null;
    status: string;
  }
  const [meetingCommitments, setMeetingCommitments] = useState<CommitmentItem[]>([]);

  // Templates: reuse the existing hook so create/edit/delete goes through the
  // same code path as the legacy Meeting Details page (single source of truth).
  const {
    availableTemplates: templates,
    selectedTemplate,
    setSelectedTemplate,
    getTemplateDetails,
    saveCustomTemplate,
    deleteCustomTemplate,
    handleTemplateSelection,
    refreshTemplates,
  } = useTemplates();
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  // Chatbot — only available for saved meetings (not live recordings)
  const [showChat, setShowChat] = useState(false);

  // A "live" view means a brand-new recording or one that is currently recording;
  // in that case the meeting is not yet in the database, so we read from context.
  const isLive = isRecording || meetingId === 'intro-call' || !meetingId;

  const displayTranscripts: TranscriptLine[] = isLive
    ? liveTranscriptsRaw.map((t, i) => ({
        id: t.id || String(i),
        speaker: t.speaker || 'Hablante',
        timestamp: formatTime(t.audio_start_time, t.timestamp || '00:00'),
        text: t.text,
      }))
    : dbTranscripts;

  // Filtered transcript search results for the "Detalles" panel.
  const transcriptSearchResults = React.useMemo(() => {
    const needle = transcriptSearch.trim().toLowerCase();
    if (!needle) return [];
    return displayTranscripts
      .filter((t) => t.text.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [transcriptSearch, displayTranscripts]);

  const loadMeetingDetails = async () => {
    if (!meetingId || meetingId === 'intro-call') return;
    try {
      const details = await invoke<any>('api_get_meeting', { meetingId });
      setMeetingDetails(details);
      if (details.transcripts) {
        setDbTranscripts(details.transcripts.map((t: any) => ({
          id: t.id || Math.random().toString(),
          speaker: t.speaker || 'Hablante',
          timestamp: formatTime(t.audio_start_time, t.timestamp || '00:00'),
          text: t.text
        })));
      }
      const summaryRes = await invoke<any>('api_get_summary', { meetingId });
      if (summaryRes?.data) {
        const d = summaryRes.data;
        if (typeof d === 'string') {
          try { const p = JSON.parse(d); setSummaryText(p.markdown || JSON.stringify(p)); } catch { setSummaryText(d); }
        } else { setSummaryText(d.markdown || JSON.stringify(d)); }
      } else { setSummaryText(''); }

      // Load commitments extracted for this meeting so the COMPROMISOS tab isn't empty.
      try {
        const items = await invoke<CommitmentItem[]>('api_get_meeting_commitments', { meetingId });
        setMeetingCommitments(items || []);
      } catch (err) { console.warn('Failed to load commitments for meeting:', err); }
    } catch (error) { console.error('Error loading meeting details:', error); }
  };

  // Only the model config needs to be loaded here — useTemplates() takes care of
  // fetching + refreshing the template list on mount and after edits.
  const loadModelConfig = async () => {
    try {
      const config = await invoke<any>('api_get_model_config');
      if (config) {
        setModelConfig({
          provider: config.provider || 'builtin-ai',
          model: config.model || '',
          whisperModel: config.whisperModel || 'large-v3',
          apiKey: '',
          apiKeyConfigured: Boolean(config.apiKeyConfigured),
          ollamaEndpoint: config.ollamaEndpoint || '',
        });
        // If we loaded a saved API key, keep it hidden and locked by default.
        setApiKeyLocked(false);
      }
    } catch (error) { console.error('Error loading model config:', error); }
  };

  const refreshBuiltInModels = async () => {
    try {
      const list = await invoke<BuiltInModelItem[]>('builtin_ai_list_models');
      setBuiltInModels(list ?? []);
    } catch (error) { console.error('Failed to load built-in models:', error); }
  };

  const handleDownloadBuiltInModel = async (name: string) => {
    try {
      toast.info(`Descarga iniciada: ${name}`);
      await invoke('builtin_ai_download_model', { modelName: name });
      await refreshBuiltInModels();
    } catch (error) {
      toast.error(`No se pudo descargar ${name}.`);
      console.error('download model failed:', error);
    }
  };

  const handleDeleteBuiltInModel = async (name: string) => {
    try {
      await invoke('builtin_ai_delete_model', { modelName: name });
      toast.success(`${name} eliminado.`);
      await refreshBuiltInModels();
    } catch (error) {
      toast.error(`No se pudo eliminar ${name}.`);
      console.error('delete model failed:', error);
    }
  };

  useEffect(() => { loadMeetingDetails(); loadModelConfig(); refreshBuiltInModels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [meetingId]);

  // Listen to backend download-progress events so the built-in model tiles
  // reflect live progress without polling.
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      try {
        unlistenFn = await listen<any>('builtin-ai-download-progress', (event) => {
          const { model, progress, status } = event.payload || {};
          if (typeof model === 'string' && typeof progress === 'number') {
            setDownloadingProgress((prev) => ({ ...prev, [model]: progress }));
          }
          if (status === 'completed' || status === 'error' || progress === 100) {
            refreshBuiltInModels();
          }
        });
      } catch (error) { console.error('download progress listener failed:', error); }
    })();
    return () => { if (unlistenFn) unlistenFn(); };
  }, []);

  // Clean up any pending summary polling interval on unmount.
  useEffect(() => () => { if (summaryPollRef.current) clearInterval(summaryPollRef.current); }, []);

  const handleSaveModelConfig = async () => {
    if (isSavingModel) return;
    setIsSavingModel(true);
    try {
      const apiKey = modelConfig.apiKey?.trim() || null;
      await invoke('api_save_model_config', {
        provider: modelConfig.provider,
        model: modelConfig.model,
        whisperModel: modelConfig.whisperModel || 'large-v3',
        apiKey,
        ollamaEndpoint: modelConfig.ollamaEndpoint || null,
      });
      if (['claude', 'groq', 'openai', 'openrouter', 'builtin-ai'].includes(modelConfig.provider)) {
        invalidateSummaryModelCatalog(modelConfig.provider as 'claude' | 'groq' | 'openai' | 'openrouter' | 'builtin-ai');
      }
      toast.success('Configuración de modelo guardada.');
      setModelConfig(prev => ({ ...prev, apiKey: '', apiKeyConfigured: Boolean(apiKey) || Boolean(prev.apiKeyConfigured) }));
      setApiKeyLocked(false);
      setShowApiKey(false);
    } catch { toast.error('Error al guardar configuración.'); }
    finally { setIsSavingModel(false); }
  };

  // Provider-aware helpers so the UI shows only what each provider actually needs
  // (users shouldn't have to know about endpoints or model IDs).
  const providerNeedsApiKey = ['claude', 'groq', 'openai', 'openrouter'].includes(modelConfig.provider);
  const providerNeedsEndpoint = modelConfig.provider === 'ollama';
  const providerIsLocal = modelConfig.provider === 'builtin-ai';

  const PROVIDERS: Array<{ id: string; label: string; hint: string; premium?: boolean }> = [
    { id: 'builtin-ai', label: 'Local (Recomendado)', hint: '100% privado, sin internet ni claves.' },
    { id: 'ollama', label: 'Ollama', hint: 'Modelos locales avanzados. Requiere Ollama instalado.' },
    { id: 'openrouter', label: 'OpenRouter', hint: 'Acceso a Claude, Gemini, GPT y más con una sola clave.', premium: true },
    { id: 'claude', label: 'Anthropic Claude', hint: 'Alta calidad. Requiere API Key.', premium: true },
    { id: 'openai', label: 'OpenAI', hint: 'GPT-4, GPT-4o, etc. Requiere API Key.', premium: true },
    { id: 'groq', label: 'Groq', hint: 'Muy rápido. Requiere API Key.', premium: true },
  ];

  const handleGenerateSummary = async () => {
    if (isGenerating) return;
    if (isLive) {
      toast.error('Detén y guarda la grabación antes de generar un resumen.');
      return;
    }
    if (!modelConfig.model && (modelConfig.provider === 'builtin-ai' || modelConfig.provider === 'ollama')) {
      toast.error('Selecciona un modelo en la pestaña MODELO antes de generar.');
      setActiveTab('modelo');
      return;
    }
    setIsGenerating(true);
    try {
      // Fetch the full transcript for this meeting from the database.
      const page = await invoke<any>('api_get_meeting_transcripts', { meetingId, limit: 100000, offset: 0 });
      const segs: any[] = page?.transcripts ?? [];
      if (!segs.length) {
        toast.error('No hay transcripciones para resumir.');
        setIsGenerating(false);
        return;
      }
      const text = segs.map((s) => {
        const ts = formatTime(s.audio_start_time, s.timestamp || '');
        const speaker = s.speaker ? ` ${s.speaker}:` : '';
        return `[${ts}]${speaker} ${s.text}`.trim();
      }).join('\n');

      await invoke<any>('api_process_transcript', {
        text,
        model: modelConfig.provider,
        modelName: modelConfig.model,
        meetingId,
        chunkSize: 40000,
        overlap: 1000,
        customPrompt: customPrompt || null,
        templateId: selectedTemplate || 'minuta_corporativa',
        summaryLanguage: null,
      });

      // Poll the stored summary until the backend marks it completed or failed.
      if (summaryPollRef.current) clearInterval(summaryPollRef.current);
      summaryPollRef.current = setInterval(async () => {
        try {
          const s = await invoke<any>('api_get_summary', { meetingId });
          if (s.status === 'completed') {
            if (summaryPollRef.current) clearInterval(summaryPollRef.current);
            setIsGenerating(false);
            loadMeetingDetails();
            toast.success('Resumen generado.');
          } else if (s.status === 'error' || s.status === 'failed') {
            if (summaryPollRef.current) clearInterval(summaryPollRef.current);
            setIsGenerating(false);
            toast.error('Error al generar el resumen: ' + (s.error || 'desconocido'));
          }
        } catch {
          if (summaryPollRef.current) clearInterval(summaryPollRef.current);
          setIsGenerating(false);
        }
      }, 2500);
    } catch (error) {
      setIsGenerating(false);
      toast.error('Error al iniciar la generación: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleCopyTranscripts = () => {
    navigator.clipboard.writeText(displayTranscripts.map(t => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Inline transcript editing only applies to saved meetings. There is no backend
  // command to persist a single edited segment, so edits update the local view only.
  const saveTranscriptEdit = (id: string) => {
    setDbTranscripts(prev => prev.map(t => t.id === id ? { ...t, text: editingText } : t));
    setEditingTranscriptId(null);
    toast.success('Línea actualizada.');
  };

  const handleAddParticipant = (e: React.FormEvent) => { e.preventDefault(); if (!newParticipant.trim()) return; setParticipants([...participants, newParticipant.trim()]); setNewParticipant(''); setShowAddParticipant(false); };
  const handleRemoveParticipant = (idx: number) => { const u = [...participants]; u.splice(idx, 1); setParticipants(u); };

  // Shared style constants
  const cardBg = '#0d1f33';
  const panelBorder = '#1a2d42';
  const surfaceBg = 'rgba(6,18,34,0.5)';
  const mutedText = '#5a7a94';
  const labelText = '#7a9ab5';
  const baltic = '#447794';
  const obsidian = '#061222';

  return (
    <div className="bg-grid-subtle h-dvh font-sans flex flex-col relative overflow-hidden" style={{ background: `radial-gradient(circle at center, #0a1628 0%, ${obsidian} 100%)`, color: '#e2e8f0' }}>

      <HubTopNav
        showVolver
        onVolver={onBackToDashboard}
        onOpenSettings={onOpenSettings}
      />

      {/* ── Workspace ── */}
      <main className="flex-1 min-h-0 px-4 py-6 sm:px-6 xl:px-8 max-w-[1600px] mx-auto w-full grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8 overflow-y-hidden">

        {/* LEFT — Transcript */}
        <section className="col-span-1 xl:col-span-4 flex flex-col rounded-3xl p-6 glow-border-impulso min-w-0 overflow-hidden" style={{ background: cardBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: `1px solid rgba(26,45,66,0.6)` }}>
            <h2 className="text-md font-heading font-bold tracking-tight text-white truncate max-w-[150px]">Transcripción</h2>
            <div className="flex items-center space-x-2">
              <button type="button" onClick={handleCopyTranscripts} aria-label="Copiar transcripción" className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer border focus-visible:ring-2 focus-visible:ring-white/40"
                style={{ background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                {copied ? <Check className="w-3 h-3" style={{ color: baltic }} /> : <Copy className="w-3 h-3" style={{ color: mutedText }} />}
                <span>COPIAR</span>
              </button>
              {isRecording && (
                <button type="button" onClick={handleTogglePause} disabled={isTogglingPause}
                  aria-label={isPaused ? 'Reanudar grabación' : 'Pausar grabación'}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                  {isPaused ? <Play className="w-3 h-3" style={{ color: baltic }} /> : <Pause className="w-3 h-3" style={{ color: mutedText }} />}
                  <span>{isPaused ? 'REANUDAR' : 'PAUSAR'}</span>
                </button>
              )}
              <button type="button" onClick={isRecording ? onRecordingStop : onRecordingStart} disabled={isRecordingDisabled}
                aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/40"
                style={isRecording
                  ? { background: 'rgba(180,60,60,0.25)', borderColor: 'rgba(180,60,60,0.5)', color: '#e88' }
                  : { background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                {isRecording
                  ? <Square className="w-3 h-3 animate-pulse" style={{ color: '#e88' }} />
                  : <Mic className="w-3 h-3" style={{ color: mutedText }} />}
                <span>{isRecording ? 'DETENER' : 'GRABAR'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
            {displayTranscripts.length === 0 ? (
              <div className="text-center py-20 text-sm" style={{ color: mutedText }}>
                {isRecording ? 'Escuchando… la transcripción aparecerá aquí.' : 'No hay transcripciones aún.'}
              </div>
            ) : displayTranscripts.map((t) => (
              <div key={t.id} className="group relative space-y-1">
                <div className="flex items-center justify-between text-[10px]" style={{ color: mutedText }}>
                  <span className="font-mono tracking-wider uppercase truncate mr-2">[{t.timestamp}] {t.speaker}:</span>
                  {!isLive && (
                    <button type="button" aria-label="Editar línea" onClick={() => { setEditingTranscriptId(t.id); setEditingText(t.text); }} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1" style={{ color: baltic }}>
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {editingTranscriptId === t.id ? (
                  <div className="space-y-2 p-3 rounded-2xl" style={{ background: obsidian, border: `1px solid ${baltic}` }}>
                    <textarea aria-label="Editar texto de la línea" className="w-full text-xs rounded-xl p-2.5 focus:outline-none" rows={3} value={editingText} onChange={(e) => setEditingText(e.target.value)}
                      style={{ background: cardBg, border: `1px solid ${panelBorder}`, color: '#e2e8f0' }} />
                    <div className="flex justify-end space-x-2">
                      <button type="button" onClick={() => setEditingTranscriptId(null)} className="px-2.5 py-1 text-[9px] font-bold rounded-lg" style={{ background: '#1a2d42', color: '#c1d0dc' }}>Cancelar</button>
                      <button type="button" onClick={() => saveTranscriptEdit(t.id)} className="px-2.5 py-1 text-[9px] font-bold rounded-lg" style={{ background: baltic, color: obsidian }}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed p-3.5 rounded-2xl border transition-all" style={{ background: surfaceBg, borderColor: panelBorder, color: '#c1d0dc' }}>
                    {t.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CENTER — Details */}
        <section className="col-span-1 xl:col-span-3 flex flex-col space-y-6 min-w-0 overflow-hidden">
          <div className="rounded-3xl p-6 flex flex-col flex-grow min-h-0" style={{ background: cardBg, border: `1px solid ${panelBorder}` }}>
            <h2 className="text-md font-heading font-bold text-white tracking-tight mb-6 pb-2 flex-shrink-0" style={{ borderBottom: `1px solid rgba(26,45,66,0.6)` }}>Detalles</h2>
            <div className="space-y-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Nombre</span>
                {editingTitle && canEditTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.currentTarget.blur(); }
                      if (e.key === 'Escape') { setTitleDraft(meetingTitle); setEditingTitle(false); }
                    }}
                    aria-label="Editar nombre de la reunión"
                    className="w-full text-xs p-3.5 rounded-2xl border font-bold text-white focus:outline-none"
                    style={{ background: surfaceBg, borderColor: baltic }}
                  />
                ) : (
                  <div className="group flex items-center gap-2">
                    <p className="flex-1 text-xs p-3.5 rounded-2xl border font-bold text-white truncate" style={{ background: surfaceBg, borderColor: panelBorder }} title={meetingTitle}>{meetingTitle}</p>
                    {canEditTitle && (
                      <button type="button" aria-label="Editar nombre" onClick={() => setEditingTitle(true)}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-lg border bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        style={{ borderColor: panelBorder, color: baltic }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Fecha</span>
                <p className="text-xs font-mono px-3.5 py-2.5 rounded-2xl border" style={{ background: surfaceBg, borderColor: panelBorder, color: '#c1d0dc' }}>
                  {meetingDetails?.created_at ? new Date(meetingDetails.created_at).toLocaleString() : 'Grabación nueva'}
                </p>
              </div>
              {/* Buscador de palabras en la transcripción */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Buscar en transcripción</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2" style={{ color: mutedText }} />
                  <input
                    type="text"
                    aria-label="Buscar en la transcripción"
                    placeholder="Escribe una palabra..."
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-8 py-2.5 rounded-2xl border focus:outline-none"
                    style={{ background: surfaceBg, borderColor: panelBorder, color: '#e2e8f0', caretColor: baltic }}
                  />
                  {transcriptSearch && (
                    <button type="button" aria-label="Limpiar búsqueda" onClick={() => setTranscriptSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors hover:bg-white/10"
                      style={{ color: mutedText }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {transcriptSearch.trim() && (
                  <p className="text-[10px] mt-1.5" style={{ color: mutedText }}>
                    {transcriptSearchResults.length} coincidencia{transcriptSearchResults.length !== 1 ? 's' : ''}
                  </p>
                )}
                {transcriptSearchResults.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                    {transcriptSearchResults.map((t) => (
                      <div key={t.id} className="text-[10px] p-2.5 rounded-xl border" style={{ background: obsidian, borderColor: panelBorder }}>
                        <span className="font-mono tracking-wider uppercase block mb-1" style={{ color: mutedText }}>[{t.timestamp}] {t.speaker}:</span>
                        <p style={{ color: '#c1d0dc', lineHeight: 1.4 }}>
                          {splitHighlightedText(t.text, transcriptSearch).map((part, i) => (
                            <span key={i} style={part.highlighted ? { background: 'rgba(68,119,148,0.3)', color: '#e2e8f0', borderRadius: '2px', padding: '0 1px' } : undefined}>
                              {part.text}
                            </span>
                          ))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Participantes</span>
                <div className="flex flex-wrap gap-1.5">
                  {participants.length === 0 ? <span className="text-[10px] italic" style={{ color: mutedText }}>Sin participantes</span> : participants.map((p, i) => (
                    <span key={i} className="inline-flex items-center text-[10px] px-2 py-1 rounded-lg border" style={{ background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                      {p}<button type="button" aria-label={`Quitar participante ${p}`} onClick={() => handleRemoveParticipant(i)} className="ml-1" style={{ color: mutedText }}>×</button>
                    </span>
                  ))}
                </div>
                {showAddParticipant ? (
                  <form onSubmit={handleAddParticipant} className="flex gap-2 mt-2">
                    <input type="text" aria-label="Nombre del participante" placeholder="Nombre..." value={newParticipant} onChange={(e) => setNewParticipant(e.target.value)}
                      className="text-xs rounded-xl px-2 py-1.5 w-full focus:outline-none" style={{ background: obsidian, border: `1px solid ${panelBorder}`, color: '#e2e8f0' }} />
                    <button type="submit" className="text-xs font-bold px-3 py-1 rounded-xl" style={{ background: baltic, color: obsidian }}>OK</button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setShowAddParticipant(true)} className="flex items-center space-x-1.5 text-xs mt-2 bg-transparent border-none cursor-pointer" style={{ color: baltic }}>
                    <Plus className="w-3.5 h-3.5" /><span>Agregar</span>
                  </button>
                )}
              </div>

              {/* Chatbot — Preguntar a la reunión */}
              {!isLive && displayTranscripts.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Asistente IA</span>
                  {!showChat ? (
                    <button
                      type="button"
                      onClick={() => setShowChat(true)}
                      className="flex items-center space-x-1.5 text-xs w-full p-3 rounded-2xl border transition-colors hover:bg-white/5"
                      style={{ background: obsidian, borderColor: panelBorder, color: baltic }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Preguntar a la reunión</span>
                    </button>
                  ) : (
                    <div className="rounded-2xl overflow-hidden flex-1 min-h-[400px] flex flex-col" style={{ border: `1px solid ${panelBorder}` }}>
                      <MeetingChat
                        meetingId={meetingId}
                        meetingTitle={meetingTitle}
                        onClose={() => setShowChat(false)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isRecording && (
            <div className="rounded-3xl p-6 flex flex-col justify-center items-center" style={{ background: cardBg, border: `1px solid ${panelBorder}` }}>
              <span className="text-[10px] font-bold uppercase tracking-widest block mb-4" style={{ color: mutedText }}>Señal de Audio</span>
              <div className="flex items-end justify-center space-x-1 h-12 w-full">
                {barHeights.map((h, i) => <div key={i} className="w-1.5 rounded-full transition-all duration-300" style={{ height: h, background: baltic }}></div>)}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT — Tabs */}
        <section className="col-span-1 xl:col-span-5 flex flex-col rounded-3xl p-6 glow-border-impulso min-w-0 overflow-hidden" style={{ background: cardBg, border: `1px solid ${panelBorder}` }}>
          {/* Icon-on-top tab bar — same visual grammar as the top navigation.
              Icons make the section scannable for users who don't read every label. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-3 mb-6" style={{ borderBottom: `1px solid rgba(26,45,66,0.6)` }} role="tablist">
            {([
              { key: 'resumen', icon: FileText, label: 'RESUMEN' },
              { key: 'auto', icon: ListTodo, label: 'COMPROMISOS' },
              { key: 'modelo', icon: Sliders, label: 'MODELO IA' },
              { key: 'plantilla', icon: LayoutTemplate, label: 'PLANTILLA' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}
                className="flex flex-col items-center justify-center gap-1 flex-1 min-w-[90px] py-2 rounded-xl transition-all cursor-pointer border focus-visible:ring-2 focus-visible:ring-white/40"
                style={activeTab === key
                  ? { background: `rgba(68,119,148,0.15)`, color: baltic, borderColor: `rgba(68,119,148,0.35)` }
                  : { background: 'transparent', color: mutedText, borderColor: 'transparent' }}>
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-bold tracking-wider">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
              {activeTab === 'resumen' && (
                <motion.div key="resumen" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4 flex-grow flex flex-col justify-between">
                  <div className="flex-grow">
                    {summaryText ? (
                      <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4" style={{ color: '#c1d0dc' }}>
                        {summaryText.split('\n').map((p, i) => <p key={i}>{p}</p>)}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-xs italic" style={{ color: mutedText }}>
                        {isGenerating ? 'Generando resumen...' : 'Sin resumen. Genera uno para esta reunión.'}
                      </div>
                    )}
                  </div>
                  <div className="pt-4 space-y-3" style={{ borderTop: `1px solid rgba(26,45,66,0.6)` }}>
                    <textarea aria-label="Instrucciones adicionales para la IA" placeholder="Instrucciones adicionales para la IA..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                      className="w-full text-xs rounded-2xl p-3 focus:outline-none" rows={2}
                      style={{ background: obsidian, border: `1px solid ${panelBorder}`, color: '#e2e8f0' }} />
                    <button type="button" onClick={handleGenerateSummary} disabled={isGenerating}
                      className="w-full font-bold py-3 rounded-2xl text-xs flex items-center justify-center space-x-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ background: baltic, color: obsidian }}>
                      <Sparkles className="w-4 h-4" />
                      <span>{isGenerating ? 'GENERANDO...' : 'GENERAR RESUMEN'}</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'auto' && (
                <motion.div key="auto" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4" style={{ color: '#b48c3c' }} /> Tareas y Compromisos
                    </h4>
                    <button type="button" onClick={() => router.push('/compromisos')}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ borderColor: panelBorder, color: baltic }}>
                      VER TODOS →
                    </button>
                  </div>

                  {meetingCommitments.length === 0 ? (
                    <div className="rounded-2xl border p-4 text-xs italic" style={{ background: surfaceBg, borderColor: panelBorder, color: mutedText }}>
                      {isLive || !summaryText
                        ? 'Genera un resumen para extraer compromisos automáticamente.'
                        : 'Esta reunión no tiene compromisos detectados por la IA.'}
                    </div>
                  ) : meetingCommitments.map((c) => (
                    <div key={c.id} className="rounded-2xl border p-3.5 space-y-2" style={{ background: surfaceBg, borderColor: panelBorder }}>
                      <p className="text-xs text-white leading-relaxed">{c.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{ background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                          👤 {c.responsible || 'Sin asignar'}
                        </span>
                        {c.due_date && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{ background: obsidian, borderColor: panelBorder, color: '#c1d0dc' }}>
                            📅 {c.due_date}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase" style={{
                          background: c.status === 'completed' ? 'rgba(68,119,148,0.2)' : c.status === 'in_progress' ? 'rgba(45,91,117,0.2)' : 'rgba(120,120,120,0.15)',
                          color: c.status === 'completed' ? baltic : c.status === 'in_progress' ? '#5a9ab5' : mutedText,
                        }}>
                          {c.status === 'completed' ? 'Completado' : c.status === 'in_progress' ? 'En curso' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'modelo' && (
                <motion.div key="modelo" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  {/* ── Provider picker as clickable cards — clearer than a hidden select for non-technical users ── */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: mutedText }}>¿Qué IA quieres usar?</span>
                    <button type="button" onClick={() => setShowProviderHelp(v => !v)}
                      aria-label="¿Cómo elegir proveedor?"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ borderColor: panelBorder, color: labelText }}>
                      <HelpCircle className="w-3 h-3" />
                      <span>¿Cómo elegir?</span>
                    </button>
                  </div>

                  {showProviderHelp && (
                    <div className="rounded-2xl border p-3.5 text-[11px] leading-relaxed" style={{ background: surfaceBg, borderColor: panelBorder, color: '#c1d0dc' }}>
                      <p className="font-bold mb-1" style={{ color: baltic }}>Local vs. Nube</p>
                      <p><span className="font-bold text-white">Local:</span> Tu audio y transcripciones nunca salen de tu computadora. Ideal para reuniones confidenciales. Necesita descargar un modelo una vez.</p>
                      <p className="mt-1.5"><span className="font-bold text-white">Nube (Claude, Gemini, GPT):</span> Mayor calidad de resumen. Requiere una clave API del proveedor. Los datos se envían al proveedor durante el resumen.</p>
                      <p className="mt-1.5" style={{ color: mutedText }}>Recomendación: comienza con <span className="font-bold" style={{ color: baltic }}>Local</span>. Si necesitas resúmenes más elaborados, prueba <span className="font-bold" style={{ color: baltic }}>OpenRouter</span> (incluye Gemini, Claude, GPT).</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {PROVIDERS.map(p => {
                      const active = modelConfig.provider === p.id;
                      return (
                        <button key={p.id} type="button"
                          onClick={() => {
                            const provider = p.id as ModelConfig['provider'];
                            const cloudDefault = provider in CURATED_SUMMARY_MODELS
                              ? CURATED_SUMMARY_MODELS[provider as keyof typeof CURATED_SUMMARY_MODELS][0]?.id || ''
                              : modelConfig.model;
                            setModelConfig({ ...modelConfig, provider, model: cloudDefault });
                          }}
                          aria-pressed={active}
                          className="text-left p-3 rounded-2xl border cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                          style={active
                            ? { background: `rgba(68,119,148,0.15)`, borderColor: `rgba(68,119,148,0.5)` }
                            : { background: surfaceBg, borderColor: panelBorder }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-white">{p.label}</span>
                            {active && <Check className="w-3.5 h-3.5" style={{ color: baltic }} />}
                          </div>
                          <p className="text-[10px] leading-snug" style={{ color: mutedText }}>{p.hint}</p>
                          {p.premium && (
                            <span className="inline-block mt-2 text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(180,140,60,0.15)', color: '#b48c3c' }}>
                              Requiere API Key
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Local: one-click download of the 4 built-in models ── */}
                  {providerIsLocal && (
                    <div className="rounded-2xl border p-4 space-y-2" style={{ background: surfaceBg, borderColor: panelBorder }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: mutedText }}>Modelos locales disponibles</span>
                        <button type="button" onClick={refreshBuiltInModels} aria-label="Actualizar lista"
                          className="p-1 rounded-lg bg-transparent cursor-pointer border outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                          style={{ borderColor: panelBorder, color: labelText }}>
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                      {builtInModels.length === 0 ? (
                        <p className="text-[11px] italic" style={{ color: mutedText }}>Cargando modelos disponibles…</p>
                      ) : builtInModels.map(m => {
                        const isDownloaded = m.status.type === 'available';
                        const isDownloading = m.status.type === 'downloading' || (downloadingProgress[m.name] !== undefined && downloadingProgress[m.name] < 100);
                        const progress = downloadingProgress[m.name] ?? m.status.progress ?? 0;
                        const isSelected = modelConfig.model === m.name;
                        return (
                          <div key={m.name} className="rounded-xl border p-3" style={{ background: obsidian, borderColor: isSelected ? baltic : panelBorder }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{m.display_name}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: mutedText }}>{Math.round(m.size_mb)} MB · {m.description}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isDownloaded && !isSelected && (
                                  <button type="button" onClick={() => setModelConfig({ ...modelConfig, model: m.name })}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer border"
                                    style={{ background: baltic, color: obsidian, borderColor: baltic }}>USAR</button>
                                )}
                                {isDownloaded && isSelected && (
                                  <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg" style={{ background: 'rgba(68,119,148,0.2)', color: baltic }}>EN USO</span>
                                )}
                                {!isDownloaded && !isDownloading && (
                                  <button type="button" onClick={() => handleDownloadBuiltInModel(m.name)} aria-label={`Descargar ${m.display_name}`}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer border"
                                    style={{ background: baltic, color: obsidian, borderColor: baltic }}>
                                    <Download className="w-3 h-3" /> DESCARGAR
                                  </button>
                                )}
                                {isDownloaded && (
                                  <button type="button" onClick={() => handleDeleteBuiltInModel(m.name)} aria-label={`Eliminar ${m.display_name}`}
                                    className="p-1.5 rounded-lg cursor-pointer border bg-transparent"
                                    style={{ borderColor: panelBorder, color: mutedText }}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isDownloading && (
                              <div className="mt-2">
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: panelBorder }}>
                                  <div className="h-full transition-all" style={{ width: `${progress}%`, background: baltic }} />
                                </div>
                                <p className="text-[9px] mt-1" style={{ color: mutedText }}>Descargando… {Math.round(progress)}%</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Ollama: needs local endpoint ── */}
                  {providerNeedsEndpoint && (
                    <>
                      <div>
                        <label htmlFor="ia-model" className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Modelo</label>
                        <input id="ia-model" type="text" value={modelConfig.model} onChange={(e) => setModelConfig({ ...modelConfig, model: e.target.value })}
                          placeholder="Ej. qwen2.5:latest, gemma3:1b" className="w-full text-xs rounded-xl p-3 focus:outline-none"
                          style={{ background: obsidian, border: `1px solid ${panelBorder}`, color: '#e2e8f0' }} />
                      </div>
                      <div>
                        <label htmlFor="ia-endpoint" className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Endpoint (avanzado)</label>
                        <input id="ia-endpoint" type="text" value={modelConfig.ollamaEndpoint || ''} onChange={(e) => setModelConfig({ ...modelConfig, ollamaEndpoint: e.target.value })}
                          placeholder="http://localhost:11434" className="w-full text-xs rounded-xl p-3 focus:outline-none"
                          style={{ background: obsidian, border: `1px solid ${panelBorder}`, color: '#e2e8f0' }} />
                      </div>
                    </>
                  )}

                  {/* ── Cloud providers: API key with lock + eye toggle, no endpoint required ── */}
                  {providerNeedsApiKey && (
                    <>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: mutedText }}>Modelo</label>
                        <SummaryModelSelector provider={modelConfig.provider as 'openrouter' | 'claude' | 'openai' | 'groq'} value={modelConfig.model} onValueChange={model => setModelConfig({ ...modelConfig, model })} />
                      </div>
                      <div>
                        <label htmlFor="ia-apikey" className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 flex items-center gap-1.5" style={{ color: mutedText }}>
                          <Lock className="w-3 h-3" /> Clave API
                        </label>
                        <div className="relative">
                          <input
                            id="ia-apikey"
                            type={showApiKey ? 'text' : 'password'}
                            value={modelConfig.apiKey || ''}
                            onChange={(e) => setModelConfig({ ...modelConfig, apiKey: e.target.value })}
                            readOnly={apiKeyLocked}
                            onDoubleClick={() => setApiKeyLocked(false)}
                            placeholder="Pega tu clave API aquí"
                            className="w-full text-xs rounded-xl p-3 pr-20 focus:outline-none"
                            style={{ background: obsidian, border: `1px solid ${apiKeyLocked ? panelBorder : baltic}`, color: '#e2e8f0' }} />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button type="button" onClick={() => setShowApiKey(v => !v)}
                              aria-label={showApiKey ? 'Ocultar clave' : 'Mostrar clave'}
                              className="p-1.5 rounded-lg bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                              style={{ color: mutedText }}>
                              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button type="button" onClick={() => setApiKeyLocked(v => !v)}
                              aria-label={apiKeyLocked ? 'Desbloquear para editar' : 'Bloquear'}
                              className="p-1.5 rounded-lg bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                              style={{ color: apiKeyLocked ? baltic : mutedText }}>
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] mt-1.5 flex items-center gap-1" style={{ color: mutedText }}>
                          <Info className="w-2.5 h-2.5" />
                          <span>{modelConfig.apiKeyConfigured ? 'Clave configurada en este equipo. Escribe una nueva para reemplazarla.' : 'La clave se guarda cifrada en tu equipo.'}</span>
                        </p>
                      </div>
                    </>
                  )}

                  <button type="button" onClick={handleSaveModelConfig} disabled={isSavingModel}
                    className="w-full font-bold py-3 rounded-2xl text-xs flex items-center justify-center space-x-2 transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white/40"
                    style={{ background: baltic, color: obsidian }}>
                    <Save className="w-4 h-4" /><span>{isSavingModel ? 'GUARDANDO…' : 'GUARDAR CONFIGURACIÓN'}</span>
                  </button>
                </motion.div>
              )}

              {activeTab === 'plantilla' && (
                <motion.div key="plantilla" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: mutedText }}>Elige o crea una plantilla</span>
                    <button type="button" onClick={() => setShowTemplateEditor(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer bg-transparent transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ borderColor: `rgba(68,119,148,0.4)`, color: baltic }}>
                      <Plus className="w-3 h-3" />
                      <span>NUEVA / EDITAR</span>
                    </button>
                  </div>

                  {templates.length === 0 ? (
                    <p className="text-xs italic" style={{ color: mutedText }}>Cargando plantillas...</p>
                  ) : templates.map((temp: any) => (
                    <button key={temp.id} type="button"
                      onClick={() => { handleTemplateSelection(temp.id, temp.name); }}
                      className="w-full text-left p-3.5 rounded-2xl cursor-pointer border transition-all focus-visible:ring-2 focus-visible:ring-white/40 relative"
                      style={{ background: surfaceBg, borderColor: selectedTemplate === temp.id ? baltic : panelBorder }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white">{temp.name}</h4>
                          <p className="text-[10px] mt-1" style={{ color: mutedText }}>{temp.description}</p>
                        </div>
                        {temp.is_custom && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(180,140,60,0.15)', color: '#b48c3c' }}>
                            Personalizada
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Template create/edit dialog (reused from the legacy Meeting Details flow
          so template management stays a single source of truth across the app). */}
      <TemplateManagerDialog
        open={showTemplateEditor}
        onOpenChange={setShowTemplateEditor}
        templates={templates}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={(id, name) => handleTemplateSelection(id, name)}
        getTemplateDetails={getTemplateDetails}
        saveCustomTemplate={saveCustomTemplate}
        deleteCustomTemplate={deleteCustomTemplate}
        onTemplatesUpdated={refreshTemplates}
      />
    </div>
  );
}
