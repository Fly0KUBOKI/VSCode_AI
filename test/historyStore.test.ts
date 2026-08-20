import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { HistoryStore } from '../src/services/historyStore';
import type { UsageSnapshot } from '../src/types';

function snapshot(capturedAt: string, usedPercent: number): UsageSnapshot {
  return {
    providerId: 'codex',
    serviceName: 'Codex',
    capturedAt,
    source: 'test',
    confidence: 'measured',
    status: 'ok',
    windows: [{ id: 'codex:primary', label: '5時間枠', usedPercent, remainingPercent: 100 - usedPercent }]
  };
}

test('HistoryStore appends, reads, prunes and clears JSONL records', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-usage-monitor-test-'));
  try {
    const store = new HistoryStore(directory);
    await store.append(snapshot(new Date(Date.now() - 40 * 86_400_000).toISOString(), 10));
    await store.append(snapshot(new Date().toISOString(), 20));
    assert.equal((await store.read(30)).length, 1);
    assert.equal(await store.prune(30), 1);
    assert.equal((await store.read(30))[0]?.windows[0]?.usedPercent, 20);
    await store.clear();
    assert.deepEqual(await store.read(30), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
