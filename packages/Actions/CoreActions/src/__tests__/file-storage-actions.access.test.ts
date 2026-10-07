/**
 * The storage gate on the agent File Storage actions and BaseFileHandlerAction.
 *
 * These actions are reachable by any user (the GraphQL `RunAction` resolver) and by any agent, and they name the account
 * by a caller-supplied name. They used to resolve that name and build a driver with no permission check. Now every one
 * asks the REAL `StorageAccessEvaluator` (from `@memberjunction/storage`) for its declared access before a driver is
 * built, and applies the tracked-file rule to the objects it reads, signs, overwrites, moves or deletes. Only the data
 * layer behind the evaluator (the global provider's RunView/RunViews and the system-user lookup), the storage engine's
 * cache and the driver are faked — so "refused", "zero rows → open" and "tracked object" are decided by production code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: object): Promise<object | null> { return null; }
    }
}));
vi.mock('@memberjunction/actions-base', () => ({}));

const mocks = vi.hoisted(() => ({
    engine: {
        Config: vi.fn(async () => undefined),
        GetAccountByName: vi.fn(),
        GetProviderById: vi.fn(),
        GetDriver: vi.fn(),
        AccountsWithProviders: [] as object[],
        ResolveStorageAccount: vi.fn(),
        ResolveFileObject: vi.fn(),
        UploadFile: vi.fn(),
    },
}));

vi.mock('@memberjunction/storage', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/storage')>('@memberjunction/storage');
    return { ...actual, FileStorageEngine: { Instance: mocks.engine } };
});

import { Metadata, RunView, WellKnownUserSource } from '@memberjunction/core';
import type { IMetadataProvider, IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
    NormalizeStorageObjectKey,
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE,
    TRACKED_FILE_ACCESS_DENIED_MESSAGE,
    TrackedFileAccessDeniedError,
    type StorageAccountPermissionRow
} from '@memberjunction/storage';
import { GetDownloadUrlAction } from '../custom/files/get-download-url.action';
import { GetObjectAction } from '../custom/files/get-object.action';
import { GetUploadUrlAction } from '../custom/files/get-upload-url.action';
import { CopyObjectAction } from '../custom/files/copy-object.action';
import { MoveObjectAction } from '../custom/files/move-object.action';
import { DeleteObjectAction } from '../custom/files/delete-object.action';
import { CreateDirectoryAction } from '../custom/files/create-directory.action';
import { ListObjectsAction } from '../custom/files/list-objects.action';
import { SearchStorageFilesAction } from '../custom/files/search-storage-files.action';
import { ListStorageAccountsAction } from '../custom/files/list-storage-providers.action';
import { STORAGE_ACCESS_DENIED_RESULT_CODE } from '../custom/files/base-file-storage.action';
import { BaseFileHandlerAction } from '../custom/utilities/base-file-handler';

const PROVIDER_S3 = 'AAAAAAAA-0000-4000-8000-000000000001';
const ACCOUNT_OPEN = 'BBBBBBBB-0000-4000-8000-000000000002';      // no permission rows → open (current rule)
const ACCOUNT_FINANCE = 'CCCCCCCC-0000-4000-8000-000000000003';   // Read+Write for the Finance role only
const ACCOUNT_READONLY = 'DDDDDDDD-0000-4000-8000-000000000004';  // Read (no Write) for Everyone
const ROLE_FINANCE = 'FFFFFFFF-0000-4000-8000-000000000006';
const FILE_SECRET = '99999999-0000-4000-8000-000000000007';
const FILE_MINE = '88888888-0000-4000-8000-000000000008';

function makeUser(id: string, roleIDs: string[]): UserInfo {
    return { ID: id, Name: id, UserRoles: roleIDs.map(RoleID => ({ RoleID })) } as unknown as UserInfo;
}
const plainUser = makeUser('11111111-0000-4000-8000-000000000001', []);
const financeUser = makeUser('22222222-0000-4000-8000-000000000002', [ROLE_FINANCE]);
const systemUser = makeUser('33333333-0000-4000-8000-000000000003', []);

const ACCOUNTS: Record<string, string> = { Open: ACCOUNT_OPEN, Finance: ACCOUNT_FINANCE, ReadOnly: ACCOUNT_READONLY };
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

/** The fake database behind the evaluator and the file handler's RunView. */
function answerView(params: RunViewParams, user: UserInfo | undefined): RunViewResult<object> {
    const ok = (Results: object[]) => ({ Success: true, Results } as RunViewResult<object>);
    const accountIDs = Object.values(ACCOUNTS);
    switch (params.EntityName) {
        case 'MJ: File Storage Accounts':
            return ok(accountIDs.filter(id => namedIn(params, id)).map(ID => ({ ID })));
        case 'MJ: File Storage Account Permissions':
            return ok(PERMISSIONS.filter(p => namedIn(params, p.FileStorageAccountID)));
        case 'MJ: Files':
            if (user?.ID === systemUser.ID) {
                return ok(FILES.filter(f => namedIn(params, f.ProviderID) && namedIn(params, `'${f.ProviderKey}'`)));
            }
            return ok(FILES.filter(f => namedIn(params, f.ID) && (READABLE_FILES[user?.ID ?? ''] ?? []).includes(f.ID)));
        default:
            return { Success: false, Results: [], ErrorMessage: 'unknown entity' } as RunViewResult<object>;
    }
}

