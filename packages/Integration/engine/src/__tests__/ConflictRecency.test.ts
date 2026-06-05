import { describe, it, expect } from 'vitest';
import { mostRecentWinner, parseTimestamp } from '../ConflictRecency.js';

describe('parseTimestamp', () => {
    it('parses a Date', () => {
        expect(parseTimestamp(new Date('2026-01-01T00:00:00Z'))).toBe(Date.parse('2026-01-01T00:00:00Z'));
    });
    it('parses an ISO string', () => {
        expect(parseTimestamp('2026-06-02T12:00:00Z')).toBe(Date.parse('2026-06-02T12:00:00Z'));
    });
    it('passes through a finite epoch number', () => {
        expect(parseTimestamp(1700000000000)).toBe(1700000000000);
    });
    it('returns null for missing / invalid / NaN', () => {
        expect(parseTimestamp(null)).toBeNull();
        expect(parseTimestamp(undefined)).toBeNull();
        expect(parseTimestamp('')).toBeNull();
        expect(parseTimestamp('not-a-date')).toBeNull();
        expect(parseTimestamp(new Date('nope'))).toBeNull();
        expect(parseTimestamp(Number.NaN)).toBeNull();
    });
});

describe('mostRecentWinner', () => {
    it('external wins when its ModifiedAt is newer', () => {
        expect(mostRecentWinner('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('external');
    });
    it('MJ wins when __mj_UpdatedAt is newer', () => {
        expect(mostRecentWinner('2026-03-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('mj');
    });
    it('ties go to MJ (DestWins-style tiebreak)', () => {
        const t = '2026-02-01T00:00:00Z';
        expect(mostRecentWinner(t, t)).toBe('mj');
    });
    it('mixes Date and string inputs', () => {
        expect(mostRecentWinner(new Date('2026-01-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))).toBe('external');
    });
    it('returns null (→ caller falls back to DestWins) when either timestamp is missing/unparseable', () => {
        expect(mostRecentWinner(null, '2026-01-01T00:00:00Z')).toBeNull();
        expect(mostRecentWinner('2026-01-01T00:00:00Z', undefined)).toBeNull();
        expect(mostRecentWinner('garbage', '2026-01-01T00:00:00Z')).toBeNull();
    });
});
