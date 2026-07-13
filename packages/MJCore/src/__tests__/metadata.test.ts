import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Metadata } from '../generic/metadata';
import { MJGlobal } from '@memberjunction/global';

// Mock the IMetadataProvider
const mockEntities = [
    { ID: 'e-1', Name: 'Users', SchemaName: 'admin', BaseTable: 'User', Fields: [] },
    { ID: 'e-2', Name: 'Roles', SchemaName: 'admin', BaseTable: 'Role', Fields: [] }
];

const mockProvider = {
    Entities: mockEntities,
    CurrentUser: { ID: 'u-1', Name: 'TestUser' },
    Applications: [{ ID: 'app-1', Name: 'Explorer' }],
    Roles: [{ ID: 'r-1', Name: 'Admin' }],
    Authorizations: [],
    RowLevelSecurityFilters: [],
    AuditLogTypes: [],
    Queries: [],
    QueryCategories: [],
    QueryFields: [],
    QueryPermissions: [],
    Libraries: [],
    ExplorerNavigationItems: [],
    LatestRemoteMetadata: null,
    LocalMetadataStore: null,
    Refresh: vi.fn().mockResolvedValue(true),
    GetEntityObject: vi.fn().mockResolvedValue({}),
    GetEntityObjectByID: vi.fn().mockResolvedValue({})
};

