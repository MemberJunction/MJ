import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
    ICompanyIntegrationSyncWatermark,
} from '../entity-types.js';
import type {
    BaseIntegrationConnector,
    FetchContext,
    FetchBatchResult,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';
import { SyncLogger } from '../SyncLogger.js';

// ---------------------------------------------------------------------------
// Fetch integrity: the two self-checks that turn a silently SHORT scan into a
// reported one. Both live in the per-entity-map fetch loop of ProcessPullSync
// and both answer the same production failure — a sync that finishes
// Status='Success' with a row count that understates the source, leaving no
// signal anywhere that records were never seen.
//
//   MJ-RUN-35  FETCH_SHORT_OF_SOURCE_TOTAL — a connector may now carry the
//              source's OWN stated total out on `FetchBatchResult.SourceTotalRecords`
//              (Django REST's `count`, and every API shaped like it). The engine
//              remembers the last stated value and, after a CLEAN fetch, compares
//              it against what the scan actually produced. Fewer than stated is a
//              fault; no request failed, so nothing else in the engine can see it.
//
//   MJ-RUN-36  FETCH_PAGES_OVERLAPPED — an identity a LATER page re-serves after an
//              EARLIER page already gave it, on a POSITION-paged object. The repeat
//              itself only costs a wasted write; what makes it a fault is what it
//              implies — a page boundary that moved backward to repeat a row moved
//              forward past another, so the repeat is the visible half of an
//              omission. `CollapseDuplicateIdentities` is within-batch only and
//              cannot see across pages.
//
// Harness: cloned from IntegrationEngine.safefloor.test.ts — the REAL engine driven
// through its public RunSync() with a fake connector, mocked RunView/Metadata, and a
// captured watermark row. Warnings are observed at the SyncLogger boundary (the spy
// calls through, so the real console + artifact forwarding still happen) because the
// structured code + payload IS the contract: they are what reaches the run-event
// stream an operator queries, and asserting on the payload fields is what pins the
// arithmetic an operator acts on.
//
// NOT asserted here — the watermark. Both blocks set `fetchCompletedCleanly = false`,
// but they run AFTER the watermark-save branches and after the orphan sweep
// (IntegrationEngine.ts: save at ~3375, sweep at ~3407, these checks at ~3438+), and
// nothing reads the flag again. So on today's source the watermark still advances on
// a shortfall and on an overlap, and a "watermark held" assertion cannot pass without
// moving those two blocks above the save. See the task report.
// ---------------------------------------------------------------------------

/** The watermark the run starts from (a prior clean incremental) — a valid ISO timestamp. */
const PRIOR_WATERMARK = '2024-06-15T09:00:00.000Z';

let mockRunViewsFn: ReturnType<typeof vi.fn>;

/**
 * Default batched-read behaviour: fan a `RunViews` call out to the per-params `RunView` mock, so
 * the entity-aware routers each test installs answer batched legs too. A test that pins a specific
 * batched read with `mockResolvedValueOnce` still overrides this.
 */
const fanOutToRunView = async (params: Array<Record<string, unknown>>, contextUser?: unknown) =>
    Promise.all(params.map(p => mockRunViewFn(p, contextUser)));
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockEntityInstances: Map<string, ReturnType<typeof createMockEntity>>;

function createMockEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        Delete: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => { data[field] = value; }),
        get ID() { return data['ID'] ?? 'generated-id'; },
        set ID(v: string) { data['ID'] = v; },
        get PrimaryKey() {
            return { KeyValuePairs: [{ FieldName: 'ID', Value: data['ID'] ?? 'generated-id' }] };
        },
        set CompanyIntegrationID(v: string) { data['CompanyIntegrationID'] = v; },
        set RunByUserID(v: string) { data['RunByUserID'] = v; },
        set StartedAt(v: Date) { data['StartedAt'] = v; },
        set EndedAt(v: Date | undefined) { data['EndedAt'] = v; },
        set Status(v: string) { data['Status'] = v; },
        set TotalRecords(v: number) { data['TotalRecords'] = v; },
        set ConfigData(v: string) { data['ConfigData'] = v; },
        set ErrorLog(v: string | undefined) { data['ErrorLog'] = v; },
        set CompanyIntegrationRunID(v: string) { data['CompanyIntegrationRunID'] = v; },
        set EntityID(v: string) { data['EntityID'] = v; },
        set RecordID(v: string) { data['RecordID'] = v; },
        set Action(v: string) { data['Action'] = v; },
        set IsSuccess(v: boolean) { data['IsSuccess'] = v; },
        set ExternalSystemRecordID(v: string) { data['ExternalSystemRecordID'] = v; },
        set EntityRecordID(v: string) { data['EntityRecordID'] = v; },
        _data: data,
    };
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    // Durable runs (PR 1): every sync claims/heartbeats/fences its run row through the
    // provider, so the mock provider must answer those statements.
    const { createOwnershipProviderSurface } = await vi.importActual<
        typeof import('./helpers/ownershipProviderSurface.js')
    >('./helpers/ownershipProviderSurface.js');
    return {
        ...actual,
        RunView: class MockRunView {
            RunViews(...args: unknown[]) { return mockRunViewsFn(...args); }
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
        Metadata: (() => {
            class MockMetadata {
                static Provider: {
                    BeginTransaction: ReturnType<typeof vi.fn>;
                    CommitTransaction: ReturnType<typeof vi.fn>;
                    RollbackTransaction: ReturnType<typeof vi.fn>;
                    Entities: { Name: string; FirstPrimaryKey: { Name: string } }[];
                    EntityByName: (name: string) => { Name: string; FirstPrimaryKey: { Name: string } } | undefined;
                    GetEntityObject: (...args: unknown[]) => Promise<unknown>;
                } & ReturnType<typeof createOwnershipProviderSurface>;
                get Entities() {
                    return [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }];
                }
                EntityByName(name: string) {
                    return this.Entities.find(e => e.Name === name);
                }
                async GetEntityObject(entityName: string) {
                    const entity = createMockEntity({ ID: `new-${entityName}-id` });
                    mockEntityInstances.set(entityName, entity);
                    return entity;
                }
            }
            MockMetadata.Provider = {
                ...createOwnershipProviderSurface(),
                BeginTransaction: vi.fn().mockResolvedValue(undefined),
                CommitTransaction: vi.fn().mockResolvedValue(undefined),
                RollbackTransaction: vi.fn().mockResolvedValue(undefined),
                Entities: [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }],
                EntityByName(name: string) {
                    return this.Entities.find(e => e.Name === name);
                },
                GetEntityObject(...args: unknown[]) {
                    return MockMetadata.prototype.GetEntityObject.apply(new MockMetadata(), args as [string]);
                },
            };
            return MockMetadata;
        })(),
        CompositeKey: class MockCompositeKey {
            KeyValuePairs: Array<{ FieldName: string; Value: string }> = [];
        },
    };
});

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    GetRegistration: vi.fn().mockReturnValue({}),
                    CreateInstance: vi.fn(),
                },
            },
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

