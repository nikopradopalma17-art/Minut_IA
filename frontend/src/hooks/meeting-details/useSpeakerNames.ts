'use client';

import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { recordingService } from '@/services/recordingService';

/**
 * Loads and keeps in sync the custom speaker display names for a meeting.
 * Refreshes on diarization-complete / speaker-name-updated backend events.
 */
export function useSpeakerNames(meetingId?: string | null) {
  const [names, setNames] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!meetingId) {
      setNames({});
      return;
    }

    try {
      const entries = await recordingService.listSpeakerNames(meetingId);
      const map: Record<string, string> = {};
      for (const entry of entries) {
        map[entry.speaker_id] = entry.display_name;
      }
      setNames(map);
    } catch (error) {
      console.error('Failed to load speaker names:', error);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!meetingId) {
      return;
    }

    let disposed = false;
    const unlistenPromises = [
      listen<{ meeting_id: string }>('diarization-complete', (event) => {
        if (!disposed && event.payload?.meeting_id === meetingId) {
          refresh();
        }
      }),
      listen<{ meeting_id: string }>('speaker-name-updated', (event) => {
        if (!disposed && event.payload?.meeting_id === meetingId) {
          refresh();
        }
      }),
    ];

    return () => {
      disposed = true;
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()).catch(() => {}));
    };
  }, [meetingId, refresh]);

  const rename = useCallback(
    async (speakerId: string, displayName: string) => {
      if (!meetingId) {
        return;
      }
      await recordingService.renameSpeaker(meetingId, speakerId, displayName);
      // Optimistic update; the speaker-name-updated event will confirm
      setNames((prev) => ({ ...prev, [speakerId]: displayName }));
    },
    [meetingId]
  );

  return { names, refresh, rename };
}
