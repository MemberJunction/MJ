import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    IMetadataProvider,
    RunQuery,
    RunQueryResult,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import {
    ExecuteAgentResult,
    InputArtifact,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
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
    LatestResult: { Message: string } | null;
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
        Entities: (mock.Entities ?? []) as IMetadataProvider['Entities'],
        GetEntityObject: mock.GetEntityObject as IMetadataProvider['GetEntityObject'],
    };
    Object.assign(partial, { RunView: mock.RunView });
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

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([fakeAgent as MJAIAgentEntityExtended]);
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
});
