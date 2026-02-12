/** 許可するYouTubeホスト名 */
const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'm.youtube.com',
]);

/** videoIdの形式: 英数字、ハイフン、アンダースコアの11文字 */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * YouTube URLからvideoIdを抽出する。
 * 不正なURL、非YouTubeドメイン、不正なvideoId形式の場合はnullを返す。
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // httpsのみ許可
  if (parsed.protocol !== 'https:') return null;

  // ホスト名を許可リストと完全一致判定
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;

  let videoId: string | null = null;

  if (parsed.hostname === 'youtu.be') {
    // 短縮URL: https://youtu.be/{videoId}
    videoId = parsed.pathname.slice(1);
  } else if (parsed.pathname.startsWith('/embed/')) {
    // 埋め込みURL: https://www.youtube.com/embed/{videoId}
    videoId = parsed.pathname.slice('/embed/'.length);
  } else {
    // 通常URL: https://www.youtube.com/watch?v={videoId}
    videoId = parsed.searchParams.get('v');
  }

  if (!videoId) return null;

  // videoIdの形式検証
  if (!VIDEO_ID_REGEX.test(videoId)) return null;

  return videoId;
}
