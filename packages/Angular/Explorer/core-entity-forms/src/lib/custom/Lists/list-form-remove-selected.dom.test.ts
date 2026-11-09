/**
 * Pins which rows List form's "Remove selected" deletes. Each selected ID used to be looked up by
 * scanning every loaded list item; the items are now indexed once. These specs hold it to the same
 * rows: selected IDs matched in any case, and an ID that is no longer loaded skipped.
 */
import { describe, it, expect, vi } from 'vitest';
import { MJListFormComponentExtended } from './list-form.component';

const KEEP = 'aaaaaaaa-0000-0000-0000-000000000001';
const DROP_1 = 'bbbbbbbb-0000-0000-0000-000000000002';
const DROP_2 = 'cccccccc-0000-0000-0000-000000000003';

describe('MJListFormComponentExtended.RemoveSelectedItems', () => {
    it('queues a delete for each selected item, matching IDs in any case and skipping unloaded ones', async () => {
        const deleted: string[] = [];
        const item = (ID: string) => ({ detail: { ID, TransactionGroup: null as unknown, Delete: vi.fn(async () => { deleted.push(ID); return true; }) } });
        const submit = vi.fn(async () => true);
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
        Object.defineProperty(form, 'TotalPages', { get: () => 1 });
        Object.defineProperty(form, 'metadata', { value: { CreateTransactionGroup: async () => ({ Submit: submit }) } });

        await form.RemoveSelectedItems();

        expect(deleted).toEqual([DROP_2, DROP_1.toUpperCase()]);
        expect(submit).toHaveBeenCalledTimes(1);
        expect(form.SelectedItems.size).toBe(0);
    });
});
