/**
 * Differential smart-cache merge on a COMPOSITE-key entity (primary-key sweep, class-A fix).
 *
 * The server's `deletedRecordIDs` are `RecordChanges.RecordID` values — the full
 * `F1|v1||F2|v2` segment for a composite key — and `LocalCacheManager.ApplyDifferentialUpdate`
 * keys cached and updated rows the same way. `processSingleSmartCacheResult` used to hand it
 * only `entity.FirstPrimaryKey.Name` (falling back to a literal `'ID'`), so on any entity with
 * more than one key column a delete could never match and rows sharing the first column
 * collapsed into one. Every MJ core entity is single-column keyed, which is why this was
 * invisible in the core product.
 *
 * These tests drive the merge step directly with a composite-key entity in the provider's
 * metadata and assert the merged result the caller receives.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { LocalCacheManager, CachedRunViewResult } from '../generic/localCacheManager';
import { ProviderConfigDataBase, RunViewResult, RunViewWithCacheCheckResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { RunViewParams } from '../views/runView';
import { GetGlobalObjectStore } from '@memberjunction/global';

const TEST_ROLE_ID = 'role-compositekey-diff';
const ENTITY_ID = 'entity-orderlines';
const ENTITY_NAME = 'Composite Order Lines';

/** The two private seams under test, typed so the test stays free of `any`. */
type SmartCacheSeams = {
    clientCacheFingerprint(param: RunViewParams): string;
    processSingleSmartCacheResult<T>(
        param: RunViewParams,
        index: number,
        checkResult: RunViewWithCacheCheckResult<T> | undefined,
        preResolvedCache: Map<string, CachedRunViewResult | null>,
        contextUser?: UserInfo,
    ): Promise<{ result: RunViewResult<T>; cacheHit: boolean; cacheMiss: boolean }>;
};

/** A composite-key entity: (OrderID, LineNo). No column is called ID. */
const COMPOSITE_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: ENTITY_ID,
            Name: ENTITY_NAME,
            SchemaName: 'dbo',
            BaseView: 'vwCompositeOrderLines',
            BaseTable: 'CompositeOrderLine',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            AllowCaching: true,
            TrustServerCacheCompletely: true,
            EntityFields: [
                { ID: `${ENTITY_ID}-f1`, EntityID: ENTITY_ID, Name: 'OrderID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: `${ENTITY_ID}-f2`, EntityID: ENTITY_ID, Name: 'LineNo', Type: 'int', IsPrimaryKey: true, Sequence: 2 },
                { ID: `${ENTITY_ID}-f3`, EntityID: ENTITY_ID, Name: 'Product', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 3 },
            ],
            EntityPermissions: [
                { EntityID: ENTITY_ID, RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    get EntityFields() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []);
    },
    get EntityPermissions() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []);
    },
    EntityFieldValues: [],
    EntityRelationships: [],
    EntitySettings: [],
    ApplicationEntities: [],
    ApplicationSettings: [],
    Roles: [{ ID: TEST_ROLE_ID, Name: 'CompositeKeyDiffRole' }],
    RowLevelSecurityFilters: [],
    AuditLogTypes: [],
    Authorizations: [],
    QueryCategories: [],
    Queries: [],
    QueryFields: [],
    QueryPermissions: [],
    QueryEntities: [],
    QueryParameters: [],
    EntityDocumentTypes: [],
    Libraries: [],
    ExplorerNavigationItems: [],
};