function createMockCompanyIntegration(): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return '{}';
            return null;
        }),
        IntegrationID: 'int-1',
    } as unknown as MJCompanyIntegrationEntity;
}

/** One source record with a mappable `Name`. */
const rec = (id: string): ExternalRecord =>
    ({ ExternalID: id, ObjectType: 'Contact', Fields: { Name: `Contact ${id}` }, IsDeleted: false });

/** `count` source records, ext-1 … ext-count. */
const recs = (count: number): ExternalRecord[] =>
    Array.from({ length: count }, (_unused, i) => rec(`ext-${i + 1}`));

/** The connector shape every fixture here shares: non-keyset, no rate policy, no post-processing. */
function connectorWith(fetchChanges: (ctx: FetchContext) => Promise<FetchBatchResult>): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn(),
        DiscoverObjects: vi.fn(),
        DiscoverFields: vi.fn(),
        FetchChanges: vi.fn().mockImplementation(fetchChanges),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,   // non-keyset → timestamp watermark path
    } as unknown as BaseIntegrationConnector;
}

/**
 * A single-batch connector that returns `recordCount` records and, when `sourceTotal` is given,
 * states that total on the page — exactly how a `{count, next, results}` API answers.
 * `sourceTotal: undefined` omits the field entirely (the source said nothing).
 */
