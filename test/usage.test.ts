import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPercent, normalizeWindow, worstWindow } from '../src/core/usage';
import type { UsageSnapshot } from '../src/types';

test('clampPercent normalizes valid percentages', () => {
  assert.equal(clampPercent(-3), 0);
  assert.equal(clampPercent(35.27), 35.3);
  assert.equal(clampPercent(120), 100);
  assert.throws(() => clampPercent(Number.NaN));
});

test('normalizeWindow derives remaining percentage', () => {
  assert.deepEqual(normalizeWindow({ id: 'a', label: 'A', usedPercent: 64 }), {
    id: 'a',
    label: 'A',
    usedPercent: 64,
    remainingPercent: 36
  });
});

test('worstWindow returns the highest used percentage', () => {
  const snapshot: UsageSnapshot = {
    providerId: 'codex',
    serviceName: 'Codex',
    capturedAt: new Date().toISOString(),
    source: 'test',
    confidence: 'measured',
    status: 'ok',
    windows: [
      { id: 'short', label: '短期', usedPercent: 25 },
      { id: 'weekly', label: '週', usedPercent: 82 }
    ]
  };
  assert.equal(worstWindow(snapshot)?.id, 'weekly');
});
