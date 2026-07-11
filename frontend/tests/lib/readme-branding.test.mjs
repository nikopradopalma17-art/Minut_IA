import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const readmeSource = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('README presents MinutIA as an Impulso product in Spanish', () => {
  assert.match(readmeSource, /#\s*MinutIA|<h1>[\s\S]*MinutIA/i);
  assert.match(readmeSource, /producto de Impulso/i);
  assert.match(readmeSource, /Descargar MinutIA para Windows/i);
  assert.match(readmeSource, /Instalaci[oó]n/i);
});

test('README no longer contains inherited Meetily product marketing', () => {
  assert.doesNotMatch(readmeSource, /Meetily PRO/i);
  assert.doesNotMatch(readmeSource, /Community Edition/i);
  assert.doesNotMatch(readmeSource, /coupon code/i);
  assert.doesNotMatch(readmeSource, /Explore Meetily PRO/i);
  assert.doesNotMatch(readmeSource, /Privacy-First AI Meeting Assistant/i);
});

test('README points downloads at the MinutIA repo and explains SmartScreen', () => {
  assert.match(
    readmeSource,
    /https:\/\/github\.com\/nikopradopalma17-art\/Minut_IA\/releases\/latest/
  );
  assert.match(readmeSource, /SmartScreen/i);
  assert.match(readmeSource, /Windows/i);
});
