import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * Dual-preset layout, as in ng-livekit-room:
 *   - **node**: `src/__tests__/**` (the import-boundary check). Excludes `*.dom.test.ts`.
 *   - **dom**: the `*.dom.test.ts` fixture specs next to each component (jsdom, analog, zoneless TestBed).
 *     They compile only the files `tsconfig.spec.json` lists, and use element video sources, so no real
 *     media is involved. Media itself is checked live, never faked (see ANGULAR_TESTING_GUIDE §7).
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-realtime-media (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-realtime-media (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
