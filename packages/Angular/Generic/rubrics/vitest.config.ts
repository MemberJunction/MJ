import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

/**
 * The model specs stay on the node preset. The component specs render in jsdom.
 * A `*.dom.test.ts` file is the DOM spec the coverage report looks for.
 */
export default defineConfig({
    test: {
        projects: [
            mergeConfig(nodeSharedConfig, defineConfig({
                test: {
                    name: '@memberjunction/ng-rubrics (node)',
                    environment: 'node',
                    exclude: ['**/*.dom.test.ts'],
                },
            })),
            mergeConfig(domSharedConfig, defineConfig({
                test: {
                    name: '@memberjunction/ng-rubrics (dom)',
                    include: ['src/**/*.dom.test.ts'],
                    exclude: ['**/*model.test.ts'],
                },
            })),
        ],
    },
});
