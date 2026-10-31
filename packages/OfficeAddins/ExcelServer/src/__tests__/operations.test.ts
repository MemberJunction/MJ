import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { IMetadataProvider, QueryInfo, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import {
    ExcelAddinBuildWorkbookServerOperation,
    ExcelAddinCreateConnectionServerOperation,
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
const user = { ID: 'user-1', Name: 'Ada', Email: 'ada@example.org' } as UserInfo;
const provider = {
    Queries: [{
        ID: QUERY_ID,
        Name: 'Renewals: 2026',
        UserCanRun: () => true,
        Fields: [{ Name: 'Month', Sequence: 1, SQLBaseType: 'date' }],
        Parameters: [],
    } as unknown as QueryInfo],
} as unknown as IMetadataProvider;
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
