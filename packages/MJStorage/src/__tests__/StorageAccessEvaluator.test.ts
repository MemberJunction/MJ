/**
 * Unit tests for StorageAccessEvaluator — the one place storage-account permissions (and tracked-file read access)
 * are decided.
 *
 * The evaluator's real code runs here; only the data layer is faked. The fake metadata provider stands in for the
 * database behind `RunView`/`RunViews` (it filters its in-memory rows by the IDs that appear in each ExtraFilter), and
 * `WellKnownUserSource.GetSystemUser` is stubbed to hand back a system user — or none — so the tests can prove the
 * permission rows are read with the elevated identity and the decision is made for the caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WellKnownUserSource, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import {
    StorageAccessEvaluator,
    StorageAccountAccessDeniedError,
    StorageAccountPermissionRow,
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE,
    TRACKED_FILE_ACCESS_DENIED_MESSAGE,
    TrackedFileAccessDeniedError
} from '../StorageAccessEvaluator';
import { AWSFileStorage } from '../drivers/AWSFileStorage';

const ACCOUNT_A = 'AAAAAAAA-0000-4000-8000-00000000000A';
const ACCOUNT_B = 'BBBBBBBB-0000-4000-8000-00000000000B';
const ACCOUNT_MISSING = 'CCCCCCCC-0000-4000-8000-00000000000C';
const ROLE_FINANCE = 'DDDDDDDD-0000-4000-8000-00000000000D';
const ROLE_OTHER = 'EEEEEEEE-0000-4000-8000-00000000000E';
const PROVIDER_S3 = 'FFFFFFFF-0000-4000-8000-00000000000F';

/** A plain-data user — the evaluator reads only ID and UserRoles. */
function makeUser(id: string, roleIDs: string[]): UserInfo {
    return { ID: id, Name: id, UserRoles: roleIDs.map(RoleID => ({ RoleID })) } as unknown as UserInfo;
}

const alice = makeUser('11111111-0000-4000-8000-000000000001', [ROLE_FINANCE]);
const bob = makeUser('22222222-0000-4000-8000-000000000002', []);
const systemUser = makeUser('33333333-0000-4000-8000-000000000003', []);

interface FakeFile {
    ID: string;
    Name: string;
    ProviderKey: string | null;
    ProviderID: string;
}

/** The in-memory "database" behind the fake provider. Tests mutate it between calls. */
interface FakeDb {
    Accounts: string[];
    Permissions: StorageAccountPermissionRow[];
    Files: FakeFile[];
    /** File IDs each user (by ID) may read through RunView. */
    ReadableFiles: Record<string, string[]>;
    FailPermissionRead: boolean;
    FailFileRead: boolean;
    /**
     * The entity's default row cap, applied to any view that does not set `IgnoreMaxRows` (MJ applies the entity's
     * `UserViewMaxRows`, 1,000 by default). Undefined means no cap.
     */
    DefaultMaxRows?: number;
}

interface ViewCall {
    Params: RunViewParams;
    User: UserInfo | undefined;
}

function perm(accountID: string, row: Partial<StorageAccountPermissionRow>): StorageAccountPermissionRow {
    return { FileStorageAccountID: accountID, Type: 'Role', UserID: null, RoleID: null, CanRead: true, CanWrite: false, ...row };
}

/** True when the ExtraFilter names `value` (the fake's stand-in for SQL `IN (...)`). */
function filterNames(params: RunViewParams, value: string): boolean {
    return (params.ExtraFilter ?? '').toLowerCase().includes(value.toLowerCase());
}

