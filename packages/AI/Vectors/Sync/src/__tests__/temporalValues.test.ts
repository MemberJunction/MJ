/**
 * Temporal column values in entity documents: the text a `date` or timestamp column takes in the
 * template data an embedding is rendered from and in the vector's metadata (#6055).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { NormalizeTemporalFields, NormalizeTemporalValue } from '../generic/temporalValues';

describe('NormalizeTemporalValue', () => {
    it('gives a date-only Date its stored calendar day, whatever the server time zone', () => {
        // Drivers return `date` at UTC midnight; toString() west of Greenwich lands on the day before.
        expect(NormalizeTemporalValue('date', new Date('1984-05-07T00:00:00.000Z'))).toBe('1984-05-07');
        expect(NormalizeTemporalValue('date', new Date('1991-01-02T00:00:00.000Z'))).toBe('1991-01-02');
    });

    it('matches the date-only type case-insensitively', () => {
        expect(NormalizeTemporalValue('DATE', new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    });

    it('trims a date-only string to its day and leaves an unparseable one alone', () => {
        expect(NormalizeTemporalValue('date', '1984-05-07T00:00:00.000Z')).toBe('1984-05-07');
        expect(NormalizeTemporalValue('date', '1984-05-07')).toBe('1984-05-07');
        expect(NormalizeTemporalValue('date', 'not a date')).toBe('not a date');
    });

    it('writes a timestamp as ISO 8601', () => {
        expect(NormalizeTemporalValue('datetimeoffset', new Date('2026-10-22T18:53:06.123Z'))).toBe('2026-10-22T18:53:06.123Z');
        expect(NormalizeTemporalValue('datetime2', new Date('2026-10-22T18:53:06.123Z'))).toBe('2026-10-22T18:53:06.123Z');
        expect(NormalizeTemporalValue(null, new Date('2026-10-22T18:53:06.123Z'))).toBe('2026-10-22T18:53:06.123Z');
    });

    it('leaves non-temporal values and invalid dates as they are', () => {
        const invalid = new Date('nope');
        expect(NormalizeTemporalValue('nvarchar', 'Kate')).toBe('Kate');
        expect(NormalizeTemporalValue('int', 42)).toBe(42);
        expect(NormalizeTemporalValue('date', null)).toBeNull();
        expect(NormalizeTemporalValue('date', invalid)).toBe(invalid);
    });
});

describe('NormalizeTemporalFields', () => {
    const people = {
        Fields: [
            { Name: 'FirstName', Type: 'nvarchar' },
            { Name: 'DateOfBirth', Type: 'date' },
            { Name: '__mj_UpdatedAt', Type: 'datetimeoffset' },
        ],
    } as unknown as EntityInfo;

    it('normalizes the entity\'s temporal fields and keeps every other key', () => {
        const row = {
            FirstName: 'Kate',
            DateOfBirth: new Date('1984-05-07T00:00:00.000Z'),
            __mj_UpdatedAt: new Date('2026-10-22T18:53:06.123Z'),
            Extra: 'kept',
        };

        expect(NormalizeTemporalFields(people, row)).toEqual({
            FirstName: 'Kate',
            DateOfBirth: '1984-05-07',
            __mj_UpdatedAt: '2026-10-22T18:53:06.123Z',
            Extra: 'kept',
        });
        expect(row.DateOfBirth).toBeInstanceOf(Date); // the caller's row is not mutated
    });

    it('returns the same object when nothing changes', () => {
        const row = { FirstName: 'Kate', DateOfBirth: '1984-05-07' };
        expect(NormalizeTemporalFields(people, row)).toBe(row);
    });
});
