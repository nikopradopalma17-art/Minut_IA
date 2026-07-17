import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const modal = readFileSync(new URL('../../src/components/PersonalizarIAModal.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../src/components/DashboardScreen.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
const providerSelectionSource = readFileSync(new URL('../../src/lib/providerModelSelection.ts', import.meta.url), 'utf8');

const compiledProviderSelection = ts.transpileModule(providerSelectionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const providerSelectionModule = { exports: {} };
vm.runInNewContext(compiledProviderSelection, { module: providerSelectionModule, exports: providerSelectionModule.exports });
const { resolveAvailableBuiltinModel } = providerSelectionModule.exports;

function createPersonalizarIaHarness({ invoke }) {
  const hooks = [];
  const modelConfig = {
    provider: 'openrouter',
    model: 'openrouter/free',
    whisperModel: 'base',
    apiKey: '',
    ollamaEndpoint: null,
  };
  const setModelConfigCalls = [];
  const invalidateCalls = [];
  let hookIndex = 0;
  const react = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    useEffect() {},
    useState(initialValue) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = initialValue;
      return [hooks[index], value => {
        hooks[index] = typeof value === 'function' ? value(hooks[index]) : value;
      }];
    },
  };
  const compiledModal = ts.transpileModule(modal, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const require = path => {
    if (path === 'react') return { ...react, default: react };
    if (path === '@tauri-apps/api/core') return { invoke };
    if (path === 'sonner') return { toast: { error() {}, success() {} } };
    if (path === 'lucide-react') return { Eye: 'Eye', EyeOff: 'EyeOff', Lock: 'Lock', LockOpen: 'LockOpen' };
    if (path === '@/components/ui/dialog') return { Dialog: 'Dialog', DialogContent: 'DialogContent', DialogDescription: 'DialogDescription', DialogHeader: 'DialogHeader', DialogTitle: 'DialogTitle' };
    if (path === '@/contexts/ConfigContext') return { useConfig: () => ({ modelConfig, setModelConfig: config => setModelConfigCalls.push(config) }) };
    if (path === '@/components/SummaryModelSelector') return { SummaryModelSelector: 'SummaryModelSelector' };
    if (path === '@/lib/summaryModelCatalog') return { CURATED_SUMMARY_MODELS: { openrouter: [{ id: 'openrouter/free' }], openai: [{ id: 'gpt-test' }], claude: [{ id: 'claude-test' }], groq: [{ id: 'groq-test' }] } };
    if (path === '@/hooks/useSummaryModelCatalog') return { invalidateSummaryModelCatalog: provider => invalidateCalls.push(provider) };
    throw new Error(`Unexpected module: ${path}`);
  };
  vm.runInNewContext(compiledModal, { module, exports: module.exports, require, console: { error() {} } });

  const render = () => {
    hookIndex = 0;
    return module.exports.default({ open: false, onOpenChange() {} });
  };
  const find = (tree, predicate) => {
    if (Array.isArray(tree)) {
      for (const child of tree) {
        const found = find(child, predicate);
        if (found) return found;
      }
      return undefined;
    }
    if (!tree || typeof tree !== 'object') return undefined;
    if (predicate(tree)) return tree;
    for (const child of tree.props?.children ?? []) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  };
  const findAll = (tree, predicate, results = []) => {
    if (Array.isArray(tree)) {
      tree.forEach(child => findAll(child, predicate, results));
      return results;
    }
    if (!tree || typeof tree !== 'object') return results;
    if (predicate(tree)) results.push(tree);
    (tree.props?.children ?? []).forEach(child => findAll(child, predicate, results));
    return results;
  };
  const elementText = element => (element.props?.children ?? []).filter(child => typeof child === 'string').join('');
  const editOpenAiKey = () => findAll(render(), element => element.type === 'button' && element.props['aria-label'] === 'Editar clave')[1].props.onClick();
  const enterOpenAiKey = key => find(render(), element => element.type === 'input' && element.props.id === 'openai-api-key').props.onChange({ target: { value: key } });
  const useOpenAi = () => findAll(render(), element => element.type === 'button' && elementText(element) === 'Usar este proveedor')[1].props.onClick();

  return { editOpenAiKey, enterOpenAiKey, useOpenAi, invalidateCalls, setModelConfigCalls };
}

test('Personalizar IA resets sensitive UI state and unlocks at most the requested provider', () => {
  assert.match(modal, /setVisible\(\{ openrouter: false, openai: false, claude: false, groq: false \}\)/);
  assert.match(modal, /setUnlocked\(\{ openrouter: false, openai: false, claude: false, groq: false \}\)/);
  assert.match(modal, /openrouter: initialProvider === 'openrouter'/);
  assert.match(modal, /openai: initialProvider === 'openai'/);
  assert.match(modal, /claude: initialProvider === 'claude'/);
  assert.match(modal, /groq: initialProvider === 'groq'/);
});

test('Personalizar IA exposes accessible labels and disables duplicate provider operations', () => {
  assert.match(modal, /htmlFor=\{`\$\{provider\}-api-key`\}/);
  assert.match(modal, /<SummaryModelSelector provider=\{provider\}/);
  assert.equal((modal.match(/disabled=\{Boolean\(pending\[provider\]\)\}/g) || []).length, 2);
  assert.match(modal, /if \(pending\[provider\]\) return;/);
});

test('Personalizar IA refreshes the active provider catalog only after its config save succeeds', async () => {
  const successful = createPersonalizarIaHarness({ invoke: async () => undefined });
  successful.editOpenAiKey();
  successful.enterOpenAiKey('new-cloud-key');
  await successful.useOpenAi();
  assert.deepEqual(successful.invalidateCalls, ['openai']);
  assert.equal(successful.setModelConfigCalls.length, 1);

  const failing = createPersonalizarIaHarness({ invoke: async () => { throw new Error('save failed'); } });
  failing.editOpenAiKey();
  failing.enterOpenAiKey('new-cloud-key');
  await failing.useOpenAi();
  assert.deepEqual(failing.invalidateCalls, []);
  assert.equal(failing.setModelConfigCalls.length, 0);
});

test('dashboard quick selection persists a provider-compatible catalog model', () => {
  assert.match(dashboard, /const options = modelOptions\[provider\]/);
  assert.match(dashboard, /const cachedModel = getCachedProviderModel\(provider\)/);
  assert.match(dashboard, /reconcileSummaryModel\(catalogModels/);
  assert.match(page, /const updated = \{ \.\.\.modelConfig, provider, model \}/);
  assert.match(page, /providerModelMap\[provider\] = model/);
});

test('built-in selection trusts the authoritative availability query', async () => {
  let calls = 0;
  const available = await resolveAvailableBuiltinModel(async () => {
    calls += 1;
    return 'qwen-local.gguf';
  });
  assert.equal(available, 'qwen-local.gguf');
  assert.equal(calls, 1);

  const unavailable = await resolveAvailableBuiltinModel(async () => null);
  assert.equal(unavailable, null);
  assert.match(dashboard, /resolveAvailableBuiltinModel/);
  assert.doesNotMatch(dashboard, /provider === 'builtin-ai'[\s\S]{0,120}getLocalFallbackModel/);
});

test('empty Ollama catalog uses configured model or routes to model settings', () => {
  assert.match(dashboard, /provider === 'ollama'/);
  assert.match(dashboard, /const configuredModel = getLocalFallbackModel\(provider\)/);
  assert.match(dashboard, /onOpenSettings\(\)/);
  assert.match(dashboard, /needsLocalSetup \? 'Configurar' : 'Seleccionar'/);
});

test('dashboard consumes shared catalog metadata and keeps the exact OpenRouter label', () => {
  assert.match(dashboard, /loadSummaryModelCatalog/);
  assert.doesNotMatch(dashboard, /invoke<Array<\{ id: string \}>>\('summary_list_models'/);
  assert.match(dashboard, /label: 'OpenRouter', sub: 'Nube flexible:'/);
});
