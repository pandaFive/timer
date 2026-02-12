import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playBeep } from '../../src/utils/beep';

describe('playBeep', () => {
  let mockOscillator: {
    type: string;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockGain: {
    connect: ReturnType<typeof vi.fn>;
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
  };
  let mockContext: {
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    currentTime: number;
    destination: string;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockOscillator = {
      type: '',
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn() },
      disconnect: vi.fn(),
    };
    mockGain = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    };
    mockContext = {
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      currentTime: 0,
      destination: 'destination',
      close: vi.fn(),
    };

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => mockContext),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AudioContextを使用してビープ音を生成する', () => {
    playBeep(880, 0.15);

    expect(mockContext.createOscillator).toHaveBeenCalled();
    expect(mockContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      0,
    );
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalled();
  });

  it('デフォルトの周波数と長さで動作する', () => {
    playBeep();

    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
      800,
      0,
    );
    expect(mockOscillator.stop).toHaveBeenCalled();
  });

  it('AudioContext未対応の場合エラーを投げない', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playBeep()).not.toThrow();
  });
});
