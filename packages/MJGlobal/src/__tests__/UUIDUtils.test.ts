import { describe, it, expect } from 'vitest';
import { NormalizeUUID, UUIDsEqual } from '../util/UUIDUtils';

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
});
