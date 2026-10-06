import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
} from '../entity-types.js';
import type {
    BaseIntegrationConnector,
    FetchContext,
    FetchBatchResult,
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine, PositiveInt } from '../IntegrationEngine.js';
import { ConnectorFactory } from '../ConnectorFactory.js';

// ---- Mock harness (same shape as IntegrationEngine.ratelimit-wiring.test.ts) ----
//
// This suite proves the FetchChanges TIMEOUT resolution wiring. The timeout used to be the
// module constant DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs (30s) with no override, which
// punished connectors that fan out one request per parent inside a single FetchChanges call:
// their page time scales with BatchSize and with whatever concurrency the adaptive controller
// currently allows, so after a concurrency cut a page that fit when parallel no longer fit
// sequentially — it timed out, which kept concurrency pinned down.
//
// Resolution order under test (highest first):
//   CompanyIntegration.Configuration.fetchTimeoutMs  →  connector.FetchChangesTimeoutMs  →  default
//
// We assert on the message WithTimeout produces ("... timed out after <N>ms"), which names the
// resolved value directly, rather than reaching into private engine state.

let mockRunViewsFn: ReturnType<typeof vi.fn>;

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
    // Durable run ownership (#3291, merged after this branch was cut): every sync claims its run row,
    // heartbeats a lease, fences each batch boundary and releases at the end, all through the provider.
    // Imported HERE rather than at module scope because `vi.mock` factories are hoisted above imports.
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
                };
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
                // Without this surface the run aborts inside `RunOwnershipService.Claim` before any
                // FetchChanges happens, so a timeout test never reaches what it measures.
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

/**
 * A connector whose FetchChanges never settles, so the ONLY way the engine proceeds is the
 * timeout firing. `timeoutHint` populates the new FetchChangesTimeoutMs property.
 */
function createHangingConnector(timeoutHint: number | null): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ConnectionTestResult>>().mockResolvedValue({
            Success: true, Message: 'OK',
        }),
        DiscoverObjects: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ExternalObjectSchema[]>>().mockResolvedValue([]),
        DiscoverFields: vi.fn<[MJCompanyIntegrationEntity, string, UserInfo], Promise<ExternalFieldSchema[]>>().mockResolvedValue([]),
        FetchChanges: vi.fn<[FetchContext], Promise<FetchBatchResult>>().mockImplementation(
            () => new Promise<FetchBatchResult>(() => { /* never settles — the timeout must fire */ })
        ),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: vi.fn().mockReturnValue(undefined),
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
        MaxConcurrencyHint: null,
        FetchChangesTimeoutMs: timeoutHint,
    } as unknown as BaseIntegrationConnector;
}

function createMockCompanyIntegration(configuration: string): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return configuration;
            return null;
        }),
        ID: 'ci-1',
        IntegrationID: 'int-1',
        Configuration: configuration,
    } as unknown as MJCompanyIntegrationEntity;
}

function wireConfigMocks(companyIntegration: MJCompanyIntegrationEntity, integration: MJIntegrationEntity): void {
    mockRunViewsFn.mockResolvedValueOnce([
        { Success: true, Results: [companyIntegration] },
        {
            Success: true,
            Results: [{
                Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                ID: 'em-1',
                CompanyIntegrationID: 'ci-1',
                EntityID: 'entity-1',
                ConflictResolution: 'SourceWins',
                DeleteBehavior: 'SoftDelete',
                Entity: 'Contacts',
                ExternalObjectName: 'contacts',
                SyncEnabled: true,
                Status: 'Active',
                SyncDirection: 'Pull',
            } as unknown as ICompanyIntegrationEntityMap],
        },
        { Success: true, Results: [integration] },
        { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
    ]);

    mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
        const entityName = params['EntityName'] as string;
        if (entityName === 'MJ: Company Integration Field Maps') {
            return {
                Success: true,
                Results: [{
                    SourceFieldName: 'Name',
                    DestinationFieldName: 'Name',
                    TransformPipeline: null,
                    IsKeyField: true,
                    Status: 'Active',
                    Priority: 0,
                } as unknown as ICompanyIntegrationFieldMap],
            };
        }
        return { Success: true, Results: [] };
    });
}

