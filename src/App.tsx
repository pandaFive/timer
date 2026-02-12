import { useCallback, useRef } from 'react';
import { useTimer } from './hooks/useTimer';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useCountdownVoice } from './hooks/useCountdownVoice';
import { extractVideoId } from './utils/youtube';
import { Settings } from './components/Settings';
import { TimerDisplay } from './components/TimerDisplay';
import { Controls } from './components/Controls';
import { YouTubePlayer } from './components/YouTubePlayer';
import { Summary } from './components/Summary';
import type { TimerConfig, Phase } from './types';

const YOUTUBE_CONTAINER_ID = 'yt-player';

function App() {
  const configRef = useRef<TimerConfig | null>(null);
  const { speak } = useCountdownVoice();

  const {
    needsUserGesture,
    retryPlay,
    setVolume,
    loadAndPlay,
    stop,
    containerId,
  } = useYouTubePlayer(YOUTUBE_CONTAINER_ID);

  /** カウントダウン（残り3,2,1秒）コールバック */
  const onCountdownTick = useCallback(
    (secondsLeft: 3 | 2 | 1) => {
      speak(secondsLeft);
      // 音楽の音量を下げる
      if (secondsLeft === 3) {
        setVolume(30);
      }
    },
    [speak, setVolume],
  );

  /** フェーズ遷移コールバック */
  const onPhaseChange = useCallback(
    (phase: Phase) => {
      const config = configRef.current;
      if (!config) return;

      // 音量を元に戻す
      setVolume(100);

      if (phase === 'workout') {
        const videoId = extractVideoId(config.workoutUrl);
        if (videoId) loadAndPlay(videoId);
      } else if (phase === 'rest') {
        const videoId = extractVideoId(config.restUrl);
        if (videoId) loadAndPlay(videoId);
      } else if (phase === 'completed') {
        stop();
      }
    },
    [setVolume, loadAndPlay, stop],
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

  return (
    <div className="app">
      <h1 className="app__title">HIIT インターバルタイマー</h1>

      {state.phase === 'idle' && (
        <Settings disabled={false} onStart={handleStart} />
      )}

      {isTimerActive && (
        <>
          <TimerDisplay
            phase={state.phase}
            currentRound={state.currentRound}
            totalRounds={configRef.current?.rounds ?? 0}
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
          totalRounds={configRef.current?.rounds ?? 0}
          onReset={handleReset}
        />
      )}

      <YouTubePlayer containerId={containerId} />
    </div>
  );
}

export default App;
