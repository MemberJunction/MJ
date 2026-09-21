import { describe, it, expect } from 'vitest';
import { buildAppProfile } from '../test-driver/ComputerUseTestDriver.js';
import type { ComputerUseTestConfig } from '../test-driver/types.js';

/**
 * The MJ Explorer app profile. This is the only place MJ-specific signals are
 * named — the Layer-1 engine polls what the profile declares and nothing else.
 *
 * `Loop.VolatileParams` is load-bearing in two places, and an empty list breaks
 * both: recorded URL patterns are compared after stripping these params, so a
 * per-login token (Auth0's `state`) makes a step's postcondition unmatchable
 * forever; and state signatures are built from the same normalized URL, so a
 * per-visit token makes every visit look new and hides a navigation loop.
 */
describe('buildAppProfile', () => {
    const config: ComputerUseTestConfig = {};

    it('declares the identity-provider one-time params as volatile', () => {
        // Auth0 stamps a fresh `state` on every login transaction, so a URL
        // carrying it can never be matched against a previously recorded one.
        expect(buildAppProfile(config).Loop?.VolatileParams).toContain('state');
    });

    it('lets a test override which params are volatile', () => {
        const profile = buildAppProfile({ appProfile: { volatileParams: ['sessionToken'] } });
        expect(profile.Loop?.VolatileParams).toEqual(['sessionToken']);
    });

    it('honors an empty override so URLs are compared verbatim', () => {
        // `[]` is a deliberate choice, not an absent value — it must not fall
        // back to the identity-provider defaults.
        expect(buildAppProfile({ appProfile: { volatileParams: [] } }).Loop?.VolatileParams).toEqual([]);
    });
});
