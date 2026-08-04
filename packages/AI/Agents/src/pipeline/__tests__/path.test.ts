import { describe, it, expect } from 'vitest';
import { getValue, getValues, fieldNames } from '../path';

const doc = { Results: [{ Status: 'ok', n: 1 }, { Status: 'bad', n: 2 }], Customer: { Email: 'a@b.com' }, Count: 2 };

describe('path', () => {
    it('resolves relative member paths', () => {
        expect(getValue(doc, 'Customer.Email')).toBe('a@b.com');
        expect(getValue(doc, 'Count')).toBe(2);
    });
    it('resolves array index + nested', () => {
        expect(getValue(doc, 'Results[1].Status')).toBe('bad');
    });
    it('accepts absolute $ paths too', () => {
        expect(getValue(doc, '$.Customer.Email')).toBe('a@b.com');
    });
    it('getValues returns all wildcard matches', () => {
        expect(getValues(doc, 'Results[*].Status')).toEqual(['ok', 'bad']);
    });
    it('returns undefined for missing path', () => {
        expect(getValue(doc, 'Nope.Missing')).toBeUndefined();
    });
    it('fieldNames lists object keys', () => {
        expect(fieldNames(doc).sort()).toEqual(['Count', 'Customer', 'Results']);
    });
    it('fieldNames lists element fields for arrays', () => {
        expect(fieldNames(doc.Results).sort()).toEqual(['Status', 'n']);
    });
});
