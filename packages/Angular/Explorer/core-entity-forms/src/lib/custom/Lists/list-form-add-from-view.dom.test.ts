/**
 * #4221: "Add from view" on the List form wrote each view row's `ID` column as
 * `ListDetail.RecordID`. An entity keyed on another column, or on several, got an empty or wrong
 * RecordID, and the record never showed in the list. It now reads every primary key field and
 * writes the compact CompositeKey segment, as the rest of the List form does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, RunView } from '@memberjunction/core';
import { MJListFormComponentExtended } from './list-form.component';

const ORDER_LINES_ID = 'E0000000-0000-0000-0000-0000000000B1';
const TICKETS_ID = 'E0000000-0000-0000-0000-0000000000B2';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';

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

interface SavedDetail { ListID: string; RecordID: string; TransactionGroup: unknown; Save: () => Promise<boolean> }

function buildForm(entity: EntityInfo, viewRows: Array<Record<string, unknown>>, existingRecordIds: string[]) {
    const saved: SavedDetail[] = [];
    const runViewCalls: Array<{ Fields?: string[] }> = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: { Fields?: string[] }) => {
            runViewCalls.push(params);
            return { Success: true, Results: viewRows };
        }),
    } as unknown as RunView);

    const provider = {
        CurrentUser: { ID: 'user-1' },
        EntityByID: (id: string) => (id === entity.ID ? entity : undefined),
        CreateTransactionGroup: async () => ({ Submit: async () => true }),
        GetEntityObject: async () => {
            const detail: SavedDetail = { ListID: '', RecordID: '', TransactionGroup: null, Save: async () => { saved.push(detail); return true; } };
            return detail;
        },
    };

    const form = Object.create(MJListFormComponentExtended.prototype) as MJListFormComponentExtended;
    Object.defineProperty(form, 'ProviderToUse', { get: () => provider });
    Object.assign(form, {
        record: { ID: 'list-1', EntityID: entity.ID },
        UserViewsToAdd: [{ ID: 'view-1' }],
        ExistingListDetailIds: new Set<string>(),
        cdr: { detectChanges: vi.fn() },
        showNotification: vi.fn(),
        CloseAddFromViewDialog: vi.fn(),
        RefreshItems: vi.fn(async () => undefined),
        loadExistingListDetailIds: vi.fn(async function (this: { ExistingListDetailIds: Set<string> }) {
            this.ExistingListDetailIds = new Set(existingRecordIds);
        }),
    });
    return { form, saved, runViewCalls };
}

describe('MJListFormComponentExtended.ConfirmAddFromView (#4221)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads every primary key field and writes the compact segment for a composite key', async () => {
        const { form, saved, runViewCalls } = buildForm(orderLinesEntity(), [
            { OrderID: ORDER_ID, LineNumber: 1 },
            { OrderID: ORDER_ID, LineNumber: 2 },
        ], []);

        await form.ConfirmAddFromView();

        expect(runViewCalls[0].Fields).toEqual(['OrderID', 'LineNumber']);
        expect(saved.map(d => d.RecordID)).toEqual([
            `OrderID|${ORDER_ID}||LineNumber|1`,
            `OrderID|${ORDER_ID}||LineNumber|2`,
        ]);
        expect(saved.every(d => d.ListID === 'list-1')).toBe(true);
    });

    it('writes the bare key value for an entity keyed on a column other than ID', async () => {
        const { form, saved, runViewCalls } = buildForm(ticketsEntity(), [{ TicketNumber: 42 }, { TicketNumber: 7 }], []);

        await form.ConfirmAddFromView();

        expect(runViewCalls[0].Fields).toEqual(['TicketNumber']);
        expect(saved.map(d => d.RecordID)).toEqual(['42', '7']);
    });

    it('skips records already in the list', async () => {
        const { form, saved } = buildForm(ticketsEntity(), [{ TicketNumber: 42 }, { TicketNumber: 7 }], ['42']);

        await form.ConfirmAddFromView();

        expect(saved.map(d => d.RecordID)).toEqual(['7']);
    });
});
