import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * Dual-preset layout, as in ng-livekit-room:
 *   - **node**: any `src/__tests__/**` logic specs. Excludes `*.dom.test.ts`.
 *   - **dom**: the `*.dom.test.ts` fixture specs (jsdom, analog, zoneless TestBed). They compile only the files
 *     `tsconfig.spec.json` lists; the generic room comes from its build, driven by a fake room controller, so no
 *     `livekit-client` connection or media is involved.
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-mj-livekit-room (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-mj-livekit-room (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
