# UI リデザイン計画: モダン・ミニマル

## Context

現在のUIは機能的だが、デザインに以下の課題がある：
- CSS カスタムプロパティ未使用（色・スペーシングがハードコードで散在）
- スペーシング・角丸が不統一（0.25rem〜2rem、8px〜16px がランダム）
- 設定画面が素朴でフォーム感が強い
- ボタンの絵文字アイコン（⏸ ▶ ⏭ ⏹）が環境依存
- フォーカスインジケーターがinput以外にない

全画面（設定・タイマー・サマリー）をモダン・ミニマル方向にリデザインする。

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/App.css` | デザイントークン導入 + 全スタイル刷新 |
| `src/components/Settings.tsx` | フィールドグループ用 `<div>` ラッパー追加 |
| `src/components/Controls.tsx` | ボタンテキストから絵文字を削除 |

## テスト互換性

テストは主に `aria-label`・`role`・ラベルテキストで要素を検索している。以下を維持すれば全テストが通る：
- `aria-label`: `'一時停止'`, `'再開'`, `'スキップ'`, `'リセット'`
- ボタンテキスト: `'スタート'`, `'もう一度'`
- ラベルテキスト: `'ワークアウト（秒）'`, `'休憩（秒）'`, `'ラウンド数'` 等
- `role="alert"` 属性
- **DOM構造依存**: `screen.getByText('スタート').closest('form')` を使用しているため、スタートボタンは `<form>` 内に維持すること
- **ラベル関連付け**: `htmlFor` / `id` の対応を崩さないこと

## 設計

### 1. デザイントークンシステム（CSS カスタムプロパティ）

`:root` に以下を定義し、全スタイルをトークン参照に置換：

- **カラーパレット**: `--color-bg-base`, `--color-bg-surface`, `--color-text-primary/secondary/tertiary/muted`, `--color-accent`, フェーズ色, セマンティック色
- **スペーシング**: 4px基準スケール（`--space-1` 〜 `--space-12`）
- **角丸**: 4段階（`--radius-sm/md/lg/xl`: 6/10/14/20px）
- **タイポグラフィ**: `--text-xs` 〜 `--text-timer-lg`
- **トランジション**: `--transition-fast/base/slow`
- **シャドウ**: `--shadow-sm/md/lg`, `--shadow-glow-accent`

### 2. グローバル改善

- **フォーカスインジケーター**: 全インタラクティブ要素に `:focus-visible` スタイル追加
- **画面遷移**: 既存クラス（`.settings`, `.timer-display`, `.controls`, `.summary`）に直接 `screen-enter` アニメーション付与（JSX変更不要）
- **フォントスムージング**: `-webkit-font-smoothing: antialiased`
- **モーション軽減**: `@media (prefers-reduced-motion: reduce)` で全アニメーション無効化

### 3. 設定画面

**CSS変更:**
- h2 を小さな大文字ラベルスタイルに（`text-xs`, `uppercase`, `letter-spacing: 0.12em`）
- input に hover / focus トランジション追加（`border-color`, `box-shadow`）
- フィールドグループカード: `--color-bg-surface` 背景 + `--radius-lg` 角丸
- スタートボタン: hover 時グロー効果

**JSX変更（Settings.tsx）:**
- 数値フィールド3つを `<div className="settings__field-group">` で囲む
- URLフィールド2つを別の `<div className="settings__field-group">` で囲む
- フォーム構造・ラベル・バリデーション等は一切変更なし

### 4. タイマー画面

**CSS変更のみ（JSX変更なし）:**
- `::after` 疑似要素で radial-gradient のサブトルなグロー追加（depth 表現）
- グラデーション角度を `135deg` → `160deg` に変更
- 時刻フォント: `font-weight: 800`, `letter-spacing: -0.03em`, `text-shadow` 追加
- フェーズラベル: 小さく・letter-spacing 広め（カテゴリタグ風）
- idle 状態: `border: 1.5px solid` で背景との区別
- カウントダウンアニメーション: keyframes名を `countdown-pulse` に変更（ジェスチャーボタンとの競合回避）

### 5. コントロール

**CSS変更:**
- ボタンに `border: 1.5px solid` + hover 時 border-color 変化
- ジェスチャーボタン: `gesture-glow-pulse`（`box-shadow` ベース）に変更。`countdown-pulse` との名前衝突を回避

**JSX変更（Controls.tsx）:**
- `'⏸ 一時停止'` → `'一時停止'`
- `'▶ 再開'` → `'再開'`
- `'⏭ スキップ'` → `'スキップ'`
- `'⏹ リセット'` → `'リセット'`
- `aria-label` は既に絵文字なしのテキストなので変更不要

### 6. サマリー画面

**CSS変更のみ（JSX変更なし）:**
- 見出し: `font-weight: 800`, `letter-spacing: -0.02em`
- 統計カード: サブトルなborder（`rgba(255,255,255,0.08)`）追加 ※装飾目的のため可読性への影響なし
- ラベル: `uppercase` + `letter-spacing` でカテゴリ風に
- 値: `font-weight: 800`, サイズ大きめ
- `summary-enter` アニメーション: fade-in + slide-up（0.5s）

### 7. レスポンシブ

- 600px以上: タイトル・タイマー・統計値のフォントサイズ拡大
- 360px以下: タイマーフォント縮小、コントロールボタン縦積み

## 実装順序

| # | 内容 | ファイル | テスト影響 |
|---|------|---------|-----------|
| 1 | デザイントークン + グローバルスタイル | App.css | なし |
| 2 | 設定画面 | App.css, Settings.tsx | なし（ラッパーdiv追加のみ） |
| 3 | タイマー画面 | App.css | なし（CSS のみ） |
| 4 | コントロール | App.css, Controls.tsx | なし（aria-label 維持） |
| 5 | サマリー画面 | App.css | なし（CSS のみ） |
| 6 | アニメーション + レスポンシブ | App.css | なし（CSS のみ） |

## 検証方法

1. `npm run test` — 全88テストがPass
2. `npm run lint && npm run format:check` — lint/format Pass
3. `npm run dev` でブラウザ確認 — 設定画面・タイマー画面・サマリー画面の各状態
4. キーボードショートカット動作確認（Space, →, R）
5. フォーカスインジケーター確認（Tab キーでの移動）
