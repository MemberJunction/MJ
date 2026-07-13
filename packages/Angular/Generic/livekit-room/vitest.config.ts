import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * Dual-preset layout. livekit-room already ships pure-logic class specs under
 * `src/__tests__/` (controller logic, whiteboard-sync, component class tests) that run
 * fastest as plain node specs — several mock `@angular/core`, which can't survive the
 * Angular AOT compile path. So we run TWO vitest projects in one package:
 *   - **node** — the existing `src/__tests__/**` logic specs, unchanged. Excludes
 *     `*.dom.test.ts`.
 *   - **dom**  — the `*.dom.test.ts` fixture specs for the media-free leaf components
 *     (jsdom + analog + zoneless TestBed). Excludes `__tests__/**` so the node specs
 *     never run under the Angular compile path.
 *
 * The DOM project AOT-compiles only the files listed in `tsconfig.spec.json` — a
 * deliberately narrow set (the pure @Input/@Output leaf components), so `livekit-client`
 * / media / the room container are never pulled into the compile. Media is live-tested,
 * never faked (see ANGULAR_TESTING_GUIDE §7).
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        nodeSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-livekit-room (node)',
            environment: 'node',
            exclude: ['**/*.dom.test.ts'],
          },
        }),
      ),
      mergeConfig(
        domSharedConfig,
        defineConfig({
          test: {
            name: '@memberjunction/ng-livekit-room (dom)',
            include: ['src/**/*.dom.test.ts'],
            exclude: ['**/__tests__/**'],
          },
        }),
      ),
    ],
  },
});
