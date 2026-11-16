import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunQuery, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    ConversationEngine,
    DocumentLiveBlockEngine,
    MJArtifactEntity,
    MJArtifactTypeEntity,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { AgentRunner } from '../AgentRunner';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { GovernedArtifactService } from '../GovernedArtifactService';
import { SetArtifactLiveContentReaderHook, SetArtifactLiveMutationHook } from '../artifact-presence-locator';
import { BuildNativeToolSet } from '../native-tools/control-tools';
import type { ActionToolSet } from '../native-tools/action-tool-builder';
import { AIRerankerRunner } from '@memberjunction/ai-reranker';
import { FileStorageBase, FileStorageEngine } from '@memberjunction/storage';
import '../artifact-tools/DocumentToolLibrary';
import '../artifact-tools/SearchResultSetToolLibrary';

class TestableAgentRunner extends AgentRunner {
    public CallGatherConversationArtifacts(
        conversationId: string,
        contextUser: UserInfo,
        historyFrom?: Date,
        branchId?: string | null,
        provider?: IMetadataProvider,
    ) {
        return this.gatherConversationArtifacts(conversationId, contextUser, historyFrom, branchId, provider);
    }
}

function makeTestUser(id = 'user-wave2b-1'): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = 'Wave2B Tester';
    user.Email = 'wave2b@example.com';
    user.IsActive = true;
    return user;
}

