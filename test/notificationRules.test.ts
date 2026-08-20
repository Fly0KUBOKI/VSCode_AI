import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasStrongResetSignal,
  reachedThresholds,
  ResetDetector
} from '../src/core/notificationRules';

test('reachedThresholds returns new thresholds in ascending order', () => {
  const reached = reachedThresholds(60, 97, [100, 85, 70, 95], new Set([70]));
  assert.deepEqual(reached, [85, 95]);
});

test('reachedThresholds does not repeat an already notified threshold', () => {
  assert.deepEqual(reachedThresholds(84, 86, [70, 85], new Set([70, 85])), []);
});

test('strong reset requires a later reset time and a substantial drop', () => {
  assert.equal(hasStrongResetSignal(
    { id: 'w', label: 'W', usedPercent: 90, resetsAt: '2026-08-21T01:00:00.000Z' },
    { id: 'w', label: 'W', usedPercent: 5, resetsAt: '2026-08-21T06:00:00.000Z' }
  ), true);
});

test('weak reset requires two low observations', () => {
  const detector = new ResetDetector();
  const high = { id: 'w', label: 'W', usedPercent: 80 };
  const low = { id: 'w', label: 'W', usedPercent: 10 };
  assert.equal(detector.detect('p:w', high, low), false);
  assert.equal(detector.detect('p:w', low, low), true);
});
