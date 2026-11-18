import { describe, it, expect, vi, beforeEach } from 'vitest';

const UUID_OWNER = '10000000-0000-4000-8000-000000000001';
const UUID_CALLER = '10000000-0000-4000-8000-000000000002';
const UUID_GRANTEE = '10000000-0000-4000-8000-000000000003';
const UUID_OTHER = '10000000-0000-4000-8000-000000000004';
const UUID_SYSTEM = '10000000-0000-4000-8000-000000000005';
const UUID_COLL = '20000000-0000-4000-8000-000000000001';
const UUID_PARENT_COLL = '20000000-0000-4000-8000-000000000002';
const UUID_OTHER_COLL = '20000000-0000-4000-8000-000000000003';
const UUID_ART = '30000000-0000-4000-8000-000000000001';
const UUID_OTHER_ART = '30000000-0000-4000-8000-000000000002';
const UUID_VER = '40000000-0000-4000-8000-000000000001';
const UUID_DELEGATE_ENTITY = '50000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    runView: vi.fn(),
    runViews: vi.fn(),
    fromProvider: vi.fn(),
    logError: vi.fn(),
    createShareNotification: vi.fn(),
    getSystemUser: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => <T extends object>(target: T) => target,
    };
});

type MockFieldValue = string | number | boolean | null | undefined;
interface MockEntityMeta {
    ID: string;
    Name: string;
}
interface MockProviderLike {
    ProviderType: string;
    Entities?: MockEntityMeta[];
    EntityByID?: (id: string) => MockEntityMeta | undefined;
}
interface MockSaveResultEntry {
    Success: boolean;
    Type: 'create' | 'update' | 'delete';
    Message: string;
    CompleteMessage: string;
    Error: Error | string | null;
    Errors: Array<Error | string>;
    StartedAt: Date;
    EndedAt: Date;
}
interface MockRunViewParams {
    EntityName: string;
    ExtraFilter?: string;
    Fields?: string[];
}

vi.mock('@memberjunction/core', () => {
    class MockBaseEntityResult {
        Success: boolean;
        Type: 'create' | 'update' | 'delete';
        Message: string;
        Error: Error | string | null = null;
        Errors: Array<Error | string> = [];
        StartedAt = new Date();
        EndedAt = new Date();
        constructor(success?: boolean, message?: string, type?: 'create' | 'update' | 'delete') {
            this.Success = success ?? false;
            this.Message = message ?? '';
            this.Type = type ?? 'create';
        }
        get CompleteMessage(): string {
            return this.Message;
        }
    }
    class MockRunView {
        static FromMetadataProvider(provider: MockProviderLike): MockRunView {
            mocks.fromProvider(provider);
            return new MockRunView();
        }
        RunViews(params: MockRunViewParams[], contextUser?: { ID: string }): Promise<Array<{ Success: boolean; Results: Array<Record<string, MockFieldValue>> }>> {
            return mocks.runViews(params, contextUser);
        }
        RunView(params: MockRunViewParams, contextUser?: { ID: string }): Promise<{ Success: boolean; Results: Array<Record<string, MockFieldValue>> }> {
            return mocks.runView(params, contextUser);
        }
    }
    return {
        BaseEntity: class MockBaseEntity {},
        BaseEntityResult: MockBaseEntityResult,
        EntityInfo: class MockEntityInfo {},
        UserInfo: class MockUserInfo {
            ID = '';
            Email = '';
            Name = '';
        },
        Metadata: class MockMetadata {
            static Provider: MockProviderLike = { ProviderType: 'Database', Entities: [] };
        },
        RunView: MockRunView,
        LogError: mocks.logError,
        EntityPermissionType: { Read: 'Read', Create: 'Create', Update: 'Update', Delete: 'Delete' },
        EntitySaveOptions: class MockEntitySaveOptions {},
        EntityDeleteOptions: class MockEntityDeleteOptions {},
        WellKnownUserSource: {
            Instance: {
                GetSystemUser: (...args: Array<IMetadataProvider | undefined>) => mocks.getSystemUser(...args),
            },
        },
    };
});

const shareProviderOverrides = new WeakMap<object, MockProviderLike>();

