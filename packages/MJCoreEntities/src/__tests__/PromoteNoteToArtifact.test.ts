import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    EntityUserPermissionInfo,
    IMetadataProvider,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import {
    DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME,
    DEFAULT_RECORD_ARTIFACT_ROLE,
    LinkArtifactToRecord,
    PromoteNoteToArtifact,
} from '../custom/PromoteNoteToArtifact';
import { ArtifactMetadataEngine } from '../engines/artifacts';
import {
    MJArtifactEntity,
    MJRecordArtifactEntity,
} from '../generated/entity_subclasses';

const USER_EDITOR_ID = '11111111-1111-4111-8111-111111111111';
const USER_READER_ID = '22222222-2222-4222-8222-222222222222';
const HOST_ENTITY_ID = '33333333-3333-4333-8333-333333333333';
const HOST_RECORD_ID = '44444444-4444-4444-8444-444444444444';
const MARKDOWN_TYPE_ID = '55555555-5555-4555-8555-555555555555';
const CREATED_ARTIFACT_ID = '66666666-6666-4666-8666-666666666666';
const CREATED_VERSION_ID = '77777777-7777-4777-8777-777777777777';
const CREATED_LINK_ID = '88888888-8888-4888-8888-888888888888';
const EXISTING_LINK_ID = '99999999-9999-4999-8999-999999999999';

function createUser(id: string, email: string): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: [],
    });
}

function createPerms(canRead: boolean, canUpdate: boolean): EntityUserPermissionInfo {
    const perms = new EntityUserPermissionInfo();
    perms.CanRead = canRead;
    perms.CanUpdate = canUpdate;
    perms.CanCreate = canUpdate;
    perms.CanDelete = false;
    return perms;
}

function createMockEntity(name: string, id: string, canUpdateForUser: (u: UserInfo) => boolean): EntityInfo {
    const pk = { Name: 'ID', IsPrimaryKey: true } as EntityFieldInfo;
    return {
        ID: id,
        Name: name,
        PrimaryKeys: [pk],
        FirstPrimaryKey: pk,
        GetUserPermisions: vi.fn((u: UserInfo) => createPerms(true, canUpdateForUser(u))),
    } as Pick<EntityInfo, 'ID' | 'Name' | 'PrimaryKeys' | 'FirstPrimaryKey' | 'GetUserPermisions'> as EntityInfo;
}

function createFailureResult(message: string): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Message = message;
    return result;
}

