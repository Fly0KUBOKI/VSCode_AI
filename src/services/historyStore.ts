import { appendFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { HistoryRecord, UsageSnapshot } from '../types';

const HISTORY_FILE_NAME = 'usage-history.jsonl';

export class HistoryStore {
  private readonly filePath: string;
  private initialized = false;

  constructor(private readonly storageDirectory: string) {
    this.filePath = path.join(storageDirectory, HISTORY_FILE_NAME);
  }

  get path(): string {
    return this.filePath;
  }

  async append(snapshot: UsageSnapshot): Promise<void> {
    await this.ensureDirectory();
    const record: HistoryRecord = {
      providerId: snapshot.providerId,
      capturedAt: snapshot.capturedAt,
      confidence: snapshot.confidence,
      status: snapshot.status,
      windows: snapshot.windows.map((window) => ({ ...window }))
    };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  }

  async read(retentionDays: number, maxRecords = 10_000): Promise<HistoryRecord[]> {
    const records = await this.readAll();
    const cutoff = Date.now() - Math.max(1, retentionDays) * 86_400_000;
    return records
      .filter((record) => Date.parse(record.capturedAt) >= cutoff)
      .slice(-Math.max(1, maxRecords));
  }

  async prune(retentionDays: number): Promise<number> {
    const records = await this.readAll();
    const cutoff = Date.now() - Math.max(1, retentionDays) * 86_400_000;
    const retained = records.filter((record) => Date.parse(record.capturedAt) >= cutoff);
    if (retained.length !== records.length) {
      await this.ensureDirectory();
      const body = retained.map((record) => JSON.stringify(record)).join('\n');
      await writeFile(this.filePath, body ? `${body}\n` : '', { encoding: 'utf8' });
    }
    return records.length - retained.length;
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async ensureDirectory(): Promise<void> {
    if (!this.initialized) {
      await mkdir(this.storageDirectory, { recursive: true });
      this.initialized = true;
    }
  }

  private async readAll(): Promise<HistoryRecord[]> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const records: HistoryRecord[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const candidate = JSON.parse(line) as HistoryRecord;
        if (
          (candidate.providerId === 'codex' || candidate.providerId === 'claude-code')
          && typeof candidate.capturedAt === 'string'
          && Array.isArray(candidate.windows)
        ) {
          records.push(candidate);
        }
      } catch {
        // A single incomplete or old line must not make all history unreadable.
      }
    }
    return records;
  }
}
