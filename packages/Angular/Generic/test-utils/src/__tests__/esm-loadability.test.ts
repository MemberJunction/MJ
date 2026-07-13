import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Regression tests for the extensionless-ESM-specifier bug class from
// https://github.com/MemberJunction/MJ/issues/3137 (markdown-core).
//
// This package is "type": "module", so consumers that load it through Node's
// NATIVE ESM resolver (Vitest externalized deps, plain Node, non-symlinked
// installs) require explicit .js extensions on relative specifiers in dist/.
// Bundlers and Vite's transform pipeline tolerate extensionless specifiers,
// which is exactly why this failure stays hidden until a native-ESM consumer
// hits it. These tests spawn a real Node process to import the built entry
// point the way such a consumer would.

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distEntry = resolve(packageRoot, 'dist', 'public-api.js');

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

    it('dist/public-api.js loads under Node\'s native ESM resolver without ERR_MODULE_NOT_FOUND', () => {
        const output = importDistInNativeNode(
            `import(${JSON.stringify(distEntry)}).then(() => console.log('ok'));`
        );
        expect(output.trim()).toBe('ok');
    });

    it('exposes the public API through a native ESM import', () => {
        const output = importDistInNativeNode(
            `import(${JSON.stringify(distEntry)}).then(m => console.log(JSON.stringify(Object.keys(m))));`
        );
        const exportedKeys: string[] = JSON.parse(output.trim());
        // One representative export per source module re-exported from public-api.ts
        for (const key of [
            'renderComponentFixture',  // lib/render-component-fixture
            'renderTemplate',          // lib/render-template
            'query',                   // lib/dom-helpers
            'createFakeProvider',      // lib/fake-provider
            'useFakeGlobalProvider',   // lib/global-provider
        ]) {
            expect(exportedKeys).toContain(key);
        }
    });
});
