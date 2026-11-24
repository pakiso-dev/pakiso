import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // These require a live PostgreSQL/MySQL instance and a dialect-specific
    // generated client; run explicitly via `pnpm test:postgresql`/`test:mysql`.
    exclude: [
      ...defaultExclude,
      'src/postgresql.conformance.test.ts',
      'src/mysql.conformance.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['generated/**', 'dist/**', '**/*.config.ts', '**/*.test.ts'],
    },
  },
});
