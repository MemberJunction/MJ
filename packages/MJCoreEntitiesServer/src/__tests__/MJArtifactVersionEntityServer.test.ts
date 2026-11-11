import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ClearAllDataHooks,
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    ExecuteSQLOptions,
    IMetadataProvider,
    InMemoryLocalStorageProvider,
    IRunViewProvider,
    LocalCacheManager,
    Metadata,
    ProviderBase,
    ProviderConfigDataBase,
    RoleInfo,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetGlobalObjectStore, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    ARTIFACT_VERSION_SAVED_EVENT_CODE,
    ArtifactVersionPostRunViewHook,
    ArtifactVersionPreRunViewHook,
    ArtifactVersionSavedEventPayload,
    CalculateContentSizeBytes,
    EnsureArtifactVersionReadHookRegistered,
    MJArtifactVersionEntityServer
} from '../custom/MJArtifactVersionEntityServer.server';

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

describe('CalculateContentSizeBytes', () => {
    it('returns 0 for empty string', () => {
        expect(CalculateContentSizeBytes('')).toBe(0);
    });

    it('returns character count for ASCII-only content', () => {
        expect(CalculateContentSizeBytes('hello')).toBe(5);
        expect(CalculateContentSizeBytes('{"a":1}')).toBe(7);
    });

    it('returns UTF-8 byte count (not character count) for multi-byte content', () => {
        expect(CalculateContentSizeBytes('héllo')).toBe(6);
        expect('héllo'.length).toBe(5);
    });

    it('handles 4-byte UTF-8 sequences (emoji)', () => {
        expect(CalculateContentSizeBytes('🎉')).toBe(4);
    });

    it('matches byte length of a stringified JSON payload', () => {
        const snapshot = { title: 'Q1 Revenue', rows: [{ id: 1, value: 100 }] };
        const json = JSON.stringify(snapshot);
        expect(CalculateContentSizeBytes(json)).toBe(Buffer.byteLength(json, 'utf8'));
    });
});

describe('MJArtifactVersionEntityServer permission enforcement (Blocker 2)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const readerUser = makeUser('11111111-1111-4111-8111-111111111111', 'reader@example.com');
    const editorUser = makeUser('22222222-2222-4222-8222-222222222222', 'editor@example.com');
    const ownerUser = makeUser('33333333-3333-4333-8333-333333333333', 'owner@example.com');
    const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fakeProvider = { Entities: [] } as unknown as IMetadataProvider;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeProvider, configurable: true });
        Object.defineProperty(editorUser, 'OwningProvider', { value: fakeProvider, configurable: true });
        Object.defineProperty(ownerUser, 'OwningProvider', { value: fakeProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId, user) => {
                const isOwner = user.ID === ownerUser.ID;
                const isEditor = isOwner || user.ID === editorUser.ID;
                const isReader = isEditor || user.ID === readerUser.ID;
                return {
                    ArtifactID: targetArtifactId,
                    CanRead: isReader,
                    CanEdit: isEditor,
                    CanDelete: isOwner,
                    CanShare: isOwner,
                    Source: isReader ? 'ArtifactPermission' : 'Denied',
                    Reason: isReader ? 'Allowed' : 'Denied'
                };
            }
        );
    });

    it('rejects Save() for read-only users and allows Save() for editors and systemUser', async () => {
        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'Save')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const history = [] as MJArtifactVersionEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'Content', { value: '', writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });
        Object.defineProperty(entity, 'GetFieldByName', {
            value: () => ({ Dirty: false }),
            configurable: true
        });

        Object.defineProperty(entity, 'ContextCurrentUser', { value: readerUser, writable: true });
        expect(await entity.Save()).toBe(false);
        expect(history[0]?.Message).toContain('does not hold Edit permission');
        expect(superSaveSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: editorUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);

        Object.defineProperty(entity, 'ContextCurrentUser', { value: systemUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects Delete() for editors without CanDelete and allows Delete() for owner', async () => {
        const superDeleteSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const history = [] as MJArtifactVersionEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });

        Object.defineProperty(entity, 'ContextCurrentUser', { value: editorUser, writable: true });
        expect(await entity.Delete()).toBe(false);
        expect(history[0]?.Message).toContain('does not hold Delete permission');
        expect(superDeleteSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: ownerUser, writable: true });
        expect(await entity.Delete()).toBe(true);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects InnerLoad() when caller lacks CanRead on ArtifactID and resets record via NewRecord()', async () => {
        vi.spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'InnerLoad').mockResolvedValue(true);

        const outsider = makeUser('99999999-9999-4999-8999-999999999999', 'outsider@example.com');
        Object.defineProperty(outsider, 'OwningProvider', { value: fakeProvider, configurable: true });

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const newRecordSpy = vi.fn();
        Object.defineProperty(entity, 'NewRecord', { value: newRecordSpy, configurable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: outsider, writable: true });

        const key = new CompositeKey([{ FieldName: 'ID', Value: 'ver-1' }]);
        expect(await entity.InnerLoad(key)).toBe(false);
        expect(newRecordSpy).toHaveBeenCalledTimes(1);

        // Generated MJArtifactVersionEntity.Load(ID) must also route through InnerLoad and deny!
        expect(await entity.Load('ver-1')).toBe(false);
        expect(newRecordSpy).toHaveBeenCalledTimes(2);
    });
});

