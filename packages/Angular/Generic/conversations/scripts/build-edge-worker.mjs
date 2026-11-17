/**
 * Bundles `@memberjunction/ng-conversations`'s Edge AI Web Worker (`edge-ai.worker.js`)
 * into a self-contained browser ESM asset at `dist/assets/edge-ai.worker.js`.
 *
 * Consumes `ngc` output (`dist/lib/services/edge-ai/edge-ai.worker.js`) so host apps
 * powered by `@memberjunction/ng-explorer-app` automatically serve `/assets/edge-ai.worker.js`
 * as a lazy Web Worker without requiring per-app `angular.json`, `package.json`, or
 * `app.module.ts` wiring.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const entryFile = resolve(packageRoot, 'dist/lib/services/edge-ai/edge-ai.worker.js');
const outDir = resolve(packageRoot, 'dist/assets');
const outFile = resolve(outDir, 'edge-ai.worker.js');

if (!existsSync(entryFile)) {
    console.error(
        `[build-edge-worker] Compiled worker entry not found at ${entryFile}. ` +
            `Run \`ngc\` before this script.`
    );
    process.exit(1);
}

const require = createRequire(import.meta.url);
let hasTransformers = true;
try {
    require.resolve('@huggingface/transformers/package.json');
} catch {
    hasTransformers = false;
}

mkdirSync(outDir, { recursive: true });

await build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    sourcemap: false,
    // Keep external only when installed with --omit=optional so build stays resilient.
    external: hasTransformers ? [] : ['@huggingface/transformers'],
    logLevel: 'warning',
});
