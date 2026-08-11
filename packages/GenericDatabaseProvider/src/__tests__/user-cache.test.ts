import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import type { DatabaseProviderBase } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
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
import { UserCache } from '../UserCache';
import { LogError, UserInfo } from '@memberjunction/core';

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
    Queries: string[];
    ExecuteSQL: ReturnType<typeof vi.fn>;
}

function makeProviderStub(
    rows: { users?: Record<string, unknown>[]; roles?: Record<string, unknown>[] } = {}
): ProviderStub {
    const queries: string[] = [];
    const executeSQL = vi.fn(async (query: string) => {
        queries.push(query);
        return query.includes('vwUserRoles') ? (rows.roles ?? []) : (rows.users ?? []);
    });
    const stub = {
        MJCoreSchemaName: '__mj',
        QuoteSchemaAndView: (schema: string, view: string) => `[${schema}].[${view}]`,
        ExecuteSQL: executeSQL,
    };
    return { Provider: stub as unknown as DatabaseProviderBase, Queries: queries, ExecuteSQL: executeSQL };
}

// =====================================================================
// Tests for UserCache
// =====================================================================
describe('UserCache', () => {
    beforeEach(() => {
        resetSingleton();
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
            const stub = makeProviderStub({ users: [{ ID: 'id1', Name: 'Alice' }], roles: [] });

            await UserCache.Instance.Refresh(stub.Provider, 1000);
            expect(stub.ExecuteSQL).toHaveBeenCalledTimes(2); // users + roles, one pass

            await vi.advanceTimersByTimeAsync(1000);
            expect(stub.ExecuteSQL).toHaveBeenCalledTimes(4); // second pass, same provider
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

            expect(stub.ExecuteSQL).toHaveBeenCalledTimes(2);
        });

        it('should not schedule a refresh when the interval is zero', async () => {
            const stub = makeProviderStub({ users: [], roles: [] });

            await UserCache.Instance.Refresh(stub.Provider, 0);
            await vi.advanceTimersByTimeAsync(60_000);

            expect(stub.ExecuteSQL).toHaveBeenCalledTimes(2);
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
});
