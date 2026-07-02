/**
 * Tests for ReplaceAppDependenciesAtomically (B23).
 *
 * Upgrade rewrites an app's dependency rows by deleting the old set and inserting the new
 * one. Pre-fix this was two un-grouped steps (delete; then add), so a crash in between left
 * the app with ZERO dependency rows. The atomic helper queues both the deletes and the
 * inserts into a SINGLE TransactionGroup and commits once — all-or-nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared transaction group whose Submit we can observe, plus capture buffers.
const submitSpy = vi.fn(async () => true);
const sharedTg = { Submit: submitSpy };
let existingDeps: FakeDepEntity[] = [];
let insertedDeps: FakeDepEntity[] = [];

class FakeDepEntity {
    TransactionGroup: unknown = undefined;
    LatestResult = { CompleteMessage: '' };
    deleteCalled = false;
    saveCalled = false;
    // Field setters used by RecordAppDependencies (plain props are fine).
    OpenAppID = '';
    DependsOnAppName = '';
    DependsOnAppID: string | null = null;
    VersionRange: string | undefined = '';
    InstalledVersion: string | null = null;
    Status = '';
    NewRecord() {}
    async Delete() { this.deleteCalled = true; return true; }
    async Save() { this.saveCalled = true; return true; }
}

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        async CreateTransactionGroup() { return sharedTg; }
        async GetEntityObject() {
            const e = new FakeDepEntity();
            insertedDeps.push(e);
            return e;
        }
    },
    RunView: class {
        async RunView(params: { EntityName: string }) {
            if (params.EntityName === 'MJ: Open App Dependencies') {
                return { Success: true, Results: existingDeps }; // delete path: existing rows
            }
            if (params.EntityName === 'MJ: Open Apps') {
                return { Success: true, Results: [{ ID: 'dep-id', Version: '1.0.0' }] }; // dep-app lookup
            }
            return { Success: true, Results: [] };
        }
    },
    CompositeKey: class {},
}));

import { ReplaceAppDependenciesAtomically } from '../install/history-recorder.js';

const user = {} as never;

beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockResolvedValue(true);
    existingDeps = [new FakeDepEntity(), new FakeDepEntity()];
    insertedDeps = [];
});

describe('ReplaceAppDependenciesAtomically (B23)', () => {
    it('queues old-row deletes AND new-row inserts into ONE transaction, then submits once', async () => {
        const ok = await ReplaceAppDependenciesAtomically(user, 'app-1', { 'dep-a': '^1.0.0' });

        expect(ok).toBe(true);
        // Single commit point.
        expect(submitSpy).toHaveBeenCalledTimes(1);
        // Every existing row was tagged with the shared tg and queued for delete (not committed individually).
        for (const d of existingDeps) {
            expect(d.deleteCalled).toBe(true);
            expect(d.TransactionGroup).toBe(sharedTg);
        }
        // The new row was tagged with the SAME tg and queued for insert.
        expect(insertedDeps.length).toBe(1);
        expect(insertedDeps[0].saveCalled).toBe(true);
        expect(insertedDeps[0].TransactionGroup).toBe(sharedTg);
    });

    it('returns false when the transaction fails to commit (no partial state reported as success)', async () => {
        submitSpy.mockResolvedValue(false);
        const ok = await ReplaceAppDependenciesAtomically(user, 'app-1', { 'dep-a': '^1.0.0' });
        expect(ok).toBe(false);
    });
});
