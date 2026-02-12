# HIIT インターバルタイマー

ワークアウトとレストを交互に繰り返すHIIT（高強度インターバルトレーニング）用のタイマーアプリ。フェーズごとにYouTube音楽を自動再生し、音声カウントダウンで残り時間を通知する。

## 機能

- ワークアウト / レスト時間、ラウンド数の設定
- フェーズごとに異なるYouTube動画を自動再生
- 音声カウントダウン（3, 2, 1）— Speech Synthesis API、非対応環境ではビープ音にフォールバック
- キーボードショートカット（Space: 一時停止、→: スキップ、R: リセット）
- バックグラウンドタブ復帰時の自動キャッチアップ
- 設定のlocalStorage永続化
- ワークアウト完了後のサマリー表示

## 技術スタック

- React 19 / TypeScript / Vite
- Vitest / React Testing Library
- ESLint (flat config) / Prettier
- YouTube IFrame API / Web Speech API / Web Audio API

## セットアップ

```bash
npm install
npm run dev
```

## コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（HMR） |
| `npm run build` | プロダクションビルド |
| `npm run test` | テスト実行 |
| `npm run test:watch` | テスト（ウォッチモード） |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 自動修正 |
| `npm run format:check` | Prettier チェック |
| `./verify.sh` | 全品質チェック一括実行 |

## プロジェクト構成

```
src/
├── App.tsx              # メインオーケストレータ
├── types.ts             # 共有型定義
├── components/
│   ├── Settings.tsx      # タイマー設定フォーム
│   ├── TimerDisplay.tsx  # フェーズ・ラウンド・時間表示
│   ├── Controls.tsx      # 操作ボタン・キーボードショートカット
│   ├── Summary.tsx       # ワークアウト完了サマリー
│   ├── YouTubePlayer.tsx # YouTube IFrame コンテナ
│   └── ErrorBoundary.tsx # エラーバウンダリ
├── hooks/
│   ├── useTimer.ts       # useReducerベースのタイマーロジック
│   ├── useYouTubePlayer.ts # YouTube IFrame API ラッパー
│   └── useCountdownVoice.ts # 音声カウントダウン
└── utils/
    ├── youtube.ts        # YouTube URL バリデーション・videoId抽出
    └── beep.ts           # Web Audio ビープ音生成
```
