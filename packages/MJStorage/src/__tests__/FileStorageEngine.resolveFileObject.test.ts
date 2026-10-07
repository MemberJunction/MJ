/**
 * Unit tests for the storage gate on file-ID routes (`FileStorageEngine.ResolveFileObject`) and on `UploadFile`'s
 * overwrite path.
 *
 * An `MJ: Files` row names only a PROVIDER, and its `ProviderKey`/`Name` are written by whoever saved the row, so a route
 * that goes from a file ID to bytes must (a) gate the account the provider resolves to and (b) refuse an object that
 * another row tracks when the caller cannot read that row. The evaluator here is the REAL one; only its data layer (the
 * metadata provider's RunView/RunViews and the system-user lookup), the metadata cache and the driver are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockBase, initializeDriver } = vi.hoisted(() => ({
    mockBase: {
        Loaded: true,
        Config: vi.fn(async () => undefined),
        AccountsWithProviders: [] as unknown[],
        GetAccountsByProviderID: vi.fn(),
        GetAccountWithProvider: vi.fn(),
    },
    initializeDriver: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    FileStorageEngineBase: { get Instance() { return mockBase; } },
}));
vi.mock('../util', () => ({ InitializeDriverWithAccountCredentials: initializeDriver }));

import { WellKnownUserSource } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '../FileStorageEngine';
import { NormalizeStorageObjectKey } from '../generic/ObjectKeys';
import {
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE,
    StorageAccountAccessDeniedError,
    TRACKED_FILE_ACCESS_DENIED_MESSAGE,
    TrackedFileAccessDeniedError
} from '../StorageAccessEvaluator';

const PROVIDER_S3 = 'AAAAAAAA-0000-4000-8000-000000000001';
const PROVIDER_EMPTY = 'AAAAAAAA-0000-4000-8000-000000000009';
const ACCOUNT_OPEN = 'BBBBBBBB-0000-4000-8000-000000000002';
const ACCOUNT_RESTRICTED = 'CCCCCCCC-0000-4000-8000-000000000003';
const PROVIDER_RESTRICTED = 'AAAAAAAA-0000-4000-8000-000000000003';
const ROLE_FINANCE = 'DDDDDDDD-0000-4000-8000-000000000004';
const FILE_SECRET = '99999999-0000-4000-8000-000000000007';
const FILE_ALIAS = '88888888-0000-4000-8000-000000000008';

function makeUser(id: string, roleIDs: string[]): UserInfo {
    return { ID: id, Name: id, UserRoles: roleIDs.map(RoleID => ({ RoleID })) } as unknown as UserInfo;
}
const plainUser = makeUser('11111111-0000-4000-8000-000000000001', []);
const financeUser = makeUser('22222222-0000-4000-8000-000000000002', [ROLE_FINANCE]);
const systemUser = makeUser('33333333-0000-4000-8000-000000000003', []);

const ACCOUNTS = [
    { ID: ACCOUNT_OPEN, Name: 'Open S3', ProviderID: PROVIDER_S3 },
    { ID: ACCOUNT_RESTRICTED, Name: 'Finance S3', ProviderID: PROVIDER_RESTRICTED },
];
const PERMISSIONS = [
    { FileStorageAccountID: ACCOUNT_RESTRICTED, Type: 'Role', RoleID: ROLE_FINANCE, UserID: null, CanRead: true, CanWrite: true },
];
/** HR's row tracks hr/secret.pdf; plainUser created an alias row pointing at the same object. plainUser reads only the alias. */
const FILES = [
    { ID: FILE_SECRET, Name: 'secret.pdf', ProviderKey: 'hr/secret.pdf', ProviderID: PROVIDER_S3 },
    { ID: FILE_ALIAS, Name: 'mine.pdf', ProviderKey: '/hr/secret.pdf', ProviderID: PROVIDER_S3 },
];
const READABLE: Record<string, string[]> = { [plainUser.ID]: [FILE_ALIAS], [financeUser.ID]: [FILE_SECRET, FILE_ALIAS] };

function named(params: RunViewParams, value: string): boolean {
    return (params.ExtraFilter ?? '').toLowerCase().includes(value.toLowerCase());
}