const fakeProvider = {
    RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => answerView(params, user)),
    RunViews: vi.fn(async (params: RunViewParams[], user?: UserInfo) => params.map(p => answerView(p, user))),
};

const fakeDriver = {
    NormalizeObjectKey: (key: string) => NormalizeStorageObjectKey(key),
    CreatePreAuthDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
    CreatePreAuthUploadUrl: vi.fn(async (key: string) => ({ UploadUrl: `https://upload.example/${key}` })),
    GetObject: vi.fn(async () => Buffer.from('bytes')),
    CopyObject: vi.fn(async () => true),
    MoveObject: vi.fn(async () => true),
    DeleteObject: vi.fn(async () => true),
    CreateDirectory: vi.fn(async () => true),
    ListObjects: vi.fn(async () => ({
        objects: [
            { name: 'secret.pdf', path: 'hr', fullPath: 'hr/secret.pdf', isDirectory: false },
            { name: 'notes.md', path: 'hr', fullPath: 'hr/notes.md', isDirectory: false },
            { name: 'sub', path: 'hr', fullPath: 'hr/sub/', isDirectory: true },
        ],
        prefixes: ['hr/sub/'],
    })),
    SearchFiles: vi.fn(async () => ({
        results: ['hr/secret.pdf', 'me/mine.pdf', 'open/notes.md'].map(path => ({
            path, name: path, size: 1, contentType: 'text/plain', lastModified: new Date(0),
        })),
        totalMatches: 3,
        hasMore: false,
    })),
};

function accountEntity(name: string): object | undefined {
    const id = ACCOUNTS[name];
    return id ? { ID: id, Name: name, ProviderID: PROVIDER_S3 } : undefined;
}

function paramsFor(user: UserInfo, inputs: Record<string, string>): RunActionParams {
    const Params: ActionParam[] = Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value }));
    return { ContextUser: user, Params } as unknown as RunActionParams;
}

/** Runs an action's protected InternalRunAction (the decorators and engine plumbing are not under test). */
async function run(action: object, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }).InternalRunAction(params);
}

