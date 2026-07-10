/**
 * Recording Service
 *
 * Handles all recording lifecycle Tauri backend calls and events.
 * Pure 1-to-1 wrapper - no error handling changes, exact same behavior as direct invoke/listen calls.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface RecordingState {
  is_recording: boolean;
  is_paused: boolean;
  is_active: boolean;
  recording_duration: number | null;
  active_duration: number | null;
}

export interface RecordingStoppedPayload {
  message: string;
  folder_path?: string;
  meeting_name?: string;
}

export interface SpeakerNameEntry {
  speaker_id: string;
  display_name: string;
}

export interface DiarizationModelDownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  downloaded_mb: number;
  total_mb: number;
  speed_mbps: number;
  percent: number;
}

/**
 * Recording Service
 * Singleton service for managing recording lifecycle operations
 */
export class RecordingService {
  /**
   * Check if recording is currently active
   * @returns Promise<boolean>
   */
  async isRecording(): Promise<boolean> {
    return invoke<boolean>('is_recording');
  }

  /**
   * Get comprehensive recording state (includes durations)
   * @returns Promise with full recording state
   */
  async getRecordingState(): Promise<RecordingState> {
    return invoke<RecordingState>('get_recording_state');
  }

  /**
   * Get current meeting name
   * @returns Promise<string | null>
   */
  async getRecordingMeetingName(): Promise<string | null> {
    return invoke<string | null>('get_recording_meeting_name');
  }

  /**
   * Start recording (no device configuration)
   * @returns Promise<void>
   */
  async startRecording(enableDiarization: boolean = false): Promise<void> {
    return invoke('start_recording', { enableDiarization });
  }

  /**
   * Start recording with device configuration and meeting name
   * @param micDeviceName - Microphone device name (null for default)
   * @param systemDeviceName - System audio device name (null for none)
   * @param meetingName - Meeting name/title
   * @param enableDiarization - Whether active speaker identification is enabled
   * @returns Promise<void>
   */
  async startRecordingWithDevices(
    micDeviceName: string | null,
    systemDeviceName: string | null,
    meetingName: string,
    enableDiarization: boolean = false
  ): Promise<void> {
    return invoke('start_recording_with_devices_and_meeting', {
      micDeviceName,
      systemDeviceName,
      meetingName,
      enableDiarization
    });
  }

  /**
   * Stop recording and save to file
   * @param savePath - Path to save audio file
   * @returns Promise<void>
   */
  async stopRecording(savePath: string): Promise<void> {
    return invoke('stop_recording', {
      args: { save_path: savePath }
    });
  }

  /**
   * Run local speaker diarization for a saved meeting
   * @param meetingId - Meeting database identifier
   * @returns Promise<number> number of discovered non-mic speakers
   */
  async diarizeMeeting(meetingId: string): Promise<number> {
    return invoke<number>('diarize_meeting', { meetingId });
  }

  /**
   * Get the persisted display names for a meeting's speakers
   */
  async listSpeakerNames(meetingId: string): Promise<SpeakerNameEntry[]> {
    return invoke<SpeakerNameEntry[]>('list_speaker_names', { meetingId });
  }

  /**
   * Rename a speaker within a meeting
   */
  async renameSpeaker(
    meetingId: string,
    speakerId: string,
    displayName: string
  ): Promise<void> {
    return invoke('rename_speaker', {
      meetingId,
      speakerId,
      displayName,
    });
  }

  /**
   * Pause active recording
   * @returns Promise<void>
   */
  async pauseRecording(): Promise<void> {
    return invoke('pause_recording');
  }

  /**
   * Resume paused recording
   * @returns Promise<void>
   */
  async resumeRecording(): Promise<void> {
    return invoke('resume_recording');
  }

  // Event Listeners

  /**
   * Listen for recording-started event
   * @param callback - Function to call when recording starts
   * @returns Promise that resolves to unlisten function
   */
  async onRecordingStarted(callback: () => void): Promise<UnlistenFn> {
    return listen('recording-started', callback);
  }

  /**
   * Listen for recording-stopped event (with metadata)
   * @param callback - Function to call when recording stops
   * @returns Promise that resolves to unlisten function
   */
  async onRecordingStopped(callback: (payload: RecordingStoppedPayload) => void): Promise<UnlistenFn> {
    return listen<RecordingStoppedPayload>('recording-stopped', (event) => {
      callback(event.payload);
    });
  }

  /**
   * Listen for recording-paused event
   * @param callback - Function to call when recording is paused
   * @returns Promise that resolves to unlisten function
   */
  async onRecordingPaused(callback: () => void): Promise<UnlistenFn> {
    return listen('recording-paused', callback);
  }

  /**
   * Listen for recording-resumed event
   * @param callback - Function to call when recording resumes
   * @returns Promise that resolves to unlisten function
   */
  async onRecordingResumed(callback: () => void): Promise<UnlistenFn> {
    return listen('recording-resumed', callback);
  }

  /**
   * Listen for chunk-drop-warning event (audio buffer overflow)
   * @param callback - Function to call when chunks are dropped
   * @returns Promise that resolves to unlisten function
   */
  async onChunkDropWarning(callback: (warning: string) => void): Promise<UnlistenFn> {
    return listen<string>('chunk-drop-warning', (event) => {
      callback(event.payload);
    });
  }

  /**
   * Listen for speech-detected event (VAD)
   * @param callback - Function to call when speech is detected
   * @returns Promise that resolves to unlisten function
   */
  async onSpeechDetected(callback: () => void): Promise<UnlistenFn> {
    return listen('speech-detected', callback);
  }

  /**
   * Listen for diarization model (WeSpeaker) download progress.
   * Emitted only during the first diarization run while the ~26 MB model downloads.
   * @param callback - Function to call with each progress update
   * @returns Promise that resolves to unlisten function
   */
  async onDiarizationModelDownloadProgress(
    callback: (progress: DiarizationModelDownloadProgress) => void
  ): Promise<UnlistenFn> {
    return listen<DiarizationModelDownloadProgress>(
      'diarization-model-download-progress',
      (event) => {
        callback(event.payload);
      }
    );
  }
}

// Export singleton instance
export const recordingService = new RecordingService();
