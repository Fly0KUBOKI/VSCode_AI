import { access } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { formatDuration, normalizeWindow, safeErrorMessage, unavailableSnapshot } from '../core/usage';
import type { Logger, UsageProvider, UsageSnapshot, UsageWindow } from '../types';
import { CodexAppServerClient } from './codexAppServerClient';

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

export class CodexProvider implements UsageProvider {
  readonly id = 'codex' as const;
  readonly serviceName = 'Codex';
  private client: CodexAppServerClient | undefined;
  private clientPath: string | undefined;

  constructor(private readonly logger: Logger) {}

  async isAvailable(): Promise<boolean> {
    return (await this.findExecutable()) !== undefined;
  }

  async fetchUsage(): Promise<UsageSnapshot> {
    const executable = await this.findExecutable();
    if (!executable) {
      return unavailableSnapshot(
        this.id,
        this.serviceName,
        'OpenAI Codex App Server',
        'CODEX_NOT_INSTALLED',
        'OpenAI公式Codex拡張またはCodex実行ファイルが見つかりません。'
      );
    }
    if (!this.client || this.clientPath !== executable) {
      this.client?.dispose();
      this.client = new CodexAppServerClient(executable, this.logger);
      this.clientPath = executable;
    }

    try {
      const response = await this.client.readRateLimits();
      return parseCodexRateLimits(response);
    } catch (error) {
      this.client.dispose();
      this.client = undefined;
      const message = safeErrorMessage(error);
      const isAuth = /login|auth|unauthorized|401/i.test(message);
      return unavailableSnapshot(
        this.id,
        this.serviceName,
        'OpenAI Codex App Server',
        isAuth ? 'CODEX_NOT_LOGGED_IN' : 'CODEX_APP_SERVER_ERROR',
        isAuth ? 'CodexへChatGPTアカウントでログインしてください。' : message,
        'error'
      );
    }
  }

  dispose(): void {
    this.client?.dispose();
    this.client = undefined;
  }

  private async findExecutable(): Promise<string | undefined> {
    const configured = vscode.workspace
      .getConfiguration('aiUsageMonitor.codex')
      .get<string>('executablePath', '')
      .trim();
    const candidates: string[] = [];
    if (configured) {
      candidates.push(configured);
    }
    const extension = vscode.extensions.getExtension('openai.chatgpt');
    if (extension) {
      candidates.push(
        path.join(extension.extensionPath, 'bin', 'windows-x86_64', 'codex.exe'),
        path.join(extension.extensionPath, 'bin', 'windows-aarch64', 'codex.exe')
      );
    }
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Try the next explicit, bounded candidate.
      }
    }
    return undefined;
  }
}