/** An output parameter, from the params the action pushed into or the `Params` its result carries. */
function outputOf(params: RunActionParams, name: string, result?: ActionResultSimple): ActionParam['Value'] {
    const all = [...params.Params, ...(result?.Params ?? [])];
    return all.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

function expectAccountRefusal(result: ActionResultSimple): void {
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe(STORAGE_ACCESS_DENIED_RESULT_CODE);
    expect(result.Message).toBe(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
}

function expectTrackedRefusal(result: ActionResultSimple): void {
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe(STORAGE_ACCESS_DENIED_RESULT_CODE);
    expect(result.Message).toBe(TRACKED_FILE_ACCESS_DENIED_MESSAGE);
}

describe('File Storage actions — the storage gate', () => {
    let previousMetadataProvider: IMetadataProvider;
    let previousRunViewProvider: IRunViewProvider;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        previousMetadataProvider = Metadata.Provider;
        previousRunViewProvider = RunView.Provider;
        Metadata.Provider = fakeProvider as unknown as IMetadataProvider;
        RunView.Provider = fakeProvider as unknown as IRunViewProvider;
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        mocks.engine.GetAccountByName.mockImplementation((name: string) => accountEntity(name));
        mocks.engine.GetProviderById.mockReturnValue({ ID: PROVIDER_S3, Name: 'AWS S3 Storage' });
        mocks.engine.GetDriver.mockResolvedValue(fakeDriver);
        mocks.engine.AccountsWithProviders = Object.keys(ACCOUNTS).map(name => ({
            account: { ...accountEntity(name), Description: '', CredentialID: null },
            provider: { ID: PROVIDER_S3, Name: 'AWS S3 Storage', ServerDriverKey: 'AWS S3 Storage', IsActive: true, SupportsSearch: false },
        }));
    });

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        RunView.Provider = previousRunViewProvider;
        systemUserSpy.mockRestore();
    });

    describe('the account gate (Read actions)', () => {
        it('refuses an account restricted to a role the caller lacks, before any driver is built', async () => {
            const result = await run(new GetDownloadUrlAction(), paramsFor(plainUser, { StorageAccount: 'Finance', ObjectName: 'q3.pdf' }));
            expectAccountRefusal(result);
            expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
        });

        it('refuses an unknown account name with the SAME result (existence is not revealed)', async () => {
            const result = await run(new GetDownloadUrlAction(), paramsFor(financeUser, { StorageAccount: 'Nope', ObjectName: 'q3.pdf' }));
            expectAccountRefusal(result);
            expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
        });

        it('lets the permitted role through, and a zero-row account is open (current rule)', async () => {
            const finance = await run(new GetDownloadUrlAction(), paramsFor(financeUser, { StorageAccount: 'Finance', ObjectName: 'q3.pdf' }));
            expect(finance.Success).toBe(true);
            const open = await run(new GetDownloadUrlAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'public/a.pdf' }));
            expect(open.Success).toBe(true);
        });
    });

    describe('the tracked-file rule on content and URLs', () => {
        it('GetDownloadUrl refuses an object behind an unreadable MJ: Files row, however it is spelled — and signs nothing', async () => {
            for (const spelling of ['hr/secret.pdf', '/hr/secret.pdf', 'HR/Secret.pdf/']) {
                const result = await run(new GetDownloadUrlAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: spelling }));
                expectTrackedRefusal(result);
            }
            expect(fakeDriver.CreatePreAuthDownloadUrl).not.toHaveBeenCalled();
        });

        it('GetObject refuses the bytes of a tracked object the caller cannot read, and returns a readable one', async () => {
            expectTrackedRefusal(await run(new GetObjectAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'hr/secret.pdf' })));
            expect(fakeDriver.GetObject).not.toHaveBeenCalled();
            const mine = await run(new GetObjectAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'me/mine.pdf' }));
            expect(mine.Success).toBe(true);
        });
    });

    describe('listing and search never name a tracked object the caller cannot read', () => {
        it('ListObjects drops the tracked object and keeps the rest (directories included)', async () => {
            const params = paramsFor(plainUser, { StorageAccount: 'Open', Path: 'hr/' });
            const result = await run(new ListObjectsAction(), params);
            expect(result.Success).toBe(true);
            const objects = outputOf(params, 'Objects') as Array<{ fullPath: string }>;
            expect(objects.map(o => o.fullPath)).toEqual(['hr/notes.md', 'hr/sub/']);
        });

        it('SearchStorageFiles drops the tracked hit and withholds the provider total that counted it', async () => {
            const params = paramsFor(plainUser, { StorageAccount: 'Open', Query: 'q' });
            const result = await run(new SearchStorageFilesAction(), params);
            expect(result.Success).toBe(true);
            const hits = outputOf(params, 'SearchResults', result) as Array<{ Path: string }>;
            expect(hits.map(h => h.Path)).toEqual(['me/mine.pdf', 'open/notes.md']);
            expect(outputOf(params, 'ResultCount', result)).toBe(2);
            expect(outputOf(params, 'TotalMatches', result)).toBeUndefined();
        });

        it('List Storage Accounts lists only the accounts the caller may read', async () => {
            const namesFor = async (user: UserInfo): Promise<string[]> => {
                const params = paramsFor(user, {});
                const result = await run(new ListStorageAccountsAction(), params);
                return (outputOf(params, 'Accounts', result) as Array<{ Name: string }>).map(a => a.Name).sort();
            };
            expect(await namesFor(plainUser)).toEqual(['Open', 'ReadOnly']);
            expect(await namesFor(financeUser)).toEqual(['Finance', 'Open', 'ReadOnly']);
        });
    });

    describe('Write actions need CanWrite, and the tracked-file rule on what they replace or remove', () => {
        const writeCases: Array<[string, () => object, Record<string, string>]> = [
            ['GetUploadUrl', () => new GetUploadUrlAction(), { ObjectName: 'x.pdf' }],
            ['CopyObject', () => new CopyObjectAction(), { SourceObjectName: 'a', DestinationObjectName: 'b' }],
            ['MoveObject', () => new MoveObjectAction(), { SourceObjectName: 'a', DestinationObjectName: 'b' }],
            ['DeleteObject', () => new DeleteObjectAction(), { ObjectName: 'a' }],
            ['CreateDirectory', () => new CreateDirectoryAction(), { DirectoryPath: 'new/' }],
        ];
        for (const [name, make, inputs] of writeCases) {
            it(`${name} refuses a read-only (CanWrite=false) account before any driver is built`, async () => {
                const result = await run(make(), paramsFor(plainUser, { StorageAccount: 'ReadOnly', ...inputs }));
                expectAccountRefusal(result);
                expect(mocks.engine.GetDriver).not.toHaveBeenCalled();
            });
        }

        it('DeleteObject refuses a tracked object the caller cannot read, and deletes an untracked one', async () => {
            expectTrackedRefusal(await run(new DeleteObjectAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'hr/secret.pdf' })));
            expect(fakeDriver.DeleteObject).not.toHaveBeenCalled();
            const ok = await run(new DeleteObjectAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'scratch/tmp.txt' }));
            expect(ok.Success).toBe(true);
        });

        it('CopyObject refuses a tracked source (a copy would untrack it), MoveObject a tracked destination', async () => {
            const copy = { StorageAccount: 'Open', SourceObjectName: 'hr/secret.pdf', DestinationObjectName: 'mine/copy.pdf' };
            expectTrackedRefusal(await run(new CopyObjectAction(), paramsFor(plainUser, copy)));
            const move = { StorageAccount: 'Open', SourceObjectName: 'scratch/x.pdf', DestinationObjectName: 'hr/secret.pdf' };
            expectTrackedRefusal(await run(new MoveObjectAction(), paramsFor(plainUser, move)));
            expect(fakeDriver.CopyObject).not.toHaveBeenCalled();
            expect(fakeDriver.MoveObject).not.toHaveBeenCalled();
        });

        it('GetUploadUrl refuses to sign an upload over a tracked object the caller cannot read', async () => {
            expectTrackedRefusal(await run(new GetUploadUrlAction(), paramsFor(plainUser, { StorageAccount: 'Open', ObjectName: 'hr/secret.pdf' })));
            expect(fakeDriver.CreatePreAuthUploadUrl).not.toHaveBeenCalled();
        });

        it('the permitted role may write to its account', async () => {
            const result = await run(new DeleteObjectAction(), paramsFor(financeUser, { StorageAccount: 'Finance', ObjectName: 'q3.pdf' }));
            expect(result.Success).toBe(true);
        });
    });
});

