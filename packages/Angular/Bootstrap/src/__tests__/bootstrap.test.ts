import { describe, it, expect } from 'vitest';
import {
    CLASS_REGISTRATIONS,
    CLASS_REGISTRATIONS_MANIFEST_LOADED,
    CLASS_REGISTRATIONS_COUNT,
    CLASS_REGISTRATIONS_PACKAGES,
} from '../public-api';

/**
 * The FULL browser class-registration manifest must be ALIVE (importable, entries are
 * real constructors) and complete — unlike the lite variant, it deliberately includes
 * the lazy-loaded feature packages so a non-code-split app registers everything eagerly.
 *
 * Mirrors packages/ServerBootstrapLite/src/__tests__/manifest-resolution.smoke.test.ts
 * in miniature. Deliberately heavy: importing the real generated manifest evaluates the
 * full browser dependency tree, which is exactly the breakage this catches.
 */
describe('@memberjunction/ng-bootstrap class-registration manifest', () => {
    it('loads the manifest and it is non-trivial with constructor entries', () => {
        expect(CLASS_REGISTRATIONS_MANIFEST_LOADED).toBe(true);
        // The full tree spans ~600 classes; a manifest that shrank to a handful means
        // generation ran against a broken/partial build.
        expect(CLASS_REGISTRATIONS.length).toBeGreaterThan(400);
        expect(CLASS_REGISTRATIONS.length).toBe(CLASS_REGISTRATIONS_COUNT);
        for (const cls of CLASS_REGISTRATIONS) {
            expect(typeof cls, `manifest entry ${String(cls)} is not a class/constructor`).toBe('function');
        }
    });

    it('is the FULL manifest: lazy-loaded feature packages are included', () => {
        // This is what distinguishes ng-bootstrap from ng-bootstrap-lite, whose
        // generator excludes these two so MJExplorer can code-split them.
        expect(CLASS_REGISTRATIONS_PACKAGES).toContain('@memberjunction/ng-dashboards');
        expect(CLASS_REGISTRATIONS_PACKAGES).toContain('@memberjunction/ng-explorer-settings');
    });

    it('excludes server-only packages that would poison the browser bundle', () => {
        // A server-only package in this BROWSER manifest breaks the cold MJExplorer build (esbuild
        // "Could not resolve 'crypto'/'stream'"). This turns the June-2026 incident class
        // (ng-bootstrap → templates → aiengine flooding the manifest with 27 server packages) into a
        // unit failure instead of a cold-build failure. See packages/Angular/Bootstrap/CLAUDE.md.
        const leaked = SERVER_ONLY_POISON.filter(p => CLASS_REGISTRATIONS_PACKAGES.includes(p));
        expect(leaked, `server-only packages leaked into the browser manifest: ${leaked.join(', ')}`).toEqual([]);
    });
});

/** Packages that import Node built-ins — never valid in a browser manifest (Bootstrap/CLAUDE.md). */
const SERVER_ONLY_POISON = [
    '@memberjunction/aiengine',
    '@memberjunction/ai-provider-bundle',
    '@memberjunction/ai-vectors-pinecone',
    '@memberjunction/storage',
    '@memberjunction/templates',
    '@memberjunction/server',
    '@memberjunction/ai-agents',
    '@memberjunction/ai-prompts',
    '@memberjunction/communication-engine',
    '@memberjunction/content-autotagging',
];
