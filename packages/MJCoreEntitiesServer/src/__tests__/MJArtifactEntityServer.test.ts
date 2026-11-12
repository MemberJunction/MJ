import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    DelegatePermissionDecision
} from '@memberjunction/core-entities';

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

import { MJArtifactEntityServer } from '../custom/MJArtifactEntityServer.server';

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
    return {
        Entities: [
            { ID: ARTIFACTS_ENTITY_ID, Name: 'MJ: Artifacts' },
            { ID: PROJECTS_ENTITY_ID, Name: 'MJ: Projects' },
            { ID: UNREGISTERED_ENTITY_ID, Name: 'MJ: Unregistered Host' }
        ]
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
        resolvePermsSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions');
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
});
