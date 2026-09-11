import { describe, it, expect } from 'vitest';
import { scanText, findTraversals } from '../check-scanner-placement.mjs';

/**
 * The guard behind these tests exists because of issue #4369: two repo-wide compliance
 * scanners lived in packages/MJGlobal/src/__tests__ and therefore ran as
 * `@memberjunction/global#test`, whose turbo cache key covers only MJGlobal's own files.
 * Nine real MetadataSync violations sat behind a replayed `cache hit` for two days.
 *
 * The rule: a test file inside a package may not read paths outside its own package.
 * If it needs to, it is a repo-wide scanner and belongs in .github/guards.
 */

/** Convenience: scan a file sitting at packages/<pkg>/src/__tests__. */
const scanPkgTest = (text, pkg = 'MJGlobal') =>
    scanText(text, `packages/${pkg}/src/__tests__`, `packages/${pkg}`);

describe('findTraversals — locating __dirname-relative path building', () => {
    it('extracts the segments of a path.resolve(__dirname, ...) call', () => {
        const found = findTraversals(`const R = path.resolve(__dirname, '..', '..', '..');`);
        expect(found).toHaveLength(1);
        expect(found[0].segments).toEqual(['..', '..', '..']);
        expect(found[0].line).toBe(1);
    });

    it('extracts a bare join(__dirname, ...) with literal directory names', () => {
        const found = findTraversals(`const M = join(__dirname, '..', '..', '..', '..', 'migrations', 'v5');`);
        expect(found[0].segments).toEqual(['..', '..', '..', '..', 'migrations', 'v5']);
    });

    it('extracts the ESM dirname(fileURLToPath(import.meta.url)) form', () => {
        const found = findTraversals(
            `const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');`
        );
        expect(found[0].segments).toEqual(['..', '..', '..', '..', '..']);
    });

    it('finds nothing in a file that never builds a path from its own location', () => {
        expect(findTraversals(`import { readFileSync } from 'fs';\nreadFileSync('./fixture.json');`)).toEqual([]);
    });
});

describe('scanText — escaping the owning package', () => {
    it('flags a traversal that climbs above the package root', () => {
        // packages/MJGlobal/src/__tests__ + ../../.. === packages/  — the #4369 signature.
        const v = scanPkgTest(`const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..');`);
        expect(v).toHaveLength(1);
        expect(v[0].resolved).toBe('packages');
        expect(v[0].line).toBe(1);
    });

    it('flags a traversal that reaches the repo root and beyond the package', () => {
        const v = scanPkgTest(`const M = join(__dirname, '..', '..', '..', '..', 'migrations', 'v5');`, 'SQLConverter');
        expect(v).toHaveLength(1);
        expect(v[0].resolved).toBe('migrations/v5');
    });

    it('does NOT flag a traversal that stays inside the package', () => {
        // ../.. from src/__tests__ lands on the package root itself — still owned by the package.
        expect(scanPkgTest(`const SRC = path.resolve(__dirname, '..', '..');`)).toEqual([]);
    });

    it('does NOT flag reaching a sibling directory within the package', () => {
        expect(scanPkgTest(`const F = join(__dirname, '..', 'fixtures', 'sample.sql');`)).toEqual([]);
    });

    it('computes depth per file rather than counting `..` — a deeper test may climb further', () => {
        // packages/Foo/src/a/b/__tests__ can go up 4 and still be inside packages/Foo.
        const v = scanText(
            `const R = path.resolve(__dirname, '..', '..', '..', '..');`,
            'packages/Foo/src/a/b/__tests__',
            'packages/Foo'
        );
        expect(v).toEqual([]);
    });

    it('flags a nested-package test that escapes into its parent directory', () => {
        // packages/Angular/Generic/mj-thing owns the test; ../../.. exits into packages/Angular.
        const v = scanText(
            `const R = path.resolve(__dirname, '..', '..', '..');`,
            'packages/Angular/Generic/mj-thing/src/__tests__',
            'packages/Angular/Generic/mj-thing'
        );
        expect(v).toHaveLength(1);
        expect(v[0].resolved).toBe('packages/Angular/Generic');
    });
});

describe('scanText — a widened turbo cache key clears the finding', () => {
    // Remedy 2 in the guard's own message: a package test that reads a shared fixture stays
    // put, and turbo.json declares that tree under "<pkg>#test".inputs with $TURBO_ROOT$.
    // Once the key covers the tree, the read is honest and the guard must go quiet — otherwise
    // it teaches people to annotate instead of fixing.
    it('does not flag a read covered by a $TURBO_ROOT$ input on the package', () => {
        const v = scanText(
            `const SEED = resolve(__dirname, '../../../../../metadata/ai-usage-types/.ai-usage-types.json');`,
            'packages/AI/BaseAIEngine/src/__tests__',
            'packages/AI/BaseAIEngine',
            ['metadata/ai-usage-types']
        );
        expect(v).toEqual([]);
    });

    it('treats the declared tree as a prefix, so a file deep inside it is covered', () => {
        const v = scanText(
            `const D = join(__dirname, '..', '..', '..', '..', 'migrations', 'v5', 'x.sql');`,
            'packages/SQLConverter/src/__tests__',
            'packages/SQLConverter',
            ['migrations/v5']
        );
        expect(v).toEqual([]);
    });

    it('STILL flags a read that lands outside every declared tree', () => {
        const v = scanText(
            `const D = join(__dirname, '..', '..', '..', '..', 'migrations-pg', 'v5');`,
            'packages/SQLConverter/src/__tests__',
            'packages/SQLConverter',
            ['migrations/v5']
        );
        expect(v).toHaveLength(1);
        expect(v[0].resolved).toBe('migrations-pg/v5');
    });

    it('a declared subtree does not cover the whole repo root', () => {
        // `path.resolve(__dirname, '../../../../../')` grabs the repo root; no sane glob covers
        // that, so it must still be reported and annotated by hand.
        const v = scanText(
            `const repoRoot = path.resolve(__dirname, '../../../../../');`,
            'packages/CodeGenLib/src/__tests__/idempotency',
            'packages/CodeGenLib',
            ['migrations', 'metadata/prompts/templates/codegen']
        );
        expect(v).toHaveLength(1);
        expect(v[0].resolved).toBe('.');
    });
});

describe('scanText — allowlist and prose', () => {
    it('respects an inline // scanner-placement-ok: <reason> annotation', () => {
        const v = scanPkgTest(
            `const R = path.resolve(__dirname, '..', '..', '..'); // scanner-placement-ok: reads a shared fixture`
        );
        expect(v).toEqual([]);
    });

    it('requires a reason after the annotation', () => {
        const v = scanPkgTest(`const R = path.resolve(__dirname, '..', '..', '..'); // scanner-placement-ok:`);
        expect(v).toHaveLength(1);
    });

    it('does not flag a traversal written inside a line comment', () => {
        expect(scanPkgTest(`// we used to do path.resolve(__dirname, '..', '..', '..') here`)).toEqual([]);
    });

    it('does not flag a traversal named inside a string literal', () => {
        expect(scanPkgTest(`const why = "path.resolve(__dirname, '..', '..', '..') is banned in packages";`)).toEqual(
            []
        );
    });
});
