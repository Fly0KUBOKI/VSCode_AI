# AI Usage Monitor

Codex と Claude Code の利用率を VS Code 上で確認する、Windows 向け個人用拡張機能です。

## 起動方法

1. VS Code で `Developer: Reload Window` を実行します。
2. コマンドパレットから `AI Usage: Open Dashboard` を実行します。

再インストールする場合は、`ai-usage-monitor-0.1.0.vsix` を VS Code の
`Extensions: Install from VSIX...` で選択してください。

## 機能

- Codex の利用率、残量、リセット時刻を自動取得
- Claude Code の利用率を公式画面から手動入力
- ステータスバーとダッシュボードへの表示
- 70%、85%、95%、100% 到達時とリセット時の通知
- 60秒間隔の自動更新と手動更新
- 利用率履歴のローカル保存

認証トークン、Cookie、プロンプト、会話、コードは読み取り・保存しません。

## ビルド

Node.js 24.19.0 と npm 11.17.0 を使用します。Node.jsのバージョン管理ツールは
`.node-version` を参照できます。このフォルダーで次を実行します。

```powershell
npm ci
npm run check-types
npm run build:production
npm run package
```

PowerShellで `npm.ps1` が実行ポリシーにより拒否される場合は、各コマンドの
`npm` を `npm.cmd` に置き換えて実行してください。

`npm run build:production` は `dist/extension.js` を生成し、`npm run package` は
型検査と本番ビルドを行ってからインストール用 VSIX を生成します。依存関係は
`package-lock.json` で固定されています。

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

このフォルダーには実行用バンドル、TypeScript ソース、再現可能なビルド環境を
配置しています。削除済みのテストと検証記録は Git コミット `4b7b21c` に残っています。
