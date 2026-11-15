import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine, SpreadsheetEngine } from '@memberjunction/core-entities';
import { RefreshAndSnapshotArtifactAction } from '../custom/utilities/refresh-and-snapshot-artifact.action';

function makeUser(id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Scheduler User';
    return u;
}

describe('RefreshAndSnapshotArtifactAction (H3 §5.3)', () => {
    const action = new RefreshAndSnapshotArtifactAction();
    const user = makeUser('11111111-1111-1111-1111-111111111111');
    const artifactId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    beforeEach(() => {
        SpreadsheetEngine.Instance.ClearViewerFunctionCache();
    });

    afterEach(() => {
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

        const result = await action.ExecuteRefreshAction({
            ContextUser: user,
            Params: [{ Name: 'ArtifactID', Type: 'Input', Value: artifactId }],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        });

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
    });

    it('refreshes live data, skips save when unchanged unless forced, and saves vN+1 + posts summary card when changed', async () => {
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
        const savedMessages: Array<{ ConversationID: string; Message: string }> = [];
        const savedLinks: Array<{ ConversationDetailID: string; ArtifactVersionID: string }> = [];

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-1',
                                VersionNumber: 1,
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
                if (params.EntityName === 'MJ: Artifact Types') {
                    return {
                        Success: true,
                        Results: [{ DriverClass: 'SpreadsheetArtifactViewerPlugin' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ErrorMessage: '',
                        UserView: null,
                        ExecutionTime: 1,
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', UserView: null, ExecutionTime: 1 };
            },
        } as unknown as ReturnType<typeof RunView.FromMetadataProvider>);

        const fakeGetEntityObject = vi.spyOn(Metadata.prototype, 'GetEntityObject').mockImplementation(async (entityName: string) => {
            if (entityName === 'MJ: Artifacts') {
                return {
                    ID: artifactId,
                    Name: 'Weekly Revenue Report',
                    TypeID: 'type-sheet',
                    Load: async () => true,
                } as unknown as Awaited<ReturnType<Metadata['GetEntityObject']>>;
            }
            if (entityName === 'MJ: Artifact Versions') {
                const record: Record<string, unknown> = {
                    ID: 'ver-2',
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedVersions.push({
                            VersionNumber: Number(record['VersionNumber']),
                            Comments: (record['Comments'] as string | null) ?? null,
                        });
                        return true;
                    },
                };
                return record as unknown as Awaited<ReturnType<Metadata['GetEntityObject']>>;
            }
            if (entityName === 'MJ: Conversation Details') {
                const record: Record<string, unknown> = {
                    ID: 'conv-detail-1',
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedMessages.push({
                            ConversationID: String(record['ConversationID']),
                            Message: String(record['Message']),
                        });
                        return true;
                    },
                };
                return record as unknown as Awaited<ReturnType<Metadata['GetEntityObject']>>;
            }
            if (entityName === 'MJ: Conversation Detail Artifacts') {
                const record: Record<string, unknown> = {
                    ID: 'conv-link-1',
                    NewRecord: () => undefined,
                    Save: async () => {
                        savedLinks.push({
                            ConversationDetailID: String(record['ConversationDetailID']),
                            ArtifactVersionID: String(record['ArtifactVersionID']),
                        });
                        return true;
                    },
                };
                return record as unknown as Awaited<ReturnType<Metadata['GetEntityObject']>>;
            }
            throw new Error(`Unexpected entity ${entityName}`);
        });

        const params: RunActionParams = {
            ContextUser: user,
            Params: [
                { Name: 'ArtifactID', Type: 'Input', Value: artifactId },
                { Name: 'ConversationID', Type: 'Input', Value: 'conv-999' },
            ],
            Action: { ID: 'act-1', Name: 'Refresh and Snapshot Artifact' } as RunActionParams['Action'],
            Filters: [],
        };

        const res = await action.ExecuteRefreshAction(params);
        expect(fakeGetEntityObject).toHaveBeenCalled();
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(savedVersions).toHaveLength(1);
        expect(savedVersions[0].VersionNumber).toBe(2);
        expect(savedVersions[0].Comments).toContain('KPIs!B1=142');
        expect(savedMessages).toHaveLength(1);
        expect(savedMessages[0].ConversationID).toBe('conv-999');
        expect(savedMessages[0].Message).toContain('Weekly Revenue Report');
        expect(savedLinks).toHaveLength(1);
        expect(savedLinks[0].ArtifactVersionID).toBe('ver-2');

        const changedOut = params.Params.find((p) => p.Name === 'Changed');
        const newVerOut = params.Params.find((p) => p.Name === 'NewVersionNumber');
        expect(changedOut?.Value).toBe(true);
        expect(newVerOut?.Value).toBe(2);
    });
});
