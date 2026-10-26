import { describe, expect, it } from 'vitest';
import { ObjectKeyResolutionError, ResolveObjectKey } from '../extract/DurableCopy.js';

describe('ResolveObjectKey', () => {
    it('substitutes every placeholder', () => {
        const key = ResolveObjectKey('{TenantID}/{ContentSourceID}/{RecordID}-{Name}', {
            TenantID: 'T1',
            ContentSourceID: 'S1',
            RecordID: 'R1',
            Name: 'report',
        });
        expect(key).toBe('T1/S1/R1-report');
    });

    it('leaves a template with no placeholders alone', () => {
        expect(ResolveObjectKey('fixed/path', {})).toBe('fixed/path');
    });
});

describe('ResolveObjectKey — failing closed', () => {
    it('REFUSES a missing placeholder rather than writing to a partial path', () => {
        // Writing one tenant's bytes to an unnamespaced path is worse than not writing them.
        expect(() =>
            ResolveObjectKey('{TenantID}/{ContentSourceID}/{RecordID}', {
                ContentSourceID: 'S1',
                RecordID: 'R1',
            }),
        ).toThrow(ObjectKeyResolutionError);
    });

    it('refuses an EMPTY placeholder value too', () => {
        expect(() => ResolveObjectKey('{TenantID}/x', { TenantID: '' })).toThrow(ObjectKeyResolutionError);
    });

    it('refuses a null placeholder value', () => {
        expect(() => ResolveObjectKey('{TenantID}/x', { TenantID: null })).toThrow(ObjectKeyResolutionError);
    });

    it('names every missing placeholder, so one fix round-trips', () => {
        expect(() => ResolveObjectKey('{A}/{B}/{C}', { B: 'b' })).toThrow(/'A', 'C'/);
    });
});

describe('ResolveObjectKey — segment safety', () => {
    it('stops a value breaking out of its path segment', () => {
        const key = ResolveObjectKey('{TenantID}/x', { TenantID: 'a/../../b' });
        expect(key).not.toContain('..');
        expect(key.split('/')).toHaveLength(2);
    });

    it('collapses embedded separators', () => {
        expect(ResolveObjectKey('{Name}', { Name: 'a/b\\c' })).toBe('a_b_c');
    });
});
