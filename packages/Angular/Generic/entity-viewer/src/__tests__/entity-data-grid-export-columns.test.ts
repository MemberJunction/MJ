import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ColDef } from 'ag-grid-community';

const commMetadata = vi.hoisted(() => ({
    EntityCommunicationMessageTypes: [] as { EntityID: string; IsActive: boolean }[],
}));

const commEngine = vi.hoisted(() => ({
    providers: [] as unknown[],
}));

vi.mock('@memberjunction/communication-types', () => {
    const engine = {
        Config: async () => {},
        get Metadata() {
            return commMetadata;
        },
    };
    return {
        CommunicationEngineBase: {
            // The grid must use the engine for ITS provider, never the global singleton.
            get Instance(): never {
                throw new Error('CommunicationEngineBase.Instance must not be used; use GetProviderInstance');
            },
            GetProviderInstance: (provider: unknown) => {
                commEngine.providers.push(provider);
                return engine;
            },
        },
    };
});

import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import { GridColumnConfig } from '../lib/entity-data-grid/models/grid-types';
import { ViewWorkspaceComponent } from '../lib/view-workspace/view-workspace.component';
import type { ViewGridState } from '../lib/types';

/**
 * Export must produce the columns the grid shows: same set, same order, same headers.
 *
 * The grid used to build its export columns from the host-declared `Columns` list, while it RENDERS
 * from the saved grid state when one exists (and from AG Grid's live column order once the user drags
 * a column). Whenever those differed, the spreadsheet carried different columns in a different order
 * from the screen. `GetExportColumns` now reads the rendered columns.
 */

const ENTITY_ID = 'E0000005-0000-0000-0000-000000000001';

function makeOrdersEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'MJ: Test Orders',
        Status: 'Active',
        BaseTable: 'TestOrder',
        BaseView: 'vwTestOrders',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultInView: false },
            { ID: 'F2', Name: 'OrderNumber', DisplayName: 'Order Number', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultInView: true },
            { ID: 'F3', Name: 'OrderDate', DisplayName: 'Order Date', Type: 'date', AllowsNull: false, DefaultInView: true },
            { ID: 'F4', Name: 'Customer', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true },
            { ID: 'F5', Name: 'TotalAmount', DisplayName: 'Total Amount', Type: 'decimal', AllowsNull: false, DefaultInView: true },
            { ID: 'F6', Name: 'Status', Type: 'nvarchar', Length: 20, AllowsNull: false, DefaultInView: true },
        ],
    });
}

function makeGrid(entity: EntityInfo): EntityDataGridComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef;
    const exportService = {} as never;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;

    const grid = new EntityDataGridComponent(cdr, elementRef, exportService, ngZone);
    grid.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
    (grid as unknown as { _entityInfo: EntityInfo })._entityInfo = entity;
    return grid;
}

const HOST_COLUMNS: GridColumnConfig[] = [
    { field: 'OrderNumber', title: 'Order #' },
    { field: 'OrderDate', title: 'Date' },
    { field: 'Customer', title: 'Customer' },
    { field: 'TotalAmount', title: 'Total' },
    { field: 'Status', title: 'Status' },
];

/** Stand in for AG Grid's rendered columns, in the given on-screen order. */
function withRenderedColumns(grid: EntityDataGridComponent, defs: ColDef[]): void {
    (grid as unknown as { gridApi: unknown }).gridApi = {
        getAllDisplayedColumns: () => defs.map(def => ({ getColDef: () => def, getActualWidth: () => 150 })),
    };
}

describe('EntityDataGridComponent.GetExportColumns', () => {
    it('follows the saved grid state, not the host-declared columns', () => {
        const grid = makeGrid(makeOrdersEntity());
        grid.Columns = HOST_COLUMNS;
        grid.GridState = {
            columnSettings: [
                { ID: 'F6', Name: 'Status', orderIndex: 0 },
                { ID: 'F2', Name: 'OrderNumber', orderIndex: 1, userDisplayName: 'Ref' },
                { ID: 'F5', Name: 'TotalAmount', orderIndex: 2 },
                { ID: 'F4', Name: 'Customer', orderIndex: 3, hidden: true },
            ],
        };

        const columns = grid.GetExportColumns();

        expect(columns.map(c => c.name)).toEqual(['Status', 'OrderNumber', 'TotalAmount']);
        expect(columns[1].displayName).toBe('Ref');
    });

    it('follows the on-screen order once the grid has rendered (a dragged column moves in the export)', () => {
        const grid = makeGrid(makeOrdersEntity());
        grid.Columns = HOST_COLUMNS;
        withRenderedColumns(grid, [
            { field: 'TotalAmount', headerName: 'Total' },
            { field: 'OrderNumber', headerName: 'Order #' },
        ]);

        const columns = grid.GetExportColumns();

        // No `width`: it is in characters for Excel, and grid widths are pixels. Unset, Excel auto-fits.
        expect(columns).toEqual([
            { name: 'TotalAmount', displayName: 'Total', dataType: 'number' },
            { name: 'OrderNumber', displayName: 'Order #', dataType: 'string' },
        ]);
    });

    it('leaves out the row-number and width-filler columns', () => {
        const grid = makeGrid(makeOrdersEntity());
        grid.Columns = HOST_COLUMNS;
        withRenderedColumns(grid, [
            { field: '__rowNumber', headerName: '#' },
            { field: 'OrderNumber', headerName: 'Order #' },
            { colId: '__mjFill', headerName: '' },
        ]);

        expect(grid.GetExportColumns().map(c => c.name)).toEqual(['OrderNumber']);
    });

    it('keys each column by the entity\'s field spelling', () => {
        const grid = makeGrid(makeOrdersEntity());
        withRenderedColumns(grid, [{ field: 'ordernumber', headerName: 'Order #' }]);

        expect(grid.GetExportColumns()[0].name).toBe('OrderNumber');
    });
});

