import { access } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { safeErrorMessage, unavailableSnapshot } from '../core/usage';
import type { Logger, UsageProvider, UsageSnapshot } from '../types';
import { CodexAppServerClient } from './codexAppServerClient';
import { parseCodexRateLimits } from './codexParser';

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
