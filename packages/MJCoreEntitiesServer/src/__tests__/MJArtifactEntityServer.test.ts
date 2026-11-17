import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEntityResult, EntityDeleteOptions, EntityInfo, EntitySaveOptions, IMetadataProvider, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import {
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    DelegatePermissionDecision,
    SpreadsheetEngine
} from '@memberjunction/core-entities';
import {
    AppendSqlAndFilter,
    ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES,
    BuildSqlArtifactReadablePredicate,
    BuildSqlArtifactReadablePredicateAsync,
    BuildSqlArtifactVersionIdReadablePredicate,
    BuildSqlCollectionReadablePredicate,
    BuildSqlCollectionReadablePredicateAsync,
    QualifyOuterEntityColumn,
    QualifyOuterEntityColumnAsync,
    ResolveTargetEntityNameAsync
} from '../custom/ArtifactSecurityHookHelpers';
import {
    RunSpreadsheetEvaluateInWorker,
    RunSpreadsheetImportInWorker,
    RunSpreadsheetPatchInWorker
} from '../custom/SpreadsheetWorkerRunner';
import { ArtifactGuestShareLinkPreRunViewHook } from '../custom/MJArtifactGuestShareLinkEntityServer.server';
import { CollectionArtifactPreRunViewHook } from '../custom/MJCollectionArtifactEntityServer.server';
import { ArtifactVersionPostRunViewHook, ArtifactVersionPreRunViewHook } from '../custom/MJArtifactVersionEntityServer.server';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target
    };
});

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: {
            GetSystemUser: () => ({ ID: SYSTEM_USER_ID })
        }
    }
}));

interface StubFieldEntry {
    Name: string;
    Dirty: boolean;
    OldValue: string | null;
    Value: string | null;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();

    class StubArtifactEntity {
        public ID = '11111111-1111-4111-8111-111111111111';
        public Name = 'Test Artifact';
        public Description: string | null = null;
        public IsSaved = true;
        public ContextCurrentUser: UserInfo | undefined = undefined;
        public ProviderToUse: IMetadataProvider | undefined = undefined;
        public SuperSaveCalls = 0;
        public SuperDeleteCalls = 0;
        public SuperSaveReturn = true;
        public SuperDeleteReturn = true;
        public ResultHistory: BaseEntityResult[] = [];
        public Fields: StubFieldEntry[] = [];

        public get LatestResult(): BaseEntityResult | null {
            return this.ResultHistory.length > 0 ? this.ResultHistory[this.ResultHistory.length - 1] : null;
        }

        public get UserID(): string {
            return this.GetFieldByName('UserID')?.Value ?? '';
        }
        public set UserID(val: string) {
            this.updateFieldValue('UserID', val);
        }

        public get DelegateEntityID(): string | null {
            return this.GetFieldByName('DelegateEntityID')?.Value ?? null;
        }
        public set DelegateEntityID(val: string | null) {
            this.updateFieldValue('DelegateEntityID', val);
        }

        public get DelegateRecordID(): string | null {
            return this.GetFieldByName('DelegateRecordID')?.Value ?? null;
        }
        public set DelegateRecordID(val: string | null) {
            this.updateFieldValue('DelegateRecordID', val);
        }

        public get DelegateEntity(): string | null {
            return this.GetFieldByName('DelegateEntity')?.Value ?? null;
        }

        public GetFieldByName(name: string): StubFieldEntry | undefined {
            return this.Fields.find((f) => f.Name === name);
        }

        public SeedField(name: string, oldValue: string | null, value: string | null): void {
            const idx = this.Fields.findIndex((f) => f.Name === name);
            const entry: StubFieldEntry = {
                Name: name,
                Dirty: oldValue !== value,
                OldValue: oldValue,
                Value: value
            };
            if (idx >= 0) {
                this.Fields[idx] = entry;
            } else {
                this.Fields.push(entry);
            }
        }

        private updateFieldValue(name: string, value: string | null): void {
            const existing = this.GetFieldByName(name);
            if (existing) {
                existing.Value = value;
                existing.Dirty = existing.OldValue !== value;
            } else {
                this.Fields.push({
                    Name: name,
                    Dirty: true,
                    OldValue: null,
                    Value: value
                });
            }
        }

        public RegisterResultHistoryEntry(result: BaseEntityResult): void {
            this.ResultHistory.push(result);
        }

        public async InnerLoad(): Promise<boolean> {
            return true;
        }

        public NewRecord(): void {
            this.ID = '';
            this.IsSaved = false;
        }

        public async Save(_options?: EntitySaveOptions): Promise<boolean> {
            this.SuperSaveCalls++;
            return this.SuperSaveReturn;
        }

        public async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
            this.SuperDeleteCalls++;
            return this.SuperDeleteReturn;
        }
    }

    return {
        ...actual,
        MJArtifactEntity: StubArtifactEntity
    };
});

import {
    ArtifactPostRunViewHook,
    ArtifactPreRunViewHook,
    MJArtifactEntityServer
} from '../custom/MJArtifactEntityServer.server';

interface StubArtifactHost {
    ID: string;
    Name: string;
    IsSaved: boolean;
    ContextCurrentUser: UserInfo | undefined;
    ProviderToUse: IMetadataProvider | undefined;
    SuperSaveCalls: number;
    SuperDeleteCalls: number;
    SuperSaveReturn: boolean;
    SuperDeleteReturn: boolean;
    LatestResult: BaseEntityResult | null;
    SeedField(name: string, oldValue: string | null, value: string | null): void;
}

const ARTIFACTS_ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECTS_ENTITY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNREGISTERED_ENTITY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const OWNER_ID = '10000000-0000-4000-8000-000000000010';
const SHARED_EDITOR_ID = '20000000-0000-4000-8000-000000000020';
const OUTSIDER_ID = '30000000-0000-4000-8000-000000000030';

const ARTIFACT_ID = '40000000-0000-4000-8000-000000000040';
const HOST_ARTIFACT_ID = '50000000-0000-4000-8000-000000000050';

function makeUser(id: string, name: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    u.IsActive = true;
    return u;
}

