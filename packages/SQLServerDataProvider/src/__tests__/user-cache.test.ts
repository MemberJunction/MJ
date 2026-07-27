import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    Metadata: class { static Provider = { ConfigData: { MJCoreSchemaName: '__mj' } } },
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

// Mock mssql to prevent real database imports
vi.mock('mssql', () => ({}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { UserCache } from '../UserCache';
import { UserInfo } from '@memberjunction/core';
// Type-only — erased at compile time, so it never resolves through the vi.mock factory above.
import type { IMetadataProvider } from '@memberjunction/core';

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

// =====================================================================
// Tests for UserCache
// =====================================================================
describe('UserCache', () => {
    beforeEach(() => {
        resetSingleton();
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

        it('should return an empty array before any refresh has run', () => {
            // Callers dereference .Users without guarding (e.g. config.ts's
            // `UserCache.Instance.Users.find(...)`), so the array postcondition must
            // hold even before — and after a failed — refresh.
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
    // RefreshFromRows — the platform-neutral data-in path shared by the
    // mssql Refresh(pool) feeder and the PostgreSQL feeders.
    // -----------------------------------------------------------------
    describe('RefreshFromRows', () => {
        const provider = { ConfigData: { MJCoreSchemaName: '__mj' } } as unknown as IMetadataProvider;

        it('should populate the cache from user rows', () => {
            const instance = UserCache.Instance;
            instance.RefreshFromRows(
                [{ ID: 'id1', Name: 'Alice' }, { ID: 'id2', Name: 'Bob' }],
                [],
                provider
            );

            expect(instance.Users).toHaveLength(2);
            expect(instance.Users[0].Name).toBe('Alice');
            expect(instance.Users[1].Name).toBe('Bob');
        });

        it('should attach only the roles belonging to each user', () => {
            const instance = UserCache.Instance;
            instance.RefreshFromRows(
                [{ ID: 'aaaaaaaa-1111-2222-3333-444444444444', Name: 'Alice' },
                 { ID: 'bbbbbbbb-1111-2222-3333-444444444444', Name: 'Bob' }],
                [{ UserID: 'aaaaaaaa-1111-2222-3333-444444444444', Role: 'Developer' },
                 { UserID: 'bbbbbbbb-1111-2222-3333-444444444444', Role: 'UI' },
                 { UserID: 'aaaaaaaa-1111-2222-3333-444444444444', Role: 'Integration' }],
                provider
            );

            const [alice, bob] = instance.Users;
            expect(alice.UserRoles.map(r => r.Role)).toEqual(['Developer', 'Integration']);
            expect(bob.UserRoles.map(r => r.Role)).toEqual(['UI']);
        });

        it('should match roles to users case-insensitively (UUID comparison)', () => {
            const instance = UserCache.Instance;
            instance.RefreshFromRows(
                [{ ID: 'AAAAAAAA-1111-2222-3333-444444444444', Name: 'Alice' }],
                [{ UserID: 'aaaaaaaa-1111-2222-3333-444444444444', Role: 'Developer' }],
                provider
            );

            expect(instance.Users[0].UserRoles.map(r => r.Role)).toEqual(['Developer']);
        });

        it('should accept an empty role set — a user with no roles is legal', () => {
            const instance = UserCache.Instance;
            instance.RefreshFromRows([{ ID: 'id1', Name: 'Alice' }], [], provider);

            expect(instance.Users).toHaveLength(1);
            expect(instance.Users[0].UserRoles).toEqual([]);
        });

        it('should throw with context when the user set is empty', () => {
            const instance = UserCache.Instance;
            expect(() => instance.RefreshFromRows([], [], provider)).toThrow(/zero users/i);
        });

        it('should throw with context when the user set is missing', () => {
            const instance = UserCache.Instance;
            expect(() =>
                instance.RefreshFromRows(
                    undefined as unknown as Record<string, unknown>[],
                    [],
                    provider
                )
            ).toThrow(/RefreshFromRows/);
        });

        it('should throw when no metadata provider is supplied', () => {
            const instance = UserCache.Instance;
            expect(() =>
                instance.RefreshFromRows(
                    [{ ID: 'id1', Name: 'Alice' }],
                    [],
                    undefined as unknown as IMetadataProvider
                )
            ).toThrow(/provider/i);
        });

        it('should leave Users as an array after a throw, never undefined', () => {
            const instance = UserCache.Instance;
            expect(() => instance.RefreshFromRows([], [], provider)).toThrow();
            expect(instance.Users).toEqual([]);
        });

        it('should not clobber a previously loaded cache when a later refresh throws', () => {
            const instance = UserCache.Instance;
            instance.RefreshFromRows([{ ID: 'id1', Name: 'Alice' }], [], provider);
            expect(() => instance.RefreshFromRows([], [], provider)).toThrow();

            expect(instance.Users).toHaveLength(1);
            expect(instance.Users[0].Name).toBe('Alice');
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
