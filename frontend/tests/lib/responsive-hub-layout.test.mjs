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

  assert.match(nav, /<nav className="[^"\n]*\bsticky\b[^"\n]*\btop-0\b[^"\n]*\bz-50\b/);
});

test('Inicio keeps a document-level 1366px layout instead of clipping the dashboard', () => {
  const home = read('src/app/page.tsx');
  const dashboard = read('src/components/DashboardScreen.tsx');

  assert.match(home, /className="flex flex-col min-h-dvh bg-background"/);
  assert.match(dashboard, /className="bg-grid-subtle min-h-dvh font-sans flex flex-col relative"/);
  assert.doesNotMatch(dashboard, /className="[^"]*h-screen[^"]*"/);
  assert.doesNotMatch(dashboard, /<main className="[^"]*overflow-hidden/);
  assert.match(dashboard, /<main className="flex-1 flex flex-col px-4 py-6 sm:px-6 xl:px-8 max-w-\[1600px\] mx-auto w-full">/);
  assert.match(dashboard, /grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8/);
  assert.match(dashboard, /col-span-1 xl:col-span-3/);
  assert.match(dashboard, /col-span-1 xl:col-span-5/);
  assert.match(dashboard, /col-span-1 xl:col-span-4/);
});

test('Intelligence uses the shared summary selector in a vertically scrollable responsive workspace', () => {
  const intelligence = read('src/components/IntelligenceScreen.tsx');

  assert.match(intelligence, /import \{ SummaryModelSelector \} from '@\/components\/SummaryModelSelector';/);
  assert.match(intelligence, /<SummaryModelSelector provider=\{modelConfig\.provider as 'openrouter' \| 'claude' \| 'openai' \| 'groq'\}/);
  assert.match(intelligence, /className="bg-grid-subtle min-h-dvh font-sans flex flex-col relative"/);
  assert.doesNotMatch(intelligence, /<div className="bg-grid-subtle[^"\n]*overflow-hidden/);
  assert.match(intelligence, /<main className="flex-1 px-4 py-6 sm:px-6 xl:px-8 max-w-\[1600px\] mx-auto w-full grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8">/);
  assert.match(intelligence, /col-span-1 xl:col-span-4/);
  assert.doesNotMatch(intelligence, /remote.*transcription|transcription.*remote/i);
});

test('Intelligence keeps transcript, participants, and tab content in the document scroll route', () => {
  const intelligence = read('src/components/IntelligenceScreen.tsx');

  assert.doesNotMatch(intelligence, /overflow-y-auto/);
  assert.doesNotMatch(intelligence, /max-h-\[(?:120|550|600)px\]/);
  assert.doesNotMatch(intelligence, /overflow-x-auto/);
});

test('Reuniones reflows metrics and filters at the 1366px baseline while restricting horizontal scroll to the table', () => {
  const meetings = read('src/app/compromisos/page.tsx');

  assert.match(meetings, /className="bg-grid-subtle min-h-dvh font-sans flex flex-col"/);
  assert.match(meetings, /px-4 py-6 sm:px-6 xl:px-8/);
  assert.match(meetings, /grid gap-4 md:grid-cols-2 2xl:grid-cols-4/);
  assert.match(meetings, /grid gap-3 md:grid-cols-2 2xl:grid-cols-3/);
  assert.match(meetings, /grid gap-4 md:grid-cols-2 2xl:grid-cols-4/);
  assert.doesNotMatch(meetings, /className="[^"]*overflow-hidden[^"]*"/);
  assert.match(meetings, /<div className="overflow-x-auto">\s*<table/);
});

test('Ajustes reuses SettingsPanel in the same document-scroll responsive shell', () => {
  const settings = read('src/app/settings/page.tsx');

  assert.match(settings, /className="min-h-dvh bg-background"/);
  assert.match(settings, /className="max-w-6xl mx-auto px-4 py-6 sm:px-6 xl:px-8"/);
  assert.match(settings, /<SettingsPanel \/>/);
});
