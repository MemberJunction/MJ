import { describe, it, expect } from 'vitest';
import { ParseBooleanEnv } from '../env-utils';

describe('parseBooleanEnv', () => {
    describe('truthy values', () => {
        it('should return true for "true"', () => {
            expect(ParseBooleanEnv('true')).toBe(true);
        });

        it('should return true for "True" (mixed case)', () => {
            expect(ParseBooleanEnv('True')).toBe(true);
        });

        it('should return true for "TRUE" (uppercase)', () => {
            expect(ParseBooleanEnv('TRUE')).toBe(true);
        });

        it('should return true for "1"', () => {
            expect(ParseBooleanEnv('1')).toBe(true);
        });

        it('should return true for "yes"', () => {
            expect(ParseBooleanEnv('yes')).toBe(true);
        });

        it('should return true for "Yes" (mixed case)', () => {
            expect(ParseBooleanEnv('Yes')).toBe(true);
        });

        it('should return true for "YES" (uppercase)', () => {
            expect(ParseBooleanEnv('YES')).toBe(true);
        });

        it('should return true for "y"', () => {
            expect(ParseBooleanEnv('y')).toBe(true);
        });

        it('should return true for "Y" (uppercase)', () => {
            expect(ParseBooleanEnv('Y')).toBe(true);
        });

        it('should return true for "on"', () => {
            expect(ParseBooleanEnv('on')).toBe(true);
        });

        it('should return true for "On" (mixed case)', () => {
            expect(ParseBooleanEnv('On')).toBe(true);
        });

        it('should return true for "ON" (uppercase)', () => {
            expect(ParseBooleanEnv('ON')).toBe(true);
        });

        it('should return true for "t"', () => {
            expect(ParseBooleanEnv('t')).toBe(true);
        });

        it('should return true for "T" (uppercase)', () => {
            expect(ParseBooleanEnv('T')).toBe(true);
        });
    });

    describe('truthy values with whitespace', () => {
        it('should return true for " true " (with leading/trailing spaces)', () => {
            expect(ParseBooleanEnv(' true ')).toBe(true);
        });

        it('should return true for "  1  " (with spaces)', () => {
            expect(ParseBooleanEnv('  1  ')).toBe(true);
        });

        it('should return true for "\tyes\t" (with tabs)', () => {
            expect(ParseBooleanEnv('\tyes\t')).toBe(true);
        });
    });

    describe('falsy values', () => {
        it('should return false for "false"', () => {
            expect(ParseBooleanEnv('false')).toBe(false);
        });

        it('should return false for "False"', () => {
            expect(ParseBooleanEnv('False')).toBe(false);
        });

        it('should return false for "FALSE"', () => {
            expect(ParseBooleanEnv('FALSE')).toBe(false);
        });

        it('should return false for "0"', () => {
            expect(ParseBooleanEnv('0')).toBe(false);
        });

        it('should return false for "no"', () => {
            expect(ParseBooleanEnv('no')).toBe(false);
        });

        it('should return false for "off"', () => {
            expect(ParseBooleanEnv('off')).toBe(false);
        });

        it('should return false for "n"', () => {
            expect(ParseBooleanEnv('n')).toBe(false);
        });

        it('should return false for "f"', () => {
            expect(ParseBooleanEnv('f')).toBe(false);
        });

        it('should return false for random string', () => {
            expect(ParseBooleanEnv('random')).toBe(false);
        });

        it('should return false for "2" (non-1 number)', () => {
            expect(ParseBooleanEnv('2')).toBe(false);
        });
    });

    describe('null/undefined/empty values', () => {
        it('should return false for undefined', () => {
            expect(ParseBooleanEnv(undefined)).toBe(false);
        });

        it('should return false for null', () => {
            expect(ParseBooleanEnv(null)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(ParseBooleanEnv('')).toBe(false);
        });
    });
});
