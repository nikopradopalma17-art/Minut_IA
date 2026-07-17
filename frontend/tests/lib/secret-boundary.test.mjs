import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('public configuration commands expose key presence but never stored key material', async () => {
  const api = await readSource('src-tauri/src/api/api.rs');

  assert.match(api, /pub struct ModelConfigStatus/);
  assert.match(api, /api_key_configured: bool/);
  assert.doesNotMatch(api, /pub async fn api_get_api_key\s*</);
  assert.doesNotMatch(api, /pub async fn api_get_transcript_api_key\s*</);
  assert.match(api, /pub async fn api_get_model_config[\s\S]*?Result<Option<ModelConfigStatus>, String>/);
  assert.match(api, /pub async fn api_get_custom_openai_config[\s\S]*?Result<Option<CustomOpenAIConfigStatus>, String>/);
});

test('frontend never loads or retains a persisted cloud key', async () => {
  const [context, personalizar, intelligence, service] = await Promise.all([
    readSource('src/contexts/ConfigContext.tsx'),
    readSource('src/components/PersonalizarIAModal.tsx'),
    readSource('src/components/IntelligenceScreen.tsx'),
    readSource('src/services/configService.ts'),
  ]);

  const frontend = context + personalizar + intelligence + service;
  assert.doesNotMatch(frontend, /api_get_api_key['"]|api_get_transcript_api_key['"]/);
  assert.doesNotMatch(context, /providerApiKeys/);
  assert.doesNotMatch(personalizar, /providerApiKeys/);
  assert.match(personalizar, /apiKeyConfigured/);
  assert.match(personalizar, /setKeys\(prev => \(\{ \.\.\.prev, \[provider\]: '' \}\)\)/);
  assert.match(intelligence, /apiKeyConfigured/);
  assert.match(intelligence, /setModelConfig\(prev => \(\{ \.\.\.prev, apiKey: ''/);
});
