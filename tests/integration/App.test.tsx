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

  it('下書き設定が localStorage に自動保存される', async () => {
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const setsInput = screen.getByLabelText('セット数');
    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '45' } });
      fireEvent.change(setsInput, { target: { value: '3' } });
    });

    const stored = localStorage.getItem('hiit-timer-draft');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.workoutSeconds).toBe(45);
    expect(parsed.sets).toBe(3);
  });

  it('プリセットを保存できる', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const workoutInput = screen.getByLabelText('ワークアウト（秒）');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '朝トレ' } });
      fireEvent.change(workoutInput, { target: { value: '42' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(screen.getByText('プリセットを保存しました')).toBeInTheDocument();

    const stored = localStorage.getItem('hiit-timer-presets');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.presets).toHaveLength(1);
    expect(parsed.presets[0].name).toBe('朝トレ');
    expect(parsed.presets[0].config.workoutSeconds).toBe(42);
  });

  it('重複プリセット名は保存できない', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '同名' } });
      fireEvent.click(screen.getByText('保存'));
    });

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '同名' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText('同名のプリセットが既に存在します'),
    ).toBeInTheDocument();
  });

  it('空プリセット名は保存できない', async () => {
    setupGlobalMocks();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText('プリセット名を入力してください'),
    ).toBeInTheDocument();
  });

  it('30文字を超えるプリセット名は保存できない', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const overLimitName = 'a'.repeat(31);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: overLimitName } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText('プリセット名は30文字以内で入力してください'),
    ).toBeInTheDocument();

    const stored = localStorage.getItem('hiit-timer-presets');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.presets).toHaveLength(0);
    }
  });

  it('無効な設定値ではプリセット保存をブロックする', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const workoutInput = screen.getByLabelText('ワークアウト（秒）');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '保存失敗ケース' } });
      fireEvent.change(workoutInput, { target: { value: '0' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText('入力エラーを修正してから保存してください'),
    ).toBeInTheDocument();
    const stored = localStorage.getItem('hiit-timer-presets');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.presets).toHaveLength(0);
    }
  });

  it('プリセット名はtrimと制御文字除去を適用して保存する', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    await act(async () => {
      fireEvent.change(nameInput, {
        target: { value: '\u200B  朝トレ  \u200B' },
      });
      fireEvent.click(screen.getByText('保存'));
    });

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets[0].name).toBe('朝トレ');
  });

  it('プリセットを読み込みできる', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '夜トレ' } });
      fireEvent.change(workoutInput, { target: { value: '50' } });
      fireEvent.click(screen.getByText('保存'));
    });

    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '25' } });
    });
    expect(workoutInput.value).toBe('25');

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    const presetId = stored.presets[0].id;
    await act(async () => {
      fireEvent.change(select, { target: { value: presetId } });
      fireEvent.click(screen.getByText('読込'));
    });

    expect(workoutInput.value).toBe('50');
    expect(screen.getByText('プリセットを読み込みました')).toBeInTheDocument();
  });

  it('プリセット読込で入力エラー表示をクリアする', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'エラー解除' } });
      fireEvent.change(workoutInput, { target: { value: '45' } });
      fireEvent.click(screen.getByText('保存'));
    });

    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '0' } });
    });
    const form = screen.getByText('スタート').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(
      screen.getByText('1〜600の整数を入力してください'),
    ).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    const presetId = stored.presets[0].id;
    await act(async () => {
      fireEvent.change(select, { target: { value: presetId } });
      fireEvent.click(screen.getByText('読込'));
    });

    expect(
      screen.queryByText('1〜600の整数を入力してください'),
    ).not.toBeInTheDocument();
  });

  it('プリセット読込では既存のストレージ警告をクリアしない', async () => {
    localStorage.setItem(
      'hiit-timer-presets',
      JSON.stringify({
        presets: [
          {
            id: 'preset-valid',
            name: '有効プリセット',
            config: {
              workoutSeconds: 35,
              restSeconds: 10,
              sets: 1,
              rounds: 4,
              betweenSetsRestSeconds: 0,
              workoutUrl: '',
              restUrl: '',
            },
            createdAt: 100,
          },
          { id: 1, name: '', config: null, createdAt: -1 },
        ],
      }),
    );
    setupGlobalMocks();
    render(<App />);

    expect(
      screen.getByText('保存済み設定の一部を読み込めませんでした'),
    ).toBeInTheDocument();

    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'preset-valid' } });
      fireEvent.click(screen.getByText('読込'));
    });

    expect(
      screen.getByText('保存済み設定の一部を読み込めませんでした'),
    ).toBeInTheDocument();
  });

  it('プリセットを削除できる', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '削除用' } });
      fireEvent.click(screen.getByText('保存'));
    });

    const storedBeforeDelete = JSON.parse(
      localStorage.getItem('hiit-timer-presets')!,
    );
    const presetId = storedBeforeDelete.presets[0].id;
    await act(async () => {
      fireEvent.change(select, { target: { value: presetId } });
      fireEvent.click(screen.getByText('削除'));
    });

    const storedAfterDelete = JSON.parse(
      localStorage.getItem('hiit-timer-presets')!,
    );
    expect(storedAfterDelete.presets).toHaveLength(0);
    expect(screen.getByText('プリセットを削除しました')).toBeInTheDocument();
  });

  it('プリセット削除の書き込み失敗時は成功表示しない', async () => {
    localStorage.setItem(
      'hiit-timer-presets',
      JSON.stringify({
        presets: [
          {
            id: 'preset-delete-fail',
            name: '削除失敗テスト',
            config: {
              workoutSeconds: 30,
              restSeconds: 15,
              sets: 1,
              rounds: 8,
              betweenSetsRestSeconds: 0,
              workoutUrl: '',
              restUrl: '',
            },
            createdAt: 100,
          },
        ],
      }),
    );
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'hiit-timer-presets') {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    setupGlobalMocks();
    render(<App />);

    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'preset-delete-fail' } });
      fireEvent.click(screen.getByText('削除'));
    });

    expect(
      screen.getByText(
        '保存済み設定の保存に失敗しました。ブラウザ容量を確認してください',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('プリセットを削除しました'),
    ).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets).toHaveLength(1);
  });

  it('プリセットは3件を超えて保存できない', async () => {
    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');

    for (const name of ['A', 'B', 'C']) {
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: name } });
        fireEvent.click(screen.getByText('保存'));
      });
    }

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'D' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText(
        'プリセットは3件までです。保存済み設定を削除してから保存してください',
      ),
    ).toBeInTheDocument();
  });

  it('旧設定キーをプリセットへ互換移行する', async () => {
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 44,
        restSeconds: 11,
        sets: 2,
        rounds: 5,
        betweenSetsRestSeconds: 15,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const stored = localStorage.getItem('hiit-timer-presets');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.presets).toHaveLength(1);
    expect(parsed.presets[0].name).toBe('既存設定');
    expect(parsed.presets[0].config.workoutSeconds).toBe(44);
    expect(localStorage.getItem('hiit-timer-config')).toBeNull();
  });

  it('旧設定移行時は不正URLのみ破棄し数値設定は維持する', async () => {
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 47,
        restSeconds: 12,
        sets: 3,
        rounds: 6,
        betweenSetsRestSeconds: 20,
        workoutUrl: 'https://evil.com/watch?v=test',
        restUrl: 'https://example.com/invalid',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets).toHaveLength(1);
    expect(stored.presets[0].name).toBe('既存設定');
    expect(stored.presets[0].config.workoutSeconds).toBe(47);
    expect(stored.presets[0].config.restSeconds).toBe(12);
    expect(stored.presets[0].config.sets).toBe(3);
    expect(stored.presets[0].config.rounds).toBe(6);
    expect(stored.presets[0].config.betweenSetsRestSeconds).toBe(20);
    expect(stored.presets[0].config.workoutUrl).toBe('');
    expect(stored.presets[0].config.restUrl).toBe('');
  });

  it('presets が既にある場合は互換移行をスキップする（冪等）', async () => {
    localStorage.setItem(
      'hiit-timer-presets',
      JSON.stringify({
        presets: [
          {
            id: 'preset-existing',
            name: '既存プリセット',
            config: {
              workoutSeconds: 33,
              restSeconds: 10,
              sets: 1,
              rounds: 4,
              betweenSetsRestSeconds: 0,
              workoutUrl: '',
              restUrl: '',
            },
            createdAt: 100,
          },
        ],
      }),
    );
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 99,
        restSeconds: 99,
        sets: 9,
        rounds: 9,
        betweenSetsRestSeconds: 9,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets).toHaveLength(1);
    expect(stored.presets[0].id).toBe('preset-existing');
    expect(stored.presets[0].name).toBe('既存プリセット');
    expect(localStorage.getItem('hiit-timer-config')).toBeNull();
  });

  it('presetsキー破損時はlegacy設定を救済移行する', async () => {
    localStorage.setItem('hiit-timer-presets', 'broken-json');
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 66,
        restSeconds: 12,
        sets: 2,
        rounds: 5,
        betweenSetsRestSeconds: 8,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('66');

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets).toHaveLength(1);
    expect(stored.presets[0].name).toBe('既存設定');
    expect(stored.presets[0].config.workoutSeconds).toBe(66);
    expect(localStorage.getItem('hiit-timer-config')).toBeNull();
  });

  it('draftスキーマ不一致時はlegacy設定で上書き移行する', async () => {
    localStorage.setItem('hiit-timer-draft', JSON.stringify({ foo: 'bar' }));
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 72,
        restSeconds: 18,
        sets: 2,
        rounds: 4,
        betweenSetsRestSeconds: 10,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('72');

    const draft = JSON.parse(localStorage.getItem('hiit-timer-draft')!);
    expect(draft.workoutSeconds).toBe(72);
    expect(localStorage.getItem('hiit-timer-config')).toBeNull();
  });

  it('presets配列が全件不正ならlegacy設定を移行する', async () => {
    localStorage.setItem(
      'hiit-timer-presets',
      JSON.stringify({
        presets: [{ id: 1, name: '', config: null, createdAt: -1 }],
      }),
    );
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 68,
        restSeconds: 14,
        sets: 3,
        rounds: 5,
        betweenSetsRestSeconds: 12,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('68');

    const stored = JSON.parse(localStorage.getItem('hiit-timer-presets')!);
    expect(stored.presets).toHaveLength(1);
    expect(stored.presets[0].name).toBe('既存設定');
    expect(stored.presets[0].config.workoutSeconds).toBe(68);
    expect(localStorage.getItem('hiit-timer-config')).toBeNull();
  });

  it('presets がある場合はdraft欠損でもlegacyへフォールバックしない', () => {
    localStorage.setItem(
      'hiit-timer-presets',
      JSON.stringify({
        presets: [
          {
            id: 'preset-existing',
            name: '既存プリセット',
            config: {
              workoutSeconds: 33,
              restSeconds: 10,
              sets: 1,
              rounds: 4,
              betweenSetsRestSeconds: 0,
              workoutUrl: '',
              restUrl: '',
            },
            createdAt: 100,
          },
        ],
      }),
    );
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 99,
        restSeconds: 99,
        sets: 9,
        rounds: 9,
        betweenSetsRestSeconds: 9,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('30');
  });

  it('draft破損時はlegacy設定へフォールバックする', () => {
    localStorage.setItem('hiit-timer-draft', 'broken-json');
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 77,
        restSeconds: 13,
        sets: 2,
        rounds: 6,
        betweenSetsRestSeconds: 18,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('77');
  });

  it('draft復元時は不正URLを空文字へ正規化する', () => {
    localStorage.setItem(
      'hiit-timer-draft',
      JSON.stringify({
        workoutSeconds: 30,
        restSeconds: 15,
        sets: 1,
        rounds: 8,
        betweenSetsRestSeconds: 0,
        workoutUrl: 'https://evil.example.com/watch?v=bad',
        restUrl: 'https://not-youtube.example.org',
      }),
    );
    setupGlobalMocks();
    render(<App />);

    const workoutUrl = screen.getByLabelText(
      'ワークアウト曲（YouTube URL）',
    ) as HTMLInputElement;
    const restUrl = screen.getByLabelText(
      '休憩曲（YouTube URL）',
    ) as HTMLInputElement;
    expect(workoutUrl.value).toBe('');
    expect(restUrl.value).toBe('');
  });

  it('旧設定移行時にdraftキーを自動生成する', async () => {
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 55,
        restSeconds: 14,
        sets: 2,
        rounds: 4,
        betweenSetsRestSeconds: 10,
        workoutUrl: '',
        restUrl: '',
      }),
    );
    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const draft = localStorage.getItem('hiit-timer-draft');
    expect(draft).toBeTruthy();
    const parsed = JSON.parse(draft!);
    expect(parsed.workoutSeconds).toBe(55);
    expect(parsed.restSeconds).toBe(14);
  });

  it('旧設定移行でdraft書き込みは1回だけ実行する', async () => {
    localStorage.setItem(
      'hiit-timer-config',
      JSON.stringify({
        workoutSeconds: 58,
        restSeconds: 13,
        sets: 2,
        rounds: 5,
        betweenSetsRestSeconds: 7,
        workoutUrl: '',
        restUrl: '',
      }),
    );

    const originalSetItem = Storage.prototype.setItem;
    const draftSetItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        return originalSetItem.call(this, key, value);
      });

    setupGlobalMocks();
    render(<App />);
    await act(async () => {});

    const draftWriteCount = draftSetItemSpy.mock.calls.filter(
      ([key]) => key === 'hiit-timer-draft',
    ).length;
    expect(draftWriteCount).toBe(1);
  });

  it('破損したプリセットJSONは復旧して警告表示する', () => {
    localStorage.setItem('hiit-timer-presets', 'broken-json');
    setupGlobalMocks();
    render(<App />);

    expect(
      screen.getByText('保存済み設定の読み込みに失敗しました'),
    ).toBeInTheDocument();
    const select = screen.getByLabelText('保存済み設定') as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
  });

  it('初期状態復元で予期しない例外が発生してもクラッシュしない', () => {
    const originalGetItem = Storage.prototype.getItem;
    let thrown = false;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (!thrown) {
        thrown = true;
        throw new TypeError('unexpected');
      }
      return originalGetItem.call(this, key);
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText(
      'ワークアウト（秒）',
    ) as HTMLInputElement;
    expect(workoutInput.value).toBe('30');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('プリセット保存成功後に読み込み警告をクリアする', async () => {
    localStorage.setItem('hiit-timer-presets', JSON.stringify({ foo: 'bar' }));
    setupGlobalMocks();
    render(<App />);

    expect(
      screen.getByText('保存済み設定の一部を読み込めませんでした'),
    ).toBeInTheDocument();

    const nameInput = screen.getByLabelText('プリセット名');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '警告クリア用' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.queryByText('保存済み設定の一部を読み込めませんでした'),
    ).not.toBeInTheDocument();
  });

  it('プリセット保存の書き込み失敗時は成功表示しない', async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'hiit-timer-presets') {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    setupGlobalMocks();
    render(<App />);

    const nameInput = screen.getByLabelText('プリセット名');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '失敗ケース' } });
      fireEvent.click(screen.getByText('保存'));
    });

    expect(
      screen.getByText(
        '保存済み設定の保存に失敗しました。ブラウザ容量を確認してください',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('プリセットを保存しました'),
    ).not.toBeInTheDocument();
  });

  it('下書き自動保存の書き込み失敗時に通知する', async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'hiit-timer-draft') {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '40' } });
    });

    expect(
      screen.getByText(
        '下書き設定の保存に失敗しました。ブラウザ容量を確認してください',
      ),
    ).toBeInTheDocument();
  });

  it('InvalidStateErrorでも下書き保存失敗として通知する', async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'hiit-timer-draft') {
        throw new DOMException('invalid state', 'InvalidStateError');
      }
      return originalSetItem.call(this, key, value);
    });

    setupGlobalMocks();
    render(<App />);

    const workoutInput = screen.getByLabelText('ワークアウト（秒）');
    await act(async () => {
      fireEvent.change(workoutInput, { target: { value: '41' } });
    });

    expect(
      screen.getByText(
        '下書き設定の保存に失敗しました。ブラウザ容量を確認してください',
      ),
    ).toBeInTheDocument();
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
