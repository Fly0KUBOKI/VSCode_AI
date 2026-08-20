import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Logger } from '../types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private startPromise: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly executablePath: string,
    private readonly logger: Logger,
    private readonly requestTimeoutMs = 15_000
  ) {}

  async readRateLimits(): Promise<unknown> {
    await this.ensureStarted();
    return this.request('account/rateLimits/read');
  }

  dispose(): void {
    this.disposed = true;
    this.rejectAll(new Error('Codex App Server client was disposed.'));
    this.process?.kill();
    this.process = undefined;
    this.startPromise = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.disposed) {
      throw new Error('Codex App Server client was disposed.');
    }
    if (!this.startPromise) {
      this.startPromise = this.start().catch((error) => {
        this.startPromise = undefined;
        throw error;
      });
    }
    await this.startPromise;
  }

  private async start(): Promise<void> {
    this.logger('debug', 'Codex App Serverを起動します。');
    const child = spawn(this.executablePath, ['app-server', '--stdio'], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.process = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk: string) => {
      if (chunk.trim()) {
        this.logger('debug', 'Codex App Serverが診断情報を出力しました。');
      }
    });
    child.on('error', (error) => this.handleExit(error));
    child.on('exit', (code) => this.handleExit(new Error(`Codex App Server exited (${code ?? 'unknown'}).`)));

    await this.request('initialize', {
      clientInfo: {
        name: 'ai_usage_monitor_vscode',
        title: 'AI Usage Monitor for VS Code',
        version: '0.1.0'
      },
      capabilities: {
        optOutNotificationMethods: [
          'thread/started',
          'item/started',
          'item/completed',
          'item/agentMessage/delta'
        ]
      }
    }, false);
    this.notify('initialized');
  }

  private request(method: string, params?: unknown, ensureStarted = true): Promise<unknown> {
    if (ensureStarted && !this.process) {
      return this.ensureStarted().then(() => this.request(method, params, false));
    }
    const child = this.process;
    if (!child || child.killed || !child.stdin.writable) {
      return Promise.reject(new Error('Codex App Server is not available.'));
    }

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const message = params === undefined ? { method, id } : { method, id, params };
      child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
    });
  }

  private notify(method: string, params?: unknown): void {
    const child = this.process;
    if (!child || child.killed || !child.stdin.writable) {
      return;
    }
    const message = params === undefined ? { method } : { method, params };
    child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 2_000_000) {
      this.handleExit(new Error('Codex App Server produced an oversized response.'));
      return;
    }
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        this.handleLine(line);
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      this.logger('warn', 'Codex App Serverから解析できない応答を受信しました。');
      return;
    }
    if (typeof message.id !== 'number') {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? `Codex App Server error ${message.error.code ?? ''}`));
      return;
    }
    pending.resolve(message.result);
  }

  private handleExit(error: Error): void {
    if (!this.process) {
      return;
    }
    this.process = undefined;
    this.startPromise = undefined;
    this.buffer = '';
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
