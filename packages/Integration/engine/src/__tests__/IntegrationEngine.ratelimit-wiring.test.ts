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
    RateLimitPolicy,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';
import { RateLimiter } from '../RateLimiter.js';

// ---- Mock harness (copied from IntegrationEngine.test.ts) ----
//
// This suite proves the rate-limit / AIMD WIRING that the main IntegrationEngine.test.ts
// can't reach: every connector there sets RateLimitPolicy:null, so getRateLimiter (the
// policy → limiter glue), reportRateOutcome (ReportThrottle on a 429 / ReportSuccess on a
// clean fetch), and the AIMD multiplicative-decrease are never exercised *through the
// engine*. Here the mock connector DEFINES a RateLimitPolicy and its FetchChanges throws a
// 429, so we can assert the connector-policy → limiter → engine glue actually runs (not the
// RateLimiter class in isolation). We spy on RateLimiter.prototype — the engine imports the
// same './RateLimiter.js' module this test does, so the prototype spy observes the exact
// limiter instance the engine builds from the connector's policy.

let mockRunViewsFn: ReturnType<typeof vi.fn>;
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
 * Builds a mock connector that DECLARES a RateLimitPolicy (unlike the null-policy connectors in
 * IntegrationEngine.test.ts). `fetchImpl` lets each test inject throw/return behavior for the
 * fetch path. `extractRetryAfterMs` is a spy so we can assert the engine consults it when feeding
 * a 429 into the limiter (reportRateOutcome → connector.ExtractRetryAfterMs → limiter.ReportThrottle).
 */
function createRateLimitedConnector(
    policy: RateLimitPolicy,
    fetchImpl: (ctx: FetchContext) => Promise<FetchBatchResult>,
    extractRetryAfterMs: (err: unknown) => number | undefined = () => undefined
): BaseIntegrationConnector & { ExtractRetryAfterMs: ReturnType<typeof vi.fn> } {
    return {
        TestConnection: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ConnectionTestResult>>().mockResolvedValue({
            Success: true, Message: 'OK',
        }),
        DiscoverObjects: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ExternalObjectSchema[]>>().mockResolvedValue([]),
        DiscoverFields: vi.fn<[MJCompanyIntegrationEntity, string, UserInfo], Promise<ExternalFieldSchema[]>>().mockResolvedValue([]),
        FetchChanges: vi.fn<[FetchContext], Promise<FetchBatchResult>>().mockImplementation(fetchImpl),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        // The whole point of this suite: a non-null policy drives getRateLimiter.
        RateLimitPolicy: policy,
        ExtractRetryAfterMs: vi.fn().mockImplementation(extractRetryAfterMs),
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
        MaxConcurrencyHint: null,
    } as unknown as BaseIntegrationConnector & { ExtractRetryAfterMs: ReturnType<typeof vi.fn> };
}

function createMockCompanyIntegration(): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return '{}';
            return null;
        }),
        ID: 'ci-1',
        IntegrationID: 'int-1',
        Configuration: '{}',
    } as unknown as MJCompanyIntegrationEntity;
}

