import { describe, it, expect } from 'vitest';
import { CompositeKey } from '@memberjunction/core';
import { ResolveLinkValue } from '../links';

describe('ResolveLinkValue', () => {
    const singleGuid = '11111111-2222-3333-4444-555555555555';
    const singleKey = new CompositeKey([{ FieldName: 'ID', Value: singleGuid }]);

    const multiKey = new CompositeKey([
        { FieldName: 'TenantID', Value: 'tenant-abc' },
        { FieldName: 'Sequence', Value: 42 },
    ]);

    it('returns the bare primary key value for hard links (string argument)', () => {
        expect(ResolveLinkValue('hard', singleKey)).toBe(singleGuid);
        expect(ResolveLinkValue('hard', multiKey)).toBe('tenant-abc');
    });

    it('returns the bare primary key value for hard links (boolean false argument)', () => {
        expect(ResolveLinkValue(false, singleKey)).toBe(singleGuid);
        expect(ResolveLinkValue(false, multiKey)).toBe('tenant-abc');
    });

    it('returns canonical CompositeKey.ToRecordID() encoding for soft links (string argument)', () => {
        expect(ResolveLinkValue('soft', singleKey)).toBe(singleKey.ToRecordID());
        expect(ResolveLinkValue('soft', multiKey)).toBe(multiKey.ToRecordID());
    });

    it('returns canonical CompositeKey.ToRecordID() encoding for soft links (boolean true argument)', () => {
        expect(ResolveLinkValue(true, singleKey)).toBe(singleKey.ToRecordID());
        expect(ResolveLinkValue(true, multiKey)).toBe(multiKey.ToRecordID());
    });
});
