import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { TimerConfig, TimerState, TimerAction, Phase } from '../types';

/** タイマーフックのオプション */
interface UseTimerOptions {
  /** カウントダウン時のコールバック（残り3, 2, 1秒） */
  onCountdownTick?: (secondsLeft: 3 | 2 | 1) => void;
  /** フェーズ遷移時のコールバック */
  onPhaseChange?: (phase: Phase, round: number) => void;
}

/** タイマーフックの戻り値 */
interface UseTimerReturn {
  state: TimerState;
  start: (config: TimerConfig) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
}

/** タイマーの初期状態 */
const initialState: TimerState = {
  phase: 'idle',
  currentRound: 0,
  timeLeft: 0,
  isRunning: false,
  totalWorkoutTime: 0,
  totalRestTime: 0,
  endAt: null,
  elapsedRunningMs: 0,
};

/** 内部拡張状態（reducer内で使用、外部には公開しない） */
interface InternalState extends TimerState {
  config: TimerConfig | null;
  /** 最後にカウントダウン通知した秒数 */
  lastAnnouncedSecond: number;
  /** PAUSE開始時のタイムスタンプ */
  pausedAt: number | null;
  /** 現フェーズの開始時刻 */
  phaseStartedAt: number | null;
}

const initialInternalState: InternalState = {
  ...initialState,
  config: null,
  lastAnnouncedSecond: 0,
  pausedAt: null,
  phaseStartedAt: null,
};

/**
 * 次のフェーズと状態を計算する。
 * 最終ラウンドのworkout後はrest無しでcompletedに遷移する。
 */
function computeNextPhase(
  phase: Phase,
  currentRound: number,
  config: TimerConfig,
): { nextPhase: Phase; nextRound: number; nextDuration: number } {
  if (phase === 'workout') {
    if (currentRound >= config.rounds) {
      // 最終ラウンドのworkout完了 → completed
      return {
        nextPhase: 'completed',
        nextRound: currentRound,
        nextDuration: 0,
      };
    }
    // rest phase
    return {
      nextPhase: 'rest',
      nextRound: currentRound,
      nextDuration: config.restSeconds,
    };
  }
  if (phase === 'rest') {
    // 次のラウンドのworkout
    return {
      nextPhase: 'workout',
      nextRound: currentRound + 1,
      nextDuration: config.workoutSeconds,
    };
  }
  return { nextPhase: 'completed', nextRound: currentRound, nextDuration: 0 };
}

/** catch-upアルゴリズム: 経過時間から現在のフェーズ・ラウンド・残り時間を再計算 */
function catchUp(
  elapsedMs: number,
  config: TimerConfig,
): {
  phase: Phase;
  round: number;
  timeLeftMs: number;
  totalWorkout: number;
  totalRest: number;
} {
  let remaining = elapsedMs;
  let round = 1;
  let totalWorkout = 0;
  let totalRest = 0;

  while (round <= config.rounds) {
    const workoutMs = config.workoutSeconds * 1000;
    if (remaining < workoutMs) {
      // このworkoutフェーズ内
      totalWorkout += remaining / 1000;
      return {
        phase: 'workout',
        round,
        timeLeftMs: workoutMs - remaining,
        totalWorkout,
        totalRest,
      };
    }
    remaining -= workoutMs;
    totalWorkout += config.workoutSeconds;

    // 最終ラウンドにはrestがない
    if (round >= config.rounds) {
      break;
    }

    const restMs = config.restSeconds * 1000;
    if (remaining < restMs) {
      // このrestフェーズ内
      totalRest += remaining / 1000;
      return {
        phase: 'rest',
        round,
        timeLeftMs: restMs - remaining,
        totalWorkout,
        totalRest,
      };
    }
    remaining -= restMs;
    totalRest += config.restSeconds;
    round++;
  }

  // 全ラウンド超過
  return {
    phase: 'completed',
    round: config.rounds,
    timeLeftMs: 0,
    totalWorkout,
    totalRest,
  };
}

