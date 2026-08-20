# AI Usage Monitor

CodexとClaude Codeの利用率を、VS Codeのステータスバーとダッシュボードへ表示するWindows向け個人用拡張機能です。

## 現在の対応状況

- Codex: OpenAI公式Codex App Serverから利用率、複数制限枠、リセット時刻を自動取得します。
- Claude Code: 公式拡張が他の拡張向けUsage APIを公開していないため、MVPでは公式画面で確認した利用率を手動入力できます。安全な公開経路がない場合は「取得不可」と表示し、値を推測しません。
- 通知: 70%、85%、95%、100%の到達とリセットをVS Codeで通知します。
- 履歴: 利用率だけをローカルへ保存します。プロンプト、回答、会話、コード、認証情報は保存しません。

## インストール

1. `ai-usage-monitor-0.1.0.vsix`を用意します。
2. VS Codeで「Extensions: Install from VSIX...」を実行します。
3. VS Codeで「Developer: Reload Window」を実行します。
4. コマンドパレットから`AI Usage: Open Dashboard`を実行します。

Codexの自動取得には、OpenAI公式のCodex拡張がインストールされ、ChatGPTアカウントでログイン済みである必要があります。

## Claude Codeの利用率を入力する

1. Claude Code公式画面で現在の利用率を確認します。
2. コマンドパレットから`AI Usage: Set Claude Usage from Official Screen`を実行します。
3. 5時間枠と週単位枠の使用率を入力します。不要な枠は空欄にできます。

手動値には「準実測（手動）」と取得日時が表示され、標準では15分後に期限切れになります。

## 開発

Node.js 20以降が必要です。

```powershell
npm install
npm test
npm run package
```

## コマンド

- `AI Usage: Open Dashboard`
- `AI Usage: Refresh`
- `AI Usage: Refresh Codex`
- `AI Usage: Refresh Claude Code`
- `AI Usage: Set Claude Usage from Official Screen`
- `AI Usage: Clear Manual Claude Usage`
- `AI Usage: Open Settings`
- `AI Usage: Clear History`
- `AI Usage: Show Logs`

## セキュリティ

- Codexへの接続は公式`codex.exe app-server`を子プロセスとして起動し、公式JSON-RPCの読み取りメソッドだけを使用します。
- Claude Codeの認証トークンやCookieを読み取りません。
- シェル経由で外部コマンドを実行しません。
- テレメトリーはありません。

既知の制約と技術検証結果は、ソース一式に含まれる`TECHNICAL_VALIDATION.md`を参照してください。
