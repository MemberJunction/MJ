import { describe, it, expect } from 'vitest';
import { resolveParams, resolvePath } from '../template';

describe('template', () => {
    const scope = { $: { Results: [{ ID: '1' }] }, row: { Email: 'a@b.com', Balance: 50, Meta: { k: 'v' } } };

    it('whole-template resolves to the RAW value (preserves type/objects)', () => {
        const out = resolveParams({ Body: '{{row.Meta}}', N: '{{row.Balance}}' }, scope);
        expect(out.Body).toEqual({ k: 'v' });
        expect(out.N).toBe(50); // number, not "50"
    });
    it('embedded templates interpolate as text', () => {
        const out = resolveParams({ Subject: 'Hi {{row.Email}} (${{row.Balance}})' }, scope);
        expect(out.Subject).toBe('Hi a@b.com ($50)');
    });
    it('resolves $ (upstream) paths', () => {
        expect(resolvePath('$.Results[0].ID', scope)).toBe('1');
    });
    it('resolves nested objects/arrays in params', () => {
        const out = resolveParams({ nested: { to: '{{row.Email}}', list: ['{{row.Balance}}'] } }, scope);
        expect(out.nested).toEqual({ to: 'a@b.com', list: [50] });
    });
    it('throws on unknown binding', () => {
        expect(() => resolveParams({ x: '{{ghost.y}}' }, scope)).toThrow(/Unknown binding "ghost"/);
    });
    it('leaves non-template strings untouched', () => {
        expect(resolveParams({ x: 'plain' }, scope).x).toBe('plain');
    });
});
