import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(frontendDir, file), 'utf8');

test('hub navigation remains sticky above every vertically scrolling screen', () => {
  const nav = read('src/components/HubTopNav.tsx');
  const dashboard = read('src/components/DashboardScreen.tsx');
  const intelligence = read('src/components/IntelligenceScreen.tsx');
  const meetings = read('src/app/compromisos/page.tsx');
  const settings = read('src/app/settings/page.tsx');

  assert.match(nav, /<nav className="[^"\n]*\bsticky\b[^"\n]*\btop-0\b[^"\n]*\bz-50\b/);
  assert.match(dashboard, /<HubTopNav\s+active="inicio"/);
  assert.match(intelligence, /<HubTopNav/);
  assert.match(meetings, /<HubTopNav\s+active="reuniones"/);
  assert.match(settings, /<HubTopNav\s+active="ajustes"/);
});

test('Inicio keeps the 1366px dashboard inside the fixed application shell', () => {
  const home = read('src/app/page.tsx');
  const dashboard = read('src/components/DashboardScreen.tsx');

  assert.match(home, /className="flex flex-col h-dvh bg-background overflow-hidden"/);
  assert.match(dashboard, /className="bg-grid-subtle\s+h-dvh\s+font-sans flex flex-col relative\s+overflow-hidden"/);
  assert.doesNotMatch(dashboard, /className="[^"]*h-screen[^"]*"/);
  assert.match(dashboard, /<main className="flex-1 min-h-0 flex flex-col px-4 py-6 sm:px-6 xl:px-8 max-w-\[1600px\] mx-auto w-full overflow-y-auto">/);
  assert.match(dashboard, /grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8/);
  assert.match(dashboard, /col-span-1 xl:col-span-3/);
  assert.match(dashboard, /col-span-1 xl:col-span-5/);
  assert.match(dashboard, /col-span-1 xl:col-span-4/);
});

test('Intelligence uses the shared summary selector in the fixed responsive workspace', () => {
  const intelligence = read('src/components/IntelligenceScreen.tsx');

  assert.match(intelligence, /import \{ SummaryModelSelector \} from '@\/components\/SummaryModelSelector';/);
  assert.match(intelligence, /<SummaryModelSelector provider=\{modelConfig\.provider as 'openrouter' \| 'claude' \| 'openai' \| 'groq'\}/);
  assert.match(intelligence, /className="bg-grid-subtle h-dvh font-sans flex flex-col relative overflow-hidden"/);
  assert.match(intelligence, /<main className="flex-1 min-h-0 px-4 py-6 sm:px-6 xl:px-8 max-w-\[1600px\] mx-auto w-full grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8 overflow-y-hidden">/);
  assert.match(intelligence, /col-span-1 xl:col-span-4/);
  assert.doesNotMatch(intelligence, /remote.*transcription|transcription.*remote/i);
});

test('Intelligence keeps transcript, participants, and tab content scrollable inside the workspace', () => {
  const intelligence = read('src/components/IntelligenceScreen.tsx');

  assert.match(intelligence, /space-y-4 flex-1 min-h-0 overflow-y-auto/);
  assert.match(intelligence, /space-y-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar/);
  assert.match(intelligence, /flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar/);
  assert.doesNotMatch(intelligence, /max-h-\[(?:120|550|600)px\]/);
  assert.doesNotMatch(intelligence, /overflow-x-auto/);
});

test('Reuniones reflows metrics and filters at the 1366px baseline within the fixed shell', () => {
  const meetings = read('src/app/compromisos/page.tsx');

  assert.match(meetings, /className="bg-grid-subtle h-dvh font-sans flex flex-col overflow-hidden"/);
  assert.match(meetings, /px-4 py-6 sm:px-6 xl:px-8/);
  assert.match(meetings, /grid gap-4 md:grid-cols-2 2xl:grid-cols-4/);
  assert.match(meetings, /grid gap-3 md:grid-cols-2 2xl:grid-cols-3/);
  assert.match(meetings, /grid gap-4 md:grid-cols-2 2xl:grid-cols-4/);
  assert.match(meetings, /max-w-\[1600px\] flex-1 min-h-0 flex-col[^"\n]*overflow-y-auto/);
  assert.match(meetings, /<div className="overflow-x-auto">\s*<table/);
});

test('Ajustes reuses SettingsPanel in the same fixed responsive shell', () => {
  const settings = read('src/app/settings/page.tsx');

  assert.match(settings, /className="h-dvh bg-background overflow-hidden flex flex-col"/);
  assert.match(settings, /className="flex-1 min-h-0 overflow-y-auto max-w-6xl mx-auto px-4 py-6 sm:px-6 xl:px-8 w-full"/);
  assert.match(settings, /<SettingsPanel \/>/);
});
