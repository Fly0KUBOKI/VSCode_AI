# 技術検証結果

検証日: 2026年8月21日

## Codex

- OpenAI公式Codex拡張に同梱された`codex.exe`を確認した。
- 公式App ServerはJSONL形式のJSON-RPCを提供する。
- `initialize` / `initialized`ハンドシェイク後、`account/rateLimits/read`でChatGPTの利用率を取得できる。
- 応答には`usedPercent`、`windowDurationMins`、`resetsAt`が含まれ、`rateLimitsByLimitId`で複数枠を取得できる。
- APIキーやOAuthトークンを拡張側で読み出す必要はない。
- 本アプリは読み取りメソッドだけを使用し、ログイン、ログアウト、クレジット消費などの変更系メソッドを使用しない。

結論: MVPで自動取得可能。

実環境検証では、公式App Serverへの読み取り専用接続から1件以上の利用枠、使用率、期間、リセット時刻を取得できた。実際の使用率は検証記録へ保存していない。

## Claude Code

- Anthropic公式Claude Code拡張がインストール済みであることを確認した。
- 公式拡張内部には5時間枠、週単位枠、Sonnet週単位枠を取得する処理が存在する。
- ただし、その取得処理は公式拡張内部の認証管理に依存し、他のVS Code拡張向けに公開されたAPIまたはコマンドは確認できなかった。
- Claude Code CLIの公開コマンドには認証状態確認があるが、追加のモデル利用を発生させず購読枠だけをJSON出力する公開コマンドは確認できなかった。
- 認証トークンやCookieの直接読み取りは要件に反するため採用しない。

結論: MVPでは公式画面値の手動入力を準実測値として提供する。値がない場合は取得不可と表示し、推定値を捏造しない。将来、Anthropicが安全な公開Usage APIを提供した場合はClaude Providerだけを差し替える。

## 更新頻度

- Codex App Serverは接続を再利用し、標準60秒で読み取りを行う。
- 多重更新を抑止する。
- 失敗が続く場合は指数バックオフを適用する。
- Claudeの手動値にネットワークポーリングは発生しない。

## 実装後検証

- TypeScript型検査: 成功
- esbuildプロダクションビルド: 成功
- 単体テスト10件: 全件成功
- 隔離したVS Code Extension Hostでの統合テスト: 成功
- 統合テスト内での実Codex利用枠取得: 成功
- VSIX生成: 成功
- VS CodeへのVSIXインストールと拡張ID確認: 成功
