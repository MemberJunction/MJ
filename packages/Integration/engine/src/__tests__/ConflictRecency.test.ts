import { describe, it, expect } from 'vitest';
import { MostRecentWinner, ParseTimestamp } from '../ConflictRecency.js';

describe('parseTimestamp', () => {
    it('parses a Date', () => {
        expect(ParseTimestamp(new Date('2026-01-01T00:00:00Z'))).toBe(Date.parse('2026-01-01T00:00:00Z'));
    });
    it('parses an ISO string', () => {
        expect(ParseTimestamp('2026-06-02T12:00:00Z')).toBe(Date.parse('2026-06-02T12:00:00Z'));
    });
    it('passes through a finite epoch number', () => {
        expect(ParseTimestamp(1700000000000)).toBe(1700000000000);
    });
    it('returns null for missing / invalid / NaN', () => {
        expect(ParseTimestamp(null)).toBeNull();
        expect(ParseTimestamp(undefined)).toBeNull();
        expect(ParseTimestamp('')).toBeNull();
        expect(ParseTimestamp('not-a-date')).toBeNull();
        expect(ParseTimestamp(new Date('nope'))).toBeNull();
        expect(ParseTimestamp(Number.NaN)).toBeNull();
    });
});

describe('mostRecentWinner', () => {
    it('external wins when its ModifiedAt is newer', () => {
        expect(MostRecentWinner('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('external');
    });
    it('MJ wins when __mj_UpdatedAt is newer', () => {
        expect(MostRecentWinner('2026-03-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('mj');
    });
    it('ties go to MJ (DestWins-style tiebreak)', () => {
        const t = '2026-02-01T00:00:00Z';
        expect(MostRecentWinner(t, t)).toBe('mj');
    });
    it('mixes Date and string inputs', () => {
        expect(MostRecentWinner(new Date('2026-01-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))).toBe('external');
    });
    it('returns null (→ caller falls back to DestWins) when either timestamp is missing/unparseable', () => {
        expect(MostRecentWinner(null, '2026-01-01T00:00:00Z')).toBeNull();
        expect(MostRecentWinner('2026-01-01T00:00:00Z', undefined)).toBeNull();
        expect(MostRecentWinner('garbage', '2026-01-01T00:00:00Z')).toBeNull();
    });
});
