import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../../src/App';

// --- グローバルモック ---

function setupGlobalMocks() {
  // YouTube API モック
  const mockPlayer = {
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    stopVideo: vi.fn(),
    pauseVideo: vi.fn(),
    setVolume: vi.fn(),
    destroy: vi.fn(),
    getPlayerState: vi.fn(() => 1),
  };

  let onReadyCallback: (() => void) | undefined;
  const utteranceInstances: {
    text: string;
    lang: string;
    voice: SpeechSynthesisVoice | null;
    onerror: ((e: Event) => void) | null;
    rate: number;
    pitch: number;
    volume: number;
  }[] = [];

  vi.stubGlobal('YT', {
    Player: vi.fn(
      (_id: string, opts: { events?: { onReady?: () => void } }) => {
        onReadyCallback = opts.events?.onReady;
        return mockPlayer;
      },
    ),
    PlayerState: {
      UNSTARTED: -1,
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    },
  });

  // Speech Synthesis モック
  vi.stubGlobal('speechSynthesis', {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    vi.fn((text: string) => {
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

  // AudioContext モック
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ({
      createOscillator: vi.fn(() => ({
        type: '',
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      })),
      currentTime: 0,
      destination: 'dest',
    })),
  );

  return {
    mockPlayer,
    triggerPlayerReady: () => onReadyCallback?.(),
    utteranceInstances,
  };
}

describe('App 統合テスト', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    dateNowSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).__ytApiLoadPromise;
  });

  it('初期状態で設定フォームが表示される', () => {
    setupGlobalMocks();
    render(<App />);

    expect(screen.getByText('HIIT インターバルタイマー')).toBeInTheDocument();
    expect(screen.getByLabelText('ワークアウト（秒）')).toBeInTheDocument();
    expect(screen.getByLabelText('休憩（秒）')).toBeInTheDocument();
    expect(screen.getByLabelText('セット数')).toBeInTheDocument();
    expect(screen.getByLabelText('ラウンド数')).toBeInTheDocument();
    expect(screen.getByLabelText('セット間休憩（秒）')).toBeInTheDocument();
    expect(screen.getByText('スタート')).toBeInTheDocument();
  });

  it('設定フォームでラウンド数がセット数より先に表示される', () => {
    setupGlobalMocks();
    render(<App />);

    const form = screen.getByText('スタート').closest('form');
    expect(form).not.toBeNull();

    const firstFieldGroup = form?.querySelector('.settings__field-group');
    expect(firstFieldGroup).not.toBeNull();

    const labels = Array.from(firstFieldGroup?.querySelectorAll('label') ?? [])
      .map((label) => label.textContent?.trim())
      .filter((text): text is string => !!text);

    expect(labels).toEqual([
      'ワークアウト（秒）',
      '休憩（秒）',
      'ラウンド数',
      'セット数',
      'セット間休憩（秒）',
    ]);
  });

  it('スタートボタンでタイマーが開始される', async () => {
    setupGlobalMocks();
    render(<App />);

    // デフォルト設定でスタート
    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    expect(screen.getByText('ワークアウト')).toBeInTheDocument();
  });

  it('タイマー実行中にコントロールボタンが表示される', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    expect(screen.getByLabelText('一時停止')).toBeInTheDocument();
    expect(screen.getByLabelText('スキップ')).toBeInTheDocument();
    expect(screen.getByLabelText('リセット')).toBeInTheDocument();
  });

  it('タイマー実行中にセットとラウンドが表示される', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    expect(screen.getByText('セット 1 / 1')).toBeInTheDocument();
    expect(screen.getByText('ラウンド 1 / 8')).toBeInTheDocument();
  });

  it('一時停止と再開が動作する', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    // 一時停止
    await act(async () => {
      fireEvent.click(screen.getByLabelText('一時停止'));
    });

    expect(screen.getByLabelText('再開')).toBeInTheDocument();

    // 再開
    await act(async () => {
      fireEvent.click(screen.getByLabelText('再開'));
    });

    expect(screen.getByLabelText('一時停止')).toBeInTheDocument();
  });

  it('リセットで設定画面に戻る', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('リセット'));
    });

    expect(screen.getByText('スタート')).toBeInTheDocument();
    expect(screen.getByLabelText('ワークアウト（秒）')).toBeInTheDocument();
  });

  it('全ラウンド完了でサマリーが表示される', async () => {
    setupGlobalMocks();
    render(<App />);

    // 1ラウンド、3秒ワークアウトに設定
    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const roundsInput = screen.getByLabelText('ラウンド数');

    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '3' } });
      fireEvent.change(roundsInput, { target: { value: '1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    // 3秒経過
    currentTime += 3000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('ワークアウト完了！')).toBeInTheDocument();
    expect(screen.getByText('実行セット')).toBeInTheDocument();
    expect(screen.getByText('セット内ラウンド')).toBeInTheDocument();
    expect(screen.getByText('総ラウンド')).toBeInTheDocument();
    expect(screen.getByText('もう一度')).toBeInTheDocument();
  });

  it('サマリーの「もう一度」で設定画面に戻る', async () => {
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const roundsInput = screen.getByLabelText('ラウンド数');

    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '3' } });
      fireEvent.change(roundsInput, { target: { value: '1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    currentTime += 3000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('もう一度'));
    });

    expect(screen.getByText('スタート')).toBeInTheDocument();
  });

  it('不正な設定値でバリデーションエラーが表示される', async () => {
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '0' } });
    });

    const form = screen.getByText('スタート').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('不正なYouTube URLでバリデーションエラーが表示される', async () => {
    setupGlobalMocks();
    render(<App />);

    const urlInput = screen.getByLabelText('ワークアウト曲（YouTube URL）');
    await act(async () => {
      fireEvent.change(urlInput, {
        target: { value: 'https://evil.com/watch?v=test' },
      });
    });

    const form = screen.getByText('スタート').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(
      screen.getByText('有効なYouTube URLを入力してください'),
    ).toBeInTheDocument();
  });

  it('localStorage に設定が保存される', async () => {
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const setsInput = screen.getByLabelText('セット数');
    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '45' } });
      fireEvent.change(setsInput, { target: { value: '3' } });
    });

    const stored = localStorage.getItem('hiit-timer-config');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.workoutSeconds).toBe(45);
    expect(parsed.sets).toBe(3);
  });

  it('localStorage の破損データはデフォルト値にフォールバックする', () => {
    localStorage.setItem('hiit-timer-config', 'invalid json!!!');
    setupGlobalMocks();
    render(<App />);

    // デフォルト値（30秒）が表示される
    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('30');
  });

  it('localStorage のスキーマ不一致はデフォルト値にフォールバックする', () => {
    localStorage.setItem('hiit-timer-config', JSON.stringify({ foo: 'bar' }));
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('30');
  });

  it('キーボードショートカット: フォーム入力中はショートカット無効', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    // タイマー実行中にSpaceキーを押す（コントロールにフォーカスしていない場合）
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' });
    });

    // 一時停止される
    expect(screen.getByLabelText('再開')).toBeInTheDocument();
  });

  it('フェーズ遷移ごとに開始案内を読み上げる', async () => {
    const { utteranceInstances } = setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const restInput = screen.getByLabelText('休憩（秒）');
    const setsInput = screen.getByLabelText('セット数');
    const roundsInput = screen.getByLabelText('ラウンド数');
    const betweenSetsRestInput = screen.getByLabelText('セット間休憩（秒）');

    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '4' } });
      fireEvent.change(restInput, { target: { value: '1' } });
      fireEvent.change(setsInput, { target: { value: '2' } });
      fireEvent.change(roundsInput, { target: { value: '2' } });
      fireEvent.change(betweenSetsRestInput, { target: { value: '2' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });

    // set1 round1 workout -> rest
    currentTime += 4000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // set1 round1 rest -> set1 round2 workout
    currentTime += 1000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // set1 round2 workout -> between sets rest
    currentTime += 4000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // between sets rest -> set2 round1 workout
    currentTime += 2000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // set2 round1 workout -> rest
    currentTime += 4000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // set2 round1 rest -> set2 round2 workout
    currentTime += 1000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // set2 round2 workout -> completed
    currentTime += 4000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const sectionTexts = utteranceInstances
      .map((utterance) => utterance.text)
      .filter((text) => !['1', '2', '3'].includes(text));

    expect(sectionTexts).toEqual([
      'Workout',
      'Rest',
      'Workout',
      'Between sets rest',
      'Workout',
      'Rest',
      'Workout',
      'Completed',
    ]);
    expect(screen.getByText('ワークアウト完了！')).toBeInTheDocument();
  });

  it('同セット内は曲を継続し、セット間休憩のみ休憩曲へ切り替わる', async () => {
    const { mockPlayer, triggerPlayerReady } = setupGlobalMocks();
    render(<App />);

    const workoutUrl = screen.getByLabelText('ワークアウト曲（YouTube URL）');
    const restUrl = screen.getByLabelText('休憩曲（YouTube URL）');
    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const restInput = screen.getByLabelText('休憩（秒）');
    const setsInput = screen.getByLabelText('セット数');
    const roundsInput = screen.getByLabelText('ラウンド数');
    const betweenSetsRestInput = screen.getByLabelText('セット間休憩（秒）');

    await act(async () => {
      fireEvent.change(workoutUrl, {
        target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      });
      fireEvent.change(restUrl, {
        target: { value: 'https://www.youtube.com/watch?v=M7FIvfx5J10' },
      });
      fireEvent.change(workoutInput, { target: { value: '2' } });
      fireEvent.change(restInput, { target: { value: '1' } });
      fireEvent.change(setsInput, { target: { value: '2' } });
      fireEvent.change(roundsInput, { target: { value: '2' } });
      fireEvent.change(betweenSetsRestInput, { target: { value: '2' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('スタート'));
    });
    await act(async () => {
      triggerPlayerReady();
    });

    // set1 round1 workout開始
    expect(mockPlayer.loadVideoById).toHaveBeenCalledTimes(1);
    expect(mockPlayer.loadVideoById).toHaveBeenNthCalledWith(1, 'dQw4w9WgXcQ');
    expect(screen.getByText('ワークアウト')).toBeInTheDocument();

    // set1 round1 rest（同セット内）: 切替なし
    currentTime += 2000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockPlayer.loadVideoById).toHaveBeenCalledTimes(1);
    expect(screen.getByText('休憩')).toBeInTheDocument();
    expect(screen.queryByText('セット間休憩')).not.toBeInTheDocument();

    // set1 round2 workout（同セット内）: 切替なし
    currentTime += 1000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockPlayer.loadVideoById).toHaveBeenCalledTimes(1);

    // set1終了後のセット間休憩: 休憩曲へ切替
    currentTime += 2000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockPlayer.loadVideoById).toHaveBeenCalledTimes(2);
    expect(mockPlayer.loadVideoById).toHaveBeenNthCalledWith(2, 'M7FIvfx5J10');
    expect(screen.getByText('セット間休憩')).toBeInTheDocument();

    // set2 round1開始: ワークアウト曲へ戻す
    currentTime += 2000;
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockPlayer.loadVideoById).toHaveBeenCalledTimes(3);
    expect(mockPlayer.loadVideoById).toHaveBeenNthCalledWith(3, 'dQw4w9WgXcQ');
    expect(screen.getByText('ワークアウト')).toBeInTheDocument();
  });
});
