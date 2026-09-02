import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      'next/image': fileURLToPath(
        new URL('./test/next-image.tsx', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 10_000,
    include: [
      'lib/**/*.test.ts',
      'components/**/*.test.tsx',
      'evals/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/places/**/*.ts'],
      exclude: ['lib/places/**/*.test.ts', 'lib/places/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
});
