import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build also works from a sub-path (GitHub Pages in M0.3).
  base: './',
  build: {
    // Phaser alone is ~1.3 MB minified; this is expected, not a problem.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    // Listen on the local network too, so the game can be opened on a phone.
    host: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
