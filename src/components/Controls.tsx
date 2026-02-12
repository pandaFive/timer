import { useEffect } from 'react';
import type { Phase } from '../types';

interface ControlsProps {
  phase: Phase;
  isRunning: boolean;
  needsUserGesture: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  onRetryPlay: () => void;
}

/** フォーム入力要素内かどうかを判定（キーボードショートカット誤発火防止） */
function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

export function Controls({
  phase,
  isRunning,
  needsUserGesture,
  onPause,
  onResume,
  onSkip,
  onReset,
  onRetryPlay,
}: ControlsProps) {
  const isActive = phase === 'workout' || phase === 'rest';

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) return;
      if (!isActive) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isRunning) onPause();
          else onResume();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSkip();
          break;
        case 'KeyR':
          e.preventDefault();
          onReset();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, isRunning, onPause, onResume, onSkip, onReset]);

  if (phase === 'idle' || phase === 'completed') return null;

  return (
    <div className="controls">
      {needsUserGesture && (
        <button
          className="controls__btn controls__btn--gesture"
          onClick={onRetryPlay}
        >
          タップして音楽を再生
        </button>
      )}

      <div className="controls__actions">
        <button
          className="controls__btn controls__btn--toggle"
          onClick={isRunning ? onPause : onResume}
          aria-label={isRunning ? '一時停止' : '再開'}
        >
          {isRunning ? '⏸ 一時停止' : '▶ 再開'}
        </button>

        <button
          className="controls__btn controls__btn--skip"
          onClick={onSkip}
          aria-label="スキップ"
        >
          ⏭ スキップ
        </button>

        <button
          className="controls__btn controls__btn--reset"
          onClick={onReset}
          aria-label="リセット"
        >
          ⏹ リセット
        </button>
      </div>

      <div className="controls__shortcuts">
        Space: 一時停止/再開 | →: スキップ | R: リセット
      </div>
    </div>
  );
}
