import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/dashboardSearch.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports });
const { formatSearchTimestamp, splitHighlightedText } = loaded.exports;
const dashboard = readFileSync(new URL('../../src/components/DashboardScreen.tsx', import.meta.url), 'utf8');

test('formats numeric transcript timestamps and preserves backend strings', () => {
  assert.equal(formatSearchTimestamp('65'), '[01:05]');
  assert.equal(formatSearchTimestamp('01:12'), '01:12');
  assert.equal(formatSearchTimestamp('speaker-2'), 'speaker-2');
});

test('splits highlights case-insensitively without interpreting HTML', () => {
  const parts = splitHighlightedText('<img> Agenda agenda', 'agenda');
  assert.deepEqual(JSON.parse(JSON.stringify(parts)), [
    { text: '<img> ', highlighted: false },
    { text: 'Agenda', highlighted: true },
    { text: ' ', highlighted: false },
    { text: 'agenda', highlighted: true },
  ]);
});

test('literal regex characters are safe search terms', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(splitHighlightedText('Cost is $5.00', '$5.'))), [
    { text: 'Cost is ', highlighted: false },
    { text: '$5.', highlighted: true },
    { text: '00', highlighted: false },
  ]);
});

test('dashboard debounces transcript search and renders safe clickable previews', () => {
  assert.match(dashboard, /api_search_transcripts/);
  assert.match(dashboard, /}, 300\)/);
  assert.match(dashboard, /window\.clearTimeout\(timer\)/);
  assert.match(dashboard, /onSelectSession\(hit\.id\)/);
  assert.match(dashboard, /splitHighlightedText\(hit\.matchContext, searchQuery\)/);
  assert.doesNotMatch(dashboard, /dangerouslySetInnerHTML/);
});
