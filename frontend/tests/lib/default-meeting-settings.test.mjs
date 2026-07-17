import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const readSource = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('persists meeting and template defaults in ConfigContext', async () => {
  const source = await readSource('src/contexts/ConfigContext.tsx');

  assert.match(source, /meetingNamePrefix:\s*string/);
  assert.match(source, /defaultTemplateId:\s*string/);
  assert.match(source, /localStorage\.setItem\('meetingNamePrefix'/);
  assert.match(source, /localStorage\.setItem\('defaultTemplateId'/);
});

test('normalizes forbidden meeting-prefix characters and empty values', async () => {
  const source = await readSource('src/lib/meetingDefaults.ts');
  const executableSource = source
    .replace('export function', 'function')
    .replace('(prefix: string): string', '(prefix)');
  const context = {};
  vm.runInNewContext(`${executableSource}\nthis.normalizeMeetingNamePrefix = normalizeMeetingNamePrefix;`, context);

  const cases = [
    ['Cliente/Proyecto', 'ClienteProyecto'],
    ['Cliente\\Proyecto', 'ClienteProyecto'],
    ['A/\\:*?"<>|B', 'AB'],
    ['', 'Reunión'],
    ['   ', 'Reunión'],
    ['/\\:*?"<>|', 'Reunión'],
    ['  Comité semanal  ', 'Comité semanal'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(context.normalizeMeetingNamePrefix(input), expected, input || '<empty>');
  }
});

test('uses the MinutIA dotted meeting-name format in every fallback', async () => {
  const [recordingStart, transcriptContext, recordingCommands, page] = await Promise.all([
    readSource('src/hooks/useRecordingStart.ts'),
    readSource('src/contexts/TranscriptContext.tsx'),
    readSource('src-tauri/src/audio/recording_commands.rs'),
    readSource('src/app/page.tsx'),
  ]);

  assert.match(recordingStart, /`\$\{meetingNamePrefix\}\.\$\{year\}-\$\{month\}-\$\{day\}\.\$\{hours\}\.\$\{minutes\}`/);
  assert.match(transcriptContext, /`Reunión\.\$\{year\}-\$\{month\}-\$\{day\}\.\$\{hours\}\.\$\{minutes\}`/);
  assert.equal((recordingCommands.match(/format!\("Reunión\.\{\}"/g) || []).length, 2);
  assert.match(page, /\$\{'Reunión'\}\.\$\{timestamp\}\.wav/);
});

test('loads the configured template and declares localized default-setting labels', async () => {
  const [templates, preferences, es, en] = await Promise.all([
    readSource('src/hooks/meeting-details/useTemplates.ts'),
    readSource('src/components/PreferenceSettings.tsx'),
    readSource('src/constants/locales/es.ts'),
    readSource('src/constants/locales/en.ts'),
  ]);

  assert.match(templates, /localStorage\.getItem\('defaultTemplateId'\)/);
  assert.match(preferences, /settings\.defaults_title/);
  for (const locale of [es, en]) {
    for (const key of [
      'settings.defaults_title',
      'settings.defaults_desc',
      'settings.default_template',
      'settings.default_model',
      'settings.default_model_hint',
      'settings.meeting_prefix',
      'settings.meeting_prefix_hint',
    ]) {
      assert.ok(locale.includes(`"${key}"`), `missing locale key ${key}`);
    }
  }
});

test('general preferences omit unrelated language, storage, and notification controls', async () => {
  const [preferences, es, en] = await Promise.all([
    readSource('src/components/PreferenceSettings.tsx'),
    readSource('src/constants/locales/es.ts'),
    readSource('src/constants/locales/en.ts'),
  ]);

  assert.doesNotMatch(preferences, /AnalyticsConsentSwitch/);
  assert.doesNotMatch(preferences, /settings\.language_label|settings\.storage_title|settings\.notifications_title/);
  assert.doesNotMatch(preferences, /setLanguage|loadPreferences|open_recordings_folder/);
  assert.match(es, /"settings_modal\.preferences_title": "Ajustes"/);
  assert.match(en, /"settings_modal\.preferences_title": "Settings"/);
});
