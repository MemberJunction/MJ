/**
 * Pins FilteredAccountRows, a getter re-read on every change-detection pass. It used to scan the
 * provider, credential and permission lists once per account; it now indexes them once per read.
 */
import { describe, it, expect } from 'vitest';
import { StorageAdminDialogComponent } from './storage-admin-dialog.component';

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const C1 = 'bbbbbbbb-0000-0000-0000-000000000002';
const A1 = 'cccccccc-0000-0000-0000-000000000003';
const A2 = 'dddddddd-0000-0000-0000-000000000004';

function dialog(term = '') {
    const d = Object.create(StorageAdminDialogComponent.prototype) as StorageAdminDialogComponent;
    Object.assign(d, {
        SearchTerm: term,
        Providers: [{ ID: P1, Name: 'Azure Blob' }],
        Credentials: [{ ID: C1, Name: 'Prod key' }],
        Accounts: [
            { ID: A1, Name: 'Archive', Description: '', ProviderID: P1.toUpperCase(), CredentialID: C1.toUpperCase() },
            { ID: A2, Name: 'Scratch', Description: '', ProviderID: 'missing', CredentialID: null },
        ],
        AccountPermissions: [
            { FileStorageAccountID: A1.toUpperCase() }, { FileStorageAccountID: A1 }, { FileStorageAccountID: 'other' },
        ],
    });
    return d;
}

describe('StorageAdminDialogComponent.FilteredAccountRows', () => {
    it('joins provider, credential name and role count per account, case-insensitively', () => {
        const rows = dialog().FilteredAccountRows;
        expect(rows.map(r => [r.account.Name, r.provider?.Name ?? null, r.credentialName ?? null, r.roleCount])).toEqual([
            ['Archive', 'Azure Blob', 'Prod key', 2],
            ['Scratch', null, null, 0],
        ]);
    });

    it('filters by provider name and by credential name through the same lookups', () => {
        expect(dialog('azure').FilteredAccountRows.map(r => r.account.Name)).toEqual(['Archive']);
        expect(dialog('prod key').FilteredAccountRows.map(r => r.account.Name)).toEqual(['Archive']);
        expect(dialog('scratch').FilteredAccountRows.map(r => r.account.Name)).toEqual(['Scratch']);
    });
});
