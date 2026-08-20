import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { AiUsageMonitorApi } from '../src/extension';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<AiUsageMonitorApi>('personal.ai-usage-monitor');
  assert.ok(extension, 'Development extension was not discovered.');
  const api = await extension.activate();
  assert.ok(api, 'Extension did not return its test API.');

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'aiUsageMonitor.openDashboard',
    'aiUsageMonitor.refresh',
    'aiUsageMonitor.refreshCodex',
    'aiUsageMonitor.refreshClaude',
    'aiUsageMonitor.openSettings',
    'aiUsageMonitor.clearHistory',
    'aiUsageMonitor.showLogs'
  ]) {
    assert.ok(commands.includes(command), `Command was not registered: ${command}`);
  }

  await vscode.commands.executeCommand('aiUsageMonitor.refreshClaude');
  assert.ok(api.getLatest().has('claude-code'), 'Claude Provider did not publish a state.');
  await vscode.commands.executeCommand('aiUsageMonitor.openDashboard');
}
