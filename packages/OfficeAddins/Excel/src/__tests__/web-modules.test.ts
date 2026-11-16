import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EXCEL_HANDOFF_VERSION, EXCEL_WORKBOOK_CONTRACT_VERSION } from '../index';
import {
    BuildCandidateConfigUrls,
    LoadSavedServerUrl,
    ResolveCustomPaneConfig,
    SameAddinUrl,
    SaveServerUrl,
} from '../web/pane-config';
import { ForgetConnection, LoadConnection, SaveConnection } from '../web/connection-store';
import {
    ConnectionRefusedError,
    FetchCatalog,
    FetchEntityViews,
    FetchSourceRows,
    ResolveWorkbookSourceOnServer,
} from '../web/mj-data-client';
import {
    DescribeSourceKind,
    FilterCatalogEntities,
    FilterCatalogQueries,
    ParseQueryFormParameters,
} from '../web/picker-logic';
import type { ExcelAddinCatalogOutput } from '../catalog-types';

class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    public get length(): number {
        return this.map.size;
    }
    public clear(): void {
        this.map.clear();
    }
    public getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    public key(index: number): string | null {
        return Array.from(this.map.keys())[index] ?? null;
    }
    public removeItem(key: string): void {
        this.map.delete(key);
    }
    public setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

describe('pane-config & multi-server connection-store', () => {
    const storage = new MemoryStorage();

    beforeEach(() => {
        storage.clear();
        vi.stubGlobal('window', { localStorage: storage });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('builds candidate config.json URLs from bare hosts, /office/excel, and direct config URLs', () => {
        expect(BuildCandidateConfigUrls('https://api.example.org/')).toEqual([
            'https://api.example.org/office/excel/config.json',
            'https://api.example.org/config.json',
        ]);
        expect(BuildCandidateConfigUrls('https://api.example.org/office/excel/')).toEqual([
            'https://api.example.org/office/excel/config.json',
        ]);
        expect(BuildCandidateConfigUrls('api.example.org:4414')).toContain(
            'https://api.example.org:4414/office/excel/config.json',
        );
        expect(SameAddinUrl('https://API.example.org/office/excel/', 'https://api.example.org/office/excel')).toBe(true);
    });

    it('resolves custom server config and persists saved server URL', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
                    ServerName: 'Staging MJ',
                    AddinUrl: 'https://staging.example.org/office/excel',
                    ExplorerConnectUrl: 'https://explorer-staging.example.org/office/connect',
                    MaxRows: 50000,
                }),
            })),
        );
        const resolved = await ResolveCustomPaneConfig('https://staging.example.org');
        expect(resolved.ServerName).toBe('Staging MJ');
        expect(resolved.MaxRows).toBe(50000);

        SaveServerUrl(resolved.AddinUrl);
        expect(LoadSavedServerUrl()).toBe('https://staging.example.org/office/excel');
        SaveServerUrl(null);
        expect(LoadSavedServerUrl()).toBeNull();
    });

    it('stores independent connections per server and migrates legacy v1 connections', () => {
        const hostA = 'https://a.example.org/office/excel';
        const hostB = 'https://b.example.org/office/excel';

        storage.setItem(
            'mj.excelAddin.connection.v1',
            JSON.stringify({
                APIKey: 'mj_sk_legacy',
                GraphQLUrl: 'https://a.example.org/',
                UserName: 'Ada',
                UserEmail: 'ada@a.org',
                ExpiresAt: '2030-01-01T00:00:00.000Z',
                AddinUrl: hostA,
            }),
        );
        expect(LoadConnection(`${hostA}/`)?.APIKey).toBe('mj_sk_legacy');

        SaveConnection(
            {
                Version: EXCEL_HANDOFF_VERSION,
                State: 's',
                APIKey: 'mj_sk_host_b',
                GraphQLUrl: 'https://b.example.org/',
                UserName: 'Grace',
                UserEmail: 'grace@b.org',
                ExpiresAt: '2030-01-01T00:00:00.000Z',
            },
            hostB,
        );

        expect(LoadConnection(hostA)?.APIKey).toBe('mj_sk_legacy');
        expect(LoadConnection(hostB)?.APIKey).toBe('mj_sk_host_b');

        ForgetConnection(hostA);
        expect(LoadConnection(hostA)).toBeNull();
        expect(LoadConnection(hostB)?.APIKey).toBe('mj_sk_host_b');
    });
});

