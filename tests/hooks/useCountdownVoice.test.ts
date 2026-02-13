import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdownVoice } from '../../src/hooks/useCountdownVoice';
import { playBeep } from '../../src/utils/beep';

vi.mock('../../src/utils/beep', () => ({
  playBeep: vi.fn(),
}));

const mockPlayBeep = vi.mocked(playBeep);

describe('useCountdownVoice', () => {
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;
  let mockGetVoices: ReturnType<typeof vi.fn>;
  let utteranceInstances: {
    text: string;
    lang: string;
    voice: SpeechSynthesisVoice | null;
    onerror: ((e: Event) => void) | null;
    rate: number;
    pitch: number;
    volume: number;
  }[];

  beforeEach(() => {
    utteranceInstances = [];
    mockSpeak = vi.fn();
    mockCancel = vi.fn();
    mockGetVoices = vi.fn(
      () =>
        [
          {
            lang: 'en-US',
            name: 'English US Voice',
            default: false,
            localService: true,
            voiceURI: 'en-us',
          },
          {
            lang: 'en-GB',
            name: 'English UK Voice',
            default: true,
            localService: true,
            voiceURI: 'en-gb',
          },
        ] as SpeechSynthesisVoice[],
    );

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: mockGetVoices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => {
        const instance = {
          text,
          lang: '',
          voice: null as SpeechSynthesisVoice | null,
          onerror: null as ((e: Event) => void) | null,
          rate: 1,
          pitch: 1,
          volume: 1,
        };
        utteranceInstances.push(instance);
        return instance;
      }),
    );

    mockPlayBeep.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('カウントダウン時に英語音声で3,2,1を読み上げる', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
      result.current.speakCountdown(2);
      result.current.speakCountdown(1);
    });

    expect(mockSpeak).toHaveBeenCalledTimes(3);
    expect(utteranceInstances[0]?.text).toBe('3');
    expect(utteranceInstances[1]?.text).toBe('2');
    expect(utteranceInstances[2]?.text).toBe('1');
  });

  it('カウントダウン時に音声品質パラメータを適用する', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
    });

    const utterance = utteranceInstances[0];
    expect(utterance?.lang).toBe('en-US');
    expect(utterance?.voice?.lang).toBe('en-US');
    expect(utterance?.rate).toBe(1.15);
    expect(utterance?.pitch).toBe(1.05);
    expect(utterance?.volume).toBe(1);
  });

  it('en-US音声を最優先で選択する', () => {
    mockGetVoices.mockReturnValue([
      {
        lang: 'en',
        name: 'English Generic',
        default: false,
        localService: true,
        voiceURI: 'en',
      },
      {
        lang: 'en-US',
        name: 'English US Exact',
        default: true,
        localService: true,
        voiceURI: 'en-us',
      },
    ] as SpeechSynthesisVoice[]);

    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
    });

    expect(utteranceInstances[0]?.voice?.name).toBe('English US Exact');
  });

  it('英語音声が無い場合は数字を読み上げる', () => {
    mockGetVoices.mockReturnValue([
      {
        lang: 'ja-JP',
        name: 'Japanese',
        default: true,
        localService: true,
        voiceURI: 'ja-jp',
      },
    ] as SpeechSynthesisVoice[]);

    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(utteranceInstances[0]?.text).toBe('3');
    expect(utteranceInstances[0]?.voice).toBeNull();
  });

  it('カウントダウン時は毎回cancelして発話キューを整理する', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
      result.current.speakCountdown(2);
    });

    expect(mockCancel).toHaveBeenCalledTimes(2);
  });

  it('Speech API非対応の場合はカウントダウンをビープにフォールバックする', () => {
    vi.stubGlobal('speechSynthesis', undefined);

    const { result } = renderHook(() => useCountdownVoice());

    expect(() => {
      act(() => {
        result.current.speakCountdown(3);
      });
    }).not.toThrow();
    expect(mockPlayBeep).toHaveBeenCalled();
  });

  it('voiceschangedイベントで音声リストを更新する', () => {
    let voicesChangedHandler: (() => void) | undefined;

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: vi
        .fn()
        .mockReturnValueOnce([]) // 初回: 空
        .mockReturnValue([
          {
            lang: 'en-US',
            name: 'English US',
            default: false,
            localService: true,
            voiceURI: 'en-us',
          },
        ] as SpeechSynthesisVoice[]),
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        voicesChangedHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      voicesChangedHandler?.();
    });

    act(() => {
      result.current.speakCountdown(3);
    });
    expect(utteranceInstances[0]?.voice?.lang).toBe('en-US');
  });

  it('カウントダウン発話失敗時にビープへフォールバックする', () => {
    mockSpeak.mockImplementation(
      (utterance: { onerror?: (e: Event) => void }) => {
        utterance.onerror?.(new Event('error'));
      },
    );

    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakCountdown(3);
    });

    expect(mockPlayBeep).toHaveBeenCalled();
  });

  it('セクション開始時に適切な案内文を読み上げる', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => {
      result.current.speakSectionStart({
        phase: 'workout',
        isBetweenSetsRest: false,
      });
      result.current.speakSectionStart({
        phase: 'rest',
        isBetweenSetsRest: false,
      });
      result.current.speakSectionStart({
        phase: 'rest',
        isBetweenSetsRest: true,
      });
      result.current.speakSectionStart({
        phase: 'completed',
        isBetweenSetsRest: false,
      });
    });

    expect(utteranceInstances[0]?.text).toBe('Workout');
    expect(utteranceInstances[1]?.text).toBe('Rest');
    expect(utteranceInstances[2]?.text).toBe('Between sets rest');
    expect(utteranceInstances[3]?.text).toBe('Completed');
    expect(utteranceInstances[0]?.rate).toBe(1);
    expect(utteranceInstances[0]?.pitch).toBe(1);
    expect(utteranceInstances[0]?.volume).toBe(0.95);
  });
});
