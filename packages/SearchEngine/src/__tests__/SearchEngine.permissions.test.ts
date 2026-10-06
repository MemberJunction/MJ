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
import { SearchScopePermissionResolver } from '../permissions/SearchScopePermissionResolver';
import type { SearchScopePermissionSource } from '../permissions/SearchScopePermissionResolver';

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

function makeResult(
    recordId: string,
    entityName: string,
    resultType: SearchResultItem['ResultType'] = 'entity-record',
    sourceType: string = 'entity'
): SearchResultItem {
    return {
        ID: `r-${recordId}`,
        EntityName: entityName,
        RecordID: recordId,
        SourceType: sourceType,
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
    PrimaryKeys: Array<{ Name: string }>;
    GetUserPermisions: (u: UserInfo) => { CanRead: boolean } | null;
    UserExemptFromRowLevelSecurity: (u: UserInfo, _t: number) => boolean;
    GetEffectiveRowFilterWhereClause: (u: UserInfo, _t: number, _prefix: string) => string;
}

function makeEntity(opts: {
    Name: string;
    CanRead: boolean;
    Exempt: boolean;
    RlsClause: string;
    /** Primary key column name(s); defaults to a single `ID`. Pass several for a composite key. */
    PrimaryKeyNames?: string[];
}): MockEntity {
    const keys = (opts.PrimaryKeyNames ?? ['ID']).map((Name) => ({ Name }));
    return {
        Name: opts.Name,
        FirstPrimaryKey: keys[0],
        PrimaryKeys: keys,
        GetUserPermisions: () => ({ CanRead: opts.CanRead }),
        UserExemptFromRowLevelSecurity: () => opts.Exempt,
        GetEffectiveRowFilterWhereClause: () => opts.RlsClause,
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

        // ─────────────────────────────────────────────────────────────────
        // Ownership verification when no row filter applies.
        //
        // `CanRead` establishes that the user may read THIS ENTITY. It does not establish that the
        // results are this entity's records — `EntityName` is provider output, and for the vector and
        // 3rd-party lanes it comes from the index (vector metadata's `Entity` key, or the index name).
        // Admitting on the label alone lets whoever writes the index choose which entity's permissions
        // are evaluated.
        //
        // Lanes that queried the entity through RunView are exempt because their ids came out of it.
        // ─────────────────────────────────────────────────────────────────
        const readableNoRowFilter = () => makeEntity({
            Name: 'Customers',
            CanRead: true,
            Exempt: false,
            RlsClause: '',      // no row filter for this user/entity
        }) as unknown as EntityInfo;

        it('drops a vector hit whose record id is not a record of the entity it claims', async () => {
            // The defect this closes: before, the label alone admitted the group.
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] }); // id is not a Customer

            const out = await engine.TestFilterByPermissions(
                [makeResult('not-a-customer', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
            expect(mockRunViewFn).toHaveBeenCalled();
        });

        it('keeps a vector hit whose record id IS a record of the entity', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'aaa' }] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('verifies an entity whose single primary key is not named ID against that column', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Individuals', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['individual_id'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ individual_id: 'ind-1' }] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('ind-1', 'Individuals', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(1);
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string; Fields: string[] };
            expect(params.ExtraFilter).toBe("individual_id IN ('ind-1')");
            expect(params.Fields).toEqual(['individual_id']);
        });

        it('verifies a composite-key result with one (F1=.. AND F2=..) term per record instead of IN() on the first column', async () => {
            // Before: `OrderID IN ('OrderID|o1||LineNo|3')` could never match, and because this
            // check fails closed every composite-key result was dropped as unauthorized.
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ OrderID: 'o1', LineNo: 3 }] });

            const out = await engine.TestFilterByPermissions(
                [
                    makeResult('OrderID|o1||LineNo|3', 'Order Lines', 'entity-record', 'vector'),
                    makeResult('OrderID|o2||LineNo|9', 'Order Lines', 'entity-record', 'vector'), // not returned → dropped
                ],
                user
            );

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('OrderID|o1||LineNo|3');
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string; Fields: string[] };
            expect(params.ExtraFilter).toBe("(OrderID='o1' AND LineNo='3') OR (OrderID='o2' AND LineNo='9')");
            expect(params.Fields).toEqual(['OrderID', 'LineNo']);
        });

        it('matches a composite-key result regardless of segment field-name casing or UUID casing', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ OrderID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', LineNo: 3 }],
            });

            const out = await engine.TestFilterByPermissions(
                [makeResult('orderid|a1b2c3d4-e5f6-7890-abcd-ef1234567890||lineno|3', 'Order Lines', 'entity-record', 'vector')],
                user
            );

            expect(out).toHaveLength(1);
        });

        it('ANDs the composite membership with the row filter when one applies', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: "Region='West'", PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            await engine.TestFilterByPermissions(
                [makeResult('OrderID|o1||LineNo|3', 'Order Lines', 'entity-record', 'entity')], user
            );

            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string };
            expect(params.ExtraFilter).toBe("((OrderID='o1' AND LineNo='3')) AND (Region='West')");
        });

        it('does NOT verify entity-lane results — the hot path costs nothing extra', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'entity')], user
            );

            expect(out).toHaveLength(1);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('does NOT verify full-text results either', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'fulltext')], user
            );

            expect(out).toHaveLength(1);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('verifies an unrecognised 3rd-party SourceType — the allowlist fails safe', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'azure-ai-search')], user
            );

            expect(out).toHaveLength(0);
        });

        it('partitions a mixed group: entity-lane passes through, vector hit is verified', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            // Only the entity-lane id is a real Customer; the vector hit's id is not.
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions([
                makeResult('from-entity-lane', 'Customers', 'entity-record', 'entity'),
                makeResult('from-vector-lane', 'Customers', 'entity-record', 'vector'),
            ], user);

            expect(out.map(r => r.RecordID)).toEqual(['from-entity-lane']);
        });

        it('still verifies ownership for an RLS-EXEMPT user', async () => {
            // Exemption says which ROWS of an entity the user may see. It says nothing about whether a
            // result is that entity's row at all, so the check still applies.
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true,
                RlsClause: '',
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('not-a-customer', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
        });

        it('fails closed when the ownership RunView fails', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'SQL timeout' });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase D — the SKILL principal, and time/tenant scoping on a grant.
