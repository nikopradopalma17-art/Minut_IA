export interface SpeakerLabelOptions {
  /** Custom display names keyed by canonical speaker id (speaker_0, speaker_1, ...) */
  names?: Record<string, string>;
  /** Localized fallback template containing {n}, e.g. "Hablante {n}" */
  labelTemplate?: string;
}

/**
 * Normalize the raw transcripts.speaker value to a canonical id.
 * Tier 1 writes 'mic'/'system'; Tier 2 diarization rewrites to 'speaker_N'.
 */
export function canonicalSpeakerId(speaker?: string | null): string | undefined {
  if (!speaker) {
    return undefined;
  }

  const normalized = speaker.trim().toLowerCase();

  if (normalized === 'mic' || normalized === 'microphone' || normalized === 'speaker_0') {
    return 'speaker_0';
  }

  if (normalized === 'system' || normalized === 'system_audio') {
    return 'speaker_1';
  }

  if (/^speaker_\d+$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

export function formatSpeakerLabel(
  speaker?: string | null,
  options?: SpeakerLabelOptions
): string | undefined {
  const canonical = canonicalSpeakerId(speaker);

  if (!canonical) {
    // Unknown non-empty values (e.g. an already-resolved name) pass through
    return speaker?.trim() ? speaker : undefined;
  }

  const custom = options?.names?.[canonical];
  if (custom && custom.trim()) {
    return custom;
  }

  const index = Number(canonical.replace('speaker_', ''));
  const template = options?.labelTemplate ?? 'Hablante {n}';
  return template.replace('{n}', String(index + 1));
}
