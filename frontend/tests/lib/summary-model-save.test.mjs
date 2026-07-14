import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/summaryModelSave.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { persistBeforeInvalidatingCatalog } = module.exports;

test('waits for deferred persistence before invalidating the provider catalog', async () => {
  let resolvePersist;
  const persisted = new Promise(resolve => { resolvePersist = resolve; });
  let cacheGeneration = 0;
  let refills = 0;
  const save = persistBeforeInvalidatingCatalog('openai', () => persisted, () => {
    cacheGeneration += 1;
    refills += 1;
  });

  await Promise.resolve();
  assert.equal(cacheGeneration, 0, 'an in-flight save must not bump cache generation');
  assert.equal(refills, 0, 'an in-flight save must not refill the catalog');
  resolvePersist();
  await save;
  assert.equal(cacheGeneration, 1);
  assert.equal(refills, 1);
});

test('does not invalidate when persistence rejects', async () => {
  const events = [];
  await assert.rejects(() => persistBeforeInvalidatingCatalog('groq', async () => { throw new Error('save failed'); }, provider => events.push(provider)));
  assert.deepEqual(events, []);
});
