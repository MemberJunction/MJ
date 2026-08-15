/**
 * Tests for the new-user provisioning flow:
 *
 *  - NewUserBase.createNewUser (auth/newUsers.ts): context-user resolution,
 *    field mapping, transactional role / application / application-entity
 *    provisioning, and every rollback path.
 *  - verifyUserRecord (auth/index.ts): the authorization gate in front of it —
 *    autoCreateNewUsers on/off, authorized-domain restrictions against the
 *    verified identity's email domain (including wildcards, suffix/prefix
 *    confusion, and a forged Origin), cache-refresh retry, and the UserRoles
 *    the created user is stamped with.
 *
 * Both production modules run unmodified; mocking happens at the package
 * boundaries (@memberjunction/core, generic-database-provider, core-entities)
 * plus the config module, matching unifiedAuth.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

// ─── Hoisted state ──────────────────────────────────────────────────────────
const {
    mockConfig,
    mockCacheUsers,
    mockUserByName,
    mockRefresh,
    mockGetEntityObject,
    mockRunViewFn,
    mockLogError,
    mockLogStatus,
    mockBeginTransaction,
    mockCommitTransaction,
    mockRollbackTransaction,
    mockGetDefaultApplicationsForNewUser,
    mockRolesArray,
    mockApplicationsArray,
} = vi.hoisted(() => {
    interface HoistedCacheUser {
        ID: string;
        Name: string;
        Email: string;
        Type: string;
    }
    return {
        mockConfig: {
            userHandling: {
                autoCreateNewUsers: true,
                newUserLimitedToAuthorizedDomains: false,
                newUserAuthorizedDomains: [] as string[],
                newUserRoles: ['UI'] as string[],
                updateCacheWhenNotFound: false,
                updateCacheWhenNotFoundDelay: 0,
                contextUserForNewUserCreation: 'system@test.com',
                CreateUserApplicationRecords: false,
                UserApplications: [] as string[],
            },
        },
        mockCacheUsers: [] as HoistedCacheUser[],
        mockUserByName: vi.fn(),
        mockRefresh: vi.fn(),
        mockGetEntityObject: vi.fn(),
        mockRunViewFn: vi.fn(),
        mockLogError: vi.fn(),
        mockLogStatus: vi.fn(),
        mockBeginTransaction: vi.fn(),
        mockCommitTransaction: vi.fn(),
        mockRollbackTransaction: vi.fn(),
        mockGetDefaultApplicationsForNewUser: vi.fn(),
        mockRolesArray: [] as Array<{ ID: string; Name: string }>,
        mockApplicationsArray: [] as Array<{ ID: string; Name: string }>,
    };
});

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({ configInfo: mockConfig }));

vi.mock('@memberjunction/generic-database-provider', () => {
    const instance = {
        UserByName: mockUserByName,
        get Users() {
            return mockCacheUsers;
        },
        Refresh: mockRefresh,
        GetSystemUser: vi.fn(),
    };
    return {
        UserCache: class MockUserCache {
            static get Instance() {
                return instance;
            }
            static get Users() {
                return mockCacheUsers;
            }
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const provider = {
        BeginTransaction: mockBeginTransaction,
        CommitTransaction: mockCommitTransaction,
        RollbackTransaction: mockRollbackTransaction,
        Dialect: { BooleanLiteral: (value: boolean) => (value ? '1' : '0') },
    };
    class MockMetadata {
        public get Roles() {
            return mockRolesArray;
        }
        public get Applications() {
            return mockApplicationsArray;
        }
        public GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<unknown> {
            return mockGetEntityObject(entityName, contextUser);
        }
        static Provider = provider;
    }
    class MockUserInfo {
        constructor(_provider: unknown, initData: Record<string, unknown>) {
            Object.assign(this, initData);
        }
    }
    class MockRunView {
        public RunView(params: unknown, contextUser?: UserInfo): Promise<unknown> {
            return mockRunViewFn(params, contextUser);
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        UserInfo: MockUserInfo,
        RunView: MockRunView,
        LogError: mockLogError,
        LogStatus: mockLogStatus,
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        UserInfoEngine: {
            GetDefaultApplicationsForNewUser: mockGetDefaultApplicationsForNewUser,
        },
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            get Instance() {
                return {
                    ClassFactory: {
                        CreateInstance: <T>(cls: new () => T): T => new cls(),
                    },
                };
            },
        },
    };
});

vi.mock('../auth/initializeProviders.js', () => ({ initializeAuthProviders: vi.fn() }));

vi.mock('@memberjunction/auth-providers', () => ({
    AuthProviderFactory: {
        get Instance() {
            return {
                getAllByIssuer: () => [],
                getByIssuer: () => undefined,
                getAllProviders: () => [],
                hasProviders: () => false,
            };
        },
    },
}));

vi.mock('mssql', () => ({ default: {} }));

vi.mock('type-graphql', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: vi.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────
import { NewUserBase } from '../auth/newUsers.js';
import { verifyUserRecord } from '../auth/index.js';

// ─── Mock-entity plumbing ───────────────────────────────────────────────────

interface MockEntity {
    [key: string]: unknown;
    TestEntityName: string;
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    GetAll: () => Record<string, unknown>;
    LatestResult: { CompleteMessage: string };
}

/** Entities handed out by the mocked Metadata.GetEntityObject, in creation order. */
let createdEntities: MockEntity[];
/** Per-entity-name Save() outcome; defaults to success. */
let saveBehavior: Record<string, () => boolean>;
/** Every GetEntityObject call: entity name + the contextUser it was scoped to. */
let getEntityObjectCalls: Array<{ entityName: string; contextUser: UserInfo | undefined }>;

