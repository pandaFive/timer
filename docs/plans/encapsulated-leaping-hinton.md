# HIIT インターバルタイマー アプリ実装計画

## Context

HIIT（高強度インターバルトレーニング）用のインターバルタイマーWebアプリを新規作成する。
ワークアウトと休憩それぞれにYouTube URLで曲を指定でき、各フェーズ終了3秒前にカウントダウン音声が流れる。
全ラウンド完了時には統計サマリーを表示する。

現状は`index.html`のみ存在（バニラHTML）。React + Vite構成に移行して実装する。

---

## 技術スタック

- **React 19 + TypeScript**
- **Vite** (ビルドツール)
- **Vitest + React Testing Library** (テスト)
- **YouTube IFrame API** (音楽再生)
- **Web Speech API** (カウントダウン音声) + AudioContextフォールバック
- **vanilla CSS** (スタイリング、シンプルさ優先)

---

## プロジェクト構造

```
inter-timer/
├── index.html                        # Viteエントリー + CSPメタタグ
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # ルート: useTimerフックを呼び出し、子コンポーネントに状態を配布
│   ├── App.css
│   ├── components/
│   │   ├── Settings.tsx              # 設定パネル（バリデーション付き）
│   │   ├── TimerDisplay.tsx          # タイマー表示（フェーズ、ラウンド、残り時間）
│   │   ├── Controls.tsx              # 操作ボタン（開始/一時停止、スキップ、リセット）
│   │   ├── YouTubePlayer.tsx         # YouTube埋め込み（DOM管理のみ）
│   │   └── Summary.tsx              # 完了後の統計サマリー
│   ├── hooks/
│   │   ├── useTimer.ts              # タイマーコアロジック（useReducerベースFSM）
│   │   ├── useYouTubePlayer.ts      # YouTube API管理（ロード・再生・停止・音量）
│   │   └── useCountdownVoice.ts     # カウントダウン音声（Speech API + ビープフォールバック）
│   ├── utils/
│   │   ├── youtube.ts               # YouTube URL → videoId 変換 + ドメインバリデーション
│   │   └── beep.ts                  # AudioContextベースのビープ音生成
│   └── types.ts                     # 型定義
├── tests/
│   ├── utils/
│   │   ├── youtube.test.ts          # URL解析テスト
│   │   └── beep.test.ts            # ビープ音生成テスト
│   └── hooks/
│       ├── useTimer.test.ts         # タイマーFSMテスト
│       ├── useYouTubePlayer.test.ts # YouTube APIモックテスト
│       └── useCountdownVoice.test.ts # 音声合成モックテスト
│   └── integration/
│       └── App.test.tsx             # 統合テスト（フロー検証）
```

---

## 実装ステップ

### Step 1: プロジェクトセットアップ
- Vite + React + TypeScript プロジェクトを初期化
- Vitest + React Testing Library + jsdom を設定
- 既存の`index.html`はViteのテンプレートに置き換え（CSPメタタグ含む）
- ESLint + Prettier を設定
- git init & 初回コミット

### Step 2: 型定義 & ユーティリティ（TDD）
**テスト先行で実装**

#### `src/types.ts`
```ts
type Phase = 'idle' | 'workout' | 'rest' | 'completed';

interface TimerConfig {
  workoutSeconds: number;  // 1〜600の範囲
  restSeconds: number;     // 1〜600の範囲
  rounds: number;          // 1〜99の範囲
  workoutUrl: string;      // YouTubeドメインのみ許可
  restUrl: string;         // YouTubeドメインのみ許可
}

interface TimerState {
  phase: Phase;
  currentRound: number;
  timeLeft: number;
  isRunning: boolean;
  totalWorkoutTime: number;
  totalRestTime: number;
  endAt: number | null;    // フェーズ終了予定のタイムスタンプ（Date.now()基準）
  elapsedRunningMs: number; // 稼働中の累計ミリ秒（pause区間を除外）。catch-up計算の基準
}

// タイマーアクション（useReducer用）
type TimerAction =
  | { type: 'START'; config: TimerConfig }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SKIP' }
  | { type: 'RESET' }
  | { type: 'VISIBILITY_RESTORE'; now: number };  // バックグラウンド復帰時の補正
```

