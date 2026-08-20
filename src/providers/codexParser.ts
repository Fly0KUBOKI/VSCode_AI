import { formatDuration, normalizeWindow, unavailableSnapshot } from '../core/usage';
import type { UsageSnapshot, UsageWindow } from '../types';

interface RawRateLimitWindow {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

interface RawRateLimitSnapshot {
  limitId?: string;
  limitName?: string | null;
  primary?: RawRateLimitWindow | null;
  secondary?: RawRateLimitWindow | null;
}

interface RawRateLimitsResponse {
  rateLimits?: RawRateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RawRateLimitSnapshot> | null;
}

export function parseCodexRateLimits(raw: unknown, capturedAt = new Date().toISOString()): UsageSnapshot {
  const response = (raw ?? {}) as RawRateLimitsResponse;
  const mapped = response.rateLimitsByLimitId && Object.keys(response.rateLimitsByLimitId).length > 0
    ? Object.entries(response.rateLimitsByLimitId)
    : response.rateLimits
      ? [[response.rateLimits.limitId ?? 'codex', response.rateLimits] as const]
      : [];
  const windows: UsageWindow[] = [];

  for (const [fallbackId, snapshot] of mapped) {
    if (!snapshot || typeof snapshot !== 'object') {
      continue;
    }
    const limitId = snapshot.limitId || fallbackId;
    const limitName = snapshot.limitName || limitId;
    for (const [windowName, rawWindow] of [
      ['primary', snapshot.primary],
      ['secondary', snapshot.secondary]
    ] as const) {
      if (!rawWindow || typeof rawWindow.usedPercent !== 'number') {
        continue;
      }
      const duration = typeof rawWindow.windowDurationMins === 'number' ? rawWindow.windowDurationMins : undefined;
      const prefix = mapped.length > 1 ? `${limitName} ` : '';
      windows.push(normalizeWindow({
        id: `${limitId}:${windowName}`,
        label: `${prefix}${formatDuration(duration)}`,
        usedPercent: rawWindow.usedPercent,
        resetsAt: typeof rawWindow.resetsAt === 'number'
          ? new Date(rawWindow.resetsAt * 1000).toISOString()
          : undefined,
        windowDurationMinutes: duration
      }));
    }
  }

  if (windows.length === 0) {
    return unavailableSnapshot(
      'codex',
      'Codex',
      'OpenAI Codex App Server',
      'CODEX_USAGE_EMPTY',
      'Codexから利用枠が返されませんでした。'
    );
  }

  return {
    providerId: 'codex',
    serviceName: 'Codex',
    capturedAt,
    source: 'OpenAI Codex App Server: account/rateLimits/read',
    confidence: 'measured',
    windows,
    status: 'ok'
  };
}
