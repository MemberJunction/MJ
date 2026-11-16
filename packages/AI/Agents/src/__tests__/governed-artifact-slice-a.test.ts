import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    SpreadsheetEngine,
    XlsxOpenXmlAdapter,
    type MJArtifactTypeEntity,
    type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolArgs,
    type ArtifactToolDefinition,
    type ArtifactToolExecutionContext,
    type ArtifactToolResult,
    type ExecuteAgentResult,
    type GovernedRunArtifactSummary,
} from '@memberjunction/ai-core-plus';
import type { ActionParam } from '@memberjunction/actions-base';
import { GovernedArtifactService, MergeTouchedArtifactSummary } from '../GovernedArtifactService';
import { ArtifactToolManager } from '../ArtifactToolManager';
import {
    GetArtifactAgentPresenceHook,
    GetArtifactLiveMutationHook,
    SetArtifactAgentPresenceHook,
    SetArtifactLiveMutationHook,
} from '../artifact-presence-locator';
import {
    CollectDelegatedRunArtifacts,
    ExtractDirectActionArtifacts,
} from '../realtime/realtime-artifact-helpers';

class SpyToolLibrary extends BaseArtifactToolLibrary {
    public LastInput: ArtifactToolArgs | undefined;
    public LastContext: ArtifactToolExecutionContext | undefined;

    constructor(private readonly returnsUpdatedContent = false) {
        super();
    }

    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            { name: 'clear_range', description: 'clear range', inputSchema: { type: 'object', properties: {} } },
            { name: 'custom_probe', description: 'custom probe', inputSchema: { type: 'object', properties: {} } },
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        input: ArtifactToolArgs,
        _content: string | Buffer,
        context?: ArtifactToolExecutionContext,
    ): Promise<ArtifactToolResult> {
        this.LastInput = input;
        this.LastContext = context;
        if (this.returnsUpdatedContent) {
            return {
                success: true,
                data: { updatedContent: '# Hijacked\n\nOverwritten content.\n', note: toolName },
            };
        }
        return {
            success: true,
            data: { toolName, ok: true },
        };
    }
}

function makeUser(id: string, name = 'Tester'): UserInfo {
    return {
        ID: id,
        Name: name,
        Email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        IsActive: true,
    } as UserInfo;
}

const ART_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const COLL_ID = '44444444-4444-4444-8444-444444444444';

