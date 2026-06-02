import { describe, it, expect } from 'vitest';
import { GetOperator, GetAllOperators } from '../operators';

function apply(verb: string, input: unknown, args?: unknown): unknown {
    return GetOperator(verb)!.apply(input as never, args);
}

const rows = [
    { ID: '1', Status: 'Open', Balance: 300, Email: 'a@x.com' },
    { ID: '2', Status: 'Closed', Balance: 0, Email: 'b@x.com' },
    { ID: '3', Status: 'Open', Balance: 150, Email: 'c@x.com' },
];

describe('object operators', () => {
    it('where filters by predicate', () => {
        expect((apply('where', rows, "Status == 'Open'") as unknown[]).length).toBe(2);
        expect((apply('where', rows, 'Balance > 100') as unknown[]).length).toBe(2);
    });
    it('select one field → array of values; many → array of objects', () => {
        expect(apply('select', rows, 'Email')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
        expect(apply('select', rows, ['ID', 'Status'])).toEqual([
            { ID: '1', Status: 'Open' }, { ID: '2', Status: 'Closed' }, { ID: '3', Status: 'Open' },
        ]);
    });
    it('sort ascending and descending', () => {
        expect((apply('sort', rows, 'Balance') as { ID: string }[]).map((r) => r.ID)).toEqual(['2', '3', '1']);
        expect((apply('sort', rows, '-Balance') as { ID: string }[]).map((r) => r.ID)).toEqual(['1', '3', '2']);
    });
    it('first / last', () => {
        expect((apply('first', rows, 2) as unknown[]).length).toBe(2);
        expect((apply('last', rows, 1) as { ID: string }[])[0].ID).toBe('3');
    });
    it('count', () => {
        expect(apply('count', rows)).toBe(3);
        expect(apply('count', 'hello')).toBe(5);
        expect(apply('count', { a: 1, b: 2 })).toBe(2);
    });
    it('distinct, optionally by field', () => {
        expect(apply('distinct', [1, 1, 2, 3, 3])).toEqual([1, 2, 3]);
        expect((apply('distinct', rows, 'Status') as unknown[]).length).toBe(2);
    });
    it('flatten one level', () => {
        expect(apply('flatten', [[1, 2], [3], 4])).toEqual([1, 2, 3, 4]);
    });
    it('jsonpath extracts', () => {
        expect(apply('jsonpath', { a: { b: 5 } }, '$.a.b')).toBe(5);
        expect(apply('jsonpath', rows, '$[*].ID')).toEqual(['1', '2', '3']);
    });
    it('where throws a clear error on non-array', () => {
        expect(() => apply('where', { x: 1 }, 'x == 1')).toThrow(/expects an array/);
    });
});

describe('text operators', () => {
    const log = 'INFO ok\nERROR boom\ninfo two\nERROR three';
    it('lines splits a string', () => {
        expect((apply('lines', log) as string[]).length).toBe(4);
    });
    it('grep on a string keeps matching lines (joined)', () => {
        expect(apply('grep', log, { pattern: 'ERROR' })).toBe('ERROR boom\nERROR three');
        expect(apply('grep', log, { pattern: 'info', ignoreCase: true })).toBe('INFO ok\ninfo two');
        expect(apply('grep', log, { pattern: 'ERROR', invert: true })).toBe('INFO ok\ninfo two');
    });
    it('grep on an array filters elements', () => {
        expect(apply('grep', ['apple', 'banana', 'cherry'], 'an')).toEqual(['banana']);
    });
    it('head / tail on text', () => {
        expect(apply('head', log, 2)).toBe('INFO ok\nERROR boom');
        expect(apply('tail', log, 1)).toBe('ERROR three');
    });
});

describe('operator registry', () => {
    it('exposes the operator catalog (map/let/tool are control verbs, not operators)', () => {
        const names = GetAllOperators().map((o) => o.name);
        expect(names).toContain('where');
        expect(names).toContain('select');
        expect(names).not.toContain('map');
        expect(GetOperator('map')).toBeUndefined();
    });
});
