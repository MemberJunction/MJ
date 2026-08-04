import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Self-contained Vitest config for the React Native mobile app.
 *
 * RN/Metro transforms differ from the rest of the monorepo, so this package is
 * intentionally NOT wired into the root vitest.config.ts. Tests target pure
 * logic modules; react-native / expo / MMKV are mocked per-test (or in setup.ts)
 * where a module under test transitively imports them.
 */
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            // Mirror tsconfig `paths`: "@/*" -> "./src/*"
            '@': srcDir,
            // The real react-native entry is Flow-typed JS Vite can't parse and is a
            // native module. Alias it to a lightweight stub for the pure-UI tests.
            'react-native': fileURLToPath(new URL('./src/__tests__/rn-stub.ts', import.meta.url)),
        },
    },
    // html-renderer.tsx uses JSX; use the automatic runtime (react/jsx-runtime).
    esbuild: { jsx: 'automatic' },
    test: {
        name: '@memberjunction/mobile-app',
        environment: 'node',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        include: ['src/__tests__/**/*.test.{ts,tsx}'],
    },
});