/** reducer本体 */
function timerReducer(
  state: InternalState,
  action: TimerAction,
): InternalState {
  switch (action.type) {
    case 'START': {
      const now = Date.now();
      return {
        ...initialInternalState,
        config: action.config,
        phase: 'workout',
        currentRound: 1,
        timeLeft: action.config.workoutSeconds,
        isRunning: true,
        endAt: now + action.config.workoutSeconds * 1000,
        elapsedRunningMs: 0,
        phaseStartedAt: now,
        lastAnnouncedSecond: 0,
        pausedAt: null,
      };
    }

    case 'TICK': {
      if (!state.isRunning || !state.endAt || !state.config) return state;

      const now = Date.now();
      const remainingMs = state.endAt - now;

      if (remainingMs <= 0) {
        // フェーズ終了 → catch-upで正確な位置を計算
        const phaseElapsed =
          state.phase === 'workout'
            ? state.config.workoutSeconds
            : state.config.restSeconds;
        const newElapsed =
          state.elapsedRunningMs + (now - (state.endAt - phaseElapsed * 1000));

        // catch-upで全体の位置を再計算
        const result = catchUp(newElapsed, state.config);

        if (result.phase === 'completed') {
          return {
            ...state,
            phase: 'completed',
            isRunning: false,
            timeLeft: 0,
            endAt: null,
            totalWorkoutTime: result.totalWorkout,
            totalRestTime: result.totalRest,
            elapsedRunningMs: newElapsed,
            lastAnnouncedSecond: 0,
          };
        }

        const newEndAt = now + result.timeLeftMs;
        return {
          ...state,
          phase: result.phase,
          currentRound: result.round,
          timeLeft: Math.ceil(result.timeLeftMs / 1000),
          endAt: newEndAt,
          totalWorkoutTime: result.totalWorkout,
          totalRestTime: result.totalRest,
          elapsedRunningMs:
            newElapsed - result.timeLeftMs >= 0
              ? newElapsed - result.timeLeftMs
              : 0,
          phaseStartedAt:
            now -
            ((result.phase === 'workout'
              ? state.config.workoutSeconds * 1000
              : state.config.restSeconds * 1000) -
              result.timeLeftMs),
          lastAnnouncedSecond: 0,
        };
      }

      const timeLeft = Math.ceil(remainingMs / 1000);
      return {
        ...state,
        timeLeft,
      };
    }

    case 'PAUSE': {
      if (
        !state.isRunning ||
        state.phase === 'idle' ||
        state.phase === 'completed'
      ) {
        return state;
      }
      return {
        ...state,
        isRunning: false,
        pausedAt: Date.now(),
      };
    }

    case 'RESUME': {
      if (
        state.isRunning ||
        state.phase === 'idle' ||
        state.phase === 'completed' ||
        !state.pausedAt ||
        !state.endAt
      ) {
        return state;
      }
      const now = Date.now();
      const pauseDuration = now - state.pausedAt;
      return {
        ...state,
        isRunning: true,
        endAt: state.endAt + pauseDuration,
        pausedAt: null,
      };
    }

    case 'SKIP': {
      if (
        state.phase === 'idle' ||
        state.phase === 'completed' ||
        !state.config
      ) {
        return state;
      }
      const now = Date.now();

      // スキップ時: 実際に経過した秒数のみ統計に加算
      let elapsedInPhaseMs = 0;
      if (state.endAt && state.phaseStartedAt) {
        const phaseDurationMs =
          (state.phase === 'workout'
            ? state.config.workoutSeconds
            : state.config.restSeconds) * 1000;
        elapsedInPhaseMs = state.isRunning
          ? phaseDurationMs - (state.endAt - now)
          : phaseDurationMs - (state.endAt - (state.pausedAt ?? now));
        elapsedInPhaseMs = Math.max(0, elapsedInPhaseMs);
      }

      const newTotalWorkout =
        state.totalWorkoutTime +
        (state.phase === 'workout' ? elapsedInPhaseMs / 1000 : 0);
      const newTotalRest =
        state.totalRestTime +
        (state.phase === 'rest' ? elapsedInPhaseMs / 1000 : 0);

      const { nextPhase, nextRound, nextDuration } = computeNextPhase(
        state.phase,
        state.currentRound,
        state.config,
      );

      if (nextPhase === 'completed') {
        return {
          ...state,
          phase: 'completed',
          isRunning: false,
          timeLeft: 0,
          endAt: null,
          totalWorkoutTime: newTotalWorkout,
          totalRestTime: newTotalRest,
          lastAnnouncedSecond: 0,
        };
      }

      return {
        ...state,
        phase: nextPhase,
        currentRound: nextRound,
        timeLeft: nextDuration,
        isRunning: true,
        endAt: now + nextDuration * 1000,
        totalWorkoutTime: newTotalWorkout,
        totalRestTime: newTotalRest,
        phaseStartedAt: now,
        pausedAt: null,
        lastAnnouncedSecond: 0,
      };
    }

    case 'RESET': {
      return { ...initialInternalState };
    }

    case 'VISIBILITY_RESTORE': {
      // バックグラウンド復帰時に即座にTICKと同等の処理を行う
      if (!state.isRunning) return state;
      return timerReducer(state, { type: 'TICK' });
    }

    default:
      return state;
  }
}

