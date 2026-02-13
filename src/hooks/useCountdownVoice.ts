import { useRef, useEffect, useCallback } from 'react';
import { playBeep } from '../utils/beep';
import type { Phase } from '../types';

/** カウントダウン数字の読み上げ文字列 */
const COUNTDOWN_NUMBERS: Record<number, string> = {
  3: '3',
  2: '2',
  1: '1',
};

/** ビープ音の周波数（秒数別） */
const BEEP_FREQUENCIES: Record<number, number> = {
  3: 880,
  2: 988,
  1: 1175,
};

const COUNTDOWN_VOICE_SETTINGS = {
  rate: 1.15,
  pitch: 1.05,
  volume: 1,
} as const;

const SECTION_VOICE_SETTINGS = {
  rate: 1,
  pitch: 1,
  volume: 0.95,
} as const;

interface SectionStartAnnouncement {
  phase: Phase;
  isBetweenSetsRest: boolean;
}

function selectPreferredEnglishVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const exact = voices.find((voice) => voice.lang === 'en-US');
  if (exact) return exact;
  return voices.find((voice) => voice.lang.startsWith('en')) ?? null;
}

function buildSectionMessage({
  phase,
  isBetweenSetsRest,
}: SectionStartAnnouncement): string | null {
  if (phase === 'workout') return 'Workout';
  if (phase === 'rest') {
    return isBetweenSetsRest ? 'Between sets rest' : 'Rest';
  }
  if (phase === 'completed') return 'Completed';
  return null;
}

function applyVoiceSettings(
  utterance: SpeechSynthesisUtterance,
  voice: SpeechSynthesisVoice | null,
  settings: { rate: number; pitch: number; volume: number },
) {
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  utterance.volume = settings.volume;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = 'en-US';
  }
}

function safeCancelSpeech() {
  try {
    speechSynthesis.cancel();
  } catch (e) {
    console.warn('speechSynthesis.cancel() failed:', e);
  }
}

function canUseSpeechApi() {
  return (
    typeof speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export interface UseCountdownVoiceReturn {
  /** カウントダウン音声を再生する */
  speakCountdown: (secondsLeft: 3 | 2 | 1) => void;
  /** セクション開始案内を再生する */
  speakSectionStart: (announcement: SectionStartAnnouncement) => void;
}

export function useCountdownVoice(): UseCountdownVoiceReturn {
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;

    const synth = speechSynthesis;

    const updateVoices = () => {
      const voices = synth.getVoices();
      enVoiceRef.current = selectPreferredEnglishVoice(voices);
    };

    // 初回取得（一部ブラウザで即座に返る）
    updateVoices();

    // 非同期で音声リストが取得される場合のハンドラ
    synth.addEventListener('voiceschanged', updateVoices);
    return () => {
      synth.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  const speakCountdown = useCallback((secondsLeft: 3 | 2 | 1) => {
    // Speech API非対応 → ビープフォールバック
    if (!canUseSpeechApi()) {
      playBeep(BEEP_FREQUENCIES[secondsLeft], 0.15);
      return;
    }

    safeCancelSpeech();

    // secondsLeft は 3 | 2 | 1 に制限されているため、COUNTDOWN_NUMBERS[secondsLeft] は必ず存在する
    const enVoice = enVoiceRef.current;
    const text = COUNTDOWN_NUMBERS[secondsLeft]!;

    const utterance = new SpeechSynthesisUtterance(text);
    applyVoiceSettings(utterance, enVoice, COUNTDOWN_VOICE_SETTINGS);

    // 発話失敗時のビープフォールバック
    utterance.onerror = () => {
      try {
        playBeep(BEEP_FREQUENCIES[secondsLeft], 0.15);
      } catch (e) {
        console.warn('ビープフォールバックも失敗しました:', e);
      }
    };

    speechSynthesis.speak(utterance);
  }, []);

  const speakSectionStart = useCallback(
    (announcement: SectionStartAnnouncement) => {
      if (!canUseSpeechApi()) return;

      const text = buildSectionMessage(announcement);
      if (!text) return;

      safeCancelSpeech();

      const utterance = new SpeechSynthesisUtterance(text);
      applyVoiceSettings(utterance, enVoiceRef.current, SECTION_VOICE_SETTINGS);
      speechSynthesis.speak(utterance);
    },
    [],
  );

  return { speakCountdown, speakSectionStart };
}
