import { describe, it, expect } from 'vitest';
import { CollapseDuplicateIdentities } from '../BatchIdentity.js';

const rec = (id: string, tag?: string) => ({ ExternalID: id, Fields: { tag } });

describe('CollapseDuplicateIdentities', () => {
    it('returns the ORIGINAL array when every identity is unique (no allocation)', () => {
        const batch = [rec('a'), rec('b'), rec('c')];
        const out = CollapseDuplicateIdentities(batch);
        expect(out.Records).toBe(batch);
        expect(out.Collapsed).toBe(0);
    });

    it('collapses a repeated identity, keeping the LAST occurrence (upsert semantics)', () => {
        const out = CollapseDuplicateIdentities([rec('a', 'first'), rec('b'), rec('a', 'last')]);
        expect(out.Records.map(r => r.ExternalID)).toEqual(['b', 'a']);
        expect(out.Records.find(r => r.ExternalID === 'a')!.Fields.tag).toBe('last');
        expect(out.Collapsed).toBe(1);
    });

    it('counts every excess copy, not every repeated identity', () => {
        const out = CollapseDuplicateIdentities([rec('a'), rec('a'), rec('a'), rec('b'), rec('b')]);
        expect(out.Collapsed).toBe(3);
        expect(out.Records).toHaveLength(2);
    });

    it('samples repeated identities for reporting, capped', () => {
        const batch = Array.from({ length: 20 }, (_, i) => rec(`id-${i}`)).concat(
            Array.from({ length: 20 }, (_, i) => rec(`id-${i}`)));
        const out = CollapseDuplicateIdentities(batch);
        expect(out.Collapsed).toBe(20);
        expect(out.SampleIDs).toHaveLength(5);
    });

    it('passes identity-less records through untouched — collapsing them would merge unrelated rows', () => {
        const out = CollapseDuplicateIdentities([
            { ExternalID: '' } as { ExternalID: string },
            { ExternalID: '' } as { ExternalID: string },
            rec('a'), rec('a'),
        ]);
        expect(out.Records).toHaveLength(3);
        expect(out.Collapsed).toBe(1);
    });

    it('handles trivial batches', () => {
        expect(CollapseDuplicateIdentities([]).Collapsed).toBe(0);
        expect(CollapseDuplicateIdentities([rec('a')]).Collapsed).toBe(0);
    });
});
