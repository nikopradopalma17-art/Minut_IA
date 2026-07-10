import { useState, useCallback } from 'react';
import { Transcript, Summary } from '@/types';
import { ModelConfig } from '@/components/ModelSettingsModal';
import { CurrentMeeting, useSidebar } from '@/components/Sidebar/SidebarProvider';
import { invoke as invokeTauri } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import Analytics from '@/lib/analytics';
import { isOllamaNotInstalledError } from '@/lib/utils';
import { BuiltInModelInfo } from '@/lib/builtin-ai';
import { formatSpeakerLabel } from '@/lib/speakerLabels';
import { recordingService } from '@/services/recordingService';
import { TranslationKey, useTranslation } from '@/contexts/TranslationContext';
import {
  detectAndCacheSummaryLanguage,
  readMeetingSummaryLanguage,
  readCachedDetectedSummaryLanguage,
} from '@/lib/summary-language-preferences';

async function resolveSummaryLanguage(
  meetingId: string,
  transcriptTexts: string[],
  t: (key: TranslationKey) => string
): Promise<string | null> {
  try {
    const perMeeting = await readMeetingSummaryLanguage(meetingId);
    if (perMeeting.language) return perMeeting.language;
  } catch (err) {
    console.warn('Failed to load meeting summary language:', err);
    toast.warning(t('summary.detect_language_failed'), {
      description: t('summary.detect_language_failed_desc'),
    });
  }

  try {
    const cachedDetected = await readCachedDetectedSummaryLanguage(meetingId);
    if (cachedDetected) return cachedDetected;
  } catch (err) {
    console.warn('Failed to load cached detected summary language:', err);
  }

  try {
    const detection = await detectAndCacheSummaryLanguage(meetingId, transcriptTexts);
    if (detection.reason === 'tie') {
      toast.warning(t('summary.language_bilingual_detected'), {
        description: t('summary.language_bilingual_detected_desc'),
      });
    }
    return detection.language;
  } catch (err) {
    console.warn('Failed to detect transcript summary language:', err);
    return null;
  }
}

type SummaryStatus = 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';

interface UseSummaryGenerationProps {
  meeting: any;
  transcripts: Transcript[];
  modelConfig: ModelConfig;
  isModelConfigLoading: boolean;
  selectedTemplate: string;
  onMeetingUpdated?: () => Promise<void>;
  updateMeetingTitle: (title: string) => void;
  setAiSummary: (summary: Summary | null) => void;
  onOpenModelSettings?: () => void;
}

