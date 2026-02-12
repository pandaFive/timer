# verify.sh 作成計画

## Context

現在、プロジェクトにはlint・format・test・型チェック・ビルドの各スクリプトが `package.json` に定義されているが、これらをまとめて実行するスクリプトがない。コミット前やPR作成前に手動で複数コマンドを実行する必要があり、チェック漏れのリスクがある。

`verify.sh` を作成し、全品質チェックを一括実行できるようにする。

## 作成ファイル

- `verify.sh`（プロジェクトルート）

## チェック項目と実行順序

| # | チェック | コマンド | 失敗時 |
|---|---------|---------|--------|
| 1 | TypeScript型チェック | `npx tsc -b --noEmit` | 即座に停止 |
| 2 | ESLint | `npx eslint src/ tests/` | 即座に停止 |
| 3 | Prettier | `npx prettier --check 'src/**/*.{ts,tsx,css}' 'tests/**/*.{ts,tsx}'` | 即座に停止 |
| 4 | テスト | `npx vitest run` | 即座に停止 |
| 5 | ビルド | `npx vite build` | 即座に停止 |

### 設計方針

- `set -e` で失敗時に即停止（早期フィードバック）
- 各ステップの開始・結果を色付きで表示（視認性）
- 全チェック成功時にサマリーを表示
- 実行時間を計測して表示
- シンプルなbashスクリプト（外部依存なし）

### 既存リソースの活用

- `package.json` の既存スクリプトと同じコマンドを使用
  - lint: `eslint src/ tests/`（eslint.config.js の flat config を利用）
  - format: `prettier --check`（.prettierrc を利用）
  - test: `vitest run`（vite.config.ts のtest設定を利用）
  - build: `tsc -b && vite build`

## 検証方法

1. `chmod +x verify.sh && ./verify.sh` で全チェックが順次実行されることを確認
2. 意図的にlintエラーを入れた状態で実行し、該当ステップで停止することを確認
3. 全チェックPassで成功メッセージが表示されることを確認
