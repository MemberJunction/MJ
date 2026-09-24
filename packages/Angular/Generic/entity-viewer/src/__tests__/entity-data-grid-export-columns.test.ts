import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ColDef } from 'ag-grid-community';

const commMetadata = vi.hoisted(() => ({
    EntityCommunicationMessageTypes: [] as { EntityID: string; IsActive: boolean }[],
}));

vi.mock('@memberjunction/communication-types', () => ({
    CommunicationEngineBase: {
        Instance: {
            Config: async () => {},
            get Metadata() {
                return commMetadata;
            },
        },
    },
}));

import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';
import { GridColumnConfig } from '../lib/entity-data-grid/models/grid-types';

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
function withRenderedColumns(grid: EntityDataGridComponent, columns: { def: ColDef; width: number }[]): void {
    (grid as unknown as { gridApi: unknown }).gridApi = {
        getAllDisplayedColumns: () => columns.map(c => ({ getColDef: () => c.def, getActualWidth: () => c.width })),
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
            { def: { field: 'TotalAmount', headerName: 'Total' }, width: 120 },
            { def: { field: 'OrderNumber', headerName: 'Order #' }, width: 90 },
        ]);

        const columns = grid.GetExportColumns();

        expect(columns).toEqual([
            { name: 'TotalAmount', displayName: 'Total', dataType: 'number', width: 120 },
            { name: 'OrderNumber', displayName: 'Order #', dataType: 'string', width: 90 },
        ]);
    });

    it('leaves out the row-number and width-filler columns', () => {
        const grid = makeGrid(makeOrdersEntity());
        grid.Columns = HOST_COLUMNS;
        withRenderedColumns(grid, [
            { def: { field: '__rowNumber', headerName: '#' }, width: 60 },
            { def: { field: 'OrderNumber', headerName: 'Order #' }, width: 90 },
            { def: { colId: '__mjFill', headerName: '' }, width: 300 },
        ]);

        expect(grid.GetExportColumns().map(c => c.name)).toEqual(['OrderNumber']);
    });

    it('keys each column by the entity\'s field spelling', () => {
        const grid = makeGrid(makeOrdersEntity());
        withRenderedColumns(grid, [{ def: { field: 'ordernumber', headerName: 'Order #' }, width: 90 }]);

        expect(grid.GetExportColumns()[0].name).toBe('OrderNumber');
    });
});

describe('EntityDataGridComponent — Send Message is offered only when the entity supports communication', () => {
    beforeEach(() => {
        commMetadata.EntityCommunicationMessageTypes = [];
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