function createStatedTotalConnector(
    recordCount: number,
    sourceTotal?: number,
): { connector: BaseIntegrationConnector; fetchCalls: () => number } {
    let calls = 0;
    const connector = connectorWith(async () => {
        calls++;
        // A later watermark, so "did the engine advance it?" is a real question. Without this the
        // harness has nothing to advance and any hold-the-watermark assertion is vacuously true —
        // it passes just as happily against code where the incomplete flag is never read.
        const batch: FetchBatchResult = {
            Records: recs(recordCount),
            HasMore: false,
            NewWatermarkValue: LATER_WATERMARK,
        };
        if (sourceTotal !== undefined) batch.SourceTotalRecords = sourceTotal;
        return batch;
    });
    return { connector, fetchCalls: () => calls };
}

/**
 * A PAGE-NUMBER-paged, two-batch connector:
 *   page (none) — ext-1, ext-2, HasMore=true, NextPage=2
 *   page 2      — `secondPage`, HasMore=false
 * Keyed on `ctx.CurrentPage`, not a call counter, so a retry can never hand back the wrong page.
 */
function createPagePagedConnector(
    secondPage: ExternalRecord[],
): { connector: BaseIntegrationConnector; fetchCalls: () => number } {
    let calls = 0;
    const connector = connectorWith(async (ctx: FetchContext) => {
        calls++;
        if (ctx.CurrentPage == null) {
            return {
                Records: [rec('ext-1'), rec('ext-2')],
                HasMore: true,
                NextPage: 2,
                NewWatermarkValue: LATER_WATERMARK,
            };
        }
        return { Records: secondPage, HasMore: false, NewWatermarkValue: LATER_WATERMARK };
    });
    return { connector, fetchCalls: () => calls };
}

/**
 * Page 2 repeats an identity WITHIN ITSELF, and page 1 shares none of them.
 *
 * This separates the two duplicate faults, which have the same symptom and opposite causes. The
 * first version of the overlap check added each record to the seen-set as it walked the batch, so
 * by the time the second copy of `ext-3` was examined the first had already been added and it
 * looked exactly like a row page 1 had served. Both warnings fired and only one was true.
 */
function createInBatchRepeatOnPageTwo(): {
    connector: BaseIntegrationConnector;
    fetchCalls: () => number;
} {
    let calls = 0;
    const connector = connectorWith(async (ctx: FetchContext) => {
        calls++;
        if (ctx.CurrentPage == null) {
            return { Records: [rec('ext-1'), rec('ext-2')], HasMore: true, NextPage: 2 };
        }
        return { Records: [rec('ext-3'), rec('ext-3')], HasMore: false };
    });
    return { connector, fetchCalls: () => calls };
}

/**
 * The same two batches as above, CURSOR-paged instead: neither CurrentOffset nor CurrentPage is
 * ever set, so the engine has no position to reason about.
 */
function createCursorPagedConnector(
    secondPage: ExternalRecord[],
): { connector: BaseIntegrationConnector; fetchCalls: () => number } {
    let calls = 0;
    const connector = connectorWith(async (ctx: FetchContext) => {
        calls++;
        if (ctx.CurrentCursor == null) {
            return { Records: [rec('ext-1'), rec('ext-2')], HasMore: true, NextCursor: 'cursor-2' };
        }
        return { Records: secondPage, HasMore: false };
    });
    return { connector, fetchCalls: () => calls };
}

/**
 * An OFFSET-paged connector that states a total of 10, serves 2 records, and then fails the page at
 * offset 2 persistently (the throw keys on the offset, so retries fail identically):
 *   offset undefined — 2 records, SourceTotalRecords=10, NextOffset=2, HasMore=true
 *   offset 2         — throws (the gap; engine skips the page and steps the offset)
 *   offset > 2       — empty, HasMore=false (paged past the gap → ends)
 * The scan therefore ends 8 short of the stated total, by a route that ALREADY reported itself.
 */