describe('Metadata', () => {
    let globalStore: Record<string, unknown>;

    beforeEach(() => {
        globalStore = {};
        // Clear call history on the module-level mockProvider fns — restoreAllMocks()
        // only restores spies, so calls from prior tests would otherwise leak into
        // toHaveBeenCalledTimes assertions. clearAllMocks preserves implementations.
        vi.clearAllMocks();
        vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(globalStore);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Provider static property', () => {
        it('should get and set the static provider', () => {
            Metadata.Provider = mockProvider as never;

            expect(Metadata.Provider).toBe(mockProvider);
        });

        it('should throw when global store is unavailable (get)', () => {
            vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(null as never);

            expect(() => Metadata.Provider).toThrow();
        });
    });

    describe('constructor', () => {
        it('should create a Metadata instance', () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            expect(md).toBeDefined();
        });
    });

    describe('entity access', () => {
        it('should access Entities from the provider', () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            expect(md.Entities).toEqual(mockEntities);
        });

        it('should access CurrentUser from the provider', () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            expect(md.CurrentUser.ID).toBe('u-1');
        });

        it('should access Applications from the provider', () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            expect(md.Applications).toHaveLength(1);
        });

        it('should access Roles from the provider', () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            expect(md.Roles).toHaveLength(1);
        });
    });

    describe('GetEntityObject', () => {
        it('should delegate to provider', async () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            await md.GetEntityObject('MJ: Users');

            // GetEntityObject always passes 3 args: (entityName, loadKey, contextUser)
            expect(mockProvider.GetEntityObject).toHaveBeenCalledWith('MJ: Users', undefined, undefined);
        });

        it('should pass contextUser to provider', async () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();
            // contextUser must have the shape: ID, Name, Email, UserRoles
            const contextUser = { ID: 'u-1', Name: 'TestUser', Email: 'test@test.com', UserRoles: [] } as never;

            await md.GetEntityObject('MJ: Users', contextUser);

            // When called with (entityName, contextUser), the overload resolves to
            // provider.GetEntityObject(entityName, undefined, wrappedContextUser)
            // contextUser gets wrapped into a UserInfo instance, so check positionally
            expect(mockProvider.GetEntityObject).toHaveBeenCalledTimes(1);
            const callArgs = mockProvider.GetEntityObject.mock.calls[0];
            expect(callArgs[0]).toBe('MJ: Users');
            expect(callArgs[1]).toBeUndefined();
            // Third arg is a UserInfo wrapping the contextUser object
            expect(callArgs[2]).toBeDefined();
            expect(callArgs[2].ID).toBe('u-1');
        });
    });

    describe('Refresh', () => {
        it('should delegate to provider Refresh', async () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();

            await md.Refresh();

            expect(mockProvider.Refresh).toHaveBeenCalled();
        });
    });

    // Perf-bundle: Metadata.EntityByName/ByID fall back to a lazy Map cache
    // when the provider doesn't implement those methods directly. These tests
    // exercise that fallback code path.
    describe('EntityByName/ByID cache (perf-bundle)', () => {
        // Isolated provider mutation — don't share across suites
        const buildMutableProvider = () => {
            const entities = [
                { ID: '11111111-1111-1111-1111-111111111111', Name: 'Users', SchemaName: 'admin', BaseTable: 'User', Fields: [] },
                { ID: '22222222-2222-2222-2222-222222222222', Name: 'Roles', SchemaName: 'admin', BaseTable: 'Role', Fields: [] }
            ];
            return {
                get Entities() { return entities; },
                _entitiesRef: entities,
                CurrentUser: { ID: 'u-1', Name: 'TestUser' },
                Applications: [],
                Roles: [],
                Authorizations: [],
                RowLevelSecurityFilters: [],
                AuditLogTypes: [],
                Queries: [],
                QueryCategories: [],
                QueryFields: [],
                QueryPermissions: [],
                Libraries: [],
                ExplorerNavigationItems: [],
                LatestRemoteMetadata: null,
                LocalMetadataStore: null,
                Refresh: vi.fn().mockResolvedValue(true),
                GetEntityObject: vi.fn().mockResolvedValue({}),
                GetEntityObjectByID: vi.fn().mockResolvedValue({})
                // intentionally NO EntityByName/EntityByID on provider — forces fallback
            };
        };

        it('EntityByName: returns the same reference across repeated lookups (cache hit)', () => {
            Metadata.Provider = buildMutableProvider() as never;
            const md = new Metadata();

            const first = md.EntityByName('Users');
            const second = md.EntityByName('Users');

            expect(first).toBeDefined();
            expect(first).toBe(second); // identity equality — cache returned same object
            expect(first?.Name).toBe('Users');
        });

        it('EntityByName: lowercases and trims the key', () => {
            Metadata.Provider = buildMutableProvider() as never;
            const md = new Metadata();

            expect(md.EntityByName('  users  ')?.Name).toBe('Users');
            expect(md.EntityByName('USERS')?.Name).toBe('Users');
        });

        it('EntityByID: resolves SQL-Server-style uppercase UUID', () => {
            Metadata.Provider = buildMutableProvider() as never;
            const md = new Metadata();

            const upper = '11111111-1111-1111-1111-111111111111'.toUpperCase();
            expect(md.EntityByID(upper)?.Name).toBe('Users');
        });

        it('EntityByID: resolves PostgreSQL-style lowercase UUID', () => {
            Metadata.Provider = buildMutableProvider() as never;
            const md = new Metadata();

            expect(md.EntityByID('22222222-2222-2222-2222-222222222222')?.Name).toBe('Roles');
        });

        it('EntityByID: returns undefined for empty/null id without throwing', () => {
            Metadata.Provider = buildMutableProvider() as never;
            const md = new Metadata();

            expect(md.EntityByID('')).toBeUndefined();
            expect(md.EntityByID(null as unknown as string)).toBeUndefined();
        });

        it('Refresh() invalidates the entity cache so new entities become visible', async () => {
            const provider = buildMutableProvider();
            Metadata.Provider = provider as never;
            const md = new Metadata();

            // Populate the cache
            expect(md.EntityByName('Users')).toBeDefined();

            // Mutate the underlying entity array AFTER the cache is warm
            provider._entitiesRef.push({
                ID: '33333333-3333-3333-3333-333333333333',
                Name: 'Permissions',
                SchemaName: 'admin',
                BaseTable: 'Permission',
                Fields: []
            });

            // Pre-Refresh the cache still reflects the old set
            expect(md.EntityByName('Permissions')).toBeUndefined();

            await md.Refresh();

            // Post-Refresh the cache is invalidated and the new entity resolves
            expect(md.EntityByName('Permissions')?.Name).toBe('Permissions');
        });
    });
});
