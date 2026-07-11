import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../..');
const aboutSource = readFileSync(path.join(frontendDir, 'src/components/About.tsx'), 'utf8');
const esSource = readFileSync(path.join(frontendDir, 'src/constants/locales/es.ts'), 'utf8');
const enSource = readFileSync(path.join(frontendDir, 'src/constants/locales/en.ts'), 'utf8');

const sectionKeys = [
  'mission_title',
  'mission_body',
  'vision_title',
  'vision_body',
  'impulso_title',
  'impulso_body',
];

test('About renders every approved localized section', () => {
  for (const key of sectionKeys) {
    assert.match(aboutSource, new RegExp(`t\\('about\\.${key}'\\)`));
    assert.match(esSource, new RegExp(`"about\\.${key}"`));
    assert.match(enSource, new RegExp(`"about\\.${key}"`));
  }
});

test('About keeps the Impulso logo wiring and has no lingering draft markers', () => {
  assert.match(aboutSource, /src="\/brand\/impulso-logo\.svg"/);
  assert.doesNotMatch(esSource, /<!-- EDITAR -->/);
  assert.doesNotMatch(enSource, /<!-- EDITAR -->/);
});

test('About no longer renders a standalone author section', () => {
  assert.doesNotMatch(aboutSource, /about\.author_title/);
  assert.doesNotMatch(aboutSource, /about\.author_body/);
  assert.doesNotMatch(esSource, /"about\.author_title"/);
  assert.doesNotMatch(enSource, /"about\.author_title"/);
});
