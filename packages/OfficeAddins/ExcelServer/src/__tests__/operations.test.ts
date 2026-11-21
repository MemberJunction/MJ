import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { EntityFieldInfo, EntityInfo, IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import {
    ExcelAddinBuildWorkbookServerOperation,
    ExcelAddinCreateConnectionServerOperation,
    ExcelAddinEvaluateCustomFunctionServerOperation,
    ExcelAddinGetCatalogServerOperation,
    ExcelAddinGetEntityViewsServerOperation,
    ExcelAddinGetStatusServerOperation,
    ExcelAddinResolveSourceServerOperation,
    MakeWorkbookFileName,
} from '../operations';
import { ExcelAddinRuntime } from '../runtime';
import { ParseExcelAddinSettings } from '../settings';
import { WEB_EXTENSION_PART } from '../workbook-builder';

const QUERY_ID = '7A2B3C4D-1E2F-4A5B-8C9D-0E1F2A3B4C5D';

const { queryEngineStub, engineState } = vi.hoisted(() => {
    const query = {
        ID: '7A2B3C4D-1E2F-4A5B-8C9D-0E1F2A3B4C5D',
        Name: 'Renewals: 2026',
        Status: 'Approved',
        CategoryID: null,
        Description: null,
        UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
        QueryFields: [{ Name: 'Month', Sequence: 1, SQLBaseType: 'date' }],
        QueryParameters: [],
    };
    /** The one saved query the stubbed engine holds; a test may swap it. */
    const engineState: { Query: typeof query } = { Query: query };
    return {
        engineState,
        queryEngineStub: {
            get Queries() {
                return [engineState.Query];
            },
            QueryCategories: [],
            Config: vi.fn(async () => undefined),
            FindQueryByID: (id: string) => (id.toLowerCase() === engineState.Query.ID.toLowerCase() ? engineState.Query : undefined),
            FindQueryByName: (name: string) =>
                (name.trim().toLowerCase() === engineState.Query.Name.toLowerCase() ? engineState.Query : undefined),
        },
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core-entities')>()),
    // GetProviderInstance: the engine bound to the request provider's connection (the same stub here).
    QueryEngine: { Instance: queryEngineStub, GetProviderInstance: vi.fn(() => queryEngineStub) },
}));

const user = { ID: 'user-1', Name: 'Ada', Email: 'ada@example.org' } as UserInfo;
// The deprecated provider query list stays empty: the query comes from the stubbed QueryEngine.
const provider = { Queries: [] } as unknown as IMetadataProvider;
const context: RemoteOpServerContext = { provider, user, emitProgress: vi.fn() };

function enable(): void {
    const parsed = ParseExcelAddinSettings({ ExplorerUrl: 'https://explorer.example.org', ServerName: 'Cheese Federation' });
    ExcelAddinRuntime.Instance.Configure(parsed.Settings!, 'https://api.example.org/office/excel/');
}

describe('ExcelAddin operations, add-in off', () => {
    beforeEach(() => ExcelAddinRuntime.Instance.Reset());

    it('status reports off with no URLs', async () => {
        const result = await new ExcelAddinGetStatusServerOperation().ExecuteServer({}, context);
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ Enabled: false, ServerName: '', ConnectedPageUrl: '', ManifestUrl: '', KeyLifetimeDays: 0 });
    });

    it('refuses to create a connection', async () => {
        const result = await new ExcelAddinCreateConnectionServerOperation().ExecuteServer({}, context);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FORBIDDEN');
    });

    it('refuses to build a workbook', async () => {
        const result = await new ExcelAddinBuildWorkbookServerOperation().ExecuteServer({ Sources: [{ Kind: 'Query', ID: QUERY_ID }] }, context);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FORBIDDEN');
    });

    it('refuses catalog, entity views, and source resolution when off', async () => {
        expect((await new ExcelAddinGetCatalogServerOperation().ExecuteServer({}, context)).ResultCode).toBe('FORBIDDEN');
        expect((await new ExcelAddinGetEntityViewsServerOperation().ExecuteServer({ EntityID: QUERY_ID }, context)).ResultCode).toBe('FORBIDDEN');
        expect(
            (await new ExcelAddinResolveSourceServerOperation().ExecuteServer({ Source: { Kind: 'Query', ID: QUERY_ID } }, context)).ResultCode,
        ).toBe('FORBIDDEN');
    });
});

