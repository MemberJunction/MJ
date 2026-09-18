/**
 * The platform axis is the canonical answer to "may this package be loaded on this tier?".
 * `packages/DynamicPackages/src/discover.ts` and `packages/MJCLI/src/lib/dev-workspace/build.ts`
 * each keep a deliberate copy of this rule; `PLATFORM_ROUTING_CASES` below is the shared table
 * all three are pinned to.
 */
import { describe, it, expect } from 'vitest';
import { ResolvePackagePlatform, PackageRunsOnTier } from '../manifest/package-platform.js';

/** Shared with the copies in DynamicPackages and MJCLI. Keep the three in lockstep. */
export const PLATFORM_ROUTING_CASES: ReadonlyArray<{
    what: string;
    pkg: { role?: string; platform?: 'node' | 'browser' | 'both' };
    server: boolean;
    client: boolean;
}> = [
    { what: 'no role, no platform — the compatible default', pkg: {}, server: true, client: true },
    { what: 'role library (what every BizApp uses)', pkg: { role: 'library' }, server: true, client: true },
    { what: 'role actions defaults to node-only', pkg: { role: 'actions' }, server: true, client: false },
    { what: 'explicit node beats a browser-ish role', pkg: { role: 'components', platform: 'node' }, server: true, client: false },
    { what: 'explicit browser beats the actions default', pkg: { role: 'actions', platform: 'browser' }, server: false, client: true },
    { what: 'explicit both beats the actions default', pkg: { role: 'actions', platform: 'both' }, server: true, client: true },
    { what: 'explicit browser is client-only', pkg: { platform: 'browser' }, server: false, client: true },
];

describe('ResolvePackagePlatform', () => {
    it('defaults to both when nothing is declared', () => {
        expect(ResolvePackagePlatform({})).toBe('both');
    });

    it('defaults role "actions" to node — actions are Node-side by construction', () => {
        expect(ResolvePackagePlatform({ role: 'actions' })).toBe('node');
    });

    it('lets an explicit platform override the role-derived default', () => {
        expect(ResolvePackagePlatform({ role: 'actions', platform: 'browser' })).toBe('browser');
    });

    it('leaves every other role at both', () => {
        for (const role of ['bootstrap', 'engine', 'provider', 'module', 'components', 'library']) {
            expect(ResolvePackagePlatform({ role })).toBe('both');
        }
    });
});

describe('PackageRunsOnTier', () => {
    for (const c of PLATFORM_ROUTING_CASES) {
        it(`${c.what} -> server=${c.server} client=${c.client}`, () => {
            expect(PackageRunsOnTier(c.pkg, 'server')).toBe(c.server);
            expect(PackageRunsOnTier(c.pkg, 'client')).toBe(c.client);
        });
    }
});
