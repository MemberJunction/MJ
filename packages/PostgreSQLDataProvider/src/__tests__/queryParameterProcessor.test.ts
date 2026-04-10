import { describe, it, expect } from 'vitest';
import { PGQueryParameterProcessor } from '../queryParameterProcessor.js';

describe('PGQueryParameterProcessor', () => {
    describe('ProcessParameterValue', () => {
        it('should return null for null', () => {
            expect(PGQueryParameterProcessor.ProcessParameterValue(null)).toBeNull();
        });

        it('should return null for undefined', () => {
            expect(PGQueryParameterProcessor.ProcessParameterValue(undefined)).toBeNull();
        });

        it('should pass through boolean values (PG native support)', () => {
            expect(PGQueryParameterProcessor.ProcessParameterValue(true)).toBe(true);
            expect(PGQueryParameterProcessor.ProcessParameterValue(false)).toBe(false);
        });

        it('should pass through numbers', () => {
            expect(PGQueryParameterProcessor.ProcessParameterValue(42)).toBe(42);
            expect(PGQueryParameterProcessor.ProcessParameterValue(3.14)).toBe(3.14);
        });

        it('should pass through strings', () => {
            expect(PGQueryParameterProcessor.ProcessParameterValue('hello')).toBe('hello');
        });

        it('should convert Date to ISO string', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            const result = PGQueryParameterProcessor.ProcessParameterValue(date);
            expect(result).toBe('2024-01-15T10:30:00.000Z');
        });

        it('should pass through Buffer for BYTEA', () => {
            const buf = Buffer.from('hello');
            expect(PGQueryParameterProcessor.ProcessParameterValue(buf)).toBe(buf);
        });
    });

    describe('ProcessParameters', () => {
        it('should return empty array for undefined', () => {
            expect(PGQueryParameterProcessor.ProcessParameters(undefined)).toEqual([]);
        });

        it('should process array of mixed parameters', () => {
            const params = [1, 'hello', true, null];
            const result = PGQueryParameterProcessor.ProcessParameters(params);
            expect(result).toEqual([1, 'hello', true, null]);
        });
    });

    describe('BitToBoolean', () => {
        it('should convert null to null', () => {
            expect(PGQueryParameterProcessor.BitToBoolean(null)).toBeNull();
        });

        it('should pass through booleans', () => {
            expect(PGQueryParameterProcessor.BitToBoolean(true)).toBe(true);
            expect(PGQueryParameterProcessor.BitToBoolean(false)).toBe(false);
        });

        it('should convert 1/0 numbers to boolean', () => {
            expect(PGQueryParameterProcessor.BitToBoolean(1)).toBe(true);
            expect(PGQueryParameterProcessor.BitToBoolean(0)).toBe(false);
        });

        it('should convert string "true"/"false"', () => {
            expect(PGQueryParameterProcessor.BitToBoolean('true')).toBe(true);
            expect(PGQueryParameterProcessor.BitToBoolean('false')).toBe(false);
            expect(PGQueryParameterProcessor.BitToBoolean('TRUE')).toBe(true);
        });

        it('should convert string "1"/"0"', () => {
            expect(PGQueryParameterProcessor.BitToBoolean('1')).toBe(true);
            expect(PGQueryParameterProcessor.BitToBoolean('0')).toBe(false);
        });

        it('should convert string "yes"', () => {
            expect(PGQueryParameterProcessor.BitToBoolean('yes')).toBe(true);
            expect(PGQueryParameterProcessor.BitToBoolean('no')).toBe(false);
        });
    });
});
