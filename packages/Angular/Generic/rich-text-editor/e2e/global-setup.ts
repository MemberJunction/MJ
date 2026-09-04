/**
 * Bundle the engine for the browser harness.
 *
 * The package's `dist/` is ES2022 modules with bare imports (`dompurify`), which a static page
 * cannot load without an import map or a bundler. esbuild folds the engine and DOMPurify into
 * one IIFE that exposes `window.MJRichText`, and writes the harness page beside it.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

const HARNESS_DIR = path.resolve(__dirname, '.harness');

export default async function globalSetup(): Promise<void> {
    mkdirSync(HARNESS_DIR, { recursive: true });
    await build({
        entryPoints: [path.resolve(__dirname, 'harness-entry.ts')],
        bundle: true,
        format: 'iife',
        target: 'es2022',
        outfile: path.resolve(HARNESS_DIR, 'engine.bundle.js'),
        sourcemap: 'inline',
        logLevel: 'silent',
    });
    writeFileSync(
        path.resolve(HARNESS_DIR, 'index.html'),
        [
            '<!doctype html>',
            '<html><head><meta charset="utf-8"><title>rich-text-editor harness</title>',
            '<style>body{font:16px/1.5 sans-serif;margin:24px}#root{min-height:200px;border:1px solid #999;padding:12px}</style>',
            '</head><body>',
            '<div id="root"></div>',
            '<script src="./engine.bundle.js"></script>',
            '</body></html>',
            '',
        ].join('\n'),
    );
}
