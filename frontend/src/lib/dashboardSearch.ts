export interface HighlightPart {
  text: string;
  highlighted: boolean;
}

export function formatSearchTimestamp(timestamp: string): string {
  const trimmed = timestamp.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return timestamp;
  const totalSeconds = Math.floor(Number(trimmed));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
}

export function splitHighlightedText(text: string, query: string): HighlightPart[] {
  const needle = query.trim();
  if (!needle) return [{ text, highlighted: false }];
  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerNeedle, cursor);
    if (matchIndex < 0) {
      parts.push({ text: text.slice(cursor), highlighted: false });
      break;
    }
    if (matchIndex > cursor) parts.push({ text: text.slice(cursor, matchIndex), highlighted: false });
    parts.push({ text: text.slice(matchIndex, matchIndex + needle.length), highlighted: true });
    cursor = matchIndex + needle.length;
  }
  return parts.length ? parts : [{ text, highlighted: false }];
}
