/**
 * Tests for `SearchParams.Audience`: a shared conversation's results are the intersection of what
 * every reader may see. The engine runs its permission safety net for the caller, then once per
 * reader, and the audience is part of the result-cache key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockRunViewFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { SearchEngine } from '../generic/SearchEngine';
import type { SearchAudience, SearchParams, SearchResultItem } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';

class TestSearchEngine extends SearchEngine {
    public async TestFilterForAudience(results: SearchResultItem[], audience: SearchAudience | undefined, contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.FilterForAudience(results, audience, contextUser);
    }
    public TestCacheKey(params: SearchParams, contextUser: UserInfo): string {
        return this.buildCacheKey(params.Query, params, contextUser);
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (name: string) => mockEntityByName(name),
            Entities: [],
        } as unknown as IMetadataProvider;
    }
}

/** A hydrated user: carries a role, as `UserCache` would. */
function user(id: string): UserInfo {
    return { ID: id, Name: `user ${id}`, Email: `${id}@example.com`, UserRoles: [{ RoleID: 'role-1' }] } as unknown as UserInfo;
}

/** A bare `{ ID }` DTO — what a careless host might pass. Permissions resolve to nothing for it. */
function rolelessUser(id: string): UserInfo {
    return { ID: id, Name: `user ${id}` } as UserInfo;
}

const asker = user('00000000-0000-0000-0000-00000000000a');
const bea = user('00000000-0000-0000-0000-00000000000b');
const cal = user('00000000-0000-0000-0000-00000000000c');

function makeResult(recordId: string, resultType: SearchResultItem['ResultType'] = 'entity-record'): SearchResultItem {
    return {
        ID: `r-${recordId}`,
        EntityName: 'Documents',
        RecordID: recordId,
        SourceType: resultType === 'storage-file' ? 'storage' : 'vector',
        Title: recordId,
        Snippet: '',
        Score: 0.5,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: resultType,
    };
}

/**
 * `Documents` has a row filter, so every user's check is a RunView; `readable` says which rows each user
 * gets back. Entity-level read follows the real rule's shape: a user with no roles has no permission.
 * A user listed in `failing` gets a failed RunView.
 */
function serveDocuments(readable: Record<string, string[]>, failing: string[] = []): void {
    mockEntityByName.mockReturnValue({
        Name: 'Documents',
        ID: 'documents',
        ParentID: null,
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: (u: UserInfo) => ({ CanRead: (u.UserRoles?.length ?? 0) > 0 }),
        GetEffectiveRowFilterWhereClause: () => 'OwnerID = @Me',
    } as unknown as EntityInfo);
    mockRunViewFn.mockImplementation(async (params: RunViewParams, contextUser: UserInfo) => {
        if (failing.includes(contextUser.ID)) return { Success: false, ErrorMessage: 'db down', Results: [] };
        const requested = Array.from((params.ExtraFilter ?? '').matchAll(/'([^']+)'/g), m => m[1]);
        const allowed = readable[contextUser.ID] ?? [];
        return { Success: true, Results: requested.filter(id => allowed.includes(id)).map(id => ({ ID: id })) };
    });
}

function usersChecked(): string[] {
    return mockRunViewFn.mock.calls.map(c => (c[1] as UserInfo).ID);
}

