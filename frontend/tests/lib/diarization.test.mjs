import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadTsModule(relativePath, dependencies) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
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

  return module.exports;
}

test('recording service sends camelCase top-level Tauri arguments', async () => {
  const calls = [];
  const { RecordingService } = loadTsModule('src/services/recordingService.ts', {
    '@tauri-apps/api/core': {
      invoke: async (command, payload) => {
        calls.push({ command, payload });
        return 0;
      },
    },
    '@tauri-apps/api/event': { listen: async () => () => {} },
  });
  const service = new RecordingService();

  await service.startRecording(true);
  await service.startRecordingWithDevices('Mic', 'System', 'Standup', true);
  await service.diarizeMeeting('meeting-1');
  await service.listSpeakerNames('meeting-1');
  await service.renameSpeaker('meeting-1', 'speaker_2', 'Ada');

  assert.equal(JSON.stringify(calls), JSON.stringify([
    { command: 'start_recording', payload: { enableDiarization: true } },
    {
      command: 'start_recording_with_devices_and_meeting',
      payload: {
        micDeviceName: 'Mic',
        systemDeviceName: 'System',
        meetingName: 'Standup',
        enableDiarization: true,
      },
    },
    { command: 'diarize_meeting', payload: { meetingId: 'meeting-1' } },
    { command: 'list_speaker_names', payload: { meetingId: 'meeting-1' } },
    {
      command: 'rename_speaker',
      payload: { meetingId: 'meeting-1', speakerId: 'speaker_2', displayName: 'Ada' },
    },
  ]));
});

test('diarization subscribes before execution, localizes errors, and always unsubscribes', async () => {
  const steps = [];
  const toast = {
    loading: (...args) => steps.push(['loading', ...args]),
    success: (...args) => steps.push(['success', ...args]),
    error: (...args) => steps.push(['error', ...args]),
  };
  const { runDiarization } = loadTsModule('src/lib/diarization.ts', {
    sonner: { toast },
    '@/services/recordingService': {
      recordingService: {
        onDiarizationModelDownloadProgress: async () => {
          steps.push(['subscribe']);
          return () => steps.push(['unlisten']);
        },
        diarizeMeeting: async () => {
          steps.push(['diarize']);
          throw new Error('No diarizable transcript slices found');
        },
      },
    },
  });
  const t = (key) => key;

  await runDiarization({ meetingId: 'meeting-1', toastId: 'diarization', t });

  assert.equal(JSON.stringify(steps), JSON.stringify([
    ['loading', 'speakers.identifying', { id: 'diarization', duration: 0 }],
    ['subscribe'],
    ['diarize'],
    [
      'error',
      'speakers.identify_failed',
      { id: 'diarization', description: 'speakers.error_no_segments' },
    ],
    ['unlisten'],
  ]));
});

test('diarization localizes listener registration failures', async () => {
  const toast = {
    loading: () => {},
    success: () => {},
    error: (...args) => toast.errors.push(args),
    errors: [],
  };
  const { runDiarization } = loadTsModule('src/lib/diarization.ts', {
    sonner: { toast },
    '@/services/recordingService': {
      recordingService: {
        onDiarizationModelDownloadProgress: async () => {
          throw new Error('listener registration failed');
        },
        diarizeMeeting: async () => {
          throw new Error('should not run');
        },
      },
    },
  });
  const t = (key) => key;

  await runDiarization({ meetingId: 'meeting-1', toastId: 'diarization', t });

  assert.equal(JSON.stringify(toast.errors), JSON.stringify([[
    'speakers.identify_failed',
    { id: 'diarization', description: 'speakers.identify_failed_desc' },
  ]]));
});
