import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Regression tests for https://github.com/MemberJunction/MJ/issues/3137
//
// This package is published with "type": "module", so Node's NATIVE ESM
// resolver loads dist/. Native ESM requires explicit file extensions on
// relative specifiers — bundlers (esbuild/webpack) tolerate extensionless
// imports, so only a real `node` process exercises the failure mode.
// These tests spawn Node out-of-process to import the built entry point
// exactly the way a downstream native-ESM consumer (or Vitest) would.

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distEntry = resolve(packageRoot, 'dist', 'index.js');
// import() needs a URL, not a raw filesystem path: on Windows a raw absolute
// path (C:\...) is rejected as ERR_UNSUPPORTED_ESM_URL_SCHEME.
const distEntryUrl = pathToFileURL(distEntry).href;

/** Import the built entry in a fresh native-ESM Node process and return what it prints. */
function importDistInNativeNode(script: string): string {
    return execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        { encoding: 'utf-8' }
    );
}

describe('native ESM loadability of the built package (dist/)', () => {
    it('has a built dist/ to test against (run npm run build first if this fails)', () => {
        expect(existsSync(distEntry)).toBe(true);
    });

    it('imports dist via a portable file:// URL (raw drive-letter paths break on Windows)', () => {
        // A raw absolute path is fine on POSIX but on Windows becomes e.g.
        // C:\...\dist\index.js, which Node's ESM loader rejects as
        // ERR_UNSUPPORTED_ESM_URL_SCHEME (it parses "C:" as a URL scheme).
        // pathToFileURL produces a file:// URL that loads on every platform.
        expect(distEntryUrl.startsWith('file://')).toBe(true);
    });

    it('dist/index.js loads under Node\'s native ESM resolver without ERR_MODULE_NOT_FOUND', () => {
        const output = importDistInNativeNode(
            `import(${JSON.stringify(distEntryUrl)}).then(() => console.log('ok'));`
        );
        expect(output.trim()).toBe('ok');
    });

    it('exposes the public API through a native ESM import', () => {
        const output = importDistInNativeNode(
            `import(${JSON.stringify(distEntryUrl)}).then(m => console.log(JSON.stringify(Object.keys(m))));`
        );
        const exportedKeys: string[] = JSON.parse(output.trim());
        // One representative export per source module re-exported from index.ts
        for (const key of [
            'MarkdownEngine',              // engine/markdown-engine
            'createSvgRendererExtension',  // extensions/svg-renderer.extension
            'createCollapsibleHeadingsExtension', // extensions/collapsible-headings.extension
            'createHtmlBlockRepairExtension',     // extensions/html-block-repair.extension
            'formatLanguageName',          // helpers/language
            'escapeHtml',                  // helpers/escape
            'DEFAULT_MARKDOWN_CONFIG',     // types/markdown.types
        ]) {
            expect(exportedKeys).toContain(key);
        }
    });
});