describe('SearchParams.Audience — results every reader may see', () => {
    let engine: TestSearchEngine;
    const docs = [makeResult('d1'), makeResult('d2'), makeResult('d3')];

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
    });

    it('keeps only the results every reader may read', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2'], [cal.ID]: ['d2', 'd3'] });
        const out = await engine.TestFilterForAudience(docs, { Readers: [bea, cal] }, asker);
        expect(out.map(r => r.RecordID)).toEqual(['d2']);
    });

    it('checks each reader with the reader as the RunView user, in the order given', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'], [cal.ID]: ['d1', 'd2', 'd3'] });
        await engine.TestFilterForAudience(docs, { Readers: [bea, cal] }, asker);
        expect(usersChecked()).toEqual([bea.ID, cal.ID]);
    });

    it('never widens: a reader who can read more than the caller adds nothing', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3', 'd4'] });
        const out = await engine.TestFilterForAudience([makeResult('d1')], { Readers: [bea] }, asker);
        expect(out.map(r => r.RecordID)).toEqual(['d1']);
    });

    it('skips a reader with the caller\'s own ID and checks a duplicated reader once', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] });
        const beaAgain = user(bea.ID.toUpperCase());
        await engine.TestFilterForAudience(docs, { Readers: [asker, bea, beaAgain] }, asker);
        expect(usersChecked()).toEqual([bea.ID]);
    });

    it('checks readers in parallel and returns nothing when any reader can read nothing', async () => {
        serveDocuments({ [bea.ID]: [], [cal.ID]: ['d1', 'd2', 'd3'] });
        const out = await engine.TestFilterForAudience(docs, { Readers: [bea, cal] }, asker);
        expect(out).toEqual([]);
        expect(usersChecked().sort()).toEqual([bea.ID, cal.ID].sort());
    });

    it('refuses storage-file results under an audience — their permissions were evaluated for the caller only', async () => {
        serveDocuments({ [bea.ID]: ['d1'] });
        const storageHit = makeResult('finance-q3.pdf', 'storage-file');
        const out = await engine.TestFilterForAudience([makeResult('d1'), storageHit], { Readers: [bea] }, asker);
        expect(out.map(r => r.RecordID)).toEqual(['d1']);
    });

    it('keeps storage-file results when there is no audience (unchanged behaviour)', async () => {
        serveDocuments({});
        const storageHit = makeResult('finance-q3.pdf', 'storage-file');
        const out = await engine.TestFilterForAudience([storageHit], undefined, asker);
        expect(out).toEqual([storageHit]);
    });

    it('a reader passed without roles can read nothing, so the room gets nothing', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] });
        const out = await engine.TestFilterForAudience(docs, { Readers: [rolelessUser(bea.ID)] }, asker);
        expect(out).toEqual([]);
        expect(mockRunViewFn).not.toHaveBeenCalled(); // dropped at the entity-level gate, before any RunView
    });

    it('fails closed when a reader\'s RunView fails', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] }, [bea.ID]);
        const out = await engine.TestFilterForAudience(docs, { Readers: [bea] }, asker);
        expect(out).toEqual([]);
    });

    it('ignores a reader with no ID', async () => {
        serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] });
        const noID = { Name: 'ghost' } as UserInfo;
        const out = await engine.TestFilterForAudience(docs, { Readers: [noID, bea] }, asker);
        expect(out.map(r => r.RecordID)).toEqual(['d1', 'd2', 'd3']);
        expect(usersChecked()).toEqual([bea.ID]);
    });

    it('leaves results untouched with no audience, and runs no RunView', async () => {
        serveDocuments({});
        const out = await engine.TestFilterForAudience(docs, undefined, asker);
        expect(out).toBe(docs);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('preserves the input (RRF) order of the survivors', async () => {
        serveDocuments({ [bea.ID]: ['d3', 'd1'] });
        const out = await engine.TestFilterForAudience(docs, { Readers: [bea] }, asker);
        expect(out.map(r => r.RecordID)).toEqual(['d1', 'd3']);
    });

    describe('cache key', () => {
        const base: SearchParams = { Query: 'budget' };

        it('differs between a search run alone and the same search for an audience', () => {
            const alone = engine.TestCacheKey(base, asker);
            const shared = engine.TestCacheKey({ ...base, Audience: { Readers: [bea] } }, asker);
            expect(shared).not.toEqual(alone);
        });

        it('is the same for the same readers in any order or casing, and ignores the caller among the readers', () => {
            const a = engine.TestCacheKey({ ...base, Audience: { Readers: [bea, cal] } }, asker);
            const b = engine.TestCacheKey({ ...base, Audience: { Readers: [cal, user(bea.ID.toUpperCase()), asker] } }, asker);
            expect(a).toEqual(b);
        });

        it('treats an audience that adds no reader like no audience: empty, only the caller, or no IDs', () => {
            const alone = engine.TestCacheKey(base, asker);
            expect(engine.TestCacheKey({ ...base, Audience: { Readers: [] } }, asker)).toEqual(alone);
            expect(engine.TestCacheKey({ ...base, Audience: { Readers: [asker] } }, asker)).toEqual(alone);
            expect(engine.TestCacheKey({ ...base, Audience: { Readers: [{ Name: 'ghost' } as UserInfo] } }, asker)).toEqual(alone);
        });
    });
});
