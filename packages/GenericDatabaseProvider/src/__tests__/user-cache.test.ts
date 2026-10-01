import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { DatabaseProviderBase } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------
// The canonical system-user ID lives in the server-side provider package, not core — the
// account is a server concept and has no place in a bundle a browser loads.
vi.mock('@memberjunction/generic-database-provider', () => ({
    SystemUserID: 'ecafccec-6a37-ef11-86d4-000d3a4e707e',
}));

/** Change callbacks the cache registers, so a test can deliver a shared-cache event to it. */
const cacheCallbacks = new Map<string, Set<(event: unknown) => void>>();

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogWarning: vi.fn(),
    LogStatusEx: vi.fn(),
    CacheCategory: { Default: 'default', RunViewCache: 'RunViewCache', Metadata: 'Metadata', DatasetCache: 'DatasetCache', RunQueryCache: 'RunQueryCache' },
    BaseEntity: { BaseEventCode: 'BaseEntity' },
    LocalCacheManager: {
        Instance: {
            RegisterChangeCallback(key: string, cb: (event: unknown) => void) {
                const set = cacheCallbacks.get(key) ?? new Set();
                set.add(cb);
                cacheCallbacks.set(key, set);
                return () => set.delete(cb);
            },
        },
    },
    UserInfo: class {
        ID: string;
        Name: string;
        constructor(_provider: unknown, data: Record<string, unknown>) {
            this.ID = data.ID as string;
            this.Name = data.Name as string;
            Object.assign(this, data);
        }
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
    };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { UserCache, USER_CACHE_STAMP_KEY } from '../UserCache';
import { BaseEntity, LogError, UserInfo } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

// ---------------------------------------------------------------------------
// Helper to reset singleton state between tests
// ---------------------------------------------------------------------------
function resetSingleton(): void {
    // BaseSingleton stores instances in the global object store keyed by class name
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__UserCache';
    if (g && g[key]) {
        delete g[key];
    }
}

// Helper to create mock UserInfo objects
function makeUser(id: string, name: string): UserInfo {
    return new (UserInfo as unknown as new (p: unknown, d: Record<string, unknown>) => UserInfo)(
        null,
        { ID: id, Name: name }
    );
}

/**
 * Minimal stand-in for a configured provider. `Refresh` only touches three members of
 * `DatabaseProviderBase` — `MJCoreSchemaName`, `QuoteSchemaAndView` and `ExecuteSQL` — so the stub
 * implements exactly those and records the SQL it was handed.
 */
interface ProviderStub {
    Provider: DatabaseProviderBase;
    /** The two `SELECT *` loads, without the staleness probe. */
    Queries: string[];
    /** Every statement, in order. */
    AllQueries: string[];
    ExecuteSQL: ReturnType<typeof vi.fn>;
    /** What the staleness probe reports; tests change it to simulate a change made elsewhere. */
    Stamp: { users: number; roles: number; updatedAt: string };
    /** Keys written to the shared store (the peer notice). */
    Written: Array<{ key: string; category?: string }>;
}

