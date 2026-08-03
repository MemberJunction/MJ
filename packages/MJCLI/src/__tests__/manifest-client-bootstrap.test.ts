/**
 * Tests for applyOpenAppClientBootstrapBlock — the pure transform behind
 * `mj codegen manifest --open-app-client-bootstrap`. It refreshes a delimited block of
 * REFERENCED namespace imports (one per Open App client package in mj.config
 * dynamicPackages.client) at the end of MJExplorer's class-registrations manifest, so
 * the client load mechanism lives in distributed packages rather than a bespoke
 * MJExplorer file. Namespace imports (not bare `import '<pkg>'`) are used so the
 * @RegisterClass side effects survive production tree-shaking even when a package
 * declares "sideEffects": false.
 */
import { describe, it, expect } from 'vitest';
import { applyOpenAppClientBootstrapBlock } from '../commands/codegen/manifest.js';

const BASE = `// generated manifest\nexport const CLASS_REGISTRATIONS = [];\n`;

describe('applyOpenAppClientBootstrapBlock', () => {
    it('appends a referenced namespace import per enabled client package in a delimited block', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [
            { PackageName: '@acme/a-ng', Enabled: true },
            { PackageName: '@acme/b-ng', Enabled: true },
        ]);
        // Namespace imports, not bare side-effect imports (which sideEffects:false would drop).
        expect(out).toContain("import * as __openAppClient0 from '@acme/a-ng';");
        expect(out).toContain("import * as __openAppClient1 from '@acme/b-ng';");
        expect(out).not.toContain("import '@acme/a-ng';");
        // The anchor: exported array references every namespace + observable global assignment.
        expect(out).toContain('export const OPEN_APP_CLIENT_MODULES: unknown[] = [__openAppClient0, __openAppClient1];');
        expect(out).toContain("(globalThis as Record<string, unknown>)['__mjOpenAppClientModules'] = OPEN_APP_CLIENT_MODULES;");
        // No `any` and therefore no eslint escape hatch in generated output.
        expect(out).not.toContain('any');
        expect(out).not.toContain('eslint-disable');
        expect(out).toContain('BEGIN Open App client bootstrap');
        expect(out).toContain('END Open App client bootstrap');
        // Original manifest content is preserved.
        expect(out).toContain('export const CLASS_REGISTRATIONS = [];');
    });

    it('writes the globalThis anchor with bracket access — dot access is TS4111 in the host build', () => {
        // MJExplorer's tsconfig sets `noPropertyAccessFromIndexSignature: true`, so
        // `(globalThis as Record<string, unknown>).__mjOpenAppClientModules = …` is a hard
        // compile error in its production `ng build` — the host-app build break this whole
        // block's tests otherwise cannot see, since the block is emitted only when an Open
        // App client package is installed. Verified live: with one installed client package,
        // `ng build` failed with TS4111 on this exact line and went green on the bracket form.
        const out = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: true }]);
        expect(out).toContain("(globalThis as Record<string, unknown>)['__mjOpenAppClientModules']");
        expect(out).not.toContain(').__mjOpenAppClientModules');
    });

    it('emits a disabled package as a comment, not an import', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: false }]);
        expect(out).not.toContain("from '@acme/a-ng'");
        expect(out).toContain("// '@acme/a-ng' disabled by");
    });

    it('numbers aliases off the array position, so a disabled entry cannot orphan a reference', () => {
        // The regression this guards: the alias index and OPEN_APP_CLIENT_MODULES must share
        // one counter. If the alias were numbered off the ENTRY index while the array only
        // collected enabled entries, a leading disabled package would emit
        // `[__openAppClient1]` with only `__openAppClient1` declared — or, under any future
        // skew between the two, an array element naming a variable that does not exist.
        // That is a TS2304 in the host app's build, not a test failure, so it is worth pinning.
        const out = applyOpenAppClientBootstrapBlock(BASE, [
            { PackageName: '@acme/disabled-ng', Enabled: false },
            { PackageName: '@acme/enabled-ng', Enabled: true },
        ]);

        expect(out).toContain("// '@acme/disabled-ng' disabled by");
        expect(out).not.toContain("from '@acme/disabled-ng'");
        expect(out).toContain("import * as __openAppClient0 from '@acme/enabled-ng';");
        expect(out).toContain('export const OPEN_APP_CLIENT_MODULES: unknown[] = [__openAppClient0];');

        // Every alias the array references must actually be declared by an import above it.
        const declared = new Set(Array.from(out.matchAll(/import \* as (__openAppClient\d+) from/g), m => m[1]));
        const referenced = (out.match(/OPEN_APP_CLIENT_MODULES: unknown\[\] = \[(.*)\];/)?.[1] ?? '')
            .split(',').map(s => s.trim()).filter(Boolean);
        expect(referenced.length).toBeGreaterThan(0);
        for (const ref of referenced) expect(declared.has(ref)).toBe(true);
        expect(declared.size).toBe(referenced.length);
    });

    it('keeps alias numbering contiguous across several interleaved disabled entries', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [
            { PackageName: '@acme/a-ng', Enabled: false },
            { PackageName: '@acme/b-ng', Enabled: true },
            { PackageName: '@acme/c-ng', Enabled: false },
            { PackageName: '@acme/d-ng', Enabled: true },
        ]);
        expect(out).toContain("import * as __openAppClient0 from '@acme/b-ng';");
        expect(out).toContain("import * as __openAppClient1 from '@acme/d-ng';");
        expect(out).toContain('export const OPEN_APP_CLIENT_MODULES: unknown[] = [__openAppClient0, __openAppClient1];');
        expect(out).not.toContain('__openAppClient2');
    });

    it('emits an empty anchor when every entry is disabled (no dangling reference)', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [
            { PackageName: '@acme/a-ng', Enabled: false },
            { PackageName: '@acme/b-ng', Enabled: false },
        ]);
        expect(out).toContain('export const OPEN_APP_CLIENT_MODULES: unknown[] = [];');
        expect(out).not.toContain('__openAppClient');
        expect(out).toContain('BEGIN Open App client bootstrap');
    });

    it('is idempotent — applying the same entries twice yields identical content', () => {
        const entries = [{ PackageName: '@acme/a-ng', Enabled: true }];
        const once = applyOpenAppClientBootstrapBlock(BASE, entries);
        const twice = applyOpenAppClientBootstrapBlock(once, entries);
        expect(twice).toBe(once);
    });

    it('replaces a stale block when the entry set changes (no leftover imports)', () => {
        const first = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/old-ng', Enabled: true }]);
        const second = applyOpenAppClientBootstrapBlock(first, [{ PackageName: '@acme/new-ng', Enabled: true }]);
        expect(second).toContain("import * as __openAppClient0 from '@acme/new-ng';");
        expect(second).not.toContain('@acme/old-ng');
        // Exactly one managed block.
        expect(second.match(/BEGIN Open App client bootstrap/g)?.length).toBe(1);
    });

    it('removes the block entirely when there are no client entries', () => {
        const withBlock = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: true }]);
        const cleared = applyOpenAppClientBootstrapBlock(withBlock, []);
        expect(cleared).not.toContain('Open App client bootstrap');
        expect(cleared).not.toContain('@acme/a-ng');
        expect(cleared).toContain('export const CLASS_REGISTRATIONS = [];');
    });
});
