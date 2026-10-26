import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works on GitHub Pages sub-paths and inside Tauri.
  base: './',
  build: {
    outDir: 'dist',
    // Phaser alone is ~1.2 MB minified; that is expected for this project.
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
    // The on-disk module cache does not notice JSON files added to an import.meta.glob
    // (new sprites, maps), which makes data tests go stale. Startup is fast without it.
    fsModuleCache: false,
  },
});