/** Standard RunViews/RunView config so RunSync reaches a single Pull entity map for 'Contacts'. */
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
        if (entityName === 'MJ: Company Integration Sync Watermarks') {
            return { Success: true, Results: [] };
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

describe('IntegrationEngine — rate-limit / AIMD wiring (connector policy → limiter → engine glue)', () => {
    let orchestrator: IntegrationEngine;
    let throttleSpy: ReturnType<typeof vi.spyOn>;
    let successSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn();
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        // Spy on the REAL limiter prototype. The engine builds its limiter from the connector's
        // policy via `new RateLimiter(...)` against this same module, so these spies observe the
        // exact instance the engine drives through the AIMD glue.
        throttleSpy = vi.spyOn(RateLimiter.prototype, 'ReportThrottle');
        successSpy = vi.spyOn(RateLimiter.prototype, 'ReportSuccess');
    });

    afterEach(() => {
        throttleSpy.mockRestore();
        successSpy.mockRestore();
    });

    it('a 429 on fetch drives the connector policy → limiter: ReportThrottle fires, the engine-built limiter started at the policy rate, and AIMD halves it', async () => {
        const policy: RateLimitPolicy = { TokensPerSec: 8, Burst: 8, ThrottleBackoffFactor: 0.5 };
        // FetchChanges throws a 429 — message contains '429' so ClassifyError → RATE_LIMIT_EXCEEDED,
        // which is the ONLY fetch-error class the engine feeds into reportRateOutcome(throttledErr).
        const connector = createRateLimitedConnector(
            policy,
            async () => { throw new Error('Request failed: 429 Too Many Requests'); },
            // Retry-After the connector parses out of the 429 — proves the engine threads it through.
            () => 1234
        );

        const companyIntegration = createMockCompanyIntegration();
        const integration = buildIntegration();
        wireConfigMocks(companyIntegration, integration);

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);

            // The fetch 429 broke the pull loop cleanly — the map yields 0 records (a 429 on fetch
            // does NOT retry within the same map; it backs off and stops). The run still succeeds
            // overall (no record-level errors), which is the expected shape for a throttled fetch.
            expect(result.RecordsProcessed).toBe(0);
            expect(result.RecordsCreated).toBe(0);

            // GLUE PROOF 1: the engine fed the 429 into the limiter via reportRateOutcome → ReportThrottle.
            expect(throttleSpy).toHaveBeenCalledTimes(1);
            // keyed by CompanyIntegrationID (per-credential bucket), with the connector-parsed Retry-After.
            expect(throttleSpy).toHaveBeenCalledWith('ci-1', 1234);

            // GLUE PROOF 2: the engine consulted the connector's ExtractRetryAfterMs to get that value.
            expect(connector.ExtractRetryAfterMs).toHaveBeenCalledTimes(1);
            expect(connector.ExtractRetryAfterMs).toHaveBeenCalledWith(expect.any(Error));

            // GLUE PROOF 3: the limiter the engine drove was built from the CONNECTOR'S policy (8 t/s),
            // and the AIMD multiplicative-decrease (×0.5) halved its effective rate to 4 t/s. We read
            // the engine-owned limiter back out of the engine's private map and inspect its real state.
            const engineLimiter = (orchestrator as unknown as { _rateLimiters: Map<string, RateLimiter> })
                ._rateLimiters.get('ci-1');
            expect(engineLimiter).toBeInstanceOf(RateLimiter);
            const state = engineLimiter!.GetState('ci-1');
            // policy ceiling honored as the starting rate, then halved by the throttle.
            expect(state.EffectiveTokensPerSec).toBe(4);
            expect(state.Burst).toBe(8);
            // A positive Retry-After freezes refills — the engine threaded that through too.
            expect(state.FrozenUntil).toBeGreaterThan(0);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('a clean fetch drives the same glue the other way: ReportSuccess fires (AIMD ramp-up), ReportThrottle does not', async () => {
        const policy: RateLimitPolicy = { TokensPerSec: 8, Burst: 8, ThrottleBackoffFactor: 0.5 };
        const records: ExternalRecord[] = [
            { ExternalID: 'ext-1', ObjectType: 'Contact', Fields: { Name: 'Contact 1' }, IsDeleted: false },
        ];
        const connector = createRateLimitedConnector(
            policy,
            async () => ({ Records: records, HasMore: false, NewWatermarkValue: '2024-06-15T12:00:00.000Z' })
        );

        const companyIntegration = createMockCompanyIntegration();
        const integration = buildIntegration();
        wireConfigMocks(companyIntegration, integration);

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);

            // The record flowed through normally.
            expect(result.RecordsProcessed).toBe(1);
            expect(result.RecordsCreated).toBe(1);

            // GLUE PROOF: a clean fetch fed ReportSuccess (the AIMD ramp-UP side of the same wiring),
            // and never ReportThrottle. This is the success branch of reportRateOutcome(undefined).
            expect(successSpy).toHaveBeenCalledWith('ci-1');
            expect(successSpy).toHaveBeenCalledTimes(1);
            expect(throttleSpy).not.toHaveBeenCalled();

            // The engine-built limiter is the policy-derived one (proves getRateLimiter read the
            // connector policy, not the BatchRequestWaitTime / default fallback): ceiling 8, ramped
            // up by SuccessRampPerCall (TokensPerSec/10 = 0.8) but clamped at the 8 t/s ceiling.
            const engineLimiter = (orchestrator as unknown as { _rateLimiters: Map<string, RateLimiter> })
                ._rateLimiters.get('ci-1');
            expect(engineLimiter).toBeInstanceOf(RateLimiter);
            const state = engineLimiter!.GetState('ci-1');
            expect(state.EffectiveTokensPerSec).toBe(8);
            expect(state.Burst).toBe(8);
            expect(state.FrozenUntil).toBe(0);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });
});