function line(orderId: string, lineNo: number, product: string): Record<string, unknown> {
    return { OrderID: orderId, LineNo: lineNo, Product: product, __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' };
}

/** Two orders, two lines each — every OrderID is shared by two rows. */
function cachedRows(): Record<string, unknown>[] {
    return [
        line('order-a', 1, 'Widget'),
        line('order-a', 2, 'Gadget'),
        line('order-b', 1, 'Sprocket'),
        line('order-b', 2, 'Flange'),
    ];
}

function makeUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'compositekey-user-1';
    u.Name = 'Composite Key Test User';
    u.Email = 'compositekey-user-1@test.com';
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: u.ID, RoleID: TEST_ROLE_ID, Role: 'CompositeKeyDiffRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

describe('processSingleSmartCacheResult — differential merge on a composite-key entity', () => {
    let provider: TestMetadataProvider;
    let seams: SmartCacheSeams;
    let user: UserInfo;
    // CacheLocal is what makes the slot write-eligible on a client-style (non-trusting) provider.
    const param: RunViewParams = { EntityName: ENTITY_NAME, ResultType: 'simple', CacheLocal: true };

    beforeEach(async () => {
        resetLocalCacheManager();
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider(), {
            enabled: true,
            maxSizeBytes: 50 * 1024 * 1024,
            defaultTTLMs: 5 * 60 * 1000,
            evictionPolicy: 'lru',
        });

        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(COMPOSITE_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        seams = provider as unknown as SmartCacheSeams;
        user = makeUser();

        await LocalCacheManager.Instance.SetRunViewResult(
            seams.clientCacheFingerprint(param),
            param,
            cachedRows(),
            '2026-01-01T00:00:00.000Z',
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('removes exactly the row named by a full composite RecordID segment and keeps its sibling', async () => {
        const checkResult: RunViewWithCacheCheckResult<Record<string, unknown>> = {
            viewIndex: 0,
            status: 'differential',
            differentialData: {
                updatedRows: [],
                // What RecordChanges.RecordID holds for a composite key.
                deletedRecordIDs: ['OrderID|order-a||LineNo|2'],
            },
            maxUpdatedAt: '2026-01-02T00:00:00.000Z',
            rowCount: 3,
        };

        const outcome = await seams.processSingleSmartCacheResult(param, 0, checkResult, new Map(), user);

        expect(outcome.cacheHit).toBe(true);
        expect(outcome.result.Success).toBe(true);
        const rows = outcome.result.Results as Record<string, unknown>[];
        expect(rows.length).toBe(3);
        expect(rows.some(r => r['OrderID'] === 'order-a' && r['LineNo'] === 2)).toBe(false);
        // The sibling sharing OrderID 'order-a' is untouched — a first-column key would have
        // either missed the delete entirely or treated both lines as one record.
        expect(rows.some(r => r['OrderID'] === 'order-a' && r['LineNo'] === 1)).toBe(true);
    });

    it('keeps updated rows that share their first key column as distinct records', async () => {
        const checkResult: RunViewWithCacheCheckResult<Record<string, unknown>> = {
            viewIndex: 0,
            status: 'differential',
            differentialData: {
                updatedRows: [line('order-b', 1, 'Sprocket v2'), line('order-b', 2, 'Flange v2')],
                deletedRecordIDs: [],
            },
            maxUpdatedAt: '2026-01-02T00:00:00.000Z',
            rowCount: 4,
        };

        const outcome = await seams.processSingleSmartCacheResult(param, 0, checkResult, new Map(), user);

        expect(outcome.cacheHit).toBe(true);
        const rows = outcome.result.Results as Record<string, unknown>[];
        expect(rows.length).toBe(4);
        expect(rows.find(r => r['OrderID'] === 'order-b' && r['LineNo'] === 1)?.['Product']).toBe('Sprocket v2');
        expect(rows.find(r => r['OrderID'] === 'order-b' && r['LineNo'] === 2)?.['Product']).toBe('Flange v2');
        expect(rows.find(r => r['OrderID'] === 'order-a' && r['LineNo'] === 1)?.['Product']).toBe('Widget');
    });

    it('does not invent an ID key for an entity the provider cannot resolve — it refetches in full', async () => {
        const unknownParam: RunViewParams = { EntityName: 'Not In Metadata', ResultType: 'simple', CacheLocal: true };
        const fresh: RunViewResult = {
            Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '',
        };
        const runViewSpy = vi.spyOn(provider, 'RunView').mockResolvedValue(fresh);
        const checkResult: RunViewWithCacheCheckResult<Record<string, unknown>> = {
            viewIndex: 0,
            status: 'differential',
            differentialData: { updatedRows: [], deletedRecordIDs: ['ID|whatever'] },
            maxUpdatedAt: '2026-01-02T00:00:00.000Z',
            rowCount: 0,
        };

        const outcome = await seams.processSingleSmartCacheResult(unknownParam, 0, checkResult, new Map(), user);

        expect(outcome.cacheMiss).toBe(true);
        expect(outcome.cacheHit).toBe(false);
        expect(runViewSpy).toHaveBeenCalledTimes(1);
        expect(runViewSpy.mock.calls[0][0]).toMatchObject({ EntityName: 'Not In Metadata', BypassCache: true, CacheLocal: false });
    });
});
