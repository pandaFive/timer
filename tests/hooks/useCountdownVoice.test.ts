import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdownVoice } from '../../src/hooks/useCountdownVoice';

describe('useCountdownVoice', () => {
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;
  let mockGetVoices: ReturnType<typeof vi.fn>;
  let utteranceInstances: { text: string; lang: string; voice: SpeechSynthesisVoice | null; onerror: ((e: Event) => void) | null }[];

  beforeEach(() => {
    utteranceInstances = [];
    mockSpeak = vi.fn();
    mockCancel = vi.fn();
    mockGetVoices = vi.fn(() => [
      { lang: 'ja-JP', name: 'Japanese Voice', default: false, localService: true, voiceURI: 'ja' },
      { lang: 'en-US', name: 'English Voice', default: true, localService: true, voiceURI: 'en' },
    ] as SpeechSynthesisVoice[]);

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: mockGetVoices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => {
      const instance = { text, lang: '', voice: null as SpeechSynthesisVoice | null, onerror: null as ((e: Event) => void) | null };
      utteranceInstances.push(instance);
      return instance;
    }));

    // AudioContextモック
    vi.stubGlobal('AudioContext', vi.fn(() => ({
      createOscillator: vi.fn(() => ({
        type: '',
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      })),
      currentTime: 0,
      destination: 'dest',
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('日本語で「サン」「ニ」「イチ」を読み上げる', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => { result.current.speak(3); });
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(utteranceInstances[0]?.text).toBe('サン');

    act(() => { result.current.speak(2); });
    expect(utteranceInstances[1]?.text).toBe('ニ');

    act(() => { result.current.speak(1); });
    expect(utteranceInstances[2]?.text).toBe('イチ');
  });

  it('日本語音声を優先選択する', () => {
    const { result } = renderHook(() => useCountdownVoice());

    act(() => { result.current.speak(3); });

    const utterance = utteranceInstances[0];
    expect(utterance?.voice?.lang).toBe('ja-JP');
  });

  it('日本語音声が無い場合デフォルト音声で数字を読み上げる', () => {
    mockGetVoices.mockReturnValue([
      { lang: 'en-US', name: 'English', default: true, localService: true, voiceURI: 'en' },
    ] as SpeechSynthesisVoice[]);

    const { result } = renderHook(() => useCountdownVoice());

    act(() => { result.current.speak(3); });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    // 日本語音声が無い場合でも発話される
    expect(utteranceInstances[0]?.text).toBe('3');
  });

  it('Speech API非対応の場合ビープ音にフォールバックする', () => {
    vi.stubGlobal('speechSynthesis', undefined);

    const { result } = renderHook(() => useCountdownVoice());

    // エラーを投げない
    expect(() => {
      act(() => { result.current.speak(3); });
    }).not.toThrow();

    // AudioContextが使用される
    expect(AudioContext).toHaveBeenCalled();
  });

  it('voiceschangedイベントで音声リストを更新する', () => {
    let voicesChangedHandler: (() => void) | undefined;

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: vi.fn()
        .mockReturnValueOnce([]) // 初回: 空
        .mockReturnValue([
          { lang: 'ja-JP', name: 'Japanese', default: false, localService: true, voiceURI: 'ja' },
        ] as SpeechSynthesisVoice[]),
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        voicesChangedHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useCountdownVoice());

    // voiceschangedイベント発火
    act(() => { voicesChangedHandler?.(); });

    act(() => { result.current.speak(3); });
    expect(utteranceInstances[0]?.text).toBe('サン');
  });

  it('発話失敗時にビープにフォールバックする', () => {
    mockSpeak.mockImplementation((utterance: { onerror?: (e: Event) => void }) => {
      // 発話エラーをシミュレート
      utterance.onerror?.(new Event('error'));
    });

    const { result } = renderHook(() => useCountdownVoice());

    act(() => { result.current.speak(3); });

    // ビープ音にフォールバック
    expect(AudioContext).toHaveBeenCalled();
  });
});