export function useTimer(options: UseTimerOptions = {}): UseTimerReturn {
  const { onCountdownTick, onPhaseChange } = options;
  const [internalState, dispatch] = useReducer(
    timerReducer,
    initialInternalState,
  );

  // コールバックのref（レンダリング中のクロージャ問題を回避）
  const onCountdownTickRef = useRef(onCountdownTick);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onCountdownTickRef.current = onCountdownTick;
  onPhaseChangeRef.current = onPhaseChange;

  // 前回のフェーズとラウンドを追跡（フェーズ遷移検出用）
  const prevPhaseRef = useRef<Phase>('idle');
  const prevRoundRef = useRef(0);
  // カウントダウン重複発火防止
  const lastAnnouncedRef = useRef(0);

  // フェーズ遷移時のコールバック発火
  const { phase, currentRound, timeLeft, isRunning } = internalState;
  useEffect(() => {
    if (
      phase !== prevPhaseRef.current ||
      currentRound !== prevRoundRef.current
    ) {
      if (phase !== 'idle' || prevPhaseRef.current !== 'idle') {
        onPhaseChangeRef.current?.(phase, currentRound);
      }
      // フェーズ変更時にカウントダウン状態をリセット
      lastAnnouncedRef.current = 0;
      prevPhaseRef.current = phase;
      prevRoundRef.current = currentRound;
    }
  }, [phase, currentRound]);

  // カウントダウンコールバック発火
  useEffect(() => {
    if (!isRunning || phase === 'idle' || phase === 'completed') return;

    if (timeLeft <= 3 && timeLeft >= 1) {
      // 閾値跨ぎ補完: lastAnnouncedが0の場合、3から現在値まで全て発火
      const startSecond =
        lastAnnouncedRef.current === 0 ? 3 : lastAnnouncedRef.current - 1;
      for (let s = startSecond; s >= timeLeft; s--) {
        if (s >= 1 && s <= 3 && s < (lastAnnouncedRef.current || 4)) {
          onCountdownTickRef.current?.(s as 3 | 2 | 1);
        }
      }
      lastAnnouncedRef.current = timeLeft;
    }
  }, [timeLeft, isRunning, phase]);

  // setInterval（200ms）でTICK発行
  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      dispatch({ type: 'TICK' });
    }, 200);

    return () => clearInterval(id);
  }, [isRunning]);

  // visibilitychange リスナー
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        dispatch({ type: 'VISIBILITY_RESTORE', now: Date.now() });
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const start = useCallback((config: TimerConfig) => {
    dispatch({ type: 'START', config });
  }, []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), []);
  const skip = useCallback(() => dispatch({ type: 'SKIP' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // 外部公開用の状態（内部詳細を隠蔽）
  const state: TimerState = {
    phase: internalState.phase,
    currentRound: internalState.currentRound,
    timeLeft: internalState.timeLeft,
    isRunning: internalState.isRunning,
    totalWorkoutTime: internalState.totalWorkoutTime,
    totalRestTime: internalState.totalRestTime,
    endAt: internalState.endAt,
    elapsedRunningMs: internalState.elapsedRunningMs,
  };

  return { state, start, pause, resume, skip, reset };
}
