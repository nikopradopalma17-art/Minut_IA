import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const tauriConfig = JSON.parse(
  readFileSync(path.join(repoRoot, 'frontend/src-tauri/tauri.conf.json'), 'utf8')
);
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8'));
const cargoToml = readFileSync(path.join(repoRoot, 'frontend/src-tauri/Cargo.toml'), 'utf8');
const layoutSource = readFileSync(path.join(repoRoot, 'frontend/src/app/layout.tsx'), 'utf8');
const libSource = readFileSync(path.join(repoRoot, 'frontend/src-tauri/src/lib.rs'), 'utf8');
const parakeetSource = readFileSync(
  path.join(repoRoot, 'frontend/src-tauri/src/parakeet_engine/parakeet_engine.rs'),
  'utf8'
);
const releaseWorkflowSource = readFileSync(
  path.join(repoRoot, '.github/workflows/release.yml'),
  'utf8'
);
const traySource = readFileSync(path.join(repoRoot, 'frontend/src-tauri/src/tray.rs'), 'utf8');
const gitignoreSource = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
const testUpdateScriptSource = readFileSync(
  path.join(repoRoot, 'scripts/test-update-locally.js'),
  'utf8'
);
const readmeSource = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('tauri updater is enabled and points at MinutIA release manifest', () => {
  assert.equal(tauriConfig.bundle.createUpdaterArtifacts, true);
  assert.equal(tauriConfig.plugins.updater.endpoints[0], 'https://github.com/nikopradopalma17-art/Minut_IA/releases/latest/download/latest.json');
  assert.match(tauriConfig.plugins.updater.pubkey, /^[A-Za-z0-9+/=\r\n:-]+$/);
  assert.ok(tauriConfig.plugins.updater.pubkey.length > 64);
  assert.ok(tauriConfig.app.security.capabilities[0].permissions.includes('updater:default'));
  assert.equal('signCommand' in tauriConfig.bundle.windows, false);
});

test('v1.0.0 release version is identical across every package manifest', () => {
  assert.equal(tauriConfig.version, '1.0.0');
  assert.equal(packageJson.version, '1.0.0');
  assert.match(cargoToml, /^version = "1\.0\.0"$/m);
});

test('desktop app mounts the updater provider and registers the Rust updater plugin', () => {
  assert.match(layoutSource, /import\s+\{\s*UpdateCheckProvider\s*\}\s+from\s+['"]@\/components\/UpdateCheckProvider['"]/);
  assert.match(layoutSource, /<UpdateCheckProvider>/);
  assert.match(layoutSource, /<\/UpdateCheckProvider>/);
  assert.match(libSource, /\.plugin\(tauri_plugin_updater::Builder::new\(\)\.build\(\)\)/);
  assert.match(traySource, /"check_updates"\s*=>\s*check_updates_handler\(app\)/);
  assert.match(traySource, /check-updates-from-tray/);
});

test('release workflow targets unsigned Windows builds only', () => {
  assert.match(releaseWorkflowSource, /platform:\s*"windows-latest"/);
  assert.doesNotMatch(releaseWorkflowSource, /platform:\s*"macos-latest"/);
  assert.match(releaseWorkflowSource, /sign-binaries:\s*false/);
});

test('Parakeet v3 downloads from Hugging Face instead of the legacy third-party host', () => {
  assert.match(
    parakeetSource,
    /https:\/\/huggingface\.co\/istupakov\/parakeet-tdt-0\.6b-v3-onnx\/resolve\/main/
  );
  assert.doesNotMatch(parakeetSource, /towardsgeneralintelligence\.com/);
});

test('local updater secrets stay ignored and developer docs/scripts point to the MinutIA repo', () => {
  assert.match(gitignoreSource, /frontend\/\.tauri\//);
  assert.match(
    testUpdateScriptSource,
    /https:\/\/github\.com\/nikopradopalma17-art\/Minut_IA\/releases\/latest\/download\/latest\.json/
  );
  assert.match(
    readmeSource,
    /https:\/\/github\.com\/nikopradopalma17-art\/Minut_IA\/releases/
  );
});