let entitySeq = 0;

function makeMockEntity(entityName: string): MockEntity {
    const entity: MockEntity = {
        TestEntityName: entityName,
        ID: `${entityName}#${++entitySeq}`,
        NewRecord: vi.fn(),
        LatestResult: { CompleteMessage: `mock save failure for ${entityName}` },
        Save: vi.fn(async () => (saveBehavior[entityName] ?? (() => true))()),
        GetAll: (): Record<string, unknown> => {
            const out: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(entity)) {
                if (typeof value !== 'function' && key !== 'LatestResult' && key !== 'TestEntityName') {
                    out[key] = value;
                }
            }
            return out;
        },
    };
    return entity;
}

function entitiesOf(name: string): MockEntity[] {
    return createdEntities.filter((e) => e.TestEntityName === name);
}

const CONTEXT_USER = { ID: 'sys-1', Name: 'system@test.com', Email: 'system@test.com', Type: 'Owner' } as unknown as UserInfo;

function resetConfig(): void {
    mockConfig.userHandling = {
        autoCreateNewUsers: true,
        newUserLimitedToAuthorizedDomains: false,
        newUserAuthorizedDomains: [],
        newUserRoles: ['UI'],
        updateCacheWhenNotFound: false,
        updateCacheWhenNotFoundDelay: 0,
        contextUserForNewUserCreation: 'system@test.com',
        CreateUserApplicationRecords: false,
        UserApplications: [],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    resetConfig();
    createdEntities = [];
    getEntityObjectCalls = [];
    saveBehavior = {};
    entitySeq = 0;
    mockCacheUsers.length = 0;

    mockRolesArray.length = 0;
    mockRolesArray.push({ ID: 'role-ui', Name: 'UI' }, { ID: 'role-dev', Name: 'Developer' });
    mockApplicationsArray.length = 0;
    mockApplicationsArray.push({ ID: 'app-crm', Name: ' CRM ' }, { ID: 'app-admin', Name: 'Admin' });

    mockUserByName.mockImplementation((name: string) => (name === 'system@test.com' ? CONTEXT_USER : undefined));
    mockGetEntityObject.mockImplementation(async (entityName: string, contextUser?: UserInfo) => {
        const entity = makeMockEntity(entityName);
        createdEntities.push(entity);
        getEntityObjectCalls.push({ entityName, contextUser });
        return entity;
    });
    mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
    mockGetDefaultApplicationsForNewUser.mockReturnValue([]);
});

// ─── NewUserBase.createNewUser ──────────────────────────────────────────────

