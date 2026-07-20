import { describe, it, expect } from 'vitest';
import { MergeScopedEntities } from '../generic/providerBase.js';

/**
 * Scoped metadata refresh (RSU runtime-reset bottleneck): the pure merge that replaces one
 * schema's entities with a freshly-loaded set while leaving every other schema untouched,
 * preserving the deterministic alphabetical ordering PostProcessEntityMetadata guarantees.
 */
describe('MergeScopedEntities', () => {
    type E = { Name: string; SchemaName?: string; marker?: string };
    const existing: E[] = [
        { Name: 'Accounts', SchemaName: 'crm', marker: 'old' },
        { Name: 'Contacts', SchemaName: 'wild_apricot', marker: 'old' },
        { Name: 'Events', SchemaName: 'wild_apricot', marker: 'old' },
        { Name: 'Users', SchemaName: '__mj', marker: 'old' },
    ];

    it('replaces the scoped schema\'s entities with the fresh set and keeps other schemas untouched', () => {
        const fresh: E[] = [
            { Name: 'Contacts', SchemaName: 'wild_apricot', marker: 'new' },
            { Name: 'Invoices', SchemaName: 'wild_apricot', marker: 'new' }, // newly created by RSU
        ];
        const merged = MergeScopedEntities(existing, fresh, ['wild_apricot']);
        // Events (absent from fresh) is REMOVED; Invoices added; Contacts replaced by the new instance
        expect(merged.map(e => e.Name)).toEqual(['Accounts', 'Contacts', 'Invoices', 'Users']);
        expect(merged.find(e => e.Name === 'Contacts')?.marker).toBe('new');
        expect(merged.find(e => e.Name === 'Accounts')?.marker).toBe('old');
        expect(merged.find(e => e.Name === 'Users')?.marker).toBe('old');
    });

    it('re-sorts alphabetically by Name (deterministic ordering for CodeGen consumers)', () => {
        const fresh: E[] = [{ Name: 'AAA_First', SchemaName: 'wild_apricot' }];
        const merged = MergeScopedEntities(existing, fresh, ['wild_apricot']);
        expect(merged.map(e => e.Name)).toEqual([...merged.map(e => e.Name)].sort((a, b) => a.localeCompare(b)));
        expect(merged[0].Name).toBe('AAA_First');
    });

    it('matches schemas case-insensitively and trims', () => {
        const merged = MergeScopedEntities(existing, [], ['  WILD_APRICOT  ']);
        expect(merged.map(e => e.Name)).toEqual(['Accounts', 'Users']); // both wild_apricot rows dropped
    });

    it('handles multiple scoped schemas in one call', () => {
        const fresh: E[] = [{ Name: 'Zeta', SchemaName: 'crm', marker: 'new' }];
        const merged = MergeScopedEntities(existing, fresh, ['crm', 'wild_apricot']);
        expect(merged.map(e => e.Name)).toEqual(['Users', 'Zeta']);
        expect(merged.find(e => e.Name === 'Zeta')?.marker).toBe('new');
    });

    it('treats entities with no SchemaName as out-of-scope (never dropped)', () => {
        const noSchema: E[] = [{ Name: 'Orphan' }];
        const merged = MergeScopedEntities([...existing, ...noSchema], [], ['wild_apricot']);
        expect(merged.some(e => e.Name === 'Orphan')).toBe(true);
    });

    it('is a pure function — inputs are not mutated', () => {
        const before = JSON.stringify(existing);
        MergeScopedEntities(existing, [{ Name: 'X', SchemaName: 'wild_apricot' }], ['wild_apricot']);
        expect(JSON.stringify(existing)).toBe(before);
    });
});
