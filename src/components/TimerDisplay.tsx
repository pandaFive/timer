import type { Phase } from '../types';

/** 秒数を MM:SS 形式にフォーマット */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** フェーズの日本語表示 */
const PHASE_LABELS: Record<Phase, string> = {
  idle: '準備完了',
  workout: 'ワークアウト',
  rest: '休憩',
  completed: '完了',
};

interface TimerDisplayProps {
  phase: Phase;
  isBetweenSetsRest: boolean;
  currentSet: number;
  totalSets: number;
  currentRound: number;
  roundsPerSet: number;
  timeLeft: number;
}

export function TimerDisplay({
  phase,
  isBetweenSetsRest,
  currentSet,
  totalSets,
  currentRound,
  roundsPerSet,
  timeLeft,
}: TimerDisplayProps) {
  const isCountdown =
    timeLeft <= 3 && timeLeft >= 1 && phase !== 'idle' && phase !== 'completed';
  const phaseClass = `timer-display--${phase}`;
  const countdownClass = isCountdown ? 'timer-display--countdown' : '';
  const phaseLabel =
    phase === 'rest' && isBetweenSetsRest
      ? 'セット間休憩'
      : PHASE_LABELS[phase];

  return (
    <div
      className={`timer-display ${phaseClass} ${countdownClass}`}
      aria-live="polite"
      aria-label={`${phaseLabel} セット${currentSet}/${totalSets} ラウンド${currentRound}/${roundsPerSet} 残り${timeLeft}秒`}
    >
      <div className="timer-display__phase">{phaseLabel}</div>

      {phase !== 'idle' && phase !== 'completed' && (
        <>
          <div className="timer-display__set">
            セット {currentSet} / {totalSets}
          </div>
          <div className="timer-display__round">
            ラウンド {currentRound} / {roundsPerSet}
          </div>
          <div className="timer-display__time">{formatTime(timeLeft)}</div>
        </>
      )}
    </div>
  );
}