#### `src/utils/youtube.ts`
- YouTube URL（通常・短縮・埋め込み形式）からvideoIdを抽出
- **プロトコル制限**: `https:` のみ許可（`http:`, `javascript:` 等は拒否）
- **ドメインバリデーション**: `new URL()` でパース後、`hostname` を許可リストと完全一致判定
- **videoId形式検証**: 抽出した videoId が `^[A-Za-z0-9_-]{11}$` に一致することを確認
- 不正なドメイン、URL形式、videoId形式の場合は `null` を返す
- テストケース: 各URL形式、無効なURL、非YouTubeドメイン、`http` URL、XSS試行パターン、不正videoId（長さ違い、`/`や`?`混入、パーセントエンコード）

#### `src/utils/beep.ts`
- AudioContextで指定周波数・長さのビープ音を生成
- テストケース: AudioContext モックでの呼び出し確認

### Step 3: useTimer フック（TDD）
**テスト先行で実装 — useReducerベースの有限状態マシン（FSM）**

- **タイムスタンプ基準の時間管理**: `endAt`（フェーズ終了予定時刻）と`Date.now()`の差分で残り秒数を計算
- **`setInterval`（200ms間隔）**: 高頻度ティックでバックグラウンドタブのスロットリングに対応
- **フェーズ自動遷移**: idle → workout → rest → workout → ... → completed
- **アクション**: start / pause / resume / skip / reset
- **残り3秒コールバック**: `onCountdownTick(secondsLeft: 3|2|1)` を発火
- **重複発火防止**: `lastAnnouncedSecond` をフェーズごとにリセットし、各秒は1回のみコールバック発火（200msティックで同一秒が複数回評価されるため必須）
- **閾値跨ぎ検出**: バックグラウンドで 4→1 にジャンプした場合、`lastAnnouncedSecond` と現在秒の間のスキップされた 3,2 も補完発火
- **`visibilitychange`リスナー**: タブ復帰時に即座にTICKを発行して状態を同期
- **経過時間の累計追跡**: 統計用

テスト方針:
- `vi.useFakeTimers()` で時間制御
- `Date.now()` をモックして endAt 基準の計算を検証
- 状態遷移マトリクス: 全フェーズ × 全アクションの組み合わせ
- バックグラウンド復帰シナリオ（同一フェーズ内）: 残り4秒→タブ非表示→2秒後に復帰→カウントダウン補完
- バックグラウンド復帰シナリオ（複数フェーズ跨ぎ）: workout残り30秒→タブ非表示→60秒後に復帰→catch-upで正しいフェーズ・ラウンドに遷移、統計値が正確
- バックグラウンド復帰シナリオ（全ラウンド超過）: 全ラウンド分の時間を超過→即座にcompleted遷移
- バックグラウンド復帰シナリオ（PAUSE中）: PAUSE中にタブ非表示→長時間後に復帰→elapsedRunningMsが変化しないこと、フェーズ/ラウンドが進まないこと
- バックグラウンド復帰シナリオ（SKIP直後）: SKIP→即座にタブ非表示→復帰→新フェーズのendAtが正しく設定されていること

### Step 4: useYouTubePlayer フック（TDD）
**責務: YouTube IFrame APIの管理（ロード・インスタンス管理・再生制御）**

- YouTube IFrame API スクリプトの動的ロード（`<script>` 挿入 + `onYouTubeIframeAPIReady`）
- **ロードの冪等性保証**: シングルトンPromiseパターンで `<script>` 挿入とコールバック登録を1回のみ実行（React StrictModeの二重マウント、コンポーネント再マウントに対応）。アンマウント時はPlayerインスタンスのみ `destroy()` し、scriptは残す
- `YT.Player` インスタンスの生成・管理（**1つのプレイヤーで動画IDを切り替え**）
- **プレイヤーサイズ**: 最低200x200pxを確保（YouTube APIの要件）、視覚的に画面外に配置（`position:absolute; left:-9999px`）
- フェーズ切替時: `player.loadVideoById(videoId)` で動画を切り替え→再生
- **autoplayブロック対応**:
  - `onError` / `onStateChange` で再生失敗を検知
  - 失敗時は「音楽を再生するにはタップしてください」のUI表示 → ユーザー操作後に`player.playVideo()`
- カウントダウン開始時（残り3秒）: `player.setVolume(30)` → フェーズ終了時に `player.setVolume(100)`
- **Hook戻り値のI/F定義**:
  ```ts
  interface UseYouTubePlayerReturn {
    needsUserGesture: boolean;  // autoplayブロックされた状態
    retryPlay: () => void;      // ユーザー操作後に再生を再試行
    setVolume: (vol: number) => void;
    loadAndPlay: (videoId: string) => void;
    stop: () => void;
    playerReady: boolean;       // API読み込み完了
  }
  ```
  - `Controls` コンポーネントは `needsUserGesture` を参照して「タップして再生」ボタンを表示
  - ボタンクリック時に `retryPlay()` を呼び出し

