interface YouTubePlayerProps {
  containerId: string;
}

/**
 * YouTubeプレイヤーのDOMコンテナ。
 * 責務はdiv要素の提供のみ。APIロジックはuseYouTubePlayerフックに委譲。
 * 最低200x200px確保（YouTube APIの要件）、視覚的に画面外に配置。
 */
export function YouTubePlayer({ containerId }: YouTubePlayerProps) {
  return <div id={containerId} className="youtube-player" aria-hidden="true" />;
}
