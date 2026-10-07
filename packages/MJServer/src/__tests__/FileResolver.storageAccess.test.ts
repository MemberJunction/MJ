/**
 * FileResolver.storageAccess.test.ts — the storage-account gate on every account-keyed storage route (A12.16).
 *
 * These routes used to check only entity-level permission on an empty `MJ: Files` object and then act on a
 * client-supplied account through `FileStorageEngine.GetDriver` (a process-wide cache with no user check). They now run
 * the shared `StorageAccessEvaluator` first. The evaluator here is the REAL one from `@memberjunction/storage`; only the
 * data layer behind it (the provider's RunView/RunViews), the system-user lookup, the storage engine and the driver
 * utilities are faked — so "denied", "zero rows → open" and "tracked object" are decided by production code.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    engine: {
        Config: vi.fn(async () => undefined),
        GetDriver: vi.fn(),
        GetAccountById: vi.fn(),
        GetAccountWithProvider: vi.fn(),
        ResolveStorageAccount: vi.fn(),
        UploadFile: vi.fn(),
    },
    listObjects: vi.fn(async () => ({ objects: [], prefixes: [] })),
    deleteObject: vi.fn(async () => true),
    moveObject: vi.fn(async () => true),
    copyObject: vi.fn(async () => true),
    copyObjectBetweenProviders: vi.fn(async () => ({ success: true, message: 'ok', sourcePath: 'a', destinationPath: 'b' })),
    searchAcrossAccounts: vi.fn(),
    consumeUploadToken: vi.fn(),
}));

// The resolver's import chain reaches the generated GraphQL schema and the type-graphql decorators; neither is under
// test here, so neutralize them (the pattern UserViewResolver.updateWhereClause.test.ts uses).
vi.mock('@memberjunction/server', () => {
    const noopDecorator = () => () => undefined;
    return {
        Arg: noopDecorator, Ctx: noopDecorator, Field: noopDecorator, FieldResolver: noopDecorator, InputType: noopDecorator,
        Mutation: noopDecorator, ObjectType: noopDecorator, PubSub: noopDecorator, Query: noopDecorator, Resolver: noopDecorator,
        Root: noopDecorator, Int: {}, Float: {}, DeleteOptionsInput: class {},
    };
});
vi.mock('../generated/generated.js', () => ({
    CreateMJFileInput: class {},
    UpdateMJFileInput: class {},
    MJFile_: class {},
    MJFileResolver: class {
        protected GetUserFromPayload(userPayload: { userRecord?: object } | undefined) {
            return userPayload?.userRecord;
        }
    },
}));
vi.mock('@memberjunction/ai-agents', () => ({ readRealtimeRecordingFile: vi.fn() }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({ FieldMapper: class { MapFields(o: object) { return o; } } }));
vi.mock('../config.js', () => ({ configInfo: {} }));
vi.mock('../rest/MediaAccessKeys.js', () => ({ MediaAccessKeyManager: { Instance: {} } }));
vi.mock('../rest/UploadTokenManager.js', () => ({ UploadTokenManager: { Instance: { Consume: mocks.consumeUploadToken } } }));
vi.mock('@memberjunction/storage', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/storage')>('@memberjunction/storage');
    return {
        ...actual,
        FileStorageEngine: { Instance: mocks.engine },
        listObjects: mocks.listObjects,
        deleteObject: mocks.deleteObject,
        moveObject: mocks.moveObject,
        copyObject: mocks.copyObject,
        copyObjectBetweenProviders: mocks.copyObjectBetweenProviders,
        searchAcrossAccounts: mocks.searchAcrossAccounts,
    };
});

import { WellKnownUserSource } from '@memberjunction/core';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE,
    TRACKED_FILE_ACCESS_DENIED_MESSAGE,
    type StorageAccountPermissionRow,
} from '@memberjunction/storage';
import { FileResolver } from '../resolvers/FileResolver.js';
import type { AppContext } from '../types.js';

const PROVIDER_S3 = 'AAAAAAAA-0000-4000-8000-000000000001';
const ACCOUNT_OPEN = 'BBBBBBBB-0000-4000-8000-000000000002';      // no permission rows → open (current rule)
const ACCOUNT_FINANCE = 'CCCCCCCC-0000-4000-8000-000000000003';   // Read+Write for the Finance role only
const ACCOUNT_READONLY = 'DDDDDDDD-0000-4000-8000-000000000004';  // Read (no Write) for Everyone
const ACCOUNT_MISSING = 'EEEEEEEE-0000-4000-8000-000000000005';   // does not exist
const ROLE_FINANCE = 'FFFFFFFF-0000-4000-8000-000000000006';
const FILE_SECRET = '99999999-0000-4000-8000-000000000007';
const FILE_MINE = '88888888-0000-4000-8000-000000000008';

function makeUser(id: string, roleIDs: string[]): UserInfo {
    return { ID: id, Name: id, Email: `${id}@example.com`, UserRoles: roleIDs.map(RoleID => ({ RoleID })) } as unknown as UserInfo;
}
const plainUser = makeUser('11111111-0000-4000-8000-000000000001', []);
const financeUser = makeUser('22222222-0000-4000-8000-000000000002', [ROLE_FINANCE]);
const systemUser = makeUser('33333333-0000-4000-8000-000000000003', []);

const ACCOUNTS = [ACCOUNT_OPEN, ACCOUNT_FINANCE, ACCOUNT_READONLY];
const PERMISSIONS: StorageAccountPermissionRow[] = [
    { FileStorageAccountID: ACCOUNT_FINANCE, Type: 'Role', RoleID: ROLE_FINANCE, UserID: null, CanRead: true, CanWrite: true },
    { FileStorageAccountID: ACCOUNT_READONLY, Type: 'Everyone', RoleID: null, UserID: null, CanRead: true, CanWrite: false },
];
/** MJ: Files rows on the S3 provider; plainUser may read only FILE_MINE. */
const FILES = [
    { ID: FILE_SECRET, Name: 'secret.pdf', ProviderKey: 'hr/secret.pdf', ProviderID: PROVIDER_S3 },
    { ID: FILE_MINE, Name: 'mine.pdf', ProviderKey: 'me/mine.pdf', ProviderID: PROVIDER_S3 },
];
const READABLE_FILES: Record<string, string[]> = { [plainUser.ID]: [FILE_MINE], [financeUser.ID]: [FILE_SECRET, FILE_MINE] };

