/** 秒数をMM:SS形式にフォーマット */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface SummaryProps {
  totalWorkoutTime: number;
  totalRestTime: number;
  totalRounds: number;
  onReset: () => void;
}

export function Summary({
  totalWorkoutTime,
  totalRestTime,
  totalRounds,
  onReset,
}: SummaryProps) {
  const totalTime = totalWorkoutTime + totalRestTime;

  return (
    <div className="summary">
      <h2>ワークアウト完了！</h2>

      <div className="summary__stats">
        <div className="summary__stat">
          <span className="summary__label">ワークアウト時間</span>
          <span className="summary__value">{formatDuration(totalWorkoutTime)}</span>
        </div>
        <div className="summary__stat">
          <span className="summary__label">休憩時間</span>
          <span className="summary__value">{formatDuration(totalRestTime)}</span>
        </div>
        <div className="summary__stat">
          <span className="summary__label">合計時間</span>
          <span className="summary__value">{formatDuration(totalTime)}</span>
        </div>
        <div className="summary__stat">
          <span className="summary__label">実行ラウンド</span>
          <span className="summary__value">{totalRounds} ラウンド</span>
        </div>
      </div>

      <button className="summary__btn" onClick={onReset}>
        もう一度
      </button>
    </div>
  );
}
