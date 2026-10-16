/**
 * Tests for StorageSearchProvider's account selection: which storage accounts a search touches, for which user.
 *
 * The provider used to load every `MJ: File Storage Account Permissions` row ONCE, under whichever user configured the
 * engine first, and evaluate every later search against that snapshot (a failed load became `[]`, which the
 * zero-rows rule turned into "every account open to everyone" until restart). It also snapshotted the searchable
 * accounts. Now both are read per search: accounts from the storage engine's live cache, permissions through the real
 * `StorageAccessEvaluator` (only its data layer is faked here).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { fakeEngine } = vi.hoisted(() => ({
    fakeEngine: {
        Config: vi.fn(async () => undefined),
        AccountsWithProviders: [] as Array<{ account: object; provider: object }>,
        GetDriver: vi.fn(),
    },
}));

vi.mock('@memberjunction/storage', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/storage')>('@memberjunction/storage');
    return { ...actual, FileStorageEngine: { Instance: fakeEngine } };
});

import { WellKnownUserSource } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { StorageAccountPermissionRow } from '@memberjunction/storage';
import { StorageSearchProvider } from '../generic/StorageSearchProvider';

const PROVIDER_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const ACCOUNT_OPEN = 'BBBBBBBB-0000-4000-8000-000000000002';
const ACCOUNT_FINANCE = 'CCCCCCCC-0000-4000-8000-000000000003';
const ACCOUNT_LATE = 'DDDDDDDD-0000-4000-8000-000000000004';
const ROLE_FINANCE = 'EEEEEEEE-0000-4000-8000-000000000005';

function makeUser(id: string, roleIDs: string[]): UserInfo {
    return { ID: id, Name: id, UserRoles: roleIDs.map(RoleID => ({ RoleID })) } as unknown as UserInfo;
}
const financeUser = makeUser('11111111-0000-4000-8000-000000000001', [ROLE_FINANCE]);
const plainUser = makeUser('22222222-0000-4000-8000-000000000002', []);
const systemUser = makeUser('33333333-0000-4000-8000-000000000003', []);

function account(id: string, name: string, includeInGlobalSearch = true): { account: object; provider: object } {
    return {
        account: { ID: id, Name: name, ProviderID: PROVIDER_ID, IncludeInGlobalSearch: includeInGlobalSearch },
        provider: { ID: PROVIDER_ID, IsActive: true, SupportsSearch: true },
    };
}

/** The permission-row store behind the fake provider; tests mutate it between searches. */
interface PermissionStore {
    Accounts: string[];
    Rows: StorageAccountPermissionRow[];
    Fail: boolean;
}

function namedIn(params: RunViewParams, id: string): boolean {
    return (params.ExtraFilter ?? '').toLowerCase().includes(id.toLowerCase());
}

function fakeMetadataProvider(store: PermissionStore): IMetadataProvider {
    const answer = (p: RunViewParams): RunViewResult<object> => {
        if (store.Fail) return { Success: false, Results: [], ErrorMessage: 'simulated' } as RunViewResult<object>;
        const rows = p.EntityName === 'MJ: File Storage Accounts'
            ? store.Accounts.filter(id => namedIn(p, id)).map(ID => ({ ID }))
            : store.Rows.filter(r => namedIn(p, r.FileStorageAccountID));
        return { Success: true, Results: rows } as RunViewResult<object>;
    };
    return { RunViews: vi.fn(async (params: RunViewParams[]) => params.map(answer)) } as unknown as IMetadataProvider;
}

/** A driver whose search returns one file named after the account, so a hit proves the account was searched. */
function driverFor(accountID: string): object {
    return {
        IsConfigured: true,
        SearchFiles: vi.fn(async () => ({
            results: [{ name: `${accountID}.pdf`, path: `docs/${accountID}.pdf`, size: 10, contentType: 'application/pdf', lastModified: new Date() }],
        })),
    };
}

/** The account IDs whose hits a search returned. */
function searchedAccounts(results: Array<{ RawMetadata?: string }>): string[] {
    return results.map(r => (JSON.parse(r.RawMetadata ?? '{}') as { accountId: string }).accountId).sort();
}

