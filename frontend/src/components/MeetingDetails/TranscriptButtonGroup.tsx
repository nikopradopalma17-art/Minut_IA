"use client";

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, FolderOpen, RefreshCw, Users } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { RetranscribeDialog } from './RetranscribeDialog';
import { useConfig } from '@/contexts/ConfigContext';
import { runDiarization } from '@/lib/diarization';
import { useTranslation } from '@/contexts/TranslationContext';


interface TranscriptButtonGroupProps {
  transcriptCount: number;
  onCopyTranscript: () => void;
  onOpenMeetingFolder: () => Promise<void>;
  meetingId?: string;
  meetingFolderPath?: string | null;
  onRefetchTranscripts?: () => Promise<void>;
}


export function TranscriptButtonGroup({
  transcriptCount,
  onCopyTranscript,
  onOpenMeetingFolder,
  meetingId,
  meetingFolderPath,
  onRefetchTranscripts,
}: TranscriptButtonGroupProps) {
  const { t } = useTranslation();
  const { betaFeatures } = useConfig();
  const [showRetranscribeDialog, setShowRetranscribeDialog] = useState(false);
  const [isDiarizing, setIsDiarizing] = useState(false);

  const handleRetranscribeComplete = useCallback(async () => {
    // Refetch transcripts to show the updated data
    if (onRefetchTranscripts) {
      await onRefetchTranscripts();
    }
  }, [onRefetchTranscripts]);

  const handleDiarizeMeeting = useCallback(async () => {
    if (!meetingId || !meetingFolderPath || isDiarizing) {
      return;
    }

    setIsDiarizing(true);
    try {
      await runDiarization({
        meetingId,
        toastId: 'meeting-diarization',
        t,
        onSuccess: onRefetchTranscripts,
      });
    } finally {
      setIsDiarizing(false);
    }
  }, [meetingId, meetingFolderPath, isDiarizing, onRefetchTranscripts, t]);

  return (
    <div className="flex items-center justify-center w-full gap-2">
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            Analytics.trackButtonClick('copy_transcript', 'meeting_details');
            onCopyTranscript();
          }}
          disabled={transcriptCount === 0}
          title={transcriptCount === 0 ? t('transcript_view.no_transcript_available') : t('transcript_view.copy_transcript')}
        >
          <Copy />
          <span className="hidden lg:inline">{t('common.copy')}</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="xl:px-4"
          onClick={() => {
            Analytics.trackButtonClick('open_recording_folder', 'meeting_details');
            onOpenMeetingFolder();
          }}
          title={t('transcript_view.open_folder_title')}
        >
          <FolderOpen className="xl:mr-2" size={18} />
          <span className="hidden lg:inline">{t('transcript_view.recording')}</span>
        </Button>

        {betaFeatures.importAndRetranscribe && meetingId && meetingFolderPath && (
          <Button
            size="sm"
            variant="outline"
            className="bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 xl:px-4"
            onClick={() => {
              Analytics.trackButtonClick('enhance_transcript', 'meeting_details');
              setShowRetranscribeDialog(true);
            }}
            title={t('transcript_view.enhance_title')}
          >
            <RefreshCw className="xl:mr-2" size={18} />
            <span className="hidden lg:inline">{t('transcript_view.enhance')}</span>
          </Button>
        )}

        {meetingId && meetingFolderPath && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-200 xl:px-4"
            onClick={() => {
              Analytics.trackButtonClick('identify_speakers', 'meeting_details');
              void handleDiarizeMeeting();
            }}
            disabled={isDiarizing}
            title={t('speakers.identify')}
          >
            <Users className="xl:mr-2" size={18} />
            <span className="hidden lg:inline">{t('speakers.identify')}</span>
          </Button>
        )}
      </ButtonGroup>

      {betaFeatures.importAndRetranscribe && meetingId && meetingFolderPath && (
        <RetranscribeDialog
          open={showRetranscribeDialog}
          onOpenChange={setShowRetranscribeDialog}
          meetingId={meetingId}
          meetingFolderPath={meetingFolderPath}
          onComplete={handleRetranscribeComplete}
        />
      )}
    </div>
  );
}