vi.mock('../generated/entity_subclasses', () => {
    class MockPermissionEntityBase {
        ID = '90000000-0000-4000-8000-000000000001';
        CollectionID = '';
        ArtifactID = '';
        UserID = '';
        SharedByUserID: string | null = null;
        CanRead = true;
        CanShare = false;
        CanEdit = false;
        CanDelete = false;
        Collection: string | null = null;
        IsSaved = false;
        ContextCurrentUser: { ID: string; Email?: string; Name?: string } | null = null;
        private _defaultProvider: MockProviderLike = {
            ProviderType: 'Database',
            Entities: [],
            EntityByID: () => undefined,
        };
        get ProviderToUse(): MockProviderLike {
            return shareProviderOverrides.get(this) ?? this._defaultProvider;
        }
        set ProviderToUse(val: MockProviderLike) {
            shareProviderOverrides.set(this, val);
        }
        OldValues: Record<string, MockFieldValue> = {};
        private _resultHistory: MockSaveResultEntry[] = [];
        get ResultHistory(): MockSaveResultEntry[] {
            return this._resultHistory;
        }
        get LatestResult(): MockSaveResultEntry | null {
            return this._resultHistory.length > 0 ? this._resultHistory[this._resultHistory.length - 1] : null;
        }
        private readOwnField(name: string): MockFieldValue {
            switch (name) {
                case 'ID': return this.ID;
                case 'CollectionID': return this.CollectionID;
                case 'ArtifactID': return this.ArtifactID;
                case 'UserID': return this.UserID;
                case 'SharedByUserID': return this.SharedByUserID;
                case 'CanRead': return this.CanRead;
                case 'CanShare': return this.CanShare;
                case 'CanEdit': return this.CanEdit;
                case 'CanDelete': return this.CanDelete;
                case 'Collection': return this.Collection;
                default: return undefined;
            }
        }
        GetFieldByName(name: string): { OldValue: MockFieldValue; Value: MockFieldValue } | null {
            const cur = this.readOwnField(name);
            if (cur === undefined && !(name in this.OldValues)) {
                return null;
            }
            return {
                OldValue: name in this.OldValues ? this.OldValues[name] : cur,
                Value: cur,
            };
        }
        get ActiveUser(): { ID: string; Email?: string; Name?: string } | null {
            return this.ContextCurrentUser;
        }
        CheckPermissions(_type: string, _throwError: boolean): boolean {
            return false;
        }
        async Save(options?: { IgnoreDirtyState?: boolean }): Promise<boolean> {
            return mocks.superSave(options);
        }
        async Delete(options?: { SkipValidation?: boolean }): Promise<boolean> {
            return mocks.superSave(options);
        }
    }
    return {
        MJCollectionPermissionEntity: class extends MockPermissionEntityBase {},
        MJArtifactPermissionEntity: class extends MockPermissionEntityBase {},
    };
});

vi.mock('../custom/Permissions/shareNotification', () => ({
    CreateShareNotification: mocks.createShareNotification,
}));

import { EntityInfo, EntityPermissionType, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJCollectionPermissionEntityExtended } from '../custom/Permissions/MJCollectionPermissionEntityExtended';
import { MJArtifactPermissionEntityExtended } from '../custom/Permissions/MJArtifactPermissionEntityExtended';
import {
    ArtifactPermissionEngine,
    DelegatePermissionDecision,
    IArtifactPermissionDelegate,
} from '../custom/ArtifactPermissionDelegate';

class TestCollectionShareEntity extends MJCollectionPermissionEntityExtended {
    private _isSaved = false;
    override get IsSaved(): boolean {
        return this._isSaved;
    }
    set IsSaved(value: boolean) {
        this._isSaved = value;
    }
    OldValues: Record<string, MockFieldValue> = {};
    constructor() {
        super(new EntityInfo());
    }
}

class TestArtifactShareEntity extends MJArtifactPermissionEntityExtended {
    private _isSaved = false;
    override get IsSaved(): boolean {
        return this._isSaved;
    }
    set IsSaved(value: boolean) {
        this._isSaved = value;
    }
    OldValues: Record<string, MockFieldValue> = {};
    constructor() {
        super(new EntityInfo());
    }
}