function createGapWithStatedTotalConnector(): {
    connector: BaseIntegrationConnector;
    offsetsSeen: () => Array<number | undefined>;
} {
    const offsets: Array<number | undefined> = [];
    const connector = connectorWith(async (ctx: FetchContext) => {
        offsets.push(ctx.CurrentOffset);
        if (ctx.CurrentOffset == null) {
            return {
                Records: [rec('ext-1'), rec('ext-2')],
                HasMore: true,
                NextOffset: 2,
                SourceTotalRecords: 10,
            };
        }
        if (ctx.CurrentOffset === 2) {
            throw new Error('simulated persistent page fetch failure at offset 2');
        }
        return { Records: [], HasMore: false };
    });
    return { connector, offsetsSeen: () => offsets };
}

/** One `logger.warning(...)` call, captured with its structured payload intact. */
interface CapturedWarning {
    stage: string;
    code: string;
    message: string;
    data?: Record<string, unknown>;
}

let capturedWarnings: CapturedWarning[];
let installedSpies: Array<{ mockRestore: () => void }>;

/** Silence the engine's console firehose and record every structured warning it raises. */
function installWarningCapture(): void {
    capturedWarnings = [];
    const originalWarning = SyncLogger.prototype.warning;
    installedSpies = [
        vi.spyOn(console, 'log').mockImplementation(() => undefined),
        vi.spyOn(console, 'warn').mockImplementation(() => undefined),
        vi.spyOn(console, 'error').mockImplementation(() => undefined),
        vi.spyOn(SyncLogger.prototype, 'warning').mockImplementation(function (
            this: SyncLogger,
            stage: string,
            code: string,
            message: string,
            data?: Record<string, unknown>,
        ) {
            capturedWarnings.push({ stage, code, message, data });
            // Call through: the real warning still reaches console.warn + the durable artifact, so
            // this observes the engine's behaviour rather than replacing it.
            originalWarning.call(this, stage, code, message, data);
        }),
    ];
}

/** The single warning carrying `code`, or undefined. Fails loudly if the engine raised it twice. */
function warningWithCode(code: string): CapturedWarning | undefined {
    const matches = capturedWarnings.filter(w => w.code === code);
    expect(matches.length).toBeLessThanOrEqual(1);
    return matches[0];
}

/**
 * Shared run wiring (from the safefloor harness): the four batched run-config reads, a pre-existing
 * Pull watermark row whose Save() captures every value the run persists, field maps for `Name`, and
 * no record-map/key matches so every record takes the create path.
 */
function wireRun(): { persistedValues: Array<string | null> } {
    const companyIntegration = createMockCompanyIntegration();
    const integration = {
        ID: 'int-1',
        Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
        Name: 'Test',
        ClassName: 'TestConnector',
    } as unknown as MJIntegrationEntity;

    mockRunViewsFn.mockResolvedValueOnce([
        { Success: true, Results: [companyIntegration] },
        {
            Success: true,
            Results: [{
                Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                CompanyIntegrationID: 'ci-1',
                EntityID: 'entity-1',
                ConflictResolution: 'SourceWins',
                DeleteBehavior: 'SoftDelete',
                Entity: 'Contacts',
                ExternalObjectName: 'contacts',
            } as unknown as ICompanyIntegrationEntityMap],
        },
        { Success: true, Results: [integration] },
        { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
    ]);

    const persistedValues: Array<string | null> = [];
    const existingWatermark = {
        ID: 'wm-1',
        EntityMapID: 'em-1',
        Direction: 'Pull' as const,
        WatermarkType: 'Timestamp' as const,
        WatermarkValue: PRIOR_WATERMARK as string | null,
        LastSyncAt: new Date('2024-06-15T09:00:00.000Z'),
        RecordsSynced: 0,
        Get: vi.fn(),
        Save: vi.fn().mockImplementation(async function (this: { WatermarkValue: string | null }) {
            persistedValues.push(this.WatermarkValue);
            return true;
        }),
    } as unknown as ICompanyIntegrationSyncWatermark;

    mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
        const entityName = params['EntityName'] as string;
        if (entityName === 'MJ: Company Integration Field Maps') {
            return {
                Success: true,
                Results: [{
                    SourceFieldName: 'Name',
                    DestinationFieldName: 'Name',
                    TransformPipeline: null,
                    IsKeyField: false,
                    Status: 'Active',
                    Priority: 0,
                } as unknown as ICompanyIntegrationFieldMap],
            };
        }
        if (entityName === 'MJ: Company Integration Sync Watermarks') {
            return { Success: true, Results: [existingWatermark] };
        }
        // Record-map / key-match lookups — no matches (all creates).
        return { Success: true, Results: [] };
    });

    return { persistedValues };
}

