import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { SelectPrimaryArtifact } from '../AgentRunner';
import { GovernedArtifactService } from '../GovernedArtifactService';
import {
    ArtifactAgentPresenceEvent,
    SetArtifactAgentPresenceHook,
    SetArtifactLiveContentReaderHook,
} from '../artifact-presence-locator';
import {
    ARTIFACT_WORKSPACE_CHANNEL_NAME,
    ArtifactWorkspaceChannelServer,
    LoadArtifactWorkspaceChannelServer,
} from '../realtime/artifact-workspace-channel-server';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { SpreadsheetToolLibrary } from '../artifact-tools/SpreadsheetToolLibrary';

function makeUser(id = 'user-1111', name = 'Alice Analyst'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = 'alice@example.com';
    return u;
}

describe('Always-on ArtifactToolManager workspace, GovernedArtifactService & live libraries', () => {
    beforeEach(() => {
        SpreadsheetEngine.Instance.ClearViewerFunctionCache();
    });

    afterEach(() => {
        SetArtifactAgentPresenceHook(null);
        SetArtifactLiveContentReaderHook(null);
        vi.restoreAllMocks();
    });

    it('keeps workspace tools always enabled even with 0 initial artifacts and cleans exit presence on NotifyRunCompleted', async () => {
        const user = makeUser();
        const fakeProvider = {} as IMetadataProvider;
        const mgr = new ArtifactToolManager();
        mgr.Initialize([], { workspaceEnabled: true, contextUser: user, provider: fakeProvider });
        mgr.SetAgentRunContext('run-ws-1', 'Data Analyst');

        const events: ArtifactAgentPresenceEvent[] = [];
        SetArtifactAgentPresenceHook((e) => {
            events.push(e);
        });

        expect(mgr.HasArtifacts()).toBe(false);
        expect(mgr.IsWorkspaceEnabled()).toBe(true);
        const manifest = mgr.ToManifestString();
        expect(manifest).toContain('create_artifact');
        expect(manifest).toContain('open_artifact');
        expect(manifest).toContain('list_workspace_artifacts');
        const toolListPrompt = mgr.GetToolDocumentation();
        expect(toolListPrompt).toContain('create_artifact');

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: 'art-1',
            UserID: user.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });

        const createOutcome = vi.spyOn(GovernedArtifactService.Instance, 'CreateGovernedArtifact').mockResolvedValue({
            success: true,
            artifactId: '11111111-1111-1111-1111-111111111111',
            versionId: '22222222-2222-2222-2222-222222222222',
            versionNumber: 1,
            name: 'Q3 Revenue Workbook',
            typeName: 'Excel Spreadsheet',
            driverClass: 'SpreadsheetArtifactViewerPlugin',
            toolLibraryClass: 'SpreadsheetToolLibrary',
            mimeType: 'application/json',
            contentMode: 'Text',
            content: SpreadsheetEngine.Instance.SerializeWorkbook(
                SpreadsheetEngine.Instance.CreateEmptyWorkbook('Q3 Revenue Workbook', ['Summary']),
            ),
        });

        const callRes = await mgr.ExecuteToolCall({
            artifactId: 'workspace',
            tool: 'create_artifact',
            input: { title: 'Q3 Revenue Workbook', type: 'spreadsheet', sheetNames: ['Summary'] },
        });

        expect(createOutcome).toHaveBeenCalledTimes(1);
        expect(callRes.result.success).toBe(true);
        expect(mgr.HasArtifacts()).toBe(true);

        const touched = mgr.GetTouchedArtifacts();
        expect(touched).toHaveLength(1);
        expect(touched[0]).toMatchObject({
            ArtifactID: '11111111-1111-1111-1111-111111111111',
            ArtifactVersionID: '22222222-2222-2222-2222-222222222222',
            Name: 'Q3 Revenue Workbook',
            ArtifactTypeName: 'Excel Spreadsheet',
            Operation: 'created',
        });

        await mgr.NotifyRunCompleted();
        const exitEvent = events.find((e) => e.Phase === 'exit');
        expect(exitEvent).toBeDefined();
        expect(exitEvent?.ArtifactID).toBe('11111111-1111-1111-1111-111111111111');
        expect(exitEvent?.AgentName).toBe('Data Analyst');
        expect(exitEvent?.ActingForUserName).toBe('Alice Analyst');
    });

    it('merges absorbed sub-agent touched artifacts and forwards parent agentRunId into GovernedArtifactService cache', () => {
        const mgr = new ArtifactToolManager();
        mgr.Initialize([]);
        mgr.AbsorbTouchedArtifacts([
            {
                ArtifactID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                ArtifactVersionID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                VersionNumber: 3,
                Name: 'Quarterly Board Deck',
                ArtifactTypeName: 'Presentation',
                DriverClass: 'SlideDeckArtifactViewerPlugin',
                Operation: 'mutated',
            },
        ]);

        const list = mgr.GetTouchedArtifacts();
        expect(list).toHaveLength(1);
        expect(list[0].Name).toBe('Quarterly Board Deck');
        expect(list[0].Operation).toBe('mutated');

        GovernedArtifactService.Instance.RecordTouchedArtifact('run-merge-1', {
            ArtifactID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            ArtifactVersionID: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            VersionNumber: 1,
            Name: 'Created Brief',
            ArtifactTypeName: 'Markdown Document',
            Operation: 'created',
        });
        expect(GovernedArtifactService.Instance.PeekTouchedArtifacts('run-merge-1')).toHaveLength(1);
        expect(GovernedArtifactService.Instance.ConsumeTouchedArtifacts('run-merge-1')).toHaveLength(1);
        expect(GovernedArtifactService.Instance.PeekTouchedArtifacts('run-merge-1')).toHaveLength(0);
    });

    it('SelectPrimaryArtifact prefers collaborative file/touched outputs over payload fallback', () => {
        const chosen = SelectPrimaryArtifact(
            [
                {
                    artifactId: 'usr-1',
                    versionId: 'ver-usr-1',
                    versionNumber: 2,
                },
            ],
            {
                artifactId: 'payload-1',
                versionId: 'ver-payload-1',
                versionNumber: 1,
            },
        );
        expect(chosen?.artifactId).toBe('usr-1');

        const fallback = SelectPrimaryArtifact(undefined, {
            artifactId: 'payload-1',
            versionId: 'ver-payload-1',
            versionNumber: 1,
        });
        expect(fallback?.artifactId).toBe('payload-1');
    });

    it('normalizes canonical artifact types across aliases in GovernedArtifactService', () => {
        const svc = GovernedArtifactService.Instance;
        expect(svc.NormalizeArtifactTypeName('spreadsheet')).toBe('Excel Spreadsheet');
        expect(svc.NormalizeArtifactTypeName('sheets')).toBe('Excel Spreadsheet');
        expect(svc.NormalizeArtifactTypeName('doc')).toBe('Markdown Document');
        expect(svc.NormalizeArtifactTypeName('markdown')).toBe('Markdown Document');
        expect(svc.NormalizeArtifactTypeName('slides')).toBe('Presentation');
        expect(svc.NormalizeArtifactTypeName('deck')).toBe('Presentation');
    });

    it('ArtifactWorkspaceChannelServer registers cleanly with ClassFactory and pins ChannelName', () => {
        LoadArtifactWorkspaceChannelServer();
        const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'ArtifactWorkspaceChannelServer',
        );
        expect(plugin).toBeInstanceOf(ArtifactWorkspaceChannelServer);
        expect(plugin?.ChannelName).toBe(ARTIFACT_WORKSPACE_CHANNEL_NAME);
        expect(ARTIFACT_WORKSPACE_CHANNEL_NAME).toBe('ArtifactWorkspace');
    });

    it('SpreadsheetToolLibrary materializes live tables and evaluates =MJ.* formulas under contextUser', async () => {
        const user = makeUser();
        const provider = {} as IMetadataProvider;
        const sheetLib = new SpreadsheetToolLibrary();

        const liveSpy = vi
            .spyOn(SpreadsheetEngine.Instance, 'RefreshLiveTables')
            .mockImplementation(async (wb) => {
                const tableId = wb.Worksheets[0]?.LiveTables[0]?.TableID ?? 'tbl-rev';
                return {
                    [tableId]: {
                        BlockID: tableId,
                        Kind: 'SavedQuery',
                        Title: 'Sales Live',
                        Success: true,
                        ExecutedAt: '2026-11-14T18:00:00Z',
                        Columns: [
                            { Name: 'Region', Type: 'string' },
                            { Name: 'Revenue', Type: 'number' },
                        ],
                        Rows: [{ Region: 'North', Revenue: 100 }],
                        TotalRowCount: 1,
                        Truncated: false,
                        AccessDenied: false,
                    },
                };
            });
        const evalSpy = vi.spyOn(SpreadsheetEngine.Instance, 'EvaluateMjCustomFunctions').mockResolvedValue({
            EvaluatedCount: 1,
            AccessDeniedCount: 0,
        });

        const baseWb = SpreadsheetEngine.Instance.SerializeWorkbook(
            SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sales Live', ['Sales']),
        );

        const upsertRes = await sheetLib.InvokeTool(
            'upsert_live_table',
            {
                sheet: 'Sales',
                anchorCell: 'A1',
                sourceType: 'query',
                queryId: 'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq',
                maxRows: 100,
            },
            baseWb,
            { contextUser: user, provider },
        );
        expect(upsertRes.success).toBe(true);
        const upsertData = upsertRes.data as {
            updatedContent: string;
            boundingRange?: string;
            materialized?: boolean;
            headers?: string[];
            rowCount?: number;
        };
        expect(upsertData.materialized).toBe(true);
        expect(upsertData.boundingRange).toBe('A1:B2');
        expect(upsertData.headers).toEqual(['Region', 'Revenue']);
        expect(upsertData.rowCount).toBe(1);
        expect(liveSpy).toHaveBeenCalledTimes(1);

        const formulaRes = await sheetLib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sales',
                cells: [{ address: 'D2', formula: '=MJ.QUERY("Monthly Revenue")' }],
            },
            upsertData.updatedContent,
            { contextUser: user, provider },
        );
        expect(formulaRes.success).toBe(true);
        expect(evalSpy).toHaveBeenCalledTimes(2);

        const refreshRes = await sheetLib.InvokeTool(
            'refresh_live_tables',
            {},
            (formulaRes.data as { updatedContent: string }).updatedContent,
            { contextUser: user, provider },
        );
        expect(refreshRes.success).toBe(true);
        expect((refreshRes.data as { refreshedCount?: number }).refreshedCount).toBe(1);
        expect(liveSpy).toHaveBeenCalledTimes(2);
    });

    it('DocumentToolLibrary includes insert_live_block tool with kind and parameters schema', () => {
        const docLib = new DocumentToolLibrary();
        const tools = docLib.GetToolList();
        const liveTool = tools.find((t) => t.name === 'insert_live_block');
        expect(liveTool).toBeDefined();
        expect(liveTool?.inputSchema.properties).toHaveProperty('kind');
        expect(liveTool?.inputSchema.properties).toHaveProperty('parameters');

        expect(typeof ArtifactMetadataEngine.Instance.FindArtifactType).toBe('function');
    });

    it('GovernedArtifactService.MutateGovernedArtifact preserves configuration keys and refreshes previewSnapshot', async () => {
        const user = makeUser();
        const savedConfigs: string[] = [];
        const provider = {
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{
                            ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                            Name: 'Quarterly Narrative',
                            TypeID: 'type-md',
                            Type: 'Markdown Document',
                        }],
                        TotalRowCount: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Types') {
                    return {
                        Success: true,
                        Results: [{
                            ID: 'type-md',
                            Name: 'Markdown Document',
                            ContentType: 'text/markdown',
                            DriverClass: 'MarkdownArtifactViewerPlugin',
                            ToolLibraryClass: 'DocumentToolLibrary',
                            IsEnabled: true,
                        }],
                        TotalRowCount: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{
                            ID: 'ver-1',
                            VersionNumber: 1,
                            Name: 'Quarterly Narrative',
                            ContentMode: 'Text',
                            Content: '# Q1 Summary\n\nInitial text.\n',
                            Configuration: JSON.stringify({
                                customSetting: 'preserve-me',
                                previewSnapshot: { version: 1, title: 'Old Snapshot' },
                            }),
                            MimeType: 'text/markdown',
                        }],
                        TotalRowCount: 1,
                    };
                }
                return { Success: true, Results: [], TotalRowCount: 0 };
            }),
            GetEntityObject: vi.fn(async () => ({
                ID: 'ver-2',
                NewRecord: () => true,
                Save: async function (this: { Configuration?: string }) {
                    if (typeof this.Configuration === 'string') {
                        savedConfigs.push(this.Configuration);
                    }
                    return true;
                },
            })),
        } as object as IMetadataProvider;

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            UserID: user.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });

        const outcome = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider,
            contextUser: user,
            artifactId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            tool: 'replace_block',
            input: { blockId: 'blk-2', markdown: 'Updated KPI highlights.' },
            agentRunId: 'run-config-check',
            agentName: 'Sage',
        });
        expect(outcome.success, outcome.errorMessage).toBe(true);
        expect(savedConfigs).toHaveLength(1);
        const parsed = JSON.parse(savedConfigs[0]) as {
            customSetting?: string;
            agentRunId?: string;
            lastTool?: string;
            previewSnapshot?: { version?: number; title?: string };
        };
        expect(parsed['customSetting']).toBe('preserve-me');
        expect(parsed['agentRunId']).toBe('run-config-check');
        expect(parsed['lastTool']).toBe('replace_block');
        expect(parsed['previewSnapshot']).toBeDefined();
    });

    it('ArtifactToolManager emits settled presence in finally even when InvokeTool fails', async () => {
        const user = makeUser();
        const phases: string[] = [];
        const presenceHookSpy = vi
            .spyOn(GovernedArtifactService.Instance, 'EmitAgentPresence')
            .mockImplementation(async (evt) => {
                phases.push(evt.phase);
            });

        const mgr = new ArtifactToolManager();
        mgr.Initialize(
            [
                {
                    artifactId: 'art-fail-1',
                    name: 'Doc',
                    typeName: 'Markdown Document',
                    content: '# Doc\n\nBody.\n',
                    toolLibraryClass: 'DocumentToolLibrary',
                },
            ],
            {
                contextUser: user,
                agentRunId: 'run-fail-presence',
                agentName: 'Sage',
                workspaceEnabled: true,
            },
        );
        const execRes = await mgr.ExecuteToolCall({
            artifactId: 'A',
            tool: 'delete_block',
            input: { blockId: 'non-existent-block' },
        });
        expect(execRes.result.success).toBe(false);
        expect(phases).toEqual(['working', 'settled']);
        expect(presenceHookSpy).toHaveBeenCalledTimes(2);
    });
});
