import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AiUsageMonitorApi } from '../src/extension';

export async function run(): Promise<void> {
  const liveCodexPath = process.env.AI_USAGE_TEST_CODEX_PATH;
  if (liveCodexPath) {
    await vscode.workspace
      .getConfiguration('aiUsageMonitor.codex')
      .update('executablePath', liveCodexPath, vscode.ConfigurationTarget.Global);
  }
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
  if (liveCodexPath) {
    await vscode.commands.executeCommand('aiUsageMonitor.refreshCodex');
    const codex = api.getLatest().get('codex');
    assert.equal(codex?.status, 'ok', `Live Codex refresh failed: ${codex?.errorCode ?? 'no snapshot'}`);
    assert.ok((codex?.windows.length ?? 0) > 0, 'Live Codex refresh returned no usage windows.');
  }
  await vscode.commands.executeCommand('aiUsageMonitor.openDashboard');
  await writeFile(
    path.join(extension.extensionPath, 'out-integration', 'result.json'),
    JSON.stringify({
      passed: true,
      commandCount: commands.length,
      liveCodexChecked: Boolean(liveCodexPath),
      completedAt: new Date().toISOString()
    }),
    'utf8'
  );
}
