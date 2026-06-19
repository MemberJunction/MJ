/**
 * Tests for the Fields-override gate in PreRunView / PreRunViews.
 *
 * Background: a prior cache-poisoning fix unconditionally rewrote `params.Fields`
 * to the entity's full column list before running the DB query, so that a single
 * cache entry per entity+filter could satisfy any future query for the same
 * entity+filter regardless of which subset of fields was requested.
 *
 * The downside: that override fired even for calls that would never be cached
 * (entity has AllowCaching=false, BypassCache=true, or no cache mode active),
 * so non-cacheable queries shipped wide rows from DB→GraphQL→wire for no benefit.
 *
 * The fix gates the override on a `willCache` predicate that mirrors the
 * cache-check condition. These tests lock in:
 *   1. The override fires when caching IS active (cache coherence preserved).
 *   2. The override is skipped when caching is NOT active (narrow Fields end-to-end).
 *   3. The cache-check itself reuses the same predicate, closing two pre-existing
 *      parity gaps between PreRunView (single) and PreRunViews (batched):
 *        - PreRunView previously didn't check BypassCache.
 *        - PreRunViews previously didn't call IsServerCacheAllowedForEntity,
 *          so it polluted the cache for entities with AllowCaching=false.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { LocalCacheManager } from '../generic/localCacheManager';

// ---------------------------------------------------------------------------
// Fake entity registry — controlled per-test
// ---------------------------------------------------------------------------
interface FakeEntity {
    Name: string;
    AllowCaching: boolean;
    TrustServerCacheCompletely: boolean;
    Fields: { Name: string }[];
}

const FULL_FIELDS = ['ID', 'Name', 'Status', 'Description', 'CreatedAt', 'UpdatedAt'];
const NARROW_FIELDS = ['ID', 'Name'];

function makeEntity(overrides: Partial<FakeEntity> & { Name: string }): FakeEntity {
    return {
        AllowCaching: true,
        TrustServerCacheCompletely: true,
        Fields: FULL_FIELDS.map(n => ({ Name: n })),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test provider — captures the params handed to InternalRunView/Views and
// lets each test control entity metadata + cache mode.
//
// Note: ProviderBase.RunView (single) routes through TWO different code paths:
//   - server mode (TrustLocalCacheCompletely=true && !BypassCache): Pre → InternalRunView
//   - client mode (or BypassCache): delegates to RunViews → InternalRunViews
// We capture from both into a single `captured` array so callers can read
// `lastCapturedFields(p)` without caring which path executed.
// ---------------------------------------------------------------------------
class FieldsOverrideTestProvider extends ProviderBase {
    public captured: RunViewParams[] = [];
    public capturedBatchSizes: number[] = [];
    public entities = new Map<string, FakeEntity>();
    public trustLocalCache = false;
    // Optional: rows to return from InternalRunView/Views. When set, the same rows
    // are returned on every call regardless of EntityName/filter. This lets the
    // cache-coherence tests verify that PostRunView stores wide rows and that
    // a cache HIT serves them filtered to the caller's narrow Fields.
    public mockRunViewRows: Record<string, unknown>[] | null = null;

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }

    protected async InternalRunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        // Snapshot Fields so later mutations don't affect assertions
        this.captured.push({ ...params, Fields: params.Fields ? [...params.Fields] : params.Fields });
        this.capturedBatchSizes.push(1);
        const rows = (this.mockRunViewRows ? [...this.mockRunViewRows] : []) as unknown as T[];
        return {
            Success: true,
            Results: rows,
            TotalRowCount: rows.length,
            ExecutionTime: 0,
            RowCount: rows.length,
            UserViewRunID: '',
            ErrorMessage: '',
        };
    }

    protected async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        for (const p of params) {
            this.captured.push({ ...p, Fields: p.Fields ? [...p.Fields] : p.Fields });
        }
        this.capturedBatchSizes.push(params.length);
        return params.map(() => {
            const rows = (this.mockRunViewRows ? [...this.mockRunViewRows] : []) as unknown as T[];
            return {
                Success: true,
                Results: rows,
                TotalRowCount: rows.length,
                ExecutionTime: 0,
                RowCount: rows.length,
                UserViewRunID: '',
                ErrorMessage: '',
            };
        });
    }

    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { Success: true, Results: [] };
    }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'fields-override-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }

    // --- Hooks the production code calls ---
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.entities.get(name) as unknown as EntityInfo | undefined;
    }

    // The default IsServerCacheAllowedForEntity calls EntityByName + LocalCacheManager.
    // We override to read directly from our fake entity map so tests don't need to
    // initialize LocalCacheManager just to flip a boolean.
    protected override IsServerCacheAllowedForEntity(params: RunViewParams): boolean {
        if (!params.EntityName) return true;
        const e = this.entities.get(params.EntityName);
        if (!e) return true;
        if (e.Name === 'MJ: Record Changes') return false;
        if (!e.AllowCaching) return false;
        return e.TrustServerCacheCompletely !== false;
    }

    protected override get TrustLocalCacheCompletely(): boolean {
        return this.trustLocalCache;
    }

    public reset(): void {
        this.captured = [];
        this.capturedBatchSizes = [];
    }
}

// Helpers — `captured` is a flat list of every params object that reached
// the DB layer, regardless of whether RunView routed via InternalRunView (server)
// or InternalRunViews (client/batch).
function lastCapturedFields(p: FieldsOverrideTestProvider): string[] | undefined {
    const last = p.captured[p.captured.length - 1];
    return last?.Fields;
}
function capturedFieldsAt(p: FieldsOverrideTestProvider, index: number): string[] | undefined {
    return p.captured[index]?.Fields;
}

// ===========================================================================
// PreRunView (single)
// ===========================================================================
describe('ProviderBase Fields-Override Gate — PreRunView', () => {
    let provider: FieldsOverrideTestProvider;

    beforeEach(() => {
        provider = new FieldsOverrideTestProvider();
        provider.entities.set('Cacheable',  makeEntity({ Name: 'Cacheable' }));
        provider.entities.set('NoCaching',  makeEntity({ Name: 'NoCaching', AllowCaching: false }));
        provider.entities.set('NoTrust',    makeEntity({ Name: 'NoTrust', TrustServerCacheCompletely: false }));
        provider.entities.set('MJ: Record Changes', makeEntity({ Name: 'MJ: Record Changes' }));
        // Single-RunView in client mode delegates to RunViews → could coalesce
        // identical concurrent calls. Disable so each test executes deterministically.
        ProviderBase.CoalesceWindowMs = 0;
    });

    describe('Override fires when caching IS active', () => {
        it('CacheLocal=true on a cache-eligible entity → Fields is rewritten to all entity fields', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });

        it('TrustLocalCacheCompletely=true (server mode) on a cache-eligible entity → Fields is rewritten', async () => {
            provider.trustLocalCache = true;
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
            });
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });

        it('CacheLocal=true with no Fields requested → Fields is still rewritten (caller wanted all anyway)', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });
    });

    describe('Override is SKIPPED when caching is NOT active', () => {
        it('No CacheLocal, no TrustLocalCacheCompletely → caller’s narrow Fields preserved', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('Entity AllowCaching=false → caller’s narrow Fields preserved even with CacheLocal=true', async () => {
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('Entity AllowCaching=false + TrustLocalCacheCompletely=true → caller’s narrow Fields preserved (Izzy scenario)', async () => {
            // This is the Izzy stage rasa scenario: server-mode provider, but the
            // entity opts out of caching — without the gate, the override fires
            // and the SQL pulls all 57 columns including multi-MB content fields.
            provider.trustLocalCache = true;
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('Entity TrustServerCacheCompletely=false → caller’s narrow Fields preserved', async () => {
            await provider.RunView({
                EntityName: 'NoTrust',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('MJ: Record Changes (always cache-exempt) → caller’s narrow Fields preserved', async () => {
            // Even when the entity claims AllowCaching=true, Record Changes is hard-coded
            // to skip caching at line 2138 in providerBase.ts because rows come from raw SQL.
            await provider.RunView({
                EntityName: 'MJ: Record Changes',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('BypassCache=true on a cache-eligible entity → caller’s narrow Fields preserved (parity fix)', async () => {
            // Pre-fix: PreRunView didn't check BypassCache, so this call would have its
            // Fields rewritten even though no cache write was ever going to happen.
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
                BypassCache: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('BypassCache=true under TrustLocalCacheCompletely=true → caller’s narrow Fields preserved', async () => {
            provider.trustLocalCache = true;
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                BypassCache: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('Empty Fields ([]) on non-cached call stays empty (caller wants all on the wire)', async () => {
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: [],
            });
            // Caller's Fields was [], gate skipped the override, so it stays [].
            expect(lastCapturedFields(provider)).toEqual([]);
        });
    });
});

// ===========================================================================
// PreRunViews (batched)
// ===========================================================================
describe('ProviderBase Fields-Override Gate — PreRunViews', () => {
    let provider: FieldsOverrideTestProvider;

    beforeEach(() => {
        provider = new FieldsOverrideTestProvider();
        provider.entities.set('Cacheable', makeEntity({ Name: 'Cacheable' }));
        provider.entities.set('NoCaching', makeEntity({ Name: 'NoCaching', AllowCaching: false }));
        provider.entities.set('MJ: Record Changes', makeEntity({ Name: 'MJ: Record Changes' }));
        // Disable coalescing so each test is independent
        ProviderBase.CoalesceWindowMs = 0;
    });

    it('Mixed batch: cacheable entity gets override, non-cacheable does not', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS, CacheLocal: true },
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
    });

    it('Batch under TrustLocalCacheCompletely=true: per-entity gating still applies', async () => {
        provider.trustLocalCache = true;
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS },
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS },
            { EntityName: 'MJ: Record Changes', Fields: NARROW_FIELDS },
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
        expect(capturedFieldsAt(provider,2)).toEqual(NARROW_FIELDS);
    });

    it('Batch with BypassCache=true on every item: every item keeps narrow Fields', async () => {
        provider.trustLocalCache = true;
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, BypassCache: true },
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS, BypassCache: true },
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(NARROW_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
    });

    it('Batch in client mode (no CacheLocal anywhere): every item keeps narrow Fields', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS },
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS },
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(NARROW_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
    });

    it('Batch with mix of CacheLocal flags: per-item gating respects each flag', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: false },
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
    });

    it('Batch with one BypassCache=true item under server mode: only that item keeps narrow Fields', async () => {
        provider.trustLocalCache = true;
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS },                      // server-mode → override
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, BypassCache: true },   // bypassed → no override
        ]);
        expect(capturedFieldsAt(provider,0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider,1)).toEqual(NARROW_FIELDS);
    });

    it('Empty batch: no errors, no captures', async () => {
        const result = await provider.RunViews([]);
        expect(result).toEqual([]);
        expect(provider.captured).toEqual([]);
    });
});

// ===========================================================================
// Edge cases — boundary inputs and subtle interactions
// ===========================================================================
describe('ProviderBase Fields-Override Gate — Edge cases', () => {
    let provider: FieldsOverrideTestProvider;
    const originalDedupLinger = ProviderBase.DedupLingerMs;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;

    beforeEach(() => {
        provider = new FieldsOverrideTestProvider();
        provider.entities.set('Cacheable', makeEntity({ Name: 'Cacheable' }));
        provider.entities.set('NoCaching', makeEntity({ Name: 'NoCaching', AllowCaching: false }));
        // Disable dedup/coalesce for sequential-call tests — otherwise identical
        // back-to-back RunView calls return cached linger results without ever
        // touching InternalRunView/InternalRunViews.
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
    });

    describe('Falsy flag values', () => {
        it('BypassCache=false (explicit) does NOT block the override on a cacheable entity', async () => {
            // BypassCache being explicitly false is identical to undefined — gate should treat both as "do cache".
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
                BypassCache: false,
            });
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });

        it('CacheLocal=false (explicit) does NOT enable the override', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: false,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('Both flags explicitly false on a cacheable entity → narrow Fields preserved', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: false,
                BypassCache: false,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });
    });

    describe('Caller mutation safety', () => {
        it('Gate-skipped path leaves the caller’s Fields array reference intact', async () => {
            // Important: when the override is skipped, the caller's array should reach the
            // DB layer untouched — production code should not silently swap or wrap it.
            // This is what allows callers to reuse a constant Fields array across many calls.
            const callerFields = ['ID', 'Name'];
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: callerFields,
            });
            // The captured snapshot equals what the caller passed (we deep-copy in InternalRunView,
            // so identity check on the captured copy is meaningless — but we can verify the
            // caller's original array was not mutated).
            expect(callerFields).toEqual(['ID', 'Name']); // unchanged
        });

        it('Gate-fired path replaces params.Fields with a fresh array (does NOT mutate caller’s array)', async () => {
            // The override does `params.Fields = entity.Fields.map(...)` which assigns a NEW array
            // to the params object. The caller's original array reference (held externally) is
            // unchanged.
            const callerFields = ['ID', 'Name'];
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: callerFields,
                CacheLocal: true,
            });
            // Caller's array was not pushed-to or sorted-in-place
            expect(callerFields).toEqual(['ID', 'Name']);
            // But the params reaching InternalRunView has the wide list
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });
    });

    describe('ResultType variants', () => {
        // Note: ResultType='entity_object' has its OWN unconditional Fields override at
        // PreProcessRunView (line ~2288 in providerBase.ts) which runs INSIDE concrete
        // provider subclasses, AFTER the gate. So entity_object always ends up with full
        // fields regardless of the gate — the gate doesn't break that contract.
        // This test asserts the gate's narrow-Fields behavior for the simple case which
        // is what production code paths actually flow through.

        it('ResultType="simple" on non-cached entity → narrow Fields preserved', async () => {
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
                ResultType: 'simple',
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('ResultType="count_only" on non-cached entity → narrow Fields preserved (no crash)', async () => {
            // count_only doesn't return rows, so Fields effectively doesn't matter — but
            // the gate code path must not crash on this ResultType.
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
                ResultType: 'count_only',
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });

        it('ResultType="entity_object" on non-cached entity → gate skips override; PreProcessRunView in concrete provider handles full-fields requirement separately', async () => {
            // The base ProviderBase gate skips the override (entity is non-cacheable).
            // In production, a concrete provider's PreProcessRunView would then run AFTER
            // and force Fields to full for entity_object. We're testing the base gate here:
            // it should not interfere — narrow Fields reach our InternalRunView (which is
            // standing in for what would have been routed through PreProcessRunView).
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
                ResultType: 'entity_object',
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(NARROW_FIELDS);
        });
    });

    describe('Sequential call independence', () => {
        it('Two sequential RunView calls: each gate decision is independent', async () => {
            // First: narrow Fields preserved (non-cached entity)
            await provider.RunView({
                EntityName: 'NoCaching',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(capturedFieldsAt(provider, 0)).toEqual(NARROW_FIELDS);

            // Second: full Fields (cacheable entity)
            await provider.RunView({
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            });
            expect(capturedFieldsAt(provider, 1)).toEqual(FULL_FIELDS);
        });

        it('Two sequential RunViews calls (batched): each call’s gating is independent', async () => {
            await provider.RunViews([
                { EntityName: 'NoCaching', Fields: NARROW_FIELDS, CacheLocal: true },
            ]);
            expect(capturedFieldsAt(provider, 0)).toEqual(NARROW_FIELDS);

            await provider.RunViews([
                { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
            ]);
            expect(capturedFieldsAt(provider, 1)).toEqual(FULL_FIELDS);
        });

        it('Same params object passed twice: second call observes first call’s mutation, but gate behavior is consistent', async () => {
            // Production hazard: PreRunView mutates params.Fields in place (line 1252).
            // If a caller reuses the same params object, the second call sees the wide
            // Fields list left behind. This test documents that current behavior — both
            // captures end up with FULL_FIELDS — so future changes don't accidentally
            // make the override non-mutating without the team being aware.
            const params = {
                EntityName: 'Cacheable',
                Fields: NARROW_FIELDS,
                CacheLocal: true,
            };
            await provider.RunView({ ...params }); // pass a fresh copy with same Fields reference
            expect(capturedFieldsAt(provider, 0)).toEqual(FULL_FIELDS);

            await provider.RunView({ ...params });
            expect(capturedFieldsAt(provider, 1)).toEqual(FULL_FIELDS);
        });
    });

    describe('No Fields requested (caller wants all)', () => {
        it('Cacheable entity, undefined Fields → ends up with FULL_FIELDS (override fires)', async () => {
            await provider.RunView({
                EntityName: 'Cacheable',
                CacheLocal: true,
            });
            expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        });

        it('Non-cached entity, undefined Fields → reaches DB as undefined (no override, caller didn’t ask for narrow either)', async () => {
            await provider.RunView({
                EntityName: 'NoCaching',
                CacheLocal: true,
            });
            // Caller passed no Fields, gate skipped override → params.Fields stays undefined.
            // The DB query layer (concrete provider) interprets undefined as "all columns from view".
            expect(lastCapturedFields(provider)).toBeUndefined();
        });
    });
});

// ===========================================================================
// Cache-check parity regression: PreRunViews used to query the cache for
// AllowCaching=false entities (it didn't call IsServerCacheAllowedForEntity).
// After the fix, the cache-check is gated on the same predicate as the override.
// ===========================================================================
describe('ProviderBase Fields-Override Gate — cache-check parity regression', () => {
    let provider: FieldsOverrideTestProvider;
    let getRunViewResultSpy: MockInstance;
    const originalFastStartup = ProviderBase.FastStartupMode;

    beforeEach(() => {
        provider = new FieldsOverrideTestProvider();
        // Run in server mode so RunViews uses the direct PreRunView(s) → LocalCacheManager
        // path instead of routing through prepareSmartCacheCheckParams (which would call
        // provider.RunViewsWithCacheCheck — not implemented on this test provider).
        provider.trustLocalCache = true;
        provider.entities.set('Cacheable', makeEntity({ Name: 'Cacheable' }));
        provider.entities.set('NoCaching', makeEntity({ Name: 'NoCaching', AllowCaching: false }));
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.FastStartupMode = false;

        // Force LocalCacheManager into the "initialized" state without actually
        // standing up storage. The gate goes:
        //   if (willCache && LocalCacheManager.Instance.IsInitialized) { GetRunViewResult(...) }
        // So we just need IsInitialized=true and a stub for GetRunViewResult.
        const lcm = LocalCacheManager.Instance as unknown as { _initialized: boolean };
        lcm._initialized = true;
        getRunViewResultSpy = vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult')
            .mockResolvedValue(null);
        // Stub the write side too — PostRunView/PostRunViews will try to auto-cache
        // misses, which would otherwise hit the un-stubbed storage layer.
        vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        const lcm = LocalCacheManager.Instance as unknown as { _initialized: boolean };
        lcm._initialized = false;
        ProviderBase.FastStartupMode = originalFastStartup;
    });

    it('PreRunView: cache lookup is SKIPPED for AllowCaching=false entity even with CacheLocal=true', async () => {
        await provider.RunView({
            EntityName: 'NoCaching',
            Fields: NARROW_FIELDS,
            CacheLocal: true,
        });
        expect(getRunViewResultSpy).not.toHaveBeenCalled();
    });

    it('PreRunView: cache lookup IS invoked for cache-eligible entity with CacheLocal=true', async () => {
        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: NARROW_FIELDS,
            CacheLocal: true,
        });
        expect(getRunViewResultSpy).toHaveBeenCalledTimes(1);
    });

    it('PreRunView: cache lookup is SKIPPED when BypassCache=true (parity fix)', async () => {
        // Pre-fix: PreRunView line 1257 didn't check BypassCache, so the lookup happened anyway.
        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: NARROW_FIELDS,
            CacheLocal: true,
            BypassCache: true,
        });
        expect(getRunViewResultSpy).not.toHaveBeenCalled();
    });

    it('PreRunViews: cache lookup is SKIPPED for AllowCaching=false entity (parity fix)', async () => {
        // Pre-fix: PreRunViews line 1427 didn't call IsServerCacheAllowedForEntity,
        // so the batched path polluted the cache for non-cacheable entities.
        await provider.RunViews([
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS, CacheLocal: true },
        ]);
        expect(getRunViewResultSpy).not.toHaveBeenCalled();
    });

    it('PreRunViews: cache lookup IS invoked for cache-eligible entity', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
        ]);
        expect(getRunViewResultSpy).toHaveBeenCalledTimes(1);
    });

    it('PreRunViews: in a mixed batch, cache is queried only for cache-eligible items', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
            { EntityName: 'NoCaching', Fields: NARROW_FIELDS, CacheLocal: true },
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
        ]);
        expect(getRunViewResultSpy).toHaveBeenCalledTimes(2);
    });

    it('PreRunViews: cache lookup is SKIPPED for items with BypassCache=true', async () => {
        await provider.RunViews([
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true, BypassCache: true },
            { EntityName: 'Cacheable', Fields: NARROW_FIELDS, CacheLocal: true },
        ]);
        // Only the second item (no BypassCache) hits the cache
        expect(getRunViewResultSpy).toHaveBeenCalledTimes(1);
    });
});

// ===========================================================================
// Narrow→Wide cache coherence — proves Amith's poisoning-prevention invariant
// still holds after the gate fix.
//
// The invariant: when caching is active, ONE cache entry per entity+filter
// stores ALL entity columns. Subsequent calls for the same entity+filter
// with DIFFERENT Fields subsets all hit that single entry, with the cache-hit
// filter narrowing the rows to each caller's request — no poisoning.
//
// These tests exercise the full ProviderBase → real LocalCacheManager →
// MockCacheStorageProvider stack so we're testing what production runs, not
// just the gate predicate logic.
// ===========================================================================

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

describe('ProviderBase Fields-Override Gate — narrow→wide cache coherence (Amith invariant)', () => {
    let provider: FieldsOverrideTestProvider;
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;
    const originalDedupLinger = ProviderBase.DedupLingerMs;
    const originalFastStartup = ProviderBase.FastStartupMode;

    beforeEach(async () => {
        // Fresh LocalCacheManager singleton with in-memory mock storage
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);

        // Provider in server mode so RunView uses the direct PreRunView → InternalRunView
        // path (no smart-cache-check round-trip needed).
        provider = new FieldsOverrideTestProvider();
        provider.trustLocalCache = true;
        provider.entities.set('Cacheable', makeEntity({ Name: 'Cacheable' }));
        provider.entities.set('NoCaching', makeEntity({ Name: 'NoCaching', AllowCaching: false }));

        // Disable dedup/coalesce/fast-start so two sequential RunView calls really
        // execute the cache MISS → cache HIT loop instead of returning early.
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
        ProviderBase.FastStartupMode = false;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
        ProviderBase.FastStartupMode = originalFastStartup;
        resetLocalCacheManager();
    });

    // Wide row that simulates what the DB returns when the override has rewritten
    // params.Fields to all entity columns (which is what should happen on a cache MISS
    // for a cacheable entity — Amith's invariant).
    const WIDE_ROW: Record<string, unknown> = {
        ID: 'row-1',
        Name: 'Test Record',
        Status: 'Active',
        Description: 'Some description text',
        CreatedAt: '2026-01-01T00:00:00Z',
        UpdatedAt: '2026-04-01T00:00:00Z',
    };

    it('First call (cache MISS) populates cache with WIDE rows even though caller asked for narrow Fields', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],   // caller asked narrow
            CacheLocal: true,
        });

        // The override fired → InternalRunView received all-fields params
        expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);

        // PostRunView stored the wide row in cache. Inspect storage directly.
        const fingerprint = cacheManager.GenerateRunViewFingerprint(
            { EntityName: 'Cacheable', CacheLocal: true } as unknown as Parameters<typeof cacheManager.GenerateRunViewFingerprint>[0],
            provider.InstanceConnectionString
        );
        const stored = await cacheManager.GetRunViewResult(fingerprint);
        expect(stored).not.toBeNull();
        expect(stored!.results).toHaveLength(1);
        // The cached row contains ALL columns, not just ID/Name
        expect(Object.keys(stored!.results[0] as Record<string, unknown>).sort()).toEqual(
            [...FULL_FIELDS].sort()
        );
    });

    it('Second call with DIFFERENT narrow Fields gets a cache HIT and is NOT poisoned by the first call’s subset', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        // Call A: narrow subset {ID, Name}
        const resultA = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],
            CacheLocal: true,
        });
        expect(resultA.Success).toBe(true);
        // The MISS path projects the widened DB result back down to A's requested
        // Fields (PostRunView) — the wide superset only lives in the cache entry.
        expect(Object.keys(resultA.Results[0] as Record<string, unknown>).sort()).toEqual(['ID', 'Name']);
        // Reset captured params so we can detect that the second call is a HIT (no capture).
        provider.captured = [];

        // Call B: DIFFERENT narrow subset {ID, Status}
        const resultB = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Status'],
            CacheLocal: true,
        });

        // No DB call happened on B — it was a cache HIT
        expect(provider.captured).toHaveLength(0);

        // The returned rows contain the fields B asked for, NOT poisoned to A's subset
        expect(resultB.Results).toHaveLength(1);
        const rowB = resultB.Results[0] as Record<string, unknown>;
        expect(rowB.ID).toBe('row-1');
        expect(rowB.Status).toBe('Active');
        // Fields NOT requested by B are filtered out
        expect(rowB.Name).toBeUndefined();
        expect(rowB.Description).toBeUndefined();
    });

    it('Three calls with three different Fields subsets all hit the same wide cache entry', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        // Call 1: {ID, Name} — cache MISS, populates entry
        const r1 = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],
            CacheLocal: true,
        });
        expect(r1.Success).toBe(true);
        provider.captured = [];

        // Call 2: {ID, Status, Description} — cache HIT, narrows to those 3
        const r2 = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Status', 'Description'],
            CacheLocal: true,
        });
        expect(provider.captured).toHaveLength(0);
        const row2 = r2.Results[0] as Record<string, unknown>;
        expect(Object.keys(row2).sort()).toEqual(['Description', 'ID', 'Status']);

        // Call 3: {ID, CreatedAt} — cache HIT, narrows differently again
        const r3 = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'CreatedAt'],
            CacheLocal: true,
        });
        expect(provider.captured).toHaveLength(0);
        const row3 = r3.Results[0] as Record<string, unknown>;
        expect(Object.keys(row3).sort()).toEqual(['CreatedAt', 'ID']);
    });

    it('Cache HIT with no Fields requested (caller wants all) returns the full wide row', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        // Populate cache via call A
        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID'],
            CacheLocal: true,
        });
        provider.captured = [];

        // Call B: no Fields → cache HIT, no filtering, full wide row returned
        const result = await provider.RunView({
            EntityName: 'Cacheable',
            CacheLocal: true,
        });
        expect(provider.captured).toHaveLength(0);
        const row = result.Results[0] as Record<string, unknown>;
        expect(Object.keys(row).sort()).toEqual([...FULL_FIELDS].sort());
    });

    it('Different ExtraFilter creates a SEPARATE cache entry — no cross-filter poisoning', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        // Call A: filter X → cache MISS, populates entry-A
        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],
            ExtraFilter: "Status='Active'",
            CacheLocal: true,
        });
        // Call B: filter Y, same Fields → cache MISS (different fingerprint), populates entry-B
        await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],
            ExtraFilter: "Status='Inactive'",
            CacheLocal: true,
        });

        // Both calls reached InternalRunView (two MISSes, not one MISS + one cross-filter HIT)
        expect(provider.captured).toHaveLength(2);
        // Both got the override applied
        expect(capturedFieldsAt(provider, 0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider, 1)).toEqual(FULL_FIELDS);
    });

    it('Non-cacheable entity does NOT populate the cache (gate skipped both override and store)', async () => {
        provider.mockRunViewRows = [WIDE_ROW];

        await provider.RunView({
            EntityName: 'NoCaching',
            Fields: ['ID', 'Name'],
            CacheLocal: true,
        });
        // Override skipped: narrow Fields reached InternalRunView
        expect(lastCapturedFields(provider)).toEqual(['ID', 'Name']);

        // No cache entry created
        const fp = cacheManager.GenerateRunViewFingerprint(
            { EntityName: 'NoCaching', CacheLocal: true } as unknown as Parameters<typeof cacheManager.GenerateRunViewFingerprint>[0],
            provider.InstanceConnectionString
        );
        const stored = await cacheManager.GetRunViewResult(fp);
        expect(stored).toBeNull();
    });

    it('Cache key/fingerprint is identical for two calls that differ ONLY in Fields (the whole point of poisoning prevention)', async () => {
        const fp1 = cacheManager.GenerateRunViewFingerprint(
            {
                EntityName: 'Cacheable',
                Fields: ['ID', 'Name'],
                ExtraFilter: "Status='Active'",
                CacheLocal: true,
            } as unknown as Parameters<typeof cacheManager.GenerateRunViewFingerprint>[0],
            provider.InstanceConnectionString
        );
        const fp2 = cacheManager.GenerateRunViewFingerprint(
            {
                EntityName: 'Cacheable',
                Fields: ['ID', 'Status', 'Description'],
                ExtraFilter: "Status='Active'",
                CacheLocal: true,
            } as unknown as Parameters<typeof cacheManager.GenerateRunViewFingerprint>[0],
            provider.InstanceConnectionString
        );
        // Same fingerprint → same cache slot → no poisoning, since the slot stores wide data
        expect(fp1).toBe(fp2);
    });
});

// ===========================================================================
// Cache MISS result projection — hit/miss shape symmetry (end-to-end)
//
// PreRunView/PreRunViews widen params.Fields to ALL entity fields when a query
// is cacheable, so the cache entry is a universal superset. The caller-facing
// contract is that the SAME columns come back regardless of cache temperature:
//   - HIT:  PreRunView projects the cached superset down to the caller's Fields
//   - MISS: PostRunView projects the widened DB result down to the caller's
//           Fields, strictly AFTER the cache write (cache keeps the superset)
//
// ProjectRowsToFields (the shared primitive) has its own unit tests; these
// tests pin the PIPELINE wiring — the guard conditions in PostRunView, the
// hit-skip + index alignment in PostRunViews, and the cache write ordering —
// which is the part a refactor is most likely to break.
// ===========================================================================
describe('ProviderBase Fields-Override Gate — cache MISS projection (hit/miss shape symmetry)', () => {
    let provider: FieldsOverrideTestProvider;
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;
    const originalDedupLinger = ProviderBase.DedupLingerMs;
    const originalFastStartup = ProviderBase.FastStartupMode;

    const WIDE_ROW: Record<string, unknown> = {
        ID: 'row-1',
        Name: 'Test Record',
        Status: 'Active',
        Description: 'Some description text',
        CreatedAt: '2026-01-01T00:00:00Z',
        UpdatedAt: '2026-04-01T00:00:00Z',
    };

    function rowKeys(result: RunViewResult, index = 0): string[] {
        return Object.keys(result.Results[index] as Record<string, unknown>).sort();
    }

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);

        // Server mode: single RunView uses the direct Pre → Internal → Post path,
        // and RunViews uses the traditional (non-smart-cache) batch pipeline.
        provider = new FieldsOverrideTestProvider();
        provider.trustLocalCache = true;
        provider.entities.set('Cacheable', makeEntity({ Name: 'Cacheable' }));
        provider.mockRunViewRows = [WIDE_ROW];

        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
        ProviderBase.FastStartupMode = false;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
        ProviderBase.FastStartupMode = originalFastStartup;
        resetLocalCacheManager();
    });

    it('Cache MISS returns ONLY the caller’s requested Fields while the cache entry keeps the wide superset', async () => {
        const result = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['ID', 'Name'],
        });

        // The DB query was widened (cache-superset invariant intact)…
        expect(lastCapturedFields(provider)).toEqual(FULL_FIELDS);
        // …the cache entry stored the full-width rows…
        const fp = cacheManager.GenerateRunViewFingerprint(
            { EntityName: 'Cacheable' } as unknown as Parameters<typeof cacheManager.GenerateRunViewFingerprint>[0],
            provider.InstanceConnectionString
        );
        const stored = await cacheManager.GetRunViewResult(fp);
        expect(Object.keys(stored!.results[0] as Record<string, unknown>).sort()).toEqual([...FULL_FIELDS].sort());
        // …but the CALLER received exactly the columns they asked for.
        expect(rowKeys(result)).toEqual(['ID', 'Name']);
    });

    it('MISS and subsequent HIT return byte-identical shapes for the same request (the regression this fix exists for)', async () => {
        const missResult = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['Name', 'Status'],
        });
        provider.reset();

        const hitResult = await provider.RunView({
            EntityName: 'Cacheable',
            Fields: ['Name', 'Status'],
        });
        // Second call really was a HIT (no DB query)
        expect(provider.captured).toHaveLength(0);

        expect(missResult.Results).toEqual(hitResult.Results);
        expect(rowKeys(missResult)).toEqual(['Name', 'Status']);
    });

    it('Cache MISS with NO Fields requested returns the full wide row (projection is a pass-through)', async () => {
        const result = await provider.RunView({ EntityName: 'Cacheable' });
        expect(rowKeys(result)).toEqual([...FULL_FIELDS].sort());
    });

    it('Batch RunViews: each MISS is projected to its OWN param’s Fields (per-index callerFieldsMap)', async () => {
        const [r1, r2] = await provider.RunViews([
            { EntityName: 'Cacheable', Fields: ['ID', 'Name'], ExtraFilter: "Status='Active'" },
            { EntityName: 'Cacheable', Fields: ['Description'], ExtraFilter: "Status='Inactive'" },
        ]);

        // Both reached the DB widened (two distinct fingerprints → two misses)
        expect(capturedFieldsAt(provider, 0)).toEqual(FULL_FIELDS);
        expect(capturedFieldsAt(provider, 1)).toEqual(FULL_FIELDS);
        // Each result narrowed to its own param's request — not its neighbor's
        expect(rowKeys(r1)).toEqual(['ID', 'Name']);
        expect(rowKeys(r2)).toEqual(['Description']);
    });

    it('Batch RunViews with a mixed HIT + MISS keeps per-index alignment (merge + projection agree on ordering)', async () => {
        // Warm the unfiltered-query cache entry
        await provider.RunView({ EntityName: 'Cacheable', Fields: ['ID'] });
        provider.reset();

        const [hit, miss] = await provider.RunViews([
            // Same fingerprint as the warmed entry (Fields excluded from fingerprint) → HIT
            { EntityName: 'Cacheable', Fields: ['ID', 'Status'] },
            // Different filter → different fingerprint → MISS
            { EntityName: 'Cacheable', Fields: ['Name'], ExtraFilter: "Status='Active'" },
        ]);

        // Only the miss reached the DB
        expect(provider.captured).toHaveLength(1);
        // HIT projected from the cached superset to ITS requested fields
        expect(rowKeys(hit)).toEqual(['ID', 'Status']);
        // MISS projected from the widened DB result to ITS requested fields
        expect(rowKeys(miss)).toEqual(['Name']);
    });
});
