import { describe, it, expect } from 'vitest';
import { Float32VectorToBase64 } from '@memberjunction/global';
import { DecodeStoredVector, SelectStoredVector, type StoredVectorRow } from '../storedVectors';

const INDEX = 'AAAA0000-0000-0000-0000-000000000001';

function row(overrides: Partial<StoredVectorRow>): StoredVectorRow {
    return {
        RecordID: 'r1',
        VectorIndexID: INDEX,
        VectorBinary: null,
        VectorJSON: JSON.stringify([0.5, 0.25]),
        EntityRecordUpdatedAt: new Date('2026-03-02T00:00:00Z'),
        __mj_UpdatedAt: new Date('2026-03-02T00:00:00Z'),
        ...overrides,
    };
}

describe('DecodeStoredVector', () => {
    it('prefers the binary column over JSON', () => {
        const decoded = DecodeStoredVector({ VectorBinary: Float32VectorToBase64([0.75, 0.5]), VectorJSON: JSON.stringify([9, 9]) });
        expect(decoded).toEqual([0.75, 0.5]);
    });

    it('falls back to JSON, and gives null for nothing usable', () => {
        expect(DecodeStoredVector({ VectorBinary: null, VectorJSON: '[1,2]' })).toEqual([1, 2]);
        expect(DecodeStoredVector({ VectorBinary: null, VectorJSON: 'not json' })).toBeNull();
        expect(DecodeStoredVector({ VectorBinary: null, VectorJSON: '[]' })).toBeNull();
        expect(DecodeStoredVector({ VectorBinary: null, VectorJSON: null })).toBeNull();
    });
});

describe('SelectStoredVector', () => {
    const recordUpdated = new Date('2026-03-01T00:00:00Z');

    it('uses a vector from the current index, of the index width, not older than the record', () => {
        expect(SelectStoredVector([row({})], INDEX.toLowerCase(), 2, recordUpdated)).toEqual([0.5, 0.25]);
    });

    it('refuses another index, another width, or a vector older than the record', () => {
        expect(SelectStoredVector([row({ VectorIndexID: 'other' })], INDEX, 2, recordUpdated)).toBeNull();
        expect(SelectStoredVector([row({})], INDEX, 3, recordUpdated)).toBeNull();
        expect(SelectStoredVector([row({ EntityRecordUpdatedAt: new Date('2026-02-01T00:00:00Z') })], INDEX, 2, recordUpdated)).toBeNull();
        expect(SelectStoredVector([row({ EntityRecordUpdatedAt: null })], INDEX, 2, recordUpdated)).toBeNull();
    });

    it('with several rows for the record, uses the newest', () => {
        const older = row({ VectorJSON: '[9,9]', __mj_UpdatedAt: new Date('2026-03-01T00:00:00Z') });
        const newer = row({ VectorJSON: '[1,1]', __mj_UpdatedAt: new Date('2026-03-05T00:00:00Z') });
        expect(SelectStoredVector([older, newer], INDEX, 2, recordUpdated)).toEqual([1, 1]);
    });

    it('accepts any width when the index declares none', () => {
        expect(SelectStoredVector([row({ VectorJSON: '[1,2,3]' })], INDEX, undefined, recordUpdated)).toEqual([1, 2, 3]);
    });
});