function makeProviderStub(
    rows: {
        users?: Record<string, unknown>[];
        roles?: Record<string, unknown>[];
        sharedStore?: boolean;
        entities?: Array<{ Name: string; SchemaName: string; BaseView: string }>;
        transactionDepth?: number;
    } = {}
): ProviderStub {
    const queries: string[] = [];
    const all: string[] = [];
    const stamp = { users: (rows.users ?? []).length, roles: (rows.roles ?? []).length, updatedAt: '2026-09-17T00:00:00.000Z' };
    const written: Array<{ key: string; category?: string }> = [];
    const executeSQL = vi.fn(async (query: string) => {
        all.push(query);
        if (query.includes('UNION ALL')) {
            return [
                { Scope: 'users', RowCount: stamp.users, MaxUpdatedAt: stamp.updatedAt },
                { Scope: 'roles', RowCount: stamp.roles, MaxUpdatedAt: stamp.updatedAt },
            ];
        }
        queries.push(query);
        if (query.includes('vwUserRoles')) return rows.roles ?? [];
        // A WHERE clause means the on-demand single-user read; match it against the known users.
        const users = rows.users ?? [];
        if (!query.includes('WHERE')) return users;
        const match = /'([^']*)'/.exec(query)?.[1] ?? '';
        return users.filter(u => String(u.ID).toLowerCase() === match || String(u.Email ?? '').toLowerCase() === match);
    });
    const stub = {
        MJCoreSchemaName: '__mj',
        // Saves raise their events inside the transaction that made them; the cache must wait for
        // it to settle before reloading (plan §16.3 #7).
        TransactionDepth: rows.transactionDepth ?? 0,
        // Metadata, when the host has loaded it: the views come from the entities, not from
        // hardcoded names. `entities` is empty by default, exercising the bootstrap fallback.
        Entities: rows.entities ?? [],
        EntityByName: (name: string) => (rows.entities ?? []).find(e => e.Name === name),
        QuoteSchemaAndView: (schema: string, view: string) => `[${schema}].[${view}]`,
        QuoteIdentifier: (name: string) => `[${name}]`,
        ExecuteSQL: executeSQL,
        LocalStorageProvider: {
            SharedAcrossProcesses: rows.sharedStore === true,
            SetItem: async (key: string, _value: unknown, category?: string) => { written.push({ key, category }); },
        },
    };
    return { Provider: stub as unknown as DatabaseProviderBase, Queries: queries, AllQueries: all, ExecuteSQL: executeSQL, Stamp: stamp, Written: written };
}

/** Raises the global save/delete event a BaseEntity raises, for `entityName`. */
function raiseEntityEvent(entityName: string, type: 'save' | 'delete' = 'save', writer?: unknown): void {
    MJGlobal.Instance.RaiseEvent({
        component: {}, event: MJEventType.ComponentEvent, eventCode: (BaseEntity as unknown as { BaseEventCode: string }).BaseEventCode,
        args: { type, baseEntity: { EntityInfo: { Name: entityName }, ProviderToUse: writer }, payload: null },
    });
}

/** Delivers a shared-cache event to the callback the cache registered. */
function deliverCacheEvent(event: { CacheKey: string; Category: string; Action: string }): void {
    for (const cb of cacheCallbacks.get(USER_CACHE_STAMP_KEY) ?? []) {
        cb(event);
    }
}

