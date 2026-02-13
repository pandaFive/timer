# TODO

## Recently Completed (2026-02-13)

- [x] プリセット保存の信頼性と移行安全性を改善（PRレビュー対応）
  - ファイル: `src/components/Settings.tsx`, `src/types.ts`, `src/App.css`, `tests/integration/App.test.tsx`
  - 内容: localStorage書き込み失敗のユーザー通知、移行処理の冪等化と旧キー削除、参照共有回避、プリセット名サニタイズ、不足テスト9件+失敗系テストを追加
- [x] 設定プリセット保存（最大3件）と下書き自動保存を分離
  - ファイル: `src/components/Settings.tsx`, `src/types.ts`, `src/App.css`, `tests/integration/App.test.tsx`, `README.md`
  - 内容: `hiit-timer-draft`（自動保存）と `hiit-timer-presets`（名前付き3件）を追加。保存/読込/削除UI、旧`hiit-timer-config`からの互換移行、統合テストを実装
- [x] `useCountdownVoice` のセクション案内失敗耐性を強化
  - ファイル: `src/hooks/useCountdownVoice.ts`, `tests/hooks/useCountdownVoice.test.ts`
  - 内容: `speakSectionStart` に `onerror` と `try-catch` を追加。型エクスポート、英語音声フォールバック、失敗系テストを拡充
- [x] 設定画面の `ラウンド数` / `セット数` 表示順を入れ替え
  - ファイル: `src/components/Settings.tsx`, `tests/integration/App.test.tsx`
  - 内容: 表示順を `ラウンド数` → `セット数` に変更し、表示順テストを追加

## Low Priority (レビュー日: 2026-02-13)

- [ ] `--color-completed-start/end` を `var(--color-accent)` / `var(--color-accent-hover)` 参照に変更
  - ファイル: `src/App.css:17-18`
  - 理由: 現在accent色と同一値。将来分離する予定がなければトークン参照に統一

- [ ] `summary-enter` と `screen-enter` keyframesの統合検討
  - ファイル: `src/App.css`
  - 理由: translateY(12px) vs translateY(8px) の差のみ。4pxの差が知覚可能か要検証

- [ ] controlsボタンの `rgba()` インラインborder-color値をトークン化
  - ファイル: `src/App.css` (.controls__btn--toggle, --skip, --reset, .summary__stat)
  - 理由: デザイントークンシステムとの一貫性向上

- [ ] SKIP → completed 分岐で `currentSet`/`currentRound` を明示的に設定
  - ファイル: `src/hooks/useTimer.ts` L382-393
  - 理由: TICK → completed 分岐と整合性がない。`...state` からの暗黙継承は正しく動作するが明示性に欠ける

- [ ] `endAt`/`elapsedRunningMs` を公開 `TimerState` から除外し `InternalState` のみに移動
  - ファイル: `src/types.ts`, `src/hooks/useTimer.ts`
  - 理由: App.tsx/TimerDisplay/Summary のいずれも使用していない内部ブックキーピングフィールド。公開APIを縮小し実装詳細の漏洩を防ぐ

- [ ] `sets=1` 時に `betweenSetsRestSeconds` 入力を非表示またはdisabledにする
  - ファイル: `src/components/Settings.tsx`
  - 理由: セットが1つの場合セット間休憩は無意味。UXの明確化

## High Priority — 巨大な修正（レビュー日: 2026-02-13）

- [x] `onPhaseChange` コールバックに `set` パラメータを追加（完了: 2026-02-13）
  - ファイル: `src/hooks/useTimer.ts`, `src/types.ts`, `src/App.tsx`, テストファイル
  - 影響範囲: useTimer API、App.tsx の音楽切り替えロジック、全テスト
  - 修正方針: `onPhaseChange(phase, round)` → `onPhaseChange(phase, set, round)` に変更。App.tsx で `round >= config.rounds` による推論を `set` パラメータ直接参照に置換
  - 理由: 現在 App.tsx がラウンド番号からセット間休憩かどうかを推論しており脆弱。APIシグネチャ変更は複数ファイルに影響

- [ ] テストカバレッジ追加（セット関連の遷移パス）
  - ファイル: `tests/hooks/useTimer.test.ts`, `tests/integration/App.test.tsx`
  - 影響範囲: テストのみ（プロダクションコード変更なし）
  - 追加すべきテスト:
    1. セット間休憩中のスキップ → 次セットworkoutへ遷移 (Criticality: 9)
    2. 最終ラウンドworkoutスキップ → セット間休憩へ遷移 (Criticality: 8)
    3. 複数セット全完了でcompletedに遷移（時間経過） (Criticality: 8)
    4. セット途中のRESETでcurrentSetが0に戻る (Criticality: 7)
    5. バックグラウンドでセット境界を跨いだ復帰 (Criticality: 7)
    6. sets/betweenSetsRestSecondsのバリデーション (Criticality: 6)
    7. localStorage betweenSetsRestSecondsの保存・復元 (Criticality: 6)
    8. セット間休憩時間がtotalRestTimeに含まれる (Criticality: 6)
    9. セット間休憩0の最終ラウンドスキップ (Criticality: 5)
  - 理由: 100行超の追加。現在の91テストは基本パスを網羅するが、セット境界のスキップ・リセット・統計追跡が未テスト

## Medium Priority — 巨大な修正（レビュー日: 2026-02-13）

- [ ] `ensurePlayerContainer` DOM要素のクリーンアップ
  - ファイル: `src/hooks/useYouTubePlayer.ts`
  - 影響範囲: YouTube再生機能
  - 修正方針: useEffectのクリーンアップ関数で動的生成したdiv要素を除去するか、index.htmlの静的要素のみを使う方針に統一
  - 理由: 動的DOM生成→未クリーンアップはメモリリークの原因。ただし現状index.htmlに静的要素があるため発動頻度は低い

- [ ] `catchUp` ループにセーフティバウンド追加
  - ファイル: `src/hooks/useTimer.ts` L145-218
  - 修正方針: ループにイテレーションカウンター追加、上限（例: 10000）超過で `completed` に遷移
  - 理由: loadConfig修正（同レビュー）で緩和されるが、start()にバリデーションがないためconfig直接渡しでの異常値を防御できない

- [ ] セット間休憩判定をラウンド番号推論から明示化
  - ファイル: `src/App.tsx` L48-54
  - 修正方針: `onPhaseChange` API変更（上記High Issue）と併せて対応
  - 理由: `round >= config.rounds` による間接判定は `onPhaseChange` API改善で自然に解消

- [ ] `?? 0` フォールバックの見直し
  - ファイル: `src/App.tsx` L97-123
  - 修正方針: `configRef.current` が `null` になりえない状態（isTimerActive / completed時）では `!` アサーションまたはガード条件を使用
  - 理由: `?? 0` は不可能状態を隠蔽し、バグ検出を遅らせる

- [ ] 音楽がセット内休憩で無音になる仕様の明示化
  - ファイル: `CLAUDE.md` またはコード内コメント
  - 修正方針: 意図的な仕様であることをコメントで明記
  - 理由: セット内の通常休憩では曲が切り替わらない（意図的）が、ドキュメントに記載がなく仕様かバグか判断できない
