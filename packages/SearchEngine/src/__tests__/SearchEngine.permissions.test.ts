/**
 * Tests for SearchEngine's `filterByPermissions` safety net.
 *
 * Closes the P2A.8 / plans/search-scopes-rag-plus/RAG_plan.md §5.4 PM-10 gap: even when the resolver allows
 * the search and the agent has SearchScopeAccess='All', records the calling
 * user cannot read at the entity layer must NEVER appear in the result.
 *
 * The plan also requires asserting that forbidden records never reach the
 * fusion stage — that is a per-provider push-down audit and is tracked
 * separately. This file covers the post-fusion safety net which is the last
 * line of defense if any provider's push-down is incomplete.
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
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';

class TestSearchEngine extends SearchEngine {
    public async TestFilterByPermissions(
        results: SearchResultItem[],
        contextUser: UserInfo,
    ): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }
    // Stub IMetadataProvider that delegates to the existing mocks. The merged
    // multi-provider refactor reads `this.Base.ProviderToUse` which isn't
    // initialized when tests bypass Config().
    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (name: string) => mockEntityByName(name),
            Entities: [],
        } as unknown as IMetadataProvider;
    }
}

function createUser(id: string): UserInfo {
    return { ID: id, Name: 'Test User', Email: 't@example.com' } as UserInfo;
}

function makeResult(recordId: string, entityName: string, resultType: SearchResultItem['ResultType'] = 'entity-record'): SearchResultItem {
    return {
        ID: `r-${recordId}`,
        EntityName: entityName,
        RecordID: recordId,
        SourceType: 'entity',
        Title: `record ${recordId}`,
        Snippet: `snippet for ${recordId}`,
        Score: 0.9,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: resultType,
    };
}

interface MockEntity {
    Name: string;
    FirstPrimaryKey: { Name: string };
    GetUserPermisions: (u: UserInfo) => { CanRead: boolean } | null;
    UserExemptFromRowLevelSecurity: (u: UserInfo, _t: number) => boolean;
    GetUserRowLevelSecurityWhereClause: (u: UserInfo, _t: number, _prefix: string) => string;
}

function makeEntity(opts: {
    Name: string;
    CanRead: boolean;
    Exempt: boolean;
    RlsClause: string;
    PrimaryKeyName?: string;
}): MockEntity {
    return {
        Name: opts.Name,
        FirstPrimaryKey: { Name: opts.PrimaryKeyName ?? 'ID' },
        GetUserPermisions: () => ({ CanRead: opts.CanRead }),
        UserExemptFromRowLevelSecurity: () => opts.Exempt,
        GetUserRowLevelSecurityWhereClause: () => opts.RlsClause,
    };
}

describe('SearchEngine.filterByPermissions (safety net)', () => {
    let engine: TestSearchEngine;
    const user = createUser('00000000-0000-0000-0000-000000000001');

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
    });

    describe('PM-10: RLS-blocked records never appear in results', () => {
        it('drops rows the user cannot read under RLS, even when entity-level CanRead is true', async () => {
            // Two rows for the same entity. RLS allows one, blocks the other.
            const allowedRow = makeResult('aaa', 'Customers');
            const forbiddenRow = makeResult('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: 'OwnerID = @CurrentUserID',
            }) as unknown as EntityInfo);
            // RunView simulates RLS: returns only the allowed row's ID
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'aaa' }],
            });

            const out = await engine.TestFilterByPermissions([allowedRow, forbiddenRow], user);

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('drops ALL rows for the entity when the user lacks entity-level CanRead', async () => {
            const r1 = makeResult('aaa', 'Customers');
            const r2 = makeResult('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: false, // entity-level deny
                Exempt: false,
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2], user);

            expect(out).toHaveLength(0);
            // RunView must NOT have been called — no point checking RLS when CanRead is false
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('drops rows when the entity is unknown to MJ Metadata (fail-closed)', async () => {
            const r1 = makeResult('aaa', 'NonExistentEntity');
            mockEntityByName.mockImplementation(() => { throw new Error('Unknown entity'); });

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(0);
        });

        it('drops rows when the RunView used to validate RLS fails (fail-closed)', async () => {
            const r1 = makeResult('aaa', 'Customers');
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: 'OwnerID = @CurrentUserID',
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'SQL timeout' });

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(0);
        });
    });

    describe('Allowed cases', () => {
        it('passes all rows through when the user is RLS-exempt', async () => {
            const r1 = makeResult('aaa', 'Customers');
            const r2 = makeResult('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true, // exempt — no RLS check
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2], user);

            expect(out).toHaveLength(2);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('passes all rows through when there is no RLS clause for the user/entity', async () => {
            const r1 = makeResult('aaa', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: '', // no clause produced — pass through
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('preserves input order (RRF / re-rank order) of permitted rows', async () => {
            // Three rows from one entity, all RLS-permitted. The function groups by
            // entity internally, so we want to confirm the original order is restored.
            const r1 = makeResult('first', 'Customers');
            const r2 = makeResult('second', 'Customers');
            const r3 = makeResult('third', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true,
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2, r3], user);

            expect(out.map(r => r.RecordID)).toEqual(['first', 'second', 'third']);
        });

        it('passes storage-file results through without entity-level checks (handled by FileStorageAccountPermission)', async () => {
            const fileResult = makeResult('file-1', '__synthetic__', 'storage-file');
            // Note: no mockEntityByName configured — confirms storage path doesn't ask Metadata
            const out = await engine.TestFilterByPermissions([fileResult], user);
            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('file-1');
        });
    });
});