テスト方針:
- `window.YT` をモックオブジェクトとして注入
- `YT.Player` のコンストラクタ・メソッド呼び出しを検証
- autoplayブロック時のフォールバックUI表示を検証
- 動画ID切り替え時の再生制御を検証
- **StrictMode二重マウント耐性**（3つの独立した検証項目）:
  1. `<script>` 挿入は常に1回のみ（mount→unmount→mount サイクルでも重複なし）
  2. 同時生存する `YT.Player` インスタンスは常に1以下
  3. 再マウント後に `loadAndPlay()` が正常に動作（再生確認）
- **アンマウント→再マウント**: Player `destroy()` 後の再生成が正常に動作

### Step 5: useCountdownVoice フック（TDD）
**責務: カウントダウン音声の再生**

- `window.speechSynthesis` で「サン」「ニ」「イチ」を読み上げ
- **`voiceschanged` イベントで音声リスト取得を待機**: `getVoices()` が空配列の場合に対応
- 日本語音声を優先選択（`lang.startsWith('ja')` でフィルタ）
- **フォールバック階層**:
  1. 日本語音声が見つからない場合 → デフォルト音声で数字を読み上げ
  2. Web Speech API非対応 or 発話失敗 → `beep.ts` のAudioContextビープ音（3回: 高音→高音→最高音）
- **発話失敗検知**: `SpeechSynthesisUtterance.onerror` でキャッチ → ビープにフォールバック

テスト方針:
- `window.speechSynthesis` をモック（`speak`, `getVoices`, `cancel`）
- `voiceschanged` イベント発火シミュレーション
- 音声未取得時のフォールバック遷移を検証
- `onerror` 発火時のビープフォールバックを検証

### Step 6: UIコンポーネント
- **Settings**: 設定フォーム
  - 入力バリデーション: 秒数は1〜600、ラウンド数は1〜99、URLはYouTubeドメインのみ
  - バリデーションエラーメッセージ表示
  - `localStorage` への設定保存/読込（次回起動時に復元）
  - タイマー実行中は設定変更不可（disabled）
- **TimerDisplay**: フェーズ表示、ラウンド表示、残り時間の大きな表示
  - カウントダウン（残り3秒以下）時に視覚的ハイライト（パルスアニメーション）
  - `aria-live="assertive"` でスクリーンリーダー対応
- **Controls**: 開始/一時停止トグル、スキップ、リセットボタン
  - キーボードショートカット: Space=開始/一時停止、→=スキップ、R=リセット
    - **誤発火防止**: `event.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')` が真の場合はショートカットを無効化（ネスト要素対応）
  - autoplayブロック時の「タップして音楽を再生」ボタン
- **YouTubePlayer**: YouTube IFrame のDOMコンテナ
  - 責務: `<div>` の提供のみ（200x200px最低サイズ、オフスクリーン配置）
  - APIロジックは `useYouTubePlayer` フックに委譲
- **Summary**: 完了後に表示
  - 合計ワークアウト時間 / 合計休憩時間
  - 実行ラウンド数
  - 合計経過時間
  - ~~消費カロリー目安~~ → 削除（ユーザー属性なしでは不正確なため）

### Step 7: App統合 & スタイリング
- 全コンポーネントを`App.tsx`で統合
- **状態管理**: `useTimer` フック（内部で `useReducer` FSMを使用）を唯一の状態源とし、`App.tsx` はその戻り値を子コンポーネントにprops配布するだけ（`App` 自身に `useReducer` は持たない）
- レスポンシブCSS（モバイルファースト: スマホでの使用想定）
- フェーズに応じた色変更（ワークアウト=赤系、休憩=青/緑系、カウントダウン=黄色系）
- カウントダウン時のパルスアニメーション
- **CSP設定**: セキュリティ章の「CSP (Content Security Policy)」セクションに従う（dev/prod環境分離）

### Step 8: 統合テスト & 最終調整
- 全ユニットテスト実行・修正
- **統合テスト** (`tests/integration/App.test.tsx`):
  - autoplay解除ボタン → `retryPlay()` → 再生開始の連携フロー
  - `visibilitychange` 復帰 → タイマーUI同期
  - `localStorage` 設定復元 → Settings反映（正常系）
  - `localStorage` 破損データ → デフォルト値フォールバック（破損JSON、型不一致、欠損キー）
  - フェーズ遷移 → YouTube動画切替 + カウントダウン音声の連携
  - キーボードショートカット: フォーム入力中はショートカット無効化