describe('ArtifactVersionPreRunViewHook & ArtifactVersionPostRunViewHook narrow Fields & collection sharing (B3)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const readerUser = makeUser('11111111-1111-4111-8111-111111111111', 'reader@example.com');
    const outsiderUser = makeUser('99999999-9999-4999-8999-999999999999', 'outsider@example.com');
    const allowedArtifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const deniedArtifactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const allowedVersionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const deniedVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
    });

    it('augments narrow Fields in PreRunView, filters unauthorized rows in PostRunView, and strips synthetic ArtifactID', async () => {
        const fakeDbProvider = { ProviderType: 'Database', Entities: [] } as unknown as IMetadataProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: targetArtifactId === allowedArtifactId ? 'ArtifactPermission' : 'Denied',
                Reason: targetArtifactId === allowedArtifactId ? 'Allowed' : 'Denied'
            })
        );

        const origFields = ['ID', 'VersionNumber'];
        const callerParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            Fields: origFields,
            ResultType: 'simple'
        };
        const hookedParams = await ArtifactVersionPreRunViewHook(callerParams, readerUser);
        expect(hookedParams).toBe(callerParams);
        expect(hookedParams.Fields).toEqual(['ID', 'VersionNumber', 'ArtifactID']);
        expect(origFields).toEqual(['ID', 'VersionNumber']);

        const projectedResults: RunViewResult = {
            Success: true,
            Results: [
                { ID: allowedVersionId, VersionNumber: 3, ArtifactID: allowedArtifactId },
                { ID: deniedVersionId, VersionNumber: 1, ArtifactID: deniedArtifactId }
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filtered = await ArtifactVersionPostRunViewHook(hookedParams, projectedResults, readerUser);
        expect(filtered.Results).toEqual([{ ID: allowedVersionId, VersionNumber: 3 }]);
        expect(Object.prototype.hasOwnProperty.call(filtered.Results[0], 'ArtifactID')).toBe(false);
        expect(filtered.RowCount).toBe(1);
        expect(filtered.TotalRowCount).toBe(1);
    });

    it('classifies narrow VersionNumber-only projections from single-artifact ExtraFilter without dropping readable rows', async () => {
        const fakeDbProvider = { ProviderType: 'Database', Entities: [] } as unknown as IMetadataProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });
        Object.defineProperty(outsiderUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId, user) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId && user.ID === readerUser.ID,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: user.ID === readerUser.ID ? 'ArtifactPermission' : 'Denied',
                Reason: user.ID === readerUser.ID ? 'Allowed' : 'Denied'
            })
        );

        const maxVerParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${allowedArtifactId}'`,
            Fields: ['VersionNumber'],
            ResultType: 'simple'
        };
        const rawResults: RunViewResult = {
            Success: true,
            Results: [{ VersionNumber: 1 }, { VersionNumber: 2 }],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const allowed = await ArtifactVersionPostRunViewHook(maxVerParams, rawResults, readerUser);
        expect(allowed.Results).toEqual([{ VersionNumber: 1 }, { VersionNumber: 2 }]);

        const denied = await ArtifactVersionPostRunViewHook(maxVerParams, rawResults, outsiderUser);
        expect(denied.Results).toEqual([]);
        expect(denied.RowCount).toBe(0);
    });

    it('hydrates ArtifactID by version ID when PostRunView receives narrow ID-only rows without PreRunView', async () => {
        const runViewFn = vi.fn(async (params: RunViewParams, user?: UserInfo): Promise<RunViewResult> => {
            expect(user?.ID).toBe(systemUser.ID);
            expect(params.EntityName).toBe('MJ: Artifact Versions');
            return {
                Success: true,
                Results: [
                    { ID: allowedVersionId, ArtifactID: allowedArtifactId },
                    { ID: deniedVersionId, ArtifactID: deniedArtifactId }
                ],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        const fakeDbProvider = {
            ProviderType: 'Database',
            Entities: [],
            RunView: runViewFn
        } as unknown as IMetadataProvider & IRunViewProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: targetArtifactId === allowedArtifactId ? 'ArtifactPermission' : 'Denied',
                Reason: targetArtifactId === allowedArtifactId ? 'Allowed' : 'Denied'
            })
        );

        const narrowParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: 'VersionNumber >= 1',
            Fields: ['ID'],
            ResultType: 'simple'
        };
        const narrowResults: RunViewResult = {
            Success: true,
            Results: [{ ID: allowedVersionId }, { ID: deniedVersionId }],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filtered = await ArtifactVersionPostRunViewHook(narrowParams, narrowResults, readerUser);
        expect(runViewFn).toHaveBeenCalledTimes(1);
        expect(filtered.Results).toEqual([{ ID: allowedVersionId }]);
    });

    it('resolves collection-shared CanRead & CanEdit without recursing through ArtifactVersionPostRunViewHook', async () => {
        const collectionGrantee = makeUser('44444444-4444-4444-8444-444444444444', 'col@example.com');
        const ownerId = '33333333-3333-4333-8333-333333333333';
        const collectionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

        const mockProvider = {
            ProviderType: 'Database',
            Entities: [],
            RunView: vi.fn(async (rawParams: RunViewParams, actor?: UserInfo): Promise<RunViewResult> => {
                const hooked = await ArtifactVersionPreRunViewHook(rawParams, actor);
                let res: RunViewResult;
                if (hooked.EntityName === 'MJ: Artifacts') {
                    res = {
                        Success: true,
                        Results: [
                            {
                                ID: allowedArtifactId,
                                UserID: ownerId,
                                DelegateEntityID: null,
                                DelegateRecordID: null
                            }
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Artifact Permissions') {
                    res = {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Artifact Versions') {
                    const row: Record<string, unknown> = { ID: allowedVersionId };
                    if (hooked.Fields?.includes('ArtifactID')) {
                        row['ArtifactID'] = allowedArtifactId;
                    }
                    res = {
                        Success: true,
                        Results: [row],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Collection Artifacts') {
                    res = {
                        Success: true,
                        Results: [{ CollectionID: collectionId }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Collection Permissions') {
                    res = {
                        Success: true,
                        Results: [{ CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else {
                    res = {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                return ArtifactVersionPostRunViewHook(hooked, res, actor);
            })
        } as unknown as IMetadataProvider & IRunViewProvider;

        Object.defineProperty(collectionGrantee, 'OwningProvider', {
            value: mockProvider,
            configurable: true
        });

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            mockProvider,
            allowedArtifactId,
            collectionGrantee
        );
        expect(perms.CanRead).toBe(true);
        expect(perms.CanEdit).toBe(true);
        expect(perms.Source).toBe('CollectionPermission');

        // Also verify collectionGrantee can run a narrow `Fields: ['ID']` query on MJ: Artifact Versions directly
        const narrowRes = await mockProvider.RunView(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${allowedArtifactId}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            },
            collectionGrantee
        );
        expect(narrowRes.Results).toEqual([{ ID: allowedVersionId }]);
    });
});

interface MockVersionRow {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Content: string;
    __mj_UpdatedAt: string;
}

const CACHE_ROLE_ID = '77777777-7777-4777-8777-777777777777';
const VERSION_ENTITY_ID = '55555555-5555-4555-8555-555555555555';
const ARTIFACT_ENTITY_ID = '55555555-5555-4555-8555-555555555556';
const ARTIFACT_PERM_ENTITY_ID = '55555555-5555-4555-8555-555555555557';
const COLLECTION_ART_ENTITY_ID = '55555555-5555-4555-8555-555555555558';
const COLLECTION_PERM_ENTITY_ID = '55555555-5555-4555-8555-555555555559';

function buildSupportEntityInfo(
    id: string,
    name: string,
    baseTable: string,
    baseView: string,
    extraFieldNames: string[]
): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: '__mj',
        BaseTable: baseTable,
        BaseView: baseView,
        AllowCaching: false,
        IncludeInAPI: true,
        Status: 'Active',
        EntityFields: [
            {
                ID: `${id}-f-id`,
                EntityID: id,
                Name: 'ID',
                CodeName: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                Sequence: 1,
                Status: 'Active'
            },
            ...extraFieldNames.map((fieldName, idx) => ({
                ID: `${id}-f-${idx + 2}`,
                EntityID: id,
                Name: fieldName,
                CodeName: fieldName,
                Type: 'nvarchar',
                Sequence: idx + 2,
                Status: 'Active'
            }))
        ],
        EntityPermissions: [
            {
                ID: `${id}-p-dev`,
                EntityID: id,
                RoleID: CACHE_ROLE_ID,
                CanRead: true,
                CanCreate: true,
                CanUpdate: true,
                CanDelete: true
            }
        ]
    });
}

class TestServerVersionProvider extends DatabaseProviderBase {
    public internalRunViewCalls: Array<{
        EntityName?: string;
        Fields?: string[];
        ExtraFilter?: RunViewParams['ExtraFilter'];
    }> = [];
    private readonly _entities: EntityInfo[];
    private readonly _roles: RoleInfo[];
    private readonly _handler: (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult>;

    public constructor(
        handler: (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult>
    ) {
        super();
        this._handler = handler;
        this._roles = [new RoleInfo({ ID: CACHE_ROLE_ID, Name: 'Developer' })];
        this._entities = [
            new EntityInfo({
                ID: VERSION_ENTITY_ID,
                Name: 'MJ: Artifact Versions',
                SchemaName: '__mj',
                BaseTable: 'ArtifactVersion',
                BaseView: 'vwArtifactVersions',
                AllowCaching: true,
                TrustServerCacheCompletely: true,
                IncludeInAPI: true,
                Status: 'Active',
                EntityFields: [
                    {
                        ID: 'f-id',
                        EntityID: VERSION_ENTITY_ID,
                        Name: 'ID',
                        CodeName: 'ID',
                        Type: 'uniqueidentifier',
                        IsPrimaryKey: true,
                        Sequence: 1,
                        Status: 'Active'
                    },
                    {
                        ID: 'f-art',
                        EntityID: VERSION_ENTITY_ID,
                        Name: 'ArtifactID',
                        CodeName: 'ArtifactID',
                        Type: 'uniqueidentifier',
                        Sequence: 2,
                        Status: 'Active'
                    },
                    {
                        ID: 'f-ver',
                        EntityID: VERSION_ENTITY_ID,
                        Name: 'VersionNumber',
                        CodeName: 'VersionNumber',
                        Type: 'int',
                        Sequence: 3,
                        Status: 'Active'
                    },
                    {
                        ID: 'f-content',
                        EntityID: VERSION_ENTITY_ID,
                        Name: 'Content',
                        CodeName: 'Content',
                        Type: 'nvarchar',
                        Sequence: 4,
                        Status: 'Active'
                    },
                    {
                        ID: 'f-upd',
                        EntityID: VERSION_ENTITY_ID,
                        Name: '__mj_UpdatedAt',
                        CodeName: '__mj_UpdatedAt',
                        Type: 'datetimeoffset',
                        Sequence: 5,
                        Status: 'Active'
                    }
                ],
                EntityPermissions: [
                    {
                        ID: 'p-dev',
                        EntityID: VERSION_ENTITY_ID,
                        RoleID: CACHE_ROLE_ID,
                        CanRead: true,
                        CanCreate: true,
                        CanUpdate: true,
                        CanDelete: true
                    }
                ]
            }),
            buildSupportEntityInfo(ARTIFACT_ENTITY_ID, 'MJ: Artifacts', 'Artifact', 'vwArtifacts', [
                'UserID',
                'DelegateEntityID',
                'DelegateRecordID'
            ]),
            buildSupportEntityInfo(
                ARTIFACT_PERM_ENTITY_ID,
                'MJ: Artifact Permissions',
                'ArtifactPermission',
                'vwArtifactPermissions',
                ['ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare']
            ),
            buildSupportEntityInfo(
                COLLECTION_ART_ENTITY_ID,
                'MJ: Collection Artifacts',
                'CollectionArtifact',
                'vwCollectionArtifacts',
                ['CollectionID', 'ArtifactVersionID']
            ),
            buildSupportEntityInfo(
                COLLECTION_PERM_ENTITY_ID,
                'MJ: Collection Permissions',
                'CollectionPermission',
                'vwCollectionPermissions',
                ['CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare']
            )
        ];
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

    protected override get DBDefaultFunctionPattern(): RegExp {
        return /^getutcdate\(\)$/i;
    }

    public override async BeginTransaction(): Promise<void> {}
    public override async CommitTransaction(): Promise<void> {}
    public override async RollbackTransaction(): Promise<void> {}

    public override async ExecuteSQL<T>(
        _sql: string,
        _params?: unknown[],
        _options?: ExecuteSQLOptions
    ): Promise<Array<T>> {
        return [];
    }

    protected override async InternalRunView<T>(
        params: RunViewParams,
        contextUser?: UserInfo
    ): Promise<RunViewResult<T>> {
        this.internalRunViewCalls.push({
            EntityName: params.EntityName,
            Fields: Array.isArray(params.Fields) ? [...params.Fields] : undefined,
            ExtraFilter: params.ExtraFilter
        });
        const res = await this._handler(params, contextUser);
        return res as RunViewResult<T>;
    }

    protected override async InternalRunViews<T>(
        paramsArray: RunViewParams[],
        contextUser?: UserInfo
    ): Promise<RunViewResult<T>[]> {
        return Promise.all(paramsArray.map((p) => this.InternalRunView<T>(p, contextUser)));
    }
}

function makeRoleUser(id: string, email: string, provider: IMetadataProvider): UserInfo {
    return new UserInfo(provider, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: [{ UserID: id, RoleID: CACHE_ROLE_ID, Role: 'Developer' }]
    });
}

function resetLocalCacheSingleton(): void {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store['___SINGLETON__LocalCacheManager'];
    }
}

describe('R5-1 & R5-2: Concurrency security, fail-closed lookups, and TrustLocalCacheCompletely cache preservation', () => {
    const systemUserId = '00000000-0000-4000-8000-000000000001';
    const ownerUserId = '33333333-3333-4333-8333-333333333333';
    const unauthorizedUserId = '99999999-9999-4999-8999-999999999999';
    const targetArtifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const targetVersionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    let savedDedupLingerMs = 0;

    beforeEach(() => {
        vi.restoreAllMocks();
        savedDedupLingerMs = ProviderBase.DedupLingerMs;
        ProviderBase.DedupLingerMs = 0;
        ClearAllDataHooks();
        EnsureArtifactVersionReadHookRegistered();
        resetLocalCacheSingleton();
    });

    afterEach(() => {
        ProviderBase.DedupLingerMs = savedDedupLingerMs;
        resetLocalCacheSingleton();
        ClearAllDataHooks();
        EnsureArtifactVersionReadHookRegistered();
        vi.restoreAllMocks();
    });

    it('denies BOTH simultaneous RunView calls for the same unauthorized user + artifact with zero in-flight race bypass (R5-1)', async () => {
        const storedRow: MockVersionRow = {
            ID: targetVersionId,
            ArtifactID: targetArtifactId,
            VersionNumber: 1,
            Content: 'TOP SECRET CONFIDENTIAL CONTENT',
            __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
        };
        const provider = new TestServerVersionProvider(async () => ({
            Success: true,
            Results: [{ ...storedRow }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));
        const systemUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        const unauthorizedUser = makeRoleUser(unauthorizedUserId, 'intruder@example.com', provider);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);

        let resolveCalls = 0;
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, artId) => {
                resolveCalls++;
                await new Promise<void>((r) => setTimeout(r, 25));
                return {
                    ArtifactID: artId,
                    CanRead: false,
                    CanEdit: false,
                    CanDelete: false,
                    CanShare: false,
                    Source: 'Denied',
                    Reason: 'Unauthorized'
                };
            }
        );

        const [res1, res2] = await Promise.all([
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                    MaxRows: 5,
                    BypassCache: true,
                    ResultType: 'simple'
                },
                unauthorizedUser
            ),
            new Promise<void>((r) => setTimeout(r, 5)).then(() =>
                provider.RunView<MockVersionRow>(
                    {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                        MaxRows: 10,
                        BypassCache: true,
                        ResultType: 'simple'
                    },
                    unauthorizedUser
                )
            )
        ]);

        expect(resolveCalls).toBe(2);
        expect(res1.Results).toEqual([]);
        expect(res2.Results).toEqual([]);
        expect(res1.RowCount).toBe(0);
        expect(res2.RowCount).toBe(0);
    });

    it('fails CLOSED when a row lacks ArtifactID/ID or when the system ID -> ArtifactID lookup fails or throws (R5-1)', async () => {
        let lookupMode: 'fail-status' | 'throw' = 'fail-status';
        const provider = new TestServerVersionProvider(async () => {
            if (lookupMode === 'throw') {
                throw new Error('Simulated DB error during system ArtifactID hydration');
            }
            return {
                Success: false,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: 'Simulated system lookup failure'
            };
        });
        const systemUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        const unauthorizedUser = makeRoleUser(unauthorizedUserId, 'intruder@example.com', provider);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);

        // 1. Unclassifiable row (neither ArtifactID, single-artifact ExtraFilter, nor ID) -> dropped
        const unclassifiable = await ArtifactVersionPostRunViewHook(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: 'VersionNumber >= 1',
                Fields: ['VersionNumber'],
                ResultType: 'simple'
            },
            {
                Success: true,
                Results: [{ VersionNumber: 1 }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            unauthorizedUser
        );
        expect(unclassifiable.Results).toEqual([]);
        expect(unclassifiable.RowCount).toBe(0);

        // 2. System lookup returns Success: false -> dropped (fail closed)
        const failedLookup = await ArtifactVersionPostRunViewHook(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: 'VersionNumber >= 1',
                Fields: ['ID'],
                ResultType: 'simple'
            },
            {
                Success: true,
                Results: [{ ID: targetVersionId }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            unauthorizedUser
        );
        expect(failedLookup.Results).toEqual([]);
        expect(failedLookup.RowCount).toBe(0);

        // 3. System lookup throws -> dropped (fail closed)
        lookupMode = 'throw';
        const thrownLookup = await ArtifactVersionPostRunViewHook(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: 'VersionNumber >= 1',
                Fields: ['ID'],
                ResultType: 'simple'
            },
            {
                Success: true,
                Results: [{ ID: targetVersionId }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            unauthorizedUser
        );
        expect(thrownLookup.Results).toEqual([]);
        expect(thrownLookup.RowCount).toBe(0);
    });

    it('preserves full Content in LocalCacheManager after a narrow RunView when TrustLocalCacheCompletely is true (R5-2)', async () => {
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), {
            enabled: true,
            maxSizeBytes: 10 * 1024 * 1024,
            defaultTTLMs: 60_000,
            evictionPolicy: 'lru'
        });

        const fullDbRow: MockVersionRow = {
            ID: targetVersionId,
            ArtifactID: targetArtifactId,
            VersionNumber: 4,
            Content: '# Full Cached Markdown Body\n\nNever poisoned by narrow Fields.',
            __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
        };

        const provider = new TestServerVersionProvider(async (params) => {
            // Simulate SQL projection: return ONLY the columns present in `params.Fields` (or all columns when omitted).
            const requested = Array.isArray(params.Fields) && params.Fields.length > 0 ? params.Fields : null;
            const projected: Record<string, string | number> = {};
            const entries: Array<[keyof MockVersionRow, string | number]> = [
                ['ID', fullDbRow.ID],
                ['ArtifactID', fullDbRow.ArtifactID],
                ['VersionNumber', fullDbRow.VersionNumber],
                ['Content', fullDbRow.Content],
                ['__mj_UpdatedAt', fullDbRow.__mj_UpdatedAt]
            ];
            for (const [col, val] of entries) {
                if (!requested || requested.some((f) => f.toLowerCase() === col.toLowerCase())) {
                    projected[col] = val;
                }
            }
            return {
                Success: true,
                Results: [projected],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        const systemUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        const ownerUser = makeRoleUser(ownerUserId, 'owner@example.com', provider);
        const intruderUser = makeRoleUser(unauthorizedUserId, 'intruder@example.com', provider);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, artId, user) => ({
                ArtifactID: artId,
                CanRead: UUIDsEqual(user.ID, ownerUser.ID),
                CanEdit: UUIDsEqual(user.ID, ownerUser.ID),
                CanDelete: UUIDsEqual(user.ID, ownerUser.ID),
                CanShare: UUIDsEqual(user.ID, ownerUser.ID),
                Source: UUIDsEqual(user.ID, ownerUser.ID) ? 'Owner' : 'Denied',
                Reason: UUIDsEqual(user.ID, ownerUser.ID) ? 'Owner' : 'Denied'
            })
        );

        // 1. Narrow read warms LocalCacheManager while returning ONLY { ID, VersionNumber } to caller
        const narrowCallerFields = ['ID', 'VersionNumber'];
        const narrowRes = await provider.RunView<{ ID: string; VersionNumber: number; Content?: string }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                Fields: narrowCallerFields,
                ResultType: 'simple'
            },
            ownerUser
        );
        expect(narrowCallerFields).toEqual(['ID', 'VersionNumber']);
        expect(narrowRes.Success).toBe(true);
        expect(narrowRes.Results).toEqual([{ ID: targetVersionId, VersionNumber: 4 }]);
        expect(Object.prototype.hasOwnProperty.call(narrowRes.Results[0], 'ArtifactID')).toBe(false);
        expect(provider.internalRunViewCalls).toHaveLength(1);

        // 2. Subsequent full read hits LocalCacheManager (no second InternalRunView!) and STILL returns full Content!
        const fullRes = await provider.RunView<MockVersionRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                ResultType: 'simple'
            },
            ownerUser
        );
        expect(provider.internalRunViewCalls).toHaveLength(1);
        expect(fullRes.Success).toBe(true);
        expect(fullRes.Results).toHaveLength(1);
        expect(fullRes.Results[0]?.Content).toBe(fullDbRow.Content);

        // 3. Unauthorized user with the SAME role hitting the warm cache is still denied (0 rows)!
        const deniedCacheHit = await provider.RunView<MockVersionRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                ResultType: 'simple'
            },
            intruderUser
        );
        expect(provider.internalRunViewCalls).toHaveLength(1);
        expect(deniedCacheHit.Results).toEqual([]);
        expect(deniedCacheHit.RowCount).toBe(0);

        // 4. R6-3: Server RunView with missing `contextUser` (`undefined`) hitting the warm cache
        //    (where ProviderBase.RunView skips CheckUserReadPermissions on cache hit!) MUST also
        //    fail closed and scrub all cached Content rows!
        const missingUserCacheHit = await provider.RunView<MockVersionRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                ResultType: 'simple'
            },
            undefined
        );
        expect(missingUserCacheHit.Results).toEqual([]);
        expect(missingUserCacheHit.RowCount).toBe(0);
        expect(missingUserCacheHit.TotalRowCount).toBe(0);
    });

    it('preserves server-vetted Results on Network providers (DSLC2) and fails closed on Database or null providers when contextUser === undefined (R6-3)', async () => {
        const serverVettedResults: RunViewResult<MockVersionRow> = {
            Success: true,
            Results: [
                {
                    ID: targetVersionId,
                    ArtifactID: targetArtifactId,
                    VersionNumber: 2,
                    Content: 'Shared Read-Only child content',
                    __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
                }
            ],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const networkProviderPartial: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: []
        };
        const providerGetterSpy = vi
            .spyOn(Metadata, 'Provider', 'get')
            .mockReturnValue(networkProviderPartial as IMetadataProvider);

        const clientParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${targetArtifactId}'`,
            ResultType: 'simple'
        };
        const preParams = await ArtifactVersionPreRunViewHook(clientParams, undefined);
        expect(preParams).toBe(clientParams);

        const clientPostRes = await ArtifactVersionPostRunViewHook(
            clientParams,
            serverVettedResults,
            undefined
        );
        expect(clientPostRes.Results).toHaveLength(1);
        expect((clientPostRes.Results[0] as MockVersionRow).Content).toBe('Shared Read-Only child content');

        // R6-3a: Database provider with contextUser === undefined fails closed (scrubs all rows)
        const dbProviderPartial: Partial<IMetadataProvider> = {
            ProviderType: 'Database',
            Entities: []
        };
        providerGetterSpy.mockReturnValue(dbProviderPartial as IMetadataProvider);
        const serverMissingUserRes = await ArtifactVersionPostRunViewHook(
            clientParams,
            serverVettedResults,
            undefined
        );
        expect(serverMissingUserRes.Results).toEqual([]);
        expect(serverMissingUserRes.RowCount).toBe(0);
        expect(serverMissingUserRes.TotalRowCount).toBe(0);

        // R6-3b: Null provider with contextUser === undefined also fails closed
        providerGetterSpy.mockRestore();
        const origProviderDesc = Object.getOwnPropertyDescriptor(Metadata, 'Provider');
        Object.defineProperty(Metadata, 'Provider', {
            get: () => null,
            configurable: true
        });
        try {
            const nullProviderRes = await ArtifactVersionPostRunViewHook(
                clientParams,
                serverVettedResults,
                undefined
            );
            expect(nullProviderRes.Results).toEqual([]);
            expect(nullProviderRes.RowCount).toBe(0);
            expect(nullProviderRes.TotalRowCount).toBe(0);
        } finally {
            if (origProviderDesc) {
                Object.defineProperty(Metadata, 'Provider', origProviderDesc);
            }
        }

        // By contrast, a server call WITH contextUser on an unclassifiable row still fails closed
        const provider = new TestServerVersionProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));
        const serverUser = makeRoleUser(unauthorizedUserId, 'intruder@example.com', provider);
        const serverUnclassifiableRes = await ArtifactVersionPostRunViewHook(
            { EntityName: 'MJ: Artifact Versions', ResultType: 'simple' },
            {
                Success: true,
                Results: [{ Content: 'Unclassifiable server row' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            serverUser
        );
        expect(serverUnclassifiableRes.Results).toEqual([]);
        expect(serverUnclassifiableRes.RowCount).toBe(0);
    });

    it('returns [1, 1, 1] rows across 3 concurrent Promise.all calls through ArtifactVersionPostRunViewHook and RunView for artifact owner and collection-shared reader (R7-2)', async () => {
        const sharedReaderId = '44444444-4444-4444-8444-444444444444';
        const collectionId = '66666666-6666-4666-8666-666666666666';

        const provider = new TestServerVersionProvider(async (params) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: targetArtifactId,
                            UserID: ownerUserId,
                            DelegateEntityID: null,
                            DelegateRecordID: null
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return {
                    Success: true,
                    Results: [{ CollectionID: collectionId }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [
                        {
                            CanRead: true,
                            CanEdit: false,
                            CanDelete: false,
                            CanShare: false
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return {
                Success: true,
                Results: [
                    {
                        ID: targetVersionId,
                        ArtifactID: targetArtifactId,
                        VersionNumber: 1,
                        Content: 'Concurrent read content',
                        __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
                    }
                ],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        const systemUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        const ownerUser = makeRoleUser(ownerUserId, 'owner@example.com', provider);
        const sharedReader = makeRoleUser(sharedReaderId, 'shared@example.com', provider);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);

        // 1. Direct concurrent ArtifactVersionPostRunViewHook calls by artifact owner
        const makeHookInput = (): RunViewResult<MockVersionRow> => ({
            Success: true,
            Results: [
                {
                    ID: targetVersionId,
                    ArtifactID: targetArtifactId,
                    VersionNumber: 1,
                    Content: 'Concurrent read content',
                    __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
                }
            ],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        });
        const hookParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${targetArtifactId}'`,
            ResultType: 'simple'
        };
        const concurrentHookResults = await Promise.all([
            ArtifactVersionPostRunViewHook(hookParams, makeHookInput(), ownerUser, provider),
            ArtifactVersionPostRunViewHook(hookParams, makeHookInput(), ownerUser, provider),
            ArtifactVersionPostRunViewHook(hookParams, makeHookInput(), ownerUser, provider)
        ]);
        expect(concurrentHookResults.map((r) => r.Results.length)).toEqual([1, 1, 1]);

        // 2. Concurrent provider.RunView calls by artifact owner (distinct filters avoid ProviderBase dedup)
        const concurrentOwnerRunViews = await Promise.all([
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber >= 1`,
                    ResultType: 'simple'
                },
                ownerUser
            ),
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber >= 2`,
                    ResultType: 'simple'
                },
                ownerUser
            ),
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber >= 3`,
                    ResultType: 'simple'
                },
                ownerUser
            )
        ]);
        expect(concurrentOwnerRunViews.map((r) => r.Results.length)).toEqual([1, 1, 1]);

        // 3. Concurrent provider.RunView calls by collection-shared reader (exercises inner system-user version lookup)
        const concurrentSharedRunViews = await Promise.all([
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber = 1`,
                    ResultType: 'simple'
                },
                sharedReader
            ),
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber = 2`,
                    ResultType: 'simple'
                },
                sharedReader
            ),
            provider.RunView<MockVersionRow>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${targetArtifactId}' AND VersionNumber = 3`,
                    ResultType: 'simple'
                },
                sharedReader
            )
        ]);
        expect(concurrentSharedRunViews.map((r) => r.Results.length)).toEqual([1, 1, 1]);
    });

    it('uses hookProvider ahead of global Metadata.Provider in hybrid processes when contextUser is undefined (R6-3 provider inference)', async () => {
        const sampleResults: RunViewResult<MockVersionRow> = {
            Success: true,
            Results: [
                {
                    ID: targetVersionId,
                    ArtifactID: targetArtifactId,
                    VersionNumber: 1,
                    Content: 'Hybrid process content',
                    __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
                }
            ],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const networkProviderPartial: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: []
        };
        const databaseProviderPartial: Partial<IMetadataProvider> = {
            ProviderType: 'Database',
            Entities: []
        };

        // Case A: Global Metadata.Provider is Network, but explicit hookProvider is Database -> fail closed (0 rows)
        const providerGetterSpy = vi
            .spyOn(Metadata, 'Provider', 'get')
            .mockReturnValue(networkProviderPartial as IMetadataProvider);

        const dbParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            Fields: ['ID'],
            ResultType: 'simple'
        };
        ArtifactVersionPreRunViewHook(dbParams, undefined, databaseProviderPartial as IMetadataProvider);
        expect(dbParams.Fields).toEqual(['ID', 'ArtifactID']);

        const dbHookResult = await ArtifactVersionPostRunViewHook(
            dbParams,
            sampleResults,
            undefined,
            databaseProviderPartial as IMetadataProvider
        );
        expect(dbHookResult.Results).toEqual([]);
        expect(dbHookResult.RowCount).toBe(0);
        expect(dbHookResult.TotalRowCount).toBe(0);

        // Case B: Global Metadata.Provider is Database, but explicit hookProvider is Network -> pass rows through
        providerGetterSpy.mockReturnValue(databaseProviderPartial as IMetadataProvider);

        const netParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            Fields: ['ID'],
            ResultType: 'simple'
        };
        ArtifactVersionPreRunViewHook(netParams, undefined, networkProviderPartial as IMetadataProvider);
        expect(netParams.Fields).toEqual(['ID']);

        const netHookResult = await ArtifactVersionPostRunViewHook(
            netParams,
            sampleResults,
            undefined,
            networkProviderPartial as IMetadataProvider
        );
        expect(netHookResult.Results).toHaveLength(1);
        expect((netHookResult.Results[0] as MockVersionRow).Content).toBe('Hybrid process content');

        providerGetterSpy.mockRestore();
    });

    it('never recurses infinitely when custom WellKnownUserSource GetSystemUser is NOT matched by isServerSystemUser (Round 8 recursion guard)', async () => {
        const sharedReaderId = '44444444-4444-4444-8444-444444444444';
        const collectionId = '66666666-6666-4666-8666-666666666666';
        const customServiceActorId = '77777777-7777-4777-8777-777777777777';
        let versionQueryCount = 0;

        const provider = new TestServerVersionProvider(async (params) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                versionQueryCount++;
                if (versionQueryCount > 10) {
                    throw new Error('Infinite recursion detected on MJ: Artifact Versions RunView');
                }
                return {
                    Success: true,
                    Results: [
                        {
                            ID: targetVersionId,
                            ArtifactID: targetArtifactId,
                            VersionNumber: 1,
                            Content: 'Collection-shared content',
                            __mj_UpdatedAt: '2026-11-10T12:00:00.000Z'
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: targetArtifactId,
                            UserID: ownerUserId,
                            DelegateEntityID: null,
                            DelegateRecordID: null
                        }
                    ],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return {
                    Success: true,
                    Results: [{ CollectionID: collectionId }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [{ CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
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

        const cachedSysUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        const customServiceActor = makeRoleUser(customServiceActorId, 'custom-wellknown@example.com', provider);
        const sharedReader = makeRoleUser(sharedReaderId, 'shared@example.com', provider);

        // UserCache knows cachedSysUser, while WellKnownUserSource returns customServiceActor AND IsSystemUser returns false!
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(cachedSysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(customServiceActor);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockReturnValue(false);

        const result = await provider.RunView<MockVersionRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${targetArtifactId}'`,
                Fields: ['ID', 'Content'],
                ResultType: 'simple'
            },
            sharedReader
        );

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(1);
        expect(result.Results[0]?.Content).toBe('Collection-shared content');
        // 1 outer caller RunView + 1 inner loadCollectionPermissionRows RunView (which skips recursive hook!)
        expect(versionQueryCount).toBe(2);
    });

    it('includes Description, Comments, and IsRestore on ARTIFACT_VERSION_SAVED_EVENT_CODE payload when saving a restored version (R8-2e)', async () => {
        const provider = new TestServerVersionProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));
        const sysUser = makeRoleUser(systemUserId, 'sys@example.com', provider);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(MJArtifactVersionEntityServer.prototype, 'ExtractAndSaveAttributes').mockResolvedValue(undefined);
        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'Save')
            .mockResolvedValue(true);

        const capturedEvents: ArtifactVersionSavedEventPayload[] = [];
        const sub = MJGlobal.Instance.GetEventListener(false).subscribe((evt) => {
            if (evt.event === MJEventType.ComponentEvent && evt.eventCode === ARTIFACT_VERSION_SAVED_EVENT_CODE) {
                capturedEvents.push(evt.args as ArtifactVersionSavedEventPayload);
            }
        });

        try {
            const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
            Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
            Object.defineProperty(entity, 'ID', { value: targetVersionId, writable: true });
            Object.defineProperty(entity, 'ArtifactID', { value: targetArtifactId, writable: true });
            Object.defineProperty(entity, 'VersionNumber', { value: 4, writable: true });
            Object.defineProperty(entity, 'Content', { value: '# Restored Doc\n', writable: true });
            Object.defineProperty(entity, 'ContentHash', { value: '', writable: true });
            Object.defineProperty(entity, 'ContentSizeBytes', { value: 0, writable: true });
            Object.defineProperty(entity, 'Description', { value: 'Restored from v2', writable: true });
            Object.defineProperty(entity, 'Comments', { value: null, writable: true });
            Object.defineProperty(entity, 'UserID', { value: sysUser.ID, writable: true });
            Object.defineProperty(entity, 'ContextCurrentUser', { value: sysUser, writable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
            Object.defineProperty(entity, 'GetFieldByName', {
                value: () => ({ Dirty: true, OldValue: '# Old\n' }),
                configurable: true
            });

            const saved = await entity.Save();
            expect(saved).toBe(true);
            expect(capturedEvents).toHaveLength(1);
            expect(capturedEvents[0]?.Description).toBe('Restored from v2');
            expect(capturedEvents[0]?.PreviousContent).toBe('# Old\n');
            expect(capturedEvents[0]?.IsRestore).toBe(true);
        } finally {
            sub.unsubscribe();
            superSaveSpy.mockRestore();
        }
    });
});