interface MockArtifactStub {
    ID: string;
    Name: string;
    Description: string | null;
    TypeID: string;
    UserID: string;
    DelegateEntityID: string | null;
    DelegateRecordID: string | null;
    Visibility: MJArtifactEntity['Visibility'];
    EnvironmentID: string;
    LatestResult?: BaseEntityResult;
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

interface MockVersionStub {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Name: string | null;
    Description: string | null;
    Comments: string | null;
    Content: string | null;
    ContentMode: 'File' | 'Text';
    UserID: string;
    LatestResult?: BaseEntityResult;
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

interface MockLinkStub {
    ID: string;
    EntityID: string;
    RecordID: string;
    ArtifactID: string;
    Role: string;
    Sequence: number;
    ContextDescription: string | null;
    LinkedByUserID: string | null;
    PinnedArtifactVersionID: string | null;
    LatestResult?: BaseEntityResult;
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
}

interface ProviderHarnessOptions {
    ArtifactSaveResult?: boolean;
    ArtifactSaveError?: string;
    VersionSaveResult?: boolean;
    VersionSaveError?: string;
    LinkSaveResult?: boolean;
    LinkSaveError?: string;
    ExistingLinkOnCollision?: boolean;
    MissingArtifactType?: boolean;
    CanUpdateForUser?: (user: UserInfo) => boolean;
}

function createHarness(options: ProviderHarnessOptions = {}) {
    const hostEntity = createMockEntity(
        'MJ: Companies',
        HOST_ENTITY_ID,
        options.CanUpdateForUser ?? ((u) => u.ID === USER_EDITOR_ID)
    );

    const artifactMock: MockArtifactStub = {
        ID: '',
        Name: '',
        Description: null,
        TypeID: '',
        UserID: '',
        DelegateEntityID: null,
        DelegateRecordID: null,
        Visibility: 'Always',
        EnvironmentID: '',
        NewRecord: vi.fn(() => true),
        Save: vi.fn(async () => {
            if (options.ArtifactSaveResult === false) {
                artifactMock.LatestResult = createFailureResult(options.ArtifactSaveError ?? 'Artifact save failed');
                return false;
            }
            artifactMock.ID = CREATED_ARTIFACT_ID;
            return true;
        }),
        Delete: vi.fn(async () => true),
    };

    const versionMock: MockVersionStub = {
        ID: '',
        ArtifactID: '',
        VersionNumber: 0,
        Name: null,
        Description: null,
        Comments: null,
        Content: null,
        ContentMode: 'Text',
        UserID: '',
        NewRecord: vi.fn(() => true),
        Save: vi.fn(async () => {
            if (options.VersionSaveResult === false) {
                versionMock.LatestResult = createFailureResult(options.VersionSaveError ?? 'Version save failed');
                return false;
            }
            versionMock.ID = CREATED_VERSION_ID;
            return true;
        }),
        Delete: vi.fn(async () => true),
    };

    const linkMock: MockLinkStub = {
        ID: '',
        EntityID: '',
        RecordID: '',
        ArtifactID: '',
        Role: '',
        Sequence: 0,
        ContextDescription: null,
        LinkedByUserID: null,
        PinnedArtifactVersionID: null,
        NewRecord: vi.fn(() => true),
        Save: vi.fn(async () => {
            if (options.LinkSaveResult === false) {
                linkMock.LatestResult = createFailureResult(options.LinkSaveError ?? 'Link save failed');
                return false;
            }
            linkMock.ID = CREATED_LINK_ID;
            return true;
        }),
        Delete: vi.fn(async () => true),
    };

    const existingLinkMock: Partial<MJRecordArtifactEntity> = {
        ID: EXISTING_LINK_ID,
        EntityID: HOST_ENTITY_ID,
        RecordID: HOST_RECORD_ID,
        ArtifactID: CREATED_ARTIFACT_ID,
        Role: DEFAULT_RECORD_ARTIFACT_ROLE,
    };

    const observedGetEntityCalls: Array<{ EntityName: string; ActorId: string | undefined }> = [];
    const observedRunViewCalls: Array<{ EntityName: string; ActorId: string | undefined; Params: RunViewParams }> = [];

    async function getEntityObjectImpl<T extends BaseEntity>(
        entityName: string,
        loadKeyOrUser?: CompositeKey | UserInfo,
        contextUser?: UserInfo
    ): Promise<T> {
        const actor = loadKeyOrUser instanceof UserInfo ? loadKeyOrUser : contextUser;
        observedGetEntityCalls.push({ EntityName: entityName, ActorId: actor?.ID });
        if (entityName === 'MJ: Artifacts') return artifactMock as object as T;
        if (entityName === 'MJ: Artifact Versions') return versionMock as object as T;
        if (entityName === 'MJ: Record Artifacts') return linkMock as object as T;
        throw new Error(`Unexpected entity '${entityName}'`);
    }

    const provider = {
        Entities: [hostEntity],
        EntityByID: vi.fn((id: string) => (id.toLowerCase() === HOST_ENTITY_ID.toLowerCase() ? hostEntity : undefined)),
        EntityByName: vi.fn((name: string) =>
            name.trim().toLowerCase() === 'mj: companies' ? hostEntity : undefined
        ),
        GetEntityObject: getEntityObjectImpl,
    } as Pick<IMetadataProvider, 'Entities' | 'EntityByID' | 'EntityByName' | 'GetEntityObject'> as IMetadataProvider;

    vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue(undefined);
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: RunViewParams, contextUser?: UserInfo) => {
            observedRunViewCalls.push({
                EntityName: params.EntityName ?? '',
                ActorId: contextUser?.ID,
                Params: params,
            });
            if (params.EntityName === 'MJ: Artifact Types') {
                return {
                    Success: true,
                    Results: options.MissingArtifactType
                        ? []
                        : [{ ID: MARKDOWN_TYPE_ID, Name: DEFAULT_PROMOTED_ARTIFACT_TYPE_NAME }],
                    RowCount: options.MissingArtifactType ? 0 : 1,
                    TotalRowCount: options.MissingArtifactType ? 0 : 1,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: Record Artifacts' && options.ExistingLinkOnCollision) {
                return {
                    Success: true,
                    Results: [existingLinkMock],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        }),
    } as Pick<RunView, 'RunView'> as RunView);

