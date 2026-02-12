import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useYouTubePlayer } from '../../src/hooks/useYouTubePlayer';

/** YT.Player モック */
function createMockPlayer() {
  return {
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    stopVideo: vi.fn(),
    pauseVideo: vi.fn(),
    setVolume: vi.fn(),
    destroy: vi.fn(),
    getPlayerState: vi.fn(() => 1),
  };
}

type PlayerCallbacks = {
  onReady?: (event: { target: ReturnType<typeof createMockPlayer> }) => void;
  onStateChange?: (event: { data: number }) => void;
  onError?: (event: { data: number }) => void;
};

/**
 * YT APIモックを設定する。
 * preloadの場合、YT.Playerが既にグローバルに存在する状態をシミュレートする。
 */
function setupYTMock() {
  const mockPlayer = createMockPlayer();
  let callbacks: PlayerCallbacks = {};

  const MockPlayer = vi.fn((_containerId: string, opts: {
    height: string;
    width: string;
    events: PlayerCallbacks;
  }) => {
    callbacks = opts.events ?? {};
    return mockPlayer;
  });

  const YT = {
    Player: MockPlayer,
    PlayerState: {
      UNSTARTED: -1,
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    },
  };

  vi.stubGlobal('YT', YT);

  return {
    mockPlayer,
    MockPlayer,
    triggerReady: () => callbacks.onReady?.({ target: mockPlayer }),
    triggerStateChange: (state: number) => callbacks.onStateChange?.({ data: state }),
    triggerError: (code: number) => callbacks.onError?.({ data: code }),
  };
}

/** APIをready状態まで進めるヘルパー */
async function readyPlayer(triggerReady: () => void) {
  const callback = (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady as (() => void) | undefined;
  if (callback) {
    await act(async () => { callback(); });
  }
  await act(async () => { triggerReady(); });
}

describe('useYouTubePlayer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appendChildSpy: any;

  beforeEach(() => {
    appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => node);
    vi.spyOn(document, 'querySelector').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).__ytApiLoadPromise;
  });

  it('containerId付きのdiv要素を提供する', () => {
    setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));
    expect(result.current.containerId).toBe('test-player');
  });

  it('YT未ロード時にAPIスクリプトを挿入する', async () => {
    // YTはまだグローバルに存在しない
    renderHook(() => useYouTubePlayer('test-player'));

    // useEffectが実行されてscriptが挿入される
    expect(appendChildSpy).toHaveBeenCalled();
    const scriptNode = appendChildSpy.mock.calls[0]?.[0] as HTMLScriptElement;
    expect(scriptNode?.src).toContain('youtube.com/iframe_api');
  });

  it('YTが既にロード済みの場合scriptを挿入しない', async () => {
    setupYTMock();
    renderHook(() => useYouTubePlayer('test-player'));

    // script挿入は不要（YTが既にある）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scriptCalls = appendChildSpy.mock.calls.filter(
      (call: any[]) => (call[0] as HTMLElement)?.tagName === 'SCRIPT'
    );
    expect(scriptCalls.length).toBe(0);
  });

  it('APIロード後にplayerReadyがtrueになる', async () => {
    const { triggerReady } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    expect(result.current.playerReady).toBe(true);
  });

  it('loadAndPlayで動画を再生する', async () => {
    const { mockPlayer, triggerReady } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    act(() => { result.current.loadAndPlay('dQw4w9WgXcQ'); });

    expect(mockPlayer.loadVideoById).toHaveBeenCalledWith('dQw4w9WgXcQ');
  });

  it('setVolumeで音量を変更する', async () => {
    const { mockPlayer, triggerReady } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    act(() => { result.current.setVolume(30); });

    expect(mockPlayer.setVolume).toHaveBeenCalledWith(30);
  });

  it('stopで再生を停止する', async () => {
    const { mockPlayer, triggerReady } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    act(() => { result.current.stop(); });

    expect(mockPlayer.stopVideo).toHaveBeenCalled();
  });

  it('autoplayブロック時にneedsUserGestureがtrueになる', async () => {
    const { triggerReady, triggerError } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    act(() => { result.current.loadAndPlay('testVideoId'); });
    await act(async () => { triggerError(150); });

    expect(result.current.needsUserGesture).toBe(true);
  });

  it('retryPlayで再生を再試行しneedsUserGestureがfalseになる', async () => {
    const { mockPlayer, triggerReady, triggerError, triggerStateChange } = setupYTMock();
    const { result } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    act(() => { result.current.loadAndPlay('testVideoId'); });
    await act(async () => { triggerError(150); });
    expect(result.current.needsUserGesture).toBe(true);

    act(() => { result.current.retryPlay(); });
    expect(mockPlayer.playVideo).toHaveBeenCalled();

    await act(async () => { triggerStateChange(1); });
    expect(result.current.needsUserGesture).toBe(false);
  });

  it('アンマウント時にPlayerがdestroyされる', async () => {
    const { mockPlayer, triggerReady } = setupYTMock();
    const { unmount } = renderHook(() => useYouTubePlayer('test-player'));

    await readyPlayer(triggerReady);

    unmount();

    expect(mockPlayer.destroy).toHaveBeenCalled();
  });

  describe('StrictMode耐性', () => {
    it('シングルトンPromiseによりscript挿入は1回のみ', async () => {
      // YTは未ロード
      const { unmount: unmount1 } = renderHook(() => useYouTubePlayer('test-player'));
      const firstCallCount = appendChildSpy.mock.calls.length;

      unmount1();

      // 再マウント（StrictModeシミュレーション）
      // __ytApiLoadPromiseが残っているのでscript挿入はスキップされる
      renderHook(() => useYouTubePlayer('test-player-2'));

      expect(appendChildSpy.mock.calls.length).toBe(firstCallCount);
    });
  });
});
