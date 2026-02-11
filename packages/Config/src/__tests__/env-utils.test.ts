import { describe, it, expect } from 'vitest';
import { parseBooleanEnv } from '../env-utils';

describe('parseBooleanEnv', () => {
    describe('truthy values', () => {
        it('should return true for "true"', () => {
            expect(parseBooleanEnv('true')).toBe(true);
        });

        it('should return true for "True" (mixed case)', () => {
            expect(parseBooleanEnv('True')).toBe(true);
        });

        it('should return true for "TRUE" (uppercase)', () => {
            expect(parseBooleanEnv('TRUE')).toBe(true);
        });

        it('should return true for "1"', () => {
            expect(parseBooleanEnv('1')).toBe(true);
        });

        it('should return true for "yes"', () => {
            expect(parseBooleanEnv('yes')).toBe(true);
        });

        it('should return true for "Yes" (mixed case)', () => {
            expect(parseBooleanEnv('Yes')).toBe(true);
        });

        it('should return true for "YES" (uppercase)', () => {
            expect(parseBooleanEnv('YES')).toBe(true);
        });

        it('should return true for "y"', () => {
            expect(parseBooleanEnv('y')).toBe(true);
        });

        it('should return true for "Y" (uppercase)', () => {
            expect(parseBooleanEnv('Y')).toBe(true);
        });

        it('should return true for "on"', () => {
            expect(parseBooleanEnv('on')).toBe(true);
        });

        it('should return true for "On" (mixed case)', () => {
            expect(parseBooleanEnv('On')).toBe(true);
        });

        it('should return true for "ON" (uppercase)', () => {
            expect(parseBooleanEnv('ON')).toBe(true);
        });

        it('should return true for "t"', () => {
            expect(parseBooleanEnv('t')).toBe(true);
        });

        it('should return true for "T" (uppercase)', () => {
            expect(parseBooleanEnv('T')).toBe(true);
        });
    });

    describe('truthy values with whitespace', () => {
        it('should return true for " true " (with leading/trailing spaces)', () => {
            expect(parseBooleanEnv(' true ')).toBe(true);
        });

        it('should return true for "  1  " (with spaces)', () => {
            expect(parseBooleanEnv('  1  ')).toBe(true);
        });

        it('should return true for "\tyes\t" (with tabs)', () => {
            expect(parseBooleanEnv('\tyes\t')).toBe(true);
        });
    });

    describe('falsy values', () => {
        it('should return false for "false"', () => {
            expect(parseBooleanEnv('false')).toBe(false);
        });

        it('should return false for "False"', () => {
            expect(parseBooleanEnv('False')).toBe(false);
        });

        it('should return false for "FALSE"', () => {
            expect(parseBooleanEnv('FALSE')).toBe(false);
        });

        it('should return false for "0"', () => {
            expect(parseBooleanEnv('0')).toBe(false);
        });

        it('should return false for "no"', () => {
            expect(parseBooleanEnv('no')).toBe(false);
        });

        it('should return false for "off"', () => {
            expect(parseBooleanEnv('off')).toBe(false);
        });

        it('should return false for "n"', () => {
            expect(parseBooleanEnv('n')).toBe(false);
        });

        it('should return false for "f"', () => {
            expect(parseBooleanEnv('f')).toBe(false);
        });

        it('should return false for random string', () => {
            expect(parseBooleanEnv('random')).toBe(false);
        });

        it('should return false for "2" (non-1 number)', () => {
            expect(parseBooleanEnv('2')).toBe(false);
        });
    });

    describe('null/undefined/empty values', () => {
        it('should return false for undefined', () => {
            expect(parseBooleanEnv(undefined)).toBe(false);
        });

        it('should return false for null', () => {
            expect(parseBooleanEnv(null)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(parseBooleanEnv('')).toBe(false);
        });
    });
});
