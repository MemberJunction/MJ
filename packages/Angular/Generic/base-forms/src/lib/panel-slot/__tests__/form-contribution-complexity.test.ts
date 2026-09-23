import { describe, it, expect, vi, beforeEach } from 'vitest';

// Count every UUID comparison/normalization the resolver performs. Both helpers normalize
// (trim + lowercase, i.e. allocate) on the path that matters, so their call count is the
// resolver's UUID work. The real implementations still run — only the calls are counted.
const uuidCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
            uuidCalls.count++;
            return actual.UUIDsEqual(a, b);
        },
        NormalizeUUID: (id: string | null | undefined) => {
            uuidCalls.count++;
            return actual.NormalizeUUID(id);
        },
    };
});

import {
    ContributionHiddenSectionKeys,
    FormSectionCamelCase,
    ResolveFormContributions,
    type FormContributionRelationship,
} from '../form-contribution';

/**
 * An entity like MJ: Users, which has well over a hundred DisplayInForm relationships.
 * Each relationship points at its own related entity, so nearly every peer comparison is a
 * MISMATCH — the case UUIDsEqual's `===` fast path cannot short-circuit.
 */
function manyRelationships(n: number): FormContributionRelationship[] {
    return Array.from({ length: n }, (_, i) => ({
        RelatedEntity: `Related Entity ${i}`,
        RelatedEntityID: `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`.toUpperCase(),
        RelatedEntityJoinField: 'UserID',
        DisplayInForm: true,
        Sequence: i,
    }));
}

const N = 150;

describe('form-contribution resolution stays linear in the relationship count', () => {
    beforeEach(() => {
        uuidCalls.count = 0;
    });

    it('ResolveFormContributions does O(n) UUID work, not O(n²)', () => {
        const peers = manyRelationships(N);
        const result = ResolveFormContributions({
            EntityName: 'MJ: Users',
            RelatedEntities: peers,
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });

        expect(result.StockGrids).toHaveLength(N);
        // Quadratic resolution performs ~2·n² comparisons (45,000 at n=150).
        expect(uuidCalls.count).toBeLessThanOrEqual(10 * N);
    });

    it('ContributionHiddenSectionKeys (called per change-detection pass) does O(n) UUID work', () => {
        const peers = manyRelationships(N);
        ContributionHiddenSectionKeys('MJ: Users', peers, [], []);
        expect(uuidCalls.count).toBeLessThanOrEqual(10 * N);
    });

    it('still disambiguates two FKs to the same entity when the IDs differ only in case', () => {
        const peers = manyRelationships(N);
        const billTo: FormContributionRelationship = {
            RelatedEntity: 'Order Headers',
            RelatedEntityID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            RelatedEntityJoinField: 'BillToUserID',
            DisplayInForm: true,
            Sequence: 1,
        };
        const shipTo: FormContributionRelationship = {
            ...billTo,
            RelatedEntityID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
            RelatedEntityJoinField: 'ShipToUserID',
            Sequence: 2,
        };
        const result = ResolveFormContributions({
            EntityName: 'MJ: Users',
            RelatedEntities: [...peers, billTo, shipTo],
            IsaChildEntityIDs: [],
            Registrations: [],
            BakedSectionKeys: [],
            ShowRelatedEntities: true,
        });

        const keys = result.StockGrids.map((w) => w.BakedSectionKey);
        expect(keys).toContain(FormSectionCamelCase('Order Headers BillToUserID'));
        expect(keys).toContain(FormSectionCamelCase('Order Headers ShipToUserID'));
        expect(keys).toContain(FormSectionCamelCase('Related Entity 0'));
    });
});
