import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../../src/hooks/useTimer';
import type { TimerConfig } from '../../src/types';

const defaultConfig: TimerConfig = {
  workoutSeconds: 10,
  restSeconds: 5,
  rounds: 3,
  sets: 1,
  betweenSetsRestSeconds: 0,
  workoutUrl: '',
  restUrl: '',
};

describe('useTimer', () => {
  let onCountdownTick: ReturnType<typeof vi.fn>;
  let onPhaseChange: ReturnType<typeof vi.fn>;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    onCountdownTick = vi.fn();
    onPhaseChange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    dateNowSpy.mockRestore();
  });

  // --- 初期状態 ---
  describe('初期状態', () => {
    it('idle状態で初期化される', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      expect(result.current.state.phase).toBe('idle');
      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.currentSet).toBe(0);
      expect(result.current.state.currentRound).toBe(0);
      expect(result.current.state.timeLeft).toBe(0);
    });
  });

  // --- START ---
  describe('START', () => {
    it('STARTでworkoutフェーズに遷移する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.currentSet).toBe(1);
      expect(result.current.state.currentRound).toBe(1);
      expect(result.current.state.timeLeft).toBe(10);
      expect(result.current.state.isRunning).toBe(true);
    });

    it('STARTでonPhaseChangeが呼ばれる', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      expect(onPhaseChange).toHaveBeenCalledWith('workout', 1);
    });
  });

  // --- TICK ---
  describe('TICK', () => {
    it('時間経過でtimeLeftが減少する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));
      onPhaseChange.mockClear();

      // 3秒経過をシミュレート
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.timeLeft).toBe(7);
    });

    it('workoutフェーズ終了後にrestフェーズに遷移する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));
      onPhaseChange.mockClear();

      // 10秒経過（workout完了）
      currentTime += 10000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('rest');
      expect(result.current.state.timeLeft).toBe(5);
      expect(result.current.state.currentRound).toBe(1);
      expect(onPhaseChange).toHaveBeenCalledWith('rest', 1);
    });

    it('restフェーズ終了後に次のworkoutフェーズに遷移する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));
      onPhaseChange.mockClear();

      // workout 10秒 + rest 5秒 = 15秒経過
      currentTime += 15000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.currentRound).toBe(2);
      expect(result.current.state.timeLeft).toBe(10);
      expect(onPhaseChange).toHaveBeenCalledWith('workout', 2);
    });

    it('最終ラウンドのworkout後にcompletedに遷移する', () => {
      const config: TimerConfig = { ...defaultConfig, rounds: 1 };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      // workout 10秒完了（1ラウンドのみなのでrestなしで完了）
      currentTime += 10000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('completed');
      expect(result.current.state.isRunning).toBe(false);
      expect(onPhaseChange).toHaveBeenCalledWith('completed', 1);
    });

    it('最終ラウンドのrest後にcompletedに遷移する', () => {
      const config: TimerConfig = { ...defaultConfig, rounds: 2 };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      // round1: workout 10s + rest 5s + round2: workout 10s = 25秒
      currentTime += 25000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('completed');
    });
  });

  // --- カウントダウンコールバック ---
  describe('カウントダウンコールバック', () => {
    it('残り3秒で3,2,1のコールバックが順に発火する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 7秒経過 → 残り3秒
      currentTime += 7000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).toHaveBeenCalledWith(3);

      // 8秒経過 → 残り2秒
      currentTime += 1000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).toHaveBeenCalledWith(2);

      // 9秒経過 → 残り1秒
      currentTime += 1000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).toHaveBeenCalledWith(1);
    });

    it('同一秒で重複発火しない', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 7秒経過 → 残り3秒
      currentTime += 7000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // 同じ秒数内でもう1ティック
      currentTime += 100;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // 3は1回だけ呼ばれる
      expect(onCountdownTick).toHaveBeenCalledTimes(1);
    });

    it('フェーズ遷移時にカウントダウン状態がリセットされる', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        workoutSeconds: 5,
        restSeconds: 5,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));

      // workout残り3秒 → カウントダウン発火
      currentTime += 2000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).toHaveBeenCalledWith(3);

      // workout完了、rest開始
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      onCountdownTick.mockClear();

      // rest残り3秒 → 再びカウントダウン発火
      currentTime += 2000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).toHaveBeenCalledWith(3);
    });
  });

  // --- バックグラウンド復帰: 閾値跨ぎ補完 ---
  describe('バックグラウンド復帰: カウントダウン補完', () => {
    it('残り4秒→2秒にジャンプした場合、3と2を補完発火する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 6秒経過 → 残り4秒（カウントダウン未発火）
      currentTime += 6000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onCountdownTick).not.toHaveBeenCalled();

      // バックグラウンドで2秒経過 → 残り2秒にジャンプ
      currentTime += 2000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(onCountdownTick).toHaveBeenCalledWith(3);
      expect(onCountdownTick).toHaveBeenCalledWith(2);
      expect(onCountdownTick).toHaveBeenCalledTimes(2);
    });
  });

  // --- PAUSE / RESUME ---
  describe('PAUSE / RESUME', () => {
    it('PAUSEで時間が停止する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 3秒経過
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.state.timeLeft).toBe(7);

      // PAUSE
      act(() => result.current.pause());
      expect(result.current.state.isRunning).toBe(false);

      // 5秒経過してもtimeLeftは変わらない
      currentTime += 5000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.state.timeLeft).toBe(7);
    });

    it('RESUMEで時間が再開する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 3秒経過
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // PAUSE → 5秒待機 → RESUME
      act(() => result.current.pause());
      currentTime += 5000;
      act(() => result.current.resume());

      // RESUME後2秒経過
      currentTime += 2000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.state.timeLeft).toBe(5); // 10 - 3 - 2 = 5
    });
  });

  // --- SKIP ---
  describe('SKIP', () => {
    it('workoutフェーズをスキップしてrestフェーズに遷移する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));
      onPhaseChange.mockClear();

      act(() => result.current.skip());

      expect(result.current.state.phase).toBe('rest');
      expect(result.current.state.timeLeft).toBe(5);
      expect(onPhaseChange).toHaveBeenCalledWith('rest', 1);
    });

    it('restフェーズをスキップして次のworkoutフェーズに遷移する', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // workout完了 → rest
      currentTime += 10000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      onPhaseChange.mockClear();

      act(() => result.current.skip());

      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.currentRound).toBe(2);
      expect(onPhaseChange).toHaveBeenCalledWith('workout', 2);
    });

    it('最終ラウンドのworkoutスキップでcompletedに遷移する', () => {
      const config: TimerConfig = { ...defaultConfig, rounds: 1 };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      act(() => result.current.skip());

      expect(result.current.state.phase).toBe('completed');
    });

    it('SKIPされたフェーズは実際の経過時間のみ統計に加算される', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 3秒経過後にスキップ
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => result.current.skip());

      // workout時間は3秒（スキップした残り7秒は加算されない）
      expect(result.current.state.totalWorkoutTime).toBe(3);
    });
  });

  // --- RESET ---
  describe('RESET', () => {
    it('RESETでidle状態に戻る', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 5秒経過
      currentTime += 5000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      act(() => result.current.reset());

      expect(result.current.state.phase).toBe('idle');
      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.currentRound).toBe(0);
      expect(result.current.state.timeLeft).toBe(0);
      expect(result.current.state.totalWorkoutTime).toBe(0);
      expect(result.current.state.totalRestTime).toBe(0);
    });
  });

  // --- 統計値 ---
  describe('統計値', () => {
    it('各フェーズの経過時間が正しく累計される', () => {
      const config: TimerConfig = { ...defaultConfig, rounds: 1 };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));

      // workout 10秒完了
      currentTime += 10000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.totalWorkoutTime).toBe(10);
      expect(result.current.state.phase).toBe('completed');
    });

    it('複数ラウンドの統計が正しく累計される', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        workoutSeconds: 5,
        restSeconds: 3,
        rounds: 2,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));

      // round1: workout 5s + rest 3s + round2: workout 5s = 13s
      currentTime += 13000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.totalWorkoutTime).toBe(10); // 5 + 5
      expect(result.current.state.totalRestTime).toBe(3);
    });
  });

  // --- バックグラウンド復帰: 複数フェーズ跨ぎ ---
  describe('バックグラウンド復帰: 複数フェーズ跨ぎ', () => {
    it('60秒バックグラウンドで正しいフェーズ・ラウンドに遷移する', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        workoutSeconds: 10,
        restSeconds: 5,
        rounds: 5,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      // 60秒バックグラウンド
      // round1: w10 + r5 = 15, round2: w10 + r5 = 15, round3: w10 + r5 = 15, round4: w10 = 10 → 合計55秒、60s目 = round4 rest残り0秒 → round5 workout
      // round1: 15s, round2: 30s, round3: 45s, round4 workout: 55s, round4 rest: 60s → round5 workout開始
      currentTime += 60000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.currentRound).toBe(5);
      expect(result.current.state.currentSet).toBe(1);
      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.timeLeft).toBe(10);
    });

    it('全ラウンド超過で即座にcompletedに遷移する', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        workoutSeconds: 5,
        restSeconds: 3,
        rounds: 2,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));

      // 全ラウンド合計: round1(w5+r3) + round2(w5) = 13秒。20秒経過
      currentTime += 20000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('completed');
      expect(result.current.state.isRunning).toBe(false);
    });

    it('PAUSE中にバックグラウンドでも状態が変わらない', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(defaultConfig));

      // 3秒経過 → PAUSE
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => result.current.pause());

      const stateBeforeBg = { ...result.current.state };

      // バックグラウンドで60秒経過
      currentTime += 60000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe(stateBeforeBg.phase);
      expect(result.current.state.currentRound).toBe(
        stateBeforeBg.currentRound,
      );
      expect(result.current.state.timeLeft).toBe(stateBeforeBg.timeLeft);
    });
  });

  // --- idle状態でのアクション無視 ---
  describe('idle状態でのアクション', () => {
    it('idle状態でPAUSEは無視される', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.pause());
      expect(result.current.state.phase).toBe('idle');
    });

    it('idle状態でSKIPは無視される', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.skip());
      expect(result.current.state.phase).toBe('idle');
    });

    it('idle状態でRESUMEは無視される', () => {
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.resume());
      expect(result.current.state.phase).toBe('idle');
    });
  });

  // --- completed状態でのアクション ---
  describe('completed状態でのアクション', () => {
    it('completed状態でSTARTで新しいセッションを開始できる', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        rounds: 1,
        workoutSeconds: 3,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));

      // 完了
      currentTime += 3000;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.state.phase).toBe('completed');

      // 新しいセッション
      onPhaseChange.mockClear();
      act(() => result.current.start(defaultConfig));
      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.totalWorkoutTime).toBe(0);
    });
  });

  // --- セット遷移 ---
  describe('セット遷移', () => {
    it('セット間休憩がある場合、最終ラウンド後にセット間休憩へ遷移する', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        rounds: 2,
        sets: 2,
        betweenSetsRestSeconds: 7,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      // set1: round1(w10+r5) + round2(w10) = 25秒
      currentTime += 25000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('rest');
      expect(result.current.state.currentSet).toBe(1);
      expect(result.current.state.currentRound).toBe(2);
      expect(result.current.state.timeLeft).toBe(7);
      expect(onPhaseChange).toHaveBeenCalledWith('rest', 2);

      // セット間休憩完了で次セット先頭ラウンドへ
      currentTime += 7000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.currentSet).toBe(2);
      expect(result.current.state.currentRound).toBe(1);
      expect(result.current.state.timeLeft).toBe(10);
      expect(onPhaseChange).toHaveBeenCalledWith('workout', 1);
    });

    it('セット間休憩が0秒の場合、最終ラウンド後に即次セットへ遷移する', () => {
      const config: TimerConfig = {
        ...defaultConfig,
        rounds: 1,
        sets: 2,
        betweenSetsRestSeconds: 0,
      };
      const { result } = renderHook(() =>
        useTimer({ onCountdownTick, onPhaseChange }),
      );
      act(() => result.current.start(config));
      onPhaseChange.mockClear();

      // set1 round1 workout完了
      currentTime += 10000;
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe('workout');
      expect(result.current.state.currentSet).toBe(2);
      expect(result.current.state.currentRound).toBe(1);
      expect(result.current.state.timeLeft).toBe(10);
      expect(onPhaseChange).toHaveBeenCalledWith('workout', 1);
    });
  });
});
