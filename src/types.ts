/** タイマーのフェーズ */
export type Phase = 'idle' | 'workout' | 'rest' | 'completed';

/** タイマー設定 */
export interface TimerConfig {
  /** ワークアウト時間（秒） 1〜600 */
  workoutSeconds: number;
  /** 休憩時間（秒） 1〜600 */
  restSeconds: number;
  /** セット数 1〜99 */
  sets: number;
  /** ラウンド数 1〜99 */
  rounds: number;
  /** セット間休憩時間（秒） 0〜600 */
  betweenSetsRestSeconds: number;
  /** ワークアウト用YouTube URL */
  workoutUrl: string;
  /** 休憩用YouTube URL */
  restUrl: string;
}

/** タイマー状態 */
export interface TimerState {
  phase: Phase;
  currentSet: number;
  currentRound: number;
  timeLeft: number;
  isRunning: boolean;
  totalWorkoutTime: number;
  totalRestTime: number;
  /** フェーズ終了予定タイムスタンプ（Date.now()基準） */
  endAt: number | null;
  /** 稼働中の累計ミリ秒（pause区間を除外） */
  elapsedRunningMs: number;
}

/** タイマーアクション（useReducer用） */
export type TimerAction =
  | { type: 'START'; config: TimerConfig }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SKIP' }
  | { type: 'RESET' }
  | { type: 'VISIBILITY_RESTORE'; now: number };

/** タイマー設定のデフォルト値 */
export const DEFAULT_CONFIG: TimerConfig = {
  workoutSeconds: 30,
  restSeconds: 15,
  sets: 1,
  rounds: 8,
  betweenSetsRestSeconds: 0,
  workoutUrl: '',
  restUrl: '',
};