describe('mj-data-client — Entity dynamic views & Remote Operations', () => {
    const connection = {
        APIKey: 'mj_sk_test',
        GraphQLUrl: 'https://api.example.org/',
        UserName: 'Ada',
        UserEmail: 'ada@example.org',
        ExpiresAt: null,
        AddinUrl: 'https://api.example.org/office/excel',
    };

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('fetches Entity rows via RunDynamicView', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
            ok: true,
            status: 200,
            json: async () => ({
                data: {
                    RunDynamicView: {
                        Success: true,
                        TotalRowCount: 2,
                        Results: [
                            { Data: JSON.stringify({ FirstName: 'Ada' }) },
                            { Data: JSON.stringify({ FirstName: 'Grace' }) },
                        ],
                    },
                },
            }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const rows = await FetchSourceRows(
            connection,
            {
                Key: 's1',
                Kind: 'Entity',
                ID: '1F5D2C3B-4A6E-4F70-8B9C-0D1E2F3A4B5C',
                Name: 'People',
                EntityName: 'People',
                SheetName: 'People',
                Columns: [{ Name: 'FirstName', Header: 'First Name', DataType: 'Text' }],
            },
            1000,
        );
        expect(rows.TotalRowCount).toBe(2);
        expect(rows.Rows).toEqual([{ FirstName: 'Ada' }, { FirstName: 'Grace' }]);
        const initArg = fetchMock.mock.calls[0]?.[1];
        const sentBody = JSON.parse(typeof initArg?.body === 'string' ? initArg.body : '{}') as {
            query: string;
            variables: { input: { EntityName: string; Fields: string[] } };
        };
        expect(sentBody.query).toContain('RunDynamicView');
        expect(sentBody.variables.input.EntityName).toBe('People');
        expect(sentBody.variables.input.Fields).toEqual(['FirstName']);
    });

    it('executes catalog, entity views, and source resolution Remote Operations and maps auth errors to ConnectionRefusedError', async () => {
        const sampleCatalog: ExcelAddinCatalogOutput = {
            Applications: [],
            Entities: [{ ID: 'e1', Name: 'People', DisplayName: 'People', Description: '' }],
            QueryCategories: [],
            Queries: [],
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: { ExecuteRemoteOperation: { success: true, outputJSON: JSON.stringify(sampleCatalog) } },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        ExecuteRemoteOperation: {
                            success: true,
                            outputJSON: JSON.stringify({ EntityID: 'e1', Views: [] }),
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        ExecuteRemoteOperation: {
                            success: true,
                            outputJSON: JSON.stringify({
                                Source: { Kind: 'Entity', ID: 'e1', Name: 'People', EntityName: 'People', Columns: [] },
                            }),
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        ExecuteRemoteOperation: {
                            success: false,
                            resultCode: 'NO_USER',
                            errorMessage: 'API key revoked',
                        },
                    },
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        expect((await FetchCatalog(connection)).Entities).toHaveLength(1);
        expect((await FetchEntityViews(connection, 'e1')).EntityID).toBe('e1');
        expect((await ResolveWorkbookSourceOnServer(connection, { Kind: 'Entity', ID: 'e1' })).EntityName).toBe('People');
        await expect(FetchCatalog(connection)).rejects.toBeInstanceOf(ConnectionRefusedError);
    });
});

describe('picker-logic', () => {
    const catalog: ExcelAddinCatalogOutput = {
        Applications: [{ ID: 'app-crm', Name: 'CRM', Description: '', EntityIDs: ['ent-people'] }],
        Entities: [
            { ID: 'ent-people', Name: 'MJ: People', DisplayName: 'People', Description: 'Contacts and members' },
            { ID: 'ent-invoices', Name: 'Invoices', DisplayName: 'Invoices', Description: 'Billing records' },
        ],
        QueryCategories: [
            { ID: 'cat-root', Name: 'Membership', ParentID: null, Path: 'Membership' },
            { ID: 'cat-child', Name: 'Renewals', ParentID: 'cat-root', Path: 'Membership / Renewals' },
            { ID: 'cat-other', Name: 'Finance', ParentID: null, Path: 'Finance' },
        ],
        Queries: [
            { ID: 'q1', Name: 'Active Users', Description: 'Active accounts', CategoryID: 'cat-child', CategoryPath: 'Membership / Renewals', Parameters: [] },
            { ID: 'q2', Name: 'AR Aging', Description: 'Open receivables', CategoryID: 'cat-other', CategoryPath: 'Finance', Parameters: [] },
        ],
    };

    it('filters entities by application and search query', () => {
        expect(FilterCatalogEntities(catalog, 'app-crm', '').map(e => e.ID)).toEqual(['ent-people']);
        expect(FilterCatalogEntities(catalog, '', 'billing').map(e => e.ID)).toEqual(['ent-invoices']);
    });

    it('filters queries including descendant sub-categories and search text', () => {
        expect(FilterCatalogQueries(catalog, 'cat-root', '').map(q => q.ID)).toEqual(['q1']);
        expect(FilterCatalogQueries(catalog, '', 'receivables').map(q => q.ID)).toEqual(['q2']);
    });

    it('parses and validates typed query parameters', () => {
        const params = [
            { Name: 'Year', Type: 'number' as const, IsRequired: true, DefaultValue: null, Description: '', SampleValue: '' },
            { Name: 'Active', Type: 'boolean' as const, IsRequired: false, DefaultValue: null, Description: '', SampleValue: '' },
            { Name: 'Regions', Type: 'array' as const, IsRequired: false, DefaultValue: null, Description: '', SampleValue: '' },
        ];
        expect(ParseQueryFormParameters(params, { Year: '2026', Active: 'true', Regions: 'East, West' })).toEqual({
            Year: 2026,
            Active: true,
            Regions: ['East', 'West'],
        });
        expect(() => ParseQueryFormParameters(params, { Year: '', Active: '', Regions: '' })).toThrow(/required parameter "Year"/);
        expect(() => ParseQueryFormParameters(params, { Year: 'abc', Active: '', Regions: '' })).toThrow(/valid number/);
        expect(DescribeSourceKind('Entity')).toBe('Entity');
        expect(DescribeSourceKind('View')).toBe('Saved view');
        expect(DescribeSourceKind('Query')).toBe('Saved query');
    });
});
