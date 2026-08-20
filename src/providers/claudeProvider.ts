import * as vscode from 'vscode';
import { normalizeWindow, unavailableSnapshot } from '../core/usage';
import type { ManualClaudeUsage, UsageProvider, UsageSnapshot, UsageWindow } from '../types';

const STORAGE_KEY = 'aiUsageMonitor.claude.manualUsage';

export class ClaudeProvider implements UsageProvider {
  readonly id = 'claude-code' as const;
  readonly serviceName = 'Claude Code';

  constructor(private readonly context: vscode.ExtensionContext) {}

  async isAvailable(): Promise<boolean> {
    return vscode.extensions.getExtension('anthropic.claude-code') !== undefined;
  }

  async fetchUsage(): Promise<UsageSnapshot> {
    const manual = this.context.globalState.get<ManualClaudeUsage>(STORAGE_KEY);
    const showEstimated = vscode.workspace
      .getConfiguration('aiUsageMonitor')
      .get<boolean>('showEstimatedValues', true);
    if (manual && showEstimated && manual.windows.length > 0) {
      const maxAgeMinutes = vscode.workspace
        .getConfiguration('aiUsageMonitor.claude')
        .get<number>('manualDataMaxAgeMinutes', 15);
      const age = Date.now() - Date.parse(manual.capturedAt);
      const stale = !Number.isFinite(age) || age > maxAgeMinutes * 60_000;
      return {
        providerId: this.id,
        serviceName: this.serviceName,
        capturedAt: manual.capturedAt,
        source: 'Claude公式画面からの手動入力',
        confidence: 'semi-measured',
        windows: manual.windows.map(normalizeWindow),
        status: stale ? 'stale' : 'ok',
        errorCode: stale ? 'CLAUDE_MANUAL_DATA_STALE' : undefined,
        errorMessage: stale ? '手動入力値の有効時間を超えています。再入力してください。' : undefined
      };
    }

    const installed = await this.isAvailable();
    return unavailableSnapshot(
      this.id,
      this.serviceName,
      'Anthropic Claude Code公式拡張',
      installed ? 'CLAUDE_USAGE_API_UNAVAILABLE' : 'CLAUDE_NOT_INSTALLED',
      installed
        ? 'Claude公式拡張は他の拡張向けUsage APIを公開していません。公式画面の値を手動入力してください。'
        : 'Anthropic公式Claude Code拡張が見つかりません。'
    );
  }

  async setManualUsage(windows: UsageWindow[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, {
      capturedAt: new Date().toISOString(),
      windows: windows.map(normalizeWindow)
    } satisfies ManualClaudeUsage);
  }

  async clearManualUsage(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, undefined);
  }
}
