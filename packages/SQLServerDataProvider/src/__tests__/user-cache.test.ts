import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    Metadata: class { static Provider = { ConfigData: { MJCoreSchemaName: '__mj' } } },
    UserInfo: class {
        ID: string;
        Name: string;
        constructor(provider: unknown, data: Record<string, unknown>) {
            this.ID = data.ID as string;
            this.Name = data.Name as string;
            Object.assign(this, data);
        }
    },
}));

const globalStore: Record<string, unknown> = {};
vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { GetGlobalObjectStore: () => globalStore } },
}));

// Mock mssql to prevent real database imports
vi.mock('mssql', () => ({}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { UserCache } from '../UserCache';
import { UserInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Helper to reset singleton state between tests
// ---------------------------------------------------------------------------
function resetSingleton(): void {
    (UserCache as Record<string, unknown>)._instance = undefined;
    // Clear the global store key used by UserCache
    for (const key of Object.keys(globalStore)) {
        delete globalStore[key];
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

        it('should store instance in global object store', () => {
            const instance = new UserCache();
            const storeKey = 'MJ.SQLServerDataProvider.UserCache.Instance';
            expect(globalStore[storeKey]).toBe(instance);
        });

        it('should retrieve instance from global object store when _instance is cleared', () => {
            const original = new UserCache();
            // Clear the static _instance but leave global store intact
            (UserCache as Record<string, unknown>)._instance = undefined;
            const restored = new UserCache();
            expect(restored).toBe(original);
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
            (instance as Record<string, unknown>)._users = [otherUser, systemUser];

            const result = instance.GetSystemUser();
            expect(result).toBe(systemUser);
        });

        it('should find the system user with case-insensitive ID comparison', () => {
            const instance = UserCache.Instance;
            // Store the ID in uppercase
            const systemUser = makeUser('ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', 'System');
            (instance as Record<string, unknown>)._users = [systemUser];

            const result = instance.GetSystemUser();
            expect(result).toBe(systemUser);
        });

        it('should return undefined when system user is not in the cache', () => {
            const instance = UserCache.Instance;
            const otherUser = makeUser('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Other');
            (instance as Record<string, unknown>)._users = [otherUser];

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
            (instance as Record<string, unknown>)._users = users;

            expect(instance.Users).toBe(users);
            expect(instance.Users).toHaveLength(2);
        });

        it('should return undefined when _users has not been set', () => {
            const instance = UserCache.Instance;
            expect(instance.Users).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // Static Users
    // -----------------------------------------------------------------
    describe('static Users', () => {
        it('should delegate to Instance.Users', () => {
            const instance = UserCache.Instance;
            const users = [makeUser('id1', 'Alice')];
            (instance as Record<string, unknown>)._users = users;

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
            (instance as Record<string, unknown>)._users = [
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
            const users = (instance as Record<string, unknown>)._users as UserInfo[];
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