function makeCallerUser(callerId: string): UserInfo {
    const user = new UserInfo();
    user.ID = callerId;
    user.Email = 'caller@test.com';
    return user;
}

describe('MJCollectionPermissionEntityExtended — share authorization gate (create + update)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [] });
        mocks.createShareNotification.mockResolvedValue(undefined);
        mocks.getSystemUser.mockResolvedValue({ ID: UUID_SYSTEM, Email: 'sys@test.com' });
    });

    function makeCollectionShare(callerId = UUID_OWNER): TestCollectionShareEntity {
        const entity = new TestCollectionShareEntity();
        entity.CollectionID = UUID_COLL;
        entity.UserID = UUID_GRANTEE;
        entity.SharedByUserID = callerId;
        entity.ContextCurrentUser = makeCallerUser(callerId);
        return entity;
    }

    it('allows the collection owner to create a share with full grant flags', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OWNER, ParentID: null }] };
            }
            return { Success: true, Results: [] };
        });

        const entity = makeCollectionShare(UUID_OWNER);
        entity.CanEdit = true;
        entity.CanDelete = true;
        entity.CanShare = true;

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('blocks a non-owner without a Share grant and records the reason on LatestResult', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: null }] };
            }
            return { Success: true, Results: [] };
        });

        const entity = makeCollectionShare(UUID_CALLER);
        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(entity.LatestResult).not.toBeNull();
        expect(entity.LatestResult!.Success).toBe(false);
        expect(entity.LatestResult!.CompleteMessage).toContain('Only the collection owner');
    });

    it('allows a non-owner holding an ancestor collection CanShare grant within grant ceiling', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                if (params.ExtraFilter?.includes(UUID_COLL)) {
                    return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: UUID_PARENT_COLL }] };
                }
                if (params.ExtraFilter?.includes(UUID_PARENT_COLL)) {
                    return { Success: true, Results: [{ ID: UUID_PARENT_COLL, OwnerID: UUID_OTHER, ParentID: null }] };
                }
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [
                        { CollectionID: UUID_PARENT_COLL, CanRead: true, CanEdit: false, CanDelete: false, CanShare: true },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const entity = makeCollectionShare(UUID_CALLER);
        entity.CanRead = true;
        entity.CanEdit = false;
        entity.CanDelete = false;

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('blocks grant-ceiling escalation when CanShare holder lacks CanEdit/CanDelete', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: null }] };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [{ CollectionID: UUID_COLL, CanRead: true, CanEdit: false, CanDelete: false, CanShare: true }],
                };
            }
            return { Success: true, Results: [] };
        });

        const entity = makeCollectionShare(UUID_CALLER);
        entity.CanEdit = true;
        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(entity.LatestResult?.CompleteMessage).toContain('exceed the caller');
    });

    it('enforces authorization on IsSaved=true updates and blocks re-parenting CollectionID or SharedByUserID', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OWNER, ParentID: null }] };
            }
            return { Success: true, Results: [] };
        });

        // 1. Re-parenting CollectionID on an existing share must fail closed
        const reparentColl = makeCollectionShare(UUID_OWNER);
        reparentColl.IsSaved = true;
        reparentColl.OldValues = { CollectionID: UUID_OTHER_COLL, SharedByUserID: UUID_OWNER };
        await expect(reparentColl.Save()).resolves.toBe(false);
        expect(reparentColl.LatestResult?.CompleteMessage).toContain('Cannot reassign CollectionID');
        expect(mocks.superSave).not.toHaveBeenCalled();

        // 2. Re-parenting SharedByUserID on an existing share must fail closed
        const reparentGrantor = makeCollectionShare(UUID_OWNER);
        reparentGrantor.IsSaved = true;
        reparentGrantor.OldValues = { CollectionID: UUID_COLL, SharedByUserID: UUID_OTHER };
        await expect(reparentGrantor.Save()).resolves.toBe(false);
        expect(reparentGrantor.LatestResult?.CompleteMessage).toContain('Cannot reassign SharedByUserID');
        expect(mocks.superSave).not.toHaveBeenCalled();

        // 3. Updating permissions without Share authority (unauthorized caller) is blocked
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: null }] };
            }
            return { Success: true, Results: [] };
        });
        const unauthorizedUpdate = makeCollectionShare(UUID_CALLER);
        unauthorizedUpdate.IsSaved = true;
        unauthorizedUpdate.OldValues = { CollectionID: UUID_COLL, SharedByUserID: UUID_CALLER };
        unauthorizedUpdate.CanEdit = true;
        await expect(unauthorizedUpdate.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('rejects non-UUID / SQL injection payloads before running SQL filters', async () => {
        const entity = makeCollectionShare(UUID_OWNER);
        entity.CollectionID = `' OR 1=1--`;

        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.runView).not.toHaveBeenCalled();
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(entity.LatestResult?.CompleteMessage).toContain('valid UUID');
    });

    it('skips the server gate on non-Database (client-side) providers', async () => {
        const entity = makeCollectionShare(UUID_OWNER);
        shareProviderOverrides.set(entity, { ProviderType: 'Network' });

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.runView).not.toHaveBeenCalled();
    });
});

