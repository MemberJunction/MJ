import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    IMetadataProvider,
    RunQuery,
    RunQueryResult,
    RunView,
    RunViewParams,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    ExecuteAgentResult,
    InputArtifact,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactPermissionEngine,
    ConversationEngine,
    IArtifactPermissionDelegate,
} from '@memberjunction/core-entities';
import { AgentRunner } from '../AgentRunner';

const SOURCE_ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const COLLECTION_ARTIFACT_ID = '22222222-2222-4222-8222-222222222222';
const DELEGATE_ARTIFACT_ID = '33333333-3333-4333-8333-333333333333';
const DELEGATE_ENTITY_ID = '44444444-4444-4444-8444-444444444444';
const DELEGATE_RECORD_ID = '55555555-5555-4555-8555-555555555555';
const READABLE_ARTIFACT_ID = '66666666-6666-4666-8666-666666666666';
const FORBIDDEN_ARTIFACT_ID = '77777777-7777-4777-8777-777777777777';
const CONVERSATION_DETAIL_ID = '88888888-8888-4888-8888-888888888888';
const CONVERSATION_ID = '99999999-9999-4999-8999-999999999999';

function createUser(id: string, name: string, email: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = email;
    u.IsActive = true;
    return u;
}

interface MockArtifactPermissionDraft {
    ID: string;
    ArtifactID: string;
    UserID: string;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
    SharedByUserID: string | null;
    LatestResult: { Message: string; CompleteMessage?: string } | null;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
}

interface MockArtifactHeaderDraft {
    ID: string;
    Name: string;
    Description: string | null;
    Comments: string | null;
    TypeID: string;
    UserID: string;
    EnvironmentID: string;
    Visibility: 'Always' | 'System Only';
    LatestResult: { Message: string } | null;
    NewRecord: () => void;
    Load: (id: string) => Promise<boolean>;
    Save: () => Promise<boolean>;
}

interface MockArtifactVersionDraft {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Content: string | null;
    Comments: string | null;
    Name: string | null;
    Description: string | null;
    UserID: string;
    LatestResult: { Message: string } | null;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
}

interface SimpleMockRunViewProvider {
    Entities?: Array<{ ID: string; Name: string }>;
    RunView: (params: RunViewParams) => Promise<{
        Success: boolean;
        Results: Array<Record<string, string | number | boolean | null>>;
        RowCount: number;
        TotalRowCount: number;
        ExecutionTime: number;
        ErrorMessage: string;
        UserViewRunID: string;
    }>;
    GetEntityObject: (
        entityName: string
    ) => Promise<MockArtifactHeaderDraft | MockArtifactVersionDraft | MockArtifactPermissionDraft>;
}

function asMetadataProvider(mock: SimpleMockRunViewProvider): IMetadataProvider {
    const partial: Partial<IMetadataProvider> = {
        ProviderType: 'Database',
        Entities: (mock.Entities ?? []) as IMetadataProvider['Entities'],
        GetEntityObject: mock.GetEntityObject as IMetadataProvider['GetEntityObject'],
    };
    Object.assign(partial, {
        RunView: mock.RunView,
        RunViews: async (paramsArray: RunViewParams[]) =>
            Promise.all(paramsArray.map((p) => mock.RunView(p))),
    });
    return partial as IMetadataProvider;
}

class VettingTestableAgentRunner extends AgentRunner {
    public MaxVersion = 1;
    public LinkedResult: { artifactId: string; versionId: string; versionNumber: number } | undefined;

    public override async FindPreviousArtifactForMessage(): Promise<{ artifactId: string; versionNumber: number } | null> {
        return null;
    }

    public override async GetMaxVersionForArtifact(): Promise<number> {
        return this.MaxVersion;
    }

    public override async CheckForDuplicateVersion(): Promise<string | null> {
        return null;
    }

    public override async LinkArtifactToConversationDetail(
        versionId: string,
        _conversationDetailId: string,
        artifactId: string,
        versionNumber: number
    ): Promise<{ artifactId: string; versionId: string; versionNumber: number }> {
        this.LinkedResult = { artifactId, versionId, versionNumber };
        return this.LinkedResult;
    }