describe('NewUserBase.createNewUser', () => {
    const create = (first = 'Ada', last = 'Lovelace', email = 'ada@example.com') =>
        new NewUserBase().createNewUser(first, last, email);

    describe('context-user resolution', () => {
        it('uses the configured contextUserForNewUserCreation for every entity it creates', async () => {
            const user = await create();

            expect(user).not.toBeNull();
            expect(mockUserByName).toHaveBeenCalledWith('system@test.com');
            expect(getEntityObjectCalls[0]).toEqual({ entityName: 'MJ: Users', contextUser: CONTEXT_USER });
            // Role records are scoped to the same creation context user
            for (const call of getEntityObjectCalls) {
                expect(call.contextUser).toBe(CONTEXT_USER);
            }
        });

        it('falls back to an Owner-typed cache user (case-insensitive, trimmed) when the configured user is missing', async () => {
            mockUserByName.mockReturnValue(undefined);
            const owner = { ID: 'owner-9', Name: 'Fallback Owner', Email: 'owner@x.com', Type: '  OWNER  ' };
            mockCacheUsers.push({ ID: 'u-1', Name: 'Plain', Email: 'p@x.com', Type: 'User' }, owner);

            const user = await create();

            expect(user).not.toBeNull();
            expect(mockLogError).toHaveBeenCalled(); // the miss is logged
            expect(getEntityObjectCalls[0].contextUser).toBe(owner as unknown as UserInfo);
        });

        it('returns null without opening a transaction when no context user can be resolved at all', async () => {
            mockUserByName.mockReturnValue(undefined);
            mockCacheUsers.push({ ID: 'u-1', Name: 'Plain', Email: 'p@x.com', Type: 'User' });

            const user = await create();

            expect(user).toBeNull();
            expect(mockBeginTransaction).not.toHaveBeenCalled();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('returns undefined (outer catch) when context resolution throws', async () => {
            mockUserByName.mockImplementation(() => {
                throw new Error('cache exploded');
            });

            const user = await create();

            expect(user).toBeUndefined();
            expect(mockLogError).toHaveBeenCalled();
        });
    });

    describe('user record construction', () => {
        it('maps the identity fields onto a NewRecord-ed MJ: Users entity', async () => {
            const user = await create('Grace', 'Hopper', 'grace@navy.mil');

            const userEntity = entitiesOf('MJ: Users')[0];
            expect(user as unknown).toBe(userEntity); // the saved entity itself is returned
            expect(userEntity.NewRecord).toHaveBeenCalledTimes(1);
            expect(userEntity.Name).toBe('grace@navy.mil'); // Name IS the email
            expect(userEntity.Email).toBe('grace@navy.mil');
            expect(userEntity.FirstName).toBe('Grace');
            expect(userEntity.LastName).toBe('Hopper');
            expect(userEntity.IsActive).toBe(true);
            expect(userEntity.Type).toBe('User');
            expect(userEntity.LinkedRecordType).toBe('None'); // default
            expect(userEntity.LinkedEntityID).toBeUndefined();
            expect(userEntity.LinkedEntityRecordID).toBeUndefined();
        });

        it('sets linked-record fields only when provided', async () => {
            await new NewUserBase().createNewUser('A', 'B', 'ab@x.com', 'Employee', 'ent-77', 'rec-88');

            const userEntity = entitiesOf('MJ: Users')[0];
            expect(userEntity.LinkedRecordType).toBe('Employee');
            expect(userEntity.LinkedEntityID).toBe('ent-77');
            expect(userEntity.LinkedEntityRecordID).toBe('rec-88');
        });

        it('rolls back and returns null when the user Save() fails — never a half-provisioned user', async () => {
            saveBehavior['MJ: Users'] = () => false;

            const user = await create();

            expect(user).toBeNull();
            expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockCommitTransaction).not.toHaveBeenCalled();
            expect(entitiesOf('MJ: User Roles')).toHaveLength(0);
        });
    });

    describe('role assignment', () => {
        it('creates one saved MJ: User Roles record per configured role, inside the transaction', async () => {
            mockConfig.userHandling.newUserRoles = ['UI', 'Developer'];

            const user = await create();

            expect(user).not.toBeNull();
            const roleEntities = entitiesOf('MJ: User Roles');
            expect(roleEntities).toHaveLength(2);
            const userEntity = entitiesOf('MJ: Users')[0];
            expect(roleEntities[0].UserID).toBe(userEntity.ID);
            expect(roleEntities[0].RoleID).toBe('role-ui');
            expect(roleEntities[1].RoleID).toBe('role-dev');
            for (const roleEntity of roleEntities) {
                expect(roleEntity.Save).toHaveBeenCalledTimes(1);
            }
            expect(mockCommitTransaction).toHaveBeenCalledTimes(1);
        });

        it('skips unknown roles with a logged error but still commits (KNOWN GAP: role-name match is case-sensitive)', async () => {
            // md.Roles.find(r => r.Name === role) — 'ui' does NOT match the metadata
            // role 'UI'. A casing typo in mj.config silently yields a user with fewer
            // roles than intended. Pinned as documentation of the sharp edge.
            mockConfig.userHandling.newUserRoles = ['ui', 'Developer'];

            const user = await create();

            expect(user).not.toBeNull();
            const roleEntities = entitiesOf('MJ: User Roles');
            expect(roleEntities).toHaveLength(1);
            expect(roleEntities[0].RoleID).toBe('role-dev');
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('Role ui not found'));
            expect(mockCommitTransaction).toHaveBeenCalledTimes(1);
        });

        it('rolls back everything when a role Save() fails', async () => {
            mockConfig.userHandling.newUserRoles = ['UI'];
            saveBehavior['MJ: User Roles'] = () => false;

            const user = await create();

            expect(user).toBeNull();
            expect(mockRollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockCommitTransaction).not.toHaveBeenCalled();
        });
    });

    describe('user application provisioning', () => {
        beforeEach(() => {
            mockConfig.userHandling.CreateUserApplicationRecords = true;
        });

        it('creates User Applications for explicitly configured app names (trimmed, case-insensitive)', async () => {
            mockConfig.userHandling.UserApplications = ['crm', 'ADMIN '];

            const user = await create();

            expect(user).not.toBeNull();
            const appEntities = entitiesOf('MJ: User Applications');
            expect(appEntities).toHaveLength(2);
            expect(appEntities[0].ApplicationID).toBe('app-crm');
            expect(appEntities[0].Sequence).toBe(0);
            expect(appEntities[0].IsActive).toBe(true);
            expect(appEntities[1].ApplicationID).toBe('app-admin');
            expect(appEntities[1].Sequence).toBe(1);
        });

        it('logs and skips configured app names that do not exist in metadata', async () => {
            mockConfig.userHandling.UserApplications = ['NoSuchApp', 'Admin'];

            const user = await create();

            expect(user).not.toBeNull();
            expect(entitiesOf('MJ: User Applications')).toHaveLength(1);
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('Application NoSuchApp not found'));
        });

        it('falls back to UserInfoEngine.GetDefaultApplicationsForNewUser when no apps are configured', async () => {
            mockConfig.userHandling.UserApplications = [];
            mockGetDefaultApplicationsForNewUser.mockReturnValue([{ ID: 'app-admin', Name: 'Admin' }]);

            const user = await create();

            expect(user).not.toBeNull();
            expect(mockGetDefaultApplicationsForNewUser).toHaveBeenCalledTimes(1);
            const appEntities = entitiesOf('MJ: User Applications');
            expect(appEntities).toHaveLength(1);
            expect(appEntities[0].ApplicationID).toBe('app-admin');
        });

        it('creates User Application Entities from the DefaultForNewUser view rows, using the dialect boolean literal', async () => {
            mockConfig.userHandling.UserApplications = ['Admin'];
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    { EntityID: 'ent-cust', Entity: 'Customers' },
                    { EntityID: 'ent-ord', Entity: 'Orders' },
                ],
            });

            const user = await create();

            expect(user).not.toBeNull();
            expect(mockRunViewFn).toHaveBeenCalledWith(
                {
                    EntityName: 'MJ: Application Entities',
                    ExtraFilter: `ApplicationID = 'app-admin' AND DefaultForNewUser = 1`,
                },
                CONTEXT_USER,
            );
            const appEntity = entitiesOf('MJ: User Applications')[0];
            const uae = entitiesOf('MJ: User Application Entities');
            expect(uae).toHaveLength(2);
            expect(uae[0].UserApplicationID).toBe(appEntity.ID);
            expect(uae[0].EntityID).toBe('ent-cust');
            expect(uae[0].Sequence).toBe(0);
            expect(uae[1].EntityID).toBe('ent-ord');
            expect(uae[1].Sequence).toBe(1);
        });

        it('continues (and still commits) when the Application Entities view fails to load', async () => {
            mockConfig.userHandling.UserApplications = ['Admin'];
            mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'view blew up' });

            const user = await create();

            expect(user).not.toBeNull();
            expect(entitiesOf('MJ: User Application Entities')).toHaveLength(0);
            expect(mockCommitTransaction).toHaveBeenCalledTimes(1);
            expect(mockRollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back when a User Application Entity Save() fails', async () => {
            mockConfig.userHandling.UserApplications = ['Admin'];
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ EntityID: 'ent-1', Entity: 'X' }] });
            saveBehavior['MJ: User Application Entities'] = () => false;

            const user = await create();

            expect(user).toBeNull();
            expect(mockRollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockCommitTransaction).not.toHaveBeenCalled();
        });

        it('rolls back when a User Application Save() fails', async () => {
            mockConfig.userHandling.UserApplications = ['Admin'];
            saveBehavior['MJ: User Applications'] = () => false;

            const user = await create();

            expect(user).toBeNull();
            expect(mockRollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });
});

