/**
 * #4221: "Add from view" on the list detail page wrote each view row's `ID` column as
 * `ListDetail.RecordID`. It now reads every primary key field and writes the compact
 * CompositeKey segment (the bare value for a single-column key).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, RunView } from '@memberjunction/core';
import { SingleListDetailComponent } from './single-list-detail.component';

const ORDER_LINES_ID = 'E0000000-0000-0000-0000-0000000000C1';
const TICKETS_ID = 'E0000000-0000-0000-0000-0000000000C2';
const ORDER_ID = '33333333-3333-3333-3333-333333333333';

function orderLinesEntity(): EntityInfo {
    return new EntityInfo({
        ID: ORDER_LINES_ID, Name: 'Order Lines', SchemaName: 'dbo', BaseTable: 'OrderLine', BaseView: 'vwOrderLines',
        Fields: [
            { ID: 'ol-order', EntityID: ORDER_LINES_ID, Sequence: 1, Name: 'OrderID', Type: 'uniqueidentifier', IsPrimaryKey: true, NeedsQuotes: true },
            { ID: 'ol-line', EntityID: ORDER_LINES_ID, Sequence: 2, Name: 'LineNumber', Type: 'int', IsPrimaryKey: true, NeedsQuotes: false },
        ],
    });
}

function ticketsEntity(): EntityInfo {
    return new EntityInfo({
        ID: TICKETS_ID, Name: 'Tickets', SchemaName: 'dbo', BaseTable: 'Ticket', BaseView: 'vwTickets',
        Fields: [
            { ID: 'tk-number', EntityID: TICKETS_ID, Sequence: 1, Name: 'TicketNumber', Type: 'int', IsPrimaryKey: true, NeedsQuotes: false },
        ],
    });
}

interface SavedDetail { ListID: string; RecordID: string; TransactionGroup: unknown; LatestResult: null; Save: () => Promise<boolean> }

function buildComponent(entity: EntityInfo, viewRows: Array<Record<string, unknown>>, existingRecordIds: string[]) {
    const saved: SavedDetail[] = [];
    const runViewsCalls: Array<Array<{ Fields?: string[] }>> = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunViews: vi.fn(async (params: Array<{ Fields?: string[] }>) => {
            runViewsCalls.push(params);
            return params.map(() => ({ Success: true, Results: viewRows }));
        }),
    } as unknown as RunView);

    const provider = {
        CurrentUser: { ID: 'user-1' },
        EntityByID: (id: string) => (id === entity.ID ? entity : undefined),
        CreateTransactionGroup: async () => ({ Submit: async () => true }),
        GetEntityObject: async () => {
            const detail: SavedDetail = { ListID: '', RecordID: '', TransactionGroup: null, LatestResult: null, Save: async () => { saved.push(detail); return true; } };
            return detail;
        },
    };

    const component = Object.create(SingleListDetailComponent.prototype) as SingleListDetailComponent;
    Object.defineProperty(component, 'ProviderToUse', { get: () => provider });
    Object.assign(component, {
        ListRecord: { ID: 'list-1', EntityID: entity.ID },
        UserViewsToAdd: [{ ID: 'view-1' }],
        ExistingListDetailIds: new Set<string>(),
        StatsRefreshTrigger: 0,
        cdr: { detectChanges: vi.fn() },
        sharedService: { CreateSimpleNotification: vi.fn() },
        CloseAddFromViewDialog: vi.fn(),
        RefreshGrid: vi.fn(),
        loadExistingListDetailIds: vi.fn(async function (this: { ExistingListDetailIds: Set<string> }) {
            this.ExistingListDetailIds = new Set(existingRecordIds);
        }),
    });
    return { component, saved, runViewsCalls };
}

describe('SingleListDetailComponent.ConfirmAddFromView (#4221)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads every primary key field and writes the compact segment for a composite key', async () => {
        const { component, saved, runViewsCalls } = buildComponent(orderLinesEntity(), [
            { OrderID: ORDER_ID, LineNumber: 1 },
            { OrderID: ORDER_ID, LineNumber: 2 },
        ], []);

        await component.ConfirmAddFromView();

        expect(runViewsCalls[0][0].Fields).toEqual(['OrderID', 'LineNumber']);
        expect(saved.map(d => d.RecordID)).toEqual([
            `OrderID|${ORDER_ID}||LineNumber|1`,
            `OrderID|${ORDER_ID}||LineNumber|2`,
        ]);
    });

    it('writes the bare key value for an entity keyed on a column other than ID, skipping ones already listed', async () => {
        const { component, saved, runViewsCalls } = buildComponent(ticketsEntity(), [{ TicketNumber: 42 }, { TicketNumber: 7 }], ['7']);

        await component.ConfirmAddFromView();

        expect(runViewsCalls[0][0].Fields).toEqual(['TicketNumber']);
        expect(saved.map(d => d.RecordID)).toEqual(['42']);
    });
});