function namedIn(params: RunViewParams, value: string): boolean {
    return (params.ExtraFilter ?? '').toLowerCase().includes(value.toLowerCase());
}

/** The fake database behind the evaluator's RunView/RunViews. */
function answerView(params: RunViewParams, user: UserInfo | undefined): RunViewResult<object> {
    const ok = (Results: object[]) => ({ Success: true, Results } as RunViewResult<object>);
    switch (params.EntityName) {
        case 'MJ: File Storage Accounts':
            return ok(ACCOUNTS.filter(id => namedIn(params, id)).map(ID => ({ ID })));
        case 'MJ: File Storage Account Permissions':
            return ok(PERMISSIONS.filter(p => namedIn(params, p.FileStorageAccountID)));
        case 'MJ: Files':
            if (user?.ID === systemUser.ID) {
                return ok(FILES.filter(f => namedIn(params, f.ProviderID) && namedIn(params, `'${f.ProviderKey}'`)));
            }
            return ok(FILES.filter(f => namedIn(params, f.ID) && (READABLE_FILES[user?.ID ?? ''] ?? []).includes(f.ID)).map(f => ({ ID: f.ID })));
        default:
            return { Success: false, Results: [], ErrorMessage: 'unknown entity' } as RunViewResult<object>;
    }
}

const accountLoads: string[] = [];

function fakeEntity(entityName: string): object {
    if (entityName === 'MJ: File Storage Accounts') {
        const account = { ID: '', Name: '', ProviderID: PROVIDER_S3, Load: vi.fn(async (id: string) => {
            accountLoads.push(id);
            account.ID = id;
            account.Name = `account ${id}`;
            return ACCOUNTS.includes(id);
        }) };
        return account;
    }
    if (entityName === 'MJ: File Storage Providers') {
        return { ID: PROVIDER_S3, Name: 'AWS S3 Storage', ServerDriverKey: 'AWS S3 Storage', Load: vi.fn(async () => true), Get: () => null };
    }
    return { CheckPermissions: vi.fn(), Load: vi.fn(async () => true), GetAll: () => ({}) };
}

const fakeProvider = {
    RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => answerView(params, user)),
    RunViews: vi.fn(async (params: RunViewParams[], user?: UserInfo) => params.map(p => answerView(p, user))),
    GetEntityObject: vi.fn(async (entityName: string) => fakeEntity(entityName)),
};

function contextFor(user: UserInfo): AppContext {
    return {
        providers: [{ provider: fakeProvider, type: 'Read-Write' }],
        userPayload: { userRecord: user },
    } as unknown as AppContext;
}

function accountEntity(id: string): object {
    return { ID: id, Name: `account ${id}`, ProviderID: PROVIDER_S3 };
}

const fakeDriver = {
    CreatePreAuthDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
    CreatePreAuthUploadUrl: vi.fn(async (key: string) => ({ UploadUrl: `https://upload.example/${key}` })),
    CreateDirectory: vi.fn(async () => true),
    SupportsPreAuthUpload: true,
};

