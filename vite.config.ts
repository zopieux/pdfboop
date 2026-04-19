import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import { macaronVitePlugin } from '@macaron-css/vite';

export default defineConfig({
  plugins: [macaronVitePlugin(), solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['node_modules/@testing-library/jest-dom/vitest'],
    isolate: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.direnv/**', '**/result/**'],
  },
});
