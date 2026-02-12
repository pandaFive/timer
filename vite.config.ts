import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // 開発時はCSPメタタグを除外（HMR用のws:接続が必要なため）
    mode === 'development'
      ? {
          name: 'remove-csp-in-dev',
          transformIndexHtml(html: string) {
            return html.replace(
              /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi,
              '',
            );
          },
        }
      : undefined,
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
}));