describe('Wave 2B Governed Artifact Runtime Verification', () => {
    beforeEach(() => {
        SetArtifactLiveMutationHook(null);
        SetArtifactLiveContentReaderHook(null);
    });

    afterEach(() => {
        SetArtifactLiveMutationHook(null);
        SetArtifactLiveContentReaderHook(null);
        vi.restoreAllMocks();
    });

    it('P0-17: rejects explicit non-matching artifactId ("B") when artifacts.size === 1 without mutating "A"', async () => {
        const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: 'aaaa1111-1111-4111-8111-111111111111',
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
            Reason: 'Owner',
        });
        const manager = new ArtifactToolManager();
        manager.Initialize(
            [
                {
                    artifactId: 'aaaa1111-1111-4111-8111-111111111111',
                    name: 'Only Doc.md',
                    typeName: 'Markdown Document',
                    toolLibraryClass: 'DocumentToolLibrary',
                    content: '# Title\n\nOriginal paragraph.\n',
                },
            ],
            { contextUser: makeTestUser('u-p017'), provider: {} as IMetadataProvider },
        );

        const result = await manager.ExecuteSingleToolCall({
            artifactId: 'B',
            tool: 'replace_block',
            input: { blockId: 'blk-0', content: '# Hijacked' },
        });

        expect(result.result.success).toBe(false);
        expect(result.result.errorMessage).toContain('Unknown artifact ID: B');
        const checkA = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
        const checkBlocks = (checkA.result.data as { blocks: Array<{ rawMarkdown: string }> }).blocks;
        expect(checkBlocks.map((b) => b.rawMarkdown).join('\n\n')).toContain('Original paragraph.');
    });

    it('P0-17: shares a GetGlobalObjectStore()-backed WithArtifactLock between ArtifactToolManager and GovernedArtifactService', async () => {
        const artifactUuid = 'bbbb2222-2222-4222-8222-222222222222';
        const timeline: string[] = [];
        let releaseRead!: () => void;
        const readGate = new Promise<void>((resolve) => {
            releaseRead = resolve;
        });
        let markStarted!: () => void;
        const startedGate = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const fakeLib = {
            GetToolList: () => [
                {
                    name: 'slow_inspect',
                    description: 'inspect',
                    inputSchema: { type: 'object', properties: {} },
                },
            ],
            InvokeTool: async () => {
                timeline.push('atm-start');
                markStarted();
                await readGate;
                timeline.push('atm-end');
                return { success: true, data: { ok: true } };
            },
        };
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(
            fakeLib as object as ReturnType<typeof GovernedArtifactService.Instance.ResolveLibrary>,
        );

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactUuid,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
            Reason: 'Owner',
        });
        const manager = new ArtifactToolManager();
        manager.Initialize(
            [
                {
                    artifactId: artifactUuid,
                    name: 'Locked Sheet',
                    typeName: 'Excel Spreadsheet',
                    content: '{}',
                },
            ],
            { contextUser: makeTestUser('u-lock'), provider: {} as IMetadataProvider },
        );

        const atmPromise = manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'slow_inspect',
            input: {},
        });
        await startedGate;

        const svcPromise = GovernedArtifactService.Instance.WithArtifactLock(artifactUuid.toUpperCase(), async () => {
            timeline.push('svc-ran');
            return 'done';
        });

        await Promise.resolve();
        expect(timeline).toEqual(['atm-start']);

        releaseRead();
        await Promise.all([atmPromise, svcPromise]);
        expect(timeline).toEqual(['atm-start', 'atm-end', 'svc-ran']);
    });

    it('P0-17: GovernedArtifactService.MutateGovernedArtifact preserves intentional empty ("") document saves', async () => {
        const artifactUuid = 'cccc3333-3333-4333-8333-333333333333';
        const user = makeTestUser('user-empty-save');

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanShare: false,
            Reason: 'Owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-md',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as object as MJArtifactTypeEntity);

        let savedContent: string | null = 'UNSET';
        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactUuid, UserID: user.ID, Name: 'Empty.md', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Empty.md', ContentMode: 'Text', Content: 'Single line\n' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () =>
                ({
                    ID: 'ver-2',
                    ArtifactID: artifactUuid,
                    VersionNumber: 2,
                    UserID: user.ID,
                    Name: 'Empty.md',
                    ContentMode: 'Text',
                    Content: null as string | null,
                    Configuration: null as string | null,
                    FileID: null as string | null,
                    Comments: null as string | null,
                    ContentHash: null as string | null,
                    NewRecord: () => {},
                    Save: async function (this: { Content: string | null }) {
                        savedContent = this.Content;
                        return true;
                    },
                }) as object as MJArtifactEntity,
        };

        const docLib = new (await import('../artifact-tools/DocumentToolLibrary')).DocumentToolLibrary();
        const blocksRes = await docLib.InvokeTool('get_blocks', {}, 'Single line\n');
        const blocks = (blocksRes.data as { blocks: Array<{ blockId: string }> }).blocks;

        const mutateRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: user,
            artifactId: artifactUuid,
            tool: 'delete_block',
            input: { blockId: blocks[0].blockId },
        });

        expect(mutateRes.success).toBe(true);
        expect(savedContent).toBe('');
    });

    it('P0-17: post-commit rePersistOutcome failure deletes v2, calls live rollback(v2), and deletes orphaned storage files', async () => {
        const artifactUuid = 'dddd4444-4444-4444-8444-444444444444';
        const user = makeTestUser('user-repersist');
        const rollbackSpy = vi.fn(async () => {});
        const deleteEntitySpy = vi.fn(async () => true);
        const deleteStorageSpy = vi.fn(async () => true);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanShare: false,
            Reason: 'Owner',
        });
        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(FileStorageEngine.Instance, 'GetDriver').mockResolvedValue({
            DeleteObject: deleteStorageSpy,
            PutObject: async () => true,
            GetObject: async () => Buffer.from(''),
        } as object as FileStorageBase);

        let saveCount = 0;
        const mockProvider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactUuid, Name: 'Report.md', UserID: user.ID, EnvironmentID: 'env-1' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, ContentMode: 'Text', FileID: null }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifact Versions') {
                    saveCount++;
                    const attempt = saveCount;
                    if (attempt === 1) {
                        return {
                            ID: 'ver-2',
                            ArtifactID: artifactUuid,
                            VersionNumber: 2,
                            UserID: user.ID,
                            Name: 'Report.md',
                            ContentMode: 'File' as const,
                            FileID: 'file-orphan-1',
                            Content: null as string | null,
                            Configuration: null as string | null,
                            Comments: null as string | null,
                            ContentHash: null as string | null,
                            NewRecord: () => {},
                            Load: async () => false,
                            Delete: deleteEntitySpy,
                            Save: async () => true,
                        };
                    }
                    return {
                        ID: 'ver-3',
                        ArtifactID: artifactUuid,
                        VersionNumber: 3,
                        UserID: user.ID,
                        Name: 'Report.md',
                        ContentMode: 'File' as const,
                        FileID: 'file-orphan-2',
                        Content: null as string | null,
                        Configuration: null as string | null,
                        Comments: null as string | null,
                        ContentHash: null as string | null,
                        NewRecord: () => {},
                        Load: async () => false,
                        Delete: async () => true,
                        Save: async () => false,
                    };
                }
                if (entityName === 'MJ: Files') {
                    return {
                        ID: 'file-orphan',
                        StorageAccountID: 'acct-1',
                        ProviderKey: 'artifacts/orphan.bin',
                        Name: 'orphan.bin',
                        CategoryID: null as string | null,
                        ContentType: 'text/plain',
                        Status: 'Uploaded',
                        NewRecord: () => {},
                        Load: async () => true,
                        Delete: async () => true,
                        Save: async () => true,
                    };
                }
                return null;
            },
        };

        const manager = new ArtifactToolManager();
        // Stub private upload/delete/rePersist internals cleanly via persist spy? Use real persist outcome with Text mode + orphan delete spy:
        let uploadIdx = 0;
        const persistSpy = vi
            .spyOn(
                manager as object as {
                    persistArtifactVersionMutation: () => Promise<{
                        persisted: boolean;
                        errorMessage?: string;
                        uploadedFileId?: string;
                        versionEntity?: { ID: string; Load: () => Promise<boolean>; Delete: () => Promise<boolean> };
                        rollbackSnapshot?: { versionId: string; versionNumber: number };
                    }>;
                },
                'persistArtifactVersionMutation',
            )
            .mockImplementation(async () => {
                uploadIdx++;
                if (uploadIdx === 1) {
                    return {
                        persisted: true,
                        uploadedFileId: 'orphan-file-v2',
                        versionEntity: { ID: 'ver-2', Load: async () => false, Delete: deleteEntitySpy },
                        rollbackSnapshot: { versionId: 'ver-2', versionNumber: 2 },
                    };
                }
                return {
                    persisted: false,
                    uploadedFileId: 'orphan-file-v3',
                    errorMessage: 'Simulated v3 re-persist failure',
                };
            });
        const deleteOrphanSpy = vi
            .spyOn(manager as object as { deleteUnreferencedArtifactFile: (id: string) => Promise<void> }, 'deleteUnreferencedArtifactFile')
            .mockResolvedValue();

        const initialMd = '# Heading\n\nInitial text.\n';
        SetArtifactLiveMutationHook(async () => ({
            mergedContent: '# Heading\n\nAgent update.\n',
            commit: async () => ({
                applied: true,
                mergedContent: '# Heading\n\nConcurrent human + agent merge.\n',
                rollback: rollbackSpy,
            }),
        }));

        manager.Initialize(
            [
                {
                    artifactId: artifactUuid,
                    name: 'Report.md',
                    typeName: 'Markdown Document',
                    toolLibraryClass: 'DocumentToolLibrary',
                    versionId: 'ver-1',
                    versionNumber: 1,
                    content: initialMd,
                },
            ],
            { contextUser: user, provider: mockProvider as IMetadataProvider },
        );

        const blocksCall = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
        const blocks = (blocksCall.result.data as { blocks: Array<{ blockId: string }> }).blocks;

        const editCall = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'replace_block',
            input: { blockId: blocks[0].blockId, content: 'Agent update.' },
        });

        expect(persistSpy).toHaveBeenCalledTimes(2);
        expect(editCall.result.success).toBe(false);
        expect(editCall.result.errorMessage).toContain('Simulated v3 re-persist failure');
        expect(deleteEntitySpy).toHaveBeenCalledTimes(1);
        expect(deleteOrphanSpy).toHaveBeenCalledWith('orphan-file-v3');
        expect(deleteOrphanSpy).toHaveBeenCalledWith('orphan-file-v2');
        expect(rollbackSpy).toHaveBeenCalledWith('ver-2');
        const afterRollback = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_blocks', input: {} });
        const rolledBackBlocks = (afterRollback.result.data as { blocks: Array<{ rawMarkdown: string }> }).blocks;
        expect(rolledBackBlocks.map((b) => b.rawMarkdown).join('\n\n')).toContain('Initial text.');
        expect(rolledBackBlocks.map((b) => b.rawMarkdown).join('\n\n')).not.toContain('Agent update.');
    });

    it('P0-17: gatherConversationArtifacts deduplicates by NormalizeUUID(ArtifactID), hydrates live Yjs content, and keeps "" documents', async () => {
        const user = makeTestUser('user-gather');
        const sharedArtUpper = 'EEEE5555-5555-4555-8555-555555555555';
        const sharedArtLower = sharedArtUpper.toLowerCase();
        const emptyArtId = 'ffff6666-6666-4666-8666-666666666666';

        vi.spyOn(ConversationEngine, 'BranchPathFilterFresh').mockResolvedValue("ConversationID='conv-1'");
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanShare: false,
            Reason: 'Owner',
        });

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Conversation Details') {
                    return { Success: true, Results: [{ ID: 'det-1' }, { ID: 'det-2' }] };
                }
                if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            { ID: 'j-1', ArtifactVersionID: 'v-1' },
                            { ID: 'j-2', ArtifactVersionID: 'v-2' },
                            { ID: 'j-3', ArtifactVersionID: 'v-empty' },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            },
        } as object as RunView);

        vi.spyOn(RunQuery.prototype, 'RunQuery').mockResolvedValue({
            Success: true,
            ErrorMessage: '',
            Results: [
                {
                    ArtifactID: sharedArtLower,
                    VersionID: 'v-1',
                    VersionNumber: 1,
                    ArtifactName: 'Spec.md',
                    VersionName: 'Spec.md',
                    TypeName: 'Markdown Document',
                    ContentMode: 'Text',
                    Content: '# Old DB v1',
                },
                {
                    ArtifactID: sharedArtUpper,
                    VersionID: 'v-2',
                    VersionNumber: 2,
                    ArtifactName: 'Spec.md',
                    VersionName: 'Spec.md',
                    TypeName: 'Markdown Document',
                    ContentMode: 'Text',
                    Content: '# Stale DB v2',
                },
                {
                    ArtifactID: emptyArtId,
                    VersionID: 'v-empty',
                    VersionNumber: 1,
                    ArtifactName: 'Blank.md',
                    VersionName: 'Blank.md',
                    TypeName: 'Markdown Document',
                    ContentMode: 'Text',
                    Content: '',
                },
            ],
        });

        SetArtifactLiveContentReaderHook(async (artifactId) => {
            if (artifactId.toLowerCase() === sharedArtLower) {
                return {
                    Content: '# Live Yjs Uncompacted Edit',
                    VersionID: 'v-2-live',
                    VersionNumber: 2,
                };
            }
            return null;
        });

        const runner = new TestableAgentRunner();
        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async () => ({ Success: true, Results: [] }),
            GetEntityObject: async () => null as object as MJArtifactEntity,
        };

        const gathered = await runner.CallGatherConversationArtifacts('conv-1', user, undefined, null, provider as IMetadataProvider);

        expect(gathered).toHaveLength(2);
        const spec = gathered.find((a) => a.artifactId?.toLowerCase() === sharedArtLower);
        const blank = gathered.find((a) => a.artifactId?.toLowerCase() === emptyArtId);
        expect(spec?.content).toBe('# Live Yjs Uncompacted Edit');
        expect(spec?.versionId).toBe('v-2-live');
        expect(blank?.content).toBe('');
    });

    it('P1-7: routes create_synthesized_artifact, refresh_and_snapshot_artifact, follow_source_link, and rerank_results in ArtifactToolManager', async () => {
        const user = makeTestUser('user-tools');
        const sourceId = '1111aaaa-1111-4111-8111-111111111111';
        const synthId = '2222bbbb-2222-4222-8222-222222222222';
        const synthVerId = '3333cccc-3333-4333-8333-333333333333';

        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
        } as object as MJArtifactTypeEntity);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanShare: false,
            Reason: 'Owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'CreateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: synthId,
            versionId: synthVerId,
            versionNumber: 1,
            artifactName: 'Exec Brief',
            artifactTypeName: 'Markdown Document',
            driverClass: 'MarkdownArtifactViewerPlugin',
            message: 'Created',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'RefreshAndSnapshotArtifact').mockResolvedValue({
            success: true,
            changed: true,
            resultCode: 'SUCCESS',
            artifactId: sourceId,
            versionId: '4444dddd-4444-4444-8444-444444444444',
            versionNumber: 2,
            artifactName: 'Source Notes',
            artifactTypeName: 'Markdown Document',
            driverClass: 'MarkdownArtifactViewerPlugin',
            signedFrozenBlocksCount: 1,
            diffSummary: 'Updated 1 live block',
            message: 'Refreshed',
        });
        vi.spyOn(AIRerankerRunner.prototype, 'RunRerank').mockResolvedValue({
            Success: true,
            ModelName: 'cohere-rerank-v3',
            PromptRunID: 'pr-1',
            Response: {
                results: [
                    { id: 'R2', relevanceScore: 0.99 },
                    { id: 'R1', relevanceScore: 0.42 },
                ],
            },
        } as object as Awaited<ReturnType<AIRerankerRunner['RunRerank']>>);

        const rlsRecordId = '5555eeee-5555-4555-8555-555555555555';
        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'Accounts') {
                    return { Success: true, Results: [{ ID: rlsRecordId, Name: 'Acme Corp' }] };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-src-2', VersionNumber: 2, ContentMode: 'Text', Content: '# Source Notes\n\nRefreshed content' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => null as object as MJArtifactEntity,
        };

        const searchSpec = {
            Query: 'enterprise revenue',
            Reranker: null,
            Results: [
                { AlphaID: 'R1', Title: 'First', Snippet: 'low signal', Score: 0.8, EntityName: 'Accounts', RecordID: rlsRecordId },
                { AlphaID: 'R2', Title: 'Second', Snippet: 'high signal revenue', Score: 0.6, EntityName: 'Accounts', RecordID: rlsRecordId },
            ],
        };

        const manager = new ArtifactToolManager();
        manager.Initialize(
            [
                {
                    artifactId: sourceId,
                    name: 'Source Notes',
                    typeName: 'Markdown Document',
                    toolLibraryClass: 'DocumentToolLibrary',
                    versionId: 'ver-src-1',
                    versionNumber: 1,
                    content: '# Source Notes\n\nInitial content',
                },
                {
                    name: 'Search Results',
                    typeName: 'Search Result Set',
                    toolLibraryClass: 'SearchResultSetToolLibrary',
                    content: JSON.stringify(searchSpec),
                },
            ],
            { contextUser: user, provider: provider as IMetadataProvider, agentRunId: 'run-tools-1' },
        );

        const synthCall = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'create_synthesized_artifact',
            input: { title: 'Exec Brief', targetKind: 'document', sourceArtifactIds: ['A'] },
        });
        expect(synthCall.result.success).toBe(true);
        const synthData = synthCall.result.data as { artifactId: string; persisted: boolean };
        expect(synthData.artifactId).toBe(synthId);
        expect(synthData.persisted).toBe(true);

        // B7: By default (without explicit out-of-band allowFreezeFromUserConfirmation), agents cannot invoke freeze_all_blocks
        const deniedFreezeCall = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'refresh_and_snapshot_artifact',
            input: { targetArtifactId: 'A', mode: 'freeze_all_blocks', forceRefreshFrozen: true },
        });
        expect(deniedFreezeCall.result.success).toBe(false);
        expect(deniedFreezeCall.result.errorMessage).toContain('out-of-band user confirmation');

        // With allowFreezeFromUserConfirmation: true, freeze_all_blocks succeeds cleanly
        const freezeAllowedManager = new ArtifactToolManager();
        freezeAllowedManager.Initialize(
            [
                {
                    artifactId: sourceId,
                    name: 'Source Notes',
                    typeName: 'Markdown Document',
                    toolLibraryClass: 'DocumentToolLibrary',
                    versionId: 'ver-src-1',
                    versionNumber: 1,
                    content: '# Source Notes\n\nInitial content',
                },
            ],
            {
                contextUser: user,
                provider: provider as IMetadataProvider,
                agentRunId: 'run-tools-1',
                allowFreezeFromUserConfirmation: true,
            },
        );
        const refreshCall = await freezeAllowedManager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'refresh_and_snapshot_artifact',
            input: { targetArtifactId: 'A', mode: 'freeze_all_blocks', forceRefreshFrozen: true },
        });
        expect(refreshCall.result.success).toBe(true);
        const refreshData = refreshCall.result.data as { changed: boolean; signedFrozenBlocksCount: number; versionNumber: number };
        expect(refreshData.changed).toBe(true);
        expect(refreshData.signedFrozenBlocksCount).toBe(1);
        expect(refreshData.versionNumber).toBe(2);

        const followCall = await manager.ExecuteSingleToolCall({
            artifactId: 'B',
            tool: 'follow_source_link',
            input: { rowId: 'R1' },
        });
        expect(followCall.result.success).toBe(true);
        const followData = followCall.result.data as { rlsVerified: boolean; registeredAlphaId: string };
        expect(followData.rlsVerified).toBe(true);
        expect(followData.registeredAlphaId).toBe('D');

        const rerankCall = await manager.ExecuteSingleToolCall({
            artifactId: 'B',
            tool: 'rerank_results',
            input: { rerankerName: 'cohere-rerank-v3' },
        });
        expect(rerankCall.result.success).toBe(true);
        const rerankData = rerankCall.result.data as { reranked: boolean; newOrder: string[] };
        expect(rerankData.reranked).toBe(true);
        expect(rerankData.newOrder).toEqual(['R2', 'R1']);
    });

    it('P1-7: BuildNativeToolSet only exposes artifactDirective when IncludeArtifactDirective is true', () => {
        const emptyActions: ActionToolSet = { tools: [], byToolName: new Map() };
        const defaultSet = BuildNativeToolSet(emptyActions, []);
        const defaultComplete = defaultSet.byToolName.get('complete_task');
        expect(defaultComplete?.tool.inputSchema.properties).not.toHaveProperty('artifactDirective');

        const artifactSet = BuildNativeToolSet(emptyActions, [], undefined, [], [], undefined, {
            IncludeArtifactDirective: true,
        });
        const artifactComplete = artifactSet.byToolName.get('complete_task');
        expect(artifactComplete?.tool.inputSchema.properties).toHaveProperty('artifactDirective');
    });

    it('B7: RefreshArtifactPayloadInMemory never puts live query rows in highlightLines', async () => {
        const execSpy = vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValue({
            BlockID: 'blk-secret',
            Kind: 'SavedQuery',
            Mode: 'Live',
            Success: true,
            Columns: [{ Name: 'SSN', DisplayName: 'SSN', Type: 'string' }],
            Rows: [{ SSN: '999-88-7777-CONFIDENTIAL' }],
            TotalRowCount: 1,
        });
        try {
            const doc = [
                '# Executive Summary',
                '',
                ':::mj-block',
                '{"BlockID":"blk-secret","Kind":"SavedQuery","QueryID":"q-1","Mode":"Live"}',
                ':::',
            ].join('\n');
            const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Alice' });
            const provider = {} as IMetadataProvider;
            const res = await GovernedArtifactService.Instance.RefreshArtifactPayloadInMemory({
                content: doc,
                artifactTypeName: 'Markdown Document',
                title: 'Executive Brief',
                contextUser: user,
                provider,
            });
            const combined = res.highlightLines.join('\n') + '\n' + res.diffSummary;
            expect(combined).not.toContain('999-88-7777-CONFIDENTIAL');
            expect(combined).toContain('Block[blk-secret]: mode=Live');
        } finally {
            execSpy.mockRestore();
        }
    });

    it('Lower #4 / #5: ArtifactToolManager fails closed when persisted artifactId lacks contextUser/provider, and rejects InitialOperations > 100', async () => {
        const manager = new ArtifactToolManager();
        manager.Initialize([
            {
                artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                name: 'Persisted Doc',
                typeName: 'Markdown Document',
                toolLibraryClass: 'DocumentToolLibrary',
                content: '# Title\nBody',
            },
        ]);
        const readWithoutCtx = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'read_section',
            input: {},
        });
        expect(readWithoutCtx.result.success).toBe(false);
        expect(readWithoutCtx.result.errorMessage).toContain('contextUser and provider');

        const overLimitOps = Array.from({ length: 101 }, () => ({ tool: 'append_markdown', input: { markdown: 'x' } }));
        const createTooMany = await manager.ExecuteSingleToolCall({
            artifactId: '__workspace__',
            tool: 'create_artifact',
            input: {
                title: 'Too many ops',
                artifactType: 'Markdown Document',
                InitialOperations: overLimitOps,
            },
        });
        expect(createTooMany.result.success).toBe(false);
        expect(createTooMany.result.errorMessage).toContain('maximum allowed 100');
    });
});
