# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

HIITインターバルタイマー — React 19 + TypeScript + Vite のSPA。YouTube音楽連携、音声カウントダウン（Speech Synthesis → Web Audio beepフォールバック）、キーボードショートカット対応。

## コマンド

```bash
npm run dev          # 開発サーバー（HMR）
npm run build        # tsc -b && vite build
npm run test         # vitest run（全テスト一括）
npm run test:watch   # vitest（ウォッチモード）
npm run lint         # eslint src/ tests/
npm run format:check # prettier --check
npm run format       # prettier --write（自動修正）
./verify.sh          # 全品質チェック一括実行（型→lint→format→test→build）
```

単一テストファイルの実行: `npx vitest run tests/hooks/useTimer.test.ts`

## アーキテクチャ

```
App.tsx（オーケストレータ）
├── useTimer        — useReducer によるタイマーロジック（状態遷移の単一ソース）
├── useYouTubePlayer — YouTube IFrame API ラッパー（シングルトンローダー）
├── useCountdownVoice — SpeechSynthesis + beepフォールバック
└── useCallback で3つのhookを連携（onCountdownTick, onPhaseChange）
```

- **App.tsx** がphaseに基づきSettings / Timer画面（TimerDisplay + Controls）/ Summary を切り替え
- **useTimer** の状態遷移: `idle → [workout ⇄ rest] × rounds × sets → completed`
  - セット内: `workout → rest → workout → ...`（最終ラウンドのrestはスキップ）
  - セット間: 最終ラウンドworkout後 → セット間休憩（`betweenSetsRestSeconds`）→ 次セット先頭
  - 最終セット最終ラウンドworkout後 → rest無しで `completed`
- タイマーは `setInterval(200ms)` + `Date.now()` ベースの実時間計算（バックグラウンドタブ復帰時のキャッチアップアルゴリズムあり）
- Settings は localStorage（`hiit-timer-config`）に永続化、破損データはDEFAULT_CONFIGにフォールバック

## テスト構成

- **Vitest** + **@testing-library/react** + **jsdom**環境
- `tests/setup.ts` で `@testing-library/jest-dom/vitest` を読み込み
- フェイクタイマー: `vi.useFakeTimers()` + `vi.spyOn(Date, 'now')` でタイマーテストを決定的に実行
- フック単体テストは `renderHook()` + `act()`

## コーディング規約

- コメントは日本語
- Prettier: セミコロンあり、シングルクォート、trailing comma: all、幅80
- ESLint: flat config（`eslint.config.js`）、React Hooks / React Refresh プラグイン
- TypeScript strict mode + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess`
- CSS クラス名: BEM（例: `timer-display__time`）

## セキュリティ上の注意点

- `src/utils/youtube.ts`: YouTube URLバリデーションはHTTPS強制 + ホスト名許可リスト + videoId正規表現の3層。変更時はセキュリティテストケース（プロトコル偽装、サブドメインスプーフィング、XSS）を維持すること
- GitHub Actions: アクションはコミットSHAで固定（`.github/workflows/ci.yml`）

## セッション継続

作業を開始するときは、まず以下を読むこと

- 'docs/todo/TODO.md' - 未着手タスクと進捗
- 'docs/lessons.md' - 過去の失敗と学び

変更があった場合、上記を更新すること。

## チーム編成

セッション継続の情報をもとに、チーム編成（最大３人）を行い並列作業せよ
