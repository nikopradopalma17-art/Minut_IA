import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../..');
const readSource = (relativePath) => readFileSync(path.join(frontendDir, relativePath), 'utf8');

test('HubTopNav exposes the shared hub API and approved destinations', () => {
  const source = readSource('src/components/HubTopNav.tsx');

  assert.match(source, /active\?: 'inicio' \| 'reuniones'/);
  assert.match(source, /showVolver\?: boolean/);
  assert.match(source, /onVolver\?: \(\) => void/);
  assert.match(source, /onOpenSettings\?: \(\) => void/);
  assert.match(source, /src="\/brand\/minutia\.svg"/);
  assert.match(source, /<About\s*\/>/);
  assert.match(source, /<DialogContent aria-describedby=\{undefined\}>/);
  assert.doesNotMatch(source, /<Dialog aria-describedby=\{undefined\}>/);
  assert.match(source, /router\.push\('\/compromisos'\)/);
  assert.match(source, /router\.push\('\/settings'\)/);
});

test('Dashboard and Intelligence reuse HubTopNav instead of duplicating navigation', () => {
  const dashboard = readSource('src/components/DashboardScreen.tsx');
  const intelligence = readSource('src/components/IntelligenceScreen.tsx');

  assert.match(dashboard, /<HubTopNav active="inicio" onOpenSettings=\{onOpenSettings\}/);
  assert.match(intelligence, /<HubTopNav[\s\S]*showVolver[\s\S]*onVolver=\{onBackToDashboard\}[\s\S]*onOpenSettings=\{onOpenSettings\}/);
  assert.doesNotMatch(dashboard, /<nav\b/);
  assert.doesNotMatch(intelligence, /<nav\b/);
});

test('Intelligence Inicio returns through the SPA callback and recording start ignores the click event', () => {
  const hubTopNavSource = readSource('src/components/HubTopNav.tsx');
  const homeSource = readSource('src/app/page.tsx');

  assert.match(hubTopNavSource, /onClick:\s*showVolver\s*&&\s*onVolver\s*\?\s*onVolver\s*:\s*\(\)\s*=>\s*router\.push\('\/'\)/);
  assert.match(homeSource, /onRecordingStart=\{\(\)\s*=>\s*handleRecordingStart\(false\)\}/);
});

test('Dashboard footer uses the localized developer credit', () => {
  const dashboard = readSource('src/components/DashboardScreen.tsx');

  assert.match(dashboard, /<footer[^>]*className="[^"]*py-/);
  assert.match(dashboard, /t\('brand\.developed_by'\)/);
});
