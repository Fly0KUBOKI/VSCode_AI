import type { UsageWindow } from '../types';

export function reachedThresholds(
  previousPercent: number | undefined,
  currentPercent: number | undefined,
  thresholds: readonly number[],
  alreadyNotified: ReadonlySet<number>
): number[] {
  if (currentPercent === undefined) {
    return [];
  }
  const normalized = [...new Set(thresholds)]
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 100)
    .sort((a, b) => a - b);
  return normalized.filter((threshold) =>
    currentPercent >= threshold
    && (previousPercent === undefined || previousPercent < threshold)
    && !alreadyNotified.has(threshold)
  );
}

export function hasStrongResetSignal(previous: UsageWindow, current: UsageWindow): boolean {
  if (previous.usedPercent === undefined || current.usedPercent === undefined) {
    return false;
  }
  if (!previous.resetsAt || !current.resetsAt) {
    return false;
  }
  const previousReset = Date.parse(previous.resetsAt);
  const currentReset = Date.parse(current.resetsAt);
  return Number.isFinite(previousReset)
    && Number.isFinite(currentReset)
    && currentReset > previousReset
    && previous.usedPercent - current.usedPercent >= 20;
}

export function hasWeakResetSignal(previous: UsageWindow, current: UsageWindow): boolean {
  if (previous.usedPercent === undefined || current.usedPercent === undefined) {
    return false;
  }
  return previous.usedPercent - current.usedPercent >= 30 && current.usedPercent <= 20;
}

export class ResetDetector {
  private readonly pending = new Map<string, number>();

  detect(key: string, previous: UsageWindow, current: UsageWindow): boolean {
    if (hasStrongResetSignal(previous, current)) {
      this.pending.delete(key);
      return true;
    }
    const wasPending = this.pending.has(key);
    const stillLow = current.usedPercent !== undefined && current.usedPercent <= 20;
    if (!hasWeakResetSignal(previous, current) && !(wasPending && stillLow)) {
      this.pending.delete(key);
      return false;
    }
    const observations = (this.pending.get(key) ?? 0) + 1;
    if (observations >= 2) {
      this.pending.delete(key);
      return true;
    }
    this.pending.set(key, observations);
    return false;
  }
}
