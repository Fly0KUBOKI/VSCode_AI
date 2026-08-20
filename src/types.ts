export type ProviderId = 'codex' | 'claude-code';
export type Confidence = 'measured' | 'semi-measured' | 'estimated' | 'unknown';
export type SnapshotStatus = 'ok' | 'stale' | 'unavailable' | 'error';

export interface UsageWindow {
  id: string;
  label: string;
  usedPercent?: number;
  remainingPercent?: number;
  resetsAt?: string;
  windowDurationMinutes?: number;
}

export interface UsageSnapshot {
  providerId: ProviderId;
  serviceName: string;
  capturedAt: string;
  source: string;
  confidence: Confidence;
  windows: UsageWindow[];
  status: SnapshotStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface UsageProvider {
  readonly id: ProviderId;
  readonly serviceName: string;
  isAvailable(): Promise<boolean>;
  fetchUsage(): Promise<UsageSnapshot>;
  dispose?(): void;
}

export interface ManualClaudeUsage {
  capturedAt: string;
  windows: UsageWindow[];
}

export interface HistoryRecord {
  providerId: ProviderId;
  capturedAt: string;
  confidence: Confidence;
  status: SnapshotStatus;
  windows: UsageWindow[];
}

export interface RefreshOutcome {
  providerId: ProviderId;
  snapshot: UsageSnapshot;
  succeeded: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string) => void;
