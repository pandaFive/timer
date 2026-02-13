import { useState, useEffect, useRef, useCallback } from 'react';

/** YouTube IFrame APIのグローバル型 */
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: typeof YT;
    __ytApiLoadPromise?: Promise<void>;
  }
}

export interface UseYouTubePlayerReturn {
  /** autoplayがブロックされた状態 */
  needsUserGesture: boolean;
  /** ユーザー操作後に再生を再試行 */
  retryPlay: () => void;
  /** 音量を設定（0〜100） */
  setVolume: (vol: number) => void;
  /** 動画IDを指定して再生開始 */
  loadAndPlay: (videoId: string) => void;
  /** 再生停止 */
  stop: () => void;
  /** API読み込み完了 */
  playerReady: boolean;
  /** DOMコンテナのID */
  containerId: string;
}

/** API読み込みタイムアウト（ミリ秒） */
const API_LOAD_TIMEOUT_MS = 10_000;

/** プレイヤーコンテナを確保（未存在ならbody直下に作成） */
function ensurePlayerContainer(containerId: string): HTMLElement {
  const existing = document.getElementById(containerId);
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = containerId;
  el.className = 'youtube-player';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}

/**
 * YouTube IFrame APIスクリプトをロードする（シングルトン）。
 * StrictModeの二重マウントや再マウントでも1回のみ実行される。
 * スクリプト読み込み失敗時はPromiseをrejectし、リトライ可能にする。
 */
function loadYouTubeApi(): Promise<void> {
  if (window.__ytApiLoadPromise) {
    return window.__ytApiLoadPromise;
  }

  window.__ytApiLoadPromise = new Promise<void>((resolve, reject) => {
    // YTが既にロード済みの場合
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // scriptが既に挿入されている場合
    const existing = document.querySelector(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (existing) {
      // コールバック待ち
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }

    // タイムアウト設定
    const timeout = setTimeout(() => {
      // リトライ可能にするためキャッシュをクリア
      window.__ytApiLoadPromise = undefined;
      reject(new Error('YouTube API load timed out'));
    }, API_LOAD_TIMEOUT_MS);

    // 新規script挿入
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      clearTimeout(timeout);
      // リトライ可能にするためキャッシュをクリア
      window.__ytApiLoadPromise = undefined;
      reject(new Error('YouTube API script failed to load'));
    };
    document.head.appendChild(script);
  });

  return window.__ytApiLoadPromise;
}

export function useYouTubePlayer(containerId: string): UseYouTubePlayerReturn {
  const [playerReady, setPlayerReady] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const playerRef = useRef<YT.Player | null>(null);
  const pendingVideoRef = useRef<string | null>(null);

  useEffect(() => {
    let destroyed = false;

    loadYouTubeApi()
      .then(() => {
        if (destroyed || !window.YT) return;

        try {
          const container = ensurePlayerContainer(containerId);
          const player = new window.YT.Player(container.id, {
            height: '200',
            width: '200',
            events: {
              onReady: () => {
                if (destroyed) return;
                playerRef.current = player;
                setPlayerReady(true);
                // プレイヤー準備前にリクエストされた動画を再生
                if (pendingVideoRef.current) {
                  try {
                    player.loadVideoById(pendingVideoRef.current);
                  } catch (e) {
                    console.warn('保留中の動画の読み込みに失敗しました:', e);
                  }
                  pendingVideoRef.current = null;
                }
              },
              onStateChange: (event: YT.OnStateChangeEvent) => {
                if (destroyed) return;
                // 再生開始でautoplayブロック状態を解除
                if (event.data === YT.PlayerState.PLAYING) {
                  setNeedsUserGesture(false);
                }
              },
              onError: (event: YT.OnErrorEvent) => {
                if (destroyed) return;
                const code = event.data;
                // エラーコード別のハンドリング
                // 2: 無効なパラメータ, 5: HTML5エラー, 100: 動画不存在, 101/150: 埋込禁止
                if (code === 5) {
                  // HTML5プレイヤーエラーはautoplayブロックの可能性あり
                  setNeedsUserGesture(true);
                } else {
                  console.warn(`YouTube プレイヤーエラー (code: ${code})`);
                }
              },
            },
          });
        } catch (e) {
          if (!destroyed) {
            console.error('YouTube プレイヤーの初期化に失敗しました:', e);
          }
        }
      })
      .catch((err) => {
        if (!destroyed) {
          console.warn('YouTube APIの読み込みに失敗しました:', err);
        }
      });

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // iframeが既にDOMから除去されている場合などに失敗する
          console.warn('YouTube player destroy failed:', e);
        }
        playerRef.current = null;
      }
      setPlayerReady(false);
    };
  }, [containerId]);

  const loadAndPlay = useCallback((videoId: string) => {
    pendingVideoRef.current = videoId;
    if (playerRef.current) {
      try {
        playerRef.current.loadVideoById(videoId);
      } catch (e) {
        console.warn('YouTube動画の読み込みに失敗しました:', e);
      }
    }
  }, []);

  const retryPlay = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.playVideo();
      } catch (e) {
        console.warn('YouTube動画の再生に失敗しました:', e);
      }
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (playerRef.current) {
      try {
        // 0〜100にクランプ
        playerRef.current.setVolume(Math.max(0, Math.min(100, vol)));
      } catch (e) {
        console.warn('YouTube音量設定に失敗しました:', e);
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.stopVideo();
      } catch (e) {
        console.warn('YouTube動画の停止に失敗しました:', e);
      }
    }
  }, []);

  return {
    needsUserGesture,
    retryPlay,
    setVolume,
    loadAndPlay,
    stop,
    playerReady,
    containerId,
  };
}