function buildIntegration(): MJIntegrationEntity {
    return {
        ID: 'int-1',
        Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
        Name: 'TestIntegration',
        ClassName: 'TestConnector',
    } as unknown as MJIntegrationEntity;
}

/** Collects the "timed out after <N>ms" values the engine logged during a run. */
function timeoutsLoggedBy(errorSpy: ReturnType<typeof vi.spyOn>): number[] {
    return errorSpy.mock.calls
        .map(args => args.map(a => String(a)).join(' '))
        .map(msg => /timed out after (\d+)ms/.exec(msg))
        .filter((m): m is RegExpExecArray => m !== null)
        .map(m => Number(m[1]));
}

describe('IntegrationEngine — FetchChanges timeout resolution', () => {
    let orchestrator: IntegrationEngine;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let resolveOrig: typeof ConnectorFactory.Resolve;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ });
        resolveOrig = ConnectorFactory.Resolve;
    });

    afterEach(() => {
        errorSpy.mockRestore();
        ConnectorFactory.Resolve = resolveOrig;
    });

    /**
     * Runs a sync whose FetchChanges never settles, so the engine's timeout is the ONLY thing
     * that ends the call, and returns every "timed out after <N>ms" the engine logged. Each
     * observed value is the timeout the engine actually resolved for that page.
     */
    async function observeResolvedTimeouts(configJSON: string, connectorHint: number | null): Promise<number[]> {
        wireConfigMocks(createMockCompanyIntegration(configJSON), buildIntegration());
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(createHangingConnector(connectorHint));
        await orchestrator.RunSync('ci-1', contextUser);
        return timeoutsLoggedBy(errorSpy);
    }

    it('honors CompanyIntegration.Configuration.fetchTimeoutMs', async () => {
        const observed = await observeResolvedTimeouts('{"fetchTimeoutMs": 40}', null);
        expect(observed.length).toBeGreaterThan(0);
        expect(observed.every(ms => ms === 40)).toBe(true);
    }, 30000);

    it("falls back to the connector's FetchChangesTimeoutMs when Configuration says nothing", async () => {
        const observed = await observeResolvedTimeouts('{}', 55);
        expect(observed.length).toBeGreaterThan(0);
        expect(observed.every(ms => ms === 55)).toBe(true);
    }, 30000);

    it('Configuration wins over the connector property (deployment has the last word)', async () => {
        const observed = await observeResolvedTimeouts('{"fetchTimeoutMs": 35}', 90000);
        expect(observed.length).toBeGreaterThan(0);
        expect(observed.every(ms => ms === 35)).toBe(true);
    }, 30000);

    it('ignores a non-positive override and falls through to the next source', async () => {
        // -5 is rejected by the numeric guard, so resolution falls through to the connector's 45.
        const observed = await observeResolvedTimeouts('{"fetchTimeoutMs": -5}', 45);
        expect(observed.length).toBeGreaterThan(0);
        expect(observed.every(ms => ms === 45)).toBe(true);
    }, 30000);

    it('attempts a timed-out page exactly ONCE — no retry of our own timeout', async () => {
        // `WithTimeout` cannot cancel the work it abandons, so a retry would put a second full page of
        // vendor requests in flight alongside the first, then a third. Since the retried work runs under
        // the same budget it just exceeded, it could not have succeeded either. Counting the connector's
        // FetchChanges invocations through the REAL engine path is what pins that: 1, not MaxAttempts.
        //
        // The predicate's semantics — and why the exclusion is instanceof-based rather than dropping the
        // NETWORK_TIMEOUT code, which would also stop retrying reset sockets — are in
        // WithTimeoutNoRetry.test.ts.
        const connector = createHangingConnector(30);
        wireConfigMocks(createMockCompanyIntegration('{}'), buildIntegration());
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        await orchestrator.RunSync('ci-1', contextUser);

        const fetchChanges = connector.FetchChanges as unknown as ReturnType<typeof vi.fn>;
        expect(fetchChanges).toHaveBeenCalledTimes(1);
    }, 30000);

});

