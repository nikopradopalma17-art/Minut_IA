import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/summaryModelCatalog.ts', import.meta.url), 'utf8');
const modelSettings = readFileSync(new URL('../../src/components/ModelSettingsModal.tsx', import.meta.url), 'utf8');
const intelligence = readFileSync(new URL('../../src/components/IntelligenceScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });

const {
  CURATED_SUMMARY_MODELS,
  filterSummaryModels,
  normalizeSummaryCatalogResponse,
  reconcileSummaryModel,
  resolveSummaryModel,
  selectValidSummaryModel,
  shouldApplyCatalogResponse,
  shouldApplyCatalogGeneration,
  createSummaryCatalogVersionStore,
} = module.exports;

test('uses curated fallback when discovery is unavailable', () => {
  const models = resolveSummaryModel('openai', []);
  assert.deepEqual(models, CURATED_SUMMARY_MODELS.openai);
  assert.equal(models[0].source, 'curated');
});

test('preserves dynamic provider models and annotates their source', () => {
  const models = resolveSummaryModel('claude', [{ id: 'claude-test', label: 'Claude Test' }]);
  assert.equal(JSON.stringify(models), JSON.stringify([{ id: 'claude-test', label: 'Claude Test', provider: 'claude', source: 'dynamic', available: true }]));
});

test('search filters visible label and id case-insensitively', () => {
  const matches = filterSummaryModels(CURATED_SUMMARY_MODELS.openrouter, 'GEMINI');
  assert.ok(matches.length > 0);
  assert.ok(matches.every(model => `${model.id} ${model.label}`.toLowerCase().includes('gemini')));
});

test('provider selection restores only a valid saved model and otherwise picks the first catalog item', () => {
  const catalog = CURATED_SUMMARY_MODELS.groq;
  assert.equal(selectValidSummaryModel(catalog, catalog[1].id, catalog[0].id), catalog[1].id);
  assert.equal(selectValidSummaryModel(catalog, 'not-a-groq-model', catalog[0].id), catalog[0].id);
});

test('built-in catalog contains exactly the registry-supported models and never Gemma 4', () => {
  const ids = CURATED_SUMMARY_MODELS['builtin-ai'].map(model => model.id);
  assert.equal(JSON.stringify(ids), JSON.stringify(['gemma3:1b', 'qwen3.5:2b', 'gemma3:4b', 'qwen3.5:4b']));
  assert.ok(!ids.some(id => id.includes('gemma4')));
});

test('reconciles a provider transition to a model valid for the incoming catalog', () => {
  const result = reconcileSummaryModel(CURATED_SUMMARY_MODELS.openrouter, 'gpt-5', 'google/gemini-2.5-pro');
  assert.equal(result, 'google/gemini-2.5-pro');
});

test('dynamic catalog reconciliation replaces a stale temporary model with a valid response item', () => {
  const dynamic = resolveSummaryModel('groq', [{ id: 'llama-live', label: 'Llama Live' }]);
  assert.equal(reconcileSummaryModel(dynamic, 'llama-3.3-70b-versatile'), 'llama-live');
});

test('ignores a response for an earlier provider request', () => {
  assert.equal(shouldApplyCatalogResponse(2, 2), true);
  assert.equal(shouldApplyCatalogResponse(1, 2), false);
});

test('keeps curated source for no-key and error catalog responses', () => {
  assert.equal(normalizeSummaryCatalogResponse({ source: 'curated', models: [] }).source, 'curated');
  assert.equal(normalizeSummaryCatalogResponse(null).source, 'curated');
});

test('every summary model/config save invalidates its frontend catalog cache', () => {
  assert.match(modelSettings, /persistBeforeInvalidatingCatalog\(/);
  assert.match(modelSettings, /invalidateSummaryModelCatalog\(provider as SummaryModelProvider\)/);
  assert.match(intelligence, /invalidateSummaryModelCatalog\(modelConfig\.provider as/);
});

test('rejects an in-flight catalog response after cache invalidation advances generation', () => {
  assert.equal(shouldApplyCatalogGeneration(3, 3), true);
  assert.equal(shouldApplyCatalogGeneration(3, 4), false);
});

test('notifies every mounted catalog subscriber after a provider invalidation', () => {
  const store = createSummaryCatalogVersionStore();
  const seen = [];
  const unsubscribeA = store.subscribe(() => seen.push(['a', store.getVersion('openai')]));
  const unsubscribeB = store.subscribe(() => seen.push(['b', store.getVersion('openai')]));

  store.invalidate('openai');
  unsubscribeA();
  store.invalidate('openai');
  unsubscribeB();

  assert.deepEqual(seen, [['a', 1], ['b', 1], ['b', 2]]);
});