function makeMockProvider(): IMetadataProvider {
    const entities = [
        { ID: ARTIFACTS_ENTITY_ID, Name: 'MJ: Artifacts' },
        { ID: PROJECTS_ENTITY_ID, Name: 'MJ: Projects' },
        { ID: UNREGISTERED_ENTITY_ID, Name: 'MJ: Unregistered Host' }
    ];
    return {
        ProviderType: 'Database',
        Entities: entities,
        EntityByID: (id: string) => entities.find((e) => e.ID === id),
        EntityByName: (name: string) => entities.find((e) => e.Name === name)
    } as unknown as IMetadataProvider;
}

function buildArtifact(opts: {
    wasSaved?: boolean;
    actor?: UserInfo;
    oldUserId?: string | null;
    newUserId?: string;
    oldDelegateEntityId?: string | null;
    newDelegateEntityId?: string | null;
    oldDelegateRecordId?: string | null;
    newDelegateRecordId?: string | null;
}): { entity: MJArtifactEntityServer; host: StubArtifactHost } {
    const entity = new MJArtifactEntityServer();
    const host = entity as unknown as StubArtifactHost;
    host.ID = ARTIFACT_ID;
    host.IsSaved = opts.wasSaved ?? true;
    host.ContextCurrentUser = opts.actor;
    host.ProviderToUse = makeMockProvider();
    host.SeedField('UserID', opts.oldUserId ?? OWNER_ID, opts.newUserId ?? OWNER_ID);
    host.SeedField('DelegateEntityID', opts.oldDelegateEntityId ?? null, opts.newDelegateEntityId ?? null);
    host.SeedField('DelegateRecordID', opts.oldDelegateRecordId ?? null, opts.newDelegateRecordId ?? null);
    return { entity, host };
}

class MockProjectPermissionDelegate extends BaseArtifactPermissionDelegate {
    constructor(private readonly allowedEditorIds: Set<string>) {
        super();
    }

    public override async CanRead(_context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        return this.allowedEditorIds.has(user.ID) ? 'Allow' : 'Deny';
    }

    public override async CanEdit(_context: ArtifactDelegateContext, user: UserInfo): Promise<DelegatePermissionDecision> {
        return this.allowedEditorIds.has(user.ID) ? 'Allow' : 'Deny';
    }
}

