/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import type { DataSnapshot, DataTable, IMetadataProvider, IRunQueryProvider, RunQueryResult } from '@memberjunction/core';
import { QueryEngine, type MJQueryParameterEntity } from '@memberjunction/core-entities';
import { ExcelAddinClient } from '@memberjunction/excel-addin';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { QueryDataGridComponent } from '@memberjunction/ng-query-viewer';
import type { PdfOrientation } from '@memberjunction/ng-react';
import { BaseArtifactViewerPluginComponent } from '../lib/components/base-artifact-viewer.component';
import { DataArtifactViewerComponent } from '../lib/components/plugins/data-artifact-viewer.component';
import { CreateLiveSheetHelperForProvider, type LiveSheetClientToolHelper } from '../lib/services/live-sheet-client-tool.helper';

vi.mock('../lib/services/live-sheet-client-tool.helper', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/services/live-sheet-client-tool.helper')>();
    return { ...actual, CreateLiveSheetHelperForProvider: vi.fn() };
});

type ExportResult = Awaited<ReturnType<QueryDataGridComponent['Export']>>;

function stubObj<T extends object>(fields: Partial<T>): T {
    return Object.assign(Object.create(null) as T, fields);
}

/** jsdom's Blob has no text(), so read it with a FileReader. */
function readBlobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

class PdfCapableViewer extends BaseArtifactViewerPluginComponent {
    public Orientations: PdfOrientation[] = [];
    public override get SupportsPDFExport(): boolean {
        return true;
    }
    public override async ExportPDF(orientation: PdfOrientation = 'portrait'): Promise<void> {
        this.Orientations.push(orientation);
    }
    public GetCurrentStateSnapshot(): DataSnapshot | null {
        return null;
    }
}

class PlainViewer extends BaseArtifactViewerPluginComponent {
    public GetCurrentStateSnapshot(): DataSnapshot | null {
        return null;
    }
}

describe('BaseArtifactViewerPluginComponent export options', () => {
    it('offers portrait and landscape PDF when the viewer supports PDF export', async () => {
        const viewer = new PdfCapableViewer();
        expect(viewer.GetExportOptions().map((o) => o.Key)).toEqual(['pdf-portrait', 'pdf-landscape']);
        await viewer.RunExport('pdf-landscape');
        expect(viewer.Orientations).toEqual(['landscape']);
    });

    it('offers nothing when the viewer has no export', () => {
        expect(new PlainViewer().GetExportOptions()).toEqual([]);
    });

    it('rejects an unknown export key', async () => {
        await expect(new PlainViewer().RunExport('docx')).rejects.toThrow('docx');
    });
});