/** Exposes BaseFileHandlerAction's protected entry points without weakening their types. */
class TestableFileHandler extends BaseFileHandlerAction {
    public Save(params: RunActionParams, accountName?: string) {
        return this.saveToMJStorage('hello', 'hello.txt', 'text/plain', params, accountName);
    }
    public Load(params: RunActionParams) {
        return this.getFileContent(params, 'Data');
    }
}

describe('BaseFileHandlerAction — storage reads and writes are gated for the caller', () => {
    let previousMetadataProvider: IMetadataProvider;
    let previousRunViewProvider: IRunViewProvider;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        previousMetadataProvider = Metadata.Provider;
        previousRunViewProvider = RunView.Provider;
        Metadata.Provider = fakeProvider as unknown as IMetadataProvider;
        RunView.Provider = fakeProvider as unknown as IRunViewProvider;
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        mocks.engine.GetAccountByName.mockImplementation((name: string) => accountEntity(name));
        mocks.engine.UploadFile.mockResolvedValue({ FileID: FILE_MINE });
    });

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        RunView.Provider = previousRunViewProvider;
        systemUserSpy.mockRestore();
    });

    it('refuses a save into an account the caller may not write to, before uploading', async () => {
        await expect(new TestableFileHandler().Save(paramsFor(plainUser, {}), 'ReadOnly')).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
        expect(mocks.engine.UploadFile).not.toHaveBeenCalled();
    });

    it('refuses an unknown account name with the same message', async () => {
        await expect(new TestableFileHandler().Save(paramsFor(plainUser, {}), 'Nope')).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
        expect(mocks.engine.UploadFile).not.toHaveBeenCalled();
    });

    it('gates the default account when none is named, and uploads to exactly that account', async () => {
        mocks.engine.ResolveStorageAccount.mockReturnValue({ account: accountEntity('ReadOnly') });
        await expect(new TestableFileHandler().Save(paramsFor(plainUser, {}))).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);

        mocks.engine.ResolveStorageAccount.mockReturnValue({ account: accountEntity('Open') });
        await expect(new TestableFileHandler().Save(paramsFor(plainUser, {}))).resolves.toBe(FILE_MINE);
        expect(mocks.engine.UploadFile.mock.calls[0][0].storageAccountId).toBe(ACCOUNT_OPEN);
    });

    it('reads a FileID through ResolveFileObject (the account gate + tracked-file rule) and surfaces its refusal', async () => {
        mocks.engine.ResolveFileObject.mockRejectedValue(new TrackedFileAccessDeniedError());
        await expect(new TestableFileHandler().Load(paramsFor(plainUser, { FileID: FILE_MINE }))).rejects.toThrow(TRACKED_FILE_ACCESS_DENIED_MESSAGE);
        expect(mocks.engine.ResolveFileObject).toHaveBeenCalledWith(expect.objectContaining({ ID: FILE_MINE }), plainUser, 'Read');
        expect(fakeDriver.GetObject).not.toHaveBeenCalled();
    });

    it('never puts a non-UUID FileID into SQL', async () => {
        await expect(new TestableFileHandler().Load(paramsFor(plainUser, { FileID: `x' OR 1=1 --` }))).rejects.toThrow('File not found');
        expect(fakeProvider.RunView).not.toHaveBeenCalled();
    });
});
