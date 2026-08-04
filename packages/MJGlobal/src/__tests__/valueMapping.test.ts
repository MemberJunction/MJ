/**
 * Unit tests for the generic value-mapping resolver (getValueAtPath / resolveMappingRef /
 * resolveValueMapping) genericized from the Flow Agent input-mapping mechanism.
 */

import { describe, it, expect } from 'vitest';
import { getValueAtPath, resolveMappingRef, resolveValueMapping } from '../valueMapping';

describe('getValueAtPath', () => {
    const obj = { a: { b: { c: 42 } }, items: [{ name: 'x' }, { name: 'y' }] };

    it('reads nested dot paths', () => {
        expect(getValueAtPath(obj, 'a.b.c')).toBe(42);
    });
    it('reads array-indexed paths', () => {
        expect(getValueAtPath(obj, 'items[1].name')).toBe('y');
    });
    it('returns the root for an empty path', () => {
        expect(getValueAtPath(obj, '')).toBe(obj);
    });
    it('returns undefined for missing segments / out-of-range indexes', () => {
        expect(getValueAtPath(obj, 'a.x.y')).toBeUndefined();
        expect(getValueAtPath(obj, 'items[5].name')).toBeUndefined();
    });
});

describe('resolveMappingRef', () => {
    const sources = { record: { Name: 'Ada', Tier: 3 }, context: { apiKey: 'k' }, $: { satisfaction: 'High' } };

    it('resolves a static literal', () => {
        expect(resolveMappingRef('static:today', sources)).toBe('today');
    });
    it('resolves a source.path reference', () => {
        expect(resolveMappingRef('record.Name', sources)).toBe('Ada');
        expect(resolveMappingRef('context.apiKey', sources)).toBe('k');
    });
    it('matches the source name case-insensitively', () => {
        expect(resolveMappingRef('Record.Tier', sources)).toBe(3);
    });
    it('supports the $ result source for output reads', () => {
        expect(resolveMappingRef('$.satisfaction', sources)).toBe('High');
    });
    it('resolves a bare source name to the whole source value (scalar sources)', () => {
        expect(resolveMappingRef('record', sources)).toEqual({ Name: 'Ada', Tier: 3 });
        expect(resolveMappingRef('record', { record: 'scalar' })).toBe('scalar');
    });
    it('treats an unrecognized prefix or plain string as a literal', () => {
        expect(resolveMappingRef('Hello.World', sources)).toBe('Hello.World');
        expect(resolveMappingRef('plain', sources)).toBe('plain');
    });
    it('returns missing source paths as undefined', () => {
        expect(resolveMappingRef('record.Missing', sources)).toBeUndefined();
    });
    it('passes non-string refs through unchanged', () => {
        expect(resolveMappingRef(7, sources)).toBe(7);
        expect(resolveMappingRef(true, sources)).toBe(true);
    });
});

describe('resolveValueMapping', () => {
    const sources = { record: { Name: 'Ada', Email: 'ada@x.io' } };

    it('resolves a flat object mapping', () => {
        const result = resolveValueMapping({ name: 'record.Name', label: 'static:Customer' }, sources);
        expect(result).toEqual({ name: 'Ada', label: 'Customer' });
    });
    it('resolves nested objects and arrays recursively', () => {
        const result = resolveValueMapping(
            { who: { primary: 'record.Name' }, tags: ['static:a', 'record.Email'] },
            sources,
        );
        expect(result).toEqual({ who: { primary: 'Ada' }, tags: ['a', 'ada@x.io'] });
    });
    it('preserves primitives', () => {
        expect(resolveValueMapping(5, sources)).toBe(5);
    });
});
