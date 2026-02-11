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

            await md.GetEntityObject('Users');

            // GetEntityObject always passes 3 args: (entityName, loadKey, contextUser)
            expect(mockProvider.GetEntityObject).toHaveBeenCalledWith('Users', undefined, undefined);
        });

        it('should pass contextUser to provider', async () => {
            Metadata.Provider = mockProvider as never;
            const md = new Metadata();
            // contextUser must have the shape: ID, Name, Email, UserRoles
            const contextUser = { ID: 'u-1', Name: 'TestUser', Email: 'test@test.com', UserRoles: [] } as never;

            await md.GetEntityObject('Users', contextUser);

            // When called with (entityName, contextUser), the overload resolves to
            // provider.GetEntityObject(entityName, undefined, wrappedContextUser)
            // contextUser gets wrapped into a UserInfo instance, so check positionally
            expect(mockProvider.GetEntityObject).toHaveBeenCalledTimes(1);
            const callArgs = mockProvider.GetEntityObject.mock.calls[0];
            expect(callArgs[0]).toBe('Users');
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
});