describe('MJArtifactPermissionEntityExtended — share authorization gate (create + update)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [] });
        mocks.createShareNotification.mockResolvedValue(undefined);
        mocks.getSystemUser.mockResolvedValue({ ID: UUID_SYSTEM, Email: 'sys@test.com' });
    });

    function makeArtifactShare(callerId = UUID_OWNER): TestArtifactShareEntity {
        const entity = new TestArtifactShareEntity();
        entity.ArtifactID = UUID_ART;
        entity.UserID = UUID_GRANTEE;
        entity.SharedByUserID = callerId;
        entity.ContextCurrentUser = makeCallerUser(callerId);
        return entity;
    }

    it('allows the artifact owner to create a share and blocks non-owner without CanShare', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            return { Success: true, Results: [] };
        });

        const ownerShare = makeArtifactShare(UUID_OWNER);
        await expect(ownerShare.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);

        mocks.superSave.mockClear();
        const outsiderShare = makeArtifactShare(UUID_OTHER);
        await expect(outsiderShare.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(outsiderShare.LatestResult?.CompleteMessage).toContain('Only the artifact owner');
    });

    it('blocks CanShare-only caller from escalating CanEdit/CanDelete on both Create and Update', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'p1', CanRead: true, CanEdit: false, CanDelete: false, CanShare: true }],
                };
            }
            return { Success: true, Results: [] };
        });

        // Create escalation blocked
        const createEscalate = makeArtifactShare(UUID_CALLER);
        createEscalate.CanEdit = true;
        await expect(createEscalate.Save()).resolves.toBe(false);
        expect(createEscalate.LatestResult?.CompleteMessage).toContain('exceed the caller');

        // Update escalation blocked
        const updateEscalate = makeArtifactShare(UUID_CALLER);
        updateEscalate.IsSaved = true;
        updateEscalate.OldValues = { ArtifactID: UUID_ART, SharedByUserID: UUID_CALLER };
        updateEscalate.CanDelete = true;
        await expect(updateEscalate.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('forbids re-parenting ArtifactID or SharedByUserID on IsSaved=true updates', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            return { Success: true, Results: [] };
        });

        const reparentArtifact = makeArtifactShare(UUID_OWNER);
        reparentArtifact.IsSaved = true;
        reparentArtifact.OldValues = { ArtifactID: UUID_OTHER_ART, SharedByUserID: UUID_OWNER };
        await expect(reparentArtifact.Save()).resolves.toBe(false);
        expect(reparentArtifact.LatestResult?.CompleteMessage).toContain('Cannot reassign ArtifactID');
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('respects IArtifactPermissionDelegate Deny override when attempting to share', async () => {
        const delegateKey = 'Custom: ShareDenyHost';
        const denyDelegate: IArtifactPermissionDelegate = {
            CanRead: async () => 'Allow' as DelegatePermissionDecision,
            CanEdit: async () => 'Allow' as DelegatePermissionDecision,
            CanDelete: async () => 'Allow' as DelegatePermissionDecision,
            CanShare: async () => 'Deny' as DelegatePermissionDecision,
        };
        ArtifactPermissionEngine.Instance.RegisterDelegate(delegateKey, denyDelegate);

        const entity = makeArtifactShare(UUID_OWNER);
        shareProviderOverrides.set(entity, {
            ProviderType: 'Database',
            Entities: [{ ID: UUID_DELEGATE_ENTITY, Name: delegateKey }],
            EntityByID: (id: string) =>
                id === UUID_DELEGATE_ENTITY ? { ID: UUID_DELEGATE_ENTITY, Name: delegateKey } : undefined,
        });
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: UUID_ART,
                            UserID: UUID_OWNER,
                            DelegateEntityID: UUID_DELEGATE_ENTITY,
                            DelegateRecordID: UUID_OTHER,
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('allows sharing an artifact via CollectionArtifact -> MJ: Collection Permissions CanShare grant', async () => {
        mocks.runView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return { Success: true, Results: [{ ID: UUID_VER }] };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return { Success: true, Results: [{ CollectionID: UUID_COLL }] };
            }
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: null }] };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [{ CollectionID: UUID_COLL, CanRead: true, CanEdit: true, CanDelete: false, CanShare: true }],
                };
            }
            return { Success: true, Results: [] };
        });

        const entity = makeArtifactShare(UUID_CALLER);
        entity.CanRead = true;
        entity.CanEdit = true;
        entity.CanDelete = false;

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('rejects SQL injection / non-UUID ArtifactID or UserID before querying SQL', async () => {
        const badArtifact = makeArtifactShare(UUID_OWNER);
        badArtifact.ArtifactID = `1234' UNION SELECT * FROM Users--`;
        await expect(badArtifact.Save()).resolves.toBe(false);
        expect(mocks.runView).not.toHaveBeenCalled();

        const badGrantee = makeArtifactShare(UUID_OWNER);
        badGrantee.UserID = 'not-a-uuid';
        await expect(badGrantee.Save()).resolves.toBe(false);
        expect(mocks.runView).not.toHaveBeenCalled();
    });
});

