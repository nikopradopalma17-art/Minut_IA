export function normalizeMeetingNamePrefix(prefix: string): string {
  const sanitizedPrefix = prefix.replace(/[\\/:*?"<>|]/g, '').trim();
  return sanitizedPrefix || 'Reunión';
}
