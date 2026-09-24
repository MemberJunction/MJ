import { describe, it, expect } from 'vitest';
import { IsValidConfig } from '../config-types';

describe('isValidConfig', () => {
    it('should return true for a plain object', () => {
        expect(IsValidConfig({ key: 'value' })).toBe(true);
    });

    it('should return true for an empty object', () => {
        expect(IsValidConfig({})).toBe(true);
    });

    it('should return true for a nested object', () => {
        expect(IsValidConfig({ a: { b: { c: 1 } } })).toBe(true);
    });

    it('should return true for an array (arrays are objects)', () => {
        expect(IsValidConfig([1, 2, 3])).toBe(true);
    });

    it('should return false for null', () => {
        expect(IsValidConfig(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(IsValidConfig(undefined)).toBe(false);
    });

    it('should return false for a string', () => {
        expect(IsValidConfig('hello')).toBe(false);
    });

    it('should return false for a number', () => {
        expect(IsValidConfig(42)).toBe(false);
    });

    it('should return false for a boolean', () => {
        expect(IsValidConfig(true)).toBe(false);
        expect(IsValidConfig(false)).toBe(false);
    });

    it('should return false for a symbol', () => {
        expect(IsValidConfig(Symbol('test'))).toBe(false);
    });

    it('should return true for a Date object', () => {
        expect(IsValidConfig(new Date())).toBe(true);
    });

    it('should return true for a class instance', () => {
        class MyClass { name = 'test'; }
        expect(IsValidConfig(new MyClass())).toBe(true);
    });
});
