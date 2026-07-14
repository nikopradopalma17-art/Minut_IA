import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);

function loadTs(file) {
  const compiled = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require });
  return module.exports;
}

test('Local vs Cloud is mandatory step 3 before downloads', () => {
  const flow = read('src/components/onboarding/OnboardingFlow.tsx');
  const exports = read('src/components/onboarding/steps/index.ts');
  assert.match(exports, /LocalVsCloudStep/);
  assert.match(flow, /currentStep === 3 && <LocalVsCloudStep/);
  assert.match(flow, /currentStep === 4 && <DownloadProgressStep/);
  assert.match(flow, /currentStep === 5 && isMac && <PermissionsStep/);
});

test('onboarding navigation clamps all use the new five-step maximum', () => {
  const context = read('src/contexts/OnboardingContext.tsx');
  assert.match(context, /currentStep > 5/);
  assert.match(context, /currentStep = 4/);
  assert.match(context, /Math\.min\(step, 5\)/);
  assert.match(context, /Math\.min\(next, 5\)/);
  assert.doesNotMatch(context, /Math\.min\(step, 4\)|Math\.min\(next, 4\)/);
});

test('Local vs Cloud content and OpenRouter guide are fully localized', () => {
  const component = read('src/components/onboarding/steps/LocalVsCloudStep.tsx');
  const es = read('src/constants/locales/es.ts');
  const en = read('src/constants/locales/en.ts');
  for (const key of ['title', 'description', 'local_title', 'local_pro_1', 'local_con_1', 'cloud_title', 'cloud_pro_1', 'cloud_con_1', 'more_info', 'guide_title', 'guide_step_1', 'guide_step_4', 'cta']) {
    assert.match(component, new RegExp(`t\\('onboarding\\.localcloud\\.${key}'\\)`));
    assert.match(es, new RegExp(`"onboarding\\.localcloud\\.${key}"`));
    assert.match(en, new RegExp(`"onboarding\\.localcloud\\.${key}"`));
  }
  assert.match(component, /step=\{3\}/);
  assert.match(component, /totalSteps=\{isMac \? 5 : 4\}/);
});

test('downstream steps, progress icon, and Rust completion use step five', () => {
  assert.match(read('src/components/onboarding/steps/SetupOverviewStep.tsx'), /totalSteps=\{isMac \? 5 : 4\}/);
  const download = read('src/components/onboarding/steps/DownloadProgressStep.tsx');
  assert.match(download, /step=\{4\}/);
  assert.match(download, /totalSteps=\{resolvedPlatform === 'macos' \? 5 : 4\}/);
  assert.match(read('src/components/onboarding/steps/PermissionsStep.tsx'), /step=\{5\}/);
  assert.match(read('src/components/onboarding/shared/ProgressIndicator.tsx'), /Cloud/);
  assert.match(read('src-tauri/src/onboarding.rs'), /status\.current_step = 5/);
});

test('platform resolution never completes macOS before permissions', () => {
  const { resolveOnboardingPlatform, getDownloadContinuation } = loadTs('src/lib/onboarding-platform.ts');
  assert.equal(resolveOnboardingPlatform('macos', ''), 'macos');
  assert.equal(resolveOnboardingPlatform('windows', ''), 'other');
  assert.equal(resolveOnboardingPlatform(undefined, 'Mozilla Macintosh'), 'macos');
  assert.equal(getDownloadContinuation(null), 'wait');
  assert.equal(getDownloadContinuation('macos'), 'permissions');
  assert.equal(getDownloadContinuation('other'), 'complete');

  const download = read('src/components/onboarding/steps/DownloadProgressStep.tsx');
  assert.match(download, /disabled=\{!parakeetDownloaded \|\| isCompleting \|\| resolvedPlatform === null\}/);
  assert.match(download, /getDownloadContinuation\(resolvedPlatform\)/);
});
