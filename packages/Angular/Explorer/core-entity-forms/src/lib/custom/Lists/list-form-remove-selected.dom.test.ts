/**
 * Pins which records List form's "Remove selected" removes: the RecordID of each selected item,
 * selected IDs matched in any case, and an ID that is no longer loaded skipped. The removal is
 * one server call and deletes no List Detail objects in the browser.
 */
import { describe, it, expect, vi } from 'vitest';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJListFormComponentExtended } from './list-form.component';

const KEEP = 'aaaaaaaa-0000-0000-0000-000000000001';
const DROP_1 = 'bbbbbbbb-0000-0000-0000-000000000002';
const DROP_2 = 'cccccccc-0000-0000-0000-000000000003';

describe('MJListFormComponentExtended.RemoveSelectedItems', () => {
    it('removes the RecordIDs of the selected items in one server call, matching IDs in any case and skipping unloaded ones', async () => {
        const deleteSpy = vi.fn(async () => true);
        const item = (ID: string) => ({ detail: { ID, RecordID: `rec-${ID.toLowerCase()}`, Delete: deleteSpy } });
        const executeGQL = vi.fn(async (_query: string, _variables: unknown) => ({
            RemoveRecordsFromList: { Success: true, ResultCode: 'SUCCESS', Message: '', AddedCount: 0, RemovedCount: 2, FailedCount: 0 },
        }));
        const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
        Object.assign(provider, { ExecuteGQL: executeGQL, CreateTransactionGroup: vi.fn() });
        const form = Object.create(MJListFormComponentExtended.prototype) as MJListFormComponentExtended;
        Object.assign(form, {
            confirmService: { ConfirmDelete: async () => true },
            ListItems: [item(KEEP), item(DROP_1.toUpperCase()), item(DROP_2)],
            SelectedItems: new Set([DROP_2.toUpperCase(), 'dddddddd-0000-0000-0000-000000000004', DROP_1]),
            ItemsPage: 0,
            showNotification: vi.fn(),
            loadStats: vi.fn(async () => undefined),
            loadItems: vi.fn(async () => undefined),
            updateNavBadges: vi.fn(),
        });
        Object.defineProperty(form, 'record', { value: { ID: 'list-1' } });
        Object.defineProperty(form, 'TotalPages', { get: () => 1 });
        Object.defineProperty(form, 'metadata', { value: provider });

        await form.RemoveSelectedItems();

        expect(executeGQL).toHaveBeenCalledTimes(1);
        expect(executeGQL.mock.calls[0][1]).toEqual({ listId: 'list-1', recordIds: [`rec-${DROP_2}`, `rec-${DROP_1}`] });
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(form.SelectedItems.size).toBe(0);
    });
});