export function useSummaryGeneration({
  meeting,
  transcripts,
  modelConfig,
  isModelConfigLoading,
  selectedTemplate,
  onMeetingUpdated,
  updateMeetingTitle,
  setAiSummary,
  onOpenModelSettings,
}: UseSummaryGenerationProps) {
  const { t } = useTranslation();
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const { startSummaryPolling, stopSummaryPolling } = useSidebar();

  // Helper to get status message
  const getSummaryStatusMessage = useCallback((status: SummaryStatus) => {
    switch (status) {
      case 'processing':
        return t('summary.status_processing');
      case 'summarizing':
        return t('summary.status_generating');
      case 'regenerating':
        return t('summary.status_regenerating');
      case 'completed':
        return t('summary.status_completed');
      case 'error':
        return t('summary.status_error');
      default:
        return '';
    }
  }, [t]);

  // Unified summary processing logic
  const processSummary = useCallback(async ({
    transcriptText,
    transcriptTexts,
    customPrompt = '',
    isRegeneration = false,
  }: {
    transcriptText: string;
    transcriptTexts?: string[];
    customPrompt?: string;
    isRegeneration?: boolean;
  }) => {
    setSummaryStatus(isRegeneration ? 'regenerating' : 'processing');
    setSummaryError(null);

    try {
      if (!transcriptText.trim()) {
        throw new Error(t('summary.no_transcript_text'));
      }

      console.log('Processing transcript with template:', selectedTemplate);

      // Calculate time since recording
      const timeSinceRecording = (Date.now() - new Date(meeting.created_at).getTime()) / 60000; // minutes

      // Track summary generation started
      await Analytics.trackSummaryGenerationStarted(
        modelConfig.provider,
        modelConfig.model,
        transcriptText.length,
        timeSinceRecording
      );

      // Track custom prompt usage if present
      if (customPrompt.trim().length > 0) {
        await Analytics.trackCustomPromptUsed(customPrompt.trim().length);
      }

      // Show toast notification for generation start
      toast.info(t(isRegeneration ? 'summary.status_regenerating' : 'summary.status_generating'), {
        description: t('summary.toast_using_model')
          .replace('{provider}', modelConfig.provider)
          .replace('{model}', modelConfig.model),
        duration: 3000,
      });

      // Resolve explicit metadata override first; Auto detects the transcript language.
      const summaryLanguage = await resolveSummaryLanguage(
        meeting.id,
        transcriptTexts?.length ? transcriptTexts : [transcriptText],
        t
      );

      // Process transcript and get process_id
      const result = await invokeTauri('api_process_transcript', {
        text: transcriptText,
        model: modelConfig.provider,
        modelName: modelConfig.model,
        meetingId: meeting.id,
        chunkSize: 40000,
        overlap: 1000,
        customPrompt: customPrompt,
        templateId: selectedTemplate,
        summaryLanguage,
      }) as any;

      const process_id = result.process_id;
      console.log('Process ID:', process_id);

      // Start global polling via context
      startSummaryPolling(meeting.id, process_id, async (pollingResult) => {
        console.log('Summary status:', pollingResult);

        // Handle cancellation
        if (pollingResult.status === 'cancelled') {
          console.log('Summary generation was cancelled');

          // Reload summary from database (backend has already restored from backup)
          try {
            const existingSummary = await invokeTauri('api_get_summary', {
              meetingId: meeting.id
            }) as any;

            if (existingSummary?.data) {
              console.log('Restored previous summary after cancellation');
              setAiSummary(existingSummary.data);
              setSummaryStatus('completed');
            } else {
              setSummaryStatus('idle');
            }
          } catch (error) {
            console.error('Failed to reload summary after cancellation:', error);
            setSummaryStatus('idle');
          }

          setSummaryError(null);
          return;
        }

        // Handle errors
        if (pollingResult.status === 'error' || pollingResult.status === 'failed') {
          console.error('Backend returned error:', pollingResult.error);
          const errorMessage = pollingResult.error || (isRegeneration ? t('summary.regeneration_failed') : t('summary.generation_failed'));

          // If this was a regeneration, try to restore previous summary from database
          if (isRegeneration) {
            try {
              const existingSummary = await invokeTauri('api_get_summary', {
                meetingId: meeting.id
              }) as any;

              if (existingSummary?.data) {
                console.log('Restored previous summary after regeneration failure');
                setAiSummary(existingSummary.data);
                setSummaryStatus('completed');
                setSummaryError(null);

                // Show error toast with restoration message
                toast.error(t('summary.regeneration_failed'), {
                  description: t('summary.regeneration_failed_restored_desc')
                    .replace('{error}', errorMessage),
                });

                await Analytics.trackSummaryGenerationCompleted(
                  modelConfig.provider,
                  modelConfig.model,
                  false,
                  undefined,
                  errorMessage
                );
                return;
              }
            } catch (error) {
              console.error('Failed to reload summary after error:', error);
            }
          }

          // Continue with normal error handling if not regeneration or reload failed
          setSummaryError(errorMessage);
          setSummaryStatus('error');

          // Check if this is a "model is required" error
          const isModelRequiredError = errorMessage.includes('model is required') ||
            errorMessage.includes('"model":"required"') ||
            errorMessage.toLowerCase().includes('model') && errorMessage.toLowerCase().includes('required');

          // Show error toast
          toast.error(t(isRegeneration ? 'summary.regeneration_failed' : 'summary.generation_failed'), {
            description: errorMessage.includes('Connection refused')
              ? t('summary.connection_refused_desc')
              : errorMessage,
          });

          // Auto-open model settings modal if model is missing
          if (isModelRequiredError && onOpenModelSettings) {
            console.log('🔧 Model required error detected, opening model settings...');
            onOpenModelSettings();
          }

          await Analytics.trackSummaryGenerationCompleted(
            modelConfig.provider,
            modelConfig.model,
            false,
            undefined,
            errorMessage
          );
          return;
        }

        // Handle successful completion
        if (pollingResult.status === 'completed' && pollingResult.data) {
          console.log('Summary generation completed:', pollingResult.data);

          // Update meeting title if available
          const meetingName = pollingResult.data.MeetingName || pollingResult.meetingName;
          if (meetingName) {
            updateMeetingTitle(meetingName);
          }

          // Check if backend returned markdown format (new flow)
          if (pollingResult.data.markdown) {
            console.log('Received markdown format from backend');
            setAiSummary({ markdown: pollingResult.data.markdown } as any);
            setSummaryStatus('completed');

            // Show success toast
            toast.success(t('summary.generated_success'), {
              description: t('summary.generated_success_desc'),
              duration: 4000,
            });

            if (meetingName && onMeetingUpdated) {
              await onMeetingUpdated();
            }

            await Analytics.trackSummaryGenerationCompleted(
              modelConfig.provider,
              modelConfig.model,
              true
            );
            return;
          }

          // Legacy format handling
          const summarySections = Object.entries(pollingResult.data).filter(([key]) => key !== 'MeetingName');
          const allEmpty = summarySections.every(([, section]) => !(section as any).blocks || (section as any).blocks.length === 0);

          if (allEmpty) {
            console.error('Summary completed but all sections empty');
            setSummaryError(t('summary.empty_content_error'));
            setSummaryStatus('error');

            await Analytics.trackSummaryGenerationCompleted(
              modelConfig.provider,
              modelConfig.model,
              false,
              undefined,
              'Empty summary generated'
            );
            return;
          }

          // Remove MeetingName from data before formatting
          const { MeetingName, ...summaryData } = pollingResult.data;

          // Format legacy summary data
          const formattedSummary: Summary = {};
          const sectionKeys = pollingResult.data._section_order || Object.keys(summaryData);

          for (const key of sectionKeys) {
            try {
              const section = summaryData[key];
              if (section && typeof section === 'object' && 'title' in section && 'blocks' in section) {
                const typedSection = section as { title?: string; blocks?: any[] };

                if (Array.isArray(typedSection.blocks)) {
                  formattedSummary[key] = {
                    title: typedSection.title || key,
                    blocks: typedSection.blocks.map((block: any) => ({
                      ...block,
                      color: 'default',
                      content: block?.content?.trim() || ''
                    }))
                  };
                } else {
                  formattedSummary[key] = {
                    title: typedSection.title || key,
                    blocks: []
                  };
                }
              }
            } catch (error) {
              console.warn(`Error processing section ${key}:`, error);
            }
          }

          setAiSummary(formattedSummary);
          setSummaryStatus('completed');

          // Show success toast
          toast.success(t('summary.generated_success'), {
            description: t('summary.generated_success_desc'),
            duration: 4000,
          });

          await Analytics.trackSummaryGenerationCompleted(
            modelConfig.provider,
            modelConfig.model,
            true
          );

          if (meetingName && onMeetingUpdated) {
            await onMeetingUpdated();
          }
        }
      });
    } catch (error) {
      console.error(`Failed to ${isRegeneration ? 'regenerate' : 'generate'} summary:`, error);
      const errorMessage = error instanceof Error ? error.message : t('toasts.unknown_error');
      setSummaryError(errorMessage);
      setSummaryStatus('error');
      // Note: We don't clear the summary here because the backend has already restored from backup

      toast.error(t(isRegeneration ? 'summary.regeneration_failed' : 'summary.generation_failed'), {
        description: errorMessage,
      });

      await Analytics.trackSummaryGenerationCompleted(
        modelConfig.provider,
        modelConfig.model,
        false,
        undefined,
        errorMessage
      );
    }
  }, [
    meeting.id,
    meeting.created_at,
    modelConfig,
    selectedTemplate,
    startSummaryPolling,
    setAiSummary,
    updateMeetingTitle,
    onMeetingUpdated,
    onOpenModelSettings,
    t,
  ]);

  // Helper function to fetch ALL transcripts for summary generation
  const fetchAllTranscripts = useCallback(async (meetingId: string): Promise<Transcript[]> => {
    try {
      console.log('📊 Fetching all transcripts for meeting:', meetingId);

      // First, get total count by fetching first page
      const firstPage = await invokeTauri('api_get_meeting_transcripts', {
        meetingId,
        limit: 1,
        offset: 0,
      }) as { transcripts: Transcript[]; total_count: number; has_more: boolean };

      const totalCount = firstPage.total_count;
      console.log(`📊 Total transcripts in database: ${totalCount}`);

      if (totalCount === 0) {
        return [];
      }

      // Fetch all transcripts in one call
      const allData = await invokeTauri('api_get_meeting_transcripts', {
        meetingId,
        limit: totalCount,
        offset: 0,
      }) as { transcripts: Transcript[]; total_count: number; has_more: boolean };

      console.log(`✅ Fetched ${allData.transcripts.length} transcripts from database`);
      return allData.transcripts;
    } catch (error) {
      console.error('❌ Error fetching all transcripts:', error);
      toast.error(t('summary.fetch_transcripts_failed'));
      return [];
    }
  }, [t]);

  const buildSummaryTranscriptPayload = useCallback(async (allTranscripts: Transcript[]) => {
    const formatTime = (seconds: number | undefined, fallbackTimestamp: string): string => {
      if (seconds === undefined) {
        return fallbackTimestamp;
      }
      const totalSecs = Math.floor(seconds);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    };

    // Resolve speaker display names so the LLM can attribute participants,
    // agreements and commitments to real people in the minutes.
    let speakerNames: Record<string, string> = {};
    try {
      const entries = await recordingService.listSpeakerNames(meeting.id);
      speakerNames = Object.fromEntries(
        entries.map(entry => [entry.speaker_id, entry.display_name])
      );
    } catch (error) {
      console.warn('Could not load speaker names for summary payload:', error);
    }

    const lineFor = (t: Transcript): string => {
      const label = formatSpeakerLabel(t.speaker, { names: speakerNames });
      const attribution = label ? ` ${label}:` : '';
      return `${formatTime(t.audio_start_time, t.timestamp)}${attribution} ${t.text}`;
    };

    return {
      transcriptText: allTranscripts.map(lineFor).join('\n'),
      transcriptTexts: allTranscripts.map(t => t.text),
    };
  }, [meeting.id]);

  // Public API: Generate summary from transcripts
  const handleGenerateSummary = useCallback(async (customPrompt: string = '') => {
    // Check if model config is still loading
    if (isModelConfigLoading) {
      console.log('⏳ Model configuration is still loading, please wait...');
      toast.info(t('summary.loading_config_wait'));
      return;
    }

    // CHANGE: Fetch ALL transcripts from database, not from pagination state
    console.log('📊 Fetching all transcripts for summary generation...');
    const allTranscripts = await fetchAllTranscripts(meeting.id);

    if (!allTranscripts.length) {
      const error_msg = 'No transcripts available for summary';
      console.log(error_msg);
      toast.error(t('summary.no_transcripts'));
      return;
    }

    console.log(`✅ Proceeding with ${allTranscripts.length} transcripts`);

    console.log('🚀 Starting summary generation with config:', {
      provider: modelConfig.provider,
      model: modelConfig.model,
      template: selectedTemplate
    });

    // Check if Ollama provider has models available
    if (modelConfig.provider === 'ollama') {
      try {
        const endpoint = modelConfig.ollamaEndpoint || null;
        const models = await invokeTauri('get_ollama_models', { endpoint }) as any[];

        if (!models || models.length === 0) {
          toast.error(
            t('models.no_ollama_models').replace('{model}', 'gemma3:1b'),
            { duration: 5000 }
          );
          return;
        }
      } catch (error) {
        console.error('Error checking Ollama models:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (isOllamaNotInstalledError(errorMessage)) {
          // Ollama is not installed - show specific message with download link
          toast.error(
            t('models.ollama_not_installed'),
            {
              description: t('models.ollama_not_installed_desc'),
              duration: 7000,
              action: {
                label: t('models.download_action'),
                onClick: () => invokeTauri('open_external_url', { url: 'https://ollama.com/download' })
              }
            }
          );
        } else {
          // Other error - generic message
          toast.error(
            t('models.ollama_check_failed'),
            { duration: 5000 }
          );
        }
        return;
      }
    }

    // Check if built-in AI provider has models available
    if (modelConfig.provider === 'builtin-ai') {
      try {
        const selectedModel = modelConfig.model;

        if (!selectedModel) {
          toast.error(t('models.no_builtin_selected'), {
            description: t('models.no_builtin_selected_desc'),
            duration: 5000,
          });
          if (onOpenModelSettings) {
            onOpenModelSettings();
          }
          return;
        }

        // Check model readiness with filesystem refresh
        const isReady = await invokeTauri<boolean>('builtin_ai_is_model_ready', {
          modelName: selectedModel,
          refresh: true,
        });

        if (!isReady) {
          // Get detailed model status
          const modelInfo = await invokeTauri<BuiltInModelInfo | null>('builtin_ai_get_model_info', {
            modelName: selectedModel,
          });

          if (modelInfo) {
            const status = modelInfo.status;

            if (status.type === 'downloading') {
              toast.info(t('models.download_in_progress'), {
                description: t('models.download_in_progress_desc')
                  .replace('{model}', selectedModel)
                  .replace('{progress}', String(status.progress)),
                duration: 5000,
              });
              return;
            }

            if (status.type === 'not_downloaded') {
              toast.error(t('models.builtin_not_downloaded'), {
                description: t('models.builtin_not_downloaded_desc').replace('{model}', selectedModel),
                duration: 7000,
              });
              if (onOpenModelSettings) {
                onOpenModelSettings();
              }
              return;
            }

            if (status.type === 'corrupted' || status.type === 'error') {
              if (status.type === 'error' && status.Error) {
                console.error('Built-in AI model status detail:', status.Error);
              }
              const errorDesc = status.type === 'error'
                ? t('models.builtin_file_error')
                : t('models.builtin_file_corrupted');
              toast.error(t('models.builtin_not_available'), {
                description: t('models.builtin_check_settings_desc').replace('{error}', errorDesc),
                duration: 7000,
              });
              if (onOpenModelSettings) {
                onOpenModelSettings();
              }
              return;
            }
          }

          // Fallback if we couldn't get model info
          toast.error(t('models.builtin_not_ready'), {
            description: t('models.builtin_not_ready_desc'),
            duration: 5000,
          });
          if (onOpenModelSettings) {
            onOpenModelSettings();
          }
          return;
        }

        // Model is ready, continue to backend call
      } catch (error) {
        console.error('Error validating built-in AI model:', error);
        toast.error(t('models.builtin_validate_failed'), {
          description: error instanceof Error ? error.message : t('toasts.unknown_error'),
          duration: 5000,
        });
        return;
      }
    }

    const summaryPayload = await buildSummaryTranscriptPayload(allTranscripts);

    await processSummary({
      ...summaryPayload,
      customPrompt,
    });
  }, [meeting.id, fetchAllTranscripts, buildSummaryTranscriptPayload, processSummary, modelConfig, isModelConfigLoading, selectedTemplate, onOpenModelSettings, t]);

  // Public API: Regenerate summary from the current saved transcript
  const handleRegenerateSummary = useCallback(async (customPrompt: string = '') => {
    const allTranscripts = await fetchAllTranscripts(meeting.id);

    if (!allTranscripts.length) {
      console.error('No transcripts available for regeneration');
      toast.error(t('summary.no_transcripts_regen'));
      return;
    }

    await processSummary({
      ...(await buildSummaryTranscriptPayload(allTranscripts)),
      customPrompt,
      isRegeneration: true
    });
  }, [meeting.id, fetchAllTranscripts, buildSummaryTranscriptPayload, processSummary, t]);

  // Public API: Stop ongoing summary generation
  const handleStopGeneration = useCallback(async () => {
    console.log('Stopping summary generation for meeting:', meeting.id);

    try {
      // Call backend to cancel the summary generation
      await invokeTauri('api_cancel_summary', {
        meetingId: meeting.id
      });
      console.log('✓ Backend cancellation request sent for meeting:', meeting.id);
    } catch (error) {
      console.error('Failed to cancel summary generation:', error);
      // Continue with frontend cleanup even if backend call fails
    }

    // Stop polling
    stopSummaryPolling(meeting.id);

    // Reset status to idle
    setSummaryStatus('idle');
    setSummaryError(null);

    // Show toast notification
    toast.info(t('summary.stopped'), {
      description: t('summary.stopped_desc'),
      duration: 3000,
    });
  }, [meeting.id, stopSummaryPolling, t]);

  return {
    summaryStatus,
    summaryError,
    handleGenerateSummary,
    handleRegenerateSummary,
    handleStopGeneration,
    getSummaryStatusMessage,
  };
}
