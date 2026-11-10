/**
 * `HardenNunjucksRuntime` runs the canary whenever it installs a guard, and lets the canary's error out.
 * The canary is replaced here so the test can count its calls and make it fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import nunjucks from 'nunjucks';

const canary = vi.hoisted(() => ({ assert: vi.fn() }));
vi.mock('../NunjucksSandboxCanary', () => ({ AssertNunjucksSandboxIsEffective: canary.assert }));

import { HardenNunjucksRuntime } from '../NunjucksSandbox';

const runtime = (nunjucks as unknown as { runtime: { memberLookup: (obj: unknown, val: unknown) => unknown } }).runtime;
const unguardedMemberLookup = runtime.memberLookup;

describe('HardenNunjucksRuntime: canary on install', () => {
    beforeEach(() => {
        canary.assert.mockReset();
    });

    it('runs the canary once when it installs the guards, and not again while they are in place', () => {
        HardenNunjucksRuntime();
        expect(canary.assert).toHaveBeenCalledTimes(1);
        HardenNunjucksRuntime();
        HardenNunjucksRuntime();
        expect(canary.assert).toHaveBeenCalledTimes(1);
    });

    it('runs the canary again after a guarded hook was replaced', () => {
        HardenNunjucksRuntime();
        canary.assert.mockReset();
        runtime.memberLookup = unguardedMemberLookup;
        HardenNunjucksRuntime();
        expect(canary.assert).toHaveBeenCalledTimes(1);
    });

    it('throws what the canary throws, so an ineffective sandbox is loud', () => {
        HardenNunjucksRuntime();
        runtime.memberLookup = unguardedMemberLookup;
        canary.assert.mockImplementation(() => { throw new Error('sandbox is not in effect'); });
        expect(() => HardenNunjucksRuntime()).toThrow('sandbox is not in effect');
    });
});