describe('P0-R3 negative gates — UserID immutability, null->non-null transitions, Delete CanShare, OldValue eviction & linked-artifact ceiling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [] });
        mocks.createShareNotification.mockResolvedValue(undefined);
        mocks.getSystemUser.mockResolvedValue({ ID: UUID_SYSTEM, Email: 'sys@test.com' });
    });

    function buildArtifactShare(callerId = UUID_OWNER): TestArtifactShareEntity {
        const entity = new TestArtifactShareEntity();
        entity.ArtifactID = UUID_ART;
        entity.UserID = UUID_GRANTEE;
        entity.SharedByUserID = callerId;
        entity.ContextCurrentUser = makeCallerUser(callerId);
        return entity;
    }

    function buildCollectionShare(callerId = UUID_OWNER): TestCollectionShareEntity {
        const entity = new TestCollectionShareEntity();
        entity.CollectionID = UUID_COLL;
        entity.UserID = UUID_GRANTEE;
        entity.SharedByUserID = callerId;
        entity.ContextCurrentUser = makeCallerUser(callerId);
        return entity;
    }

    it('rejects UserID reassignment on IsSaved=true updates for both Artifact and Collection shares', async () => {
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OWNER, ParentID: null }] };
            }
            return { Success: true, Results: [] };
        });

        const artShare = buildArtifactShare(UUID_OWNER);
        artShare.IsSaved = true;
        artShare.OldValues = { ArtifactID: UUID_ART, SharedByUserID: UUID_OWNER, UserID: UUID_GRANTEE };
        artShare.UserID = UUID_OTHER;
        await expect(artShare.Save()).resolves.toBe(false);
        expect(artShare.LatestResult?.CompleteMessage).toContain('Cannot reassign UserID');
        expect(mocks.superSave).not.toHaveBeenCalled();

        const collShare = buildCollectionShare(UUID_OWNER);
        collShare.IsSaved = true;
        collShare.OldValues = { CollectionID: UUID_COLL, SharedByUserID: UUID_OWNER, UserID: UUID_GRANTEE };
        collShare.UserID = UUID_OTHER;
        await expect(collShare.Save()).resolves.toBe(false);
        expect(collShare.LatestResult?.CompleteMessage).toContain('Cannot reassign UserID');
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('catches null -> non-null transitions on immutable share fields during IsSaved=true updates', async () => {
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            return { Success: true, Results: [] };
        });

        const share = buildArtifactShare(UUID_OWNER);
        share.IsSaved = true;
        share.OldValues = { ArtifactID: UUID_ART, SharedByUserID: null, UserID: UUID_GRANTEE };
        share.SharedByUserID = UUID_OWNER;
        await expect(share.Save()).resolves.toBe(false);
        expect(share.LatestResult?.CompleteMessage).toContain('Cannot reassign SharedByUserID');
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('gates Delete() on live perms.CanShare and evicts caches for stored OldValue UserID', async () => {
        // First deny Delete when caller lacks CanShare
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'p-read', CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
                };
            }
            return { Success: true, Results: [] };
        });

        const deniedDelete = buildArtifactShare(UUID_CALLER);
        deniedDelete.IsSaved = true;
        deniedDelete.OldValues = { ArtifactID: UUID_ART, SharedByUserID: UUID_CALLER, UserID: UUID_GRANTEE };
        await expect(deniedDelete.Delete()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();

        // Next verify authorized Delete evicts the OldValues.UserID entry even if entity.UserID was mutated in-memory
        const notifySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'NotifyPermissionsChanged');
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'p-share', CanRead: true, CanEdit: false, CanDelete: false, CanShare: true }],
                };
            }
            return { Success: true, Results: [] };
        });

        const allowedDelete = buildArtifactShare(UUID_CALLER);
        allowedDelete.IsSaved = true;
        allowedDelete.OldValues = { ArtifactID: UUID_ART, SharedByUserID: UUID_CALLER, UserID: UUID_GRANTEE };
        allowedDelete.UserID = UUID_OTHER;
        await expect(allowedDelete.Delete()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith(
            expect.objectContaining({ ArtifactID: UUID_ART, TargetUserID: UUID_GRANTEE })
        );
        notifySpy.mockRestore();
    });

    it('enforces linked-artifact CanDelete/CanShare grant ceiling when creating a Collection share', async () => {
        // Grantor owns collection OR has CanShare+CanDelete on collection,
        // but collection links to UUID_ART where grantor only has CanRead+CanShare (NO CanDelete).
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Collections') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_COLL, OwnerID: UUID_OTHER, ParentID: null }],
                };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'cp-1',
                            CollectionID: UUID_COLL,
                            CanRead: true,
                            CanEdit: true,
                            CanDelete: true,
                            CanShare: true,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return {
                    Success: true,
                    Results: [{ CollectionID: UUID_COLL, ArtifactVersionID: 'av-linked-1' }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [{ ID: 'av-linked-1', ArtifactID: UUID_ART }],
                };
            }
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OTHER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'ap-1', CanRead: true, CanEdit: true, CanDelete: false, CanShare: true }],
                };
            }
            return { Success: true, Results: [] };
        });

        const artPermSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockResolvedValue({
                ArtifactID: UUID_ART,
                CanRead: true,
                CanEdit: true,
                CanDelete: false,
                CanShare: true,
                Source: 'ArtifactPermission',
                Reason: 'Direct permission',
            });

        const share = buildCollectionShare(UUID_CALLER);
        share.CanRead = true;
        share.CanEdit = true;
        share.CanDelete = true;
        share.CanShare = false;
        await expect(share.Save()).resolves.toBe(false);
        expect(artPermSpy).toHaveBeenCalledWith(expect.anything(), UUID_ART, expect.anything());
        expect(share.LatestResult?.CompleteMessage).toContain('linked artifact');
        expect(mocks.superSave).not.toHaveBeenCalled();
        artPermSpy.mockRestore();
    });
});

