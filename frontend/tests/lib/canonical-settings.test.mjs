import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = async (relativePath) => {
  try {
    return await readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
};

test('settings page and hub dialog reuse the canonical four-tab panel', async () => {
  const [panel, page, modal] = await Promise.all([
    readSource('src/components/SettingsPanel.tsx'),
    readSource('src/app/settings/page.tsx'),
    readSource('src/app/_components/SettingsModal.tsx'),
  ]);

  const tabValues = [...panel.matchAll(/<TabsContent value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabValues, ['general', 'recording', 'transcription', 'summary']);

  assert.match(page, /import HubTopNav from ['"]@\/components\/HubTopNav['"]/);
  assert.match(page, /<HubTopNav active="ajustes"\s*\/>/);
  assert.match(page, /<SettingsPanel\s*\/>/);
  assert.match(modal, /<SettingsPanel\s*\/>/);
  assert.doesNotMatch(modal, /settings_modal\.ai_model_config/);
});

test('recording and transcription child setting UIs are fully localized', async () => {
  const [devices, whisper, parakeet, es, en] = await Promise.all([
    readSource('src/components/DeviceSelection.tsx'),
    readSource('src/components/WhisperModelManager.tsx'),
    readSource('src/components/ParakeetModelManager.tsx'),
    readSource('src/constants/locales/es.ts'),
    readSource('src/constants/locales/en.ts'),
  ]);

  const deviceKeys = [
    'settings.audio_devices',
    'settings.audio_devices_load_failed',
    'settings.refresh_devices',
    'settings.microphone',
    'settings.select_microphone',
    'settings.default_microphone',
    'settings.no_microphone_devices',
    'settings.no_microphone_to_monitor',
    'settings.microphone_levels',
    'settings.audio_monitor_start_failed',
    'settings.system_audio',
    'settings.select_system_audio',
    'settings.default_system_audio',
    'settings.no_system_audio_devices',
    'settings.microphone_info',
    'settings.system_audio_info',
    'settings.microphone_levels_info',
    'settings.tip',
    'settings.microphone_test_tip',
  ];
  const modelKeys = [
    'settings.models_load_failed',
    'settings.transcription_models_load_failed',
    'settings.model_ready',
    'settings.model_ready_desc',
    'settings.model_download_failed',
    'settings.retry',
    'settings.download_cancelled',
    'settings.download_failed',
    'settings.downloading_model',
    'settings.download_wait',
    'settings.model_switched',
    'settings.model_deleted',
    'settings.model_removed_desc',
    'settings.delete_failed',
    'settings.advanced_models',
    'settings.using_model_for_transcription',
    'settings.recommended',
    'settings.ready',
    'settings.delete_model_title',
    'settings.download',
    'settings.delete',
    'settings.redownload',
    'settings.downloading',
    'settings.cancel_download',
    'settings.cancel',
  ];

  for (const source of [devices, whisper, parakeet]) {
    assert.match(source, /useTranslation/);
  }
  for (const key of deviceKeys) {
    assert.match(devices, new RegExp(`t\\(['\"]${key}['\"]\\)`));
  }
  for (const key of modelKeys) {
    assert.match(whisper + parakeet, new RegExp(`t\\(['\"]${key}['\"]\\)`));
  }
  for (const key of [...deviceKeys, ...modelKeys]) {
    assert.ok(es.includes(`"${key}"`), `Spanish locale is missing ${key}`);
    assert.ok(en.includes(`"${key}"`), `English locale is missing ${key}`);
  }

  const visibleCopy = devices + whisper + parakeet;
  assert.doesNotMatch(visibleCopy, />\s*(Audio Devices|Microphone|System Audio|Advanced Models|Recommended|Ready|Download|Retry|Delete|Re-download|Downloading\.\.\.|Cancel)\s*</);
  assert.doesNotMatch(visibleCopy, /placeholder="(Select Microphone|Select System Audio)"/);
  assert.doesNotMatch(visibleCopy, /(Failed to load audio devices|No microphone devices found|No system audio devices found|Records your voice and ambient sound|Records computer audio|Failed to load transcription models|Model downloaded and ready to use|This may take a few minutes|Model removed to free up space|Using .* for transcription)/);
});

test('general preferences do not present a default AI model', async () => {
  const preferences = await readSource('src/components/PreferenceSettings.tsx');

  assert.doesNotMatch(preferences, /settings\.default_model/);
  assert.doesNotMatch(preferences, /settings\.default_model_hint/);
  assert.doesNotMatch(preferences, /modelConfig/);
});

test('general preferences contain only meeting template and meeting-prefix controls', async () => {
  const preferences = await readSource('src/components/PreferenceSettings.tsx');

  assert.match(preferences, /settings\.default_template/);
  assert.match(preferences, /settings\.meeting_prefix/);
  assert.doesNotMatch(preferences, /settings\.notifications_title/);
  assert.doesNotMatch(preferences, /settings\.storage_title/);
  assert.doesNotMatch(preferences, /settings\.language_label/);
  assert.doesNotMatch(preferences, /loadPreferences|notificationSettings|storageLocations|updateNotificationSettings|open_recordings_folder|setLanguage/);
});

test('recording and local transcription settings use localized copy in both locales', async () => {
  const [recording, transcript, es, en] = await Promise.all([
    readSource('src/components/RecordingSettings.tsx'),
    readSource('src/components/TranscriptSettings.tsx'),
    readSource('src/constants/locales/es.ts'),
    readSource('src/constants/locales/en.ts'),
  ]);

  for (const key of [
    'settings.auto_save_desc',
    'settings.save_location',
    'settings.default_folder',
    'settings.file_format',
    'settings.file_format_hint',
    'settings.audio_disabled_info',
    'settings.default_devices_title',
    'settings.default_devices_desc',
    'settings.preference_saved',
    'settings.preference_save_failed',
    'settings.devices_saved',
    'settings.devices_saved_desc',
    'settings.devices_save_failed',
    'settings.device_default',
    'settings.transcript_model',
    'settings.select_provider',
    'settings.provider_parakeet',
    'settings.provider_whisper',
  ]) {
    assert.match(recording + transcript, new RegExp(`t\\(['\"]${key}['\"]\\)`));
    assert.ok(es.includes(`"${key}"`), `Spanish locale is missing ${key}`);
    assert.ok(en.includes(`"${key}"`), `English locale is missing ${key}`);
  }

  assert.doesNotMatch(transcript, /deepgram|elevenLabs|groq|openai/);
  assert.match(transcript, /provider: 'localWhisper' \| 'parakeet'/);
});