/**
 * The watermark values the engine actually persisted during the last `runPull`.
 *
 * Exposed because "the window is re-fetched next run" is a PROMISE both new warnings make, and the
 * only thing that keeps it is the watermark not advancing. The first version of these blocks sat
 * below the watermark-save branches, where `fetchCompletedCleanly` is never read again — so both
 * messages said the watermark was held while it advanced exactly as on a clean fetch. That is a
 * message that lies, which is worse than no message. These assertions are what stop it recurring.
 */
/** Later than PRIOR_WATERMARK, so a clean complete fetch visibly advances and an incomplete one does not. */
const LATER_WATERMARK = '2024-06-15T12:00:00.000Z';

let lastPersistedWatermarks: Array<string | null> = [];

/** Drive one incremental RunSync through the real engine with `connector` installed. */
async function runPull(orchestrator: IntegrationEngine, connector: BaseIntegrationConnector) {
    lastPersistedWatermarks = wireRun().persistedValues;
    const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
    const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
    MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async () => createMockEntity({}));
    const { ConnectorFactory } = await import('../ConnectorFactory.js');
    const resolveOrig = ConnectorFactory.Resolve;
    ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);
    try {
        return await orchestrator.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false });
    } finally {
        ConnectorFactory.Resolve = resolveOrig;
        MockMetadataClass.prototype.GetEntityObject = origGetEntity;
    }
}

