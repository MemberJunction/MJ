import { describe, it, expect } from 'vitest';
import { computeUnmappedFields, hasUnmappedFields, CUSTOM_OVERFLOW_COLUMN } from '../CustomOverflow.js';

describe('CustomOverflow', () => {
    describe('CUSTOM_OVERFLOW_COLUMN', () => {
        it('uses the __mj_integration_* system-column naming convention', () => {
            // Same family as __mj_integration_ContentHash — a hidden backend system field,
            // never user-facing metadata.
            expect(CUSTOM_OVERFLOW_COLUMN).toBe('__mj_integration_CustomOverflow');
            expect(CUSTOM_OVERFLOW_COLUMN.startsWith('__mj_integration_')).toBe(true);
        });
    });

    describe('computeUnmappedFields', () => {
        it('returns an empty object when every source key is mapped', () => {
            const mapped = new Set(['FirstName', 'LastName']);
            const out = computeUnmappedFields({ FirstName: 'Alice', LastName: 'Smith' }, mapped);
            expect(out).toEqual({});
        });

        it('returns only the keys with no field map', () => {
            const mapped = new Set(['FirstName']);
            const out = computeUnmappedFields(
                { FirstName: 'Alice', WeirdCustom: 'x', Another: 42 },
                mapped
            );
            expect(out).toEqual({ WeirdCustom: 'x', Another: 42 });
        });

        it('returns every key when nothing is mapped', () => {
            const out = computeUnmappedFields({ A: 1, B: 2 }, new Set<string>());
            expect(out).toEqual({ A: 1, B: 2 });
        });

        it('preserves falsy and structured values verbatim', () => {
            const mapped = new Set<string>();
            const out = computeUnmappedFields(
                { zero: 0, no: false, empty: '', nested: { k: 'v' }, list: [1, 2] },
                mapped
            );
            expect(out).toEqual({ zero: 0, no: false, empty: '', nested: { k: 'v' }, list: [1, 2] });
        });

        it('excludes a key even when it carries a null value, if mapped', () => {
            const mapped = new Set(['Phone']);
            const out = computeUnmappedFields({ Phone: null, Extra: 'keep' }, mapped);
            expect(out).toEqual({ Extra: 'keep' });
        });
    });

    describe('hasUnmappedFields', () => {
        it('is false for undefined / null / empty', () => {
            expect(hasUnmappedFields(undefined)).toBe(false);
            expect(hasUnmappedFields(null)).toBe(false);
            expect(hasUnmappedFields({})).toBe(false);
        });

        it('is true when at least one key is present', () => {
            expect(hasUnmappedFields({ a: 1 })).toBe(true);
        });
    });
});
