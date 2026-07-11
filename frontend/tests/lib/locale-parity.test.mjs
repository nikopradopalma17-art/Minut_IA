/**
 * Locale parity test — verifies that es.ts and en.ts have identical keys
 * and that no value in either locale is an empty string.
 *
 * Run with: node --test tests/lib/locale-parity.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, '../../src/constants/locales');

/**
 * Load a .ts locale file and return the exported object.
 * Strips TypeScript declarations to allow eval-based parsing.
 */
function loadLocaleObject(filename) {
  const raw = readFileSync(path.join(localesDir, filename), 'utf8');

  // Strip TS-specific lines and transform export const X = { ... }; into return { ... }
  const cleaned = raw
    .replace(/^import\s+.*?;\s*$/gm, '')                         // remove import lines
    .replace(/^export\s+const\s+\w+(?:\s*:\s*[^=]+)?\s*=\s*\{/m, 'return {') // export const X: T = {
    .replace(/\};\s*$/, '}');                                     // closing };

  // eslint-disable-next-line no-new-func
  return new Function(cleaned)();
}

const es = loadLocaleObject('es.ts');
const en = loadLocaleObject('en.ts');

test('ES and EN locales have identical key sets', () => {
  const esKeys = new Set(Object.keys(es));
  const enKeys = new Set(Object.keys(en));

  const missingInEn = [...esKeys].filter(k => !enKeys.has(k));
  const missingInEs = [...enKeys].filter(k => !esKeys.has(k));

  assert.equal(
    missingInEn.length,
    0,
    `Keys in es.ts but missing in en.ts:\n  ${missingInEn.join('\n  ')}`
  );

  assert.equal(
    missingInEs.length,
    0,
    `Keys in en.ts but missing in es.ts:\n  ${missingInEs.join('\n  ')}`
  );
});

test('No locale value is an empty string in es.ts', () => {
  const empty = Object.entries(es).filter(([, v]) => v === '');
  assert.equal(empty.length, 0, `Empty values in es.ts: ${empty.map(([k]) => k).join(', ')}`);
});

test('No locale value is an empty string in en.ts', () => {
  const empty = Object.entries(en).filter(([, v]) => v === '');
  assert.equal(empty.length, 0, `Empty values in en.ts: ${empty.map(([k]) => k).join(', ')}`);
});
