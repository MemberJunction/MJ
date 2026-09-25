import { describe, it, expect } from 'vitest';
import { GetValue, GetValues, FieldNames } from '../path';

const doc = { Results: [{ Status: 'ok', n: 1 }, { Status: 'bad', n: 2 }], Customer: { Email: 'a@b.com' }, Count: 2 };

describe('path', () => {
    it('resolves relative member paths', () => {
        expect(GetValue(doc, 'Customer.Email')).toBe('a@b.com');
        expect(GetValue(doc, 'Count')).toBe(2);
    });
    it('resolves array index + nested', () => {
        expect(GetValue(doc, 'Results[1].Status')).toBe('bad');
    });
    it('accepts absolute $ paths too', () => {
        expect(GetValue(doc, '$.Customer.Email')).toBe('a@b.com');
    });
    it('getValues returns all wildcard matches', () => {
        expect(GetValues(doc, 'Results[*].Status')).toEqual(['ok', 'bad']);
    });
    it('returns undefined for missing path', () => {
        expect(GetValue(doc, 'Nope.Missing')).toBeUndefined();
    });
    it('fieldNames lists object keys', () => {
        expect(FieldNames(doc).sort()).toEqual(['Count', 'Customer', 'Results']);
    });
    it('fieldNames lists element fields for arrays', () => {
        expect(FieldNames(doc.Results).sort()).toEqual(['Status', 'n']);
    });
});