describe('DataArtifactViewerComponent export options', () => {
    const SQL = 'SELECT Region, SUM(Total) AS Total FROM Sales GROUP BY Region';
    const ROWS = [{ Region: 'East', Total: 10 }, { Region: 'West', Total: 20 }];

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function makeViewer(tables: DataTable[], title = 'Sales by Region'): DataArtifactViewerComponent {
        const viewer = new DataArtifactViewerComponent(stubObj<ChangeDetectorRef>({ detectChanges: vi.fn() }));
        viewer.spec = { title, metadata: { sql: tables[0]?.metadata?.sql } };
        viewer.ResolvedTables = tables;
        viewer.GridData = ROWS;
        return viewer;
    }

    function liveTable(name = 'Sales by Region', sql = SQL): DataTable {
        return { name, columns: [], rows: [], metadata: { sql } } as DataTable;
    }

    function gridStub(result: Partial<ExportResult>): QueryDataGridComponent {
        return stubObj<QueryDataGridComponent>({
            Export: vi.fn(async () => ({ success: true, fileName: 'x', mimeType: 'text/csv', sizeBytes: 1, ...result }) as ExportResult),
        });
    }

    it('offers Excel, CSV and JSON of the results, and the SQL, for a live query', () => {
        const options = makeViewer([liveTable()]).GetExportOptions().filter((o) => o.Group !== 'Save as');
        expect(options.map((o) => o.Key)).toEqual(['excel', 'csv', 'json', 'sql']);
        expect(options.map((o) => o.Group)).toEqual(['Results', 'Results', 'Results', 'Query']);
    });

    it('names the active table in the results group when the artifact has several tables', () => {
        const viewer = makeViewer([liveTable('Orders'), liveTable('Customers', 'SELECT * FROM Customers')]);
        viewer.ActiveTableIndex = 1;
        expect(viewer.GetExportOptions()[0].Group).toBe('Results · Customers');
    });

    it('offers saving the records as a list when the results can become one', () => {
        const viewer = makeViewer([liveTable()]);
        vi.spyOn(viewer, 'CanSaveAsList', 'get').mockReturnValue(true);
        const list = viewer.GetExportOptions().find((o) => o.Key === 'list');
        expect(list).toMatchObject({ Label: 'List', Group: 'Save as' });
    });

    it('offers no list when the results cannot become one', () => {
        const viewer = makeViewer([liveTable()]);
        vi.spyOn(viewer, 'CanSaveAsList', 'get').mockReturnValue(false);
        expect(viewer.GetExportOptions().map((o) => o.Key)).not.toContain('list');
    });

    it('opens the Save as List dialog for the list option', async () => {
        const viewer = makeViewer([liveTable()]);
        vi.spyOn(viewer, 'CanSaveAsList', 'get').mockReturnValue(true);
        await viewer.RunExport('list');
        expect(viewer.ShowSaveAsList).toBe(true);
    });

    it('offers nothing for a plan-only artifact', () => {
        const viewer = makeViewer([]);
        viewer.GridData = [];
        expect(viewer.GetExportOptions()).toEqual([]);
    });

    it('exports through the results grid in the chosen format, named after the artifact', async () => {
        const viewer = makeViewer([liveTable()]);
        const grid = gridStub({});
        viewer.ResultsGrid = grid;
        await viewer.RunExport('csv');
        expect(grid.Export).toHaveBeenCalledWith({ format: 'csv', fileName: 'Sales by Region' }, true);
    });

    it('throws when the grid export fails', async () => {
        const viewer = makeViewer([liveTable()]);
        viewer.ResultsGrid = gridStub({ success: false, error: 'workbook too large' });
        await expect(viewer.RunExport('excel')).rejects.toThrow('workbook too large');
    });

    it('fetches every row of the active live query for export, not just the shown page', async () => {
        const viewer = makeViewer([liveTable()]);
        const runQuery = vi.fn(async () => ({ Success: true, Results: ROWS, RowCount: 2, TotalRowCount: 2 }) as RunQueryResult);
        viewer.Provider = stubObj<IMetadataProvider & IRunQueryProvider>({ RunQuery: runQuery });
        const rows = await viewer.ExportAllRows();
        expect(runQuery).toHaveBeenCalledWith({ SQL, StartRow: 0, MaxRows: 100000 });
        expect(rows).toEqual(ROWS);
    });

    it('downloads the SQL as a .sql file', async () => {
        const blobs: Blob[] = [];
        URL.createObjectURL = vi.fn((blob: Blob) => {
            blobs.push(blob);
            return 'blob:sql';
        });
        URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.download).toBe('Sales by Region.sql');
        });
        await makeViewer([liveTable()]).RunExport('sql');
        expect(click).toHaveBeenCalledTimes(1);
        expect(await readBlobText(blobs[0])).toBe(SQL);
    });

    describe('saved query, Excel (live) and Live Sheet', () => {
        const PROVIDER = stubObj<IMetadataProvider & IRunQueryProvider>({});
        const notify = vi.fn();

        function viewerIn(state: DataArtifactViewerComponent['QuerySyncState'], excelAddin = true): DataArtifactViewerComponent {
            const viewer = makeViewer([liveTable()]);
            viewer.Provider = PROVIDER;
            viewer.QuerySyncState = state;
            viewer.ExcelAddinEnabled = excelAddin;
            if (state !== 'no-query-latest' && state !== 'no-query-older') {
                viewer.spec = { ...viewer.spec, savedQueryId: 'q-1', savedQueryName: 'Sales by Region', parameters: { Region: 'East' } };
            }
            vi.spyOn(viewer, 'CanSaveAsList', 'get').mockReturnValue(true);
            vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(QueryEngine.Instance);
            vi.spyOn(QueryEngine.Instance, 'GetQueryParameters').mockReturnValue([]);
            vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(stubObj<MJNotificationService>({ CreateSimpleNotification: notify }));
            return viewer;
        }

        function option(viewer: DataArtifactViewerComponent, key: string) {
            return viewer.GetExportOptions().find((o) => o.Key === key);
        }

        function requiredParameter(name: string): MJQueryParameterEntity {
            return stubObj<MJQueryParameterEntity>({ Name: name, IsRequired: true, IsServerSet: false, Type: 'string' });
        }

        it('lists every target of a saved query in menu order', () => {
            expect(viewerIn('synced').GetExportOptions().map((o) => o.Key)).toEqual(['excel', 'csv', 'json', 'excel-live', 'sql', 'list', 'live-sheet']);
        });

        it('lists every target of an unsaved query in menu order', () => {
            expect(viewerIn('no-query-latest').GetExportOptions().map((o) => o.Key)).toEqual(['excel', 'csv', 'json', 'excel-live', 'sql', 'saved-query', 'list', 'live-sheet']);
        });

        it('offers saving the query when it has not been saved, through the save panel', async () => {
            const viewer = viewerIn('no-query-latest');
            expect(option(viewer, 'saved-query')).toMatchObject({ Label: 'Saved Query', Group: 'Save as' });
            await viewer.RunExport('saved-query');
            expect(viewer.ShowSaveDialog).toBe(true);
        });

        it('offers updating the saved query or saving a new one when this version changed the SQL', async () => {
            const viewer = viewerIn('outdated-latest');
            expect(option(viewer, 'saved-query-update')).toMatchObject({ Label: 'Update “Sales by Region”', Group: 'Save as' });
            expect(option(viewer, 'saved-query-new')).toMatchObject({ Label: 'New saved query', Group: 'Save as' });
            const update = vi.spyOn(viewer, 'OnUpdateExistingQuery').mockResolvedValue(undefined);
            await viewer.RunExport('saved-query-update');
            expect(update).toHaveBeenCalledTimes(1);
            await viewer.RunExport('saved-query-new');
            expect(viewer.ShowSaveDialog).toBe(true);
        });

        it('offers no saved-query or live targets when the artifact has no SQL', () => {
            const viewer = viewerIn('no-query-latest');
            viewer.spec = { title: 'Sales by Region' };
            vi.spyOn(viewer, 'CanSaveAsList', 'get').mockReturnValue(false);
            expect(viewer.GetExportOptions().map((o) => o.Key)).toEqual(['excel', 'csv', 'json']);
        });

        it('opens the saved query in Excel with the artifact parameter values', async () => {
            const viewer = viewerIn('synced');
            vi.spyOn(QueryEngine.Instance, 'GetQueryParameters').mockReturnValue([requiredParameter('Region')]);
            const open = vi.spyOn(ExcelAddinClient.Instance, 'OpenInExcel').mockResolvedValue({ Success: true, FileName: 'Sales by Region.xlsx' });
            expect(option(viewer, 'excel-live')).toMatchObject({ Group: 'Results' });
            expect(option(viewer, 'excel-live')?.DisabledReason).toBeUndefined();
            await viewer.RunExport('excel-live');
            expect(open).toHaveBeenCalledWith([{ Kind: 'Query', ID: 'q-1', Parameters: { Region: 'East' } }], PROVIDER);
            expect(notify).toHaveBeenCalledWith(expect.stringContaining('Sales by Region.xlsx'), 'success', expect.any(Number));
        });

        it('throws when Excel cannot build the workbook', async () => {
            const viewer = viewerIn('synced');
            vi.spyOn(ExcelAddinClient.Instance, 'OpenInExcel').mockResolvedValue({ Success: false, ErrorMessage: 'add-in is off' });
            await expect(viewer.RunExport('excel-live')).rejects.toThrow('add-in is off');
        });

        it('greys out Excel (live) and Live Sheet until the query is saved', () => {
            const viewer = viewerIn('no-query-latest');
            expect(option(viewer, 'excel-live')?.DisabledReason).toBe('Save the query first');
            expect(option(viewer, 'live-sheet')?.DisabledReason).toBe('Save the query first');
        });

        it('greys out Excel (live) and Live Sheet while the saved query is behind this version', () => {
            const viewer = viewerIn('outdated-latest');
            expect(option(viewer, 'excel-live')?.DisabledReason).toBe('Update the saved query first');
            expect(option(viewer, 'live-sheet')?.DisabledReason).toBe('Update the saved query first');
        });

        it('greys out Excel (live) when a required parameter has no value', () => {
            const viewer = viewerIn('synced');
            vi.spyOn(QueryEngine.Instance, 'GetQueryParameters').mockReturnValue([requiredParameter('Year')]);
            expect(option(viewer, 'excel-live')?.DisabledReason).toBe('A required parameter has no value');
        });

        it('creates a live sheet from the saved query and asks the host to open it', async () => {
            const viewer = viewerIn('synced');
            const create = vi.fn(async () => ({ Success: true, ArtifactID: 'art-9', ArtifactName: 'Sales by Region — Live Sheet' }));
            vi.mocked(CreateLiveSheetHelperForProvider).mockReturnValue(stubObj<LiveSheetClientToolHelper>({ CreateLiveSheetFromQuery: create }));
            const navigate = vi.spyOn(viewer.navigationRequest, 'emit');
            expect(option(viewer, 'live-sheet')).toMatchObject({ Label: 'Live Sheet', Group: 'Save as' });
            await viewer.RunExport('live-sheet');
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ QueryID: 'q-1', QueryName: 'Sales by Region', Parameters: { Region: 'East' } }));
            expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ ArtifactID: 'art-9', ArtifactName: 'Sales by Region — Live Sheet' }));
        });

        it('throws when the live sheet cannot be created', async () => {
            const viewer = viewerIn('synced');
            vi.mocked(CreateLiveSheetHelperForProvider).mockReturnValue(
                stubObj<LiveSheetClientToolHelper>({ CreateLiveSheetFromQuery: vi.fn(async () => ({ Success: false, ErrorMessage: 'sheet refused' })) }),
            );
            await expect(viewer.RunExport('live-sheet')).rejects.toThrow('sheet refused');
        });
    });
});
