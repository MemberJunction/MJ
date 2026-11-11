import { describe, it, expect } from 'vitest';
import { ResolveParams, ResolvePath } from '../template';

describe('template', () => {
    const scope = { $: { Results: [{ ID: '1' }] }, row: { Email: 'a@b.com', Balance: 50, Meta: { k: 'v' } } };

    it('whole-template resolves to the RAW value (preserves type/objects)', () => {
        const out = ResolveParams({ Body: '{{row.Meta}}', N: '{{row.Balance}}' }, scope);
        expect(out.Body).toEqual({ k: 'v' });
        expect(out.N).toBe(50); // number, not "50"
    });
    it('embedded templates interpolate as text', () => {
        const out = ResolveParams({ Subject: 'Hi {{row.Email}} (${{row.Balance}})' }, scope);
        expect(out.Subject).toBe('Hi a@b.com ($50)');
    });
    it('resolves $ (upstream) paths', () => {
        expect(ResolvePath('$.Results[0].ID', scope)).toBe('1');
    });
    it('resolves nested objects/arrays in params', () => {
        const out = ResolveParams({ nested: { to: '{{row.Email}}', list: ['{{row.Balance}}'] } }, scope);
        expect(out.nested).toEqual({ to: 'a@b.com', list: [50] });
    });
    it('throws on unknown binding', () => {
        expect(() => ResolveParams({ x: '{{ghost.y}}' }, scope)).toThrow(/Unknown binding "ghost"/);
    });
    it('leaves non-template strings untouched', () => {
        expect(ResolveParams({ x: 'plain' }, scope).x).toBe('plain');
    });
    it('evaluates 50k unclosed template whitespace input in < 50ms while keeping normal templates unchanged', () => {
        const pathological = '{{' + ' '.repeat(50_000);
        const startMs = performance.now();
        const out = ResolveParams(
            {
                unclosed: pathological,
                whole: '  {{ row.Balance }}  ',
                embedded: 'User {{ row.Email }} has {{ row.Balance }}',
            },
            scope
        );
        const elapsedMs = performance.now() - startMs;
        expect(elapsedMs).toBeLessThan(50);
        expect(out.unclosed).toBe(pathological);
        expect(out.whole).toBe(50);
        expect(out.embedded).toBe('User a@b.com has 50');
    });
});
