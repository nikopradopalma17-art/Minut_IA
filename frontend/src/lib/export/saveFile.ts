import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

export function sanitizeFileName(input: string): string {
  return (
    input
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 120) || 'minutia-export'
  );
}

interface SaveTextOptions {
  defaultPath: string;
  text: string;
  filters: Array<{ name: string; extensions: string[] }>;
}

interface SaveBinaryOptions {
  defaultPath: string;
  data: Uint8Array;
  filters: Array<{ name: string; extensions: string[] }>;
}

export async function saveTextFile({
  defaultPath,
  text,
  filters,
}: SaveTextOptions): Promise<string | null> {
  const path = await save({ defaultPath, filters });
  if (!path) {
    return null;
  }

  await writeTextFile(path, text);
  return path;
}

export async function saveBinaryFile({
  defaultPath,
  data,
  filters,
}: SaveBinaryOptions): Promise<string | null> {
  const path = await save({ defaultPath, filters });
  if (!path) {
    return null;
  }

  await writeFile(path, data);
  return path;
}