function runFakeView(db: FakeDb, params: RunViewParams, user: UserInfo | undefined): RunViewResult<object> {
    const cap = params.IgnoreMaxRows ? undefined : db.DefaultMaxRows;
    const ok = (Results: object[]): RunViewResult<object> =>
        ({ Success: true, Results: cap === undefined ? Results : Results.slice(0, cap) } as RunViewResult<object>);
    const fail: RunViewResult<object> = { Success: false, Results: [], ErrorMessage: 'simulated failure' } as RunViewResult<object>;
    switch (params.EntityName) {
        case 'MJ: File Storage Accounts':
            return db.FailPermissionRead ? fail : ok(db.Accounts.filter(id => filterNames(params, id)).map(ID => ({ ID })));
        case 'MJ: File Storage Account Permissions':
            return db.FailPermissionRead ? fail : ok(db.Permissions.filter(p => filterNames(params, p.FileStorageAccountID)));
        case 'MJ: Files':
            return runFakeFilesView(db, params, user, ok, fail);
        default:
            return fail;
    }
}

function runFakeFilesView(
    db: FakeDb,
    params: RunViewParams,
    user: UserInfo | undefined,
    ok: (rows: object[]) => RunViewResult<object>,
    fail: RunViewResult<object>
): RunViewResult<object> {
    if (db.FailFileRead) return fail;
    if (user && user.ID === systemUser.ID) {
        // The tracked-file mapping: rows on the provider whose key (ProviderKey ?? Name) is named in the filter.
        return ok(db.Files.filter(f => filterNames(params, f.ProviderID) && filterNames(params, `'${f.ProviderKey ?? f.Name}'`)));
    }
    const readable = new Set(db.ReadableFiles[user?.ID ?? ''] ?? []);
    return ok(db.Files.filter(f => filterNames(params, f.ID) && readable.has(f.ID)).map(f => ({ ID: f.ID })));
}

function makeProvider(db: FakeDb, calls: ViewCall[]): IMetadataProvider {
    const provider = {
        RunView: vi.fn(async (params: RunViewParams, user?: UserInfo) => {
            calls.push({ Params: params, User: user });
            return runFakeView(db, params, user);
        }),
        RunViews: vi.fn(async (params: RunViewParams[], user?: UserInfo) => {
            params.forEach(p => calls.push({ Params: p, User: user }));
            return params.map(p => runFakeView(db, p, user));
        }),
    };
    return provider as unknown as IMetadataProvider;
}

