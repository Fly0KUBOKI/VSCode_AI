import * as vscode from 'vscode';
import { confidenceLabel, percentLabel, worstWindow } from '../core/usage';
import type { ProviderId, UsageSnapshot } from '../types';

export class UsageStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = 'aiUsageMonitor.openDashboard';
    this.item.name = 'AI Usage Monitor';
    this.item.text = '$(pulse) AI Usage: 読み込み中';
    this.item.tooltip = 'CodexとClaude Codeの利用率を読み込んでいます。';
    this.item.show();
  }

  update(snapshots: ReadonlyMap<ProviderId, UsageSnapshot>): void {
    const codex = snapshots.get('codex');
    const claude = snapshots.get('claude-code');
    const codexWorst = worstWindow(codex);
    const claudeWorst = worstWindow(claude);
    const maxUsed = Math.max(codexWorst?.usedPercent ?? -1, claudeWorst?.usedPercent ?? -1);
    const stale = codex?.status === 'stale' || claude?.status === 'stale';
    const hasError = codex?.status === 'error' || claude?.status === 'error';

    const icon = hasError ? '$(error)' : stale ? '$(history)' : maxUsed >= 95 ? '$(warning)' : '$(pulse)';
    this.item.text = `${icon} Codex ${this.shortValue(codex)} | Claude ${this.shortValue(claude)}`;
    this.item.backgroundColor = maxUsed >= 95 || hasError
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : maxUsed >= 85
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
    this.item.tooltip = this.tooltip(snapshots);
  }

  dispose(): void {
    this.item.dispose();
  }

  private shortValue(snapshot: UsageSnapshot | undefined): string {
    if (!snapshot) {
      return '…';
    }
    const window = worstWindow(snapshot);
    if (!window) {
      return snapshot.status === 'unavailable' ? '取得不可' : '?';
    }
    const suffix = snapshot.status === 'stale' ? ' (古)' : snapshot.confidence === 'measured' ? '' : ' *';
    return `${percentLabel(window.usedPercent)}${suffix}`;
  }

  private tooltip(snapshots: ReadonlyMap<ProviderId, UsageSnapshot>): vscode.MarkdownString {
    const lines = ['### AI Usage Monitor'];
    for (const providerId of ['codex', 'claude-code'] as const) {
      const snapshot = snapshots.get(providerId);
      if (!snapshot) {
        continue;
      }
      lines.push('', `**${snapshot.serviceName}** — ${confidenceLabel(snapshot.confidence)}`);
      if (snapshot.windows.length === 0) {
        lines.push(snapshot.errorMessage ?? '利用率を取得できません。');
      } else {
        for (const window of snapshot.windows) {
          const reset = window.resetsAt ? ` / リセット ${new Date(window.resetsAt).toLocaleString('ja-JP')}` : '';
          lines.push(`- ${window.label}: ${percentLabel(window.usedPercent)}使用${reset}`);
        }
      }
      lines.push(`- 最終取得: ${new Date(snapshot.capturedAt).toLocaleString('ja-JP')}`);
    }
    lines.push('', 'クリックして詳細を表示');
    return new vscode.MarkdownString(lines.join('\n'));
  }
}