// ─── verifyUserRecord (the authorization gate) ──────────────────────────────

describe('verifyUserRecord', () => {
    function addCacheUser(email: string): void {
        mockCacheUsers.push({ ID: `u-${email}`, Name: email, Email: email, Type: 'User' });
    }

    it('returns undefined when no email is supplied', async () => {
        const user = await verifyUserRecord(undefined, 'A', 'B');

        expect(user).toBeUndefined();
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('returns the cached user, matching email case-insensitively and trimmed', async () => {
        addCacheUser('someone@example.com');

        const user = await verifyUserRecord('  SomeOne@Example.COM  ', 'A', 'B');

        expect(user).toBeDefined();
        expect((user as unknown as { Email: string }).Email).toBe('someone@example.com');
        expect(mockGetEntityObject).not.toHaveBeenCalled(); // no creation for existing users
    });

    it('skips (and logs) cache entries with a blank email instead of matching them', async () => {
        mockCacheUsers.push({ ID: 'broken-1', Name: 'Broken', Email: '  ', Type: 'User' });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const user = await verifyUserRecord('missing@example.com', undefined, undefined);

        expect(user).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('broken-1'));
    });

    describe('autoCreateNewUsers gate', () => {
        it('does NOT create a user when autoCreateNewUsers is false', async () => {
            mockConfig.userHandling.autoCreateNewUsers = false;

            const user = await verifyUserRecord('new@example.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('does NOT create a user when firstName or lastName is missing', async () => {
            const missingFirst = await verifyUserRecord('new@example.com', undefined, 'User');
            const missingLast = await verifyUserRecord('new@example.com', 'New', undefined);

            expect(missingFirst).toBeUndefined();
            expect(missingLast).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('creates the user when enabled and domains are unrestricted, stamping config roles onto the returned UserInfo', async () => {
            mockConfig.userHandling.newUserRoles = ['UI', 'Developer'];

            const user = await verifyUserRecord('new@example.com', 'New', 'User');

            expect(user).toBeDefined();
            const stamped = user as unknown as { Email: string; UserRoles: Array<{ Role: string; RoleID: string; UserID: string }> };
            expect(stamped.Email).toBe('new@example.com');
            expect(stamped.UserRoles).toEqual([
                { UserID: entitiesOf('MJ: Users')[0].ID, Role: 'UI', RoleID: 'role-ui' },
                { UserID: entitiesOf('MJ: Users')[0].ID, Role: 'Developer', RoleID: 'role-dev' },
            ]);
            // The new user joins the shared cache so subsequent requests resolve it
            expect(mockCacheUsers.some((u) => u.Email === 'new@example.com')).toBe(true);
        });

        it('returns undefined when the underlying createNewUser fails', async () => {
            saveBehavior['MJ: Users'] = () => false;

            const user = await verifyUserRecord('new@example.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockCacheUsers).toHaveLength(0);
        });
    });

    describe('authorized-domain restrictions', () => {
        beforeEach(() => {
            mockConfig.userHandling.newUserLimitedToAuthorizedDomains = true;
            mockConfig.userHandling.newUserAuthorizedDomains = ['example.com'];
        });

        it('creates the user when the email domain is authorized', async () => {
            const user = await verifyUserRecord('new@example.com', 'New', 'User');

            expect(user).toBeDefined();
            expect(entitiesOf('MJ: Users')).toHaveLength(1);
        });

        it('does NOT create when the email domain is not authorized', async () => {
            const user = await verifyUserRecord('new@evil.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('creates when restricted and no request Origin is supplied, if the email domain is authorized', async () => {
            const user = await verifyUserRecord('new@example.com', 'New', 'User', undefined);

            expect(user).toBeDefined();
            expect(entitiesOf('MJ: Users')).toHaveLength(1);
        });

        it('does NOT create when a forged Origin is authorized but the email domain is not', async () => {
            const user = await verifyUserRecord('new@evil.com', 'New', 'User', 'example.com');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('matches email domains case-insensitively', async () => {
            const user = await verifyUserRecord('new@EXAMPLE.COM', 'New', 'User');

            expect(user).toBeDefined();
        });

        it('supports wildcard patterns for email subdomains', async () => {
            mockConfig.userHandling.newUserAuthorizedDomains = ['*.example.com'];

            const user = await verifyUserRecord('new@mail.example.com', 'New', 'User');

            expect(user).toBeDefined();
        });

        it('does NOT match the apex against "*.example.com" (pattern is matched in full)', async () => {
            mockConfig.userHandling.newUserAuthorizedDomains = ['*.example.com'];

            const user = await verifyUserRecord('new@example.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('rejects prefix confusion: "*.example.com" does not match "evilexample.com" (dot is escaped)', async () => {
            mockConfig.userHandling.newUserAuthorizedDomains = ['*.example.com'];

            const user = await verifyUserRecord('new@evilexample.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('rejects suffix confusion: the pattern is anchored, so "example.com.evil.com" is not authorized', async () => {
            const user = await verifyUserRecord('new@example.com.evil.com', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });

        it('rejects "evilexample.com" against the plain "example.com" pattern (anchored at both ends)', async () => {
            const user = await verifyUserRecord('x@evilexample.com', 'New', 'User');

            expect(user).toBeUndefined();
        });

        it('does NOT create when the identity has no email domain (username-only IdP)', async () => {
            const user = await verifyUserRecord('bare-username', 'New', 'User');

            expect(user).toBeUndefined();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
        });
    });

    describe('cache-refresh retry', () => {
        it('refreshes the cache once and retries when updateCacheWhenNotFound is set', async () => {
            mockConfig.userHandling.autoCreateNewUsers = false;
            mockConfig.userHandling.updateCacheWhenNotFound = true;
            mockConfig.userHandling.updateCacheWhenNotFoundDelay = 0;
            mockRefresh.mockImplementation(async () => {
                addCacheUser('late@example.com');
            });
            const dataSource = {} as unknown as import('mssql').ConnectionPool;

            const user = await verifyUserRecord('late@example.com', undefined, undefined, undefined, dataSource);

            expect(user).toBeDefined();
            expect((user as unknown as { Email: string }).Email).toBe('late@example.com');
            expect(mockRefresh).toHaveBeenCalledTimes(1); // no infinite retry loop
        });

        it('gives up after one refresh when the user still is not found', async () => {
            mockConfig.userHandling.autoCreateNewUsers = false;
            mockConfig.userHandling.updateCacheWhenNotFound = true;
            const dataSource = {} as unknown as import('mssql').ConnectionPool;

            const user = await verifyUserRecord('never@example.com', undefined, undefined, undefined, dataSource);

            expect(user).toBeUndefined();
            expect(mockRefresh).toHaveBeenCalledTimes(1);
        });
    });
});