describe('IntegrationEngine — a clean fetch is checked against the total the source stated (MJ-RUN-35)', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        installWarningCapture();
    });

    afterEach(() => {
        for (const spy of installedSpies) spy.mockRestore();
    });

    it('reports FETCH_SHORT_OF_SOURCE_TOTAL, with the arithmetic, when a clean scan ends below the stated total', async () => {
        // IF THIS FAILS IN PRODUCTION: a scan that quietly lost records finishes Status='Success' with
        // no signal attached to it. No request failed, so every other check in the engine is silent —
        // the source said it holds 5, we wrote 3, and the only place that discrepancy is knowable is
        // right here. Operators then reconcile row counts by hand, months later, against a run
        // history of unbroken green. The payload is asserted field-by-field because the numbers ARE
        // the report: "how many am I missing" is the first question asked, and a message without
        // `sourceTotal`/`fetched`/`missing` cannot answer it on the run-event stream.
        const { connector, fetchCalls } = createStatedTotalConnector(3, 5);

        const result = await runPull(orchestrator, connector);

        // Prove the run REACHED the connector and wrote the short set — without this the assertions
        // below could pass on a run that never happened.
        expect(fetchCalls()).toBe(1);
        expect(result.RecordsCreated).toBe(3);

        const shortfall = warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL');
        expect(shortfall).toBeDefined();
        expect(shortfall!.data).toMatchObject({ sourceTotal: 5, fetched: 3, missing: 2 });
        // Filed under the OBJECT, like every sibling warning, so a per-object filter finds it.
        expect(shortfall!.stage).toBe('contacts');
        // The operator's next question is "did I lose data?" — the prose has to answer it.
        expect(shortfall!.message).toContain('INCOMPLETE');
    });

    it('stays silent when the scan returns exactly the stated total', async () => {
        // IF THIS FAILS IN PRODUCTION: every healthy sync of every count-reporting connector raises a
        // false INCOMPLETE warning on the run-event stream. A check that cries wolf on the normal case
        // is worse than no check — operators learn to ignore the code, and the one real shortfall is
        // ignored with it. This is the off-by-one boundary: `<`, never `<=`.
        const { connector, fetchCalls } = createStatedTotalConnector(5, 5);

        const result = await runPull(orchestrator, connector);

        expect(fetchCalls()).toBe(1);
        expect(result.RecordsCreated).toBe(5);
        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
    });

    it('stays silent when the scan returns MORE than the stated total', async () => {
        // IF THIS FAILS IN PRODUCTION: any source that gains rows mid-scan — i.e. any live system —
        // reports its busiest objects as incomplete on every run. A total is a statement about the
        // moment it was made, so overshooting it is normal and carries no evidence of loss. Only
        // fetching FEWER than stated does, which is why this is a comparison and not an equality
        // check.
        const { connector, fetchCalls } = createStatedTotalConnector(7, 5);

        const result = await runPull(orchestrator, connector);

        expect(fetchCalls()).toBe(1);
        expect(result.RecordsCreated).toBe(7);
        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
    });

    it('stays silent when the connector states no total at all — absent is not zero', async () => {
        // IF THIS FAILS IN PRODUCTION: every connector that does NOT report a count — most of the
        // fleet — is judged against a number the source never gave. Read as zero, an absent total
        // makes `recordsInMap < 0` false and is harmlessly silent; read as anything else (a
        // `?? 0` moved to the wrong side, a `!= null` that becomes a truthiness test) it either
        // warns on every object forever or silently stops checking the connectors that DO report.
        // "Did not say" and "said zero" are different facts and the field only distinguishes them by
        // being absent.
        const { connector, fetchCalls } = createStatedTotalConnector(3);

        const result = await runPull(orchestrator, connector);

        expect(fetchCalls()).toBe(1);
        expect(result.RecordsCreated).toBe(3);
        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
    });

    it('stays silent when the fetch already skipped a page — that path reports itself', async () => {
        // IF THIS FAILS IN PRODUCTION: a page-skip run reports its ONE incident twice under two
        // different codes, and the second report is actively misleading. FETCH_PAGE_SKIPPED /
        // FETCH_INCOMPLETE_PAGES_SKIPPED already name the cause (a page whose requests failed) and
        // the remedy; FETCH_SHORT_OF_SOURCE_TOTAL says the opposite — "no request failed, the
        // shortfall is in how the source paged" — and would send an operator hunting a pagination
        // bug that isn't there. A known-short fetch is not the case this check exists for, which is
        // why it is gated on the fetch having completed cleanly.
        const { connector, offsetsSeen } = createGapWithStatedTotalConnector();

        const result = await runPull(orchestrator, connector);

        // Prove this really is the gap path: the reachable page was written, and the engine stepped
        // PAST the failed offset rather than abandoning the object.
        expect(result.RecordsCreated).toBe(2);
        expect(offsetsSeen().some(o => o != null && o > 2)).toBe(true);
        // The skip DID report itself — so the silence below is a deliberate non-duplicate, not a
        // run that failed to reach the check at all.
        expect(warningWithCode('FETCH_INCOMPLETE_PAGES_SKIPPED')).toBeDefined();
        // ...and the shortfall (2 fetched of 10 stated) is NOT reported on top of it.
        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
    });
});

