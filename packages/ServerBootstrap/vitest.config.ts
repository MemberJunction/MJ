import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: { provider: 'v8', enabled: false },
    // The manifest-resolution smoke test imports the REAL generated manifest, whose
    // dependency tree includes @memberjunction/server — and MJServer's config module
    // validates DB settings at import time (loadConfig throws on missing values).
    // These dummies satisfy the schema so the import graph can evaluate; no test in
    // this package ever opens a connection.
    env: {
      DB_HOST: 'localhost',
      DB_DATABASE: 'manifest-smoke-dummy',
      DB_USERNAME: 'manifest-smoke-dummy',
      DB_PASSWORD: 'manifest-smoke-dummy',
      CODEGEN_DB_USERNAME: 'manifest-smoke-dummy',
      CODEGEN_DB_PASSWORD: 'manifest-smoke-dummy',
      DB_TRUST_SERVER_CERTIFICATE: 'true',
    },
  },
});