describe('StorageSearchProvider — accounts and permissions are evaluated per search', () => {
    let store: PermissionStore;
    let provider: StorageSearchProvider;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        fakeEngine.AccountsWithProviders = [account(ACCOUNT_OPEN, 'Open'), account(ACCOUNT_FINANCE, 'Finance')];
        fakeEngine.GetDriver.mockImplementation(async (id: string) => driverFor(id));
        store = {
            Accounts: [ACCOUNT_OPEN, ACCOUNT_FINANCE, ACCOUNT_LATE],
            Rows: [{ FileStorageAccountID: ACCOUNT_FINANCE, Type: 'Role', RoleID: ROLE_FINANCE, UserID: null, CanRead: true, CanWrite: true }],
            Fail: false,
        };
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        provider = new StorageSearchProvider();
        provider.Provider = fakeMetadataProvider(store);
        // Configured under the FINANCE user — under the old snapshot this choice leaked into everyone's searches.
        await provider.CheckAvailability(financeUser);
    });

    afterEach(() => {
        systemUserSpy.mockRestore();
    });

    it('is available when a searchable account exists', () => {
        expect(provider.IsAvailable()).toBe(true);
    });

    it('configured under user A, searched by user B: B gets only B\'s own accounts', async () => {
        const forPlain = await provider.Search('report', 10, undefined, plainUser);
        expect(searchedAccounts(forPlain)).toEqual([ACCOUNT_OPEN]);
        const forFinance = await provider.Search('report', 10, undefined, financeUser);
        expect(searchedAccounts(forFinance)).toEqual([ACCOUNT_OPEN, ACCOUNT_FINANCE].sort());
    });

    it('never calls a driver for an account the user may not read', async () => {
        await provider.Search('report', 10, undefined, plainUser);
        const driverAccounts = fakeEngine.GetDriver.mock.calls.map(c => c[0]);
        expect(driverAccounts).toEqual([ACCOUNT_OPEN]);
    });

    it('a grant added between two searches applies to the second; a revocation to the third', async () => {
        expect(searchedAccounts(await provider.Search('report', 10, undefined, plainUser))).toEqual([ACCOUNT_OPEN]);

        store.Rows.push({ FileStorageAccountID: ACCOUNT_FINANCE, Type: 'User', UserID: plainUser.ID, RoleID: null, CanRead: true, CanWrite: false });
        expect(searchedAccounts(await provider.Search('report', 10, undefined, plainUser))).toEqual([ACCOUNT_OPEN, ACCOUNT_FINANCE].sort());

        store.Rows = store.Rows.filter(r => r.Type !== 'User');
        expect(searchedAccounts(await provider.Search('report', 10, undefined, plainUser))).toEqual([ACCOUNT_OPEN]);
    });

    it('a failed permission read searches nothing — it never opens every account', async () => {
        store.Fail = true;
        const results = await provider.Search('report', 10, undefined, financeUser);
        expect(results).toHaveLength(0);
        expect(fakeEngine.GetDriver).not.toHaveBeenCalled();
    });

    it('reads searchable accounts from the live engine cache: an account added after configuration is searched', async () => {
        fakeEngine.AccountsWithProviders = [...fakeEngine.AccountsWithProviders, account(ACCOUNT_LATE, 'Late')];
        const results = await provider.Search('report', 10, undefined, plainUser);
        expect(searchedAccounts(results)).toEqual([ACCOUNT_OPEN, ACCOUNT_LATE].sort());
    });

    it('an account taken out of global search after configuration is no longer searched', async () => {
        fakeEngine.AccountsWithProviders = [account(ACCOUNT_OPEN, 'Open', false), account(ACCOUNT_FINANCE, 'Finance')];
        const results = await provider.Search('report', 10, undefined, financeUser);
        expect(searchedAccounts(results)).toEqual([ACCOUNT_FINANCE]);
    });

    it('a scope narrows the accounts before permissions are asked, and never widens them', async () => {
        const scoped = await provider.Search('report', 10, undefined, plainUser, {
            StorageAccounts: [{ FileStorageAccountID: ACCOUNT_FINANCE }],
        } as Parameters<StorageSearchProvider['Search']>[4]);
        expect(scoped).toHaveLength(0);
    });

    it('a scope that names no storage account searches nothing — no account lookup, no permission read, no driver', async () => {
        fakeEngine.Config.mockClear(); // CheckAvailability in beforeEach loaded it once
        const permissionReads = vi.fn();
        provider.Provider = { RunViews: permissionReads } as unknown as IMetadataProvider;
        const results = await provider.Search('report', 10, undefined, financeUser, { StorageAccounts: [] });
        expect(results).toHaveLength(0);
        expect(fakeEngine.Config).not.toHaveBeenCalled();
        expect(permissionReads).not.toHaveBeenCalled();
        expect(fakeEngine.GetDriver).not.toHaveBeenCalled();
    });

    it('a defined but blank FolderPath restricts to nothing, never to the whole account', async () => {
        const results = await provider.Search('report', 10, undefined, financeUser, {
            StorageAccounts: [{ FileStorageAccountID: ACCOUNT_OPEN, FolderPath: '  ' }],
        });
        expect(results).toHaveLength(0);
        expect(fakeEngine.GetDriver).not.toHaveBeenCalled();
    });

    it('a FolderPath keeps only files under that folder', async () => {
        const inside = await provider.Search('report', 10, undefined, financeUser, {
            StorageAccounts: [{ FileStorageAccountID: ACCOUNT_OPEN, FolderPath: 'docs' }],
        });
        expect(searchedAccounts(inside)).toEqual([ACCOUNT_OPEN]);
        const elsewhere = await provider.Search('report', 10, undefined, financeUser, {
            StorageAccounts: [{ FileStorageAccountID: ACCOUNT_OPEN, FolderPath: 'clients/acme' }],
        });
        expect(elsewhere).toHaveLength(0);
    });

    it('stamps the account on every hit, for the engine\'s late re-check', async () => {
        const results = await provider.Search('report', 10, undefined, financeUser);
        expect(results.every(r => r.ResultType === 'storage-file')).toBe(true);
        expect(searchedAccounts(results)).toEqual([ACCOUNT_OPEN, ACCOUNT_FINANCE].sort());
    });
});
