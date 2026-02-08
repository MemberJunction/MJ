import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeConfigs, validateConfigStructure } from '../config-merger';

describe('mergeConfigs', () => {
    describe('basic merging', () => {
        it('should return defaults when overrides is undefined', () => {
            const defaults = { a: 1, b: 'hello' };
            const result = mergeConfigs(defaults, undefined);
            expect(result).toEqual({ a: 1, b: 'hello' });
        });

        it('should return defaults when overrides is null', () => {
            const defaults = { a: 1, b: 'hello' };
            const result = mergeConfigs(defaults, null as unknown as undefined);
            expect(result).toEqual({ a: 1, b: 'hello' });
        });

        it('should return defaults when overrides is not an object', () => {
            const defaults = { a: 1 };
            const result = mergeConfigs(defaults, 'string' as unknown as undefined);
            expect(result).toEqual({ a: 1 });
        });

        it('should override primitive values', () => {
            const defaults = { name: 'default', port: 3000 };
            const overrides = { name: 'custom' };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ name: 'custom', port: 3000 });
        });

        it('should override boolean values', () => {
            const defaults = { enabled: false, verbose: true };
            const overrides = { enabled: true };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ enabled: true, verbose: true });
        });

        it('should override number values', () => {
            const defaults = { port: 3000, timeout: 5000 };
            const overrides = { port: 8080 };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ port: 8080, timeout: 5000 });
        });

        it('should add new keys from overrides', () => {
            const defaults = { a: 1 };
            const overrides = { b: 2 };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ a: 1, b: 2 });
        });
    });

    describe('deep object merging', () => {
        it('should deep merge nested objects', () => {
            const defaults = {
                database: {
                    host: 'localhost',
                    port: 5432,
                    credentials: { user: 'admin' }
                }
            };
            const overrides = {
                database: {
                    port: 3306,
                    credentials: { password: 'secret' }
                }
            };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({
                database: {
                    host: 'localhost',
                    port: 3306,
                    credentials: { user: 'admin', password: 'secret' }
                }
            });
        });

        it('should handle deeply nested objects', () => {
            const defaults = { a: { b: { c: { d: 1 } } } };
            const overrides = { a: { b: { c: { e: 2 } } } };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ a: { b: { c: { d: 1, e: 2 } } } });
        });

        it('should deep merge nested objects and return combined result', () => {
            const defaults = { a: 1, nested: { b: 2 } };
            const overrides = { a: 10, nested: { c: 3 } };
            const result = mergeConfigs(defaults, overrides);
            // Result has merged nested objects with overrides applied
            expect(result).toEqual({ a: 10, nested: { b: 2, c: 3 } });
        });
    });

    describe('array handling', () => {
        it('should replace arrays by default', () => {
            const defaults = { items: [1, 2, 3] };
            const overrides = { items: [4, 5] };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ items: [4, 5] });
        });

        it('should concatenate arrays when concatenateArrays is true', () => {
            const defaults = { items: [1, 2, 3] };
            const overrides = { items: [4, 5] };
            const result = mergeConfigs(defaults, overrides, { concatenateArrays: true });
            expect(result).toEqual({ items: [1, 2, 3, 4, 5] });
        });

        it('should handle empty arrays in defaults', () => {
            const defaults = { items: [] as number[] };
            const overrides = { items: [1, 2] };
            const result = mergeConfigs(defaults, overrides, { concatenateArrays: true });
            expect(result).toEqual({ items: [1, 2] });
        });

        it('should handle empty arrays in overrides', () => {
            const defaults = { items: [1, 2, 3] };
            const overrides = { items: [] as number[] };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ items: [] });
        });

        it('should handle arrays of objects', () => {
            const defaults = { items: [{ id: 1 }] };
            const overrides = { items: [{ id: 2 }, { id: 3 }] };
            const result = mergeConfigs(defaults, overrides);
            expect(result).toEqual({ items: [{ id: 2 }, { id: 3 }] });
        });
    });

    describe('_append suffix', () => {
        it('should concatenate arrays with _append suffix', () => {
            const defaults = { schemas: ['admin', 'public'] };
            const overrides = { schemas_append: ['custom'] } as Record<string, string[]>;
            const result = mergeConfigs(defaults, overrides);
            expect(result.schemas).toEqual(['admin', 'public', 'custom']);
        });

        it('should remove the _append key from the result', () => {
            const defaults = { schemas: ['admin'] };
            const overrides = { schemas_append: ['custom'] } as Record<string, string[]>;
            const result = mergeConfigs(defaults, overrides);
            expect(result).not.toHaveProperty('schemas_append');
        });

        it('should warn when _append is used with non-array default', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const defaults = { schemas: 'not-an-array' };
            const overrides = { schemas_append: ['custom'] } as Record<string, string | string[]>;
            mergeConfigs(defaults, overrides);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('expects both default and override to be arrays')
            );
        });

        it('should warn when _append value is not an array', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const defaults = { schemas: ['admin'] };
            const overrides = { schemas_append: 'not-array' } as Record<string, string | string[]>;
            mergeConfigs(defaults, overrides);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('expects both default and override to be arrays')
            );
        });

        it('should handle multiple _append keys', () => {
            const defaults = {
                exclude: ['a'],
                include: ['x']
            };
            const overrides = {
                exclude_append: ['b'],
                include_append: ['y']
            } as Record<string, string[]>;
            const result = mergeConfigs(defaults, overrides);
            expect(result.exclude).toEqual(['a', 'b']);
            expect(result.include).toEqual(['x', 'y']);
        });
    });

    describe('null/undefined handling', () => {
        it('should preserve default when override is null and allowNullOverrides is false', () => {
            const defaults = { a: 'hello' };
            const overrides = { a: null };
            const result = mergeConfigs(defaults, overrides as Record<string, string | null>, { allowNullOverrides: false });
            expect(result.a).toBe('hello');
        });

        it('should replace with null when allowNullOverrides is true', () => {
            const defaults = { a: 'hello' };
            const overrides = { a: null };
            const result = mergeConfigs(defaults, overrides as Record<string, string | null>, { allowNullOverrides: true });
            expect(result.a).toBeNull();
        });

        it('should preserve default when override is undefined and allowNullOverrides is false', () => {
            const defaults = { a: 'hello' };
            const overrides = { a: undefined };
            const result = mergeConfigs(defaults, overrides as Record<string, string | undefined>, { allowNullOverrides: false });
            expect(result.a).toBe('hello');
        });

        it('should preserve default when override is undefined even with allowNullOverrides true', () => {
            // allowNullOverrides only applies to null, not undefined
            const defaults = { a: 'hello' };
            const overrides = { a: undefined };
            const result = mergeConfigs(defaults, overrides as Record<string, string | undefined>, { allowNullOverrides: true });
            expect(result.a).toBe('hello');
        });
    });

    describe('edge cases', () => {
        it('should handle both defaults and overrides being empty objects', () => {
            const result = mergeConfigs({}, {});
            expect(result).toEqual({});
        });

        it('should handle override with class instance (non-plain object) as value', () => {
            const defaults = { date: new Date('2020-01-01') };
            const overrides = { date: new Date('2025-06-15') };
            const result = mergeConfigs(defaults, overrides);
            expect(result.date).toEqual(new Date('2025-06-15'));
        });

        it('should override object with primitive', () => {
            const defaults = { field: { nested: true } };
            const overrides = { field: 'replaced' };
            const result = mergeConfigs(defaults as Record<string, unknown>, overrides as Record<string, unknown>);
            expect(result.field).toBe('replaced');
        });
    });
});

describe('validateConfigStructure', () => {
    it('should not warn when all keys are allowed', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = { host: 'localhost', port: 3000 };
        const allowed = new Set(['host', 'port']);
        validateConfigStructure(config, allowed);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should warn about unexpected keys', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = { host: 'localhost', typo_key: true };
        const allowed = new Set(['host', 'port']);
        validateConfigStructure(config, allowed);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('typo_key')
        );
    });

    it('should include all unexpected keys in warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = { a: 1, b: 2, c: 3 };
        const allowed = new Set(['a']);
        validateConfigStructure(config, allowed);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('b')
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('c')
        );
    });

    it('should not warn for empty config', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        validateConfigStructure({}, new Set(['host', 'port']));
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not warn for empty allowed keys set with empty config', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        validateConfigStructure({}, new Set());
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should warn when config has keys but allowed set is empty', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        validateConfigStructure({ key: 'val' }, new Set());
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('key')
        );
    });
});
