/**
 * manifest-resolution.smoke.test.ts — proves the committed class-registration manifest is
 * ALIVE, not just present.
 *
 * The generated manifest (src/generated/mj-class-registrations.ts) exists to defeat
 * tree-shaking: it imports every @RegisterClass-decorated class by name so the decorators
 * actually run in a bundled app. Two failure modes escape the type-checker:
 *   1. STALENESS — a package adds a @RegisterClass class and the committed manifest doesn't
 *      list it (hand-patched in commit 4e00e67fd; caught structurally by the CI freshness
 *      gate in test.yml that regenerates and diffs). This test can't see what's missing,
 *      but…
 *   2. DEAD REGISTRATIONS — an entry that imports fine yet never lands in the ClassFactory
 *      registry (decorator removed/renamed, module evaluated without side effects). That is
 *      what THIS test catches: importing the REAL manifest must leave every entry resolvable
 *      in the live ClassFactory registry.
 *
 * Unlike the unit tests in server-bootstrap.test.ts (which mock the manifest), this file
 * imports the real generated module — it is deliberately heavy (evaluates the full server
 * dependency tree) and is the closest unit-tier analog to the integration tier's
 * class-resolution bundle (CR1–CR5), which covers the DB-driven half of the same seam.
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { CLASS_REGISTRATIONS } from '../generated/mj-class-registrations';

describe('class-registration manifest (real generated module)', () => {
    it('is non-trivial and every entry is a constructor', () => {
        // ServerBootstrap's tree spans 100+ packages; a manifest that shrank to a handful
        // means generation ran against a broken/partial build.
        expect(CLASS_REGISTRATIONS.length).toBeGreaterThan(200);
        for (const cls of CLASS_REGISTRATIONS) {
            expect(typeof cls, `manifest entry ${String(cls)} is not a class/constructor`).toBe('function');
        }
    });

    it('every manifest entry actually landed in the ClassFactory registry', () => {
        const factory = MJGlobal.Instance.ClassFactory;
        // A @RegisterClass(Base, key) registration anchors at its declared BASE class, which
        // may be any ancestor of the registered class — so for each manifest entry, walk its
        // prototype chain and accept a registration whose SubClass is the entry at ANY anchor.
        const isRegistered = (cls: unknown): boolean => {
            let anchor = cls as (new (...args: never[]) => unknown) | null;
            while (typeof anchor === 'function' && anchor.name) {
                if (factory.GetAllRegistrations(anchor).some(r => r.SubClass === cls)) {
                    return true;
                }
                anchor = Object.getPrototypeOf(anchor) as (new (...args: never[]) => unknown) | null;
            }
            // A handful of registrations anchor at Object itself (e.g. the Encryption
            // actions' @RegisterClass(Object, ...)), which a constructor-prototype walk
            // never visits — check that anchor explicitly.
            return factory.GetAllRegistrations(Object).some(r => r.SubClass === cls);
        };
        const missing = CLASS_REGISTRATIONS.filter(cls => !isRegistered(cls)).map(
            cls => (cls as { name?: string }).name ?? String(cls)
        );
        expect(
            missing,
            `Manifest entries with NO live ClassFactory registration (decorator lost?): ${missing.join(', ')}`
        ).toEqual([]);
    });
});
