import * as vscode from 'vscode';
import { safeErrorMessage } from './core/usage';
import { ClaudeProvider } from './providers/claudeProvider';
import { CodexProvider } from './providers/codexProvider';
import { HistoryStore } from './services/historyStore';
import { NotificationService } from './services/notificationService';
import { UsageManager } from './services/usageManager';
import type { Logger, ProviderId, UsageWindow } from './types';
import { Dashboard } from './ui/dashboard';
import { UsageStatusBar } from './ui/statusBar';

export interface AiUsageMonitorApi {
  refresh(): Promise<void>;
  getLatest(): ReturnType<UsageManager['getLatest']>;
}

export function activate(context: vscode.ExtensionContext): AiUsageMonitorApi {
  const output = vscode.window.createOutputChannel('AI Usage Monitor', { log: true });
  const logger: Logger = (level, message) => {
    if (level === 'debug' && !vscode.workspace.getConfiguration('aiUsageMonitor').get<boolean>('debugLogging', false)) {
      return;
    }
    const safeMessage = message.replace(/[\r\n]+/g, ' ').slice(0, 1000);
    switch (level) {
      case 'debug': output.debug(safeMessage); break;
      case 'info': output.info(safeMessage); break;
      case 'warn': output.warn(safeMessage); break;
      case 'error': output.error(safeMessage); break;
    }
  };

  const codexProvider = new CodexProvider(logger);
  const claudeProvider = new ClaudeProvider(context);
  const history = new HistoryStore(context.globalStorageUri.fsPath);
  const notifications = new NotificationService(context);
  const manager = new UsageManager(
    context,
    [codexProvider, claudeProvider],
    history,
    notifications,
    logger
  );
  const statusBar = new UsageStatusBar();
  const dashboard = new Dashboard(manager);

  context.subscriptions.push(output, manager, statusBar, dashboard);
  context.subscriptions.push(manager.onDidChange((snapshots) => statusBar.update(snapshots)));

  const runRefresh = async (providerIds?: readonly ProviderId[]): Promise<void> => {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'AI利用率を更新中…' },
      async () => {
        const outcomes = await manager.refresh(providerIds);
        const failures = outcomes.filter((outcome) => !outcome.succeeded && outcome.snapshot.status === 'error');
        if (failures.length > 0) {
          void vscode.window.showWarningMessage(
            `${failures.map((failure) => failure.snapshot.serviceName).join('、')}の更新に失敗しました。前回値を保持します。`
          );
        }
      }
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('aiUsageMonitor.openDashboard', () => dashboard.show()),
    vscode.commands.registerCommand('aiUsageMonitor.refresh', () => runRefresh()),
    vscode.commands.registerCommand('aiUsageMonitor.refreshCodex', () => runRefresh(['codex'])),
    vscode.commands.registerCommand('aiUsageMonitor.refreshClaude', () => runRefresh(['claude-code'])),
    vscode.commands.registerCommand('aiUsageMonitor.setClaudeUsage', async () => {
      const windows = await promptForClaudeUsage();
      if (!windows) {
        return;
      }
      await claudeProvider.setManualUsage(windows);
      await runRefresh(['claude-code']);
      void vscode.window.showInformationMessage('Claude Codeの利用率を保存しました。');
    }),
    vscode.commands.registerCommand('aiUsageMonitor.clearClaudeUsage', async () => {
      await claudeProvider.clearManualUsage();
      await runRefresh(['claude-code']);
      void vscode.window.showInformationMessage('Claude Codeの手動利用率を削除しました。');
    }),
    vscode.commands.registerCommand('aiUsageMonitor.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:personal.ai-usage-monitor')
    ),
    vscode.commands.registerCommand('aiUsageMonitor.clearHistory', async () => {
      const answer = await vscode.window.showWarningMessage(
        'AI利用率のローカル履歴を削除します。この操作は元に戻せません。',
        { modal: true },
        '削除'
      );
      if (answer === '削除') {
        await history.clear();
        await notifications.clear();
        void vscode.window.showInformationMessage('AI利用率の履歴を削除しました。');
      }
    }),
    vscode.commands.registerCommand('aiUsageMonitor.showLogs', () => output.show(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('aiUsageMonitor')) {
        manager.restartScheduling();
        void manager.refresh().catch((error) => {
          logger('warn', `設定変更後の更新に失敗しました: ${safeErrorMessage(error)}`);
        });
      }
    })
  );

  void manager.start().catch((error) => {
    logger('error', `AI Usage Monitorの起動処理に失敗しました: ${safeErrorMessage(error)}`);
  });

  logger('info', 'AI Usage Monitorを起動しました。');
  return {
    refresh: async () => { await runRefresh(); },
    getLatest: () => manager.getLatest()
  };
}

async function promptForClaudeUsage(): Promise<UsageWindow[] | undefined> {
  const definitions = [
    { id: 'claude:five-hour', label: '5時間枠', prompt: 'Claudeの5時間枠の使用率（0～100）' },
    { id: 'claude:seven-day', label: '週単位枠', prompt: 'Claudeの週単位枠の使用率（0～100、表示がなければ空欄）' },
    { id: 'claude:seven-day-sonnet', label: 'Sonnet週単位枠', prompt: 'ClaudeのSonnet週単位枠の使用率（0～100、表示がなければ空欄）' }
  ] as const;
  const windows: UsageWindow[] = [];
  for (const definition of definitions) {
    const raw = await vscode.window.showInputBox({
      title: 'Claude Code利用率の手動入力',
      prompt: definition.prompt,
      placeHolder: '例: 42.5',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return definition.id === 'claude:five-hour' ? '5時間枠は入力してください。' : undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
          ? undefined
          : '0から100までの数値を入力してください。';
      }
    });
    if (raw === undefined) {
      return undefined;
    }
    if (raw.trim()) {
      const usedPercent = Number(raw);
      windows.push({
        id: definition.id,
        label: definition.label,
        usedPercent,
        remainingPercent: 100 - usedPercent
      });
    }
  }
  return windows;
}

export function deactivate(): void {
  // VS Code disposes all subscriptions registered in the extension context.
}
