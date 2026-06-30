import { describe, it, expect } from 'vitest';
import { NormalizeUUID, UUIDsEqual, IsValidUUID } from '../util/UUIDUtils';

describe('NormalizeUUID', () => {
    it('should lowercase an uppercase UUID (SQL Server format)', () => {
        expect(NormalizeUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890'))
            .toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should pass through a lowercase UUID unchanged (PostgreSQL format)', () => {
        expect(NormalizeUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890'))
            .toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should handle mixed-case UUIDs', () => {
        expect(NormalizeUUID('A1b2C3d4-E5f6-7890-AbCd-Ef1234567890'))
            .toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should trim whitespace', () => {
        expect(NormalizeUUID('  A1B2C3D4  ')).toBe('a1b2c3d4');
    });

    it('should return empty string for null', () => {
        expect(NormalizeUUID(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(NormalizeUUID(undefined)).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
        expect(NormalizeUUID('   ')).toBe('');
    });

    it('should handle empty string', () => {
        expect(NormalizeUUID('')).toBe('');
    });
});

describe('UUIDsEqual', () => {
    const upperUUID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
    const lowerUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('should consider SQL Server (uppercase) and PostgreSQL (lowercase) UUIDs equal', () => {
        expect(UUIDsEqual(upperUUID, lowerUUID)).toBe(true);
    });

    it('should consider identical uppercase UUIDs equal', () => {
        expect(UUIDsEqual(upperUUID, upperUUID)).toBe(true);
    });

    it('should consider identical lowercase UUIDs equal', () => {
        expect(UUIDsEqual(lowerUUID, lowerUUID)).toBe(true);
    });

    it('should return false for different UUIDs', () => {
        expect(UUIDsEqual('A1B2C3D4-0000-0000-0000-000000000000',
                           'A1B2C3D4-0000-0000-0000-000000000001')).toBe(false);
    });

    it('should consider two nulls equal', () => {
        expect(UUIDsEqual(null, null)).toBe(true);
    });

    it('should consider two undefineds equal', () => {
        expect(UUIDsEqual(undefined, undefined)).toBe(true);
    });

    it('should consider null and undefined equal', () => {
        expect(UUIDsEqual(null, undefined)).toBe(true);
    });

    it('should return false for null vs non-null', () => {
        expect(UUIDsEqual(null, lowerUUID)).toBe(false);
    });

    it('should return false for non-null vs null', () => {
        expect(UUIDsEqual(upperUUID, null)).toBe(false);
    });

    it('should return false for undefined vs non-undefined', () => {
        expect(UUIDsEqual(undefined, lowerUUID)).toBe(false);
    });

    it('should handle UUIDs with surrounding whitespace', () => {
        expect(UUIDsEqual('  ' + upperUUID + '  ', lowerUUID)).toBe(true);
    });

    it('should handle mixed-case comparison', () => {
        expect(UUIDsEqual('AbCd1234', 'aBcD1234')).toBe(true);
    });

    it('should handle empty strings as equal', () => {
        expect(UUIDsEqual('', '')).toBe(true);
    });

    // ---- Additional branch coverage (Wave perf fast-path + edge cases) ----

    it('takes the === fast path for the SAME object reference', () => {
        const ref = upperUUID;
        // Identical reference — short-circuits before any normalization allocation.
        expect(UUIDsEqual(ref, ref)).toBe(true);
    });

    it('takes the === fast path for two strings that are already byte-identical', () => {
        // Distinct objects, identical content — the === branch still fires before normalization.
        expect(UUIDsEqual(String(lowerUUID), String(lowerUUID))).toBe(true);
    });

    it('returns false when the values differ only in length (no accidental prefix match)', () => {
        expect(UUIDsEqual('abc', 'abcd')).toBe(false);
        expect(UUIDsEqual('abcd', 'abc')).toBe(false);
    });

    it('returns false when values differ only by internal whitespace (trim only strips ends)', () => {
        // NormalizeUUID trims leading/trailing whitespace but does NOT collapse internal spaces.
        expect(UUIDsEqual('a b', 'ab')).toBe(false);
    });

    it('treats values differing only by surrounding whitespace AND case as equal', () => {
        expect(UUIDsEqual('  ' + upperUUID, lowerUUID + '  ')).toBe(true);
    });

    it('returns false for an empty string vs a non-empty value', () => {
        expect(UUIDsEqual('', lowerUUID)).toBe(false);
        expect(UUIDsEqual(lowerUUID, '')).toBe(false);
    });

    it('treats whitespace-only vs empty string as equal (both normalize to "")', () => {
        expect(UUIDsEqual('   ', '')).toBe(true);
    });

    it('treats null vs empty string as NOT equal (null short-circuits before normalization)', () => {
        // null and '' are different: the null guard returns false before '' could normalize to ''.
        expect(UUIDsEqual(null, '')).toBe(false);
        expect(UUIDsEqual('', null)).toBe(false);
    });
});

describe('IsValidUUID', () => {
    const upperUUID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
    const lowerUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('accepts a canonical lowercase UUID (PostgreSQL format)', () => {
        expect(IsValidUUID(lowerUUID)).toBe(true);
    });

    it('accepts a canonical uppercase UUID (SQL Server format)', () => {
        expect(IsValidUUID(upperUUID)).toBe(true);
    });

    it('accepts a mixed-case UUID', () => {
        expect(IsValidUUID('A1b2C3d4-E5f6-7890-AbCd-Ef1234567890')).toBe(true);
    });

    it('tolerates surrounding whitespace', () => {
        expect(IsValidUUID('  ' + lowerUUID + '  ')).toBe(true);
    });

    it('rejects null and undefined', () => {
        expect(IsValidUUID(null)).toBe(false);
        expect(IsValidUUID(undefined)).toBe(false);
    });

    it('rejects empty / whitespace-only strings', () => {
        expect(IsValidUUID('')).toBe(false);
        expect(IsValidUUID('   ')).toBe(false);
    });

    it('rejects non-UUID strings (including injection-shaped input)', () => {
        expect(IsValidUUID('not-a-uuid')).toBe(false);
        expect(IsValidUUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890'; DROP TABLE")).toBe(false);
    });

    it('rejects malformed group lengths', () => {
        expect(IsValidUUID('a1b2c3d4-e5f6-7890-abcd-ef12345678')).toBe(false); // last group too short
        expect(IsValidUUID('a1b2c3d4e5f67890abcdef1234567890')).toBe(false); // no hyphens
    });

    it('rejects non-hex characters in an otherwise correct shape', () => {
        expect(IsValidUUID('g1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });
});
