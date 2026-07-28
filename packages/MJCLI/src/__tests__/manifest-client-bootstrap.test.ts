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
        expect(out).toContain('(globalThis as Record<string, unknown>).__mjOpenAppClientModules = OPEN_APP_CLIENT_MODULES;');
        // No `any` and therefore no eslint escape hatch in generated output.
        expect(out).not.toContain('any');
        expect(out).not.toContain('eslint-disable');
        expect(out).toContain('BEGIN Open App client bootstrap');
        expect(out).toContain('END Open App client bootstrap');
        // Original manifest content is preserved.
        expect(out).toContain('export const CLASS_REGISTRATIONS = [];');
    });

    it('emits a disabled package as a comment, not an import', () => {
        const out = applyOpenAppClientBootstrapBlock(BASE, [{ PackageName: '@acme/a-ng', Enabled: false }]);
        expect(out).not.toContain("from '@acme/a-ng'");
        expect(out).toContain("// '@acme/a-ng' disabled by");
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
