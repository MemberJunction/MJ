import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config for the mobile app's LIVE integration suite.
 *
 * Unlike the unit config (vitest.config.ts), these tests do NOT mock
 * @memberjunction/core — they exercise the real data/service layer against a
 * live MJAPI (GraphQL at http://localhost:4001/graphql). The suite is gated on
 * `MJ_TEST_JWT`: with no token (or an unreachable backend) every describe block
 * skips gracefully, so this config is safe to run in CI.
 *
 * We reuse the unit suite's `react-native` -> stub alias so any service module
 * that transitively imports react-native still loads under Node.
 */
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            // Mirror tsconfig `paths`: "@/*" -> "./src/*"
            '@': srcDir,
            // The real react-native entry is Flow-typed JS Vite can't parse and is a
            // native module. Alias it to the same lightweight stub the unit suite uses.
            'react-native': fileURLToPath(new URL('./src/__tests__/rn-stub.ts', import.meta.url)),
        },
    },
    esbuild: { jsx: 'automatic' },
    test: {
        name: '@memberjunction/mobile-app (integration)',
        environment: 'node',
        globals: true,
        // `.itest.ts` (not `.test.ts`) so the unit config's `**/*.test.ts`
        // include never collects these live tests.
        include: ['src/__tests__/integration/**/*.itest.ts'],
        // Live agent runs can take a while; give the suite generous headroom.
        // Individual fast tests still finish quickly; only the opt-in agent-send
        // test approaches this ceiling.
        testTimeout: 120_000,
        hookTimeout: 60_000,
        // Live provider setup mutates process-global singletons (the GraphQL
        // provider, Metadata). Run integration files serially to avoid cross-file
        // interference.
        fileParallelism: false,
    },
});