- lint / format 確認
- ブラウザでのE2Eテスト（手動）
- バックグラウンドタブでの動作確認

---

## 主要な設計判断

### YouTube再生の制御
- YouTube IFrame APIの`YT.Player`を使用
- **1プレイヤー設計**: 1つのインスタンスでフェーズ毎に `loadVideoById()` で動画を切り替え
  - 理由: 2プレイヤーの同時管理は複雑性が高く、メモリ消費も2倍。HIITの用途では切替遅延は許容範囲
- **プレイヤーの配置**: `position:absolute; left:-9999px` で視覚的に隠す。`display:none` / `width:0; height:0` は使用しない（YouTube APIが200x200px以上を要求）
- フェーズ切替時: `player.loadVideoById(videoId)` → 自動再生
- カウントダウン開始時（残り3秒）: `player.setVolume(30)` → フェーズ終了時に `player.setVolume(100)`
- **autoplayブロック対応**:
  - `onError(event)` / `onStateChange` で `YT.PlayerState.UNSTARTED` が続く場合を検知
  - UIに「タップして再生を開始」ボタンを表示
  - ユーザーのタップ後に `player.playVideo()` → 以降のフェーズ切替は自動再生可能に

### カウントダウン音声
- `SpeechSynthesisUtterance` で日本語音声「サン」「ニ」「イチ」を読み上げ
- **音声取得の非同期対応**: `voiceschanged` イベントを待機してから音声リストを取得
- **フォールバック階層**:
  1. 日本語音声 → 2. デフォルト音声 → 3. AudioContextビープ音
- **発話失敗時**: `onerror` ハンドラでキャッチし、即座にビープ音にフォールバック

### タイマー精度
- **タイムスタンプ基準**: `endAt = Date.now() + remainingMs` でフェーズ終了時刻を記録
- **`setInterval`（200ms）**: 1000msよりも高頻度にすることで、バックグラウンドスロットリング時の精度低下を軽減
- **残り秒数の計算**: `Math.ceil((endAt - Date.now()) / 1000)` で常に実時間ベース
- **バックグラウンドタブ対策**:
  - `document.visibilitychange` リスナーで `visible` 復帰時に即座にTICKを発行
  - **同一フェーズ内の閾値跨ぎ検出**: 前回の残り秒数が4以上で今回が3以下の場合、スキップされた秒数のカウントダウンコールバックを補完発火
  - 例: 前回tick時4秒→次tick時1秒の場合、3,2,1のコールバックをすべて発火
- **長時間バックグラウンド時の複数フェーズ跨ぎ（catch-upアルゴリズム）**:
  - 復帰時に「**実稼働経過時間**（pause区間を除外した累計）」を基に、現在のラウンド・フェーズを再計算
  - 状態変数 `elapsedRunningMs`（稼働中の累計ミリ秒）を追加。PAUSE時に停止、RESUME時に再開
  - `while` ループで経過フェーズを順にスキップし、各フェーズの統計時間（totalWorkout/totalRest）を加算
  - **SKIP時の統計**: スキップされたフェーズは「実際に経過した秒数」のみ統計に加算（残り時間は加算しない）
  - **カウントダウンコールバック**: スキップされたフェーズのカウントダウンは発火しない（現在アクティブなフェーズのみ通知）
  - 全ラウンド超過の場合は即座に `completed` 状態に遷移
  - YouTube再生: catch-up後の現在フェーズに対応する動画のみ `loadAndPlay`

### セキュリティ
- **URL入力のバリデーション**: `new URL()` でパース後、`hostname` を完全一致判定（`endsWith` ではなく `===` または許可リストとの厳密比較）
  - 許可ホスト: `www.youtube.com`, `youtube.com`, `youtu.be`, `www.youtube-nocookie.com`, `youtube-nocookie.com`, `m.youtube.com`
  - `youtube.com.evil.com` 等のサブドメイン偽装を拒否
- **iframe src の生成**: ユーザー入力URLは直接使用せず、抽出した`videoId`から `https://www.youtube.com/embed/{videoId}` を生成
- **CSP (Content Security Policy)**: dev/prod環境で分離
  - **本番用** (`index.html` `<meta>` タグ): YouTube IFrame APIが内部で `https://s.ytimg.com` 等のスクリプトを読み込むため、実測ベースで最小許可セットを構成
    ```html
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; script-src 'self' https://www.youtube.com https://s.ytimg.com; connect-src 'self'; img-src 'self' https://i.ytimg.com; frame-ancestors 'none';">
    ```
    - 注意: 初回実装時にDevToolsでCSP違反を確認し、不足オリジンがあれば最小限で追加
  - **開発時**: Viteの `vite.config.ts` で `html` プラグインを使い、CSPメタタグを開発時のみ除外（HMR用の `ws:` / `connect-src` が必要なため）
  - `vite.config.ts` に環境分岐ロジックを記載
  - **クリックジャッキング対策**: `frame-ancestors 'none'` で自サイトのiframe埋め込みを禁止

