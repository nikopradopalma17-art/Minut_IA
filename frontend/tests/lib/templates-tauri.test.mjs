import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadUseTemplates(dependencies) {
  const source = fs.readFileSync(
    path.join(root, 'src/hooks/meeting-details/useTemplates.ts'),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(compiled, {
    console,
    exports: module.exports,
    module,
    require: (id) => {
      if (!(id in dependencies)) {
        throw new Error(`Unexpected dependency: ${id}`);
      }
      return dependencies[id];
    },
  });

  return module.exports.useTemplates;
}

test('template manager uses camelCase top-level ids and preserves nested Serde snake_case', async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'api_save_custom_template') {
      return { id: 'custom-template', name: 'Custom template' };
    }
    if (command === 'api_get_template_details') {
      return { id: 'custom-template', name: 'Custom template', sections: [] };
    }
    return [];
  };
  const useTemplates = loadUseTemplates({
    react: {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useState: (initial) => [initial, () => {}],
    },
    '@tauri-apps/api/core': { invoke },
    sonner: { toast: { error: () => {}, success: () => {} } },
    '@/lib/analytics': { default: { trackFeatureUsed: () => {} } },
    '@/contexts/TranslationContext': { useTranslation: () => ({ t: (key) => key }) },
  });
  const templates = useTemplates();
  const template = {
    name: 'Custom template',
    description: 'A test template',
    sections: [],
  };

  assert.equal(templates.selectedTemplate, 'minuta_corporativa');
  await templates.getTemplateDetails('custom-template');
  await templates.saveCustomTemplate('custom-template', template);
  await templates.deleteCustomTemplate('custom-template');

  assert.equal(JSON.stringify(calls), JSON.stringify([
    { command: 'api_get_template_details', payload: { templateId: 'custom-template' } },
    {
      command: 'api_save_custom_template',
      payload: { request: { template_id: 'custom-template', template } },
    },
    { command: 'api_list_templates', payload: undefined },
    { command: 'api_delete_custom_template', payload: { templateId: 'custom-template' } },
    { command: 'api_list_templates', payload: undefined },
  ]));
});
