export function formatSpeakerLabel(speaker?: string | null): string | undefined {
  if (!speaker) {
    return undefined;
  }

  const normalized = speaker.trim().toLowerCase();

  if (normalized === 'mic' || normalized === 'microphone' || normalized === 'speaker_0') {
    return 'Hablante 1';
  }

  if (normalized === 'system' || normalized === 'system_audio' || normalized === 'speaker_1') {
    return 'Hablante 2';
  }

  const speakerIndex = normalized.match(/^speaker_(\d+)$/);
  if (speakerIndex) {
    return `Hablante ${Number(speakerIndex[1]) + 1}`;
  }

  return speaker;
}
