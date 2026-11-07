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

    describe('placeholder scanning', () => {
        it.each([
            ['  {{ row.Balance }}  ', 50],
            ['{{row.Balance}}', 50],
            ['{{\trow.Meta\n}}', { k: 'v' }],
        ])('treats %j as one whole placeholder', (template, expected) => {
            expect(ResolveParams({ x: template }, scope).x).toEqual(expected);
        });

        it.each([
            ['{{row.Email}} and {{row.Balance}}', 'a@b.com and 50'],
            ['{{ row.Email }}{{row.Balance}}', 'a@b.com50'],
            ['no close {{row.Email', 'no close {{row.Email'],
            ['single } brace {{row.Email} then {{row.Balance}}', 'single } brace {{row.Email} then 50'],
            ['empty {{}} stays', 'empty {{}} stays'],
            ['x {{row.Balance}}}', 'x 50}'],
        ])('interpolates %j', (template, expected) => {
            expect(ResolveParams({ x: template }, scope).x).toBe(expected);
        });

        it('reports an all-whitespace placeholder as an invalid path', () => {
            expect(() => ResolveParams({ x: 'a {{   }} b' }, scope)).toThrow(/Invalid template path/);
        });

        it('reads 100k characters of whitespace inside unclosed braces in linear time', () => {
            const ws = '\t'.repeat(100_000);
            const started = Date.now();
            expect(ResolveParams({ x: '{{{{' + ws }, scope).x).toBe('{{{{' + ws);
            expect(ResolveParams({ x: '{{{{|' + ws + '}' }, scope).x).toBe('{{{{|' + ws + '}');
            expect(ResolveParams({ x: '{{'.repeat(50_000) }, scope).x).toBe('{{'.repeat(50_000));
            expect(Date.now() - started).toBeLessThan(2500);
        });
    });
});