describe('StorageAccessEvaluator', () => {
    const evaluator = StorageAccessEvaluator.Instance;
    let db: FakeDb;
    let calls: ViewCall[];
    let provider: IMetadataProvider;
    let systemUserSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        db = { Accounts: [ACCOUNT_A, ACCOUNT_B], Permissions: [], Files: [], ReadableFiles: {}, FailPermissionRead: false, FailFileRead: false };
        calls = [];
        provider = makeProvider(db, calls);
        systemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
    });

    afterEach(() => {
        systemUserSpy.mockRestore();
    });

    describe('the zero-rows rule (current product rule — pinned)', () => {
        it('an account with no permission rows is open to every user, for Read and Write', async () => {
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(true);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Write', provider)).toBe(true);
        });

        it('GrantsAccess on an empty row list is open', () => {
            expect(evaluator.GrantsAccess([], bob, 'Read')).toBe(true);
            expect(evaluator.GrantsAccess([], bob, 'Write')).toBe(true);
        });
    });

    describe('the decision for an account with rows', () => {
        it('an Everyone row with CanRead grants Read to anyone, but not Write without CanWrite', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Everyone', CanRead: true, CanWrite: false })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(true);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Write', provider)).toBe(false);
        });

        it('a Role row grants only users holding that role', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE.toLowerCase() })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(true);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);
        });

        it('a Role row for a role the user does not hold does not grant', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_OTHER })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(false);
        });

        it('a User row grants only the named user', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'User', UserID: bob.ID.toLowerCase() })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(true);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(false);
        });

        it('a row with CanRead=false grants no Read — and, existing, the account is no longer open', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Everyone', CanRead: false, CanWrite: false })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(false);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Write', provider)).toBe(false);
        });

        it('Write is decided by CanWrite, independently of CanRead', async () => {
            db.Permissions = [
                perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE, CanRead: true, CanWrite: true }),
                perm(ACCOUNT_B, { Type: 'Role', RoleID: ROLE_FINANCE, CanRead: true, CanWrite: false }),
            ];
            const writable = await evaluator.AccessibleAccountIDs([ACCOUNT_A, ACCOUNT_B], alice, 'Write', provider);
            expect([...writable]).toEqual([ACCOUNT_A.toLowerCase()]);
        });

        it('an unknown row Type grants nothing', () => {
            const odd = { ...perm(ACCOUNT_A, {}), Type: 'Partner' } as unknown as StorageAccountPermissionRow;
            expect(evaluator.GrantsAccess([odd], alice, 'Read')).toBe(false);
        });
    });

    describe('fail closed', () => {
        it('an account that does not exist is refused, even though it has no permission rows', async () => {
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_MISSING, alice, 'Read', provider)).toBe(false);
        });

        it('a failed permission read denies everything — including accounts that would be open', async () => {
            db.FailPermissionRead = true;
            const allowed = await evaluator.AccessibleAccountIDs([ACCOUNT_A, ACCOUNT_B], alice, 'Read', provider);
            expect(allowed.size).toBe(0);
        });

        it('a throwing permission read denies everything', async () => {
            const throwing = {
                RunViews: vi.fn(async () => { throw new Error('connection reset'); }),
            } as unknown as IMetadataProvider;
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', throwing)).toBe(false);
        });

        it('with no elevated reader it denies, and never falls back to reading as the caller', async () => {
            systemUserSpy.mockResolvedValue(null);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(false);
            expect(calls).toHaveLength(0);
        });

        it('a user that cannot be evaluated (no UserRoles, or missing) is denied', async () => {
            const unhydrated = { ID: alice.ID } as unknown as UserInfo;
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, unhydrated, 'Read', provider)).toBe(false);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, null as unknown as UserInfo, 'Read', provider)).toBe(false);
            expect(evaluator.GrantsAccess([], unhydrated, 'Read')).toBe(false);
        });

        it('IDs that are not UUIDs are never put into SQL and are simply not granted', async () => {
            const hostile = `x' OR 1=1 --`;
            const allowed = await evaluator.AccessibleAccountIDs([hostile, ACCOUNT_A], alice, 'Read', provider);
            expect([...allowed]).toEqual([ACCOUNT_A.toLowerCase()]);
            expect(calls.every(c => !(c.Params.ExtraFilter ?? '').includes('OR 1=1'))).toBe(true);
        });
    });

    describe('evaluated per call — no snapshot', () => {
        it('reads the permission rows as the system user, and decides for the caller', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);
            expect(calls.length).toBeGreaterThan(0);
            expect(calls.every(c => c.User === systemUser)).toBe(true);
        });

        it('user A first, then user B: B gets B\'s own answer (and the reverse order agrees)', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(true);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, alice, 'Read', provider)).toBe(true);
        });

        it('a grant added between two calls is seen on the second, and a revocation on the third', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);

            db.Permissions.push(perm(ACCOUNT_A, { Type: 'User', UserID: bob.ID }));
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(true);

            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_A, bob, 'Read', provider)).toBe(false);
        });

        it('restricting a previously open account takes effect on the next call', async () => {
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_B, bob, 'Read', provider)).toBe(true);
            db.Permissions = [perm(ACCOUNT_B, { Type: 'Role', RoleID: ROLE_FINANCE })];
            expect(await evaluator.UserCanAccessAccount(ACCOUNT_B, bob, 'Read', provider)).toBe(false);
        });
    });

    describe('AssertAccountAccess', () => {
        it('throws the access-denied error, worded the same for a restricted and a missing account', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            const restricted = evaluator.AssertAccountAccess(ACCOUNT_A, bob, 'Read', provider);
            await expect(restricted).rejects.toBeInstanceOf(StorageAccountAccessDeniedError);
            await expect(evaluator.AssertAccountAccess(ACCOUNT_A, bob, 'Read', provider)).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
            await expect(evaluator.AssertAccountAccess(ACCOUNT_MISSING, bob, 'Read', provider)).rejects.toThrow(STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE);
        });

        it('resolves for a permitted user', async () => {
            db.Permissions = [perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })];
            await expect(evaluator.AssertAccountAccess(ACCOUNT_A, alice, 'Read', provider)).resolves.toBeUndefined();
        });
    });

    describe('UnreadableTrackedObjectKeys', () => {
        beforeEach(() => {
            db.Files = [
                { ID: 'F0000000-0000-4000-8000-000000000001', Name: 'secret.pdf', ProviderKey: 'hr/secret.pdf', ProviderID: PROVIDER_S3 },
                { ID: 'F0000000-0000-4000-8000-000000000002', Name: 'mine.pdf', ProviderKey: 'me/mine.pdf', ProviderID: PROVIDER_S3 },
                { ID: 'F0000000-0000-4000-8000-000000000003', Name: 'legacy.txt', ProviderKey: null, ProviderID: PROVIDER_S3 },
            ];
            db.ReadableFiles = { [bob.ID]: ['F0000000-0000-4000-8000-000000000002'] };
        });

        it('returns only tracked keys behind rows the user cannot read; untracked keys are left to the account gate', async () => {
            const keys = ['hr/secret.pdf', 'me/mine.pdf', 'untracked/notes.md', 'legacy.txt'];
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, keys, bob, provider);
            expect([...unreadable].sort()).toEqual(['hr/secret.pdf', 'legacy.txt']);
        });

        it('maps with the system user, and asks about readability as the user', async () => {
            await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['hr/secret.pdf'], bob, provider);
            const fileCalls = calls.filter(c => c.Params.EntityName === 'MJ: Files');
            expect(fileCalls.map(c => c.User)).toEqual([systemUser, bob]);
        });

        it('returns nothing when no key is tracked (and never asks as the user)', async () => {
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['nobody/tracks/this'], bob, provider);
            expect(unreadable.size).toBe(0);
            expect(calls.filter(c => c.User === bob)).toHaveLength(0);
        });

        it('fails closed: a failed mapping read returns every key', async () => {
            db.FailFileRead = true;
            const keys = ['me/mine.pdf', 'untracked/notes.md'];
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, keys, bob, provider);
            expect([...unreadable].sort()).toEqual(keys.sort());
        });

        it('fails closed: no elevated reader returns every key', async () => {
            systemUserSpy.mockResolvedValue(null);
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['me/mine.pdf'], bob, provider);
            expect([...unreadable]).toEqual(['me/mine.pdf']);
        });

        it('matches a tracked key however the client spells it: leading or trailing slash, repeated slashes, other case', async () => {
            const spellings = ['/hr/secret.pdf', 'hr/secret.pdf/', '//hr//secret.pdf', 'HR/Secret.PDF', '  hr/secret.pdf '];
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, spellings, bob, provider);
            expect([...unreadable].sort()).toEqual([...spellings].sort());
        });

        it('matches a row stored with a leading slash or in another case against the bare client key', async () => {
            db.Files.push({ ID: 'F0000000-0000-4000-8000-000000000004', Name: 'q3.xlsx', ProviderKey: '/Finance/Q3.xlsx', ProviderID: PROVIDER_S3 });
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['finance/q3.xlsx'], bob, provider);
            expect([...unreadable]).toEqual(['finance/q3.xlsx']);
        });

        it('canonicalizes through the account\'s driver: S3\'s prefixed spelling is the tracked object', async () => {
            const previousPrefix = process.env.STORAGE_AWS_KEY_PREFIX;
            Object.assign(process.env, {
                STORAGE_AWS_REGION: 'us-east-1', STORAGE_AWS_BUCKET_NAME: 'unit-test-bucket',
                STORAGE_AWS_ACCESS_KEY_ID: 'AKIA_TEST', STORAGE_AWS_SECRET_ACCESS_KEY: 'secret_test', STORAGE_AWS_KEY_PREFIX: 'tenant1/'
            });
            try {
                const s3 = new AWSFileStorage();
                const viaDriver = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['tenant1/hr/secret.pdf'], bob, provider, s3);
                expect([...viaDriver]).toEqual(['tenant1/hr/secret.pdf']);
                // The default canonicalizer cannot know the prefix — which is why callers pass the driver.
                const viaDefault = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['tenant1/hr/secret.pdf'], bob, provider);
                expect(viaDefault.size).toBe(0);
                s3.Dispose();
            } finally {
                process.env.STORAGE_AWS_KEY_PREFIX = previousPrefix;
            }
        });

        it('refuses keys whose meaning depends on the provider — without comparing them', async () => {
            const hostile = ['hr/../hr/secret.pdf', 'hr\\secret.pdf', 'hr%2Fsecret.pdf', 'hr/%2e%2e/secret.pdf', './hr/secret.pdf', 'hr/secret.pdf\u0000'];
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, hostile, bob, provider);
            expect([...unreadable].sort()).toEqual([...hostile].sort());
            expect(calls).toHaveLength(0);
        });

        it('lets an ordinary literal percent sign through as an untracked key', async () => {
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['offers/50% off.pdf', 'a%20b.txt'], bob, provider);
            expect(unreadable.size).toBe(0);
        });

        it('AssertTrackedObjectsReadable throws the tracked-file refusal, and resolves for readable or untracked keys', async () => {
            const refusal = evaluator.AssertTrackedObjectsReadable(PROVIDER_S3, ['me/mine.pdf', '/HR/secret.pdf'], bob, provider);
            await expect(refusal).rejects.toBeInstanceOf(TrackedFileAccessDeniedError);
            await expect(evaluator.AssertTrackedObjectsReadable(PROVIDER_S3, ['hr/secret.pdf'], bob, provider))
                .rejects.toThrow(TRACKED_FILE_ACCESS_DENIED_MESSAGE);
            await expect(evaluator.AssertTrackedObjectsReadable(PROVIDER_S3, ['me/mine.pdf', 'untracked.txt'], bob, provider))
                .resolves.toBeUndefined();
        });
    });

    describe('reads are never truncated by the entity row cap', () => {
        it('an account whose permission rows fall past the cap is still restricted (not "zero rows → open")', async () => {
            db.DefaultMaxRows = 1;
            db.Permissions = [
                perm(ACCOUNT_B, { Type: 'Everyone', CanRead: true }),
                perm(ACCOUNT_A, { Type: 'Role', RoleID: ROLE_FINANCE })
            ];
            const readable = await evaluator.AccessibleAccountIDs([ACCOUNT_A, ACCOUNT_B], bob, 'Read', provider);
            expect([...readable]).toEqual([ACCOUNT_B.toLowerCase()]);
        });

        it('a tracked key whose row falls past the cap is still tracked', async () => {
            db.DefaultMaxRows = 1;
            db.Files = [
                { ID: 'F0000000-0000-4000-8000-000000000011', Name: 'a.pdf', ProviderKey: 'hr/a.pdf', ProviderID: PROVIDER_S3 },
                { ID: 'F0000000-0000-4000-8000-000000000012', Name: 'b.pdf', ProviderKey: 'hr/b.pdf', ProviderID: PROVIDER_S3 },
            ];
            const unreadable = await evaluator.UnreadableTrackedObjectKeys(PROVIDER_S3, ['hr/a.pdf', 'hr/b.pdf'], bob, provider);
            expect([...unreadable].sort()).toEqual(['hr/a.pdf', 'hr/b.pdf']);
        });
    });
});
