import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';

interface MockSavedRecord {
    EntityName: string;
    Fields: Record<string, string | number | boolean | null>;
}

const ART_DOC_ID = '11111111-1111-4111-8111-111111111111';
const ART_SHEET_ID = '22222222-2222-4222-8222-222222222222';
const ART_SECRET_ID = '99999999-9999-4999-8999-999999999999';
const COL_EDIT_ID = '33333333-3333-4333-8333-333333333333';
const COL_READONLY_ID = '44444444-4444-4444-8444-444444444444';
const ENV_ID = '55555555-5555-4555-8555-555555555555';
const TYPE_PRES_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';

describe('ArtifactToolManager Multi-Artifact Synthesis Tools', () => {
    let manager: ArtifactToolManager;
    let savedRecords: MockSavedRecord[];
    let mockUser: UserInfo;
    let mockProvider: IMetadataProvider;

    function buildWorkbookJson(): string {
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('ARR Workbook');
        const ws = wb.Worksheets[0];
        SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', { Value: 'Quarter' });
        SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B1', { Value: 'Revenue' });
        SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A2', { Value: 'Q1' });
        SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B2', { Value: 450000 });
        ws.Charts = [
            {
                ChartID: 'chart-rev',
                Title: 'Revenue Growth',
                ChartType: 'bar',
                SheetID: ws.SheetID,
                SourceRange: 'A1:B2',
                PositionCell: 'D2',
            },
        ];
        return SpreadsheetEngine.Instance.SerializeWorkbook(wb);
    }

    beforeEach(() => {
        manager = new ArtifactToolManager();
        savedRecords = [];
        mockUser = { ID: USER_ID, Name: 'Test Architect', Email: 'architect@example.com' } as UserInfo;

        const artTypeStub = {
            ID: TYPE_PRES_ID,
            Name: 'Presentation',
            DriverClass: 'SlideDeckArtifactViewerPlugin',
            IsEnabled: true,
            Configuration: JSON.stringify({ Thumbnail: { Enabled: true, Mode: 'Rendered' } }),
        };
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockImplementation((name: string) => {
            if (name === 'Presentation') {
                return artTypeStub as never;
            }
            return undefined;
        });

        let seqCounter = 1;
        mockProvider = {
            Entities: [],
            GetEntityObject: vi.fn(async (entityName: string) => {
                const backing: Record<string, string | number | boolean | null> = {};
                const generatedId = `aaaaaaaa-0000-4000-8000-${String(seqCounter++).padStart(12, '0')}`;
                const proxy = new Proxy(
                    {
                        NewRecord: () => {
                            backing['ID'] = generatedId;
                        },
                        Save: async () => {
                            savedRecords.push({ EntityName: entityName, Fields: { ...backing } });
                            return true;
                        },
                        Delete: async () => true,
                        LatestResult: null,
                    } as Record<string, unknown>,
                    {
                        get(target, prop: string) {
                            if (prop in target) return target[prop];
                            return backing[prop];
                        },
                        set(_target, prop: string, val: unknown) {
                            backing[prop] = (val as string | number | boolean | null) ?? null;
                            return true;
                        },
                    },
                );
                return proxy as never;
            }),
        } as unknown as IMetadataProvider;

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_provider, artifactId) => {
                if (artifactId === ART_SECRET_ID) {
                    return {
                        ArtifactID: artifactId,
                        CanRead: false,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        Source: 'Denied',
                    };
                }
                return {
                    ArtifactID: artifactId ?? '',
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: false,
                    CanShare: false,
                    Source: 'Owner',
                };
            },
        );

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
                const filter = params.ExtraFilter ?? '';
                if (params.EntityName === 'MJ: Collections') {
                    if (filter.includes(COL_EDIT_ID)) {
                        return {
                            Success: true,
                            Results: [{ ID: COL_EDIT_ID, OwnerID: USER_ID, EnvironmentID: ENV_ID }],
                        };
                    }
                    if (filter.includes(COL_READONLY_ID)) {
                        return {
                            Success: true,
                            Results: [{ ID: COL_READONLY_ID, OwnerID: 'other-user-id', EnvironmentID: ENV_ID }],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return { Success: true, Results: [{ CanRead: true, CanEdit: false }] };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    if (filter.includes(ART_SHEET_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: ART_SHEET_ID,
                                    Name: 'Q1 Revenue',
                                    Description: 'Revenue sheet',
                                    EnvironmentID: ENV_ID,
                                    Type: 'Excel Spreadsheet',
                                },
                            ],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ver-sheet-1',
                                VersionNumber: 2,
                                ContentMode: 'Text',
                                Content: buildWorkbookJson(),
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as never);

        manager.Initialize(
            [
                {
                    name: 'Q1 Narrative',
                    typeName: 'Markdown Document',
                    artifactId: ART_DOC_ID,
                    versionNumber: 1,
                    content: '# Q1 Narrative\n\nCustomer retention reached 98%.',
                },
                {
                    name: 'Q1 Revenue',
                    typeName: 'Excel Spreadsheet',
                    artifactId: ART_SHEET_ID,
                    versionNumber: 2,
                    content: buildWorkbookJson(),
                },
                {
                    name: 'Confidential Comp',
                    typeName: 'Markdown Document',
                    artifactId: ART_SECRET_ID,
                    versionNumber: 1,
                    content: '# Secret\n\nTop-secret numbers',
                },
            ],
            {
                contextUser: mockUser,
                provider: mockProvider,
                agentRunId: 'run-synth-1',
                agentName: 'Executive Synthesizer',
            },
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('advertises list_workspace_artifacts and create_synthesized_artifact tools', () => {
        const names = manager.GetAvailableToolNames();
        expect(names).toContain('list_workspace_artifacts');
        expect(names).toContain('create_synthesized_artifact');

        const docs = manager.GetToolDocumentation();
        expect(docs).toContain('list_workspace_artifacts');
        expect(docs).toContain('create_synthesized_artifact');
    });

    it('list_workspace_artifacts excludes unreadable artifacts and surfaces spreadsheet charts', async () => {
        const res = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'list_workspace_artifacts',
            input: {},
        });
        expect(res.result.success).toBe(true);
        const data = res.result.data as {
            count: number;
            artifacts: Array<{ artifactId: string; embeddedCharts: Array<{ ChartID: string }> }>;
        };
        expect(data.count).toBe(2);
        const ids = data.artifacts.map((a) => a.artifactId);
        expect(ids).toContain(ART_DOC_ID);
        expect(ids).toContain(ART_SHEET_ID);
        expect(ids).not.toContain(ART_SECRET_ID);
        const sheetItem = data.artifacts.find((a) => a.artifactId === ART_SHEET_ID);
        expect(sheetItem?.embeddedCharts).toHaveLength(1);
        expect(sheetItem?.embeddedCharts[0].ChartID).toBe('chart-rev');
    });

    it('fails closed when requesting an unauthorized source artifact or read-only collection', async () => {
        const deniedSource = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'create_synthesized_artifact',
            input: {
                title: 'Unauthorized Deck',
                targetKind: 'presentation',
                sourceArtifactIds: [ART_DOC_ID, ART_SECRET_ID],
            },
        });
        expect(deniedSource.result.success).toBe(false);
        expect(deniedSource.result.errorMessage).toContain('Permission denied');
        expect(savedRecords).toHaveLength(0);

        const deniedCollection = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'create_synthesized_artifact',
            input: {
                title: 'Collection Violation',
                targetKind: 'presentation',
                sourceArtifactIds: ['A'],
                collectionId: COL_READONLY_ID,
            },
        });
        expect(deniedCollection.result.success).toBe(false);
        expect(deniedCollection.result.errorMessage).toContain('Edit access');
        expect(savedRecords).toHaveLength(0);
    });

    it('persists synthesized Presentation with sanitized Live chart block, policy preview, collection link, and alphaId registration', async () => {
        const rawSlideContent = JSON.stringify({
            title: 'Board Q1 Synthesis',
            description: 'Combined ARR + Retention view',
            slides: [
                {
                    Layout: 'ChartAndText',
                    Title: 'ARR Performance',
                    Regions: [
                        {
                            RegionID: 'chart',
                            Label: 'ARR Chart',
                            Kind: 'mj-block',
                            BlockSpec: {
                                BlockID: 'blk-chart',
                                Kind: 'Artifact',
                                Mode: 'Frozen',
                                ArtifactID: ART_SHEET_ID,
                                SheetChartID: 'chart-rev',
                                Title: 'Revenue Growth',
                            },
                        },
                        {
                            RegionID: 'spoof',
                            Label: 'Spoofed Secret',
                            Kind: 'mj-block',
                            BlockSpec: {
                                BlockID: 'blk-spoof',
                                Kind: 'Artifact',
                                Mode: 'Live',
                                ArtifactID: ART_SECRET_ID,
                                Title: 'Secret Data',
                            },
                        },
                    ],
                },
            ],
        });

        const res = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'create_synthesized_artifact',
            input: {
                title: 'Board Q1 Synthesis',
                targetKind: 'presentation',
                sourceArtifactIds: ['A', 'B'],
                content: rawSlideContent,
                collectionId: COL_EDIT_ID,
            },
        });

        expect(res.result.success).toBe(true);
        const data = res.result.data as {
            alphaId: string;
            artifactId: string;
            versionId: string;
            artifactTypeName: string;
            linkedChartCount: number;
            sourceCount: number;
            persisted: boolean;
            warnings: string[];
        };
        expect(data.persisted).toBe(true);
        expect(data.alphaId).toBe('D');
        expect(data.artifactTypeName).toBe('Presentation');
        expect(data.linkedChartCount).toBe(1);
        expect(data.sourceCount).toBe(2);
        expect(data.warnings.some((w) => w.includes(ART_SECRET_ID))).toBe(true);

        const artifactSave = savedRecords.find((r) => r.EntityName === 'MJ: Artifacts');
        const versionSave = savedRecords.find((r) => r.EntityName === 'MJ: Artifact Versions');
        const colLinkSave = savedRecords.find((r) => r.EntityName === 'MJ: Collection Artifacts');
        expect(artifactSave?.Fields['Name']).toBe('Board Q1 Synthesis');
        expect(artifactSave?.Fields['EnvironmentID']).toBe(ENV_ID);
        expect(versionSave?.Fields['VersionNumber']).toBe(1);
        expect(String(versionSave?.Fields['Content'])).not.toContain(ART_SECRET_ID);
        expect(String(versionSave?.Fields['Configuration'])).toContain('previewSnapshot');
        expect(colLinkSave?.Fields['CollectionID']).toBe(COL_EDIT_ID);
        expect(colLinkSave?.Fields['ArtifactVersionID']).toBe(versionSave?.Fields['ID']);
    });
});