describe('EntityDataGridComponent — Send Message is offered only when the entity supports communication', () => {
    beforeEach(() => {
        commMetadata.EntityCommunicationMessageTypes = [];
        commEngine.providers = [];
    });

    it('reads the communication engine for the grid\'s own provider', async () => {
        const grid = await gridWithSelection();

        expect(commEngine.providers).toEqual([grid.ProviderToUse]);
    });

    async function gridWithSelection(): Promise<EntityDataGridComponent> {
        const grid = makeGrid(makeOrdersEntity());
        (grid as unknown as { _selectedKeys: string[] })._selectedKeys = ['order-1'];
        await (grid as unknown as { resolveCommunicationSupport(): Promise<void> }).resolveCommunicationSupport();
        return grid;
    }

    it('hides it for an entity with no communication message types', async () => {
        const grid = await gridWithSelection();

        expect(grid.EntitySupportsCommunication).toBe(false);
        expect(grid.showCommunicationInOverflow).toBe(false);
        expect(grid.hasSelectionDependentOverflowActions).toBe(false);
    });

    it('hides it when the entity\'s only message type is inactive', async () => {
        commMetadata.EntityCommunicationMessageTypes = [{ EntityID: ENTITY_ID, IsActive: false }];
        const grid = await gridWithSelection();

        expect(grid.showCommunicationInOverflow).toBe(false);
    });

    it('shows it for an entity with an active message type', async () => {
        commMetadata.EntityCommunicationMessageTypes = [{ EntityID: ENTITY_ID.toLowerCase(), IsActive: true }];
        const grid = await gridWithSelection();

        expect(grid.EntitySupportsCommunication).toBe(true);
        expect(grid.showCommunicationInOverflow).toBe(true);
    });
});

describe('ViewWorkspaceComponent export columns when no renderer supplies them (Cards, Map, Timeline)', () => {
    function makeWorkspace(entity: EntityInfo, gridState: ViewGridState | null, denied: string[] = []): ViewWorkspaceComponent {
        const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
        const workspace = new ViewWorkspaceComponent(cdr);
        workspace.Provider = { CurrentUser: {} } as unknown as IMetadataProvider;
        vi.spyOn(entity, 'GetDeniedReadFields').mockReturnValue(new Set(denied));
        (workspace as unknown as { _entity: EntityInfo })._entity = entity;
        workspace.currentGridState = gridState;
        return workspace;
    }

    function exportColumns(workspace: ViewWorkspaceComponent): { name: string; displayName?: string }[] {
        return (workspace as unknown as { buildExportColumns(): { name: string; displayName?: string }[] }).buildExportColumns();
    }

    it('drops saved settings whose field no longer exists, as the grid does', () => {
        const workspace = makeWorkspace(makeOrdersEntity(), {
            columnSettings: [
                { ID: 'F2', Name: 'ordernumber', orderIndex: 1 },
                { ID: 'X1', Name: 'RemovedField', orderIndex: 0 },
                { ID: 'F6', Name: 'Status', orderIndex: 2, userDisplayName: 'State' },
            ],
        });

        expect(exportColumns(workspace)).toEqual([
            { name: 'OrderNumber', displayName: 'Order Number' },
            { name: 'Status', displayName: 'State' },
        ]);
    });

    it('leaves out fields the user is denied read access to', () => {
        const workspace = makeWorkspace(makeOrdersEntity(), {
            columnSettings: [
                { ID: 'F2', Name: 'OrderNumber', orderIndex: 0 },
                { ID: 'F5', Name: 'TotalAmount', orderIndex: 1 },
            ],
        }, ['totalamount']);

        expect(exportColumns(workspace).map(c => c.name)).toEqual(['OrderNumber']);
    });

    it('applies field security to the entity-field fallback too', () => {
        const workspace = makeWorkspace(makeOrdersEntity(), null, ['customer']);

        expect(exportColumns(workspace).map(c => c.name)).not.toContain('Customer');
    });
});