describe('P0-P3-2.1c Grantee "Leave shared item" Delete() gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [] });
        mocks.createShareNotification.mockResolvedValue(undefined);
        mocks.getSystemUser.mockResolvedValue({ ID: UUID_SYSTEM, Email: 'sys@test.com' });
    });

    it('allows a grantee to Delete() their own artifact share row while blocking modifications and other users deletes', async () => {
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'p-read', CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
                };
            }
            return { Success: true, Results: [] };
        });

        const notifySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'NotifyPermissionsChanged');

        // 1. Grantee leaving their own share row succeeds even without CanShare
        const ownShare = new TestArtifactShareEntity();
        ownShare.ArtifactID = UUID_ART;
        ownShare.UserID = UUID_GRANTEE;
        ownShare.SharedByUserID = UUID_OWNER;
        ownShare.ContextCurrentUser = makeCallerUser(UUID_GRANTEE);
        ownShare.IsSaved = true;
        ownShare.OldValues = { ArtifactID: UUID_ART, UserID: UUID_GRANTEE, SharedByUserID: UUID_OWNER };

        expect(ownShare.CheckPermissions(EntityPermissionType.Delete, false)).toBe(true);
        expect(ownShare.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        await expect(ownShare.Delete()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith(
            expect.objectContaining({ ArtifactID: UUID_ART, TargetUserID: UUID_GRANTEE })
        );

        // 2. Grantee CANNOT modify their own share row (e.g. privilege escalation via Save)
        mocks.superSave.mockClear();
        ownShare.CanEdit = true;
        await expect(ownShare.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();

        // 3. Grantee CANNOT delete another user's share row (even if mutating UserID in-memory)
        const otherShare = new TestArtifactShareEntity();
        otherShare.ArtifactID = UUID_ART;
        otherShare.UserID = UUID_GRANTEE; // tampered in-memory
        otherShare.SharedByUserID = UUID_OWNER;
        otherShare.ContextCurrentUser = makeCallerUser(UUID_GRANTEE);
        otherShare.IsSaved = true;
        otherShare.OldValues = { ArtifactID: UUID_ART, UserID: UUID_OTHER, SharedByUserID: UUID_OWNER };

        expect(otherShare.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);
        await expect(otherShare.Delete()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        notifySpy.mockRestore();
    });

    it('allows a grantee to Delete() their own collection share row while blocking modifications and other users deletes', async () => {
        mocks.runView.mockImplementation(async (params: MockRunViewParams) => {
            if (params.EntityName === 'MJ: Collections') {
                return { Success: true, Results: [{ ID: UUID_COLL, OwnerID: UUID_OWNER, ParentID: null }] };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [{ CollectionID: UUID_COLL, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
                };
            }
            return { Success: true, Results: [] };
        });

        // 1. Grantee leaving their own collection share succeeds even without CanShare
        const ownShare = new TestCollectionShareEntity();
        ownShare.CollectionID = UUID_COLL;
        ownShare.UserID = UUID_GRANTEE;
        ownShare.SharedByUserID = UUID_OWNER;
        ownShare.ContextCurrentUser = makeCallerUser(UUID_GRANTEE);
        ownShare.IsSaved = true;
        ownShare.OldValues = { CollectionID: UUID_COLL, UserID: UUID_GRANTEE, SharedByUserID: UUID_OWNER };

        expect(ownShare.CheckPermissions(EntityPermissionType.Delete, false)).toBe(true);
        expect(ownShare.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        await expect(ownShare.Delete()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);

        // 2. Grantee CANNOT modify their own collection share row
        mocks.superSave.mockClear();
        ownShare.CanEdit = true;
        await expect(ownShare.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();

        // 3. Grantee CANNOT delete another user's collection share row (including in-memory UserID tamper)
        const otherShare = new TestCollectionShareEntity();
        otherShare.CollectionID = UUID_COLL;
        otherShare.UserID = UUID_GRANTEE; // tampered in-memory
        otherShare.SharedByUserID = UUID_OWNER;
        otherShare.ContextCurrentUser = makeCallerUser(UUID_GRANTEE);
        otherShare.IsSaved = true;
        otherShare.OldValues = { CollectionID: UUID_COLL, UserID: UUID_OTHER, SharedByUserID: UUID_OWNER };

        expect(otherShare.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);
        await expect(otherShare.Delete()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });
});
