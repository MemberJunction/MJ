import { describe, it, expect } from 'vitest';
import { CompareVersions, IsNewerThan, ParseVersion } from '../version.js';

describe('ParseVersion', () => {
    it('parses a plain semver', () => {
        expect(ParseVersion('5.51.0')).toEqual({ Major: 5, Minor: 51, Patch: 0 });
    });

    it('tolerates a v prefix, a prerelease tag and build metadata', () => {
        expect(ParseVersion('v5.51.0-beta.2+build.7')).toEqual({ Major: 5, Minor: 51, Patch: 0 });
    });

    it('returns null rather than throwing on garbage', () => {
        // A malformed StandardsVersion must degrade to "treat everything as available" — visible
        // and safe — not crash the tool and block someone's build.
        expect(ParseVersion('not-a-version')).toBeNull();
    });
});

describe('CompareVersions', () => {
    it('orders by major, then minor, then patch', () => {
        expect(CompareVersions('6.0.0', '5.99.99')).toBeGreaterThan(0);
        expect(CompareVersions('5.52.0', '5.51.9')).toBeGreaterThan(0);
        expect(CompareVersions('5.51.1', '5.51.0')).toBeGreaterThan(0);
        expect(CompareVersions('5.51.0', '5.51.0')).toBe(0);
    });

    it('sorts an unparseable version as oldest, so it never hides a check', () => {
        expect(CompareVersions('garbage', '5.51.0')).toBeLessThan(0);
        expect(CompareVersions('5.51.0', 'garbage')).toBeGreaterThan(0);
    });
});

describe('IsNewerThan — the version-sensitivity primitive', () => {
    it('reports a check introduced after the repo adopted', () => {
        expect(IsNewerThan('5.52.0', '5.51.0')).toBe(true);
    });

    it('does NOT report a check introduced at the adopted version', () => {
        // Equal must be false, or every check would look "new" to the repo that just adopted it.
        expect(IsNewerThan('5.51.0', '5.51.0')).toBe(false);
    });

    it('does not report an older check', () => {
        expect(IsNewerThan('5.40.0', '5.51.0')).toBe(false);
    });
});
