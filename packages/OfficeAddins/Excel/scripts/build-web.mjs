/**
 * Builds the Excel add-in pane into dist/web: bundles the three page scripts with esbuild and copies
 * the static pages, stylesheet and icons beside them. `tsc -p tsconfig.web.json` type-checks first
 * (esbuild does not type-check). @memberjunction/excel-addin-server serves this folder.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist', 'web');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
    entryPoints: {
        taskpane: join(root, 'src/web/taskpane.ts'),
        connect: join(root, 'src/web/connect.ts'),
        connected: join(root, 'src/web/connected.ts'),
    },
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    logLevel: 'warning',
});

cpSync(join(root, 'src/web/static'), outdir, { recursive: true });
console.log(`Excel add-in pane built to ${outdir}`);
