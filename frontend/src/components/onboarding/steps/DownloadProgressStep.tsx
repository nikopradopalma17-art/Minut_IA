import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Mic, Sparkles, Check, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { getSummaryModelSizeLabel, getSummaryModelSizeMb } from '@/lib/onboarding-summary-model';
import { getDownloadContinuation, resolveOnboardingPlatform, type OnboardingPlatform } from '@/lib/onboarding-platform';

const PARAKEET_MODEL = 'parakeet-tdt-0.6b-v3-int8';

type DownloadStatus = 'waiting' | 'downloading' | 'completed' | 'error';

interface DownloadState {
  status: DownloadStatus;
  progress: number;
  downloadedMb: number;
  totalMb: number;
  speedMbps: number;
  error?: string;
}

export function DownloadProgressStep() {
  const {
    goNext,
    selectedSummaryModel,
    recommendedSummaryModel,
    parakeetDownloaded,
    setParakeetDownloaded,
    summaryModelDownloaded,
    setSummaryModelDownloaded,
    startBackgroundDownloads,
    completeOnboarding,
  } = useOnboarding();

  const [resolvedPlatform, setResolvedPlatform] = useState<OnboardingPlatform | null>(null);

  const [parakeetState, setParakeetState] = useState<DownloadState>({
    status: parakeetDownloaded ? 'completed' : 'waiting',
    progress: parakeetDownloaded ? 100 : 0,
    downloadedMb: 0,
    totalMb: 670,
    speedMbps: 0,
  });

  const [summaryState, setSummaryState] = useState<DownloadState>({
    status: summaryModelDownloaded ? 'completed' : 'waiting',
    progress: summaryModelDownloaded ? 100 : 0,
    downloadedMb: 0,
    totalMb: 0,
    speedMbps: 0,
  });

  const [isCompleting, setIsCompleting] = useState(false);
  const parakeetDownloadStartedRef = useRef(false);
  const summaryDownloadStartedRef = useRef(false);
  const retryingRef = useRef(false);
  const retryingSummaryRef = useRef(false);
  const { t } = useTranslation();

  // Retry download handler
  const handleRetryDownload = async () => {
    // Prevent multiple simultaneous retries
    if (retryingRef.current) {
      console.log('[DownloadProgressStep] Retry already in progress, ignoring');
      return;
    }

    console.log('[DownloadProgressStep] Retrying Parakeet download');
    retryingRef.current = true;

    // Reset error state
    setParakeetState((prev) => ({
      ...prev,
      status: 'waiting',
      error: undefined,
      progress: 0,
      downloadedMb: 0,
      speedMbps: 0,
    }));

    try {
      await invoke('parakeet_retry_download', { modelName: PARAKEET_MODEL });
      // Progress events will update state
    } catch (error) {
      console.error('[DownloadProgressStep] Retry failed:', error);
      setParakeetState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Retry failed',
      }));

      toast.error(t('onboarding.download.retry_failed'), {
        description: t('onboarding.download.retry_failed_desc'),
      });
    } finally {
      // Allow retry again after 2 seconds
      setTimeout(() => {
        retryingRef.current = false;
      }, 2000);
    }
  };

  // Retry summary download handler
  const handleRetrySummaryDownload = async () => {
    // Prevent multiple simultaneous retries
    if (retryingSummaryRef.current) {
      console.log('[DownloadProgressStep] Summary retry already in progress, ignoring');
      return;
    }

    console.log('[DownloadProgressStep] Retrying summary model download');
    retryingSummaryRef.current = true;

    // Reset error state
    setSummaryState((prev) => ({
      ...prev,
      status: 'downloading',
      error: undefined,
      progress: 0,
      downloadedMb: 0,
      totalMb: getSummaryModelSizeMb(selectedSummaryModel || recommendedSummaryModel),
      speedMbps: 0,
    }));

    try {
      // Call download command directly (no retry command exists for built-in AI)
      const modelName = selectedSummaryModel;
      if (!modelName) {
        throw new Error('Summary model recommendation is not ready yet');
      }
      await invoke('builtin_ai_download_model', { modelName });
    } catch (error) {
      console.error('[DownloadProgressStep] Summary retry failed:', error);
      setSummaryState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Retry failed',
      }));

      toast.error(t('onboarding.download.retry_failed'), {
        description: t('onboarding.download.retry_failed_desc'),
      });
    } finally {
      // Allow retry again after 2 seconds
      setTimeout(() => {
        retryingSummaryRef.current = false;
      }, 2000);
    }
  };

  // Detect platform on mount
  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setResolvedPlatform(resolveOnboardingPlatform(platform(), navigator.userAgent));
      } catch (e) {
        setResolvedPlatform(resolveOnboardingPlatform(undefined, navigator.userAgent));
      }
    };

    checkPlatform();
  }, []);

  // Start the required transcription model immediately; summary readiness must not block it.
  useEffect(() => {
    if (parakeetDownloadStartedRef.current) return;
    parakeetDownloadStartedRef.current = true;

    if (!parakeetDownloaded) {
      setParakeetState((prev) => ({ ...prev, status: 'downloading' }));
    }

    startBackgroundDownloads({
      includeParakeet: true,
      includeSummary: false,
    }).catch((error) => {
      console.error('Failed to start Parakeet download:', error);
      if (!parakeetDownloaded) {
        setParakeetState((prev) => ({ ...prev, status: 'error', error: String(error) }));
      }
    });
  }, []);

  // Start the selected summary model only after the backend recommendation is known.
  useEffect(() => {
    if (summaryDownloadStartedRef.current) return;
    if (!selectedSummaryModel) return;
    summaryDownloadStartedRef.current = true;

    startSummaryDownload();
  }, [selectedSummaryModel]);

  // Listen to Parakeet download progress
  useEffect(() => {
    const unlistenProgress = listen<{
      modelName: string;
      progress: number;
      downloaded_mb?: number;
      total_mb?: number;
      speed_mbps?: number;
      status?: string;
    }>('parakeet-model-download-progress', (event) => {
      const { modelName, progress, downloaded_mb, total_mb, speed_mbps, status } = event.payload;
      if (modelName === PARAKEET_MODEL) {
        setParakeetState((prev) => ({
          ...prev,
          status: status === 'completed' ? 'completed' : 'downloading',
          progress,
          downloadedMb: downloaded_mb ?? prev.downloadedMb,
          totalMb: total_mb ?? prev.totalMb,
          speedMbps: speed_mbps ?? prev.speedMbps,
        }));

        if (status === 'completed' || progress >= 100) {
          setParakeetDownloaded(true);
        }
      }
    });

    const unlistenComplete = listen<{ modelName: string }>(
      'parakeet-model-download-complete',
      (event) => {
        if (event.payload.modelName === PARAKEET_MODEL) {
          setParakeetState((prev) => ({ ...prev, status: 'completed', progress: 100 }));
          setParakeetDownloaded(true);
        }
      }
    );

    const unlistenError = listen<{ modelName: string; error: string }>(
      'parakeet-model-download-error',
      (event) => {
        if (event.payload.modelName === PARAKEET_MODEL) {
          setParakeetState((prev) => ({
            ...prev,
            status: 'error',
            error: event.payload.error,
          }));
        }
      }
    );

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  // Listen to Summary Model download progress (always downloading for builtin-ai)
  useEffect(() => {
    const unlisten = listen<{
      model: string;
      progress: number;
      downloaded_mb?: number;
      total_mb?: number;
      speed_mbps?: number;
      status: string;
      error?: string;
    }>('builtin-ai-download-progress', (event) => {
      const { model, progress, downloaded_mb, total_mb, speed_mbps, status, error } = event.payload;
      if (selectedSummaryModel && model === selectedSummaryModel) {
        setSummaryState((prev) => ({
          ...prev,
          status: status === 'completed'
            ? 'completed'
            : status === 'error'
            ? 'error'
            : 'downloading',
          progress,
          downloadedMb: downloaded_mb ?? prev.downloadedMb,
          totalMb: (total_mb ?? prev.totalMb) || getSummaryModelSizeMb(model),
          speedMbps: speed_mbps ?? prev.speedMbps,
          error: status === 'error' ? error : undefined,
        }));

        if (status === 'completed' || progress >= 100) {
          setSummaryModelDownloaded(true);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedSummaryModel]);

  useEffect(() => {
    const modelForSize = selectedSummaryModel || recommendedSummaryModel;
    if (!modelForSize) return;

    setSummaryState((prev) => ({
      ...prev,
      status: summaryModelDownloaded
        ? 'completed'
        : prev.status === 'completed'
        ? 'waiting'
        : prev.status,
      progress: summaryModelDownloaded
        ? 100
        : prev.status === 'completed'
        ? 0
        : prev.progress,
      totalMb: prev.totalMb || getSummaryModelSizeMb(modelForSize),
    }));
  }, [selectedSummaryModel, recommendedSummaryModel, summaryModelDownloaded]);

  const startSummaryDownload = async () => {
    if (!summaryModelDownloaded && selectedSummaryModel) {
      try {
        setSummaryState((prev) => ({
          ...prev,
          status: 'downloading',
          totalMb: getSummaryModelSizeMb(selectedSummaryModel),
        }));
        await startBackgroundDownloads({
          includeParakeet: false,
          includeSummary: true,
          summaryModel: selectedSummaryModel,
        });
      } catch (error) {
        console.error('Failed to start summary model download:', error);
        setSummaryState((prev) => ({ ...prev, status: 'error', error: String(error) }));
      }
    }
  };

  const handleContinue = async () => {
    // Verify actual model availability (catches state drift)
    try {
      await invoke('parakeet_init');
      const actuallyAvailable = await invoke<boolean>('parakeet_has_available_models');

      if (actuallyAvailable && !parakeetDownloaded) {
        console.log('[DownloadProgressStep] Model available but state not updated');
        setParakeetDownloaded(true);
        setParakeetState((prev) => ({
          ...prev,
          status: 'completed',
          progress: 100,
        }));
      } else if (!actuallyAvailable && parakeetState.status === 'error') {
        toast.error(t('onboarding.download.transcription_required'), {
          description: t('onboarding.download.transcription_required_desc'),
        });
        return;
      }
    } catch (error) {
      console.warn('[DownloadProgressStep] Failed to verify model:', error);
    }

    // Check if downloads are complete for toast notification
    const downloadsComplete = parakeetState.status === 'completed' &&
      summaryState.status === 'completed';

    // Show toast if downloads still in progress
    if (!downloadsComplete) {
      toast.info(t('onboarding.download.background'), {
        description: t('onboarding.download.background_desc'),
        duration: 5000,
      });
    }

    const continuation = getDownloadContinuation(resolvedPlatform);
    if (continuation === 'wait') return;
    if (continuation === 'permissions') {
      // macOS: Go to Permissions step (will complete after permissions granted)
      goNext();
    } else {
      // Non-macOS: Complete onboarding immediately (downloads continue in background)
      setIsCompleting(true);
      try {
        await completeOnboarding();

        // Small delay to ensure state is saved before reload
        await new Promise(resolve => setTimeout(resolve, 100));

        window.location.reload();
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
        toast.error(t('onboarding.download.failed_complete'), {
          description: t('onboarding.download.failed_complete_desc'),
        });
        setIsCompleting(false);
      }
    }
  };

  const renderDownloadCard = (
    kind: 'transcription' | 'summary',
    title: string,
    icon: React.ReactNode,
    state: DownloadState,
    modelSize: string,
    sizeUnit = 'MB'
  ) => (
    <div className="rounded-3xl border p-5 glow-border-impulso"
      style={{ background: '#0d1f33', borderColor: '#1a2d42' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background: 'rgba(68,119,148,0.15)', borderColor: 'rgba(68,119,148,0.35)', color: '#447794' }}>
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{title}</h3>
            <p className="text-xs" style={{ color: '#7a9ab5' }}>{modelSize}</p>
          </div>
        </div>
        <div>
          {state.status === 'waiting' && (
            <span className="text-xs" style={{ color: '#5a7a94' }}>{t('onboarding.download.waiting')}</span>
          )}
          {state.status === 'downloading' && (
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#447794' }} />
          )}
          {state.status === 'completed' && (
            <div className="w-6 h-6 rounded-lg border flex items-center justify-center"
              style={{ background: 'rgba(45,91,117,0.15)', borderColor: 'rgba(45,91,117,0.35)', color: '#2D5B75' }}>
              <Check className="w-3.5 h-3.5" />
            </div>
          )}
          {state.status === 'error' && (
            <span className="text-xs font-semibold" style={{ color: kind === 'summary' ? '#2D5B75' : '#d97070' }}>
              {kind === 'summary'
                ? t('onboarding.download.optional')
                : t('onboarding.download.failed')}
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(state.status === 'downloading' || state.status === 'completed') && (
        <div className="space-y-2">
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#061222' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%`, background: '#447794' }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: '#7a9ab5' }}>
              {state.downloadedMb.toFixed(1)} {sizeUnit} / {state.totalMb.toFixed(1)} {sizeUnit}
            </span>
            <div className="flex items-center gap-2">
              {state.speedMbps > 0 && (
                <span style={{ color: '#7a9ab5' }}>
                  {state.speedMbps.toFixed(1)} {sizeUnit}/s
                </span>
              )}
              <span className="font-bold text-white">
                {Math.round(state.progress)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {state.status === 'error' && state.error && (
        <div className="mt-2 p-3 rounded-2xl border text-xs"
          style={kind === 'summary'
            ? { background: 'rgba(45,91,117,0.06)', borderColor: 'rgba(45,91,117,0.3)', color: '#7a9ab5' }
            : { background: 'rgba(180,60,60,0.06)', borderColor: 'rgba(180,60,60,0.3)', color: '#d97070' }}>
          <p className="font-bold">
            {kind === 'summary'
              ? t('onboarding.download.optional_title')
              : t('onboarding.download.error_title')}
          </p>
          <p className="mt-1 opacity-90">
            {kind === 'summary'
              ? t('onboarding.download.optional_desc')
              : state.error}
          </p>
          {(kind === 'transcription' || kind === 'summary') && (
            <button
              onClick={kind === 'transcription' ? handleRetryDownload : handleRetrySummaryDownload}
              className="mt-3 w-full h-9 px-4 text-xs font-bold rounded-xl transition-opacity flex items-center justify-center gap-2 text-white border"
              style={kind === 'summary'
                ? { background: '#2D5B75', borderColor: '#2d5b75' }
                : { background: '#9e3f3f', borderColor: '#9e3f3f' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('onboarding.download.try_again')}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <OnboardingContainer
      title={t('onboarding.download.title')}
      description={t('onboarding.download.description')}
      step={4}
      totalSteps={resolvedPlatform === 'macos' ? 5 : 4}
    >
      <div className="flex flex-col items-center space-y-6">
        {/* Download Cards */}
        <div className="w-full max-w-lg space-y-4">
          {renderDownloadCard(
            'transcription',
            t('onboarding.download.transcription'),
            <Mic className="w-5 h-5" />,
            parakeetState,
            '~670 MB'
          )}

          {renderDownloadCard(
            'summary',
            t('onboarding.download.summary'),
            <Sparkles className="w-5 h-5" />,
            summaryState,
            getSummaryModelSizeLabel(selectedSummaryModel || recommendedSummaryModel),
            'MiB'
          )}
        </div>

        {/* Info Message - Only show when Parakeet is downloaded */}
        <AnimatePresence>
          {parakeetDownloaded && !summaryModelDownloaded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-3xl p-4 text-xs border"
              style={{ background: '#0d1f33', borderColor: '#1a2d42' }}
            >
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#447794' }} />
                <div>
                  <p className="font-bold text-white">{t('onboarding.download.continue_while')}</p>
                  <p className="mt-1" style={{ color: '#7a9ab5' }}>{t('onboarding.download.continue_while_desc')}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Button */}
        <div className="w-full max-w-xs pt-2">
          <Button
            onClick={handleContinue}
            disabled={!parakeetDownloaded || isCompleting || resolvedPlatform === null}
            className="w-full h-11 font-bold rounded-2xl transition-all"
            style={{ background: '#447794', color: '#061222' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {(isCompleting || !parakeetDownloaded) ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              t('onboarding.download.continue')
            )}
          </Button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