describe('SLICE A governed artifact security, concurrency, discovery & realtime propagation', () => {
    const prevLiveHook = GetArtifactLiveMutationHook();
    const prevPresenceHook = GetArtifactAgentPresenceHook();

    afterEach(() => {
        vi.restoreAllMocks();
        SetArtifactLiveMutationHook(prevLiveHook ?? null);
        SetArtifactAgentPresenceHook(prevPresenceHook ?? null);
    });

    it('[A-P0-1] rejects clear_range and mutation-emitting read-only tools across Inspect, Mutate, and ArtifactToolManager', async () => {
        const actor = makeUser(ACTOR_ID, 'Viewer');
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Reason: 'Read-only access',
        });

        const spyLib = new SpyToolLibrary(true);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(spyLib);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as MJArtifactTypeEntity);

        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Readonly Doc', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Readonly Doc', ContentMode: 'Text', Content: '# Hello' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => {
                throw new Error('Should not create entities on read-only rejection');
            },
        };

        // 1. InspectGovernedArtifact refuses clear_range upfront
        const inspectClear = await GovernedArtifactService.Instance.InspectGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'clear_range',
            input: { range: 'A1:B2' },
        });
        expect(inspectClear.success).toBe(false);
        expect(inspectClear.errorMessage).toContain('refuses mutating tool');

        // 2. InspectGovernedArtifact blocks even an unlisted tool that returns updatedContent
        const inspectSpoof = await GovernedArtifactService.Instance.InspectGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(inspectSpoof.success).toBe(false);
        expect(inspectSpoof.errorMessage).toContain('mutated artifact content');

        // 3. MutateGovernedArtifact rejects unconditionally when CanEdit is false (even unlisted tools)
        const mutateRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(mutateRes.success).toBe(false);
        expect(mutateRes.errorMessage).toContain('Edit access');

        // 4. ArtifactToolManager rejects clear_range and unlisted updatedContent-returning tools on read-only entry
        const mgr = new ArtifactToolManager();
        mgr.Initialize(
            [
                {
                    artifactId: ART_ID,
                    name: 'Sheet',
                    typeName: 'Excel Spreadsheet',
                    content: JSON.stringify(SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet')),
                },
            ],
            { contextUser: actor, provider: provider as IMetadataProvider },
        );

        const clearCall = await mgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'clear_range',
            input: { range: 'A1' },
        });
        expect(clearCall.result.success).toBe(false);
        expect(clearCall.result.errorMessage).toContain('edit access');

        // Also test unlisted tool returning updatedContent on read-only entry inside ArtifactToolManager
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockRestore();
        const mgrEntries = (mgr as { artifacts?: Map<string, { library: BaseArtifactToolLibrary }> }).artifacts;
        const entryA = mgrEntries?.get('A');
        expect(entryA).toBeDefined();
        if (entryA) {
            entryA.library = new SpyToolLibrary(true);
        }
        const spoofCall = await mgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'custom_probe',
            input: {},
        });
        expect(spoofCall.result.success).toBe(false);
        expect(spoofCall.result.errorMessage).toContain('edit access');
    });

    it('[A-P0-2] propagates trusted actor/owner/editor context and strips spoofed _actorUserId/_ownerUserId/_isEditor from input', async () => {
        const actor = makeUser(ACTOR_ID, 'Editor');
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Reason: 'Editor access',
        });

        const spyLib = new SpyToolLibrary(false);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(spyLib);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as MJArtifactTypeEntity);

        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Owned Doc', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Owned Doc', ContentMode: 'Text', Content: '# Doc' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => {
                throw new Error('Not needed');
            },
        };

        await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {
                _actorUserId: OWNER_ID,
                _ownerUserId: ACTOR_ID,
                _isEditor: false,
                safeParam: 'kept',
            },
        });

        expect(spyLib.LastInput).toEqual({ safeParam: 'kept' });
        expect(spyLib.LastContext?.actorUserId).toBe(ACTOR_ID);
        expect(spyLib.LastContext?.ownerUserId).toBe(OWNER_ID);
        expect(spyLib.LastContext?.isEditor).toBe(true);

        const mgr = new ArtifactToolManager();
        mgr.Initialize(
            [{ artifactId: ART_ID, name: 'Owned Doc', typeName: 'Markdown Document', content: '# Doc' }],
            { contextUser: actor, provider: provider as IMetadataProvider },
        );
        const mgrEntries = (mgr as { artifacts?: Map<string, { library: BaseArtifactToolLibrary }> }).artifacts;
        const mgrSpy = new SpyToolLibrary(false);
        const entryA = mgrEntries?.get('A');
        if (entryA) {
            entryA.library = mgrSpy;
        }

        await mgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'custom_probe',
            input: {
                _actorUserId: OWNER_ID,
                _ownerUserId: ACTOR_ID,
                _isEditor: false,
                range: 'A1',
            },
        });
        expect(mgrSpy.LastInput).toEqual({ range: 'A1' });
        expect(mgrSpy.LastContext?.actorUserId).toBe(ACTOR_ID);
        expect(mgrSpy.LastContext?.ownerUserId).toBe(OWNER_ID);
        expect(mgrSpy.LastContext?.isEditor).toBe(true);
    });

    it('[A-P0-3] rolls back versionEntity and live hook on commit applied=false or throw, and runs liveHook on File-mode .xlsx', async () => {
        const actor = makeUser(OWNER_ID, 'Owner');
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Reason: 'Owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as MJArtifactTypeEntity);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(new SpyToolLibrary(true));

        let deletedVersion = false;
        const rolledBackVersionIds: Array<string | undefined> = [];
        const savedDraft = {
            ID: 'ver-draft-2',
            ArtifactID: ART_ID,
            VersionNumber: 2,
            Name: '',
            UserID: '',
            Comments: '',
            ContentHash: '',
            ContentMode: 'Text',
            FileID: null as string | null,
            MimeType: null as string | null,
            FileName: null as string | null,
            ContentSizeBytes: 0,
            Content: '' as string | null,
            Configuration: '' as string | null,
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => undefined,
            Save: async () => true,
            Delete: async () => {
                deletedVersion = true;
                return true;
            },
        };

        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Doc', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Doc', ContentMode: 'Text', Content: '# Initial' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => savedDraft as object as MJArtifactVersionEntity,
        };

        SetArtifactLiveMutationHook(async () => ({
            applied: true,
            commit: async () => ({ applied: false }),
            rollback: async (rolledBackVersionId?: string) => {
                rolledBackVersionIds.push(rolledBackVersionId);
            },
        }));

        const failCommitOutcome = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(failCommitOutcome.success).toBe(false);
        expect(deletedVersion).toBe(true);
        expect(rolledBackVersionIds).toEqual(['ver-draft-2']);

        // File-mode .xlsx runs liveHook(deferCommit: true), merges mergedContent, and re-uploads .xlsx
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet');
        const xlsxBytes = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(wb));
        const mergedWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet');
        SpreadsheetEngine.Instance.SetCell(mergedWb, mergedWb.Worksheets[0].SheetID, 'A1', { Value: 'MergedValue' }, true);
        const mergedJson = SpreadsheetEngine.Instance.SerializeWorkbook(mergedWb);

        vi.spyOn(GovernedArtifactService.Instance, 'DownloadArtifactFileContent').mockResolvedValue(xlsxBytes);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-xls',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);
        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
        Object.defineProperty(FileStorageEngine.Instance, 'HasStorageAccounts', { configurable: true, get: () => true });
        const uploadSpy = vi.spyOn(FileStorageEngine.Instance, 'UploadFile').mockResolvedValue({
            FileID: 'file-new-2',
            FileName: 'Book.xlsx',
        } as Awaited<ReturnType<FileStorageEngine['UploadFile']>>);

        const sheetProvider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Book.xlsx', Type: 'Excel Spreadsheet' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Book.xlsx', ContentMode: 'File', FileID: 'file-1' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => savedDraft as object as MJArtifactVersionEntity,
        };

        let hookSawDeferCommit = false;
        let committedVersion = false;
        SetArtifactLiveMutationHook(async (evt) => {
            hookSawDeferCommit = Boolean(evt.deferCommit);
            return {
                applied: true,
                mergedContent: mergedJson,
                commit: async () => {
                    committedVersion = true;
                    return { applied: true };
                },
            };
        });

        const editedWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet');
        SpreadsheetEngine.Instance.SetCell(editedWb, editedWb.Worksheets[0].SheetID, 'B2', { Value: 'AgentWrite' }, true);
        const editedJson = SpreadsheetEngine.Instance.SerializeWorkbook(editedWb);

        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(
            new (class extends BaseArtifactToolLibrary {
                protected override async invokeSubclassTool(): Promise<ArtifactToolResult> {
                    return {
                        success: true,
                        data: { updatedContent: editedJson },
                    };
                }
            })(),
        );

        const xlsxOutcome = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: sheetProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'write_cells',
            input: {},
        });
        expect(xlsxOutcome.success).toBe(true);
        expect(hookSawDeferCommit).toBe(true);
        expect(committedVersion).toBe(true);
        expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    it('[A-P0-4] CheckCollectionPermission uses case-insensitive UUIDsEqual for collection owner matching', async () => {
        const user = makeUser(OWNER_ID.toUpperCase(), 'Owner');
        const provider: Pick<IMetadataProvider, 'RunView'> = {
            RunView: async () => ({
                Success: true,
                Results: [{ ID: COLL_ID, OwnerID: OWNER_ID.toLowerCase(), EnvironmentID: 'env-1' }],
            }),
        };

        const check = await GovernedArtifactService.Instance.CheckCollectionPermission(
            provider as IMetadataProvider,
            user,
            COLL_ID,
            'edit',
        );
        expect(check).toEqual({ allowed: true, environmentId: 'env-1' });
    });

    it('[A-P1-1] ExtractDirectActionArtifacts only surfaces successful mutating/creating actions and CollectDelegatedRunArtifacts collects touched + payload artifacts', async () => {
        const params: ActionParam[] = [
            { Name: 'ArtifactID', Value: ART_ID, Type: 'Output' },
            { Name: 'VersionID', Value: 'ver-9', Type: 'Output' },
            { Name: 'ArtifactName', Value: 'Q4 Workbook', Type: 'Output' },
            { Name: 'ArtifactTypeName', Value: 'Excel Spreadsheet', Type: 'Output' },
        ];

        // Rejected on failure
        expect(ExtractDirectActionArtifacts('Create Governed Artifact', false, params)).toBeUndefined();
        // Rejected on read-only actions
        expect(ExtractDirectActionArtifacts('Inspect Governed Artifact', true, params)).toBeUndefined();
        expect(ExtractDirectActionArtifacts('List Workspace Artifacts', true, params)).toBeUndefined();
        // Accepted on mutating/creating actions
        expect(ExtractDirectActionArtifacts('Mutate Governed Artifact', true, params)).toEqual([
            {
                ArtifactID: ART_ID,
                ArtifactVersionID: 'ver-9',
                Name: 'Q4 Workbook',
                ArtifactTypeName: 'Excel Spreadsheet',
            },
        ]);
        expect(ExtractDirectActionArtifacts('Refresh and Snapshot Artifact', true, params)).toHaveLength(1);

        const execResult: ExecuteAgentResult = {
            success: true,
            touchedArtifacts: [
                {
                    ArtifactID: ART_ID,
                    ArtifactVersionID: 'ver-9',
                    VersionNumber: 9,
                    Name: 'Q4 Workbook',
                    ArtifactTypeName: 'Excel Spreadsheet',
                    DriverClass: 'SpreadsheetArtifactViewerPlugin',
                    Operation: 'mutated',
                },
            ],
        } as ExecuteAgentResult;

        const collected = await CollectDelegatedRunArtifacts({
            Result: execResult,
            ContextUser: makeUser(OWNER_ID),
            Provider: {} as IMetadataProvider,
        });
        expect(collected).toEqual([
            {
                ArtifactID: ART_ID,
                ArtifactVersionID: 'ver-9',
                Name: 'Q4 Workbook',
                ArtifactTypeName: 'Excel Spreadsheet',
                DriverClass: 'SpreadsheetArtifactViewerPlugin',
            },
        ]);
    });

    it('[A-P1-3] ListWorkspaceArtifacts includes shared permissions, escapes SQL LIKE wildcards, pushes Type filter, and skips binary S3 downloads', async () => {
        const user = makeUser(ACTOR_ID);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Reason: 'Shared Read',
        });
        const downloadSpy = vi.spyOn(GovernedArtifactService.Instance, 'DownloadArtifactFileContent');

        const recordedFilters: string[] = [];
        const provider: Pick<IMetadataProvider, 'RunView'> = {
            RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.ExtraFilter) {
                    recordedFilters.push(`${params.EntityName}:${params.ExtraFilter}`);
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return { Success: true, Results: [{ ArtifactID: ART_ID }] };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: '100% [Q1]_Report', Type: 'Excel Spreadsheet' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: '100% [Q1]_Report', ContentMode: 'File', FileID: 's3-file-1' }],
                    };
                }
                return { Success: true, Results: [] };
            },
        };

        const res = await GovernedArtifactService.Instance.ListWorkspaceArtifacts({
            provider: provider as IMetadataProvider,
            contextUser: user,
            typeFilter: 'spreadsheet',
            search: '100% [Q1]_',
        });

        expect(res.success).toBe(true);
        expect(res.artifacts).toHaveLength(1);
        expect(downloadSpy).not.toHaveBeenCalled();

        const artifactQuery = recordedFilters.find((f) => f.startsWith('MJ: Artifacts:'));
        expect(artifactQuery).toContain(ART_ID);
        expect(artifactQuery).toContain('[%] [[]q1][_]' );
        expect(artifactQuery).toContain('Excel Spreadsheet');

        // ArtifactToolManager.handleListWorkspaceArtifactsTool delegates DB lookup even when collectionId is omitted
        const mgr = new ArtifactToolManager();
        mgr.Initialize([], { contextUser: user, provider: provider as IMetadataProvider, workspaceEnabled: true });
        const listRes = await mgr.ExecuteSingleToolCall({
            artifactId: 'workspace',
            tool: 'list_workspace_artifacts',
            input: { typeFilter: 'spreadsheet', search: '100% [Q1]_' },
        });
        expect(listRes.result.success).toBe(true);
        expect((listRes.result.data as { count: number }).count).toBe(1);
    });

    it('[A-P1-3] emits exit presence in finally for standalone InspectGovernedArtifact failure', async () => {
        const phases: string[] = [];
        SetArtifactAgentPresenceHook(async (evt) => {
            phases.push(evt.Phase);
        });
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Reason: 'Read',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(
            new (class extends BaseArtifactToolLibrary {
                protected override async invokeSubclassTool(): Promise<ArtifactToolResult> {
                    return { success: false, data: null, errorMessage: 'boom' };
                }
            })(),
        );
        const provider: Pick<IMetadataProvider, 'RunView'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return { Success: true, Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Doc', Type: 'Markdown Document' }] };
                }
                return { Success: true, Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Doc', ContentMode: 'Text', Content: '# Doc' }] };
            },
        };

        const outcome = await GovernedArtifactService.Instance.InspectGovernedArtifact({
            provider: provider as IMetadataProvider,
            contextUser: makeUser(ACTOR_ID),
            artifactId: ART_ID,
            tool: 'custom_probe',
        });
        expect(outcome.success).toBe(false);
        expect(phases).toEqual(['working', 'exit']);
    });

    it('[A-P2-1] bounds touchedArtifactsByRun LRU cache to maxSize 500 without unbounded growth', () => {
        const svc = GovernedArtifactService.Instance;
        for (let i = 0; i < 520; i++) {
            svc.RecordTouchedArtifact(`run-lru-${i}`, {
                ArtifactID: ART_ID,
                ArtifactVersionID: 'ver-1',
                VersionNumber: 1,
                Name: `Artifact ${i}`,
                ArtifactTypeName: 'Markdown Document',
                Operation: 'mutated',
            });
        }
        // Oldest run should be evicted while newest run remains present
        expect(svc.PeekTouchedArtifacts('run-lru-0')).toHaveLength(0);
        expect(svc.PeekTouchedArtifacts('run-lru-519')).toHaveLength(1);
    });

    it('[R1-P1-1] skips live-room rollback on all 4 pre-save failure paths and passes savedVersionId on post-save commit failures', async () => {
        const actor = makeUser(OWNER_ID, 'Owner');
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Reason: 'Owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as MJArtifactTypeEntity);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(new SpyToolLibrary(true));

        const rollbackCalls: Array<{ source: string; versionId: string | undefined }> = [];
        SetArtifactLiveMutationHook(async () => ({
            applied: true,
            commit: async () => ({ applied: true }),
            rollback: async (versionId?: string) => {
                rollbackCalls.push({ source: 'hook', versionId });
            },
        }));

        // 1. Pre-save DB concurrency conflict must NOT call rollback
        let verLookupCount = 0;
        const conflictProvider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Doc', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    verLookupCount++;
                    const versionNum = verLookupCount === 1 ? 1 : 2;
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: versionNum, Name: 'Doc', ContentMode: 'Text', Content: '# Initial' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => {
                throw new Error('Should not allocate entity on DB conflict');
            },
        };
        const conflictRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: conflictProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(conflictRes.success).toBe(false);
        expect(conflictRes.errorMessage).toContain('Concurrent modification detected');
        expect(rollbackCalls).toHaveLength(0);

        // 2. Pre-save File-mode .xlsx materialization failure must NOT call rollback
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet');
        const xlsxBytes = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(wb));
        vi.spyOn(GovernedArtifactService.Instance, 'DownloadArtifactFileContent').mockResolvedValue(xlsxBytes);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-xls',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);

        const editedWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet');
        SpreadsheetEngine.Instance.SetCell(editedWb, editedWb.Worksheets[0].SheetID, 'B2', { Value: 'AgentWrite' }, true);
        const editedJson = SpreadsheetEngine.Instance.SerializeWorkbook(editedWb);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(
            new (class extends BaseArtifactToolLibrary {
                protected override async invokeSubclassTool(): Promise<ArtifactToolResult> {
                    return { success: true, data: { updatedContent: editedJson } };
                }
            })(),
        );
        const patchSpy = vi.spyOn(XlsxOpenXmlAdapter.Instance, 'PatchXlsxBytes').mockImplementation(() => {
            throw new Error('Simulated .xlsx patch error');
        });

        let saveShouldSucceed = true;
        let deletedIds: string[] = [];
        const makeDraftVersion = (id: string) => ({
            ID: id,
            ArtifactID: ART_ID,
            VersionNumber: 2,
            Name: '',
            UserID: '',
            Comments: '',
            ContentHash: '',
            ContentMode: 'Text',
            FileID: null as string | null,
            MimeType: null as string | null,
            FileName: null as string | null,
            ContentSizeBytes: 0,
            Content: '' as string | null,
            Configuration: '' as string | null,
            LatestResult: { CompleteMessage: 'Save failed' },
            NewRecord: () => undefined,
            Save: async () => saveShouldSucceed,
            Delete: async function (this: { ID: string }) {
                deletedIds.push(this.ID);
                this.ID = '';
                return true;
            },
        });

        const fileProvider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Book.xlsx', Type: 'Excel Spreadsheet' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Book.xlsx', ContentMode: 'File', FileID: 'file-1' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => makeDraftVersion('ver-saved-2') as object as MJArtifactVersionEntity,
        };

        const xlsxFailRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: fileProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'write_cells',
            input: {},
        });
        expect(xlsxFailRes.success).toBe(false);
        expect(xlsxFailRes.errorMessage).toContain('Failed to materialize updated .xlsx bytes');
        expect(rollbackCalls).toHaveLength(0);

        // 3. Pre-save File-mode S3 upload failure must NOT call rollback
        patchSpy.mockRestore();
        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
        Object.defineProperty(FileStorageEngine.Instance, 'HasStorageAccounts', { configurable: true, get: () => true });
        vi.spyOn(FileStorageEngine.Instance, 'UploadFile').mockRejectedValue(new Error('S3 upload down'));

        const uploadFailRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: fileProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'write_cells',
            input: {},
        });
        expect(uploadFailRes.success).toBe(false);
        expect(uploadFailRes.errorMessage).toContain('Failed to upload updated .xlsx binary');
        expect(rollbackCalls).toHaveLength(0);

        // 4. Pre-save versionEntity.Save() returning false must NOT call rollback
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-doc',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        } as MJArtifactTypeEntity);
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(new SpyToolLibrary(true));
        saveShouldSucceed = false;
        const textProvider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Doc', Type: 'Markdown Document' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Doc', ContentMode: 'Text', Content: '# Initial' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => makeDraftVersion('ver-saved-2') as object as MJArtifactVersionEntity,
        };
        const saveFailRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: textProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(saveFailRes.success).toBe(false);
        expect(saveFailRes.errorMessage).toContain('Save failed');
        expect(rollbackCalls).toHaveLength(0);

        // 5. Post-save commit throw captures savedVersionId BEFORE Delete() and passes it to rollback
        saveShouldSucceed = true;
        deletedIds = [];
        SetArtifactLiveMutationHook(async () => ({
            applied: true,
            commit: async () => {
                throw new Error('Room closed mid-commit');
            },
            rollback: async (versionId?: string) => {
                rollbackCalls.push({ source: 'hook-throw', versionId });
            },
        }));
        const commitThrowRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: textProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(commitThrowRes.success).toBe(false);
        expect(commitThrowRes.errorMessage).toContain('Live room commit failed');
        expect(deletedIds).toEqual(['ver-saved-2']);
        expect(rollbackCalls).toEqual([{ source: 'hook-throw', versionId: 'ver-saved-2' }]);

        // 6. Post-save commit applied=false prefers commitRes.rollback and passes savedVersionId
        rollbackCalls.length = 0;
        deletedIds = [];
        SetArtifactLiveMutationHook(async () => ({
            applied: true,
            commit: async () => ({
                applied: false,
                rollback: async (versionId?: string) => {
                    rollbackCalls.push({ source: 'commitRes', versionId });
                },
            }),
            rollback: async (versionId?: string) => {
                rollbackCalls.push({ source: 'hook', versionId });
            },
        }));
        const commitRejectRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: textProvider as IMetadataProvider,
            contextUser: actor,
            artifactId: ART_ID,
            tool: 'custom_probe',
            input: {},
        });
        expect(commitRejectRes.success).toBe(false);
        expect(deletedIds).toEqual(['ver-saved-2']);
        expect(rollbackCalls).toEqual([{ source: 'commitRes', versionId: 'ver-saved-2' }]);
    });

    it('[R1-P1-2] consistently refuses File-mode .xlsx structural tools including duplicate_sheet, reorder_sheets, and set_sheet_layout in both ArtifactToolManager and GovernedArtifactService', async () => {
        const actor = makeUser(OWNER_ID, 'Owner');
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FinancialModel', ['Summary', 'Detail'], 6, 4);
        SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'A1', { Value: 'Revenue' }, true);
        const xlsxBytes = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(wb));

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Reason: 'Owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-xls',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);
        vi.spyOn(GovernedArtifactService.Instance, 'DownloadArtifactFileContent').mockResolvedValue(xlsxBytes);

        const spyLib = new SpyToolLibrary(true);
        const resolveLibSpy = vi.spyOn(GovernedArtifactService.Instance, 'ResolveLibrary').mockReturnValue(spyLib);

        const provider: Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: ART_ID, UserID: OWNER_ID, Name: 'Model.xlsx', Type: 'Excel Spreadsheet' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Model.xlsx', ContentMode: 'File', FileID: 'file-1' }],
                    };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => {
                throw new Error('Should not save a version when structural tool is refused');
            },
        };

        const structuralTools = ['duplicate_sheet', 'reorder_sheets', 'set_sheet_layout', 'insert_rows'];
        for (const tool of structuralTools) {
            const serviceRes = await GovernedArtifactService.Instance.MutateGovernedArtifact({
                provider: provider as IMetadataProvider,
                contextUser: actor,
                artifactId: ART_ID,
                tool,
                input: { sheet: 'Summary', newName: 'Copy', sheetIds: ['Detail', 'Summary'], frozenRows: 1, atRowNumber: 2 },
            });
            expect(serviceRes.success).toBe(false);
            expect(serviceRes.errorMessage).toContain('not supported on File-mode .xlsx workbooks');
            expect(spyLib.LastInput).toBeUndefined();
        }

        resolveLibSpy.mockRestore();

        const mgr = new ArtifactToolManager();
        mgr.Initialize(
            [
                {
                    name: 'Model.xlsx',
                    typeName: 'Excel Spreadsheet',
                    toolLibraryClass: 'SpreadsheetToolLibrary',
                    content: xlsxBytes,
                },
            ],
            { contextUser: actor, provider: provider as IMetadataProvider },
        );

        for (const tool of structuralTools) {
            const mgrRes = await mgr.ExecuteSingleToolCall({
                artifactId: 'A',
                tool,
                input: { sheet: 'Summary', newName: 'Copy', sheetIds: ['Detail', 'Summary'], frozenRows: 1, atRowNumber: 2 },
            });
            expect(mgrRes.result.success).toBe(false);
            expect(mgrRes.result.errorMessage).toContain('not supported on File-mode .xlsx workbooks');
        }

        // Cell value update remains allowed on File-mode .xlsx workbooks
        const writeRes = await mgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'write_cells',
            input: { sheet: 'Summary', cells: [{ address: 'B1', value: 420 }] },
        });
        expect(writeRes.result.success).toBe(true);
    });

    it('[R1-P2-1] MergeTouchedArtifactSummary keeps higher VersionNumber while preserving Operation=created', () => {
        const createdV1: GovernedRunArtifactSummary = {
            ArtifactID: ART_ID,
            ArtifactVersionID: 'ver-1',
            VersionNumber: 1,
            Name: 'Spec.md',
            ArtifactTypeName: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            Operation: 'created',
        };
        const mutatedV3: GovernedRunArtifactSummary = {
            ArtifactID: ART_ID,
            ArtifactVersionID: 'ver-3',
            VersionNumber: 3,
            Name: 'Spec v3.md',
            ArtifactTypeName: 'Markdown Document',
            Operation: 'mutated',
        };

        // Created v1 followed by mutated v3 -> keeps v3 metadata, preserves 'created' and DriverClass
        const forward = MergeTouchedArtifactSummary(createdV1, mutatedV3);
        expect(forward).toEqual({
            ArtifactID: ART_ID,
            ArtifactVersionID: 'ver-3',
            VersionNumber: 3,
            Name: 'Spec v3.md',
            ArtifactTypeName: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            Operation: 'created',
        });

        // Stale created v1 arriving after mutated v3 -> does NOT downgrade VersionNumber to 1, preserves 'created'
        const backward = MergeTouchedArtifactSummary(mutatedV3, createdV1);
        expect(backward).toEqual({
            ArtifactID: ART_ID,
            ArtifactVersionID: 'ver-3',
            VersionNumber: 3,
            Name: 'Spec v3.md',
            ArtifactTypeName: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            Operation: 'created',
        });

        // Two mutations -> keeps higher VersionNumber and 'mutated'
        const mutatedV2: GovernedRunArtifactSummary = { ...mutatedV3, ArtifactVersionID: 'ver-2', VersionNumber: 2, Name: 'Spec v2.md' };
        expect(MergeTouchedArtifactSummary(mutatedV3, mutatedV2)).toMatchObject({
            ArtifactVersionID: 'ver-3',
            VersionNumber: 3,
            Operation: 'mutated',
        });
    });
});
