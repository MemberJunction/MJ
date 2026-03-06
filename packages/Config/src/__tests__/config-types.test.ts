import { describe, it, expect } from 'vitest';
import { isValidConfig } from '../config-types';

describe('isValidConfig', () => {
    it('should return true for a plain object', () => {
        expect(isValidConfig({ key: 'value' })).toBe(true);
    });

    it('should return true for an empty object', () => {
        expect(isValidConfig({})).toBe(true);
    });

    it('should return true for a nested object', () => {
        expect(isValidConfig({ a: { b: { c: 1 } } })).toBe(true);
    });

    it('should return true for an array (arrays are objects)', () => {
        expect(isValidConfig([1, 2, 3])).toBe(true);
    });

    it('should return false for null', () => {
        expect(isValidConfig(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isValidConfig(undefined)).toBe(false);
    });

    it('should return false for a string', () => {
        expect(isValidConfig('hello')).toBe(false);
    });

    it('should return false for a number', () => {
        expect(isValidConfig(42)).toBe(false);
    });

    it('should return false for a boolean', () => {
        expect(isValidConfig(true)).toBe(false);
        expect(isValidConfig(false)).toBe(false);
    });

    it('should return false for a symbol', () => {
        expect(isValidConfig(Symbol('test'))).toBe(false);
    });

    it('should return true for a Date object', () => {
        expect(isValidConfig(new Date())).toBe(true);
    });

    it('should return true for a class instance', () => {
        class MyClass { name = 'test'; }
        expect(isValidConfig(new MyClass())).toBe(true);
    });
});