// =====================================================================
// Tests for UserCache
// =====================================================================
describe('UserCache', () => {
    beforeEach(() => {
        UserCache.Instance.Dispose();
        resetSingleton();
        cacheCallbacks.clear();
        vi.mocked(LogError).mockClear();
    });

    // -----------------------------------------------------------------
    // Singleton pattern
    // -----------------------------------------------------------------
    describe('singleton pattern', () => {
        it('should return the same instance when constructed multiple times', () => {
            const first = new UserCache();
            const second = new UserCache();
            expect(first).toBe(second);
        });

        it('should return the same instance from static Instance getter', () => {
            const instance = UserCache.Instance;
            expect(instance).toBeInstanceOf(UserCache);
            expect(UserCache.Instance).toBe(instance);
        });

        it('should store instance in global object store via BaseSingleton', () => {
            const instance = UserCache.Instance;
            const g = GetGlobalObjectStore()!;
            const key = '___SINGLETON__UserCache';
            expect(g[key]).toBe(instance);
        });

        it('should return existing instance from global store on subsequent construction', () => {
            const original = UserCache.Instance;
            // A new construction should return the same global-store-backed instance
            const second = UserCache.Instance;
            expect(second).toBe(original);
        });
    });

    // -----------------------------------------------------------------
    // SYSTEM_USER_ID
    // -----------------------------------------------------------------
    describe('SYSTEM_USER_ID', () => {
        it('should return the correct system user ID', () => {
            const instance = UserCache.Instance;
            expect(instance.SYSTEM_USER_ID).toBe('ecafccec-6a37-ef11-86d4-000d3a4e707e');
        });
    });

    // -----------------------------------------------------------------
    // GetSystemUser
    // -----------------------------------------------------------------
    describe('GetSystemUser', () => {
        it('should find the system user by ID', () => {
            const instance = UserCache.Instance;
            const systemUser = makeUser('ecafccec-6a37-ef11-86d4-000d3a4e707e', 'System');
            const otherUser = makeUser('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Other');
            (instance as unknown as Record<string, unknown>)._users = [otherUser, systemUser];

            const result = instance.GetSystemUser();
            expect(result).toBe(systemUser);
        });

        it('should find the system user with case-insensitive ID comparison', () => {
            const instance = UserCache.Instance;
            // Store the ID in uppercase
            const systemUser = makeUser('ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', 'System');
            (instance as unknown as Record<string, unknown>)._users = [systemUser];

            const result = instance.GetSystemUser();
            expect(result).toBe(systemUser);
        });

        it('should return undefined when system user is not in the cache', () => {
            const instance = UserCache.Instance;
            const otherUser = makeUser('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Other');
            (instance as unknown as Record<string, unknown>)._users = [otherUser];

            const result = instance.GetSystemUser();
            expect(result).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // Cold cache — a Refresh that never ran, or one that failed, must not throw
    // -----------------------------------------------------------------
    describe('cold cache', () => {
        it('should expose an empty Users array before any Refresh', () => {
            expect(UserCache.Instance.Users).toEqual([]);
        });

        it('should return undefined from GetSystemUser rather than throwing on a cold cache', () => {
            expect(() => UserCache.Instance.GetSystemUser()).not.toThrow();
            expect(UserCache.Instance.GetSystemUser()).toBeUndefined();
        });

        it('should return undefined from UserByName rather than throwing on a cold cache', () => {
            expect(UserCache.Instance.UserByName('anyone')).toBeUndefined();
        });

        it('should leave an empty cache — not an undefined one — when Refresh fails', async () => {
            const stub = makeProviderStub();
            stub.ExecuteSQL.mockRejectedValue(new Error('connection reset'));

            await UserCache.Instance.Refresh(stub.Provider);

            expect(LogError).toHaveBeenCalled();
            expect(UserCache.Instance.Users).toEqual([]);
            expect(UserCache.Instance.GetSystemUser()).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // Refresh — reads through the provider, no dialect coupling
    // -----------------------------------------------------------------
    describe('Refresh', () => {
        it('should query vwUsers and vwUserRoles through the provider', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [] });

            await UserCache.Instance.Refresh(stub.Provider);

            expect(stub.Queries).toEqual([
                'SELECT * FROM [__mj].[vwUsers]',
                'SELECT * FROM [__mj].[vwUserRoles]',
            ]);
        });

        it('should build UserInfo objects with their roles attached', async () => {
            const stub = makeProviderStub({
                users: [{ ID: 'id1', Name: 'Alice' }, { ID: 'id2', Name: 'Bob' }],
                roles: [
                    { UserID: 'id1', Role: 'Developer' },
                    { UserID: 'ID1', Role: 'Integration' },
                    { UserID: 'id2', Role: 'UI' },
                ],
            });

            await UserCache.Instance.Refresh(stub.Provider);

            const users = UserCache.Instance.Users;
            expect(users).toHaveLength(2);
            // Role matching is UUID-comparison based, so the case-variant UserID still matches
            expect((users[0] as unknown as { UserRoles: unknown[] }).UserRoles).toHaveLength(2);
            expect((users[1] as unknown as { UserRoles: unknown[] }).UserRoles).toHaveLength(1);
        });

        it('reads the views metadata names, when metadata is loaded', async () => {
            const stub = makeProviderStub({
                users: [], roles: [],
                entities: [
                    { Name: 'MJ: Users', SchemaName: 'custom', BaseView: 'vwUsersCustom' },
                    { Name: 'MJ: User Roles', SchemaName: 'custom', BaseView: 'vwUserRolesCustom' },
                ],
            });

            await UserCache.Instance.Refresh(stub.Provider);

            expect(stub.Queries).toEqual([
                'SELECT * FROM [custom].[vwUsersCustom]',
                'SELECT * FROM [custom].[vwUserRolesCustom]',
            ]);
        });

        it('should be usable with a PostgreSQL-style quoting provider', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            const pgProvider = {
                MJCoreSchemaName: '__mj',
                QuoteSchemaAndView: (schema: string, view: string) => `"${schema}"."${view}"`,
                ExecuteSQL: stub.ExecuteSQL,
            } as unknown as DatabaseProviderBase;

            await UserCache.Instance.Refresh(pgProvider);

            expect(stub.Queries).toEqual([
                'SELECT * FROM "__mj"."vwUsers"',
                'SELECT * FROM "__mj"."vwUserRoles"',
            ]);
        });
    });

    // -----------------------------------------------------------------
    // Auto-refresh timer
    // -----------------------------------------------------------------
    describe('auto-refresh timer', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should re-arm with the same provider after the interval elapses', async () => {
            // The periodic reload reads the database only for entities that declare they can change
            // without an event, so this re-arm fixture declares it (plan §26 / §29).
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities: [
                { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: false },
                { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: false },
            ] });

            await UserCache.Instance.Refresh(stub.Provider, 1000);
            expect(stub.Queries).toHaveLength(2); // users + roles, one pass (the staleness probe is separate)

            await vi.advanceTimersByTimeAsync(1000);
            expect(stub.Queries).toHaveLength(4); // second pass, same provider
            expect(stub.Queries).toEqual([
                'SELECT * FROM [__mj].[vwUsers]',
                'SELECT * FROM [__mj].[vwUserRoles]',
                'SELECT * FROM [__mj].[vwUsers]',
                'SELECT * FROM [__mj].[vwUserRoles]',
            ]);
        });

        it('should not schedule a refresh when no interval is supplied', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });

            await UserCache.Instance.Refresh(stub.Provider);
            await vi.advanceTimersByTimeAsync(60_000);

            expect(stub.Queries).toHaveLength(2);
        });

        it('should not schedule a refresh when the interval is zero', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });

            await UserCache.Instance.Refresh(stub.Provider, 0);
            await vi.advanceTimersByTimeAsync(60_000);

            expect(stub.Queries).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------
    // Users getter
    // -----------------------------------------------------------------
    describe('Users getter', () => {
        it('should return the _users array', () => {
            const instance = UserCache.Instance;
            const users = [makeUser('id1', 'Alice'), makeUser('id2', 'Bob')];
            (instance as unknown as Record<string, unknown>)._users = users;

            expect(instance.Users).toBe(users);
            expect(instance.Users).toHaveLength(2);
        });

        it('should return an empty array when _users has not been set', () => {
            const instance = UserCache.Instance;
            expect(instance.Users).toEqual([]);
        });
    });

    // -----------------------------------------------------------------
    // Static Users
    // -----------------------------------------------------------------
    describe('static Users', () => {
        it('should delegate to Instance.Users', () => {
            const instance = UserCache.Instance;
            const users = [makeUser('id1', 'Alice')];
            (instance as unknown as Record<string, unknown>)._users = users;

            expect(UserCache.Users).toBe(users);
        });
    });

    // -----------------------------------------------------------------
    // UserByName
    // -----------------------------------------------------------------
    describe('UserByName', () => {
        let instance: UserCache;

        beforeEach(() => {
            instance = UserCache.Instance;
            (instance as unknown as Record<string, unknown>)._users = [
                makeUser('id1', 'Alice Johnson'),
                makeUser('id2', 'Bob Smith'),
                makeUser('id3', 'Charlie Brown'),
            ];
        });

        it('should find a user by name (case-insensitive by default)', () => {
            const result = instance.UserByName('alice johnson');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('Alice Johnson');
        });

        it('should find a user with exact case match', () => {
            const result = instance.UserByName('Alice Johnson');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('Alice Johnson');
        });

        it('should find a user with uppercase input (case-insensitive)', () => {
            const result = instance.UserByName('ALICE JOHNSON');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('Alice Johnson');
        });

        it('should return undefined when case-sensitive search does not match', () => {
            const result = instance.UserByName('alice johnson', true);
            expect(result).toBeUndefined();
        });

        it('should find user with case-sensitive search when case matches', () => {
            const result = instance.UserByName('Alice Johnson', true);
            expect(result).toBeDefined();
            expect(result!.Name).toBe('Alice Johnson');
        });

        it('should trim whitespace from the search name', () => {
            const result = instance.UserByName('  Bob Smith  ');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('Bob Smith');
        });

        it('should trim whitespace from stored user names during comparison', () => {
            // Add a user with leading/trailing whitespace in name
            const users = (instance as unknown as Record<string, unknown>)._users as UserInfo[];
            users.push(makeUser('id4', '  Padded Name  '));

            const result = instance.UserByName('Padded Name');
            expect(result).toBeDefined();
            expect(result!.ID).toBe('id4');
        });

        it('should return undefined when user is not found', () => {
            const result = instance.UserByName('Nonexistent User');
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty string search', () => {
            const result = instance.UserByName('');
            expect(result).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // Staying current (plan §15) — the cache no longer depends on whoever calls Refresh
    // -----------------------------------------------------------------
    describe('staying current', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        const settle = async () => {
            await vi.advanceTimersByTimeAsync(UserCache.ChangeDebounceMs + UserCache.PeerNoticeJitterMs + 10);
        };

        it('reloads when a user is saved in this process, and tells other servers', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            raiseEntityEvent('MJ: Users');
            await settle();

            expect(stub.Queries).toHaveLength(2);
            expect(stub.Written).toEqual([{ key: USER_CACHE_STAMP_KEY, category: 'default' }]);
        });

        it('reloads when a user role changes, and ignores unrelated entities', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            raiseEntityEvent('MJ: AI Models');
            raiseEntityEvent('MJ: AI Models', 'delete');
            await settle();
            expect(stub.Queries).toHaveLength(0);

            raiseEntityEvent('MJ: User Roles', 'delete');
            await settle();
            expect(stub.Queries).toHaveLength(2);
        });

        it('collects a burst of changes into one reload', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            for (let i = 0; i < 25; i++) raiseEntityEvent('MJ: Users');
            await settle();

            expect(stub.Queries).toHaveLength(2);
        });

        it('does not write the peer notice when the store is private to this process', async () => {
            const stub = makeProviderStub({ users: [], roles: [] }); // sharedStore not set
            await UserCache.Instance.Refresh(stub.Provider);

            raiseEntityEvent('MJ: Users');
            await settle();

            expect(stub.Written).toEqual([]);
        });

        it("reloads when another server's notice arrives, and does not echo it back", async () => {
            const stub = makeProviderStub({ users: [], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            deliverCacheEvent({ CacheKey: USER_CACHE_STAMP_KEY, Category: 'default', Action: 'set' });
            await settle();

            expect(stub.Queries).toHaveLength(2);
            expect(stub.Written).toEqual([]); // a peer's change must not publish another notice
        });

        it("still tells other servers about THIS process's change when a peer notice lands first", async () => {
            // A local save and an incoming peer notice collapse into one reload, which is the point
            // of the debounce. But the reload's "announce it" flag belonged to whichever event
            // scheduled it LAST, so a peer notice arriving inside the debounce window silently
            // demoted a local write to "someone else's change" and no peer was ever told about it.
            // The transaction wait stretches that window to seconds, so this is not a thin race.
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;
            stub.Written.length = 0;

            raiseEntityEvent('MJ: Users');                                                        // ours
            deliverCacheEvent({ CacheKey: USER_CACHE_STAMP_KEY, Category: 'default', Action: 'set' }); // theirs
            await settle();

            expect(stub.Queries).toHaveLength(2); // one reload, not two
            expect(stub.Written).toEqual([{ key: USER_CACHE_STAMP_KEY, category: 'default' }]);
        });

        it('does not announce when only a peer notice arrived, in either order', async () => {
            const stub = makeProviderStub({ users: [], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Written.length = 0;

            deliverCacheEvent({ CacheKey: USER_CACHE_STAMP_KEY, Category: 'default', Action: 'set' });
            deliverCacheEvent({ CacheKey: 'RunViewCache', Category: 'RunViewCache', Action: 'category_cleared' });
            await settle();

            expect(stub.Written).toEqual([]); // nothing of ours to announce — no echo
        });

        it('reloads when a tool clears the shared RunView cache, but not for other categories', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            deliverCacheEvent({ CacheKey: 'Metadata', Category: 'Metadata', Action: 'category_cleared' });
            await settle();
            expect(stub.Queries).toHaveLength(0);

            deliverCacheEvent({ CacheKey: 'RunViewCache', Category: 'RunViewCache', Action: 'category_cleared' });
            await settle();
            expect(stub.Queries).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------
    // Reloading around the transaction that made the change (plan §16.3 #7)
    // -----------------------------------------------------------------
    describe('reloading waits for the writing transaction', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

        it('does not reload while the transaction that saved the user is still open', async () => {
            const stub = makeProviderStub({ users: [], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            // A save inside a transaction: the row is not visible to another connection yet.
            (stub.Provider as unknown as { TransactionDepth: number }).TransactionDepth = 1;
            raiseEntityEvent('MJ: Users');
            await advance(UserCache.ChangeDebounceMs + UserCache.PeerNoticeJitterMs + 10);

            expect(stub.Queries).toHaveLength(0);       // no read of a half-written world
            expect(stub.Written).toEqual([]);           // and no peer told to reload early

            // The transaction commits.
            (stub.Provider as unknown as { TransactionDepth: number }).TransactionDepth = 0;
            await advance(UserCache.TransactionWaitMs + 10);

            expect(stub.Queries).toHaveLength(2);
            expect(stub.Written).toEqual([{ key: USER_CACHE_STAMP_KEY, category: 'default' }]);
        });

        it('waits for the provider that made the write, not the one this cache reads through', async () => {
            // MJServer builds a provider per request and a resolver saves through THAT one; the
            // cache reads through the process-wide provider, whose depth is always 0. Watching the
            // wrong provider is the same as not waiting at all — and a single stub playing both
            // roles cannot tell the difference, which is why the first version of this fix passed
            // its tests and would not have worked on a server (plan §22).
            const reader = makeProviderStub({ users: [], roles: [], sharedStore: true });
            await UserCache.Instance.Refresh(reader.Provider);
            reader.Queries.length = 0;

            const requestProvider = { TransactionDepth: 1 };
            raiseEntityEvent('MJ: Users', 'save', requestProvider);
            await advance(UserCache.ChangeDebounceMs + UserCache.PeerNoticeJitterMs + 10);

            expect(reader.Queries).toHaveLength(0); // the request's transaction is still open
            expect(reader.Written).toEqual([]);

            requestProvider.TransactionDepth = 0;   // the request commits
            await advance(UserCache.TransactionWaitMs + 10);

            expect(reader.Queries).toHaveLength(2);
            expect(reader.Written).toEqual([{ key: USER_CACHE_STAMP_KEY, category: 'default' }]);
        });

        it('reloads immediately when the write was made outside any transaction', async () => {
            const reader = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(reader.Provider);
            reader.Queries.length = 0;

            raiseEntityEvent('MJ: Users', 'save', { TransactionDepth: 0 });
            await advance(UserCache.ChangeDebounceMs + UserCache.PeerNoticeJitterMs + 10);

            expect(reader.Queries).toHaveLength(2);
        });

        it('gives up waiting after a bounded number of windows, so a stuck transaction cannot block it forever', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;
            (stub.Provider as unknown as { TransactionDepth: number }).TransactionDepth = 1; // never settles

            raiseEntityEvent('MJ: Users');
            await advance(UserCache.ChangeDebounceMs + UserCache.PeerNoticeJitterMs + 10
                + UserCache.TransactionWaitMs * (UserCache.MaxTransactionWaits + 2));

            expect(stub.Queries).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------
    // The periodic safety net
    // -----------------------------------------------------------------
    describe('the auto-refresh timer', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        const TRUSTED = [
            { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: true },
            { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: true },
        ];
        const DECLARES_RAW_SQL = [
            { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: false },
            { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: false },
        ];

        it('does NOT read the database on its timer when both entities trust their cache', async () => {
            // This timer reloads every user and role unconditionally, every interval, forever. On
            // Azure SQL serverless that alone prevents auto-pause — the cost §26 exists to remove.
            // When nothing declares out-of-band writes there is nothing for it to discover: saves
            // raise events, a peer's save publishes the stamp, and FindUser falls back to an
            // authoritative read on a miss.
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities: TRUSTED });
            await UserCache.Instance.Refresh(stub.Provider, 20_000);
            stub.Queries.length = 0;

            await vi.advanceTimersByTimeAsync(20_000 * 3 + 100);

            expect(stub.Queries).toHaveLength(0);
        });

        it('still reloads on its timer when an entity declares out-of-band writes', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities: DECLARES_RAW_SQL });
            await UserCache.Instance.Refresh(stub.Provider, 20_000);
            stub.Queries.length = 0;

            await vi.advanceTimersByTimeAsync(20_000 + 100);

            expect(stub.Queries.length).toBeGreaterThan(0);
        });

        it('keeps ticking while nothing is declared, so a later declaration takes effect', async () => {
            // The timer must not switch itself off: an operator can mark the entity at any time, and
            // the next tick should start honouring it without a restart.
            const entities = [
                { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: true },
                { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: true },
            ];
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities });
            await UserCache.Instance.Refresh(stub.Provider, 20_000);
            stub.Queries.length = 0;
            await vi.advanceTimersByTimeAsync(20_000 * 2 + 100);
            expect(stub.Queries).toHaveLength(0);

            entities[0].TrustServerCacheCompletely = false; // an operator marks the entity
            await vi.advanceTimersByTimeAsync(20_000 + 100);

            expect(stub.Queries.length).toBeGreaterThan(0);
        });
    });

    describe('RefreshIfChangedInDatabase', () => {
        /**
         * Entity metadata declaring that these rows CAN change without an event — which is the only
         * thing a periodic database check can discover, and therefore the only case it runs in.
         * `TrustServerCacheCompletely: false` is that declaration (plan §26).
         */
        const DECLARES_RAW_SQL = [
            { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: false },
            { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: false },
        ];

        it('does not reload when the database matches what the cache was built from', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities: DECLARES_RAW_SQL });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(false);
            expect(stub.Queries).toHaveLength(0); // the probe only, no reload
        });

        it('reloads when a row was added, changed or removed outside MJ', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [], entities: DECLARES_RAW_SQL });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            stub.Stamp.users = 2; // someone inserted a row with raw SQL
            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(true);
            expect(stub.Queries).toHaveLength(2);

            stub.Queries.length = 0;
            stub.Stamp.updatedAt = '2026-09-18T00:00:00.000Z'; // an update, same row count
            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(true);
            expect(stub.Queries).toHaveLength(2);
        });

        it('does not touch the database when both entities still trust their cache', async () => {
            // The default for every MJ entity. Every mutation then flows through BaseEntity.Save(),
            // which this cache already hears — so a poll can only cost a query that, on Azure SQL
            // serverless, is enough to prevent auto-pause. The row count below has drifted and is
            // deliberately NOT discovered.
            const stub = makeProviderStub({
                users: [{ ID: 'id1', Name: 'Alice' }], roles: [],
                entities: [
                    { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: true },
                    { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: true },
                ],
            });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;
            stub.Stamp.users = 2;

            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(false);
            expect(stub.Queries).toHaveLength(0); // not even the stamp probe
        });

        it('runs when EITHER entity declares out-of-band writes', async () => {
            const stub = makeProviderStub({
                users: [{ ID: 'id1', Name: 'Alice' }], roles: [],
                entities: [
                    { Name: 'MJ: Users', SchemaName: '__mj', BaseView: 'vwUsers', TrustServerCacheCompletely: true },
                    { Name: 'MJ: User Roles', SchemaName: '__mj', BaseView: 'vwUserRoles', TrustServerCacheCompletely: false },
                ],
            });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;
            stub.Stamp.users = 2;

            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(true);
        });

        it('does nothing when this process never had a provider', async () => {
            expect(await UserCache.Instance.RefreshIfChangedInDatabase()).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // FindUser — a miss is a question for the database, not an answer
    // -----------------------------------------------------------------
    describe('FindUser', () => {
        it('answers from the cache without touching the database', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice', Email: 'alice@example.com' }], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            expect((await UserCache.Instance.FindUser({ Email: 'ALICE@example.com ' }))?.ID).toBe('id1');
            expect((await UserCache.Instance.FindUser({ ID: 'ID1' }))?.ID).toBe('id1');
            expect(stub.Queries).toHaveLength(0);
        });

        it('finds a user created after this process last refreshed, and caches it', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice', Email: 'alice@example.com' }], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            // A user created on another server, after this process loaded its cache.
            (stub.Provider as unknown as { ExecuteSQL: unknown }); // provider unchanged; the rows below are new
            const rows = [{ ID: 'id2', Name: 'Bob', Email: 'bob@example.com' }];
            stub.ExecuteSQL.mockImplementation(async (query: string) => {
                if (query.includes('UNION ALL')) return [{ Scope: 'users', RowCount: 2, MaxUpdatedAt: '' }, { Scope: 'roles', RowCount: 0, MaxUpdatedAt: '' }];
                if (query.includes('vwUserRoles')) return [];
                stub.Queries.push(query);
                return query.includes('WHERE') ? rows : rows;
            });
            stub.Queries.length = 0;

            const found = await UserCache.Instance.FindUser({ Email: 'bob@example.com' });

            expect(found?.ID).toBe('id2');
            expect(UserCache.Instance.Users.map(u => u.ID)).toContain('id2'); // cached for next time
            stub.Queries.length = 0;
            await UserCache.Instance.FindUser({ Email: 'bob@example.com' });
            expect(stub.Queries).toHaveLength(0);
        });

        it('asks the database once for a user that does not exist, then remembers', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            expect(await UserCache.Instance.FindUser({ Email: 'nobody@example.com' })).toBeUndefined();
            const afterFirst = stub.Queries.length;
            expect(afterFirst).toBeGreaterThan(0);

            expect(await UserCache.Instance.FindUser({ Email: 'nobody@example.com' })).toBeUndefined();
            expect(stub.Queries).toHaveLength(afterFirst); // no second read within the retry interval
        });

        it('reads only that user\'s roles on a miss, not the whole role table', async () => {
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice', Email: 'alice@example.com' }], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);
            stub.Queries.length = 0;

            await UserCache.Instance.FindUser({ Email: 'alice2@example.com' });

            const roleReads = stub.Queries.filter(q => q.includes('vwUserRoles'));
            // Either no role query at all (no user matched) or one scoped by UserID — never a scan.
            expect(roleReads.every(q => q.includes('WHERE'))).toBe(true);
        });

        it('bounds what it remembers, so probing distinct addresses cannot grow the map without limit', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });
            await UserCache.Instance.Refresh(stub.Provider);

            for (let i = 0; i < UserCache.MaxRememberedMisses + 50; i++) {
                await UserCache.Instance.FindUser({ Email: `probe-${i}@example.com` });
            }

            const misses = (UserCache.Instance as unknown as { _recentMisses: Map<string, number> })._recentMisses;
            expect(misses.size).toBeLessThanOrEqual(UserCache.MaxRememberedMisses);
        });

        it('returns undefined without a database read when no provider was ever configured', async () => {
            expect(await UserCache.Instance.FindUser({ Email: 'alice@example.com' })).toBeUndefined();
        });
    });
});
