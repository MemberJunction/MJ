// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import * as publicApi from '../index';
import {
    CLASS_REGISTRATIONS,
    CLASS_REGISTRATIONS_MANIFEST_LOADED,
    CLASS_REGISTRATIONS_COUNT,
    CLASS_REGISTRATIONS_PACKAGES,
} from '../index';

/**
 * This package IS the lite browser class-registration manifest — the thing to test is
 * that the committed manifest is ALIVE (importable, entries are real constructors) and
 * still LITE (the lazy-loaded packages its generator excludes stay excluded).
 *
 * Mirrors packages/ServerBootstrapLite/src/__tests__/manifest-resolution.smoke.test.ts
 * in miniature. Deliberately heavy: importing the real generated manifest evaluates the
 * package's full browser dependency tree, which is exactly the breakage this catches.
 * Browser-safe by construction — it imports nothing beyond the package's own entry.
 */
describe('@memberjunction/ng-bootstrap-lite', () => {
    it('exposes the manifest through the public entry', () => {
        expect(Object.keys(publicApi).length).toBeGreaterThan(0);
        expect(CLASS_REGISTRATIONS_MANIFEST_LOADED).toBe(true);
    });

    it('manifest is non-trivial and every entry is a constructor', () => {
        // The lite tree spans 17 packages / ~500 classes (410 from core-entities alone).
        // A manifest that shrank to a handful means generation ran against a broken build.
        expect(CLASS_REGISTRATIONS.length).toBeGreaterThan(300);
        expect(CLASS_REGISTRATIONS.length).toBe(CLASS_REGISTRATIONS_COUNT);
        for (const cls of CLASS_REGISTRATIONS) {
            expect(typeof cls, `manifest entry ${String(cls)} is not a class/constructor`).toBe('function');
        }
    });

    it('stays lite: the lazy-loaded packages are NOT in the manifest', () => {
        // The generator runs with --exclude-packages for these two so MJExplorer can
        // code-split them; if they reappear here, the eager bundle swallowed them.
        expect(CLASS_REGISTRATIONS_PACKAGES).not.toContain('@memberjunction/ng-dashboards');
        expect(CLASS_REGISTRATIONS_PACKAGES).not.toContain('@memberjunction/ng-explorer-settings');
        expect(CLASS_REGISTRATIONS_PACKAGES.length).toBeGreaterThan(5);
    });
});
