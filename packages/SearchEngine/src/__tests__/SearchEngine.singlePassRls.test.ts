import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SearchEngine } from '../generic/SearchEngine';
import type { SearchResultItem } from '../generic/search.types';

interface LaneEntityBound {
    EntityName: string;
    Clause: string;
}

interface SearchEngineInternals {
    hitsInsideLaneFilter(
        bound: LaneEntityBound,
        hits: SearchResultItem[],
        contextUser: UserInfo,
        scopeName: string,
    ): Promise<SearchResultItem[]>;
    admitOwnRows(
        entity: EntityInfo,
        entityResults: SearchResultItem[],
        rlsClause: string,
        contextUser: UserInfo,
    ): Promise<SearchResultItem[]>;
    readableRecordKeys(
        entity: EntityInfo,
        recordIDs: string[],
        rlsClause: string | undefined,
        contextUser: UserInfo,
    ): Promise<Set<string> | null>;
    buildCacheKey(trimmed: string, params: Record<string, unknown>, contextUser: UserInfo): string;
}

const USER_A = { ID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;
const USER_B = { ID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;

function makeEntity(rlsByUserId: Record<string, string>): EntityInfo {
    return {
        ID: 'entity-1',
        Name: 'Acme: Docs',
        DisplayName: 'Docs',
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: (user: UserInfo) => rlsByUserId[user.ID] ?? '',
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
}

function makeHit(recordID: string, promotedFrom?: string): SearchResultItem {
    return {
        ID: recordID,
        EntityName: 'Acme: Docs',
        RecordID: recordID,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: `Doc ${recordID}`,
        Snippet: 'snippet',
        Score: 0.9,
        ScoreBreakdown: { Vector: 0.9 },
        Tags: [],
        MatchedAt: new Date('2026-01-01'),
        ...(promotedFrom ? { PromotedFromContentItemID: promotedFrom } : {}),
    };
}

class SinglePassTestEngine extends SearchEngine {
    public TestEntity!: EntityInfo;
    public ReadableCalls: Array<{ clause: string | undefined; userID: string; ids: string[] }> = [];

    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (name: string) => (name === this.TestEntity.Name ? this.TestEntity : null),
        } as unknown as IMetadataProvider;
    }

    public static Make(): SinglePassTestEngine {
        return new SinglePassTestEngine();
    }
}

describe('SearchEngine — single-pass RLS + VERIFIED_OWNER_STAMP Symbol admission', () => {
    let engine: SinglePassTestEngine;
    let internals: SearchEngineInternals;

    beforeEach(() => {
        engine = SinglePassTestEngine.Make();
        engine.TestEntity = makeEntity({
            [USER_A.ID]: "OrgID='org-1'",
            [USER_B.ID]: "OrgID='org-1'",
        });
        internals = engine as unknown as SearchEngineInternals;
        vi.spyOn(internals, 'readableRecordKeys').mockImplementation(async (_entity, ids, clause, user) => {
            engine.ReadableCalls.push({ clause, userID: user.ID, ids: [...ids] });
            return new Set(ids.map((id) => id.trim().toLowerCase()));
        });
    });

    it('combines lane ExtraFilter and RLS into a single RunView and skips duplicate verification in admitOwnRows for the same reader', async () => {
        const hit = makeHit('rec-1');
        const laneKept = await internals.hitsInsideLaneFilter(
            { EntityName: 'Acme: Docs', Clause: "Status='Published'" },
            [hit],
            USER_A,
            'Docs Scope',
        );

        expect(laneKept).toHaveLength(1);
        expect(engine.ReadableCalls).toHaveLength(1);
        expect(engine.ReadableCalls[0].clause).toBe("(Status='Published') AND (OrgID='org-1')");

        // Simulate shallow spread during fusion/dedup — own enumerable Symbol survives `{ ...r }`
        const fusedCopy: SearchResultItem = { ...laneKept[0] };
        // Symbol is non-serializable and invisible to Object.keys / JSON.stringify
        expect(Object.keys(fusedCopy)).not.toContain('mjSearchVerifiedOwner');
        expect(JSON.stringify(fusedCopy)).not.toContain('mjSearchVerifiedOwner');

        // admitOwnRows for the SAME user + entity + rlsClause must NOT re-query the DB
        const admitted = await internals.admitOwnRows(engine.TestEntity, [fusedCopy], "OrgID='org-1'", USER_A);
        expect(admitted).toHaveLength(1);
        expect(engine.ReadableCalls).toHaveLength(1);
    });

    it('re-verifies via RunView for a different reader (audience isolation) or different RLS clause', async () => {
        const hit = makeHit('rec-2');
        const laneKept = await internals.hitsInsideLaneFilter(
            { EntityName: 'Acme: Docs', Clause: "Status='Published'" },
            [hit],
            USER_A,
            'Docs Scope',
        );
        expect(engine.ReadableCalls).toHaveLength(1);

        // Different reader (USER_B, as in FilterForAudience) MUST re-verify against DB
        await internals.admitOwnRows(engine.TestEntity, laneKept, "OrgID='org-1'", USER_B);
        expect(engine.ReadableCalls).toHaveLength(2);
        expect(engine.ReadableCalls[1].userID).toBe(USER_B.ID);

        // Different RLS clause for USER_A MUST also re-verify against DB
        await internals.admitOwnRows(engine.TestEntity, laneKept, "OrgID='org-2'", USER_A);
        expect(engine.ReadableCalls).toHaveLength(3);
    });

    it('never trusts the Symbol stamp on promoted content-item hits (always re-verifies in admitOwnRows)', async () => {
        const promotedHit = makeHit('rec-3', 'ci-origin-3');
        const laneKept = await internals.hitsInsideLaneFilter(
            { EntityName: 'Acme: Docs', Clause: "Status='Published'" },
            [promotedHit],
            USER_A,
            'Docs Scope',
        );
        expect(engine.ReadableCalls).toHaveLength(1);

        await internals.admitOwnRows(engine.TestEntity, laneKept, "OrgID='org-1'", USER_A);
        expect(engine.ReadableCalls).toHaveLength(2);
    });

    it('includes SkipNameEnrichment in buildCacheKey so skipped-name results never serve full-enrichment callers', () => {
        const keyFull = internals.buildCacheKey('hello', { Query: 'hello' }, USER_A);
        const keySkip = internals.buildCacheKey('hello', { Query: 'hello', SkipNameEnrichment: true }, USER_A);
        expect(keyFull).not.toBe(keySkip);
    });
});