describe('IntegrationEngine — pages that overlapped are reported as an incomplete scan (MJ-RUN-36)', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        installWarningCapture();
    });

    afterEach(() => {
        for (const spy of installedSpies) spy.mockRestore();
    });

    it('reports FETCH_PAGES_OVERLAPPED when a later page re-serves an identity an earlier page already gave', async () => {
        // IF THIS FAILS IN PRODUCTION: the one observable symptom of a moving page boundary is
        // discarded. Position-based paging guarantees no order unless the source promises one, so a
        // boundary that slid BACKWARD to re-serve ext-2 also slid FORWARD past some other row — the
        // repeat we can see is the receipt for an omission we cannot. Nothing else in the engine
        // sees it: the duplicate-batch fingerprint only catches a page repeated in FULL, and
        // CollapseDuplicateIdentities is explicitly within-batch. The run then finishes Success with
        // a row count that understates the source and a double-written record, and the missing rows
        // are found by a customer, not by us. `repeated` and `sample` are asserted because a count
        // without identities cannot be chased at the vendor.
        const { connector, fetchCalls } = createPagePagedConnector([rec('ext-2'), rec('ext-3')]);

        const result = await runPull(orchestrator, connector);

        // Both pages really were served, and the repeat really was written a second time — the
        // wasted write is the cheap half of the damage this warning exists to surface.
        expect(fetchCalls()).toBe(2);
        expect(result.RecordsProcessed).toBe(4);

        const overlap = warningWithCode('FETCH_PAGES_OVERLAPPED');
        expect(overlap).toBeDefined();
        expect(overlap!.data).toMatchObject({ repeated: 1 });
        const sample = (overlap!.data as { sample?: string[] }).sample;
        expect(sample).toBeDefined();
        expect(sample!.length).toBeGreaterThan(0);
        expect(sample).toContain('ext-2');
        expect(overlap!.stage).toBe('contacts');
        expect(overlap!.message).toContain('INCOMPLETE');
    });

    it('does not report an overlap for a repeat inside ONE batch — that is the within-batch collapse', async () => {
        // IF THIS FAILS IN PRODUCTION: two different defects are reported under one code, and the
        // remedy printed is wrong for one of them. A repeat inside a single page is a CONNECTOR bug
        // (one source record emitted twice) whose fix is to stop emitting it, and the engine already
        // collapses the pair so only one row is written — DUPLICATE_IDENTITIES_IN_BATCH says exactly
        // that. FETCH_PAGES_OVERLAPPED instead declares the result set INCOMPLETE and tells the
        // operator to ask the SOURCE for a guaranteed sort order, which would be a wild goose chase
        // here — and, once the incomplete flag reaches the watermark, would hold a window that was
        // never short. Overlap needs two pages to be evidence of anything.
        let calls = 0;
        const dupInOneBatch = connectorWith(async () => {
            calls++;
            // ONE page, HasMore=false: ext-1 served twice inside it.
            return { Records: [rec('ext-1'), rec('ext-2'), rec('ext-1')], HasMore: false };
        });

        const result = await runPull(orchestrator, dupInOneBatch);

        expect(calls).toBe(1);
        // The pair was collapsed to a single write (2 distinct identities), not inserted twice.
        expect(result.RecordsCreated).toBe(2);
        // THE OTHER FAULT FIRES: the within-batch collapse is reported, naming the identity.
        const withinBatch = warningWithCode('DUPLICATE_IDENTITIES_IN_BATCH');
        expect(withinBatch).toBeDefined();
        expect(withinBatch!.data).toMatchObject({ collapsed: 1 });
        // ...and the cross-page code does NOT.
        expect(warningWithCode('FETCH_PAGES_OVERLAPPED')).toBeUndefined();
    });

    it('stays silent when two position-paged batches share no identities', async () => {
        // IF THIS FAILS IN PRODUCTION: ordinary healthy paging — every multi-page object in the
        // fleet — is reported as an overlapped, incomplete scan. That is the false-positive that
        // makes the code worthless: an operator who sees it on clean runs cannot use it to find the
        // one object whose boundaries really are moving. The accumulated identity set is shared with
        // orphan detection, so a mistake here (comparing against the set AFTER this page's records
        // were added, say) would fire on every page of every object.
        const { connector, fetchCalls } = createPagePagedConnector([rec('ext-3'), rec('ext-4')]);

        const result = await runPull(orchestrator, connector);

        expect(fetchCalls()).toBe(2);
        expect(result.RecordsCreated).toBe(4);   // four distinct identities, four writes
        expect(warningWithCode('FETCH_PAGES_OVERLAPPED')).toBeUndefined();
        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
    });

    it('stays silent for a cursor-paged object even when an identity repeats across pages', async () => {
        // IF THIS FAILS IN PRODUCTION: cursor-paged objects are declared incomplete on evidence that
        // does not mean what the warning says. A cursor is a position IN a result set the source is
        // holding for us, so a repeated identity across cursor pages does not imply a boundary moved
        // past unseen rows — it is a duplicate, not proof of an omission, and the remedy the message
        // prints ("a guaranteed sort order") is not the fix. Many connectors legitimately re-serve a
        // row across cursor pages (an object updated mid-scan re-entering a change feed); warning
        // there would condemn normal syncs, and — once the incomplete flag reaches the watermark —
        // would hold the window of a scan that was never short.
        const { connector, fetchCalls } = createCursorPagedConnector([rec('ext-2'), rec('ext-3')]);

        const result = await runPull(orchestrator, connector);

        // The repeat really was served on a second page — the evidence existed and was correctly
        // judged to mean nothing here.
        expect(fetchCalls()).toBe(2);
        expect(result.RecordsProcessed).toBe(4);
        expect(warningWithCode('FETCH_PAGES_OVERLAPPED')).toBeUndefined();
    });

    // ── The promise both warnings make: the window IS re-fetched next run ─────────────────────

    it('a shortfall HOLDS the watermark, which is what makes the message true', async () => {
        // IF THIS FAILS IN PRODUCTION: the warning says "the watermark is held so the window is
        // re-fetched next run" and the watermark advances anyway. The missing records then sit
        // permanently behind an incremental filter that will never ask for them again — a one-run
        // shortfall becomes a permanent hole, and the warning that was supposed to reassure the
        // operator is the thing that misled them. This assertion exists because the first version of
        // this check sat below the watermark-save branches, where the incomplete flag is never read.
        const { connector } = createStatedTotalConnector(3, 5);

        await runPull(orchestrator, connector);

        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeDefined();
        // The connector OFFERED a later watermark. An incomplete scan must not persist it.
        expect(lastPersistedWatermarks).not.toContain(LATER_WATERMARK);
    });

    it('an overlap HOLDS the watermark too', async () => {
        // IF THIS FAILS IN PRODUCTION: same permanent hole as above, arrived at from the other
        // direction. An overlap means rows were skipped; advancing the watermark past a window we
        // know we did not fully read is the one action guaranteed to lose them for good.
        const { connector } = createPagePagedConnector([rec('ext-1'), rec('ext-9')]);

        await runPull(orchestrator, connector);

        expect(warningWithCode('FETCH_PAGES_OVERLAPPED')).toBeDefined();
        expect(lastPersistedWatermarks).not.toContain(LATER_WATERMARK);
    });

    it("a batch's OWN duplicate on page 2 is the within-batch collapse, NOT a page overlap", async () => {
        // IF THIS FAILS IN PRODUCTION: every connector that repeats a record inside one response —
        // which is the Attendees and Members fault, and the common one — gets its object marked
        // INCOMPLETE and its watermark held on every single run, forever. The scan was complete; the
        // key was too coarse. Those need opposite responses, and conflating them turns a metadata
        // problem into a sync that never advances and re-fetches the same window nightly.
        const { connector } = createInBatchRepeatOnPageTwo();

        await runPull(orchestrator, connector);

        expect(warningWithCode('DUPLICATE_IDENTITIES_IN_BATCH')).toBeDefined();
        expect(warningWithCode('FETCH_PAGES_OVERLAPPED')).toBeUndefined();
    });

    it('CONTROL: a clean COMPLETE scan does advance the watermark, so the two holds above mean something', async () => {
        // Without this control the hold assertions are unfalsifiable: if the harness never advanced
        // a watermark under any circumstances, `not.toContain` would pass against code that ignores
        // the incomplete flag entirely. That is exactly what happened on the first attempt at these
        // tests — they passed with the flag neutered, and proved nothing.
        const { connector } = createStatedTotalConnector(5, 5);

        await runPull(orchestrator, connector);

        expect(warningWithCode('FETCH_SHORT_OF_SOURCE_TOTAL')).toBeUndefined();
        expect(lastPersistedWatermarks).toContain(LATER_WATERMARK);
    });
});
