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
import { IntegrationEngine } from '../IntegrationEngine.js';
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
});
