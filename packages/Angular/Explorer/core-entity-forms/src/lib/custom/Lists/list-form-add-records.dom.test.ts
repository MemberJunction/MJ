/**
 * List form adds records to the list with server calls: one call for the picked records, and one
 * call per selected view. It creates no List Detail objects in the browser.
 */
import { describe, it, expect, vi } from 'vitest';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJListFormComponentExtended } from './list-form.component';

function applyResult(added: number) {
    return { Success: true, ResultCode: 'SUCCESS', Message: '', AddedCount: added, RemovedCount: 0, FailedCount: 0 };
}

function makeForm(state: Record<string, unknown>) {
    const executeGQL = vi.fn(async (_query: string, _variables: unknown) => ({ AddRecordsToList: applyResult(2), AddViewResultsToList: applyResult(3) }));
    const getEntityObject = vi.fn(async () => ({ Save: async () => true }));
    const createTransactionGroup = vi.fn(async () => ({ Submit: async () => true }));
    const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
    Object.assign(provider, {
        ExecuteGQL: executeGQL,
        GetEntityObject: getEntityObject,
        CreateTransactionGroup: createTransactionGroup,
    });
    Object.defineProperty(provider, 'CurrentUser', { get: () => ({ ID: 'user-1' }) });
    const form = Object.create(MJListFormComponentExtended.prototype) as MJListFormComponentExtended;
    const notify = vi.fn();
    Object.assign(form, {
        cdr: { detectChanges: vi.fn() },
        showNotification: notify,
        RefreshItems: vi.fn(async () => undefined),
        ExistingListDetailIds: new Set<string>(),
        userViewsToAddIds: new Set<string>(),
        ...state,
    });
    Object.defineProperty(form, 'record', { value: { ID: 'list-1', EntityID: 'entity-1' } });
    Object.defineProperty(form, 'metadata', { value: provider });
    Object.defineProperty(form, 'ProviderToUse', { get: () => provider });
    return { form, executeGQL, getEntityObject, createTransactionGroup, notify };
}

describe('MJListFormComponentExtended add records', () => {
    it('ConfirmAddRecords adds the picked records in one server call', async () => {
        const { form, executeGQL, getEntityObject, createTransactionGroup, notify } = makeForm({
            AddableRecords: [
                { ID: 'r1', Name: 'One', isInList: false, isSelected: true },
                { ID: 'r2', Name: 'Two', isInList: false, isSelected: true },
                { ID: 'r3', Name: 'Three', isInList: false, isSelected: false },
            ],
        });

        await form.ConfirmAddRecords();

        expect(executeGQL).toHaveBeenCalledTimes(1);
        expect(executeGQL.mock.calls[0][1]).toEqual({ listId: 'list-1', recordIds: ['r1', 'r2'] });
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(createTransactionGroup).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Added 2 records to list', 'success', 2500);
    });

    it('ConfirmAddFromView adds each selected view on the server, one call per view', async () => {
        const { form, executeGQL, getEntityObject, createTransactionGroup, notify } = makeForm({
            UserViewsToAdd: [{ ID: 'view-1' }, { ID: 'view-2' }],
        });

        await form.ConfirmAddFromView();

        expect(executeGQL).toHaveBeenCalledTimes(2);
        expect(executeGQL.mock.calls.map(c => c[1])).toEqual([
            { viewId: 'view-1', listId: 'list-1' },
            { viewId: 'view-2', listId: 'list-1' },
        ]);
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(createTransactionGroup).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Added 6 records to list', 'success', 2500);
    });
});