### 設定の永続化
- `localStorage` に設定値（秒数、ラウンド数、URL）をJSON形式で保存
- ページリロード時に前回の設定を復元
- URLは保存前にバリデーションを通す
- **破損データのフェイルセーフ**: `JSON.parse` 失敗時やスキーマ不一致時はデフォルト値にフォールバック（`try-catch` + 型ガード）

### アクセシビリティ
- タイマー表示に `aria-live="assertive"` を設定
- フェーズ変更時に `aria-label` を更新
- キーボード操作: Space（開始/停止）、→（スキップ）、R（リセット）
- フォーカス管理: フェーズ変更時に適切なフォーカス移動

---

## 対象ファイル（新規作成）

| ファイル | 目的 |
|---------|------|
| `package.json` | 依存関係定義 |
| `vite.config.ts` | Vite設定 |
| `tsconfig.json` | TypeScript設定 |
| `index.html` | エントリーポイント（既存を上書き、CSPメタタグ含む） |
| `src/main.tsx` | Reactエントリー |
| `src/App.tsx` | ルートコンポーネント（useTimerの状態をprops配布） |
| `src/App.css` | グローバルスタイル |
| `src/types.ts` | 型定義（Phase, TimerConfig, TimerState, TimerAction） |
| `src/utils/youtube.ts` | YouTube URLバリデーション & videoId抽出 |
| `src/utils/beep.ts` | AudioContextビープ音生成 |
| `src/hooks/useTimer.ts` | タイマーFSMフック |
| `src/hooks/useYouTubePlayer.ts` | YouTube API管理フック |
| `src/hooks/useCountdownVoice.ts` | カウントダウン音声フック |
| `src/components/Settings.tsx` | 設定パネル（バリデーション + localStorage） |
| `src/components/TimerDisplay.tsx` | タイマー表示（aria-live対応） |
| `src/components/Controls.tsx` | 操作ボタン（キーボードショートカット） |
| `src/components/YouTubePlayer.tsx` | YouTubeプレイヤーDOMコンテナ |
| `src/components/Summary.tsx` | 統計サマリー |
| `tests/utils/youtube.test.ts` | URL解析 + ドメインバリデーションテスト |
| `tests/utils/beep.test.ts` | ビープ音生成テスト |
| `tests/hooks/useTimer.test.ts` | タイマーFSMテスト（状態遷移マトリクス） |
| `tests/hooks/useYouTubePlayer.test.ts` | YouTube APIモックテスト |
| `tests/hooks/useCountdownVoice.test.ts` | 音声合成モック + フォールバックテスト |
| `tests/integration/App.test.tsx` | 統合テスト（autoplay解除・visibility復帰・localStorage連携） |

---

## 検証方法

1. **ユニットテスト**: `vitest run` で全テストがパスすることを確認
   - utils: URL解析、ドメインバリデーション（サブドメイン偽装拒否含む）、ビープ音生成
   - hooks: タイマーFSM状態遷移（重複発火防止含む）、YouTube APIモック、音声合成モック
   - integration: autoplay解除フロー、visibility復帰→UI同期、localStorage復元→Settings反映
2. **手動確認**:
   - `npm run dev` でローカルサーバー起動
   - YouTube URLを入力して再生確認
   - autoplayブロック時のフォールバックUI確認
   - ワークアウト→休憩のフェーズ自動遷移
   - 残り3秒でカウントダウン音声が鳴ること（Speech API + ビープフォールバック）
   - 全ラウンド完了後に統計サマリー表示
   - 一時停止/再開/スキップ/リセットの各操作
   - **バックグラウンドタブ**: タブを切り替えて戻った際にタイマーが正しく同期されること
   - **キーボード操作**: Space/→/R での操作確認
   - スマホ表示のレスポンシブ確認
   - 不正なURL入力時のバリデーションエラー表示
   - ページリロード後の設定復元確認
3. **lint/format**: `npm run lint && npm run format:check`
4. **CSP確認**: ブラウザDevToolsのConsoleでCSP違反がないことを確認