describe('MJArtifactEntityServer (B2 delegate takeover guard + C2 live permission notification)', () => {
    const ownerUser = makeUser(OWNER_ID, 'Owner Alice');
    const sharedEditorUser = makeUser(SHARED_EDITOR_ID, 'Editor Bob');
    const outsiderUser = makeUser(OUTSIDER_ID, 'Outsider Mallory');
    const systemUser = makeUser(SYSTEM_USER_ID, 'System');

    let resolvePermsSpy: ReturnType<typeof vi.spyOn>;
    let notifySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resolvePermsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockImplementation(async (_p, targetArtifactId, user) => {
                const isOwner = user.ID === OWNER_ID;
                const isEditor = isOwner || user.ID === SHARED_EDITOR_ID;
                return {
                    ArtifactID: targetArtifactId,
                    CanRead: isEditor,
                    CanEdit: isEditor,
                    CanDelete: isOwner,
                    CanShare: isOwner,
                    Source: isOwner ? 'Owner' : isEditor ? 'ArtifactPermission' : 'Denied',
                    Reason: isOwner ? 'Owner' : isEditor ? 'Shared editor' : 'Denied'
                };
            });
        notifySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'NotifyPermissionsChanged').mockResolvedValue();
    });

    afterEach(() => {
        ArtifactPermissionEngine.Instance.UnregisterDelegate('MJ: Projects');
        resolvePermsSpy.mockRestore();
        notifySpy.mockRestore();
    });

    it('rejects partial delegation when only DelegateEntityID or only DelegateRecordID is set', async () => {
        const onlyEntity = buildArtifact({
            wasSaved: false,
            actor: ownerUser,
            oldUserId: null,
            newUserId: OWNER_ID,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            newDelegateRecordId: null
        });
        expect(await onlyEntity.entity.Save()).toBe(false);
        expect(onlyEntity.host.SuperSaveCalls).toBe(0);
        expect(onlyEntity.host.LatestResult?.CompleteMessage).toMatch(/both be populated or both be null/);

        const onlyRecord = buildArtifact({
            wasSaved: true,
            actor: ownerUser,
            newDelegateEntityId: null,
            newDelegateRecordId: HOST_ARTIFACT_ID
        });
        expect(await onlyRecord.entity.Save()).toBe(false);
        expect(onlyRecord.host.SuperSaveCalls).toBe(0);
        expect(onlyRecord.host.LatestResult?.CompleteMessage).toMatch(/both be populated or both be null/);
    });

    it('blocks non-owner shared editors from setting or changing DelegateEntityID / DelegateRecordID on update (prevents owner lockout)', async () => {
        const { entity, host } = buildArtifact({
            wasSaved: true,
            actor: sharedEditorUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID,
            oldDelegateEntityId: null,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            oldDelegateRecordId: null,
            newDelegateRecordId: HOST_ARTIFACT_ID
        });

        expect(await entity.Save()).toBe(false);
        expect(host.SuperSaveCalls).toBe(0);
        expect(host.LatestResult?.CompleteMessage).toMatch(/Only the existing artifact owner/);
        expect(notifySpy).not.toHaveBeenCalled();
    });

    it('blocks non-owner shared editors from transferring UserID ownership on update', async () => {
        const { entity, host } = buildArtifact({
            wasSaved: true,
            actor: sharedEditorUser,
            oldUserId: OWNER_ID,
            newUserId: SHARED_EDITOR_ID
        });

        expect(await entity.Save()).toBe(false);
        expect(host.SuperSaveCalls).toBe(0);
        expect(host.LatestResult?.CompleteMessage).toMatch(/Only the existing artifact owner/);
    });

    it('blocks self-delegation when DelegateEntity is MJ: Artifacts and DelegateRecordID equals this.ID', async () => {
        const { entity, host } = buildArtifact({
            wasSaved: true,
            actor: ownerUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID,
            oldDelegateEntityId: null,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            oldDelegateRecordId: null,
            newDelegateRecordId: ARTIFACT_ID
        });

        expect(await entity.Save()).toBe(false);
        expect(host.SuperSaveCalls).toBe(0);
        expect(host.LatestResult?.CompleteMessage).toMatch(/cannot delegate permissions to itself/);
    });

    it('requires actor CanEdit === true on target MJ: Artifacts record on both create and update', async () => {
        // 1. Denied when actor only has CanRead (not CanEdit) on target parent artifact
        resolvePermsSpy.mockResolvedValueOnce({
            ArtifactID: HOST_ARTIFACT_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Read-only access'
        });

        const deniedCreate = buildArtifact({
            wasSaved: false,
            actor: outsiderUser,
            oldUserId: null,
            newUserId: OUTSIDER_ID,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            newDelegateRecordId: HOST_ARTIFACT_ID
        });
        expect(await deniedCreate.entity.Save()).toBe(false);
        expect(deniedCreate.host.SuperSaveCalls).toBe(0);
        expect(deniedCreate.host.LatestResult?.CompleteMessage).toMatch(/Edit permission/);

        // 2. Allowed when actor holds CanEdit on target parent artifact
        resolvePermsSpy.mockResolvedValueOnce({
            ArtifactID: HOST_ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
            Reason: 'Owner of parent artifact'
        });

        const allowedCreate = buildArtifact({
            wasSaved: false,
            actor: ownerUser,
            oldUserId: null,
            newUserId: OWNER_ID,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            newDelegateRecordId: HOST_ARTIFACT_ID
        });
        expect(await allowedCreate.entity.Save()).toBe(true);
        expect(allowedCreate.host.SuperSaveCalls).toBe(1);
        // New record creation does not fire NotifyPermissionsChanged
        expect(notifySpy).not.toHaveBeenCalled();
    });

    it('enforces registered BaseArtifactPermissionDelegate.CanEdit on non-Artifact host entities and rejects unregistered host entities', async () => {
        // 1. Unregistered host entity fails closed
        const unregistered = buildArtifact({
            wasSaved: false,
            actor: ownerUser,
            oldUserId: null,
            newUserId: OWNER_ID,
            newDelegateEntityId: UNREGISTERED_ENTITY_ID,
            newDelegateRecordId: 'rec-999'
        });
        expect(await unregistered.entity.Save()).toBe(false);
        expect(unregistered.host.SuperSaveCalls).toBe(0);

        // 2. Registered MJ: Projects delegate rejects actor without CanEdit
        ArtifactPermissionEngine.Instance.RegisterDelegate(
            'MJ: Projects',
            new MockProjectPermissionDelegate(new Set([OWNER_ID]))
        );

        const deniedProjectDelegate = buildArtifact({
            wasSaved: false,
            actor: outsiderUser,
            oldUserId: null,
            newUserId: OUTSIDER_ID,
            newDelegateEntityId: PROJECTS_ENTITY_ID,
            newDelegateRecordId: 'proj-1'
        });
        expect(await deniedProjectDelegate.entity.Save()).toBe(false);
        expect(deniedProjectDelegate.host.SuperSaveCalls).toBe(0);

        // 3. Registered MJ: Projects delegate allows owner who holds CanEdit on proj-1
        const allowedProjectDelegate = buildArtifact({
            wasSaved: true,
            actor: ownerUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID,
            oldDelegateEntityId: null,
            newDelegateEntityId: PROJECTS_ENTITY_ID,
            oldDelegateRecordId: null,
            newDelegateRecordId: 'proj-1'
        });
        expect(await allowedProjectDelegate.entity.Save()).toBe(true);
        expect(allowedProjectDelegate.host.SuperSaveCalls).toBe(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: OWNER_ID
        });
    });

    it('allows server system user to update delegation and still emits NotifyPermissionsChanged', async () => {
        const { entity, host } = buildArtifact({
            wasSaved: true,
            actor: systemUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID,
            oldDelegateEntityId: null,
            newDelegateEntityId: ARTIFACTS_ENTITY_ID,
            oldDelegateRecordId: null,
            newDelegateRecordId: HOST_ARTIFACT_ID
        });

        expect(await entity.Save()).toBe(true);
        expect(host.SuperSaveCalls).toBe(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: SYSTEM_USER_ID
        });
    });

    it('emits NotifyPermissionsChanged when UserID changes on Save or when Delete succeeds, but not on benign metadata edits', async () => {
        // Benign Name update without UserID/Delegate change -> no NotifyPermissionsChanged
        const benign = buildArtifact({
            wasSaved: true,
            actor: sharedEditorUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID
        });
        benign.entity.Name = 'Renamed Document';
        expect(await benign.entity.Save()).toBe(true);
        expect(notifySpy).not.toHaveBeenCalled();

        // Owner transfers UserID -> emits NotifyPermissionsChanged
        const transfer = buildArtifact({
            wasSaved: true,
            actor: ownerUser,
            oldUserId: OWNER_ID,
            newUserId: SHARED_EDITOR_ID
        });
        expect(await transfer.entity.Save()).toBe(true);
        expect(notifySpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: OWNER_ID
        });

        // Delete -> emits NotifyPermissionsChanged
        notifySpy.mockClear();
        expect(await transfer.entity.Delete()).toBe(true);
        expect(transfer.host.SuperDeleteCalls).toBe(1);
        expect(notifySpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith({
            ArtifactID: ARTIFACT_ID,
            ChangedByUserID: OWNER_ID
        });
    });

    it('enforces UserID === actor.ID on create, CanEdit on non-delegation saved updates, and CanDelete on Delete() (P0-1)', async () => {
        // 1. Spoofing UserID on !wasSaved create is rejected
        const spoofedCreate = buildArtifact({
            wasSaved: false,
            actor: outsiderUser,
            oldUserId: null,
            newUserId: OWNER_ID
        });
        expect(await spoofedCreate.entity.Save()).toBe(false);
        expect(spoofedCreate.host.SuperSaveCalls).toBe(0);

        // 2. Outsider cannot update Name on an existing artifact
        const outsiderUpdate = buildArtifact({
            wasSaved: true,
            actor: outsiderUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID
        });
        outsiderUpdate.entity.Name = 'Hijacked Name';
        expect(await outsiderUpdate.entity.Save()).toBe(false);
        expect(outsiderUpdate.host.SuperSaveCalls).toBe(0);

        // 3. Shared editor without CanDelete cannot Delete()
        const deniedDelete = buildArtifact({
            wasSaved: true,
            actor: sharedEditorUser,
            oldUserId: OWNER_ID,
            newUserId: OWNER_ID
        });
        expect(await deniedDelete.entity.Delete()).toBe(false);
        expect(deniedDelete.host.SuperDeleteCalls).toBe(0);
    });

    it('enforces CanRead on InnerLoad, PreRunView/PostRunView, count_only, and paged TotalRowCount (P0-1)', async () => {
        // InnerLoad rejects outsider via NewRecord()
        const superInnerLoadSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactEntityServer.prototype), 'InnerLoad')
            .mockResolvedValue(true);
        try {
            const loaded = buildArtifact({
                wasSaved: true,
                actor: outsiderUser
            });
            expect(await loaded.entity.InnerLoad({ FieldValues: [{ FieldName: 'ID', Value: ARTIFACT_ID }] } as never)).toBe(false);
        } finally {
            superInnerLoadSpy.mockRestore();
        }

        // PreRunView appends ID when missing; PostRunView strips synthetic ID and adjusts paged/count_only totals
        const params = {
            EntityName: 'MJ: Artifacts',
            Fields: ['Name'],
            MaxRows: 1,
            ResultType: 'simple' as const
        };
        const provider = makeMockProvider();
        const hookedParams = await ArtifactPreRunViewHook(params, sharedEditorUser, provider);
        expect(hookedParams.Fields).toEqual(['Name', 'ID']);

        const postRes = await ArtifactPostRunViewHook(
            hookedParams,
            {
                Success: true,
                Results: [
                    { ID: ARTIFACT_ID, Name: 'Allowed' },
                    { ID: HOST_ARTIFACT_ID, Name: 'Denied' }
                ],
                RowCount: 2,
                TotalRowCount: 99,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            outsiderUser,
            provider
        );
        expect(postRes.Results).toEqual([]);
        expect(postRes.RowCount).toBe(0);
        expect(postRes.TotalRowCount).toBe(0);

        const countOnlyRes = await ArtifactPostRunViewHook(
            {
                EntityName: 'MJ: Artifacts',
                ResultType: 'count_only'
            },
            {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 42,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            outsiderUser,
            provider
        );
        expect(countOnlyRes.TotalRowCount).toBe(0);
        expect(countOnlyRes.RowCount).toBe(0);
    });

    it('B1 / B2: matches mixed-case EntityName and preserves paged TotalRowCount when SQL-scoped', async () => {
        const scopedArtEntityId = '00000000-0000-4000-8000-0000000000a1';
        const scopedProvider = {
            ProviderType: 'Database',
            Entities: [{ ID: scopedArtEntityId, Name: 'MJ: Artifacts' }],
            EntityByName: (name: string) =>
                name.trim().toLowerCase() === 'mj: artifacts'
                    ? ({ ID: scopedArtEntityId, Name: 'MJ: Artifacts' } as never)
                    : undefined,
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
        } as unknown as IMetadataProvider;
        vi.spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet').mockResolvedValueOnce(
            new Set()
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'BuildReadableArtifactIdSet').mockResolvedValue(
            new Set([ARTIFACT_ID])
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Reader'
        });

        const hooked = await ArtifactPreRunViewHook(
            { EntityName: 'mj: artifacts', Fields: ['Name'], MaxRows: 1, ResultType: 'simple' },
            sharedEditorUser,
            scopedProvider
        );
        expect(String(hooked.ExtraFilter)).toContain('EXISTS (');
        expect(String(hooked.ExtraFilter)).toContain('vwArtifacts');
        expect(String(hooked.ExtraFilter)).toContain('vwArtifactPermissions');
        expect(String(hooked.ExtraFilter)).toContain(sharedEditorUser.ID);
        expect(hooked.Fields).toEqual(['Name', 'ID']);

        const post = await ArtifactPostRunViewHook(
            hooked,
            {
                Success: true,
                Results: [{ ID: ARTIFACT_ID, Name: 'Paged Item' }],
                RowCount: 1,
                TotalRowCount: 42,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            sharedEditorUser,
            scopedProvider
        );
        expect(post.Results).toEqual([{ Name: 'Paged Item' }]);
        expect(post.TotalRowCount).toBe(42);
    });

    it('B1 / B2: ViewID/ViewName fail-closed resolution and SQL EXISTS scoping for >5,000 artifacts across SQL dialects', async () => {
        const provider = {
            ProviderType: 'Database',
            PlatformKey: 'sqlserver',
            Entities: [{ ID: 'ent-art', Name: 'MJ: Artifacts', BaseView: 'vwArtifacts', SchemaName: '__mj' }],
            EntityByName: (name: string) =>
                name.trim().toLowerCase() === 'mj: artifacts'
                    ? { ID: 'ent-art', Name: 'MJ: Artifacts', BaseView: 'vwArtifacts', SchemaName: '__mj' }
                    : undefined,
            RunView: vi.fn().mockImplementation(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: User Views') {
                    if (String(params.ExtraFilter).includes('00000000-0000-4000-8000-000000000404')) {
                        return { Success: false, Results: [], ErrorMessage: 'DB timeout' };
                    }
                    return { Success: true, Results: [{ Entity: 'MJ: Artifacts' }] };
                }
                return { Success: true, Results: [] };
            })
        } as unknown as IMetadataProvider;

        // ViewID resolving to MJ: Artifacts matches cleanly
        const viewIdResolved = await ResolveTargetEntityNameAsync(
            { ViewID: '11111111-1111-4111-8111-111111111222' },
            provider,
            sharedEditorUser
        );
        expect(viewIdResolved).toBe('MJ: Artifacts');

        // Fail-closed when User Views lookup fails
        await expect(
            ResolveTargetEntityNameAsync(
                { ViewID: '00000000-0000-4000-8000-000000000404' },
                provider,
                sharedEditorUser
            )
        ).rejects.toThrow(/unable to resolve target entity/i);

        // Fail-closed when EntityName and ViewName disagree
        await expect(
            ResolveTargetEntityNameAsync(
                { EntityName: 'Users', ViewName: 'Artifacts View' },
                provider,
                sharedEditorUser
            )
        ).rejects.toThrow(/does not match/i);

        // SQL EXISTS predicate has no 5,000-ID truncation limit and covers both dialects
        const bigSet = new Set<string>();
        for (let i = 0; i < 5500; i++) {
            bigSet.add(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
        }
        vi.spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet').mockResolvedValueOnce(
            new Set(['22222222-2222-4222-8222-222222222222'])
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'BuildReadableArtifactIdSet').mockResolvedValue(bigSet);
        const sqlScoped = await ArtifactPreRunViewHook(
            { EntityName: 'MJ: Artifacts', ResultType: 'simple' },
            sharedEditorUser,
            provider
        );
        expect(String(sqlScoped.ExtraFilter)).toContain('EXISTS (');
        expect(String(sqlScoped.ExtraFilter)).toContain('[__mj].[vwArtifacts].[ID]');
        expect(String(sqlScoped.ExtraFilter)).not.toContain('ID IN (');

        // Also check PostgreSQL quoting for ArtifactVersion + Collection predicates
        const pgEntities = [
            { ID: 'ent-art', Name: 'MJ: Artifacts', BaseView: 'vwArtifacts', SchemaName: '__mj' },
            { ID: 'ent-ver', Name: 'MJ: Artifact Versions', BaseView: 'vwArtifactVersions', SchemaName: '__mj' },
            { ID: 'ent-attr', Name: 'MJ: Artifact Version Attributes', BaseView: 'vwArtifactVersionAttributes', SchemaName: '__mj' },
            { ID: 'ent-ca', Name: 'MJ: Collection Artifacts', BaseView: 'vwCollectionArtifacts', SchemaName: '__mj' },
            { ID: 'ent-col', Name: 'MJ: Collections', BaseView: 'vwCollections', SchemaName: '__mj' },
            { ID: 'ent-cp', Name: 'MJ: Collection Permissions', BaseView: 'vwCollectionPermissions', SchemaName: '__mj' },
            { ID: 'ent-ap', Name: 'MJ: Artifact Permissions', BaseView: 'vwArtifactPermissions', SchemaName: '__mj' }
        ];
        const pgProvider = {
            ...provider,
            PlatformKey: 'postgresql',
            Entities: pgEntities,
            EntityByName: (name: string) =>
                pgEntities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase())
        } as unknown as IMetadataProvider;
        const pgColSql = BuildSqlCollectionReadablePredicate('CollectionID', pgProvider, sharedEditorUser);
        const pgVerSql = BuildSqlArtifactVersionIdReadablePredicate('ArtifactVersionID', pgProvider, sharedEditorUser);
        expect(pgColSql).toContain('EXISTS (');
        expect(pgColSql).toContain('vwCollections');
        expect(pgVerSql).toContain('vwArtifactVersions');
        expect(ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES).toHaveLength(9);
    });

    it('R1, S-f, S-j: hardens SQL delegate predicates, honors 17-level collections & alternate/materialized views, and rejects unbalanced ExtraFilter', async () => {
        const artEntityId = '11111111-1111-4111-8111-111111111111';
        const convEntityId = '22222222-2222-4222-8222-222222222222';
        const projEntityId = '33333333-3333-4333-8333-333333333333';

        const artEntityInfo = new EntityInfo({
            ID: artEntityId,
            Name: 'MJ: Artifacts',
            BaseView: 'vwArtifacts',
            SchemaName: 'custom_mj',
            CodeName: 'Artifacts',
            EntityFields: [],
            EntityAlternateBaseViews: [
                {
                    ID: '55555555-5555-4555-8555-555555555555',
                    EntityID: artEntityId,
                    ParentID: null,
                    Name: 'Compact',
                    DisplayName: 'Compact',
                    ViewName: 'vwArtifactsCompact',
                    SchemaName: 'alt_schema',
                    CachePolicy: 'Default',
                    Status: 'Active',
                    Sequence: 10
                }
            ]
        });
        const verEntityInfo = new EntityInfo({
            ID: '44444444-4444-4444-8444-444444444444',
            Name: 'MJ: Artifact Versions',
            BaseView: 'vwArtifactVersions',
            SchemaName: 'custom_mj',
            CodeName: 'ArtifactVersions',
            EntityFields: []
        });
        const convEntityInfo = new EntityInfo({
            ID: convEntityId,
            Name: 'MJ: Conversations',
            BaseView: 'vwConversations',
            SchemaName: 'custom_mj'
        });
        const projEntityInfo = new EntityInfo({
            ID: projEntityId,
            Name: 'MJ: Projects',
            BaseView: 'vwProjects',
            SchemaName: 'custom_mj'
        });
        const entities = [artEntityInfo, verEntityInfo, convEntityInfo, projEntityInfo];

        const customProvider = {
            ProviderType: 'Database',
            PlatformKey: 'sqlserver',
            ConfigData: { MJCoreSchemaName: 'custom_mj' },
            Entities: entities,
            EntityByName: (name: string) =>
                entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
            EntityByID: (id: string) => entities.find((e) => e.ID === id),
            RunView: vi.fn(async () => ({ Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'unmocked' }))
        };

        // R1 / L1: SQL collection predicate includes 16 levels (c0..c15) matching ArtifactPermissionEngine
        const colSql = BuildSqlCollectionReadablePredicate(
            '[custom_mj].[vwCollections].[ID]',
            customProvider as unknown as IMetadataProvider,
            sharedEditorUser
        );
        expect(colSql).toContain('[_sc15]');
        expect(colSql).not.toContain('[_sc16]');
        expect(colSql).toContain('[custom_mj].[vwCollections]');
        expect(colSql).toContain('[custom_mj].[vwCollectionPermissions]');

        // R1: Artifact SQL predicate does NOT emit vwConversations / AnchorType bypass and DOES chain MJ: Artifacts 8 hops
        const artPredSync = BuildSqlArtifactReadablePredicate(
            '[custom_mj].[vwArtifactVersions].[ArtifactID]',
            customProvider as unknown as IMetadataProvider,
            sharedEditorUser
        );
        expect(artPredSync).not.toContain('vwConversations');
        expect(artPredSync).not.toContain('AnchorType');
        expect(artPredSync).toContain(`[_sa_h0_art].[DelegateEntityID] = '${artEntityId}'`);
        expect(artPredSync).toContain('[_sa_h8_art]');
        expect(artPredSync).toContain('[_sa_h0_art].[DelegateEntityID] IS NULL OR [_sa_h0_art].[DelegateRecordID] IS NULL');

        // R1: Async precompute shrinks query when collections succeed, and sets isExact=false when custom non-artifact delegate is registered
        vi.spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet').mockResolvedValueOnce(new Set());
        const exactAsync = await BuildSqlArtifactReadablePredicateAsync(
            '[custom_mj].[vwArtifactVersions].[ArtifactID]',
            customProvider as unknown as IMetadataProvider,
            sharedEditorUser
        );
        expect(exactAsync.isExact).toBe(true);
        expect(exactAsync.clause).not.toContain('vwCollections');

        ArtifactPermissionEngine.Instance.RegisterDelegate('MJ: Projects', {
            CanRead: async () => 'Allow',
            CanEdit: async () => 'Defer'
        });
        try {
            vi.spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet').mockResolvedValueOnce(new Set());
            const inexactAsync = await BuildSqlArtifactReadablePredicateAsync(
                '[custom_mj].[vwArtifactVersions].[ArtifactID]',
                customProvider as unknown as IMetadataProvider,
                sharedEditorUser
            );
            expect(inexactAsync.isExact).toBe(false);
            expect(inexactAsync.clause).toContain(projEntityId);

            // When isExact=false (custom delegate active), count_only on empty results must NOT trust TotalRowCount
            vi.spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet').mockResolvedValueOnce(new Set());
            const countOnlyParams: RunViewParams = {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: "Content LIKE '%secret%'",
                ResultType: 'count_only'
            };
            const preParams = await ArtifactVersionPreRunViewHook(
                countOnlyParams,
                sharedEditorUser,
                customProvider as unknown as IMetadataProvider
            );
            const postCount = await ArtifactVersionPostRunViewHook(
                preParams,
                {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 3,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                },
                sharedEditorUser,
                customProvider as unknown as IMetadataProvider
            );
            expect(postCount.TotalRowCount).toBe(0);
        } finally {
            ArtifactPermissionEngine.Instance.UnregisterDelegate('MJ: Projects');
        }

        // B5: Guest Share Links (requireShareOrDelete) and Collection Artifacts precompute collections to avoid >260 tables
        const colArtEntityId = '66666666-6666-4666-8666-666666666666';
        const guestLinkEntityId = '77777777-7777-4777-8777-777777777777';
        const colArtEntityInfo = new EntityInfo({
            ID: colArtEntityId,
            Name: 'MJ: Collection Artifacts',
            BaseView: 'vwCollectionArtifacts',
            SchemaName: 'custom_mj'
        });
        const guestLinkEntityInfo = new EntityInfo({
            ID: guestLinkEntityId,
            Name: 'MJ: Artifact Guest Share Links',
            BaseView: 'vwArtifactGuestShareLinks',
            SchemaName: 'custom_mj'
        });
        const b5Entities = [...entities, colArtEntityInfo, guestLinkEntityInfo];
        const b5Provider = {
            ProviderType: 'Database',
            PlatformKey: 'sqlserver',
            ConfigData: { MJCoreSchemaName: 'custom_mj' },
            Entities: b5Entities,
            EntityByName: (name: string) =>
                b5Entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
            EntityByID: (id: string) => b5Entities.find((e) => e.ID === id),
            RunView: vi.fn(async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }))
        };
        const tryColSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet')
            .mockResolvedValue(new Set(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']));

        const guestHooked = await ArtifactGuestShareLinkPreRunViewHook(
            { EntityName: 'MJ: Artifact Guest Share Links', ResultType: 'simple' },
            sharedEditorUser,
            b5Provider as unknown as IMetadataProvider
        );
        expect(tryColSpy).toHaveBeenCalledWith(expect.anything(), sharedEditorUser, { requireShareOrDelete: true });
        expect(String(guestHooked.ExtraFilter)).not.toContain('vwCollections');

        tryColSpy.mockClear();
        const colArtHooked = await CollectionArtifactPreRunViewHook(
            { EntityName: 'MJ: Collection Artifacts', ResultType: 'simple' },
            sharedEditorUser,
            b5Provider as unknown as IMetadataProvider
        );
        expect(tryColSpy).toHaveBeenCalledTimes(1);
        expect(String(colArtHooked.ExtraFilter)).not.toContain('vwCollections');
        tryColSpy.mockRestore();

        // S-f & N4: QualifyOuterEntityColumn & QualifyOuterEntityColumnAsync honor EffectiveSchemaName, custom ViewName, and inactive fallback
        expect(
            QualifyOuterEntityColumn(
                artEntityInfo,
                'vwArtifacts',
                'ID',
                customProvider as unknown as IMetadataProvider,
                { EntityName: 'MJ: Artifacts', DataSource: 'Materialized' }
            )
        ).toBe('[custom_mj].[materialized_vwArtifacts].[ID]');
        expect(
            QualifyOuterEntityColumn(
                artEntityInfo,
                'vwArtifacts',
                'ID',
                customProvider as unknown as IMetadataProvider,
                { EntityName: 'MJ: Artifacts', AlternateBaseView: 'Compact' }
            )
        ).toBe('[alt_schema].[vwArtifactsCompact].[ID]');
        expect(
            await QualifyOuterEntityColumnAsync(
                artEntityInfo,
                'vwArtifacts',
                'ID',
                customProvider as unknown as IMetadataProvider,
                { EntityName: 'MJ: Artifacts', DataSource: 'Materialized' },
                sharedEditorUser
            )
        ).toBe('[custom_mj].[vwArtifacts].[ID]');
        const activeMatProvider = {
            ...b5Provider,
            RunView: vi.fn(async () => ({
                Success: true,
                Results: [{ Status: 'Active', ViewName: 'mv_custom_artifacts' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            }))
        };
        expect(
            await QualifyOuterEntityColumnAsync(
                artEntityInfo,
                'vwArtifacts',
                'ID',
                activeMatProvider as unknown as IMetadataProvider,
                { EntityName: 'MJ: Artifacts', DataSource: 'Materialized' },
                sharedEditorUser
            )
        ).toBe('[custom_mj].[mv_custom_artifacts].[ID]');

        // S-j: AppendSqlAndFilter rejects unbalanced parentheses and unclosed single quotes before wrapping
        expect(() => AppendSqlAndFilter("Name = 'ok') OR (1=1", '[ID] IS NOT NULL')).toThrow(/unbalanced/i);
        expect(() => AppendSqlAndFilter("Name = 'unclosed", '[ID] IS NOT NULL')).toThrow(/unbalanced/i);
        expect(AppendSqlAndFilter("Name = 'O''Reilly (dev)'", '[ID] IS NOT NULL')).toBe(
            "(Name = 'O''Reilly (dev)') AND ([ID] IS NOT NULL)"
        );
    });

    it('bypasses server SQL scoping and PostRunView filtering on ProviderType=Network even with contextUser, while Database filtered RunView returns readable rows', async () => {
        const networkProvider = {
            ProviderType: 'Network',
            Entities: [
                {
                    Name: 'MJ: Artifact Versions',
                    SchemaName: '__mj',
                    BaseView: 'vwArtifactVersions',
                    Fields: [{ Name: 'ID', IsPrimaryKey: true }, { Name: 'ArtifactID' }, { Name: 'Content' }]
                }
            ],
            EntityByName: (name: string) =>
                name.trim().toLowerCase() === 'mj: artifact versions'
                    ? networkProvider.Entities[0]
                    : undefined
        } as unknown as IMetadataProvider;

        const clientParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: "Content LIKE '%probe%'",
            Fields: ['ID', 'Content'],
            ResultType: 'simple'
        };
        const afterNetworkPre = await ArtifactVersionPreRunViewHook(
            clientParams,
            sharedEditorUser,
            networkProvider
        );
        // Must NOT inject SQL EXISTS(... FROM vwArtifacts) or add ArtifactID onto a Network/GraphQL client request
        expect(afterNetworkPre).toBe(clientParams);
        expect(afterNetworkPre.ExtraFilter).toBe("Content LIKE '%probe%'");
        expect(afterNetworkPre.Fields).toEqual(['ID', 'Content']);

        const networkPost = await ArtifactVersionPostRunViewHook(
            afterNetworkPre,
            {
                Success: true,
                Results: [{ ID: 'ver-1', Content: 'Server-vetted content' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            sharedEditorUser,
            networkProvider
        );
        expect(networkPost.Success).toBe(true);
        expect(networkPost.Results).toEqual([{ ID: 'ver-1', Content: 'Server-vetted content' }]);

        // Plain non-system user running a filtered Database RunView on MJ: Artifact Versions gets readable rows back
        const readableArtId = '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: readableArtId,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Shared'
        });
        const dbProvider = {
            ProviderType: 'Database',
            Entities: networkProvider.Entities,
            EntityByName: networkProvider.EntityByName,
            RunView: vi.fn(async () => ({
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: ''
            }))
        } as unknown as IMetadataProvider;

        const filteredDbParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID = '${readableArtId}' AND Content LIKE '%readable%'`,
            Fields: ['ID', 'Content'],
            ResultType: 'simple'
        };
        const wellKnownSysSpy = vi
            .spyOn(WellKnownUserSource.Instance, 'GetSystemUser')
            .mockResolvedValue({ ID: SYSTEM_USER_ID } as UserInfo);
        try {
            const hookedDbParams = await ArtifactVersionPreRunViewHook(
                filteredDbParams,
                sharedEditorUser,
                dbProvider
            );
            expect(String(hookedDbParams.ExtraFilter)).toContain(`ArtifactID = '${readableArtId}'`);
            const postDbRes = await ArtifactVersionPostRunViewHook(
                hookedDbParams,
                {
                    Success: true,
                    Results: [{ ID: 'ver-readable', ArtifactID: readableArtId, Content: 'Shared readable doc' }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                },
                sharedEditorUser,
                dbProvider
            );
            expect(postDbRes.Success).toBe(true);
            expect(postDbRes.Results).toEqual([{ ID: 'ver-readable', Content: 'Shared readable doc' }]);
        } finally {
            wellKnownSysSpy.mockRestore();
        }
    });

    it('enforces S5-2 cache separation (readable vs shareOrDelete) and R5-4 bounded <260 table counts across collection/artifact matrix', async () => {
        const b5Provider = {
            ProviderType: 'Database',
            PlatformKey: 'sqlserver',
            ConfigData: { MJCoreSchemaName: '__mj' },
            Entities: [
                { ID: '00000000-0000-4000-8000-0000000000e1', Name: 'MJ: Artifacts', BaseView: 'vwArtifacts', SchemaName: '__mj' },
                { ID: '00000000-0000-4000-8000-0000000000e2', Name: 'MJ: Artifact Guest Share Links', BaseView: 'vwArtifactGuestShareLinks', SchemaName: '__mj' },
                { ID: '00000000-0000-4000-8000-0000000000e3', Name: 'MJ: Collection Artifacts', BaseView: 'vwCollectionArtifacts', SchemaName: '__mj' }
            ],
            EntityByName: (name: string) =>
                b5Provider.Entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
            RunView: vi.fn(async () => ({ Success: true, Results: [] }))
        };
        const makeUuids = (n: number, prefix: string): Set<string> => {
            const set = new Set<string>();
            for (let i = 0; i < n; i++) {
                set.add(`${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`);
            }
            return set;
        };

        // S5-2: Per-call CollectionIdSetCache MUST keep readable and shareOrDelete entries isolated
        const readableCols = makeUuids(2, '11111111');
        const shareOrDeleteCols = makeUuids(1, '22222222');
        const tryColsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableCollectionIdSet')
            .mockImplementation(async (_p, _u, opts) => (opts?.requireShareOrDelete ? shareOrDeleteCols : readableCols));
        const sharedCache = new Map<'readable' | 'shareOrDelete', Promise<Set<string> | null>>();
        const readPred = await BuildSqlArtifactReadablePredicateAsync('[vwArtifacts].[ID]', b5Provider as unknown as IMetadataProvider, sharedEditorUser, {
            requireShareOrDelete: false,
            precomputedCollectionCache: sharedCache
        });
        const sharePred = await BuildSqlArtifactReadablePredicateAsync('[vwArtifacts].[ID]', b5Provider as unknown as IMetadataProvider, sharedEditorUser, {
            requireShareOrDelete: true,
            precomputedCollectionCache: sharedCache
        });
        expect(tryColsSpy).toHaveBeenCalledTimes(2);
        expect(readPred.clause).toContain('11111111-0000-4000-8000-000000000001');
        expect(sharePred.clause).toContain('22222222-0000-4000-8000-000000000000');
        expect(sharePred.clause).not.toContain('11111111-0000-4000-8000-000000000001');

        // R5-4 & R6-3 matrix: <=500 / >500 collections x <=5000 / >5000 / null artifacts x requireShareOrDelete false/true
        const countTables = (sql: string): number => (sql.match(/\[vw[A-Za-z]+\]/g) ?? []).length;
        const cases: Array<{
            cols: Set<string> | null;
            arts: Set<string>;
            expectedExact: boolean;
            expectedErrorPattern?: RegExp;
        }> = [
            { cols: makeUuids(10, 'aaaaaaaa'), arts: makeUuids(5, 'bbbbbbbb'), expectedExact: true },
            { cols: makeUuids(501, 'cccccccc'), arts: makeUuids(20, 'dddddddd'), expectedExact: true },
            {
                cols: makeUuids(501, 'eeeeeeee'),
                arts: makeUuids(5001, 'ffffffff'),
                expectedExact: false,
                expectedErrorPattern: /exceeded SQL readability scope cap/i
            },
            {
                cols: null,
                arts: makeUuids(5, '99999999'),
                expectedExact: false,
                expectedErrorPattern: /unable to resolve readable/i
            }
        ];

        for (const c of cases) {
            for (const requireShareOrDelete of [false, true]) {
                tryColsSpy.mockResolvedValue(c.cols);
                const artSpy = vi
                    .spyOn(ArtifactPermissionEngine.Instance, 'BuildReadableArtifactIdSet')
                    .mockResolvedValue(c.arts);

                if (c.expectedErrorPattern) {
                    await expect(
                        BuildSqlArtifactReadablePredicateAsync(
                            '[vwArtifacts].[ID]',
                            b5Provider as unknown as IMetadataProvider,
                            sharedEditorUser,
                            { requireShareOrDelete }
                        )
                    ).rejects.toThrow(c.expectedErrorPattern);
                    await expect(
                        ArtifactGuestShareLinkPreRunViewHook(
                            { EntityName: 'MJ: Artifact Guest Share Links', ResultType: 'simple' },
                            sharedEditorUser,
                            b5Provider as unknown as IMetadataProvider
                        )
                    ).rejects.toThrow(c.expectedErrorPattern);
                } else {
                    const res = await BuildSqlArtifactReadablePredicateAsync(
                        '[vwArtifacts].[ID]',
                        b5Provider as unknown as IMetadataProvider,
                        sharedEditorUser,
                        { requireShareOrDelete }
                    );
                    expect(countTables(res.clause)).toBeLessThan(260);
                    expect(res.isExact).toBe(c.expectedExact);

                    const guestParams = await ArtifactGuestShareLinkPreRunViewHook(
                        { EntityName: 'MJ: Artifact Guest Share Links', ResultType: 'simple' },
                        sharedEditorUser,
                        b5Provider as unknown as IMetadataProvider
                    );
                    expect(countTables(String(guestParams.ExtraFilter ?? ''))).toBeLessThan(260);

                    const colArtParams = await CollectionArtifactPreRunViewHook(
                        { EntityName: 'MJ: Collection Artifacts', ResultType: 'simple' },
                        sharedEditorUser,
                        b5Provider as unknown as IMetadataProvider
                    );
                    expect(countTables(String(colArtParams.ExtraFilter ?? ''))).toBeLessThan(260);
                }

                artSpy.mockRestore();
            }
        }

        // R6-3: > 5,000 collections on collection-scoped reads uses the bounded 17-table SQL predicate (never empty workspace!)
        tryColsSpy.mockResolvedValue(makeUuids(5001, '77777777'));
        const largeColPred = await BuildSqlCollectionReadablePredicateAsync(
            '[vwCollectionArtifacts].[CollectionID]',
            b5Provider as unknown as IMetadataProvider,
            sharedEditorUser
        );
        expect(largeColPred.isExact).toBe(true);
        expect(largeColPred.clause).toContain('vwCollections');
        expect(countTables(largeColPred.clause)).toBeLessThan(25);
        tryColsSpy.mockRestore();
    });

    it('R6-1: isolates server-side spreadsheet import, evaluation, and patching in bounded worker_threads', async () => {
        const engine = SpreadsheetEngine.Instance;
        const wb = engine.CreateEmptyWorkbook('Worker Isolated', ['Sheet1'], 5, 5);
        const ws = wb.Worksheets[0];
        ws.Cells['A1'] = { Address: 'A1', RowID: 'wr-1', ColumnID: 'wc-1', RawValue: 21 };
        ws.Cells['A2'] = { Address: 'A2', RowID: 'wr-2', ColumnID: 'wc-1', RawValue: null, Formula: '=A1*2' };

        const evalRes = await RunSpreadsheetEvaluateInWorker(wb);
        expect(evalRes.EvaluatedFormulaCount).toBe(1);
        expect(evalRes.Workbook.Worksheets[0].Cells['A2']?.ComputedValue).toBe(42);

        const xlsxBytes = engine.ExportToXlsxBytes(evalRes.Workbook);
        const imported = await RunSpreadsheetImportInWorker(xlsxBytes);
        expect(imported.Worksheets[0].Cells['A2']?.ComputedValue).toBe(42);

        imported.Worksheets[0].Cells['A1'] = { Address: 'A1', RowID: 'wr-1', ColumnID: 'wc-1', RawValue: 50 };
        const evaluatedPatched = await RunSpreadsheetEvaluateInWorker(imported);
        const patchedBytes = await RunSpreadsheetPatchInWorker(xlsxBytes, evaluatedPatched.Workbook);
        const reimported = await RunSpreadsheetImportInWorker(patchedBytes);
        expect(reimported.Worksheets[0].Cells['A2']?.ComputedValue).toBe(100);

        // Extremely tight wall-clock timeout terminates the worker cleanly rather than hanging
        await expect(RunSpreadsheetEvaluateInWorker(wb, undefined, { TimeoutMs: 1 })).rejects.toThrow(/timed out/i);
    });
});