    return {
        provider,
        artifactMock,
        versionMock,
        linkMock,
        observedGetEntityCalls,
        observedRunViewCalls,
    };
}

describe('PromoteNoteToArtifact', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates Markdown Document artifact, v1 version, DelegateEntityID/DelegateRecordID, and RecordArtifact link with forwarded contextUser', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness();

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Q4 Deal Call Notes',
                MarkdownContent: '# Call Summary\n\nAgreed on milestone pricing.',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
                ContextDescription: 'Promoted from quick call note',
            },
            editor,
            h.provider
        );

        expect(result.Success).toBe(true);
        expect(result.ArtifactID).toBe(CREATED_ARTIFACT_ID);
        expect(result.ArtifactVersionID).toBe(CREATED_VERSION_ID);
        expect(result.VersionNumber).toBe(1);
        expect(result.RecordArtifactID).toBe(CREATED_LINK_ID);
        expect(result.LinkReusedExisting).toBe(false);

        expect(h.artifactMock.Name).toBe('Q4 Deal Call Notes');
        expect(h.artifactMock.TypeID).toBe(MARKDOWN_TYPE_ID);
        expect(h.artifactMock.UserID).toBe(USER_EDITOR_ID);
        expect(h.artifactMock.DelegateEntityID).toBe(HOST_ENTITY_ID);
        expect(h.artifactMock.DelegateRecordID).toBe(HOST_RECORD_ID);

        expect(h.versionMock.ArtifactID).toBe(CREATED_ARTIFACT_ID);
        expect(h.versionMock.VersionNumber).toBe(1);
        expect(h.versionMock.Content).toBe('# Call Summary\n\nAgreed on milestone pricing.');
        expect(h.versionMock.ContentMode).toBe('Text');

        expect(h.linkMock.EntityID).toBe(HOST_ENTITY_ID);
        expect(h.linkMock.RecordID).toBe(HOST_RECORD_ID);
        expect(h.linkMock.ArtifactID).toBe(CREATED_ARTIFACT_ID);
        expect(h.linkMock.Role).toBe(DEFAULT_RECORD_ARTIFACT_ROLE);
        expect(h.linkMock.LinkedByUserID).toBe(USER_EDITOR_ID);

        // Explicit contextUser forwarded to every GetEntityObject and RunView call
        expect(h.observedGetEntityCalls.map((c) => c.ActorId)).toEqual([
            USER_EDITOR_ID,
            USER_EDITOR_ID,
            USER_EDITOR_ID,
        ]);
        expect(h.observedRunViewCalls.every((c) => c.ActorId === USER_EDITOR_ID)).toBe(true);
    });

    it('supports skipping RecordArtifact link creation when CreateRecordArtifactLink is false', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness();

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Standalone Direct FK Brief',
                MarkdownContent: 'Direct ArtifactID FK note',
                HostEntityID: HOST_ENTITY_ID,
                HostRecordID: HOST_RECORD_ID,
                CreateRecordArtifactLink: false,
            },
            editor,
            h.provider
        );

        expect(result.Success).toBe(true);
        expect(result.RecordArtifactID).toBeUndefined();
        expect(h.linkMock.Save).not.toHaveBeenCalled();
    });

    it('denies read-only users who lack Update permission on the host entity', async () => {
        const reader = createUser(USER_READER_ID, 'reader@example.com');
        const h = createHarness();

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Unauthorized Note',
                MarkdownContent: 'Should not save',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            reader,
            h.provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorCode).toBe('PERMISSION_DENIED');
        expect(h.artifactMock.Save).not.toHaveBeenCalled();
    });

    it('performs compensating rollback of Artifact when v1 ArtifactVersion save fails', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness({
            VersionSaveResult: false,
            VersionSaveError: 'Simulated version DB constraint failure',
        });

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Version Failure Note',
                MarkdownContent: 'Body',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h.provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorCode).toBe('VERSION_SAVE_FAILED');
        expect(h.artifactMock.Delete).toHaveBeenCalledTimes(1);
        expect(h.linkMock.Save).not.toHaveBeenCalled();
    });

    it('performs compensating rollback of both v1 Version and Artifact when RecordArtifact link fails with non-collision error', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness({
            LinkSaveResult: false,
            LinkSaveError: 'Database connection dropped during link insert',
        });

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Link Failure Note',
                MarkdownContent: 'Body',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h.provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorCode).toBe('LINK_SAVE_FAILED');
        expect(h.versionMock.Delete).toHaveBeenCalledTimes(1);
        expect(h.artifactMock.Delete).toHaveBeenCalledTimes(1);
    });

    it('handles UQ_RecordArtifact_Record_Artifact_Role collision idempotently without rolling back', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness({
            LinkSaveResult: false,
            LinkSaveError:
                "Violation of UNIQUE KEY constraint 'UQ_RecordArtifact_Record_Artifact_Role'. Cannot insert duplicate key.",
            ExistingLinkOnCollision: true,
        });

        const result = await PromoteNoteToArtifact(
            {
                Title: 'Idempotent Promoted Note',
                MarkdownContent: 'Body',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h.provider
        );

        expect(result.Success).toBe(true);
        expect(result.RecordArtifactID).toBe(EXISTING_LINK_ID);
        expect(result.LinkReusedExisting).toBe(true);
        expect(h.versionMock.Delete).not.toHaveBeenCalled();
        expect(h.artifactMock.Delete).not.toHaveBeenCalled();
    });

    it('LinkArtifactToRecord also handles PostgreSQL 23505 unique collisions idempotently', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h = createHarness({
            LinkSaveResult: false,
            LinkSaveError: 'error: duplicate key value violates unique constraint (23505)',
            ExistingLinkOnCollision: true,
        });

        const linkRes = await LinkArtifactToRecord(
            {
                HostEntityID: HOST_ENTITY_ID,
                HostRecordID: HOST_RECORD_ID,
                ArtifactID: CREATED_ARTIFACT_ID,
            },
            editor,
            h.provider
        );

        expect(linkRes.Success).toBe(true);
        expect(linkRes.RecordArtifactID).toBe(EXISTING_LINK_ID);
        expect(linkRes.ReusedExisting).toBe(true);
    });

    it('fails closed on missing title, unknown host entity, or missing artifact type', async () => {
        const editor = createUser(USER_EDITOR_ID, 'editor@example.com');
        const h1 = createHarness();

        const emptyTitle = await PromoteNoteToArtifact(
            {
                Title: '   ',
                MarkdownContent: 'Body',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h1.provider
        );
        expect(emptyTitle.Success).toBe(false);
        expect(emptyTitle.ErrorCode).toBe('INVALID_INPUT');

        const missingEntity = await PromoteNoteToArtifact(
            {
                Title: 'Valid Title',
                MarkdownContent: 'Body',
                HostEntityName: 'Unknown Entity',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h1.provider
        );
        expect(missingEntity.Success).toBe(false);
        expect(missingEntity.ErrorCode).toBe('HOST_ENTITY_NOT_FOUND');

        const h2 = createHarness({ MissingArtifactType: true });
        const missingType = await PromoteNoteToArtifact(
            {
                Title: 'Valid Title',
                MarkdownContent: 'Body',
                HostEntityName: 'MJ: Companies',
                HostRecordID: HOST_RECORD_ID,
            },
            editor,
            h2.provider
        );
        expect(missingType.Success).toBe(false);
        expect(missingType.ErrorCode).toBe('ARTIFACT_TYPE_NOT_FOUND');
    });
});
