import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    EntityPermissionType,
    ExecuteSQLOptions,
    IMetadataProvider,
    ProviderConfigDataBase,
    RoleInfo,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    CollectionArtifactPostRunViewHook,
    CollectionArtifactPreRunViewHook,
    MJCollectionArtifactEntityServer
} from '../custom/MJCollectionArtifactEntityServer.server';
import {
    ArtifactGuestShareLinkPostRunViewHook,
    ArtifactGuestShareLinkPreRunViewHook,
    MJArtifactGuestShareLinkEntityServer
} from '../custom/MJArtifactGuestShareLinkEntityServer.server';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const SHARER_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const COLLECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ARTIFACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINK_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeUser(id: string, email: string): UserInfo {
    return new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
}

class MockCollectionProvider extends DatabaseProviderBase {
    private readonly _entities: EntityInfo[];
    private readonly _roles: RoleInfo[] = [new RoleInfo({ ID: 'r-dev', Name: 'Developer' })];
    public constructor(
        private readonly _runViewHandler: (params: RunViewParams, user?: UserInfo) => Promise<RunViewResult>
    ) {
        super();
        const mkEntity = (id: string, name: string, baseTable: string, baseView: string, fields: string[]) =>
            new EntityInfo({
                ID: id,
                Name: name,
                SchemaName: '__mj',
                BaseTable: baseTable,
                BaseView: baseView,
                IncludeInAPI: true,
                Status: 'Active',
                EntityFields: [
                    { ID: `${id}-id`, EntityID: id, Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
                    ...fields.map((f, i) => ({
                        ID: `${id}-${f}`,
                        EntityID: id,
                        Name: f,
                        CodeName: f,
                        Type: 'uniqueidentifier',
                        Sequence: i + 2,
                        Status: 'Active'
                    }))
                ]
            });
        this._entities = [
            mkEntity('e-ca', 'MJ: Collection Artifacts', 'CollectionArtifact', 'vwCollectionArtifacts', ['CollectionID', 'ArtifactVersionID']),
            mkEntity('e-ver', 'MJ: Artifact Versions', 'ArtifactVersion', 'vwArtifactVersions', ['ArtifactID']),
            mkEntity('e-col', 'MJ: Collections', 'Collection', 'vwCollections', ['OwnerID', 'ParentID']),
            mkEntity('e-cperm', 'MJ: Collection Permissions', 'CollectionPermission', 'vwCollectionPermissions', ['CollectionID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare']),
            mkEntity('e-glink', 'MJ: Artifact Guest Share Links', 'ArtifactGuestShareLink', 'vwArtifactGuestShareLinks', ['ArtifactID', 'TokenHash'])
        ];
    }

    public override get PlatformKey(): 'sqlserver' | 'postgresql' {
        return this._dialect;
    }
    public override get ProviderType(): 'Database' {
        return 'Database';
    }
    public override get Entities(): EntityInfo[] {
        return this._entities;
    }
    public override get Roles(): RoleInfo[] {
        return this._roles;
    }
    public override get ConfigData(): ProviderConfigDataBase {
        return new ProviderConfigDataBase({}, '__mj', [], [], true);
    }
    protected override get UUIDFunctionPattern(): RegExp {
        return /^newsequentialid\(\)$/i;
    }
    protected override get AllowLoad(): boolean {
        return false;
    }
    public override QuoteIdentifier(name: string): string {
        return `"${name}"`;
    }
    public override QuoteSchemaAndView(schema: string, obj: string): string {
        return `"${schema}"."${obj}"`;
    }
    public override BuildParameterPlaceholder(index: number): string {
        return `$${index + 1}`;
    }
    public override async ExecuteSQL<T>(): Promise<T[]> {
        return [];
    }
    public override async InternalRunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> {
        return this._runViewHandler(params, contextUser);
    }
}

class MockSqlGuestShareDbProvider extends DatabaseProviderBase {
    public readonly calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    private readonly _dialect: 'sqlserver' | 'postgresql';
    private readonly _entities: EntityInfo[];
    public constructor(
        dialect: 'sqlserver' | 'postgresql',
        private readonly handler: (sql: string, params?: unknown[]) => Record<string, string | number | boolean | Date | null>[]
    ) {
        super();
        this._dialect = dialect;
        this._entities = [
            new EntityInfo({
                ID: 'e-glink',
                Name: 'MJ: Artifact Guest Share Links',
                SchemaName: '__mj',
                BaseTable: 'ArtifactGuestShareLink',
                BaseView: 'vwArtifactGuestShareLinks',
                spCreate: 'spCreateArtifactGuestShareLink',
                spUpdate: 'spUpdateArtifactGuestShareLink',
                spDelete: 'spDeleteArtifactGuestShareLink',
                IncludeInAPI: true,
                AllowCreateAPI: false,
                AllowUpdateAPI: false,
                AllowDeleteAPI: false,
                Status: 'Active',
                EntityFields: [
                    { ID: 'f1', EntityID: 'e-glink', Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
                    { ID: 'f2', EntityID: 'e-glink', Name: 'ArtifactID', CodeName: 'ArtifactID', Type: 'uniqueidentifier', Sequence: 2, Status: 'Active' },
                    { ID: 'f3', EntityID: 'e-glink', Name: 'ArtifactVersionID', CodeName: 'ArtifactVersionID', Type: 'uniqueidentifier', Sequence: 3, Status: 'Active' },
                    { ID: 'f4', EntityID: 'e-glink', Name: 'CreatedByUserID', CodeName: 'CreatedByUserID', Type: 'uniqueidentifier', Sequence: 4, Status: 'Active' },
                    { ID: 'f5', EntityID: 'e-glink', Name: 'TokenHash', CodeName: 'TokenHash', Type: 'nvarchar', Sequence: 5, Status: 'Active' }
                ]
            })
        ];
    }

    public override get PlatformKey(): 'sqlserver' | 'postgresql' {
        return this._dialect;
    }
    public override get ProviderType(): 'Database' {
        return 'Database';
    }
    public override get Entities(): EntityInfo[] {
        return this._entities;
    }
    public override get ConfigData(): ProviderConfigDataBase {
        return new ProviderConfigDataBase({}, '__mj', [], [], true);
    }
    protected override get UUIDFunctionPattern(): RegExp {
        return /^newsequentialid\(\)$/i;
    }
    protected override get AllowLoad(): boolean {
        return false;
    }
    public override QuoteIdentifier(name: string): string {
        return this.PlatformKey === 'sqlserver' ? `[${name}]` : `"${name}"`;
    }
    public override QuoteSchemaAndView(schema: string, obj: string): string {
        return this.PlatformKey === 'sqlserver' ? `[${schema}].[${obj}]` : `"${schema}"."${obj}"`;
    }
    public override BuildParameterPlaceholder(index: number): string {
        return this.PlatformKey === 'sqlserver' ? `@p${index}` : `$${index + 1}`;
    }
    public override async ExecuteSQL<T>(
        query?: string,
        parameters?: unknown[],
        _options?: ExecuteSQLOptions
    ): Promise<T[]> {
        this.calls.push({ sql: query ?? '', params: parameters });
        return this.handler(query ?? '', parameters) as unknown as T[];
    }
}

describe('MJCollectionArtifactEntityServer ACL & anti-escalation', () => {
    const sysUser = makeUser(SYSTEM_USER_ID, 'sys@example.com');
    const ownerUser = makeUser(OWNER_ID, 'owner@example.com');
    const sharerUser = makeUser(SHARER_ID, 'sharer@example.com');
    const outsiderUser = makeUser(OUTSIDER_ID, 'outsider@example.com');

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && u.ID === SYSTEM_USER_ID)
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('blocks privilege escalation when collection ancestry grants Edit/Delete beyond caller permissions on target artifact, allows owner, forbids re-parenting, and notifies on Save/Delete', async () => {
        const provider = new MockCollectionProvider(async (params) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [{ ID: VERSION_ID, ArtifactID: ARTIFACT_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collections') {
                return {
                    Success: true,
                    Results: [{ ID: COLLECTION_ID, OwnerID: SHARER_ID, ParentID: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockResolvedValue({
            CollectionID: COLLECTION_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
            Reason: 'Owner'
        });
        const resolveArtifactSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions');
        const notifySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'NotifyPermissionsChanged').mockResolvedValue();
        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionArtifactEntityServer.prototype), 'Save')
            .mockResolvedValue(true);
        const superDeleteSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionArtifactEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);

        const makeLinkEntity = (actor: UserInfo, isSaved = false, oldCollectionId?: string) => {
            const entity = Object.create(MJCollectionArtifactEntityServer.prototype) as MJCollectionArtifactEntityServer;
            const history: MJCollectionArtifactEntityServer['ResultHistory'] = [];
            Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
            Object.defineProperty(entity, 'IsSaved', { value: isSaved, writable: true });
            Object.defineProperty(entity, 'CollectionID', { value: COLLECTION_ID, writable: true });
            Object.defineProperty(entity, 'ArtifactVersionID', { value: VERSION_ID, writable: true });
            Object.defineProperty(entity, 'ContextCurrentUser', { value: actor, writable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
            Object.defineProperty(entity, 'Fields', {
                value: [
                    { Name: 'CollectionID', OldValue: oldCollectionId ?? null },
                    { Name: 'ArtifactVersionID', OldValue: isSaved ? VERSION_ID : null }
                ],
                configurable: true
            });
            return { entity, history };
        };

        // 1. Sharer has CanShare=true on artifact, but lacks CanEdit/CanDelete; linking into owned collection would escalate!
        resolveArtifactSpy.mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: true,
            Source: 'ArtifactPermission',
            Reason: 'Share only'
        });
        const escalation = makeLinkEntity(sharerUser, false);
        expect(await escalation.entity.Save()).toBe(false);
        expect(escalation.history[0]?.Message).toContain('exceeding caller');
        expect(superSaveSpy).not.toHaveBeenCalled();

        // 2. Re-parenting CollectionID on a saved record is blocked
        const reparent = makeLinkEntity(ownerUser, true, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        expect(await reparent.entity.Save()).toBe(false);
        expect(reparent.history[0]?.Message).toContain('cannot be changed');

        // 3. Full-permission owner succeeds and emits NotifyPermissionsChanged on Save and Delete
        resolveArtifactSpy.mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
            Reason: 'Owner'
        });
        const allowed = makeLinkEntity(ownerUser, false);
        expect(await allowed.entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: OWNER_ID
        });

        notifySpy.mockClear();
        const del = makeLinkEntity(ownerUser, true, COLLECTION_ID);
        expect(await del.entity.Delete()).toBe(true);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: OWNER_ID
        });

        // 4. Read hooks filter out denied rows and InnerLoad fails closed
        const params: RunViewParams = {
            EntityName: 'MJ: Collection Artifacts',
            Fields: ['ID'],
            ResultType: 'simple'
        };
        CollectionArtifactPreRunViewHook(params, outsiderUser, provider);
        expect(params.Fields).toEqual(['ID', 'CollectionID', 'ArtifactVersionID']);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'CheckPermission').mockResolvedValue(false);
        const filtered = await CollectionArtifactPostRunViewHook(
            params,
            {
                Success: true,
                Results: [{ ID: 'ca-1', CollectionID: COLLECTION_ID, ArtifactVersionID: VERSION_ID }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            outsiderUser,
            provider
        );
        expect(filtered.Results).toEqual([]);
        expect(filtered.TotalRowCount).toBe(0);
    });
});

