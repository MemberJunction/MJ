/**
 * FileStorageEngineBase default-account resolution — the system-wide answer to "which storage account,
 * when nobody configured one?". Agents (via AIEngineBase.ResolveAgentStorageAccountID), actions and UI all
 * route through it, so the ordering rules are pinned here: active providers only, newest `__mj_UpdatedAt`
 * first, exact ties broken by ID so every process picks the same account.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    // Minimal BaseEngine: a process-wide singleton with a no-op Load (we inject the cache directly).
    BaseEngine: class MockBaseEngine {
        private static _inst: unknown;
        static getInstance<T>(): T {
            const ctor = this as unknown as { _inst?: T; new (): T };
            if (!ctor._inst) ctor._inst = new ctor();
            return ctor._inst;
        }
        async Load(): Promise<void> {
            /* no-op for unit tests */
        }
    },
}));
vi.mock('../generated/entity_subclasses', () => ({ MJFileStorageAccountEntity: class {}, MJFileStorageProviderEntity: class {} }));

import { FileStorageEngineBase, type StorageAccountWithProvider } from '../engines/FileStorageEngine';

const DROPBOX_ID = '636E204B-12CB-4D67-A861-09DA9C825BA3';
const BOX_ID = 'F3000001-0000-4000-8000-000000000002';
const DROPBOX_PROVIDER = 'P-DROPBOX';
const BOX_PROVIDER = 'P-BOX';

interface AccountRow { ID: string; Name: string; ProviderID: string; __mj_UpdatedAt: Date }
interface ProviderRow { ID: string; Name: string; IsActive: boolean }

function seed(accounts: AccountRow[], providers: ProviderRow[]): void {
    const inst = FileStorageEngineBase.Instance as unknown as { _accounts: AccountRow[]; _providers: ProviderRow[] };
    inst._accounts = accounts;
    inst._providers = providers;
}

const dropbox = (updatedAt: string): AccountRow => ({ ID: DROPBOX_ID, Name: 'More Cheese Dropbox', ProviderID: DROPBOX_PROVIDER, __mj_UpdatedAt: new Date(updatedAt) });
const box = (updatedAt: string): AccountRow => ({ ID: BOX_ID, Name: 'Collaboration Box', ProviderID: BOX_PROVIDER, __mj_UpdatedAt: new Date(updatedAt) });
const providers = (dropboxActive = true, boxActive = true): ProviderRow[] => [
    { ID: DROPBOX_PROVIDER, Name: 'Dropbox', IsActive: dropboxActive },
    { ID: BOX_PROVIDER, Name: 'Box.com', IsActive: boxActive },
];

describe('FileStorageEngineBase default account resolution', () => {
    const engine = FileStorageEngineBase.Instance;
    beforeEach(() => seed([], []));

    it('ActiveAccounts keeps only accounts whose provider is active', () => {
        seed([dropbox('2026-10-01'), box('2026-10-05')], providers(true, false));
        expect(engine.ActiveAccounts.map(a => a.account.ID)).toEqual([DROPBOX_ID]);
    });

    it('returns no choice when nothing is active', () => {
        seed([box('2026-10-05')], providers(true, false));
        const result = engine.ResolveDefaultAccount();
        expect(result.Chosen).toBeNull();
        expect(result.Ambiguous).toBe(false);
        expect(engine.ResolveDefaultAccountID()).toBeNull();
    });

    it('returns the single active account, not ambiguous', () => {
        seed([dropbox('2026-10-01'), box('2026-10-05')], providers(true, false));
        const result = engine.ResolveDefaultAccount();
        expect(result.Chosen?.account.ID).toBe(DROPBOX_ID);
        expect(result.Ambiguous).toBe(false);
    });

    it('picks the most recently updated account when several are active, flagged ambiguous', () => {
        seed([dropbox('2026-10-01T00:00:00Z'), box('2026-10-05T00:00:00Z')], providers());
        const result = engine.ResolveDefaultAccount();
        expect(result.Chosen?.account.ID).toBe(BOX_ID);
        expect(result.Ambiguous).toBe(true);
        expect(result.Candidates.map(c => c.account.ID)).toEqual([BOX_ID, DROPBOX_ID]);
        expect(engine.ResolveDefaultAccountID()).toBe(BOX_ID);
    });

    it('breaks an exact __mj_UpdatedAt tie by ID, whatever the input order', () => {
        const same = '2026-10-05T00:00:00Z';
        seed([dropbox(same), box(same)], providers());
        expect(engine.ResolveDefaultAccountID()).toBe(DROPBOX_ID);
        seed([box(same), dropbox(same)], providers());
        expect(engine.ResolveDefaultAccountID()).toBe(DROPBOX_ID);
    });

    it('compares IDs case-insensitively in the tie-break', () => {
        const same = '2026-10-05T00:00:00Z';
        seed([{ ...dropbox(same), ID: DROPBOX_ID.toLowerCase() }, box(same)], providers());
        expect(engine.ResolveDefaultAccountID()).toBe(DROPBOX_ID.toLowerCase());
    });

    it('resolves among explicit candidates without reordering the caller\'s array', () => {
        seed([], []);
        const list = [
            { account: dropbox('2026-10-01T00:00:00Z'), provider: { Name: 'Dropbox', IsActive: true } },
            { account: box('2026-10-05T00:00:00Z'), provider: { Name: 'Box.com', IsActive: true } },
        ] as unknown as StorageAccountWithProvider[];
        expect(engine.ResolveDefaultAccountID(list)).toBe(BOX_ID);
        expect(list[0].account.ID).toBe(DROPBOX_ID);
    });
});
