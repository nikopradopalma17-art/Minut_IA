'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useConfig } from '@/contexts/ConfigContext';
import { StatusOverlays } from '@/app/_components/StatusOverlays';
import Analytics from '@/lib/analytics';
import { SettingsModals } from './_components/SettingsModal';
import { useModalState } from '@/hooks/useModalState';
import { useRecordingStateSync } from '@/hooks/useRecordingStateSync';
import { useRecordingStart } from '@/hooks/useRecordingStart';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { useTranscriptRecovery } from '@/hooks/useTranscriptRecovery';
import { TranscriptRecovery } from '@/components/TranscriptRecovery';
import { indexedDBService } from '@/services/indexedDBService';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { ModelConfig } from '@/services/configService';
import { recordingService } from '@/services/recordingService';
import { useImportDialog } from '@/contexts/ImportDialogContext';

import DashboardScreen from '@/components/DashboardScreen';
import IntelligenceScreen from '@/components/IntelligenceScreen';

type Screen = 'dashboard' | 'intelligence';

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [selectedMeetingTitle, setSelectedMeetingTitle] = useState<string>('');
  const [pendingMeetingId, setPendingMeetingId] = useState<string | null>(null);

  // Recording/transcription state
  const [isRecording, setIsRecordingState] = useState(false);
  const [barHeights, setBarHeights] = useState(['58%', '76%', '58%']);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  // Contexts
  const { meetingTitle } = useTranscripts();
  const { transcriptModelConfig, modelConfig, setModelConfig, selectedDevices } = useConfig();
  const recordingState = useRecordingState();
  const { status, isStopping, isProcessing, isSaving } = recordingState;

  // Hooks
  const { hasMicrophone } = usePermissionCheck();
  const { currentMeeting, setIsMeetingActive, refetchMeetings, meetings, setCurrentMeeting } = useSidebar();
  const { modals, messages, showModal, hideModal } = useModalState(transcriptModelConfig);
  const { isRecordingDisabled, setIsRecordingDisabled } = useRecordingStateSync(isRecording, setIsRecordingState, setIsMeetingActive);
  const { handleRecordingStart } = useRecordingStart(isRecording, setIsRecordingState, showModal);
  const { handleRecordingStop, setIsStopping } = useRecordingStop(setIsRecordingState, setIsRecordingDisabled, {
    // Keep the user inside the SPA after a recording is saved: open the saved
    // meeting in the Intelligence view instead of routing to /meeting-details.
    onMeetingSaved: (id, title) => {
      setSelectedMeetingId(id);
      setSelectedMeetingTitle(title);
      setActiveScreen('intelligence');
      refetchMeetings();
    },
  });
  const router = useRouter();
  const { openImportDialog } = useImportDialog();

  // Capture the hub deep-link id once. Resolution is separate because Sidebar
  // meetings can still be loading on the first Home render.
  useEffect(() => {
    const meetingId = new URLSearchParams(window.location.search).get('meeting');
    if (!meetingId) return;
    setPendingMeetingId(meetingId);
  }, []);

  useEffect(() => {
    if (!pendingMeetingId) return;
    const meeting = meetings.find((item) => item.id === pendingMeetingId);
    const preservedMeeting = currentMeeting?.id === pendingMeetingId ? currentMeeting : null;
    const title = meeting?.title || preservedMeeting?.title;
    if (!title) return;
    const meetingId = pendingMeetingId;
    setCurrentMeeting({ id: meetingId, title });
    setSelectedMeetingId(meetingId);
    setSelectedMeetingTitle(title);
    setActiveScreen('intelligence');
    setPendingMeetingId(null);
    router.replace('/');
  }, [currentMeeting, meetings, pendingMeetingId, router, setCurrentMeeting]);

  // Recovery hook
  const {
    recoverableMeetings,
    isLoading: isLoadingRecovery,
    isRecovering,
    checkForRecoverableTranscripts,
    recoverMeeting,
    loadMeetingTranscripts,
    deleteRecoverableMeeting
  } = useTranscriptRecovery();

  useEffect(() => { Analytics.trackPageView('home'); }, []);

  // Startup recovery checks
  useEffect(() => {
    const performStartupChecks = async () => {
      try {
        if (recordingState.isRecording || status === RecordingStatus.STOPPING || status === RecordingStatus.PROCESSING_TRANSCRIPTS || status === RecordingStatus.SAVING) {
          console.log('Skipping recovery check - recording in progress or processing');
          return;
        }
        try { await indexedDBService.deleteOldMeetings(7); } catch (error) { console.warn('⚠️ Failed to clean up old meetings:', error); }
        try { await indexedDBService.deleteSavedMeetings(24); } catch (error) { console.warn('⚠️ Failed to clean up saved meetings:', error); }
        await checkForRecoverableTranscripts();
      } catch (error) { console.error('Failed to perform startup checks:', error); }
    };
    performStartupChecks();
  }, [checkForRecoverableTranscripts, recordingState.isRecording, status]);

  // Recovery dialog
  useEffect(() => {
    if (recoverableMeetings.length > 0) {
      const shownThisSession = sessionStorage.getItem('recovery_dialog_shown');
      if (!shownThisSession) { setShowRecoveryDialog(true); sessionStorage.setItem('recovery_dialog_shown', 'true'); }
    }
  }, [recoverableMeetings]);

  const handleRecovery = async (meetingId: string) => {
    try {
      const result = await recoverMeeting(meetingId);
      if (result.success) {
        toast.success('Meeting recovered successfully!', {
          description: result.audioRecoveryStatus?.status === 'success' ? 'Transcripts and audio recovered' : 'Transcripts recovered (no audio available)',
          action: result.meetingId ? { label: 'View Meeting', onClick: () => { router.push(`/meeting-details?id=${result.meetingId}`); } } : undefined,
          duration: 10000,
        });
        await refetchMeetings();
        if (recoverableMeetings.length === 0) sessionStorage.removeItem('recovery_dialog_shown');
        if (result.meetingId) setTimeout(() => { router.push(`/meeting-details?id=${result.meetingId}`); }, 2000);
      }
    } catch (error) {
      toast.error('Failed to recover meeting', { description: error instanceof Error ? error.message : 'Unknown error occurred' });
      throw error;
    }
  };

  const handleDialogClose = () => {
    setShowRecoveryDialog(false);
    if (recoverableMeetings.length === 0) sessionStorage.removeItem('recovery_dialog_shown');
  };

  // Audio visualizer
  useEffect(() => {
    if (recordingState.isRecording) {
      const interval = setInterval(() => {
        setBarHeights(prev => {
          const newHeights = [...prev];
          newHeights[0] = Math.random() * 20 + 10 + 'px';
          newHeights[1] = Math.random() * 20 + 10 + 'px';
          newHeights[2] = Math.random() * 20 + 10 + 'px';
          return newHeights;
        });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [recordingState.isRecording]);

  // Whenever a recording becomes active (dashboard button OR tray/sidebar trigger),
  // make sure we are on the Intelligence screen so the user sees the live transcript.
  useEffect(() => {
    if (recordingState.isRecording && activeScreen === 'dashboard') {
      setSelectedMeetingId('intro-call');
      setSelectedMeetingTitle(meetingTitle || 'Nueva Reunión');
      setActiveScreen('intelligence');
    }
  }, [recordingState.isRecording, activeScreen, meetingTitle]);

  // Computed values
  const isProcessingStop = status === RecordingStatus.PROCESSING_TRANSCRIPTS || isProcessing;

  // Sessions list for DashboardScreen — memoized so DashboardScreen's effects
  // (which depend on `sessions` identity) don't refire on every render of Home
  // and re-hit api_get_dashboard_stats 3–4 times per interaction.
  const sessionList = useMemo(
    () => meetings.map((m: any) => ({
      id: m.id,
      title: m.name || m.title || 'Sin título',
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
    [meetings]
  );

  // Handle starting a new recording → open Intelligence screen with a new id.
  // enableDiarization mirrors the original "Grabar reunión" flow (speaker labels).
  const handleStartNewRecording = (enableDiarization: boolean = false) => {
    const newId = 'intro-call';
    setSelectedMeetingId(newId);
    setSelectedMeetingTitle(meetingTitle || 'Nueva Reunión');
    setActiveScreen('intelligence');
    handleRecordingStart(enableDiarization);
  };

  // Stop recording: invoke the backend stop (formerly done by RecordingControls)
  // BEFORE running the post-stop pipeline (transcription flush + SQLite save).
  const handleStopRecording = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      const dataDir = await appDataDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Cosmetic fallback only: the Rust backend chooses the final audio path.
      await recordingService.stopRecording(`${dataDir}/${'Reunión'}.${timestamp}.wav`);
      await handleRecordingStop(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('No recording in progress')) {
        await handleRecordingStop(false);
        return;
      }
      console.error('Failed to stop recording:', error);
      showModal('errorAlert', msg);
      await handleRecordingStop(false);
    }
  };

  // Handle selecting an existing session from the dashboard
  const handleSelectSession = (id: string) => {
    const s = sessionList.find(s => s.id === id);
    setSelectedMeetingId(id);
    setSelectedMeetingTitle(s?.title || 'Reunión');
    setActiveScreen('intelligence');
  };

  // Handle switching AI provider from dashboard. Update context for immediate UI
  // feedback AND persist to the backend so the choice survives reloads and is used
  // by summary generation. whisperModel is preserved to avoid clobbering it.
  const handleSetActiveModel = async (provider: ModelConfig['provider'], model: string) => {
    const updated = { ...modelConfig, provider, model };
    setModelConfig(updated);
    let providerModelMap: Record<string, string> = {};
    try {
      providerModelMap = JSON.parse(localStorage.getItem('providerModelMap') || '{}');
    } catch {
      // Replace malformed legacy cache data with the newly validated selection.
    }
    providerModelMap[provider] = model;
    localStorage.setItem('providerModelMap', JSON.stringify(providerModelMap));
    try {
      await invoke('api_save_model_config', {
        provider: updated.provider,
        model: updated.model,
        whisperModel: updated.whisperModel,
        apiKey: updated.apiKey ?? null,
        ollamaEndpoint: updated.ollamaEndpoint ?? null,
      });
    } catch (error) {
      console.error('Failed to persist model provider change:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col h-dvh bg-background overflow-hidden"
    >
      {/* All Modals */}
      <SettingsModals modals={modals} messages={messages} onClose={hideModal} />

      {/* Recovery Dialog */}
      <TranscriptRecovery
        isOpen={showRecoveryDialog}
        onClose={handleDialogClose}
        recoverableMeetings={recoverableMeetings}
        onRecover={handleRecovery}
        onDelete={deleteRecoverableMeeting}
        onLoadPreview={loadMeetingTranscripts}
      />

      {/* Status Overlays */}
      <StatusOverlays
        isProcessing={status === RecordingStatus.PROCESSING_TRANSCRIPTS && !recordingState.isRecording}
        isSaving={status === RecordingStatus.SAVING}
        sidebarCollapsed={false}
      />

      {/* SPA Router */}
      {activeScreen === 'dashboard' ? (
        <DashboardScreen
          sessions={sessionList}
          onSelectSession={handleSelectSession}
          onStartNewRecording={() => handleStartNewRecording(true)}
          activeModel={modelConfig.provider}
          setActiveModel={handleSetActiveModel}
          onOpenSettings={() => showModal('modelSettings')}
          onImportAudioClick={() => openImportDialog()}
        />
      ) : (
        <IntelligenceScreen
          meetingId={selectedMeetingId}
          meetingTitle={selectedMeetingTitle}
          onBackToDashboard={() => { setActiveScreen('dashboard'); refetchMeetings(); }}
          onOpenSettings={() => showModal('modelSettings')}
          onMeetingTitleUpdated={(title) => setSelectedMeetingTitle(title)}
          isRecording={recordingState.isRecording}
          onRecordingStop={handleStopRecording}
          // Wrap the handler so React's MouseEvent is never mistaken for the
          // enableDiarization boolean expected by useRecordingStart.
          onRecordingStart={() => handleRecordingStart(false)}
          isRecordingDisabled={isRecordingDisabled}
          barHeights={barHeights}
        />
      )}
    </motion.div>
  );
}
