/**
 * @fileoverview Minimal ambient types for `@babel/standalone`.
 *
 * `@babel/standalone` ships no TypeScript declarations, and pulling
 * `@types/babel__standalone` in would add a build-time network dependency for a
 * package we only hand to the react-runtime compiler as an opaque instance.
 * This declares just the surface the runtime touches (`transform` + the preset/
 * plugin registries) so the dynamic import in `runtime-loader.ts` type-checks
 * without resorting to `any`.
 */
declare module '@babel/standalone' {
    /** Result of a Babel transform — only `code` is consumed downstream. */
    export interface BabelFileResult {
        code: string | null;
    }

    /** The subset of Babel transform options the runtime passes through. */
    export interface TransformOptions {
        presets?: unknown[];
        plugins?: unknown[];
        filename?: string;
        sourceMaps?: boolean;
        sourceType?: 'script' | 'module' | 'unambiguous';
    }

    /** Transpile source code to executable JavaScript. */
    export function transform(code: string, options?: TransformOptions): BabelFileResult;

    /** Registry of presets available to `transform` (e.g. `react`, `env`). */
    export const availablePresets: Record<string, unknown>;

    /** Registry of plugins available to `transform`. */
    export const availablePlugins: Record<string, unknown>;

    /** The default export mirrors the named members (UMD `Babel` object). */
    const Babel: {
        transform: typeof transform;
        availablePresets: typeof availablePresets;
        availablePlugins: typeof availablePlugins;
    };
    export default Babel;
}