//
// A skill is a principal in the same sense an agent is, so these mirror the agent rules
// exactly. The pure helpers (window + tenant applicability) are asserted directly because
// they are where an off-by-one or a null-handling slip would silently widen a grant.
// ─────────────────────────────────────────────────────────────────────────────
describe('SearchScopePermissionResolver — skill principal and grant scoping', () => {
    class TestResolver extends SearchScopePermissionResolver {
        public InWindow(row: unknown, now: Date) {
            return (this as unknown as { isGrantInWindow: (r: unknown, n: Date) => boolean })
                .isGrantInWindow(row, now);
        }
        public ForTenant(row: unknown, tenant: string | null) {
            return (this as unknown as { isGrantForTenant: (r: unknown, t: string | null) => boolean })
                .isGrantForTenant(row, tenant);
        }
        public Applicable(rows: unknown[], tenant: string | null, now: Date) {
            return (this as unknown as { applicableGrants: (r: unknown[], t: string | null, n: Date) => unknown[] })
                .applicableGrants(rows, tenant, now);
        }
    }
    const r = new TestResolver();
    const NOW = new Date('2026-07-27T12:00:00Z');
    const ORG_A = 'AAAAAAAA-0000-4000-8000-000000000001';
    const ORG_B = 'BBBBBBBB-0000-4000-8000-000000000002';

    describe('time window', () => {
        it('a grant with no window is always in force (every pre-existing row)', () => {
            expect(r.InWindow({}, NOW)).toBe(true);
            expect(r.InWindow({ StartAt: null, EndAt: null }, NOW)).toBe(true);
        });
        it('honours an open window and rejects one not yet started or already ended', () => {
            expect(r.InWindow({ StartAt: '2026-07-01T00:00:00Z', EndAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(true);
            expect(r.InWindow({ StartAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(false);
            expect(r.InWindow({ EndAt: '2026-07-01T00:00:00Z' }, NOW)).toBe(false);
        });
        it('treats a half-open window correctly', () => {
            expect(r.InWindow({ StartAt: '2026-07-01T00:00:00Z' }, NOW)).toBe(true);
            expect(r.InWindow({ EndAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(true);
        });
    });

    describe('tenant applicability', () => {
        it('a grant with no tenant applies everywhere, including to an untenanted search', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: null }, ORG_A)).toBe(true);
            expect(r.ForTenant({}, null)).toBe(true);
        });
        it('a tenant-scoped grant applies ONLY to that tenant', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, ORG_A)).toBe(true);
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, ORG_B)).toBe(false);
        });
        it('a tenant-scoped grant does NOT apply when the search supplies no tenant', () => {
            // "This grant is for org A" cannot be honoured by an untenanted search, so the safe
            // reading is that it does not apply.
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, null)).toBe(false);
        });
        it('matches tenants case-insensitively (uuid casing varies by source)', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A.toLowerCase() }, ORG_A.toUpperCase())).toBe(true);
        });
    });

    describe('applicableGrants composes both filters', () => {
        it('keeps only rows in force for this tenant', () => {
            const rows = [
                { ID: 'keep-untenanted-unwindowed' },
                { ID: 'keep-matching-tenant', PrimaryScopeRecordID: ORG_A },
                { ID: 'drop-other-tenant', PrimaryScopeRecordID: ORG_B },
                { ID: 'drop-expired', EndAt: '2026-01-01T00:00:00Z' },
                { ID: 'drop-future', StartAt: '2027-01-01T00:00:00Z' },
            ];
            const kept = r.Applicable(rows, ORG_A, NOW).map((x) => (x as { ID: string }).ID);
            expect(kept).toEqual(['keep-untenanted-unwindowed', 'keep-matching-tenant']);
        });
    });

    describe('skill sources mirror the agent sources', () => {
        it('exposes SkillNone / SkillAssignedNotListed / SkillUnscopedAll', () => {
            // Compile-time assertion that the union grew; a typo here fails the build.
            const sources: SearchScopePermissionSource[] = ['SkillNone', 'SkillAssignedNotListed', 'SkillUnscopedAll'];
            expect(sources).toHaveLength(3);
        });
    });
});
