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

/**
 * YouTube IFrame APIスクリプトをロードする（シングルトン）。
 * StrictModeの二重マウントや再マウントでも1回のみ実行される。
 */
function loadYouTubeApi(): Promise<void> {
  if (window.__ytApiLoadPromise) {
    return window.__ytApiLoadPromise;
  }

  window.__ytApiLoadPromise = new Promise<void>((resolve) => {
    // YTが既にロード済みの場合
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // scriptが既に挿入されている場合
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (existing) {
      // コールバック待ち
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }

    // 新規script挿入
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
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

    loadYouTubeApi().then(() => {
      if (destroyed || !window.YT) return;

      const player = new window.YT.Player(containerId, {
        height: '200',
        width: '200',
        events: {
          onReady: () => {
            if (destroyed) return;
            playerRef.current = player;
            setPlayerReady(true);
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (destroyed) return;
            // 再生開始でautoplayブロック状態を解除
            if (event.data === YT.PlayerState.PLAYING) {
              setNeedsUserGesture(false);
            }
          },
          onError: () => {
            if (destroyed) return;
            // autoplayブロックの可能性
            setNeedsUserGesture(true);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // destroy失敗は無視
        }
        playerRef.current = null;
      }
      setPlayerReady(false);
    };
  }, [containerId]);

  const loadAndPlay = useCallback((videoId: string) => {
    pendingVideoRef.current = videoId;
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
    }
  }, []);

  const retryPlay = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.playVideo();
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (playerRef.current) {
      playerRef.current.setVolume(vol);
    }
  }, []);

  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stopVideo();
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
