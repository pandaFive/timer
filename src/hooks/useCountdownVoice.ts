import { useRef, useEffect, useCallback } from 'react';
import { playBeep } from '../utils/beep';

/** カウントダウン数字の日本語読み */
const JAPANESE_NUMBERS: Record<number, string> = {
  3: 'サン',
  2: 'ニ',
  1: 'イチ',
};

/** ビープ音の周波数（秒数別） */
const BEEP_FREQUENCIES: Record<number, number> = {
  3: 880,
  2: 880,
  1: 1100,
};

export interface UseCountdownVoiceReturn {
  /** カウントダウン音声を再生する */
  speak: (secondsLeft: 3 | 2 | 1) => void;
}

export function useCountdownVoice(): UseCountdownVoiceReturn {
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const jaVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;

    const synth = speechSynthesis;

    const updateVoices = () => {
      const voices = synth.getVoices();
      voicesRef.current = voices;
      jaVoiceRef.current = voices.find((v) => v.lang.startsWith('ja')) ?? null;
    };

    // 初回取得（一部ブラウザで即座に返る）
    updateVoices();

    // 非同期で音声リストが取得される場合のハンドラ
    synth.addEventListener('voiceschanged', updateVoices);
    return () => {
      synth.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  const speak = useCallback((secondsLeft: 3 | 2 | 1) => {
    // Speech API非対応 → ビープフォールバック
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      playBeep(BEEP_FREQUENCIES[secondsLeft], 0.15);
      return;
    }

    speechSynthesis.cancel();

    const jaVoice = jaVoiceRef.current;
    const text = jaVoice ? JAPANESE_NUMBERS[secondsLeft]! : String(secondsLeft);

    const utterance = new SpeechSynthesisUtterance(text);
    if (jaVoice) {
      utterance.voice = jaVoice;
      utterance.lang = 'ja-JP';
    }

    // 発話失敗時のビープフォールバック
    utterance.onerror = () => {
      playBeep(BEEP_FREQUENCIES[secondsLeft], 0.15);
    };

    speechSynthesis.speak(utterance);
  }, []);

  return { speak };
}
