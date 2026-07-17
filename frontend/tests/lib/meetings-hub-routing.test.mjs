import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(frontendDir, file), 'utf8');

test('Reuniones hub preserves commitment behavior and adds hub data surfaces', () => {
  const source = read('src/app/compromisos/page.tsx');
  assert.match(source, /<Suspense/);
  assert.match(source, /<HubTopNav active="reuniones"/);
  assert.match(source, /api_get_dashboard_stats/);
  assert.match(source, /api_get_meetings/);
  assert.match(source, /api_get_commitments/);
  assert.match(source, /api_update_commitment_status/);
  assert.match(source, /searchParams\.get\('highlight'\)/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /router\.push\(`\/\?meeting=\$\{meetingId\}`\)/);
  assert.match(source, /t\('brand\.developed_by'\)/);
});

test('Home consumes meeting deep links into the Intelligence SPA once on mount', () => {
  const source = read('src/app/page.tsx');
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('meeting'\)/);
  assert.match(source, /setPendingMeetingId\(meetingId\)/);
  assert.match(source, /meetings\.find\(\(item\) => item\.id === pendingMeetingId\)/);
  assert.match(source, /currentMeeting\?\.id === pendingMeetingId/);
  assert.doesNotMatch(source, /meeting\?\.title \|\| 'Reunión'/);
  assert.match(source, /setCurrentMeeting\(\{ id: meetingId, title \}\)/);
  assert.match(source, /setActiveScreen\('intelligence'\)/);
  assert.match(source, /router\.replace\('\/'\)/);
});

test('Hub empty commitments CTA does not route through removed minutas surface', () => {
  const source = read('src/app/compromisos/page.tsx');
  assert.doesNotMatch(source, /router\.push\('\/minutas'\)/);
  assert.doesNotMatch(source, /\bbg-card\b|\bbg-muted\/40\b|\btext-foreground\b|\bborder-border\b/);
});

for (const [route, destination] of [['inicio', '/'], ['historial', '/'], ['minutas', '/'], ['reuniones', '/compromisos']]) {
  test(`${route} redirects to ${destination}`, () => {
    const source = read(`src/app/${route}/page.tsx`);
    assert.match(source, new RegExp(`router\\.replace\\('${destination.replace('/', '\\/')}'\\)`));
  });
}
