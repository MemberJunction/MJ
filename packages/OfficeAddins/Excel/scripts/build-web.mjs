/**
 * Builds the Excel add-in pane and custom functions runtime into dist/web:
 * - Bundles taskpane, connect, and connected page scripts (ESM)
 * - Bundles functions.js (IIFE) and writes functions.json for Excel Custom Functions (=MJ.QUERY, =MJ.VIEW)
 * - Copies static HTML pages, stylesheet, and icons beside them.
 * `tsc -p tsconfig.web.json` type-checks first (esbuild does not type-check).
 * @memberjunction/excel-addin-server serves this folder.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildExcelCustomFunctionsMetadata } from '../dist/custom-functions.js';

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

await build({
    entryPoints: {
        functions: join(root, 'src/web/functions.ts'),
    },
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    logLevel: 'warning',
});

cpSync(join(root, 'src/web/static'), outdir, { recursive: true });
writeFileSync(
    join(outdir, 'functions.json'),
    `${JSON.stringify(BuildExcelCustomFunctionsMetadata(), null, 2)}\n`,
    'utf-8',
);
console.log(`Excel add-in pane and custom functions built to ${outdir}`);
