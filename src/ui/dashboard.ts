import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  confidenceLabel,
  escapeHtml,
  percentLabel,
  statusLabel
} from '../core/usage';
import type { HistoryRecord, ProviderId, UsageSnapshot, UsageWindow } from '../types';
import type { UsageManager } from '../services/usageManager';

export class Dashboard implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly manager: UsageManager) {
    this.subscriptions.push(manager.onDidChange(() => {
      void this.render();
    }));
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.render();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'aiUsageMonitor.dashboard',
      'AI Usage Monitor',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: false }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, undefined, this.subscriptions);
    this.panel.webview.onDidReceiveMessage(async (message: { command?: string }) => {
      switch (message.command) {
        case 'refresh': await vscode.commands.executeCommand('aiUsageMonitor.refresh'); break;
        case 'refreshCodex': await vscode.commands.executeCommand('aiUsageMonitor.refreshCodex'); break;
        case 'refreshClaude': await vscode.commands.executeCommand('aiUsageMonitor.refreshClaude'); break;
        case 'setClaude': await vscode.commands.executeCommand('aiUsageMonitor.setClaudeUsage'); break;
        case 'openSettings': await vscode.commands.executeCommand('aiUsageMonitor.openSettings'); break;
        case 'openCodex': await vscode.commands.executeCommand('chatgpt.openSidebar'); break;
        case 'openClaude': await vscode.commands.executeCommand('claude-vscode.editor.openLast'); break;
      }
    }, undefined, this.subscriptions);
    await this.render();
  }

  dispose(): void {
    this.panel?.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private async render(): Promise<void> {
    const panel = this.panel;
    if (!panel) {
      return;
    }
    const retentionDays = vscode.workspace
      .getConfiguration('aiUsageMonitor')
      .get<number>('historyRetentionDays', 30);
    let history: HistoryRecord[] = [];
    try {
      history = await this.manager.history.read(retentionDays, 5_000);
    } catch {
      // The dashboard still renders current values if history is unavailable.
    }
    const nonce = randomBytes(16).toString('hex');
    panel.webview.html = this.html(panel.webview, nonce, this.manager.getLatest(), history);
  }

  private html(
    webview: vscode.Webview,
    nonce: string,
    snapshots: ReadonlyMap<ProviderId, UsageSnapshot>,
    history: HistoryRecord[]
  ): string {
    const cards = (['codex', 'claude-code'] as const)
      .map((providerId) => this.card(providerId, snapshots.get(providerId), history))
      .join('');
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>AI Usage Monitor</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin: 0; }
    h2 { font-size: 18px; margin: 0; }
    h3 { font-size: 14px; margin: 0 0 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 7px 12px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 16px; min-width: 0; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 14px; }
    .badge { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    .window { border-top: 1px solid var(--vscode-panel-border); padding-top: 14px; margin-top: 14px; }
    .metric { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .value { font-size: 22px; font-weight: 600; }
    progress { width: 100%; height: 10px; border: 0; border-radius: 999px; overflow: hidden; appearance: none; }
    progress::-webkit-progress-bar { background: var(--vscode-editorWidget-background); }
    progress::-webkit-progress-value { background: var(--vscode-progressBar-background); }
    .warning progress::-webkit-progress-value { background: var(--vscode-charts-yellow); }
    .critical progress::-webkit-progress-value { background: var(--vscode-errorForeground); }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.55; margin-top: 10px; overflow-wrap: anywhere; }
    .error { border-left: 3px solid var(--vscode-errorForeground); padding-left: 10px; margin: 12px 0; }
    .chart { width: 100%; height: 90px; margin-top: 10px; }
    .chart-line { fill: none; stroke: var(--vscode-charts-blue); stroke-width: 2; }
    .chart-grid { stroke: var(--vscode-panel-border); stroke-width: 1; }
    .empty { color: var(--vscode-descriptionForeground); padding: 22px 0; }
    footer { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 20px; }
    @media (max-width: 560px) { body { padding: 14px; } header { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div><h1>AI Usage Monitor</h1><div class="meta">CodexとClaude Codeは合算せず、制限枠ごとに表示します。</div></div>
    <div class="actions">
      <button data-command="refresh">すべて更新</button>
      <button class="secondary" data-command="openSettings">設定</button>
    </div>
  </header>
  <main class="grid">${cards}</main>
  <footer>* は準実測または推定値です。会話内容・コード・認証情報は保存しません。</footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`;
  }

  private card(providerId: ProviderId, snapshot: UsageSnapshot | undefined, history: HistoryRecord[]): string {
    const serviceName = providerId === 'codex' ? 'Codex' : 'Claude Code';
    const refreshCommand = providerId === 'codex' ? 'refreshCodex' : 'refreshClaude';
    const openCommand = providerId === 'codex' ? 'openCodex' : 'openClaude';
    const extraButton = providerId === 'claude-code'
      ? '<button class="secondary" data-command="setClaude">公式画面値を入力</button>'
      : '';
    if (!snapshot) {
      return `<section class="card"><div class="card-head"><h2>${serviceName}</h2><span class="badge">未取得</span></div><div class="empty">利用率を読み込んでいます。</div></section>`;
    }
    const windows = snapshot.windows.length > 0
      ? snapshot.windows.map((window) => this.window(providerId, window, history)).join('')
      : `<div class="empty">利用枠を表示できません。</div>`;
    const error = snapshot.errorMessage
      ? `<div class="error">${escapeHtml(snapshot.errorMessage)}</div>`
      : '';
    return `<section class="card">
      <div class="card-head"><h2>${escapeHtml(snapshot.serviceName)}</h2><span class="badge">${statusLabel(snapshot.status)} / ${confidenceLabel(snapshot.confidence)}</span></div>
      <div class="actions">
        <button data-command="${refreshCommand}">更新</button>
        <button class="secondary" data-command="${openCommand}">公式画面を開く</button>
        ${extraButton}
      </div>
      ${error}${windows}
      <div class="meta">取得元: ${escapeHtml(snapshot.source)}<br>最終取得: ${escapeHtml(new Date(snapshot.capturedAt).toLocaleString('ja-JP'))}</div>
    </section>`;
  }

  private window(providerId: ProviderId, window: UsageWindow, history: HistoryRecord[]): string {
    const used = window.usedPercent;
    const severity = (used ?? 0) >= 95 ? 'critical' : (used ?? 0) >= 85 ? 'warning' : '';
    const reset = window.resetsAt ? new Date(window.resetsAt).toLocaleString('ja-JP') : '不明';
    return `<div class="window ${severity}">
      <div class="metric"><h3>${escapeHtml(window.label)}</h3><span class="value">${percentLabel(used)}</span></div>
      <progress max="100" value="${Math.max(0, Math.min(100, used ?? 0))}" aria-label="${escapeHtml(window.label)}"></progress>
      <div class="meta">残り ${percentLabel(window.remainingPercent)} / 次回リセット ${escapeHtml(reset)}</div>
      ${this.chart(providerId, window.id, history)}
    </div>`;
  }

  private chart(providerId: ProviderId, windowId: string, history: HistoryRecord[]): string {
    const points = history
      .filter((record) => record.providerId === providerId)
      .flatMap((record) => {
        const window = record.windows.find((candidate) => candidate.id === windowId);
        return window?.usedPercent === undefined ? [] : [{ time: Date.parse(record.capturedAt), value: window.usedPercent }];
      })
      .filter((point) => Number.isFinite(point.time))
      .slice(-120);
    if (points.length < 2) {
      return '<div class="meta">履歴グラフは2件以上のデータ取得後に表示されます。</div>';
    }
    const coordinates = points.map((point, index) => {
      const x = points.length === 1 ? 0 : index / (points.length - 1) * 320;
      const y = 85 - Math.max(0, Math.min(100, point.value)) / 100 * 80;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="chart" viewBox="0 0 320 90" role="img" aria-label="最近の利用率推移">
      <line class="chart-grid" x1="0" y1="45" x2="320" y2="45"></line>
      <line class="chart-grid" x1="0" y1="85" x2="320" y2="85"></line>
      <polyline class="chart-line" points="${coordinates}"></polyline>
    </svg>`;
  }
}
