import { useCallback, useRef } from 'react';
import { useTimer } from './hooks/useTimer';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useCountdownVoice } from './hooks/useCountdownVoice';
import { extractVideoId } from './utils/youtube';
import { Settings } from './components/Settings';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { Summary } from './components/Summary';
import type { TimerConfig, Phase } from './types';

const YOUTUBE_CONTAINER_ID = 'yt-player';

function App() {
  const configRef = useRef<TimerConfig | null>(null);
  const { speakCountdown, speakSectionStart } = useCountdownVoice();

  const { needsUserGesture, retryPlay, setVolume, loadAndPlay, stop } =
    useYouTubePlayer(YOUTUBE_CONTAINER_ID);

  /** カウントダウン（残り3,2,1秒）コールバック */
  const onCountdownTick = useCallback(
    (secondsLeft: 3 | 2 | 1) => {
      speakCountdown(secondsLeft);
      // 音楽の音量を下げる
      if (secondsLeft === 3) {
        setVolume(30);
      }
    },
    [speakCountdown, setVolume],
  );

  /** フェーズ遷移コールバック */
  const onPhaseChange = useCallback(
    (phase: Phase, set: number, round: number) => {
      const config = configRef.current;
      if (!config) return;

      // 音量を元に戻す
      setVolume(100);

      const isBetweenSetsRest =
        phase === 'rest' && set < config.sets && round === config.rounds;

      speakSectionStart({
        phase,
        isBetweenSetsRest,
      });

      if (phase === 'workout') {
        // セット開始時のみワークアウト曲に切り替える
        if (round === 1) {
          const videoId = extractVideoId(config.workoutUrl);
          if (videoId) loadAndPlay(videoId);
        }
      } else if (phase === 'rest') {
        // セット間休憩時のみ休憩曲に切り替える
        if (isBetweenSetsRest) {
          const videoId = extractVideoId(config.restUrl);
          if (videoId) loadAndPlay(videoId);
        }
      } else if (phase === 'completed') {
        stop();
      }
    },
    [setVolume, speakSectionStart, loadAndPlay, stop],
  );

  const { state, start, pause, resume, skip, reset } = useTimer({
    onCountdownTick,
    onPhaseChange,
  });

  /** スタートボタン押下 */
  const handleStart = useCallback(
    (config: TimerConfig) => {
      configRef.current = config;
      start(config);
    },
    [start],
  );

  /** リセットボタン押下 */
  const handleReset = useCallback(() => {
    reset();
    stop();
  }, [reset, stop]);

  const isTimerActive = state.phase !== 'idle' && state.phase !== 'completed';
  const isBetweenSetsRest =
    state.phase === 'rest' &&
    !!configRef.current &&
    state.currentRound >= configRef.current.rounds;

  return (
    <div className="app" translate="no">
      <h1 className="app__title">HIIT インターバルタイマー</h1>

      {state.phase === 'idle' && (
        <Settings disabled={false} onStart={handleStart} />
      )}

      {isTimerActive && (
        <>
          <TimerDisplay
            phase={state.phase}
            isBetweenSetsRest={isBetweenSetsRest}
            currentSet={state.currentSet}
            totalSets={configRef.current?.sets ?? 0}
            currentRound={state.currentRound}
            roundsPerSet={configRef.current?.rounds ?? 0}
            timeLeft={state.timeLeft}
          />
          <Controls
            phase={state.phase}
            isRunning={state.isRunning}
            needsUserGesture={needsUserGesture}
            onPause={pause}
            onResume={resume}
            onSkip={skip}
            onReset={handleReset}
            onRetryPlay={retryPlay}
          />
        </>
      )}

      {state.phase === 'completed' && (
        <Summary
          totalWorkoutTime={state.totalWorkoutTime}
          totalRestTime={state.totalRestTime}
          totalSets={configRef.current?.sets ?? 0}
          roundsPerSet={configRef.current?.rounds ?? 0}
          totalRounds={
            (configRef.current?.sets ?? 0) * (configRef.current?.rounds ?? 0)
          }
          onReset={handleReset}
        />
      )}
    </div>
  );
}

export default App;