describe('ExcelAddin operations, add-in on', () => {
    beforeEach(enable);

    it('status reports the host\'s add-in URLs', async () => {
        const result = await new ExcelAddinGetStatusServerOperation().ExecuteServer({}, context);
        expect(result.Output).toEqual({
            Enabled: true,
            ServerName: 'Cheese Federation',
            ConnectedPageUrl: 'https://api.example.org/office/excel/connected.html',
            ManifestUrl: 'https://api.example.org/office/excel/manifest.xml',
            KeyLifetimeDays: 90,
        });
    });

    it('builds a connected workbook named after its source', async () => {
        const result = await new ExcelAddinBuildWorkbookServerOperation().ExecuteServer({ Sources: [{ Kind: 'Query', ID: QUERY_ID }] }, context);
        expect(result.Success).toBe(true);
        expect(result.Output?.FileName).toBe('Renewals 2026.xlsx');
        const zip = await JSZip.loadAsync(Buffer.from(result.Output!.ContentBase64, 'base64'));
        expect(zip.file(WEB_EXTENSION_PART)).not.toBeNull();
    });

    it('returns a source refusal as the failure message', async () => {
        const result = await new ExcelAddinBuildWorkbookServerOperation().ExecuteServer({ Sources: [] }, context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/at least one view, entity, or query/);
    });

    it('returns the caller\'s catalog and resolves an individual source', async () => {
        const catalogResult = await new ExcelAddinGetCatalogServerOperation().ExecuteServer({}, context);
        expect(catalogResult.Success).toBe(true);
        expect(catalogResult.Output?.Queries.map(q => q.ID)).toEqual([QUERY_ID]);

        const resolvedResult = await new ExcelAddinResolveSourceServerOperation().ExecuteServer(
            { Source: { Kind: 'Query', ID: QUERY_ID } },
            context,
        );
        expect(resolvedResult.Success).toBe(true);
        expect(resolvedResult.Output?.Source.Name).toBe('Renewals: 2026');
    });

    it('evaluates =MJ.QUERY custom functions and refuses IsServerSet parameters', async () => {
        const original = engineState.Query;
        // The query comes from the provider's QueryEngine; the deprecated provider query list stays empty.
        engineState.Query = {
            ...original,
            UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
            QueryFields: [{ Name: 'Total', Sequence: 1, SQLBaseType: 'decimal' }],
            QueryParameters: [
                { Name: 'Year', Type: 'number', IsRequired: false, IsServerSet: false },
                { Name: 'TenantID', Type: 'string', IsRequired: false, IsServerSet: true },
            ],
        } as unknown as typeof original;
        const evalProvider = {
            Queries: [],
            RunQuery: async () => ({
                Success: true,
                Results: [{ Total: 7500 }],
                RowCount: 1,
                TotalRowCount: 1,
            }),
        } as unknown as IMetadataProvider;
        const evalContext: RemoteOpServerContext = { provider: evalProvider, user, emitProgress: vi.fn() };

        const ok = await new ExcelAddinEvaluateCustomFunctionServerOperation().ExecuteServer(
            { Kind: 'Query', Target: 'Renewals: 2026', PositionalArguments: [2026] },
            evalContext,
        );
        expect(ok.Success).toBe(true);
        expect(ok.Output?.Matrix).toEqual([[7500]]);
        expect(ok.Output?.ScalarValue).toBe(7500);

        const refused = await new ExcelAddinEvaluateCustomFunctionServerOperation().ExecuteServer(
            { Kind: 'Query', Target: 'Renewals: 2026', Parameters: { TenantID: 'override' } },
            evalContext,
        );
        expect(refused.Success).toBe(false);
        expect(refused.ErrorMessage).toMatch(/set by the server/i);
        engineState.Query = original;
    });

    it('evaluates =MJ.VIEW custom functions by view Name with optional Filter and refuses unsafe SQL filters', async () => {
        const entityId = '8B3C4D5E-2F3A-4B5C-9D0E-1F2A3B4C5D6E';
        const viewId = '6F1D4A6E-0C5E-4B53-9E0B-6F2C1D8E9A10';
        const firstNameField = new EntityFieldInfo({ Name: 'FirstName', Type: 'nvarchar', DisplayName: 'First Name', DefaultInView: true, Sequence: 1 });
        const statusField = new EntityFieldInfo({ Name: 'Status', Type: 'nvarchar', DisplayName: 'Status', DefaultInView: true, Sequence: 2 });
        const entity = Object.create(EntityInfo.prototype) as EntityInfo;
        Object.assign(entity, {
            ID: entityId,
            Name: 'MJ: Members',
            DisplayName: 'Members',
            IncludeInAPI: true,
            Status: 'Active',
            GetUserPermisions: () => ({ CanRead: true }),
            GetDeniedReadFields: () => new Set<string>(),
        });
        Object.defineProperty(entity, 'Fields', { get: () => [firstNameField, statusField] });

        const viewObj = {
            ID: viewId,
            Name: 'Active Members',
            EntityID: entityId,
            Load: vi.fn(async () => true),
            UserCanView: true,
            Columns: [],
            ViewEntityInfo: entity,
        } as unknown as MJUserViewEntityExtended;

        const runViewCalls: Array<{ EntityName?: string; ViewID?: string; ExtraFilter?: string }> = [];
        const viewProvider = {
            Entities: [entity],
            GetEntityObject: vi.fn(async () => viewObj),
            RunView: vi.fn(async (params: { EntityName?: string; ViewID?: string; ExtraFilter?: string }) => {
                runViewCalls.push(params);
                if (params.EntityName === 'MJ: User Views') {
                    return {
                        Success: true,
                        Results: [{ ID: viewId, Name: 'Active Members', EntityID: entityId, UserID: user.ID, IsShared: true }],
                    };
                }
                return {
                    Success: true,
                    Results: [{ FirstName: 'Ada', Status: 'Active' }],
                    TotalRowCount: 1,
                };
            }),
        } as unknown as IMetadataProvider;
        const viewContext: RemoteOpServerContext = { provider: viewProvider, user, emitProgress: vi.fn() };

        const ok = await new ExcelAddinEvaluateCustomFunctionServerOperation().ExecuteServer(
            {
                Kind: 'View',
                Target: 'MJ: Members',
                ViewNameOrId: 'Active Members',
                Filter: "Status='Active'",
                IncludeHeaders: true,
            },
            viewContext,
        );
        expect(ok.Success).toBe(true);
        expect(ok.Output?.Matrix).toEqual([
            ['First Name', 'Status'],
            ['Ada', 'Active'],
        ]);
        expect(runViewCalls.some(c => c.ViewID === viewId && c.ExtraFilter === "Status = 'Active'")).toBe(true);

        const quotedAnd = await new ExcelAddinEvaluateCustomFunctionServerOperation().ExecuteServer(
            {
                Kind: 'View',
                Target: 'MJ: Members',
                ViewNameOrId: 'Active Members',
                Filter: "FirstName='Ada AND Grace' AND Status='Active'",
            },
            viewContext,
        );
        expect(quotedAnd.Success).toBe(true);
        expect(
            runViewCalls.some(
                c => c.ViewID === viewId && c.ExtraFilter === "FirstName = 'Ada AND Grace' AND Status = 'Active'",
            ),
        ).toBe(true);

        const sqli = await new ExcelAddinEvaluateCustomFunctionServerOperation().ExecuteServer(
            {
                Kind: 'View',
                Target: 'MJ: Members',
                ViewNameOrId: 'Active Members',
                Filter: "Status='Active'; DROP TABLE Users--",
            },
            viewContext,
        );
        expect(sqli.Success).toBe(false);
        expect(sqli.ErrorMessage).toMatch(/unsafe sql filter/i);
    });
});

describe('MakeWorkbookFileName', () => {
    it.each([
        [[{ Name: 'Members: Active / Lapsed' }], 'Members Active Lapsed.xlsx'],
        [[{ Name: '...' }], 'MemberJunction.xlsx'],
        [[], 'MemberJunction.xlsx'],
        [[{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }], 'A and 2 more.xlsx'],
    ])('names %j as %s', (sources, expected) => {
        expect(MakeWorkbookFileName(sources)).toBe(expected);
    });
});
