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
import { ExternalTextMB, MBKeptByOneParsedValue, PAGE_MB, ParseFirstValue, ResponsePage } from './helpers/retainedText.js';

// ---------------------------------------------------------------------------
// Memory held by an entity map while it pages through a source.
//
// A connector that parses response text with a regex returns values that point into the page, so
// keeping any one value keeps the whole page. The engine must hold only the pages it is working on,
// not every page the map has fetched so far.
//
// Harness: the real engine driven through RunSync() with a fake connector, as in
// IntegrationEngine.fetch-integrity.test.ts. No mock on the record path records its calls
// (vi.fn / vi.spyOn), because a recorded call would itself keep the records and their pages.
// ---------------------------------------------------------------------------

type RunViewAnswer = { Success: boolean; Results: unknown[] };

/** Answers each RunView by entity name. */
let answerRunView: (params: Record<string, unknown>) => Promise<RunViewAnswer>;
/** Answers queued for the next RunViews calls, in order; afterwards each leg goes to answerRunView. */
let queuedRunViews: RunViewAnswer[][];

function createMockEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: () => undefined,
        Save: async () => true,
        Delete: async () => true,
        InnerLoad: async () => true,
        Get: (field: string) => data[field],
        Set: (field: string, value: unknown) => { data[field] = value; },
        get ID() { return String(data['ID'] ?? 'generated-id'); },
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
    };
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    const { createOwnershipProviderSurface } = await vi.importActual<
        typeof import('./helpers/ownershipProviderSurface.js')
    >('./helpers/ownershipProviderSurface.js');
    class MockMetadata {
        static Provider: Record<string, unknown>;
        get Entities() {
            return [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }];
        }
        EntityByName(name: string) {
            return this.Entities.find(e => e.Name === name);
        }
        async GetEntityObject() {
            return createMockEntity();
        }
    }
    const surface = createOwnershipProviderSurface();
    const executeSQL = surface.ExecuteSQL.getMockImplementation()!;
    MockMetadata.Provider = {
        ...surface,
        ExecuteSQL: (sql: string, params: unknown[]) => executeSQL(sql, params),
        BeginTransaction: async () => undefined,
        CommitTransaction: async () => undefined,
        RollbackTransaction: async () => undefined,
        Entities: [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }],
        EntityByName(name: string) {
            return [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }].find(e => e.Name === name);
        },
        GetEntityObject: async () => createMockEntity(),
    };
    return {
        ...actual,
        RunView: class MockRunView {
            async RunViews(params: Array<Record<string, unknown>>) {
                return queuedRunViews.shift() ?? Promise.all(params.map(p => answerRunView(p)));
            }
            RunView(params: Record<string, unknown>) { return answerRunView(params); }
        },
        Metadata: MockMetadata,
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
                    GetRegistration: () => ({}),
                    CreateInstance: () => undefined,
                },
            },
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

/** Pages the fake source serves for one object. */
const PAGES = 12;

/** A Contact record with the given ExternalID. */
function contact(externalID: string, page: number): ExternalRecord {
    return { ExternalID: externalID, ObjectType: 'Contact', Fields: { Name: `C${page}` }, IsDeleted: false };
}

/** One record per page. Its ExternalID is parsed out of that page's text. */
function oneIDPerPage(page: number): ExternalRecord[] {
    return [contact(ParseFirstValue(ResponsePage(`record-from-page-${String(page).padStart(4, '0')}`)), page)];
}

/**
 * Every page serves the ID that page 1 served, as overlapping pages do, and pages after the first
 * also serve one new record. Each copy of the repeated ID is parsed out of the page that served it.
 */
function idRepeatedOnEveryPage(page: number): ExternalRecord[] {
    const repeated = contact(ParseFirstValue(ResponsePage('record-served-by-every-page')), page);
    return page === 1 ? [repeated] : [contact(`record-${page}`, page), repeated];
}

/**
 * A page-paged connector that serves `recordsForPage(page)` for each page. Each ExternalID parsed out
 * of a page of response text keeps that page alive for as long as anything holds it.
 * `onLastPage` runs when the engine asks for the last page, while the map is still running.
 */
function pageTextConnector(
    recordsForPage: (page: number) => ExternalRecord[],
    onLastPage: () => Promise<void>,
): BaseIntegrationConnector {
    return {
        TestConnection: async () => ({ Success: true }),
        DiscoverObjects: async () => [],
        DiscoverFields: async () => [],
        FetchChanges: async (ctx: FetchContext): Promise<FetchBatchResult> => {
            const page = ctx.CurrentPage ?? 1;
            if (page === PAGES) await onLastPage();
            return { Records: recordsForPage(page), HasMore: page < PAGES, NextPage: page + 1 };
        },
        GetDefaultFieldMappings: () => [],
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
    } as unknown as BaseIntegrationConnector;
}