/**
 * The guard both override sources are run through.
 *
 * Tested directly rather than end-to-end: proving "a bad connector value falls back to the framework
 * default" through the engine means waiting out that 30s default three times over, and the value under
 * test is a pure function. The end-to-end tests above already prove the connector property is consulted
 * at all (the 55ms case).
 *
 * Why the connector source needs the guard too: `??` rejects only null/undefined, but
 * `FetchChangesTimeoutMs` is declared `number | null`, so 0, negatives and NaN are all type-legal —
 * and `Number(process.env.UNSET)` or an undefined arithmetic term yields NaN without a type error.
 * setTimeout coerces every one of those to ~1ms, so an unguarded value doesn't fail loudly; it makes
 * every page time out instantly and the object silently syncs nothing.
 */
describe('PositiveInt — the override guard', () => {
    it('accepts a positive number, flooring fractions', () => {
        expect(PositiveInt(1)).toBe(1);
        expect(PositiveInt(120000)).toBe(120000);
        expect(PositiveInt(1.9)).toBe(1);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
    ])('rejects %s so the caller falls through to the next source', (_label, v) => {
        expect(PositiveInt(v)).toBeUndefined();
    });

    it.each([
        ['a numeric string', '500'],
        ['null', null],
        ['undefined', undefined],
        ['an object', {}],
    ])('rejects %s', (_label, v) => {
        expect(PositiveInt(v)).toBeUndefined();
    });
});

/**
 * The engine never pages past an unskippable fetch failure — it stops the object with whatever it
 * already collected. Both signals that the result set is INCOMPLETE are asserted here, because they
 * land on different surfaces and an operator may only be watching one:
 *
 *  - the structured `FETCH_ABORTED_INCOMPLETE` warning on the run-event stream (and console), and
 *  - a `Warning`-severity entry in `result.Errors`, which FinalizeRun writes to
 *    `CompanyIntegrationRun.ErrorLog` — the queryable run history.
 *
 * Without the second, a nightly sync that aborts on its first page every night reads as an unbroken
 * run of clean `Status='Success'` rows with `TotalRecords: 0`.
 */
describe('IntegrationEngine — an aborted, incomplete fetch is reported', () => {
    let orchestrator: IntegrationEngine;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let resolveOrig: typeof ConnectorFactory.Resolve;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ });
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* captured below */ });
        resolveOrig = ConnectorFactory.Resolve;
    });

    afterEach(() => {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
        ConnectorFactory.Resolve = resolveOrig;
    });

    /** A cursor-paged object whose first page times out: unskippable, so the object aborts at batch 1. */
    async function runAbortingSync(): Promise<void> {
        wireConfigMocks(createMockCompanyIntegration('{"fetchTimeoutMs": 40}'), buildIntegration());
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(createHangingConnector(null));
        await orchestrator.RunSync('ci-1', contextUser);
    }

    it('emits a FETCH_ABORTED_INCOMPLETE warning naming the object and the batch', async () => {
        await runAbortingSync();

        const warning = warnSpy.mock.calls
            .map(args => args.map(a => String(a)).join(' '))
            .find(line => line.includes('FETCH_ABORTED_INCOMPLETE'));

        expect(warning).toBeDefined();
        expect(warning).toContain('contacts');
        expect(warning).toContain('INCOMPLETE');
        // The operator's next question is "did I lose data?" — the message has to answer it.
        expect(warning).toContain('watermark is held');
    }, 30000);

    it('records the abort on the run so it survives in queryable history, without failing the run', async () => {
        await runAbortingSync();

        const run = mockEntityInstances.get('MJ: Company Integration Runs');
        expect(run).toBeDefined();
        // Severity 'Warning' keeps the status honest: no RECORD failed, and the held watermark means
        // the window is retried — so this is not a failed run...
        expect(run!._data['Status']).toBe('Success');
        // ...but it must no longer be indistinguishable from a clean "nothing changed" run.
        const errorLog = run!._data['ErrorLog'] as string | undefined;
        expect(errorLog).toBeDefined();
        expect(errorLog).toContain('INCOMPLETE');
        expect(errorLog).toContain('"Severity":"Warning"');
    }, 30000);
});