    public async GatherArtifactsForTest(
        conversationId: string,
        contextUser: UserInfo
    ): Promise<InputArtifact[]> {
        return this.gatherConversationArtifacts(conversationId, contextUser);
    }
}

function makeExecuteResult(overrides?: Partial<ExecuteAgentResult>): ExecuteAgentResult {
    const run: Partial<MJAIAgentRunEntityExtended> = {
        AgentID: 'agent-vetting-1',
    };
    return {
        success: true,
        payload: { summary: 'Updated Q4 plan' },
        agentRun: run as MJAIAgentRunEntityExtended,
        ...overrides,
    };
}

describe('AgentRunner — Shared conversation artifact vetting & read visibility (D3)', () => {
    const userA = createUser('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner Alice', 'alice@example.com');
    const userB = createUser('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Collaborator Bob', 'bob@example.com');
    const convOwnerC = createUser('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Conversation Host Carol', 'carol@example.com');

    beforeEach(() => {
        const fakeAgent: Partial<MJAIAgentEntityExtended> = {
            ID: 'agent-vetting-1',
            Name: 'Strategy Writer',
            ArtifactCreationMode: 'Always',
            DefaultArtifactTypeID: 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4',
        };
        const sysUser = createUser('00000000-0000-4000-8000-000000000001', 'System', 'system@example.com');

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([fakeAgent as MJAIAgentEntityExtended]);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(sysUser);
    });

    afterEach(() => {
        ArtifactPermissionEngine.Instance.UnregisterDelegate(DELEGATE_ENTITY_ID);
        vi.restoreAllMocks();
    });

    it('permits a collection editor (Permission = Edit) to version an existing artifact via ArtifactPermissionEngine', async () => {
        const savedVersions: MockArtifactVersionDraft[] = [];
        const createdHeaders: MockArtifactHeaderDraft[] = [];

        const provider = asMetadataProvider({
            Entities: [],
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: COLLECTION_ARTIFACT_ID,
                                UserID: userA.ID,
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-col-1' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ca-1', CollectionID: 'col-shared-1' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'cp-1',
                                CollectionID: 'col-shared-1',
                                UserID: userB.ID,
                                CanRead: true,
                                CanEdit: true,
                                CanDelete: false,
                                CanShare: false,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: 'unexpected-new-art',
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => {
                            createdHeaders.push(hdr);
                            return true;
                        },
                    };
                    return hdr;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ver-col-2',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedVersions.push(ver);
                        return true;
                    },
                };
                return ver;
            },
        });

        const runner = new VettingTestableAgentRunner(provider);
        runner.MaxVersion = 3;

        const info = await runner.ProcessAgentArtifacts(
            makeExecuteResult({
                artifactDirective: {
                    behavior: 'version-source',
                    targetArtifactId: COLLECTION_ARTIFACT_ID,
                },
            }),
            CONVERSATION_DETAIL_ID,
            undefined,
            userB,
            provider
        );

        expect(info).toEqual({
            artifactId: COLLECTION_ARTIFACT_ID,
            versionId: 'ver-col-2',
            versionNumber: 4,
        });
        expect(createdHeaders).toHaveLength(0);
        expect(savedVersions).toHaveLength(1);
        expect(savedVersions[0].ArtifactID).toBe(COLLECTION_ARTIFACT_ID);
    });

    it('rejects a delegate-denied artifact before Save() even when contextUser owns the child row', async () => {
        const denyEditDelegate: IArtifactPermissionDelegate = {
            CanRead: async () => 'Allow',
            CanEdit: async () => 'Deny',
        };
        ArtifactPermissionEngine.Instance.RegisterDelegate(DELEGATE_ENTITY_ID, denyEditDelegate);

        const createdHeaders: MockArtifactHeaderDraft[] = [];
        const savedVersions: MockArtifactVersionDraft[] = [];

        const provider = asMetadataProvider({
            Entities: [{ ID: DELEGATE_ENTITY_ID, Name: 'MJ: Custom Parent Records' }],
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: DELEGATE_ARTIFACT_ID,
                                UserID: userB.ID,
                                DelegateEntityID: DELEGATE_ENTITY_ID,
                                DelegateRecordID: DELEGATE_RECORD_ID,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: 'forked-after-delegate-deny',
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => {
                            createdHeaders.push(hdr);
                            return true;
                        },
                    };
                    return hdr;
                }
                if (entityName === 'MJ: Artifact Permissions') {
                    const perm: MockArtifactPermissionDraft = {
                        ID: 'perm-skip',
                        ArtifactID: '',
                        UserID: '',
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        SharedByUserID: null,
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => true,
                    };
                    return perm;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ver-fork-1',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedVersions.push(ver);
                        return true;
                    },
                };
                return ver;
            },
        });

        const runner = new VettingTestableAgentRunner(provider);
        const info = await runner.ProcessAgentArtifacts(
            makeExecuteResult({
                artifactDirective: {
                    behavior: 'version-source',
                    targetArtifactId: DELEGATE_ARTIFACT_ID,
                },
            }),
            CONVERSATION_DETAIL_ID,
            undefined,
            userB,
            provider
        );

        expect(info).toEqual({
            artifactId: 'forked-after-delegate-deny',
            versionId: 'ver-fork-1',
            versionNumber: 1,
        });
        expect(createdHeaders).toHaveLength(1);
        expect(savedVersions[0].ArtifactID).toBe('forked-after-delegate-deny');
    });

    it('grants CanRead = true to original artifact owner and conversation owner and records fork Comments when falling back to create-new', async () => {
        const createdHeaders: MockArtifactHeaderDraft[] = [];
        const savedVersions: MockArtifactVersionDraft[] = [];
        const savedPermissions: MockArtifactPermissionDraft[] = [];

        const provider = asMetadataProvider({
            Entities: [],
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: SOURCE_ARTIFACT_ID,
                                UserID: userA.ID,
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'perm-read-only',
                                ArtifactID: SOURCE_ARTIFACT_ID,
                                UserID: userB.ID,
                                CanRead: true,
                                CanEdit: false,
                                CanDelete: false,
                                CanShare: false,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversation Details') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: CONVERSATION_DETAIL_ID,
                                ConversationID: CONVERSATION_ID,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: CONVERSATION_ID,
                                UserID: convOwnerC.ID,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => {
                            createdHeaders.push(hdr);
                            return true;
                        },
                    };
                    return hdr;
                }
                if (entityName === 'MJ: Artifact Permissions') {
                    const perm: MockArtifactPermissionDraft = {
                        ID: `perm-grant-${savedPermissions.length + 1}`,
                        ArtifactID: '',
                        UserID: '',
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        SharedByUserID: null,
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            savedPermissions.push(perm);
                            return true;
                        },
                    };
                    return perm;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ffffffff-1111-4222-8333-444444444444',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedVersions.push(ver);
                        return true;
                    },
                };
                return ver;
            },
        });

        const runner = new VettingTestableAgentRunner(provider);
        const info = await runner.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider
        );

        expect(info).toEqual({
            artifactId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            versionId: 'ffffffff-1111-4222-8333-444444444444',
            versionNumber: 1,
        });
        expect(createdHeaders).toHaveLength(1);
        expect(createdHeaders[0].UserID).toBe(userB.ID);
        expect(createdHeaders[0].Comments).toContain(SOURCE_ARTIFACT_ID);
        expect(createdHeaders[0].Comments).toContain('edit access');
        expect(savedVersions[0].Comments).toContain(SOURCE_ARTIFACT_ID);

        // Both source artifact owner (userA) AND conversation owner (convOwnerC) receive CanRead = true
        expect(savedPermissions).toHaveLength(2);
        const grantedUserIds = savedPermissions.map((p) => p.UserID).sort();
        expect(grantedUserIds).toEqual([userA.ID, convOwnerC.ID].sort());
        for (const perm of savedPermissions) {
            expect(perm.ArtifactID).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
            expect(perm.CanRead).toBe(true);
            expect(perm.CanEdit).toBe(false);
            expect(perm.SharedByUserID).toBe(userB.ID);
        }
    });

    it('gatherConversationArtifacts filters loaded versions through ArtifactPermissionEngine CanRead ACL', async () => {
        vi.spyOn(ConversationEngine, 'BranchPathFilterFresh').mockResolvedValue(`ConversationID='${CONVERSATION_ID}'`);

        const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Conversation Details') {
                return {
                    Success: true,
                    Results: [{ ID: CONVERSATION_DETAIL_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
                return {
                    Success: true,
                    Results: [
                        { ID: 'j-read', ArtifactVersionID: 'ver-readable' },
                        { ID: 'j-deny', ArtifactVersionID: 'ver-forbidden' },
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            };
        });

        const runQuerySpy = vi.spyOn(RunQuery.prototype, 'RunQuery').mockResolvedValue({
            Success: true,
            QueryID: 'q-1',
            QueryName: 'GetArtifactVersionsByID',
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
            Results: [
                {
                    VersionID: 'ver-readable',
                    ArtifactID: READABLE_ARTIFACT_ID,
                    VersionNumber: 1,
                    VersionName: 'Shared Strategy.md',
                    ArtifactName: 'Shared Strategy.md',
                    ContentMode: 'Text',
                    FileID: null,
                    Content: '# Readable content',
                    MimeType: 'text/markdown',
                    TypeName: 'Markdown Document',
                    ToolLibraryClass: 'DocumentToolLibrary',
                    DefaultDeliveryMode: 'ToolsOnly',
                    ForceToolsOnly: false,
                },
                {
                    VersionID: 'ver-forbidden',
                    ArtifactID: FORBIDDEN_ARTIFACT_ID,
                    VersionNumber: 1,
                    VersionName: 'Private Financials.md',
                    ArtifactName: 'Private Financials.md',
                    ContentMode: 'Text',
                    FileID: null,
                    Content: '# Secret numbers',
                    MimeType: 'text/markdown',
                    TypeName: 'Markdown Document',
                    ToolLibraryClass: 'DocumentToolLibrary',
                    DefaultDeliveryMode: 'ToolsOnly',
                    ForceToolsOnly: false,
                },
            ],
        } as RunQueryResult);

        const resolvePermsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockImplementation(async (_provider, artifactId) => ({
                ArtifactID: artifactId,
                CanRead: artifactId === READABLE_ARTIFACT_ID,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: artifactId === READABLE_ARTIFACT_ID ? 'direct' : 'none',
            }));

        const dummyPartial: Partial<IMetadataProvider> = { Entities: [] };
        const runner = new VettingTestableAgentRunner(dummyPartial as IMetadataProvider);
        const gathered = await runner.GatherArtifactsForTest(CONVERSATION_ID, userB);

        expect(runViewSpy).toHaveBeenCalled();
        expect(runQuerySpy).toHaveBeenCalled();
        expect(resolvePermsSpy).toHaveBeenCalledTimes(2);
        expect(gathered).toHaveLength(1);
        expect(gathered[0].name).toBe('Shared Strategy.md');
        expect(gathered[0].artifactId).toBe(READABLE_ARTIFACT_ID);
    });

    it('grants CanRead on forked artifacts to 3rd-party participants in MJ: Conversation Details and surfaces human-readable names when a grant Save() fails (D3)', async () => {
        const participantD = createUser('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Participant Dan', 'dan@example.com');
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([
            userA,
            userB,
            convOwnerC,
            participantD,
        ]);
        const createdHeaders: MockArtifactHeaderDraft[] = [];
        const savedVersions: MockArtifactVersionDraft[] = [];
        const savedPermissions: MockArtifactPermissionDraft[] = [];
        let capturedParticipantParams: RunViewParams | undefined;

        const provider = asMetadataProvider({
            Entities: [],
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: SOURCE_ARTIFACT_ID, UserID: userA.ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversation Details') {
                    const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                    if (filterStr.includes('ConversationID=')) {
                        capturedParticipantParams = params;
                        return {
                            Success: true,
                            Results: [
                                { UserID: userA.ID },
                                { UserID: userB.ID },
                                { UserID: participantD.ID },
                                { UserID: participantD.ID }, // duplicate message by Dan — deduplicated!
                            ],
                            RowCount: 4,
                            TotalRowCount: 4,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_DETAIL_ID, ConversationID: CONVERSATION_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_ID, UserID: convOwnerC.ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff',
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => {
                            if (!createdHeaders.includes(hdr)) {
                                createdHeaders.push(hdr);
                            }
                            return true;
                        },
                    };
                    return hdr;
                }
                if (entityName === 'MJ: Artifact Permissions') {
                    const perm: MockArtifactPermissionDraft = {
                        ID: `perm-d3-${savedPermissions.length + 1}`,
                        ArtifactID: '',
                        UserID: '',
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        SharedByUserID: null,
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            if (UUIDsEqual(perm.UserID, participantD.ID)) {
                                perm.LatestResult = {
                                    Message: 'FK violation',
                                    CompleteMessage: 'Simulated grant failure for participant Dan',
                                };
                                return false;
                            }
                            savedPermissions.push(perm);
                            return true;
                        },
                    };
                    return perm;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ffffffff-1111-4222-8333-555555555555',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedVersions.push(ver);
                        return true;
                    },
                };
                return ver;
            },
        });

        const runner = new VettingTestableAgentRunner(provider);
        await runner.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider
        );

        // Participant RunView uses paginated MaxRows: 500, OrderBy: '__mj_CreatedAt ASC, ID ASC', and SkipTotalRowCount: true
        expect(capturedParticipantParams?.MaxRows).toBe(500);
        expect(capturedParticipantParams?.OrderBy).toBe('__mj_CreatedAt ASC, ID ASC');
        expect(capturedParticipantParams?.Fields).toEqual(['UserID', 'User']);
        expect(capturedParticipantParams?.SkipTotalRowCount).toBe(true);

        // userA and convOwnerC succeeded; participantD failed and surfaced human-readable display name (NEVER raw GUIDs) in Comments!
        expect(savedPermissions.map((p) => p.UserID).sort()).toEqual([userA.ID, convOwnerC.ID].sort());
        expect(savedVersions[0]?.Comments).toContain('Warning:');
        expect(savedVersions[0]?.Comments).toContain('Participant Dan');
        expect(savedVersions[0]?.Comments).not.toContain(participantD.ID);
        expect(savedVersions[0]?.Comments).not.toContain(userB.ID);
        expect(createdHeaders[0]?.Comments).toContain('Participant Dan');
        expect(createdHeaders[0]?.Comments).not.toContain(participantD.ID);
        expect(createdHeaders[0]?.Comments).not.toContain(userB.ID);
    });

    it('logs errors when participant RunView or warning-comment artifact.Save() fails and falls back to row User or "participant" (D3)', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([]);

        const uncachedRowUser = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
        const mysteryOwnerId = 'abababab-abab-4bab-8bab-abababababab';
        let participantQueryShouldFail = true;
        let headerSaveCallCount = 0;
        const createdHeaders: MockArtifactHeaderDraft[] = [];

        const makeProvider = (): IMetadataProvider =>
            asMetadataProvider({
                Entities: [],
                RunView: async (params: RunViewParams) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [{ ID: SOURCE_ARTIFACT_ID, UserID: mysteryOwnerId, DelegateEntityID: null, DelegateRecordID: null }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    if (params.EntityName === 'MJ: Conversation Details') {
                        const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                        if (filterStr.includes('ConversationID=')) {
                            if (participantQueryShouldFail) {
                                return {
                                    Success: false,
                                    Results: [],
                                    RowCount: 0,
                                    TotalRowCount: 0,
                                    ExecutionTime: 1,
                                    ErrorMessage: 'Simulated participant query failure',
                                    UserViewRunID: '',
                                };
                            }
                            return {
                                Success: true,
                                Results: [{ UserID: uncachedRowUser, User: 'Row Eve' }],
                                RowCount: 1,
                                TotalRowCount: 1,
                                ExecutionTime: 1,
                                ErrorMessage: '',
                                UserViewRunID: '',
                            };
                        }
                        return {
                            Success: true,
                            Results: [{ ID: CONVERSATION_DETAIL_ID, ConversationID: CONVERSATION_ID }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    if (params.EntityName === 'MJ: Conversations') {
                        return {
                            Success: true,
                            Results: [{ ID: CONVERSATION_ID, UserID: userB.ID }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    return {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                },
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Artifacts') {
                        const hdr: MockArtifactHeaderDraft = {
                            ID: 'aaaaaaaa-bbbb-4ccc-8ddd-121212121212',
                            Name: '',
                            Description: null,
                            Comments: null,
                            TypeID: '',
                            UserID: '',
                            EnvironmentID: '',
                            Visibility: 'Always',
                            LatestResult: { Message: 'Simulated warning Save() failure' },
                            NewRecord: () => undefined,
                            Load: async () => true,
                            Save: async () => {
                                headerSaveCallCount++;
                                if (!createdHeaders.includes(hdr)) {
                                    createdHeaders.push(hdr);
                                }
                                // First Save() creates header; second Save() persists warning Comments -> simulate failure!
                                return headerSaveCallCount === 1;
                            },
                        };
                        return hdr;
                    }
                    if (entityName === 'MJ: Artifact Permissions') {
                        const perm: MockArtifactPermissionDraft = {
                            ID: 'perm-fail',
                            ArtifactID: '',
                            UserID: '',
                            CanRead: false,
                            CanEdit: false,
                            CanDelete: false,
                            CanShare: false,
                            SharedByUserID: null,
                            LatestResult: { Message: 'Grant failed' },
                            NewRecord: () => undefined,
                            Save: async () => false,
                        };
                        return perm;
                    }
                    const ver: MockArtifactVersionDraft = {
                        ID: 'ffffffff-1111-4222-8333-666666666666',
                        ArtifactID: '',
                        VersionNumber: 0,
                        Content: null,
                        Comments: null,
                        Name: null,
                        Description: null,
                        UserID: '',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => true,
                    };
                    return ver;
                },
            });

        // 1. Participant RunView failure + warning-comment Save() failure + 'participant' fallback
        const provider1 = makeProvider();
        const runner1 = new VettingTestableAgentRunner(provider1);
        await runner1.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider1
        );

        const loggedMessages = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
        expect(loggedMessages).toContain('Simulated participant query failure');
        expect(loggedMessages).toContain('Failed to save fork permission warning comment');
        expect(createdHeaders[0]?.Comments).toContain('participant(s): participant.');
        expect(createdHeaders[0]?.Comments).not.toContain(mysteryOwnerId);

        // 2. Row User display name fallback ('Row Eve') when UserCache is empty
        participantQueryShouldFail = false;
        headerSaveCallCount = 0;
        createdHeaders.length = 0;
        const provider2 = makeProvider();
        const runner2 = new VettingTestableAgentRunner(provider2);
        await runner2.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider2
        );
        expect(createdHeaders[0]?.Comments).toContain('Row Eve');
        expect(createdHeaders[0]?.Comments).not.toContain(uncachedRowUser);
    });

    it('gatherConversationArtifacts skips rows with empty or missing ArtifactID rather than bypassing CanRead (D3)', async () => {
        vi.spyOn(ConversationEngine, 'BranchPathFilterFresh').mockResolvedValue(`ConversationID='${CONVERSATION_ID}'`);
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Conversation Details') {
                return {
                    Success: true,
                    Results: [{ ID: CONVERSATION_DETAIL_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
                return {
                    Success: true,
                    Results: [
                        { ID: 'j-empty', ArtifactVersionID: 'ver-empty-art' },
                        { ID: 'j-read', ArtifactVersionID: 'ver-readable' },
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            };
        });

        vi.spyOn(RunQuery.prototype, 'RunQuery').mockResolvedValue({
            Success: true,
            QueryID: 'q-1',
            QueryName: 'GetArtifactVersionsByID',
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
            Results: [
                {
                    VersionID: 'ver-empty-art',
                    ArtifactID: '   ',
                    VersionNumber: 1,
                    VersionName: 'Orphan Secret.md',
                    ArtifactName: 'Orphan Secret.md',
                    ContentMode: 'Text',
                    FileID: null,
                    Content: '# Must never leak',
                    MimeType: 'text/markdown',
                    TypeName: 'Markdown Document',
                    ToolLibraryClass: 'DocumentToolLibrary',
                    DefaultDeliveryMode: 'ToolsOnly',
                    ForceToolsOnly: false,
                },
                {
                    VersionID: 'ver-readable',
                    ArtifactID: READABLE_ARTIFACT_ID,
                    VersionNumber: 1,
                    VersionName: 'Shared Strategy.md',
                    ArtifactName: 'Shared Strategy.md',
                    ContentMode: 'Text',
                    FileID: null,
                    Content: '# Readable content',
                    MimeType: 'text/markdown',
                    TypeName: 'Markdown Document',
                    ToolLibraryClass: 'DocumentToolLibrary',
                    DefaultDeliveryMode: 'ToolsOnly',
                    ForceToolsOnly: false,
                },
            ],
        } as RunQueryResult);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_provider, artifactId) => ({
                ArtifactID: artifactId,
                CanRead: UUIDsEqual(artifactId, READABLE_ARTIFACT_ID),
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'direct',
            })
        );

        const dummyPartial: Partial<IMetadataProvider> = { Entities: [] };
        const runner = new VettingTestableAgentRunner(dummyPartial as IMetadataProvider);
        const gathered = await runner.GatherArtifactsForTest(CONVERSATION_ID, userB);

        expect(gathered).toHaveLength(1);
        expect(gathered[0].name).toBe('Shared Strategy.md');
    });

    it('paginates MJ: Conversation Details beyond 200 and 500 messages so participants at index 250 and index 505 receive CanRead grants (AN-BC)', async () => {
        const participant250 = createUser(
            '25000000-2500-4250-8250-250000000250',
            'Participant 250',
            'participant250@example.com'
        );
        const participant505 = createUser(
            '50500000-5050-4505-8505-505000000505',
            'Participant 505',
            'participant505@example.com'
        );
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([
            userA,
            userB,
            participant250,
            participant505,
        ]);

        // Build 510 conversation detail messages:
        // - indices 0..249: userB (the actor, skipped)
        // - index 250: participant250 (> 200!)
        // - indices 251..504: userB (duplicates across page boundary)
        // - index 505: participant505 (on page 2 at StartRow: 500!)
        // - indices 506..509: participant250 again (verify normalized deduplication across pages!)
        const allParticipantMessages: Array<{ UserID: string; User: string }> = [];
        for (let i = 0; i < 510; i++) {
            if (i === 250 || i >= 506) {
                allParticipantMessages.push({
                    UserID: i === 250 ? participant250.ID : participant250.ID.toUpperCase(),
                    User: 'Participant 250',
                });
            } else if (i === 505) {
                allParticipantMessages.push({
                    UserID: participant505.ID,
                    User: 'Participant 505',
                });
            } else {
                allParticipantMessages.push({
                    UserID: userB.ID,
                    User: 'User B',
                });
            }
        }

        const observedPageCalls: Array<{ StartRow?: number; MaxRows?: number; OrderBy?: string; Fields?: string[] }> = [];
        const savedPermissions: MockArtifactPermissionDraft[] = [];

        const provider = asMetadataProvider({
            Entities: [],
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: SOURCE_ARTIFACT_ID,
                                UserID: userA.ID,
                                User: 'User A',
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversation Details') {
                    const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                    if (filterStr.includes('ConversationID=')) {
                        observedPageCalls.push({
                            StartRow: params.StartRow,
                            MaxRows: params.MaxRows,
                            OrderBy: typeof params.OrderBy === 'string' ? params.OrderBy : undefined,
                            Fields: Array.isArray(params.Fields) ? [...params.Fields] : undefined,
                        });
                        const offset = params.StartRow ?? 0;
                        const limit = params.MaxRows ?? 500;
                        const pageSlice = allParticipantMessages.slice(offset, offset + limit);
                        return {
                            Success: true,
                            Results: pageSlice,
                            RowCount: pageSlice.length,
                            TotalRowCount: allParticipantMessages.length,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_DETAIL_ID, ConversationID: CONVERSATION_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_ID, UserID: userB.ID, User: 'User B' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: 'aaaaaaaa-bbbb-4ccc-8ddd-250250250250',
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => true,
                    };
                    return hdr;
                }
                if (entityName === 'MJ: Artifact Permissions') {
                    const perm: MockArtifactPermissionDraft = {
                        ID: `perm-an-bc-${savedPermissions.length + 1}`,
                        ArtifactID: '',
                        UserID: '',
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        SharedByUserID: null,
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => {
                            savedPermissions.push(perm);
                            return true;
                        },
                    };
                    return perm;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ffffffff-1111-4222-8333-250250250250',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => true,
                };
                return ver;
            },
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(async (_p, artifactId) => ({
            ArtifactID: artifactId,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'direct',
        }));

        const runner = new VettingTestableAgentRunner(provider);
        await runner.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider
        );

        expect(observedPageCalls).toEqual([
            {
                StartRow: 0,
                MaxRows: 500,
                OrderBy: '__mj_CreatedAt ASC, ID ASC',
                Fields: ['UserID', 'User'],
            },
            {
                StartRow: 500,
                MaxRows: 500,
                OrderBy: '__mj_CreatedAt ASC, ID ASC',
                Fields: ['UserID', 'User'],
            },
        ]);

        // Exactly 3 deduplicated recipients receive CanRead grants: source owner userA, participant250 (index 250), participant505 (index 505)
        expect(savedPermissions).toHaveLength(3);
        expect(savedPermissions.every((p) => p.CanRead === true && p.CanEdit === false)).toBe(true);
        const grantedNormIds = savedPermissions.map((p) => p.UserID.toLowerCase()).sort();
        expect(grantedNormIds).toEqual(
            [userA.ID.toLowerCase(), participant250.ID.toLowerCase(), participant505.ID.toLowerCase()].sort()
        );
    });

    it('logs an error with conversation ID and artifact ID when participant paging hits the 100-page (50,000-row) safety cap (Round 8)', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const cappedArtifactId = 'aaaaaaaa-bbbb-4ccc-8ddd-500005000050';
        const fullPage = Array.from({ length: 500 }, () => ({ UserID: userB.ID, User: 'User B' }));
        let pageCalls = 0;

        const provider = asMetadataProvider({
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: SOURCE_ARTIFACT_ID,
                                UserID: userA.ID,
                                User: 'User A',
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversation Details') {
                    const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                    if (filterStr.includes('ConversationID=')) {
                        pageCalls++;
                        return {
                            Success: true,
                            Results: fullPage,
                            RowCount: fullPage.length,
                            TotalRowCount: 50000,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: '',
                        };
                    }
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_DETAIL_ID, ConversationID: CONVERSATION_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [{ ID: CONVERSATION_ID, UserID: userB.ID, User: 'User B' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    const hdr: MockArtifactHeaderDraft = {
                        ID: cappedArtifactId,
                        Name: '',
                        Description: null,
                        Comments: null,
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        Visibility: 'Always',
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Load: async () => true,
                        Save: async () => true,
                    };
                    return hdr;
                }
                if (entityName === 'MJ: Artifact Permissions') {
                    const perm: MockArtifactPermissionDraft = {
                        ID: 'perm-cap-1',
                        ArtifactID: '',
                        UserID: '',
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        SharedByUserID: null,
                        LatestResult: null,
                        NewRecord: () => undefined,
                        Save: async () => true,
                    };
                    return perm;
                }
                const ver: MockArtifactVersionDraft = {
                    ID: 'ffffffff-1111-4222-8333-500005000050',
                    ArtifactID: '',
                    VersionNumber: 0,
                    Content: null,
                    Comments: null,
                    Name: null,
                    Description: null,
                    UserID: '',
                    LatestResult: null,
                    NewRecord: () => undefined,
                    Save: async () => true,
                };
                return ver;
            },
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(async (_p, artifactId) => ({
            ArtifactID: artifactId,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'direct',
        }));

        const runner = new VettingTestableAgentRunner(provider);
        await runner.ProcessAgentArtifacts(
            makeExecuteResult(),
            CONVERSATION_DETAIL_ID,
            SOURCE_ARTIFACT_ID,
            userB,
            provider
        );

        expect(pageCalls).toBe(100);
        const loggedMessages = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
        expect(loggedMessages).toContain(CONVERSATION_ID);
        expect(loggedMessages).toContain(cappedArtifactId);
        expect(loggedMessages).toContain('50000');
    });
});
