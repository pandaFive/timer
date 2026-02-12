import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../../src/utils/youtube';

describe('extractVideoId', () => {
  describe('正常系: 各URL形式からvideoIdを抽出', () => {
    it('通常のYouTube URLからvideoIdを抽出する', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe('dQw4w9WgXcQ');
    });

    it('短縮URLからvideoIdを抽出する', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      );
    });

    it('埋め込みURLからvideoIdを抽出する', () => {
      expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      );
    });

    it('nocookie埋め込みURLからvideoIdを抽出する', () => {
      expect(
        extractVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
      ).toBe('dQw4w9WgXcQ');
    });

    it('モバイルURLからvideoIdを抽出する', () => {
      expect(extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      );
    });

    it('www無しのURLからvideoIdを抽出する', () => {
      expect(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      );
    });

    it('nocookie（www無し）の埋め込みURLからvideoIdを抽出する', () => {
      expect(
        extractVideoId('https://youtube-nocookie.com/embed/dQw4w9WgXcQ'),
      ).toBe('dQw4w9WgXcQ');
    });

    it('追加クエリパラメータがあっても抽出できる', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120'),
      ).toBe('dQw4w9WgXcQ');
    });

    it('短縮URLにタイムスタンプがあっても抽出できる', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=60')).toBe(
        'dQw4w9WgXcQ',
      );
    });

    it('ハイフン・アンダースコアを含むvideoIdを抽出できる', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=a-B_c1D2E3F'),
      ).toBe('a-B_c1D2E3F');
    });
  });

  describe('異常系: 無効なURLでnullを返す', () => {
    it('空文字列でnullを返す', () => {
      expect(extractVideoId('')).toBeNull();
    });

    it('非YouTubeドメインでnullを返す', () => {
      expect(
        extractVideoId('https://www.example.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('http（非HTTPS）でnullを返す', () => {
      expect(
        extractVideoId('http://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('javascript:プロトコルでnullを返す', () => {
      expect(extractVideoId('javascript:alert(1)')).toBeNull();
    });

    it('data:プロトコルでnullを返す', () => {
      expect(
        extractVideoId('data:text/html,<script>alert(1)</script>'),
      ).toBeNull();
    });

    it('サブドメイン偽装でnullを返す', () => {
      expect(
        extractVideoId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('サブドメイン偽装（www付き）でnullを返す', () => {
      expect(
        extractVideoId('https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('vパラメータが無いURLでnullを返す', () => {
      expect(extractVideoId('https://www.youtube.com/watch')).toBeNull();
    });

    it('videoIdが短すぎる場合nullを返す', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=short'),
      ).toBeNull();
    });

    it('videoIdが長すぎる場合nullを返す', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQextra'),
      ).toBeNull();
    });

    it('videoIdにスラッシュが含まれる場合nullを返す', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9W/XcQ'),
      ).toBeNull();
    });

    it('videoIdに疑問符が含まれる場合nullを返す', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9W?XcQ')).toBeNull();
    });

    it('不正なURL形式でnullを返す', () => {
      expect(extractVideoId('not a url at all')).toBeNull();
    });

    it('XSS試行パターンでnullを返す', () => {
      expect(
        extractVideoId(
          'https://www.youtube.com/watch?v="><script>alert(1)</script>',
        ),
      ).toBeNull();
    });

    it('パーセントエンコードされたvideoIdでnullを返す', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9%2FgXcQ'),
      ).toBeNull();
    });

    it('embedパスにvideoIdが無い場合nullを返す', () => {
      expect(extractVideoId('https://www.youtube.com/embed/')).toBeNull();
    });
  });
});