/** The run-config reads, a Pull watermark row, and a field map for `Name`; no existing record maps. */
function wireRun(): void {
    const companyIntegration = {
        Get: (field: string) => (field === 'ID' ? 'ci-1' : field === 'Configuration' ? '{}' : null),
        IntegrationID: 'int-1',
    } as unknown as MJCompanyIntegrationEntity;
    const integration = {
        ID: 'int-1',
        Get: (f: string) => (f === 'ID' ? 'int-1' : null),
        Name: 'Test',
        ClassName: 'TestConnector',
    } as unknown as MJIntegrationEntity;
    queuedRunViews = [[
        { Success: true, Results: [companyIntegration] },
        {
            Success: true,
            Results: [{
                Get: (f: string) => (f === 'ID' ? 'em-1' : null),
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
    ]];
    const watermark = {
        ID: 'wm-1',
        EntityMapID: 'em-1',
        Direction: 'Pull' as const,
        WatermarkType: 'Timestamp' as const,
        WatermarkValue: '2024-06-15T09:00:00.000Z' as string | null,
        LastSyncAt: new Date('2024-06-15T09:00:00.000Z'),
        RecordsSynced: 0,
        Get: () => undefined,
        Save: async () => true,
    } as unknown as ICompanyIntegrationSyncWatermark;
    answerRunView = async (params: Record<string, unknown>) => {
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
            return { Success: true, Results: [watermark] };
        }
        return { Success: true, Results: [] };
    };
}

/** Drives one incremental RunSync through the real engine with `connector` installed. */
async function runPull(engine: IntegrationEngine, connector: BaseIntegrationConnector) {
    wireRun();
    const { ConnectorFactory } = await import('../ConnectorFactory.js');
    const resolveOrig = ConnectorFactory.Resolve;
    ConnectorFactory.Resolve = () => connector;
    try {
        return await engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false });
    } finally {
        ConnectorFactory.Resolve = resolveOrig;
    }
}

describe('IntegrationEngine — memory held while an entity map pages through a source', () => {
    const quiet = { log: console.log, warn: console.warn, error: console.error };

    beforeEach(() => {
        (IntegrationEngine as unknown as Record<string, unknown>)['activeSyncs'] = new Map();
        // Plain no-ops, not spies: a spy records its arguments, and log lines can contain record IDs.
        console.log = () => undefined;
        console.warn = () => undefined;
        console.error = () => undefined;
    });

    afterEach(() => {
        console.log = quiet.log;
        console.warn = quiet.warn;
        console.error = quiet.error;
    });

    it('does not keep the earlier pages of a map while it fetches the next one', async () => {
        // The premise: a parsed value that is not copied keeps its page.
        expect(await MBKeptByOneParsedValue()).toBeGreaterThan(PAGE_MB / 2);
        const before = await ExternalTextMB();
        let heldAtLastPage = Number.NaN;
        const connector = pageTextConnector(oneIDPerPage, async () => {
            heldAtLastPage = (await ExternalTextMB()) - before;
        });

        const result = await runPull(new IntegrationEngine(), connector);

        // The run reached the last page and wrote every record.
        expect(result.RecordsCreated).toBe(PAGES);
        expect(Number.isNaN(heldAtLastPage)).toBe(false);
        // The page being processed and the page being fetched may be alive; the other ten may not.
        expect(heldAtLastPage).toBeLessThan(3 * PAGE_MB);
    });

    it('does not keep the pages of IDs that a later page serves again', async () => {
        // The premise: a parsed value that is not copied keeps its page.
        expect(await MBKeptByOneParsedValue()).toBeGreaterThan(PAGE_MB / 2);
        const before = await ExternalTextMB();
        let heldAtLastPage = Number.NaN;
        const connector = pageTextConnector(idRepeatedOnEveryPage, async () => {
            heldAtLastPage = (await ExternalTextMB()) - before;
        });

        const result = await runPull(new IntegrationEngine(), connector);

        // The engine saw the repeats: overlapping pages mark the object incomplete.
        expect(result.IncompleteObjects).toContain('contacts');
        expect(Number.isNaN(heldAtLastPage)).toBe(false);
        // The page being processed and the page being fetched may be alive; the other ten may not.
        expect(heldAtLastPage).toBeLessThan(3 * PAGE_MB);
    });
});
