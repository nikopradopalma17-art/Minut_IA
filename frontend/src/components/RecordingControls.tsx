'use client';

import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Mic, AlertCircle, X, Monitor } from 'lucide-react';
import { ProcessRequest, SummaryResponse } from '@/types/summary';
import { listen } from '@tauri-apps/api/event';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Analytics from '@/lib/analytics';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranslation } from '@/contexts/TranslationContext';

interface RecordingControlsProps {
  isRecording: boolean;
  barHeights: string[];
  onRecordingStop: (callApi?: boolean) => void;
  onRecordingStart: (enableDiarization?: boolean) => void;
  onTranscriptReceived: (summary: SummaryResponse) => void;
  onTranscriptionError?: (message: string) => void;
  onStopInitiated?: () => void; // Called immediately when stop button is clicked
  isRecordingDisabled: boolean;
  isParentProcessing: boolean;
  selectedDevices?: {
    micDevice: string | null;
    systemDevice: string | null;
  };
  meetingName?: string;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  barHeights,
  onRecordingStop,
  onRecordingStart,
  onTranscriptReceived,
  onTranscriptionError,
  onStopInitiated,
  isRecordingDisabled,
  isParentProcessing,
  selectedDevices,
  meetingName,
}) => {
  const { t } = useTranslation();
  // Use global recording state context for pause state (syncs with tray operations)
  const recordingState = useRecordingState();
  const isPaused = recordingState.isPaused;

  const [showPlayback, setShowPlayback] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const MIN_RECORDING_DURATION = 2000; // 2 seconds minimum recording time
  const [transcriptionErrors, setTranscriptionErrors] = useState(0);
  const [isValidatingModel, setIsValidatingModel] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [deviceError, setDeviceError] = useState<{ title: string, message: string } | null>(null);

  const currentTime = 0;
  const duration = 0;
  const isPlaying = false;
  const progress = 0;

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const checkTauri = async () => {
      try {
        const result = await invoke('is_recording');
        console.log('Tauri is initialized and ready, is_recording result:', result);
      } catch (error) {
        console.error('Tauri initialization error:', error);
        alert(t('recording.init_failed'));
      }
    };
    checkTauri();
  }, [t]);

  const handleStartRecording = useCallback(async (enableDiarization: boolean = false) => {
    if (isStarting || isValidatingModel) return;
    console.log('Starting recording, enableDiarization:', enableDiarization);
    console.log('Selected devices:', selectedDevices);
    console.log('Meeting name:', meetingName);
    console.log('Current isRecording state:', isRecording);

    setShowPlayback(false);
    setTranscript(''); // Clear any previous transcript
    setSpeechDetected(false); // Reset speech detection on new recording

    try {
      // Call the validation callback which will:
      // 1. Check if model is ready
      // 2. Show appropriate toast/modal
      // 3. Call backend if valid
      // 4. Update UI state
      await onRecordingStart(enableDiarization);
    } catch (error) {
      console.error('Failed to start recording:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Parse error message to provide user-friendly feedback
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for device-related errors
      if (errorMsg.includes('microphone') || errorMsg.includes('mic') || errorMsg.includes('input')) {
        setDeviceError({
          title: t('recording.mic_error_title_detailed'),
          message: t('recording.mic_error_desc_detailed')
        });
      } else if (errorMsg.includes('system audio') || errorMsg.includes('speaker') || errorMsg.includes('output')) {
        setDeviceError({
          title: t('recording.system_audio_error_title'),
          message: t('recording.system_audio_error_desc')
        });
      } else if (errorMsg.includes('permission')) {
        setDeviceError({
          title: t('recording.permission_error_title'),
          message: t('recording.permission_error_desc')
        });
      } else {
        setDeviceError({
          title: t('recording.recording_failed_title'),
          message: t('recording.recording_failed_desc')
        });
      }
    }
  }, [onRecordingStart, isStarting, isValidatingModel, selectedDevices, meetingName, isRecording, t]);

  const stopRecordingAction = useCallback(async () => {
    console.log('Executing stop recording...');
    try {
      setIsProcessing(true);
      const dataDir = await appDataDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const savePath = `${dataDir}/recording-${timestamp}.wav`;
      console.log('Saving recording to:', savePath);
      console.log('About to call stop_recording command');
      const result = await invoke('stop_recording', {
        args: {
          save_path: savePath
        }
      });
      console.log('stop_recording command completed successfully:', result);
      setRecordingPath(savePath);
      // setShowPlayback(true);
      setIsProcessing(false);
      // Track successful transcription
      Analytics.trackTranscriptionSuccess();
      onRecordingStop(true);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
        if (error.message.includes('No recording in progress')) {
          return;
        }
      } else if (typeof error === 'string' && error.includes('No recording in progress')) {
        return;
      } else if (error && typeof error === 'object' && 'toString' in error) {
        if (error.toString().includes('No recording in progress')) {
          return;
        }
      }
      setIsProcessing(false);
      onRecordingStop(false);
    } finally {
      setIsStopping(false);
    }
  }, [onRecordingStop]);

  const handleStopRecording = useCallback(async () => {
    console.log('handleStopRecording called - isRecording:', isRecording, 'isStarting:', isStarting, 'isStopping:', isStopping);
    if (!isRecording || isStarting || isStopping) {
      console.log('Early return from handleStopRecording due to state check');
      return;
    }

    console.log('Stopping recording...');

    // Notify parent immediately (for UI state updates)
    onStopInitiated?.();

    setIsStopping(true);

    // Immediately trigger the stop action
    await stopRecordingAction();
  }, [isRecording, isStarting, isStopping, stopRecordingAction, onStopInitiated]);

  const handlePauseRecording = useCallback(async () => {
    if (!isRecording || isPaused || isPausing) return;

    console.log('Pausing recording...');
    setIsPausing(true);

    try {
      await invoke('pause_recording');
      // isPaused state now managed by RecordingStateContext via events
      console.log('Recording paused successfully');
    } catch (error) {
      console.error('Failed to pause recording:', error);
        alert(t('recording.pause_failed'));
    } finally {
      setIsPausing(false);
    }
  }, [isRecording, isPaused, isPausing, t]);

  const handleResumeRecording = useCallback(async () => {
    if (!isRecording || !isPaused || isResuming) return;

    console.log('Resuming recording...');
    setIsResuming(true);

    try {
      await invoke('resume_recording');
      // isPaused state now managed by RecordingStateContext via events
      console.log('Recording resumed successfully');
    } catch (error) {
      console.error('Failed to resume recording:', error);
        alert(t('recording.resume_failed'));
    } finally {
      setIsResuming(false);
    }
  }, [isRecording, isPaused, isResuming, t]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount if needed
    };
  }, []);

  useEffect(() => {
    console.log('Setting up recording event listeners');
    let unsubscribes: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        // Transcript error listener - handles both regular and actionable errors
        const transcriptErrorUnsubscribe = await listen('transcript-error', (event) => {
          console.log('transcript-error event received:', event);
          console.error('Transcription error received:', event.payload);
          const errorMessage = event.payload as string;

          Analytics.trackTranscriptionError(errorMessage);
          console.log('Tracked transcription error:', errorMessage);

          setTranscriptionErrors(prev => {
            const newCount = prev + 1;
            console.log('Transcription error count incremented:', newCount);
            return newCount;
          });
          setIsProcessing(false);
          console.log('Calling onRecordingStop(false) due to transcript error');
          onRecordingStop(false);
          if (onTranscriptionError) {
            onTranscriptionError(errorMessage);
          }
        });

        // Transcription error listener - handles structured error objects with actionable flag
        const transcriptionErrorUnsubscribe = await listen('transcription-error', (event) => {
          console.log('transcription-error event received:', event);
          console.error('Transcription error received:', event.payload);

          let errorMessage: string;
          let isActionable = false;

          if (typeof event.payload === 'object' && event.payload !== null) {
            const payload = event.payload as { error: string, userMessage: string, actionable: boolean };
            errorMessage = payload.userMessage || payload.error;
            isActionable = payload.actionable || false;
          } else {
            errorMessage = String(event.payload);
          }

          Analytics.trackTranscriptionError(errorMessage);
          console.log('Tracked transcription error:', errorMessage);

          setTranscriptionErrors(prev => {
            const newCount = prev + 1;
            console.log('Transcription error count incremented:', newCount);
            return newCount;
          });
          setIsProcessing(false);
          console.log('Calling onRecordingStop(false) due to transcription error');
          onRecordingStop(false);

          // For actionable errors (like model loading failures), the main page will handle showing the model selector
          // For regular errors, they are handled by useModalState global listener which shows a toast
          // We don't want to show a modal (via onTranscriptionError) AND a toast, so we skip the callback here
          /* if (onTranscriptionError && !isActionable) {
            onTranscriptionError(errorMessage);
          } */
        });

        // Pause/Resume events are now handled by RecordingStateContext
        // No need for duplicate listeners here

        // Speech detected listener - for UX feedback when VAD detects speech
        const speechDetectedUnsubscribe = await listen('speech-detected', (event) => {
          console.log('speech-detected event received:', event);
          setSpeechDetected(true);
        });

        unsubscribes = [
          transcriptErrorUnsubscribe,
          transcriptionErrorUnsubscribe,
          speechDetectedUnsubscribe
        ];
        console.log('Recording event listeners set up successfully');
      } catch (error) {
        console.error('Failed to set up recording event listeners:', error);
      }
    };

    setupListeners();

    return () => {
      console.log('Cleaning up recording event listeners');
      unsubscribes.forEach(unsubscribe => {
        if (unsubscribe && typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    };
  }, [onRecordingStop, onTranscriptionError]);

  return (
    <TooltipProvider>
      <div className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2 bg-card rounded-full shadow-lg border border-border px-4 py-2">
          {isProcessing && !isParentProcessing ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">{t("recording.processing")}</span>
            </div>
          ) : (
            <>
              {showPlayback ? (
                <>
                  <button
                    onClick={() => handleStartRecording(false)}
                    className="w-10 h-10 flex items-center justify-center bg-destructive rounded-full text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    <Mic size={16} />
                  </button>

                  <div className="w-px h-6 bg-border mx-1" />

                  <div className="flex items-center space-x-1 mx-2">
                    <div className="text-sm text-muted-foreground min-w-[40px]">
                      {formatTime(currentTime)}
                    </div>
                    <div
                      className="relative w-24 h-1 bg-muted rounded-full"
                    >
                      <div
                        className="absolute h-full bg-primary rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground min-w-[40px]">
                      {formatTime(duration)}
                    </div>
                  </div>

                  <button
                    className="w-10 h-10 flex items-center justify-center bg-muted rounded-full text-muted-foreground cursor-not-allowed"
                    disabled
                  >
                    <Play size={16} />
                  </button>
                </>
              ) : (
                <>
                  {!isRecording ? (
                    // Start recording buttons (Empezar a grabar & Grabar reunión)
                    <div className="flex items-center space-x-2 p-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              Analytics.trackButtonClick('start_recording', 'recording_controls');
                              handleStartRecording(false);
                            }}
                            disabled={isStarting || isProcessing || isRecordingDisabled || isValidatingModel}
                            className={`px-4 py-2 flex items-center space-x-2 text-xs font-semibold ${isStarting || isProcessing || isValidatingModel ? 'bg-muted text-muted-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                              } rounded-full transition-colors relative`}
                          >
                            {isValidatingModel ? (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current"></div>
                            ) : (
                              <Mic size={14} />
                            )}
                            <span>{t("recording.start")}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('recording.local_button_tooltip')}</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              Analytics.trackButtonClick('start_meeting_recording', 'recording_controls');
                              handleStartRecording(true);
                            }}
                            disabled={isStarting || isProcessing || isRecordingDisabled || isValidatingModel}
                            className={`px-4 py-2 flex items-center space-x-2 text-xs font-semibold ${isStarting || isProcessing || isValidatingModel ? 'bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                              } rounded-full transition-colors relative`}
                          >
                            <Monitor size={14} />
                            <span>{t('recording.record_meeting')}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('recording.meeting_button_tooltip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    // Recording controls (pause/resume + stop)
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              if (isPaused) {
                                Analytics.trackButtonClick('resume_recording', 'recording_controls');
                                handleResumeRecording();
                              } else {
                                Analytics.trackButtonClick('pause_recording', 'recording_controls');
                                handlePauseRecording();
                              }
                            }}
                            disabled={isPausing || isResuming || isStopping}
                            className={`w-10 h-10 flex items-center justify-center ${isPausing || isResuming || isStopping
                              ? 'bg-muted border border-border text-muted-foreground/60'
                              : 'bg-card border border-border text-muted-foreground hover:border-primary/40 hover:bg-muted'
                              } rounded-full transition-colors relative`}
                          >
                            {isPaused ? <Play size={16} /> : <Pause size={16} />}
                            {(isPausing || isResuming) && (
                              <div className="absolute -top-8 text-muted-foreground font-medium text-xs">
                                {isPausing ? t("recording.pausing") : t("recording.resuming")}
                              </div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isPaused ? t("recording.resume") : t("recording.pause")}</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              Analytics.trackButtonClick('stop_recording', 'recording_controls');
                              handleStopRecording();
                            }}
                            disabled={isStopping || isPausing || isResuming}
                            className={`w-10 h-10 flex items-center justify-center ${isStopping || isPausing || isResuming ? 'bg-muted text-muted-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                              } rounded-full transition-colors relative`}
                          >
                            <Square size={16} />
                            {isStopping && (
                              <div className="absolute -top-8 text-muted-foreground font-medium text-xs">
                                {t("recording.stopping")}
                              </div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("recording.stop")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}

                  <div className="flex items-center space-x-1 mx-4">
                    {barHeights.map((height, index) => (
                      <div
                        key={index}
                        className={`w-1 rounded-full transition-all duration-200 ${isPaused ? 'bg-impulso-ocean' : 'bg-destructive'
                          }`}
                        style={{
                          height: isRecording && !isPaused ? height : '4px',
                          opacity: isPaused ? 0.6 : 1,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Show validation status only */}
        {isValidatingModel && (
          <div className="text-xs text-muted-foreground text-center mt-2">
            {t("recording.validating")}
          </div>
        )}

        {/* Device error alert */}
        {deviceError && (
          <Alert variant="destructive" className="mt-4 bg-destructive/5">
            <AlertCircle className="h-5 w-5" />
            <button
              onClick={() => setDeviceError(null)}
              className="absolute right-3 top-3 text-destructive hover:text-destructive/80 transition-colors"
              aria-label={t('recording.alert_close')}
            >
              <X className="h-4 w-4" />
            </button>
            <AlertTitle className="font-semibold mb-2">
              {deviceError.title}
            </AlertTitle>
            <AlertDescription className="text-destructive">
              {deviceError.message.split('\n').map((line, i) => (
                <div key={i} className={i > 0 ? 'ml-2' : ''}>
                  {line}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {/* {showPlayback && recordingPath && (
        <div className="text-sm text-muted-foreground px-4">
          Recording saved to: {recordingPath}
        </div>
      )} */}
      </div>
    </TooltipProvider>
  );
};