describe('FileResolver — storage routes honour account permissions', () => {
    const resolver = new FileResolver();
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        accountLoads.length = 0;
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        mocks.engine.GetDriver.mockResolvedValue(fakeDriver);
        mocks.engine.GetAccountById.mockImplementation((id: string) => (ACCOUNTS.includes(id) ? accountEntity(id) : undefined));
        mocks.engine.GetAccountWithProvider.mockImplementation((id: string) =>
            ACCOUNTS.some(a => a.toLowerCase() === id.toLowerCase())
                ? { account: accountEntity(id), provider: { ID: PROVIDER_S3, Name: 'AWS S3 Storage', SupportsSearch: true } }
                : null);
    });

    afterEach(() => {
        systemUserSpy.mockRestore();
    });

    describe('CreatePreAuthDownloadUrl', () => {
        it('refuses an account restricted to a role the caller lacks — before any driver call', async () => {
            await expect(resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_FINANCE, ObjectName: 'q3.pdf' }, contextFor(plainUser)))
                .rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
        });

        it('refuses an account that does not exist with the SAME message (existence is not revealed)', async () => {
            await expect(resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_MISSING, ObjectName: 'q3.pdf' }, contextFor(financeUser)))
                .rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
        });

        it('allows an account with zero permission rows (current rule) for an untracked object', async () => {
            const url = await resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_OPEN, ObjectName: 'public/brochure.pdf' }, contextFor(plainUser));
            expect(url).toBe('https://signed.example/public/brochure.pdf');
        });

        it('refuses a tracked object whose MJ: Files row the caller cannot read, with GetFileContents\' message', async () => {
            await expect(resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_OPEN, ObjectName: 'hr/secret.pdf' }, contextFor(plainUser)))
                .rejects.toThrow(TRACKED_FILE_ACCESS_DENIED_MESSAGE);
            expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
        });

        it('allows a tracked object whose MJ: Files row the caller can read', async () => {
            const url = await resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_OPEN, ObjectName: 'me/mine.pdf' }, contextFor(plainUser));
            expect(url).toBe('https://signed.example/me/mine.pdf');
        });

        it('lets the permitted role through the gate', async () => {
            const url = await resolver.CreatePreAuthDownloadUrl({ AccountID: ACCOUNT_FINANCE, ObjectName: 'q3.pdf' }, contextFor(financeUser));
            expect(url).toBe('https://signed.example/q3.pdf');
        });
    });

    describe('write routes need CanWrite, and are refused before the account is loaded or a driver is touched', () => {
        const ctx = () => contextFor(plainUser);
        const cases: Array<[string, () => Promise<unknown>, () => void]> = [
            ['DeleteStorageObject', () => resolver.DeleteStorageObject({ AccountID: ACCOUNT_READONLY, ObjectName: 'x' }, ctx()),
                () => expect(mocks.deleteObject).not.toHaveBeenCalled()],
            ['MoveStorageObject', () => resolver.MoveStorageObject({ AccountID: ACCOUNT_READONLY, OldName: 'x', NewName: 'y' }, ctx()),
                () => expect(mocks.moveObject).not.toHaveBeenCalled()],
            ['CopyStorageObject', () => resolver.CopyStorageObject({ AccountID: ACCOUNT_READONLY, SourceName: 'x', DestinationName: 'y' }, ctx()),
                () => expect(mocks.copyObject).not.toHaveBeenCalled()],
            ['CreateDirectory', () => resolver.CreateDirectory({ AccountID: ACCOUNT_READONLY, Path: 'new/' }, ctx()),
                () => expect(fakeDriver.CreateDirectory).not.toHaveBeenCalled()],
            ['CreatePreAuthUploadUrl', () => resolver.CreatePreAuthUploadUrl({ AccountID: ACCOUNT_READONLY, ObjectName: 'x' }, ctx()),
                () => expect(fakeDriver.CreatePreAuthUploadUrl).not.toHaveBeenCalled()],
        ];
        for (const [name, call, assertNoSideEffect] of cases) {
            it(`${name} refuses a read-only (CanWrite=false) account`, async () => {
                await expect(call()).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
                assertNoSideEffect();
                expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
                expect(accountLoads).toHaveLength(0);
            });
        }

        it('DeleteStorageObject proceeds on a zero-row account', async () => {
            await expect(resolver.DeleteStorageObject({ AccountID: ACCOUNT_OPEN, ObjectName: 'x' }, ctx())).resolves.toBe(true);
            expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
        });
    });

    describe('read routes', () => {
        it('ListStorageObjects refuses a restricted account before loading it', async () => {
            await expect(resolver.ListStorageObjects({ AccountID: ACCOUNT_FINANCE, Prefix: '' }, contextFor(plainUser)))
                .rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            expect(mocks.listObjects).not.toHaveBeenCalled();
            expect(accountLoads).toHaveLength(0);
        });

        it('ListStorageObjects lists a read-only account (CanRead suffices)', async () => {
            await resolver.ListStorageObjects({ AccountID: ACCOUNT_READONLY, Prefix: '' }, contextFor(plainUser));
            expect(mocks.listObjects).toHaveBeenCalledTimes(1);
        });
    });

    describe('CopyObjectBetweenAccounts', () => {
        it('needs Read on the source and Write on the destination', async () => {
            const call = (src: string, dst: string) => resolver.CopyObjectBetweenAccounts(
                { SourceAccountID: src, DestinationAccountID: dst, SourcePath: 'a', DestinationPath: 'b' }, contextFor(plainUser));
            await expect(call(ACCOUNT_READONLY, ACCOUNT_READONLY)).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            await expect(call(ACCOUNT_FINANCE, ACCOUNT_OPEN)).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            expect(mocks.copyObjectBetweenProviders).not.toHaveBeenCalled();

            await call(ACCOUNT_READONLY, ACCOUNT_OPEN);
            expect(mocks.copyObjectBetweenProviders).toHaveBeenCalledTimes(1);
        });
    });

    describe('UploadStorageFile', () => {
        it('refuses an account the caller may not write to, without consuming the staged upload', async () => {
            const result = await resolver.UploadStorageFile({ AccountID: ACCOUNT_READONLY, UploadToken: 'tok' }, contextFor(plainUser));
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            expect(mocks.consumeUploadToken).not.toHaveBeenCalled();
            expect(mocks.engine.UploadFile).not.toHaveBeenCalled();
        });

        it('gates the engine\'s default account when none is requested, and uploads to exactly that account', async () => {
            mocks.engine.ResolveStorageAccount.mockReturnValue({ account: accountEntity(ACCOUNT_OPEN), provider: {} });
            mocks.engine.UploadFile.mockResolvedValue({ FileID: FILE_MINE });
            const result = await resolver.UploadStorageFile({ Base64Data: 'aGk=', FileName: 'hi.txt' }, contextFor(plainUser));
            expect(result.Success).toBe(true);
            expect(mocks.engine.UploadFile.mock.calls[0][0].storageAccountId).toBe(ACCOUNT_OPEN);
        });
    });

    describe('SearchAcrossAccounts', () => {
        beforeEach(() => {
            mocks.searchAcrossAccounts.mockImplementation(async (accounts: Array<{ accountEntity: { ID: string; Name: string } }>) => ({
                accountResults: accounts.map(a => ({
                    accountID: a.accountEntity.ID, accountName: a.accountEntity.Name, providerID: PROVIDER_S3, providerName: 'AWS S3 Storage',
                    success: true, hasMore: false,
                    results: ['hr/secret.pdf', 'me/mine.pdf', 'open/notes.md'].map(path => ({
                        path, name: path, size: 1, contentType: 'text/plain', lastModified: new Date(0),
                    })),
                })),
                totalResultsReturned: accounts.length * 3, successfulAccounts: accounts.length, failedAccounts: 0,
            }));
        });

        it('drops denied (and unknown) accounts before any driver call, reporting them as failed with "access denied"', async () => {
            const payload = await resolver.SearchAcrossAccounts(
                { AccountIDs: [ACCOUNT_OPEN, ACCOUNT_FINANCE, ACCOUNT_MISSING], Query: 'q' }, contextFor(plainUser));

            const searched = mocks.searchAcrossAccounts.mock.calls[0][0] as Array<{ accountEntity: { ID: string } }>;
            expect(searched.map(a => a.accountEntity.ID)).toEqual([ACCOUNT_OPEN]);

            const refused = payload.accountResults.filter(r => !r.success);
            expect(refused.map(r => r.accountID).sort()).toEqual([ACCOUNT_FINANCE, ACCOUNT_MISSING].sort());
            expect(refused.every(r => /access denied/i.test(r.errorMessage ?? '') && r.accountName === '')).toBe(true);
            expect(payload.failedAccounts).toBe(2);
            expect(payload.successfulAccounts).toBe(1);
        });

        it('drops hits that map to an MJ: Files row the caller cannot read, and recomputes the total', async () => {
            const payload = await resolver.SearchAcrossAccounts({ AccountIDs: [ACCOUNT_OPEN], Query: 'q' }, contextFor(plainUser));
            const paths = payload.accountResults[0].results.map(r => r.path);
            expect(paths).toEqual(['me/mine.pdf', 'open/notes.md']);
            expect(payload.totalResultsReturned).toBe(2);
        });

        it('searches nothing and reports every account refused when none is readable', async () => {
            const payload = await resolver.SearchAcrossAccounts({ AccountIDs: [ACCOUNT_FINANCE], Query: 'q' }, contextFor(plainUser));
            expect(mocks.searchAcrossAccounts).not.toHaveBeenCalled();
            expect(payload.failedAccounts).toBe(1);
            expect(payload.totalResultsReturned).toBe(0);
        });
    });
});
