import type { Confidence, ProviderId, UsageSnapshot, UsageWindow } from '../types';

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Percentage must be a finite number.');
  }
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function normalizeWindow(window: UsageWindow): UsageWindow {
  const used = window.usedPercent === undefined ? undefined : clampPercent(window.usedPercent);
  const remaining = window.remainingPercent === undefined
    ? (used === undefined ? undefined : clampPercent(100 - used))
    : clampPercent(window.remainingPercent);

  return {
    ...window,
    usedPercent: used ?? (remaining === undefined ? undefined : clampPercent(100 - remaining)),
    remainingPercent: remaining
  };
}

export function worstWindow(snapshot: UsageSnapshot | undefined): UsageWindow | undefined {
  return snapshot?.windows
    .filter((window) => window.usedPercent !== undefined)
    .reduce<UsageWindow | undefined>((worst, current) => {
      if (!worst || (current.usedPercent ?? -1) > (worst.usedPercent ?? -1)) {
        return current;
      }
      return worst;
    }, undefined);
}

export function unavailableSnapshot(
  providerId: ProviderId,
  serviceName: string,
  source: string,
  errorCode: string,
  errorMessage: string,
  status: 'unavailable' | 'error' = 'unavailable'
): UsageSnapshot {
  return {
    providerId,
    serviceName,
    capturedAt: new Date().toISOString(),
    source,
    confidence: 'unknown',
    windows: [],
    status,
    errorCode,
    errorMessage
  };
}

export function formatDuration(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) {
    return '制限枠';
  }
  if (minutes % 10080 === 0) {
    return `${minutes / 10080}週間枠`;
  }
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}日間枠`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}時間枠`;
  }
  return `${minutes}分枠`;
}

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case 'measured': return '実測';
    case 'semi-measured': return '準実測';
    case 'estimated': return '推定';
    case 'unknown': return '不明';
  }
}

export function statusLabel(status: UsageSnapshot['status']): string {
  switch (status) {
    case 'ok': return '正常';
    case 'stale': return '期限切れ';
    case 'unavailable': return '取得不可';
    case 'error': return 'エラー';
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/[\r\n]+/g, ' ').trim();
    return message.slice(0, 300) || error.name;
  }
  return '不明なエラーが発生しました。';
}

export function percentLabel(value: number | undefined): string {
  return value === undefined ? '不明' : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function isSuccessfulSnapshot(snapshot: UsageSnapshot): boolean {
  return snapshot.status === 'ok' || snapshot.status === 'stale';
}
