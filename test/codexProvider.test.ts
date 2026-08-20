import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCodexRateLimits } from '../src/providers/codexParser';

test('parseCodexRateLimits parses all buckets and windows', () => {
  const snapshot = parseCodexRateLimits({
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        limitName: null,
        primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
        secondary: { usedPercent: 42.25, windowDurationMins: 10080, resetsAt: 1_800_100_000 }
      },
      fast: {
        limitId: 'fast',
        limitName: 'Fast',
        primary: { usedPercent: 12, windowDurationMins: 60, resetsAt: 1_800_000_000 },
        secondary: null
      }
    }
  }, '2026-08-21T00:00:00.000Z');

  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.confidence, 'measured');
  assert.equal(snapshot.windows.length, 3);
  assert.deepEqual(snapshot.windows[0], {
    id: 'codex:primary',
    label: 'codex 5時間枠',
    usedPercent: 25,
    remainingPercent: 75,
    resetsAt: new Date(1_800_000_000 * 1000).toISOString(),
    windowDurationMinutes: 300
  });
  assert.equal(snapshot.windows[1]?.usedPercent, 42.3);
  assert.equal(snapshot.windows[2]?.label, 'Fast 1時間枠');
});

test('parseCodexRateLimits reports unavailable instead of inventing zero', () => {
  const snapshot = parseCodexRateLimits({ rateLimitsByLimitId: {} });
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.windows.length, 0);
  assert.equal(snapshot.errorCode, 'CODEX_USAGE_EMPTY');
});