function answer(params: RunViewParams, user: UserInfo | undefined): RunViewResult<object> {
    const ok = (Results: object[]) => ({ Success: true, Results } as RunViewResult<object>);
    switch (params.EntityName) {
        case 'MJ: File Storage Accounts':
            return ok(ACCOUNTS.filter(a => named(params, a.ID)).map(a => ({ ID: a.ID })));
        case 'MJ: File Storage Account Permissions':
            return ok(PERMISSIONS.filter(p => named(params, p.FileStorageAccountID)));
        case 'MJ: Files':
            if (user?.ID === systemUser.ID) {
                return ok(FILES.filter(f => named(params, f.ProviderID) && named(params, `'${f.ProviderKey.toLowerCase()}'`)));
            }
            return ok(FILES.filter(f => named(params, f.ID) && (READABLE[user?.ID ?? ''] ?? []).includes(f.ID)).map(f => ({ ID: f.ID })));
        default:
            return { Success: false, Results: [], ErrorMessage: 'unknown entity' } as RunViewResult<object>;
    }
}

const provider = {
    RunView: vi.fn(async (p: RunViewParams, u?: UserInfo) => answer(p, u)),
    RunViews: vi.fn(async (ps: RunViewParams[], u?: UserInfo) => ps.map(p => answer(p, u))),
    GetEntityObject: vi.fn(),
} as unknown as IMetadataProvider;

const fakeDriver = {
    NormalizeObjectKey: (key: string) => NormalizeStorageObjectKey(key),
    PutObject: vi.fn(async () => true),
    Dispose: vi.fn(),
};

describe('FileStorageEngine.ResolveFileObject — the gate for routes that go from a file ID to bytes', () => {
    const engine = FileStorageEngine.Instance;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        mockBase.GetAccountsByProviderID.mockImplementation((id: string) => ACCOUNTS.filter(a => a.ProviderID === id));
        mockBase.GetAccountWithProvider.mockImplementation((id: string) => {
            const account = ACCOUNTS.find(a => a.ID === id);
            return account ? { account, provider: { ID: account.ProviderID, IsActive: true } } : null;
        });
        initializeDriver.mockResolvedValue(fakeDriver);
    });

    afterEach(() => {
        systemUserSpy.mockRestore();
    });

    it('refuses a row whose provider resolves to an account the caller may not read — before any driver is built', async () => {
        const file = { ProviderID: PROVIDER_RESTRICTED, ProviderKey: 'q3.xlsx', Name: 'q3.xlsx' };
        const refusal = engine.ResolveFileObject(file, plainUser, 'Read', provider);
        await expect(refusal).rejects.toBeInstanceOf(StorageAccountAccessDeniedError);
        await expect(engine.ResolveFileObject(file, plainUser, 'Read', provider)).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
        expect(initializeDriver).not.toHaveBeenCalled();
    });

    it('refuses an alias row pointing at an object another row tracks, when the caller cannot read that row', async () => {
        const alias = { ProviderID: PROVIDER_S3, ProviderKey: '/hr/secret.pdf', Name: 'mine.pdf' };
        const refusal = engine.ResolveFileObject(alias, plainUser, 'Read', provider);
        await expect(refusal).rejects.toBeInstanceOf(TrackedFileAccessDeniedError);
        await expect(engine.ResolveFileObject(alias, plainUser, 'Read', provider)).rejects.toThrow(TRACKED_FILE_ACCESS_DENIED_MESSAGE);
    });

    it('resolves the account, driver and object key for a caller who may read every row tracking the object', async () => {
        const file = { ProviderID: PROVIDER_S3, ProviderKey: 'hr/secret.pdf', Name: 'secret.pdf' };
        const resolved = await engine.ResolveFileObject(file, financeUser, 'Read', provider);
        expect(resolved?.Account.ID).toBe(ACCOUNT_OPEN);
        expect(resolved?.Driver).toBe(fakeDriver);
        expect(resolved?.ObjectKey).toBe('hr/secret.pdf');
    });

    it('falls back to Name when the row has no ProviderKey', async () => {
        const file = { ProviderID: PROVIDER_S3, ProviderKey: null, Name: 'public/brochure.pdf' };
        const resolved = await engine.ResolveFileObject(file, plainUser, 'Read', provider);
        expect(resolved?.ObjectKey).toBe('public/brochure.pdf');
    });

    it('returns null when the row\'s provider has no storage account', async () => {
        const resolved = await engine.ResolveFileObject({ ProviderID: PROVIDER_EMPTY, ProviderKey: 'x', Name: 'x' }, plainUser, 'Read', provider);
        expect(resolved).toBeNull();
    });

    it('UploadFile refuses to overwrite an object behind a row the caller cannot read, before PutObject', async () => {
        const upload = engine.UploadFile({
            content: Buffer.from('x'), fileName: 'secret.pdf', mimeType: 'application/pdf', contextUser: plainUser,
            storageAccountId: ACCOUNT_OPEN, pathPrefix: 'hr', provider
        });
        await expect(upload).rejects.toBeInstanceOf(TrackedFileAccessDeniedError);
        expect(fakeDriver.PutObject).not.toHaveBeenCalled();
    });
});
