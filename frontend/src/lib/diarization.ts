import { toast } from 'sonner';
import { recordingService } from '@/services/recordingService';
import type { TranslationKey } from '@/contexts/TranslationContext';

type TFn = (key: TranslationKey) => string;

/**
 * Maps a raw diarization backend error into a friendly, localized description.
 * The backend returns diagnostic English strings (e.g. "has no folder_path",
 * "No diarizable transcript slices found", "download timed out"); we surface a
 * clear Spanish/English message instead of dumping the raw error on the user.
 */
export function mapDiarizationError(error: unknown, t: TFn): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('folder_path') || lower.includes('no audio file') || lower.includes('locate audio')) {
    return t('speakers.error_no_audio');
  }
  if (lower.includes('no transcripts') || lower.includes('diarizable') || lower.includes('slices')) {
    return t('speakers.error_no_segments');
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return t('speakers.error_timeout');
  }
  return t('speakers.identify_failed_desc');
}

/**
 * Runs local speaker diarization for a meeting, owning the full toast lifecycle:
 * a loading toast, live WeSpeaker model download progress (first run only), and
 * success/error results with localized copy. The caller supplies the toast id
 * (so concurrent flows don't clash) and an optional onSuccess hook (e.g. to
 * refetch transcripts).
 */
export async function runDiarization(opts: {
  meetingId: string;
  toastId: string;
  t: TFn;
  onSuccess?: (speakerCount: number) => void | Promise<void>;
}): Promise<void> {
  const { meetingId, toastId, t, onSuccess } = opts;

  toast.loading(t('speakers.identifying'), { id: toastId, duration: 0 });

  let unlisten: (() => void) | undefined;

  try {
    // Surface the one-time ~26 MB model download so the first run doesn't look frozen.
    // Keep listener setup inside the error boundary so setup failures are localized too.
    unlisten = await recordingService.onDiarizationModelDownloadProgress((progress) => {
      if (progress.percent < 100) {
        toast.loading(
          t('speakers.downloading_model').replace('{pct}', String(progress.percent)),
          { id: toastId, duration: 0 }
        );
      } else {
        toast.loading(t('speakers.identifying'), { id: toastId, duration: 0 });
      }
    });

    const speakerCount = await recordingService.diarizeMeeting(meetingId);
    toast.success(
      speakerCount > 0
        ? t('speakers.identified').replace('{n}', String(speakerCount + 1))
        : t('speakers.identification_complete'),
      { id: toastId }
    );
    if (onSuccess) {
      await onSuccess(speakerCount);
    }
  } catch (error) {
    console.error('Speaker diarization failed:', error);
    toast.error(t('speakers.identify_failed'), {
      id: toastId,
      description: mapDiarizationError(error, t),
    });
  } finally {
    unlisten?.();
  }
}
