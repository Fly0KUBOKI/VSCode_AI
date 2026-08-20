import * as vscode from 'vscode';
import { isSuccessfulSnapshot, safeErrorMessage, unavailableSnapshot } from '../core/usage';
import type { Logger, ProviderId, RefreshOutcome, UsageProvider, UsageSnapshot } from '../types';
import { HistoryStore } from './historyStore';
import { NotificationService } from './notificationService';

const LATEST_STORAGE_KEY = 'aiUsageMonitor.latestSnapshots';

export class UsageManager implements vscode.Disposable {
  private readonly latest = new Map<ProviderId, UsageSnapshot>();
  private readonly failures = new Map<ProviderId, number>();
  private readonly lastHistoryRecord = new Map<ProviderId, UsageSnapshot>();
  private readonly changedEmitter = new vscode.EventEmitter<ReadonlyMap<ProviderId, UsageSnapshot>>();
  private refreshPromise: Promise<RefreshOutcome[]> | undefined;
  private activeProviderIds = new Set<ProviderId>();
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  readonly onDidChange = this.changedEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly providers: UsageProvider[],
    readonly history: HistoryStore,
    private readonly notifications: NotificationService,
    private readonly logger: Logger
  ) {
    const stored = context.globalState.get<Partial<Record<ProviderId, UsageSnapshot>>>(LATEST_STORAGE_KEY, {});
    for (const provider of providers) {
      const snapshot = stored[provider.id];
      if (snapshot) {
        this.latest.set(provider.id, { ...snapshot, status: 'stale' });
      }
    }
  }

  getLatest(): ReadonlyMap<ProviderId, UsageSnapshot> {
    return new Map(this.latest);
  }

  async start(): Promise<void> {
    const retentionDays = vscode.workspace
      .getConfiguration('aiUsageMonitor')
      .get<number>('historyRetentionDays', 30);
    try {
      const removed = await this.history.prune(retentionDays);
      if (removed > 0) {
        this.logger('info', `${removed}件の期限切れ履歴を削除しました。`);
      }
    } catch (error) {
      this.logger('warn', `履歴の整理に失敗しました: ${safeErrorMessage(error)}`);
    }
    this.changedEmitter.fire(this.getLatest());
    await this.refresh();
    this.scheduleNext();
  }

  async refresh(providerIds?: readonly ProviderId[]): Promise<RefreshOutcome[]> {
    if (this.refreshPromise) {
      const requested = providerIds ?? this.providers.map((provider) => provider.id);
      const missing = requested.filter((providerId) => !this.activeProviderIds.has(providerId));
      if (missing.length === 0) {
        return this.refreshPromise;
      }
      return this.refreshPromise.then(() => this.refresh(missing));
    }
    const selected = this.providers.filter((provider) =>
      (!providerIds || providerIds.includes(provider.id)) && this.isProviderEnabled(provider.id)
    );
    if (selected.length === 0) {
      return [];
    }
    this.activeProviderIds = new Set(selected.map((provider) => provider.id));
    this.refreshPromise = this.performRefresh(selected).finally(() => {
      this.refreshPromise = undefined;
      this.activeProviderIds.clear();
    });
    return this.refreshPromise;
  }

  restartScheduling(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.scheduleNext();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const provider of this.providers) {
      provider.dispose?.();
    }
    this.changedEmitter.dispose();
  }

  private async performRefresh(providers: UsageProvider[]): Promise<RefreshOutcome[]> {
    const outcomes = await Promise.all(providers.map(async (provider): Promise<RefreshOutcome> => {
      const started = Date.now();
      this.logger('debug', `${provider.serviceName}の利用率取得を開始します。`);
      let snapshot: UsageSnapshot;
      try {
        snapshot = await provider.fetchUsage();
      } catch (error) {
        snapshot = unavailableSnapshot(
          provider.id,
          provider.serviceName,
          'Provider',
          'UNEXPECTED_PROVIDER_ERROR',
          safeErrorMessage(error),
          'error'
        );
      }

      const previous = this.latest.get(provider.id);
      const succeeded = isSuccessfulSnapshot(snapshot);
      if (succeeded) {
        this.failures.set(provider.id, 0);
      } else if (snapshot.status === 'error') {
        const count = (this.failures.get(provider.id) ?? 0) + 1;
        this.failures.set(provider.id, count);
        this.notifications.notifyRepeatedError(provider.id, provider.serviceName, count);
      }

      const displaySnapshot = snapshot.status === 'error' && previous && isSuccessfulSnapshot(previous)
        ? {
            ...previous,
            status: 'stale' as const,
            errorCode: snapshot.errorCode,
            errorMessage: snapshot.errorMessage
          }
        : snapshot;
      this.latest.set(provider.id, displaySnapshot);

      try {
        await this.notifications.process(previous, snapshot);
        if (this.shouldRecordHistory(snapshot)) {
          await this.history.append(snapshot);
          this.lastHistoryRecord.set(provider.id, snapshot);
        }
      } catch (error) {
        this.logger('warn', `${provider.serviceName}の履歴・通知処理に失敗しました: ${safeErrorMessage(error)}`);
      }
      this.logger(
        snapshot.status === 'error' ? 'warn' : 'info',
        `${provider.serviceName}の取得を完了しました（${snapshot.status}, ${Date.now() - started}ms）。`
      );
      return { providerId: provider.id, snapshot, succeeded };
    }));

    await this.persistLatest();
    this.changedEmitter.fire(this.getLatest());
    return outcomes;
  }

  private shouldRecordHistory(snapshot: UsageSnapshot): boolean {
    const previous = this.lastHistoryRecord.get(snapshot.providerId);
    if (!previous) {
      return true;
    }
    if (previous.status !== snapshot.status || previous.confidence !== snapshot.confidence) {
      return true;
    }
    const changed = JSON.stringify(previous.windows.map(({ id, usedPercent, resetsAt }) => ({ id, usedPercent, resetsAt })))
      !== JSON.stringify(snapshot.windows.map(({ id, usedPercent, resetsAt }) => ({ id, usedPercent, resetsAt })));
    if (changed) {
      return true;
    }
    return Date.parse(snapshot.capturedAt) - Date.parse(previous.capturedAt) >= 5 * 60_000;
  }

  private async persistLatest(): Promise<void> {
    const record: Partial<Record<ProviderId, UsageSnapshot>> = {};
    for (const [providerId, snapshot] of this.latest) {
      record[providerId] = snapshot;
    }
    await this.context.globalState.update(LATEST_STORAGE_KEY, record);
  }

  private scheduleNext(): void {
    if (this.disposed || this.timer) {
      return;
    }
    const configuration = vscode.workspace.getConfiguration('aiUsageMonitor');
    if (!configuration.get<boolean>('autoRefresh', true)) {
      return;
    }
    const baseSeconds = Math.max(30, configuration.get<number>('updateIntervalSeconds', 60));
    const maxFailures = Math.max(0, ...this.failures.values());
    const delaySeconds = Math.min(900, baseSeconds * 2 ** Math.max(0, maxFailures - 1));
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      try {
        await this.refresh();
      } finally {
        this.scheduleNext();
      }
    }, delaySeconds * 1000);
  }

  private isProviderEnabled(providerId: ProviderId): boolean {
    const section = providerId === 'codex' ? 'codex' : 'claude';
    return vscode.workspace.getConfiguration(`aiUsageMonitor.${section}`).get<boolean>('enabled', true);
  }
}
