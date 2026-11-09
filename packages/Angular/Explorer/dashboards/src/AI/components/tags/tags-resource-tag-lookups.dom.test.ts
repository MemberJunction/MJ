/**
 * Pins the tag lookups that used to scan TagsRaw once per suggestion (and once per path level):
 * low-usage orphan cards and the BestMatchPath breadcrumb. They now index TagsRaw once per pass.
 */
import { describe, it, expect } from 'vitest';
import { TagsResourceComponent } from './tags-resource.component';

const ROOT = 'aaaaaaaa-0000-0000-0000-000000000001';
const MID = 'bbbbbbbb-0000-0000-0000-000000000002';
const LEAF = 'cccccccc-0000-0000-0000-000000000003';

type Internals = {
    TagsRaw: Record<string, unknown>[];
    SuggestionRows: Array<Record<string, unknown>>;
    TaxOrphans: Array<{ ID: string; Name: string }>;
    tagAggregateCounts: Map<string, number>;
    tagAggregateWeights: Map<string, number>;
    populateOrphansFromSuggestions(): void;
    indexTagsByID(): unknown;
    computeTagPath(tag: Record<string, unknown>, index: unknown): string;
};

function component(): Internals {
    const c = Object.create(TagsResourceComponent.prototype) as Internals;
    c.TagsRaw = [
        { ID: ROOT, Name: 'Root', ParentID: null },
        { ID: MID, Name: 'Mid', ParentID: ROOT.toUpperCase() },
        { ID: LEAF, Name: 'Leaf', ParentID: MID.toUpperCase() },
    ];
    c.tagAggregateCounts = new Map();
    c.tagAggregateWeights = new Map();
    return c;
}

describe('TagsResourceComponent tag lookups', () => {
    it('names low-usage orphans from TagsRaw, case-insensitively, falling back to the proposed name', () => {
        const c = component();
        c.SuggestionRows = [
            { Reason: 'LowUsage', BestMatchTagID: LEAF.toUpperCase(), ProposedName: 'p1' },
            { Reason: 'LowUsage', BestMatchTagID: 'dddddddd-0000-0000-0000-000000000004', ProposedName: 'p2' },
            { Reason: 'Other', BestMatchTagID: MID, ProposedName: 'p3' },
        ];
        c.populateOrphansFromSuggestions();
        expect(c.TaxOrphans.map(o => o.Name)).toEqual(['Leaf', 'p2']);
    });

    it('builds the root-to-tag path through upper-case parent IDs', () => {
        const c = component();
        expect(c.computeTagPath(c.TagsRaw[2], c.indexTagsByID())).toBe('Root › Mid › Leaf');
    });
});