describe('MJArtifactGuestShareLinkEntityServer direct-DB SystemUser & read ACL', () => {
    const sysUser = makeUser(SYSTEM_USER_ID, 'sys@example.com');
    const sharerUser = makeUser(SHARER_ID, 'sharer@example.com');
    const outsiderUser = makeUser(OUTSIDER_ID, 'outsider@example.com');

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && u.ID === SYSTEM_USER_ID)
        );
    });

    it('blocks non-system Save/Delete and executes SystemUser SQL Server sprocs without untyped null positional params', async () => {
        const mssqlProvider = new MockSqlGuestShareDbProvider('sqlserver', (sql) => {
            if (sql.includes('spCreateArtifactGuestShareLink') || sql.includes('spUpdateArtifactGuestShareLink')) {
                return [
                    {
                        ID: LINK_ID,
                        ArtifactID: ARTIFACT_ID,
                        ArtifactVersionID: VERSION_ID,
                        CreatedByUserID: SHARER_ID,
                        TokenHash: 'hash-123',
                        Label: null,
                        AccessCount: 0
                    }
                ];
            }
            return [];
        });

        const makeGuestEntity = (actor: UserInfo) => {
            const entity = Object.create(MJArtifactGuestShareLinkEntityServer.prototype) as MJArtifactGuestShareLinkEntityServer;
            const history: MJArtifactGuestShareLinkEntityServer['ResultHistory'] = [];
            Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
            Object.defineProperty(entity, 'EntityInfo', { value: mssqlProvider.Entities[0], configurable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: mssqlProvider, configurable: true });
            Object.defineProperty(entity, 'ContextCurrentUser', { value: actor, writable: true });
            Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
            Object.defineProperty(entity, 'ID', { value: LINK_ID, writable: true });
            Object.defineProperty(entity, 'ArtifactID', { value: ARTIFACT_ID, writable: true });
            Object.defineProperty(entity, 'ArtifactVersionID', { value: VERSION_ID, writable: true });
            Object.defineProperty(entity, 'CreatedByUserID', { value: SHARER_ID, writable: true });
            Object.defineProperty(entity, 'TokenHash', { value: 'sha256-test-hash', writable: true });
            Object.defineProperty(entity, 'Label', { value: null, writable: true });
            Object.defineProperty(entity, 'ExpiresAt', { value: null, writable: true });
            Object.defineProperty(entity, 'RevokedAt', { value: null, writable: true });
            Object.defineProperty(entity, 'RevokedByUserID', { value: null, writable: true });
            Object.defineProperty(entity, 'LastAccessedAt', { value: null, writable: true });
            Object.defineProperty(entity, 'AccessCount', { value: 0, writable: true });
            Object.defineProperty(entity, 'LoadFromData', {
                value: vi.fn().mockResolvedValue(true),
                configurable: true
            });
            Object.defineProperty(entity, 'NewRecord', { value: vi.fn(), configurable: true });
            return { entity, history };
        };

        // Non-system cannot Save or Delete or pass CheckPermissions(Create/Update/Delete)
        const nonSys = makeGuestEntity(sharerUser);
        expect(nonSys.entity.CheckPermissions(EntityPermissionType.Create, false)).toBe(false);
        expect(await nonSys.entity.Save()).toBe(false);
        expect(await nonSys.entity.Delete()).toBe(false);
        expect(mssqlProvider.calls).toHaveLength(0);

        // SystemUser creates via spCreateArtifactGuestShareLink with zero null positional params
        const sysCreate = makeGuestEntity(sysUser);
        expect(sysCreate.entity.CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
        expect(await sysCreate.entity.Save()).toBe(true);
        expect(mssqlProvider.calls[0]?.sql).toContain('EXEC [__mj].[spCreateArtifactGuestShareLink]');
        expect((mssqlProvider.calls[0]?.params ?? []).includes(null)).toBe(false);

        // SystemUser deletes via spDeleteArtifactGuestShareLink
        mssqlProvider.calls.length = 0;
        expect(await sysCreate.entity.Delete()).toBe(true);
        expect(mssqlProvider.calls[0]?.sql).toContain('EXEC [__mj].[spDeleteArtifactGuestShareLink]');
    });

    it('gates RunView reads on MJ: Artifact Guest Share Links to CanShare || CanDelete and redacts TokenHash', async () => {
        const provider = new MockCollectionProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, _a, user) => ({
                ArtifactID: ARTIFACT_ID,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: user.ID === SHARER_ID,
                Source: user.ID === SHARER_ID ? 'ArtifactPermission' : 'Denied',
                Reason: 'Test'
            })
        );

        const params: RunViewParams = {
            EntityName: 'MJ: Artifact Guest Share Links',
            Fields: ['ID', 'Label'],
            ResultType: 'simple'
        };
        ArtifactGuestShareLinkPreRunViewHook(params, sharerUser, provider);
        expect(params.Fields).toEqual(['ID', 'Label', 'ArtifactID']);

        const raw: RunViewResult = {
            Success: true,
            Results: [{ ID: LINK_ID, ArtifactID: ARTIFACT_ID, Label: 'Board Packet', TokenHash: 'secret-sha' }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const sharerRes = await ArtifactGuestShareLinkPostRunViewHook(params, raw, sharerUser, provider);
        expect(sharerRes.Results).toHaveLength(1);
        expect((sharerRes.Results[0] as { TokenHash?: string }).TokenHash).toBe('');

        const outsiderRes = await ArtifactGuestShareLinkPostRunViewHook(
            { EntityName: 'MJ: Artifact Guest Share Links', ResultType: 'simple' },
            raw,
            outsiderUser,
            provider
        );
        expect(outsiderRes.Results).toEqual([]);
        expect(outsiderRes.TotalRowCount).toBe(0);
    });

    it('strips TokenHash and OldValue on InnerLoad/Load for authorized non-system users while preserving for SystemUser and denying outsiders', async () => {
        const provider = new MockCollectionProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, _a, user) => ({
                ArtifactID: ARTIFACT_ID,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: user.ID === SHARER_ID,
                Source: user.ID === SHARER_ID ? 'ArtifactPermission' : 'Denied',
                Reason: 'Test'
            })
        );

        const baseProto = Object.getPrototypeOf(MJArtifactGuestShareLinkEntityServer.prototype);
        const superInnerLoadSpy = vi.spyOn(baseProto, 'InnerLoad');

        const makeLoadedEntity = (actor: UserInfo) => {
            const entity = Object.create(MJArtifactGuestShareLinkEntityServer.prototype) as MJArtifactGuestShareLinkEntityServer;
            const fields = [
                {
                    Name: 'TokenHash',
                    Value: 'secret-sha-256',
                    OldValue: 'secret-sha-256',
                    ResetOldValue() {
                        this.OldValue = this.Value;
                    }
                }
            ];
            let tokenHashVal = 'secret-sha-256';
            Object.defineProperty(entity, 'ContextCurrentUser', { value: actor, configurable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
            Object.defineProperty(entity, 'ID', { value: LINK_ID, writable: true, configurable: true });
            Object.defineProperty(entity, 'ArtifactID', { value: ARTIFACT_ID, writable: true, configurable: true });
            Object.defineProperty(entity, 'Fields', { value: fields, configurable: true });
            Object.defineProperty(entity, 'TokenHash', {
                get: () => tokenHashVal,
                set: (v: string) => {
                    tokenHashVal = v;
                    fields[0]!.Value = v;
                },
                configurable: true
            });
            Object.defineProperty(entity, 'NewRecord', {
                value: () => {
                    entity.ID = '';
                    tokenHashVal = '';
                    fields[0]!.Value = '';
                    fields[0]!.OldValue = '';
                },
                configurable: true
            });
            return { entity, fields };
        };

        superInnerLoadSpy.mockResolvedValue(true);

        // Authorized sharer gets record back with TokenHash AND OldValue stripped
        const sharer = makeLoadedEntity(sharerUser);
        expect(await sharer.entity.Load(LINK_ID)).toBe(true);
        expect(sharer.entity.TokenHash).toBe('');
        expect(sharer.fields[0]?.OldValue).toBe('');

        // Unauthorized outsider fails closed
        const outsider = makeLoadedEntity(outsiderUser);
        expect(await outsider.entity.Load(LINK_ID)).toBe(false);
        expect(outsider.entity.ID).toBe('');
        expect(outsider.entity.TokenHash).toBe('');

        // SystemUser retains TokenHash for internal validation
        const sys = makeLoadedEntity(sysUser);
        expect(await sys.entity.Load(LINK_ID)).toBe(true);
        expect(sys.entity.TokenHash).toBe('secret-sha-256');
    });
});
