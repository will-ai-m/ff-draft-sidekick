import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Dev-server proxy sends `/api` and `/events` to the Express process, so neither
 * dev nor the single-process production launch (`npm start`) ever hits CORS.
 * Keep the target port in step with `packages/server/src/index.ts` (PORT env, default 3001).
 */
const SERVER_ORIGIN = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: SERVER_ORIGIN, changeOrigin: true },
      '/events': { target: SERVER_ORIGIN, changeOrigin: true },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
