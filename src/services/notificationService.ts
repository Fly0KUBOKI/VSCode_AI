import * as vscode from 'vscode';
import { reachedThresholds, ResetDetector } from '../core/notificationRules';
import type { ProviderId, UsageSnapshot } from '../types';

interface PersistedNotificationState {
  [windowKey: string]: number[];
}

const STORAGE_KEY = 'aiUsageMonitor.notifications.state';

export class NotificationService {
  private state: PersistedNotificationState;
  private readonly resetDetector = new ResetDetector();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.state = context.globalState.get<PersistedNotificationState>(STORAGE_KEY, {});
  }

  async process(previous: UsageSnapshot | undefined, current: UsageSnapshot): Promise<void> {
    if (current.status !== 'ok' && current.status !== 'stale') {
      return;
    }
    const configuration = vscode.workspace.getConfiguration('aiUsageMonitor.notifications');
    const thresholds = configuration.get<number[]>('thresholds', [70, 85, 95, 100]);
    const notifyReset = configuration.get<boolean>('reset', true);
    const previousById = new Map(previous?.windows.map((window) => [window.id, window]) ?? []);

    for (const currentWindow of current.windows) {
      const key = `${current.providerId}:${currentWindow.id}`;
      const previousWindow = previousById.get(currentWindow.id);
      if (previousWindow && this.resetDetector.detect(key, previousWindow, currentWindow)) {
        this.state[key] = [];
        if (notifyReset) {
          void vscode.window.showInformationMessage(
            `${current.serviceName}「${currentWindow.label}」の利用枠がリセットされました。`
          );
        }
      }

      const notified = new Set(this.state[key] ?? []);
      const reached = reachedThresholds(
        previousWindow?.usedPercent,
        currentWindow.usedPercent,
        thresholds,
        notified
      );
      if (reached.length === 0) {
        continue;
      }
      for (const threshold of thresholds) {
        if ((currentWindow.usedPercent ?? 0) >= threshold) {
          notified.add(threshold);
        }
      }
      this.state[key] = [...notified].sort((a, b) => a - b);
      const highest = Math.max(...reached);
      const message = `${current.serviceName}「${currentWindow.label}」の利用率が${highest}%に達しました。`;
      if (highest >= 95) {
        void vscode.window.showWarningMessage(message);
      } else {
        void vscode.window.showInformationMessage(message);
      }
    }
    await this.context.globalState.update(STORAGE_KEY, this.state);
  }

  notifyRepeatedError(providerId: ProviderId, serviceName: string, consecutiveFailures: number): void {
    const enabled = vscode.workspace
      .getConfiguration('aiUsageMonitor.notifications')
      .get<boolean>('errors', true);
    if (enabled && consecutiveFailures === 3) {
      void vscode.window.showWarningMessage(`${serviceName}の利用率を3回連続で取得できませんでした。`);
    }
  }

  async clear(): Promise<void> {
    this.state = {};
    await this.context.globalState.update(STORAGE_KEY, undefined);
  }
}
