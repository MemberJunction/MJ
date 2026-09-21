/**
 * CodeGen's field-security reconciliation pass.
 *
 * This is the schema-change adapter: a column added to an enabled entity has no permission rows,
 * and on an enabled entity a field with no rows is DENIED — so without this pass a new column is
 * invisible to everyone, including the administrator who added it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logErrorSpy, logStatusSpy, reconcileSpy } = vi.hoisted(() => ({
    logErrorSpy: vi.fn(),
    logStatusSpy: vi.fn(),
    reconcileSpy: vi.fn(),
}));

vi.mock('../Misc/status_logging', () => ({
    logStatus: logStatusSpy,
    logError: logErrorSpy,
    logWarning: vi.fn(),
    logMessage: vi.fn(),
    startSpinner: vi.fn(),
    updateSpinner: vi.fn(),
    succeedSpinner: vi.fn(),
    failSpinner: vi.fn(),
}));

vi.mock('@memberjunction/core-entities-server', () => ({
    ReconcileFieldPermissions: reconcileSpy,
}));

import { reconcileFieldLevelSecurity } from '../Database/reconcileFieldLevelSecurity';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** Minimal stand-in for the metadata provider — only Entities is read. */
function providerWith(entities: Array<{ Name: string; EnableFieldLevelSecurity: boolean }>): IMetadataProvider {
    return { Entities: entities } as unknown as IMetadataProvider;
}

const USER = { ID: 'u1', Email: 'u@test.com' } as unknown as UserInfo;

beforeEach(() => {
    logErrorSpy.mockClear();
    logStatusSpy.mockClear();
    reconcileSpy.mockReset();
    reconcileSpy.mockResolvedValue({ Inserted: 0, Deleted: 0 });
});

describe('reconcileFieldLevelSecurity', () => {
    it('reconciles only the entities that opted in', async () => {
        const provider = providerWith([
            { Name: 'Employees', EnableFieldLevelSecurity: true },
            { Name: 'Orders', EnableFieldLevelSecurity: false },
            { Name: 'Donors', EnableFieldLevelSecurity: true },
        ]);

        await reconcileFieldLevelSecurity(provider, USER);

        expect(reconcileSpy).toHaveBeenCalledTimes(2);
        const names = reconcileSpy.mock.calls.map((c) => (c[0] as { Name: string }).Name);
        expect(names.sort()).toEqual(['Donors', 'Employees']);
    });

    it('does nothing at all when no entity has field security on', async () => {
        const provider = providerWith([{ Name: 'Orders', EnableFieldLevelSecurity: false }]);

        await expect(reconcileFieldLevelSecurity(provider, USER)).resolves.toBe(true);
        expect(reconcileSpy).not.toHaveBeenCalled();
        expect(logStatusSpy).not.toHaveBeenCalled();
    });

    it('passes the provider and user straight through', async () => {
        const provider = providerWith([{ Name: 'Employees', EnableFieldLevelSecurity: true }]);

        await reconcileFieldLevelSecurity(provider, USER);

        expect(reconcileSpy).toHaveBeenCalledWith(expect.objectContaining({ Name: 'Employees' }), provider, USER);
    });

    it('reports totals only when something actually changed', async () => {
        const provider = providerWith([{ Name: 'Employees', EnableFieldLevelSecurity: true }]);

        await reconcileFieldLevelSecurity(provider, USER);
        expect(logStatusSpy).not.toHaveBeenCalled(); // 0 inserted, 0 deleted — stay quiet

        reconcileSpy.mockResolvedValue({ Inserted: 3, Deleted: 1 });
        await reconcileFieldLevelSecurity(provider, USER);

        expect(logStatusSpy).toHaveBeenCalledTimes(1);
        expect(logStatusSpy.mock.calls[0][0]).toMatch(/3 permission row\(s\) added, 1 removed/);
    });

    it('keeps going after one entity fails, and reports the failure', async () => {
        // Reconciliation is a maintenance pass over data CodeGen does not own. Failing the whole
        // run — after schema, views and procs have been written — would trade a recoverable
        // permissions gap for an unrecoverable half-finished build.
        const provider = providerWith([
            { Name: 'Employees', EnableFieldLevelSecurity: true },
            { Name: 'Donors', EnableFieldLevelSecurity: true },
        ]);
        reconcileSpy
            .mockRejectedValueOnce(new Error('constraint violation'))
            .mockResolvedValueOnce({ Inserted: 2, Deleted: 0 });

        const ok = await reconcileFieldLevelSecurity(provider, USER);

        expect(ok).toBe(false); // the run is reported as imperfect...
        expect(reconcileSpy).toHaveBeenCalledTimes(2); // ...but the second entity still ran
        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        expect(logErrorSpy.mock.calls[0][0]).toMatch(/Employees.*constraint violation/);
    });

    it('returns true when every entity reconciles cleanly', async () => {
        const provider = providerWith([{ Name: 'Employees', EnableFieldLevelSecurity: true }]);
        reconcileSpy.mockResolvedValue({ Inserted: 1, Deleted: 0 });

        await expect(reconcileFieldLevelSecurity(provider, USER)).resolves.toBe(true);
    });

    it('tolerates a provider with no entities', async () => {
        await expect(reconcileFieldLevelSecurity({} as IMetadataProvider, USER)).resolves.toBe(true);
        expect(reconcileSpy).not.toHaveBeenCalled();
    });
});
