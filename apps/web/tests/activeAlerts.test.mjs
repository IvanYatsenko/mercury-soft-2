import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialAlertPreferences,
  activeAlertText,
} from '../src/activeAlertState.ts';
test('local preferences store configuration only and ignore unsupported events', () => {
  const defaults = initialAlertPreferences(null);
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.sound, false);
  assert.ok(defaults.events.includes('completed'));
  assert.deepEqual(initialAlertPreferences('broken'), defaults);
  assert.deepEqual(
    initialAlertPreferences(
      JSON.stringify({
        enabled: false,
        sound: true,
        events: ['started', 'invalid'],
      }),
    ),
    { enabled: false, sound: true, events: ['started'] },
  );
});
test('active messages include event, profile and completion result as plain text', () => {
  assert.equal(
    activeAlertText({
      id: '1',
      kind: 'completed',
      at: '',
      profileName: 'Паста',
      matched: true,
    }),
    'Завершение профиля · Паста · В допуске',
  );
  assert.match(
    activeAlertText({ id: '2', kind: 'error', at: '', message: 'Ошибка 65' }),
    /Ошибка 65/,
  );
});
