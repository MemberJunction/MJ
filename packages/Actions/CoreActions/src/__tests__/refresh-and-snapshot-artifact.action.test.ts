import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine, ArtifactPermissionEngine, MJArtifactTypeEntity, SpreadsheetEngine } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    ArtifactLiveMutationHookEvent,
    GovernedArtifactService,
    SetArtifactLiveMutationHook,
} from '@memberjunction/ai-agents';
import { RefreshAndSnapshotArtifactAction } from '../custom/utilities/refresh-and-snapshot-artifact.action';

function makeUser(id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Scheduler User';
    u.Email = 'scheduler@example.com';
    u.IsActive = true;
    return u;
}

describe('RefreshAndSnapshotArtifactAction (H3 §5.3 + P0-16)', () => {
    const action = new RefreshAndSnapshotArtifactAction();
    const user = makeUser('11111111-1111-1111-1111-111111111111');
    const otherUserId = '22222222-2222-2222-2222-222222222222';
    const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const conversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const prevHmacSecret = process.env['MJ_FROZEN_BLOCK_HMAC_SECRET'];

    beforeEach(() => {
        SpreadsheetEngine.Instance.ClearViewerFunctionCache();
        SetArtifactLiveMutationHook(null);
        process.env['MJ_FROZEN_BLOCK_HMAC_SECRET'] = '0123456789abcdef0123456789abcdef-test-secret';
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
    });

    afterEach(() => {
        SetArtifactLiveMutationHook(null);
        if (prevHmacSecret === undefined) {
            delete process.env['MJ_FROZEN_BLOCK_HMAC_SECRET'];
        } else {
            process.env['MJ_FROZEN_BLOCK_HMAC_SECRET'] = prevHmacSecret;
        }
        vi.restoreAllMocks();
    });

    it('rejects callers without CanEdit permission on the artifact', async () => {
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactId,
            UserID: user.ID,
            IsOwner: false,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: false,
            GrantedBy: 'none',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-sheet',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);

        const mockProvider = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactId, Name: 'Readonly Sheet', Type: 'Excel Spreadsheet', UserID: otherUserId }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: 'ver-1', VersionNumber: 1, Name: 'Readonly Sheet', ContentMode: 'Text', Content: '{}' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(mockProvider as ReturnType<typeof RunView.FromMetadataProvider>);

        const actionParams: RunActionParams & { Provider?: IMetadataProvider } = {
            ContextUser: user,
            Provider: mockProvider as object as IMetadataProvider,
            Params: [{ Name: 'ArtifactID', Type: 'Input', Value: artifactId }],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        };

        const result = await action.ExecuteRefreshAction(actionParams);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
    });

    it('rejects invalid or cross-user ConversationID and passes contextUser to MJ: Conversations RunView', async () => {
        const seenConversationContextUsers: Array<UserInfo | undefined> = [];
        const mockProvider = {
            RunView: async (params: { EntityName: string }, ctxUser?: UserInfo) => {
                if (params.EntityName === 'MJ: Conversations') {
                    seenConversationContextUsers.push(ctxUser);
                    return {
                        Success: true,
                        Results: [{ ID: conversationId, UserID: otherUserId }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(mockProvider as ReturnType<typeof RunView.FromMetadataProvider>);
        const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions');

        const invalidRes = await action.ExecuteRefreshAction({
            ContextUser: user,
            Provider: mockProvider as object as IMetadataProvider,
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: artifactId },
                { Name: 'ConversationID', Type: 'Input', Value: 'not-a-uuid' },
            ],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        } as RunActionParams);
        expect(invalidRes.Success).toBe(false);
        expect(invalidRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(permSpy).not.toHaveBeenCalled();

        const crossUserRes = await action.ExecuteRefreshAction({
            ContextUser: user,
            Provider: mockProvider as object as IMetadataProvider,
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: artifactId },
                { Name: 'ConversationID', Type: 'Input', Value: conversationId },
            ],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        } as RunActionParams);
        expect(crossUserRes.Success).toBe(false);
        expect(crossUserRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(seenConversationContextUsers).toHaveLength(1);
        expect(seenConversationContextUsers[0]).toBe(user);
        expect(permSpy).not.toHaveBeenCalled();
    });

    it('refreshes live data, saves vN+1, posts summary card with Role=AI, and emits P1-7 metadata params', async () => {
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactId,
            UserID: user.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-sheet',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);

        const sheetWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Weekly KPIs', ['KPIs']);
        SpreadsheetEngine.Instance.SetCell(sheetWb, 'KPIs', 'A1', { Value: 'Revenue' }, false);
        SpreadsheetEngine.Instance.SetCell(sheetWb, 'KPIs', 'B1', { Formula: '=MJ.VIEW("MJ: Users", "(default)")' }, false);
        const initialContent = SpreadsheetEngine.Instance.SerializeWorkbook(sheetWb);

        vi.spyOn(SpreadsheetEngine.Instance, 'EvaluateMjCustomFunctions').mockImplementation(async (wb) => {
            wb.Worksheets[0].Cells['B1'].ComputedValue = 142;
            wb.Worksheets[0].Cells['B1'].DisplayValue = '142';
            return { EvaluatedCount: 1, AccessDeniedCount: 0 };
        });

        const savedVersions: Array<{ VersionNumber: number; Comments: string | null }> = [];
        const savedMessages: Array<{ ConversationID: string; Message: string; Role: string }> = [];
        const savedLinks: Array<{ ConversationDetailID: string; ArtifactVersionID: string }> = [];

        const mockRunViewProvider = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [{ ID: conversationId, UserID: user.ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: artifactId,
                                Name: 'Weekly Revenue Report',
                                Type: 'Excel Spreadsheet',
                                UserID: user.ID,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-1',
                                VersionNumber: 1,
                                Name: 'Weekly Revenue Report',
                                ContentMode: 'Text',
                                Content: initialContent,
                                Configuration: JSON.stringify({
                                    livingReportDigest: 'old-digest-value',
                                    livingReportHighlightLines: ['KPIs!A1=Revenue', 'KPIs!B1=100'],
                                }),
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            mockRunViewProvider as ReturnType<typeof RunView.FromMetadataProvider>,
        );

        const providerObj = {
            ...mockRunViewProvider,
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifact Versions') {
                    const record: {
                        ID: string;
                        VersionNumber?: number;
                        Comments?: string | null;
                        NewRecord: () => void;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: 'ver-2',
                        NewRecord: () => undefined,
                        Save: async () => {
                            savedVersions.push({
                                VersionNumber: Number(record.VersionNumber),
                                Comments: record.Comments ?? null,
                            });
                            return true;
                        },
                    };
                    return record;
                }
                if (entityName === 'MJ: Conversation Details') {
                    const record: {
                        ID: string;
                        ConversationID?: string;
                        Message?: string;
                        Role?: string;
                        NewRecord: () => void;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: 'conv-detail-1',
                        NewRecord: () => undefined,
                        Save: async () => {
                            savedMessages.push({
                                ConversationID: String(record.ConversationID),
                                Message: String(record.Message),
                                Role: String(record.Role),
                            });
                            return true;
                        },
                    };
                    return record;
                }
                if (entityName === 'MJ: Conversation Detail Artifacts') {
                    const record: {
                        ID: string;
                        ConversationDetailID?: string;
                        ArtifactVersionID?: string;
                        NewRecord: () => void;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: 'conv-link-1',
                        NewRecord: () => undefined,
                        Save: async () => {
                            savedLinks.push({
                                ConversationDetailID: String(record.ConversationDetailID),
                                ArtifactVersionID: String(record.ArtifactVersionID),
                            });
                            return true;
                        },
                    };
                    return record;
                }
                throw new Error(`Unexpected entity ${entityName}`);
            },
        };

        const params: RunActionParams & { Provider?: IMetadataProvider } = {
            ContextUser: user,
            Provider: providerObj as object as IMetadataProvider,
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: artifactId },
                { Name: 'ConversationID', Type: 'Input', Value: conversationId },
            ],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        };

        const res = await action.ExecuteRefreshAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(savedVersions).toHaveLength(1);
        expect(savedVersions[0].VersionNumber).toBe(2);
        expect(savedVersions[0].Comments).toContain('KPIs!B1=142');
        expect(savedMessages).toHaveLength(1);
        expect(savedMessages[0].ConversationID).toBe(conversationId);
        expect(savedMessages[0].Role).toBe('AI');
        expect(savedMessages[0].Message).toContain('Weekly Revenue Report');
        expect(savedLinks).toHaveLength(1);
        expect(savedLinks[0].ArtifactVersionID).toBe('ver-2');

        expect(params.Params.find((p) => p.Name === 'Changed')?.Value).toBe(true);
        expect(params.Params.find((p) => p.Name === 'NewVersionNumber')?.Value).toBe(2);
        expect(params.Params.find((p) => p.Name === 'VersionID')?.Value).toBe('ver-2');
        expect(params.Params.find((p) => p.Name === 'ArtifactName')?.Value).toBe('Weekly Revenue Report');
        expect(params.Params.find((p) => p.Name === 'ArtifactTypeName')?.Value).toBe('Excel Spreadsheet');
        expect(params.Params.find((p) => p.Name === 'DriverClass')?.Value).toBe('SpreadsheetArtifactViewerPlugin');
    });

    it('preserves ContentMode=File (.xlsx), uploads refreshed .xlsx, and coordinates deferCommit live Yjs hook (P0-16)', async () => {
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactId,
            UserID: user.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-sheet',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);

        const sheetWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('File KPIs', ['KPIs']);
        // Populate 50 cells (>40) to prove digest hashes full payload instead of stopping at cell 40
        for (let r = 1; r <= 50; r++) {
            SpreadsheetEngine.Instance.SetCell(sheetWb, sheetWb.Worksheets[0].SheetID, `A${r}`, { Value: r }, false);
        }
        SpreadsheetEngine.Instance.SetCell(sheetWb, sheetWb.Worksheets[0].SheetID, 'B50', { Value: 100 }, false);
        const xlsxBytes = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(sheetWb));

        vi.spyOn(GovernedArtifactService.Instance, 'DownloadArtifactFileContent').mockResolvedValue(xlsxBytes);
        vi.spyOn(SpreadsheetEngine.Instance, 'EvaluateMjCustomFunctions').mockImplementation(async (wb) => {
            SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'B50', { Value: 999 }, false);
            return { EvaluatedCount: 1, AccessDeniedCount: 0 };
        });

        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(FileStorageEngine.Instance, 'HasStorageAccounts', 'get').mockReturnValue(true);
        vi.spyOn(FileStorageEngine.Instance, 'UploadFile').mockResolvedValue({
            FileID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            Name: 'File KPIs.xlsx',
        } as Awaited<ReturnType<typeof FileStorageEngine.Instance.UploadFile>>);

        const hookEvents: ArtifactLiveMutationHookEvent[] = [];
        let committedVersionId: string | undefined;
        SetArtifactLiveMutationHook(async (evt) => {
            hookEvents.push(evt);
            return {
                applied: true,
                commit: async (commitInfo) => {
                    committedVersionId = commitInfo?.versionId;
                    return { applied: true };
                },
            };
        });

        const persistedRecords: Array<{
            ContentMode?: string;
            FileID?: string | null;
            Content?: string | null;
            Configuration?: string | null;
        }> = [];
        const mockRunViewProvider = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactId, Name: 'File KPIs.xlsx', Type: 'Excel Spreadsheet', UserID: user.ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-1',
                                VersionNumber: 1,
                                Name: 'File KPIs.xlsx',
                                ContentMode: 'File',
                                FileID: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                                Content: null,
                                Configuration: JSON.stringify({ livingReportDigest: 'baseline-old-digest' }),
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            mockRunViewProvider as ReturnType<typeof RunView.FromMetadataProvider>,
        );

        const providerObj = {
            ...mockRunViewProvider,
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Artifact Versions') {
                    const rec: {
                        ID: string;
                        ContentMode?: string;
                        FileID?: string | null;
                        Content?: string | null;
                        Configuration?: string | null;
                        NewRecord: () => void;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: 'ver-2',
                        NewRecord: () => undefined,
                        Save: async () => {
                            persistedRecords.push({
                                ContentMode: rec.ContentMode,
                                FileID: rec.FileID ?? null,
                                Content: rec.Content ?? null,
                                Configuration: rec.Configuration ?? null,
                            });
                            return true;
                        },
                    };
                    return rec;
                }
                throw new Error(`Unexpected entity ${entityName}`);
            },
        };

        const params: RunActionParams & { Provider?: IMetadataProvider } = {
            ContextUser: user,
            Provider: providerObj as object as IMetadataProvider,
            Params: [{ Name: 'ArtifactID', Type: 'Input', Value: artifactId }],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        };

        const res = await action.ExecuteRefreshAction(params);
        if (!res.Success) {
            throw new Error(`Unexpected failure: ${res.ResultCode} — ${res.Message}`);
        }
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(persistedRecords).toHaveLength(1);
        expect(persistedRecords[0].ContentMode).toBe('File');
        expect(persistedRecords[0].FileID).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
        expect(persistedRecords[0].Content).toBeNull();
        expect(hookEvents).toHaveLength(1);
        expect(hookEvents[0].deferCommit).toBe(true);
        expect(hookEvents[0].xlsxBase64).toBeTruthy();
        expect(committedVersionId).toBe('ver-2');
    });

    it('passes ForceRefreshFrozen=true and signs frozen blocks via RefreshArtifactPayload', async () => {
        const refreshTablesSpy = vi
            .spyOn(SpreadsheetEngine.Instance, 'RefreshLiveTables')
            .mockImplementation(async (wb) => {
                wb.Worksheets[0].LiveTables = [
                    {
                        TableID: 'lt-1',
                        Title: 'Users Table',
                        SourceType: 'EntityView',
                        EntityName: 'MJ: Users',
                        AnchorCell: 'A1',
                        IncludeHeaders: true,
                        Mode: 'Live',
                    },
                ];
                return {
                    'lt-1': {
                        Success: true,
                        ExecutedAt: new Date().toISOString(),
                        Mode: 'Live',
                        Columns: ['ID'],
                        Rows: [['u1']],
                        TotalRowCount: 1,
                        Truncated: false,
                        AccessDenied: false,
                    },
                };
            });

        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Frozen Test', ['Data']);
        wb.Worksheets[0].LiveTables = [
            {
                TableID: 'lt-1',
                Title: 'Users Table',
                SourceType: 'EntityView',
                EntityName: 'MJ: Users',
                AnchorCell: 'A1',
                IncludeHeaders: true,
                Mode: 'Frozen',
            },
        ];

        const provider = {} as IMetadataProvider;
        const result = await action.RefreshArtifactPayload({
            artifactId,
            content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
            driverClass: 'SpreadsheetArtifactViewerPlugin',
            contextUser: user,
            provider,
            freezeRefreshedBlocks: true,
            forceRefreshFrozen: true,
        });

        expect(refreshTablesSpy).toHaveBeenCalledWith(
            expect.anything(),
            user,
            provider,
            expect.objectContaining({ ForceRefreshFrozen: true }),
        );
        expect(result.signedFrozenBlocksCount).toBe(1);
        const parsedOut = SpreadsheetEngine.Instance.ParseWorkbook(result.updatedContent);
        expect(parsedOut.Worksheets[0].LiveTables?.[0]?.Mode).toBe('Frozen');
        expect(parsedOut.Worksheets[0].LiveTables?.[0]?.FrozenSnapshot?.SnapshotContentHash).toMatch(
            /^hmac-sha256:[a-f0-9]{64}$/,
        );
    });

    it('emits VersionID, ArtifactName, ArtifactTypeName, and DriverClass on NO_CHANGES', async () => {
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactId,
            UserID: user.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });
        vi.spyOn(GovernedArtifactService.Instance, 'ResolveArtifactType').mockResolvedValue({
            ID: 'type-sheet',
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        } as MJArtifactTypeEntity);
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Unchanged KPIs', ['KPIs']);
        SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'A1', { Value: 'Static' }, false);
        const rawJson = SpreadsheetEngine.Instance.SerializeWorkbook(wb);
        vi.spyOn(SpreadsheetEngine.Instance, 'EvaluateMjCustomFunctions').mockResolvedValue({
            EvaluatedCount: 0,
            AccessDeniedCount: 0,
        });

        const payloadRes = await action.RefreshArtifactPayload({
            artifactId,
            content: rawJson,
            driverClass: 'SpreadsheetArtifactViewerPlugin',
            contextUser: user,
            provider: {} as IMetadataProvider,
        });
        const baselineConfig = JSON.parse(payloadRes.updatedConfiguration) as { livingReportDigest: string };

        const mockProvider = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactId, Name: 'Unchanged KPIs', Type: 'Excel Spreadsheet', UserID: user.ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-1',
                                VersionNumber: 1,
                                Name: 'Unchanged KPIs',
                                ContentMode: 'Text',
                                Content: rawJson,
                                Configuration: JSON.stringify({ livingReportDigest: baselineConfig.livingReportDigest }),
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(mockProvider as ReturnType<typeof RunView.FromMetadataProvider>);

        const params: RunActionParams & { Provider?: IMetadataProvider } = {
            ContextUser: user,
            Provider: mockProvider as object as IMetadataProvider,
            Params: [{ Name: 'ArtifactID', Type: 'Input', Value: artifactId }],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        };
        const res = await action.ExecuteRefreshAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('NO_CHANGES');
        expect(params.Params.find((p) => p.Name === 'VersionID')?.Value).toBe('ver-1');
        expect(params.Params.find((p) => p.Name === 'ArtifactName')?.Value).toBe('Unchanged KPIs');
        expect(params.Params.find((p) => p.Name === 'ArtifactTypeName')?.Value).toBe('Excel Spreadsheet');
        expect(params.Params.find((p) => p.Name === 'DriverClass')?.Value).toBe('SpreadsheetArtifactViewerPlugin');
        expect(params.Params.find((p) => p.Name === 'Changed')?.Value).toBe(false);
    });
});
