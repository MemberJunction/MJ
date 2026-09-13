/**
 * rig-harness-shim.test.ts — the rigs' harness shim must only forward bindings that exist.
 *
 * `rigs/lib/harness.ts` re-exports a fixed list of names from `@memberjunction/testing-integration`.
 * A named re-export of a binding the source module no longer provides is an ESM **link-time**
 * error, which makes it uniquely nasty:
 *
 *   - it does not fail in the file that is wrong, it fails in every file that imports it;
 *   - it fails before any of that file's own code runs, so the message names the shim, not the rig;
 *   - `tsc` never sees it, because `rigs/` is outside this package's tsconfig `include`;
 *   - no test imported the shim, so nothing ran it.
 *
 * The result was that `createRunQueryFixtures` / `teardownRunQueryFixtures` moved into this
 * package's own `src/checks/runquery-cache.checks.ts`, the stale forwards were left behind, and all
 * six rigs importing the shim died on load — one of them documented the breakage in a comment and
 * routed around it rather than fixing it. This test is the missing signal.
 *
 * The name-by-name check below is NOT redundant with the import test above it, however much it
 * looks it. Vitest transforms the module through Vite rather than linking it as native ESM, so a
 * dead re-export imports cleanly here and only explodes under `npx tsx` — which is exactly how the
 * rigs run. Verified by re-adding a dead binding: the import test passed, the name check failed.
 * Deleting the name check would leave this file green while the rigs stay broken.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SHIM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../rigs/lib/harness.ts');

/** The value names inside the shim's `export { … } from` block, read from the source. */
function reExportedNames(): string[] {
    const source = readFileSync(SHIM_PATH, 'utf8');
    const block = /export \{([\s\S]*?)\} from '@memberjunction\/testing-integration';/.exec(source);
    expect(block, 'shim no longer has a value re-export block — update this test').not.toBeNull();
    return (block as RegExpExecArray)[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim().replace(/,$/, ''))
        .filter((name) => name.length > 0);
}

describe('rigs/lib/harness.ts', () => {
    it('imports without throwing', async () => {
        await expect(import('../../rigs/lib/harness')).resolves.toBeDefined();
    });

    it('forwards a non-trivial set of names', () => {
        // Guards against the regex silently matching nothing and making the next test vacuous.
        expect(reExportedNames().length).toBeGreaterThan(10);
    });

    it('forwards only bindings @memberjunction/testing-integration actually exports', async () => {
        const pkg = await import('@memberjunction/testing-integration');
        const missing = reExportedNames().filter((name) => !(name in pkg));
        // Named so the failure says which binding died and where it went, not just "import failed".
        expect(missing, `harness.ts re-exports name(s) the package no longer provides: ${missing.join(', ')}`).toEqual([]);
    });
});
