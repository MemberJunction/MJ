import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    ParseArtifactVersionConfiguration,
    type MJArtifactTypeEntity,
    type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { ArtifactCollaborationServer } from '../collaboration/ArtifactCollaborationServer.js';

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] },
    },
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null),
}));

const DOC_TYPE_ID = 'aaaa1111-1111-4111-8111-111111111111';
const SHEET_TYPE_ID = 'aaaa2222-2222-4222-8222-222222222222';
const DATA_TYPE_ID = 'aaaa3333-3333-4333-8333-333333333333';

const DOC_ART_ID = 'bbbb1111-1111-4111-8111-111111111111';
const SHEET_ART_ID = 'bbbb2222-2222-4222-8222-222222222222';
const DATA_ART_ID = 'bbbb3333-3333-4333-8333-333333333333';

const TEST_USER = {
    ID: 'cccc1111-1111-4111-8111-111111111111',
    Name: 'Test Author',
    Email: 'author@example.com',
    IsActive: true,
} as UserInfo;

describe('MJServer Artifact Thumbnail Policy Enforcement', () => {
    const savedVersions: Array<Record<string, unknown>> = [];
    const workingStates = new Map<string, Record<string, unknown>>();
    let resolvePermsSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artConfigSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artTypesSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(async () => {
        savedVersions.length = 0;
        workingStates.clear();
        const artifactsById = new Map<string, string>([
            [DOC_ART_ID, DOC_TYPE_ID],
            [SHEET_ART_ID, SHEET_TYPE_ID],
            [DATA_ART_ID, DATA_TYPE_ID],
        ]);
        const mockTypes: MJArtifactTypeEntity[] = [
            {
                ID: DOC_TYPE_ID,
                Name: 'Markdown Document',
                DriverClass: 'MarkdownArtifactViewerPlugin',
                ConfigurationObject: {
                    Thumbnail: { Enabled: true, Mode: 'Rendered', MaskLiveDataBlocks: true },
                },
            } as unknown as MJArtifactTypeEntity,
            {
                ID: SHEET_TYPE_ID,
                Name: 'Excel Spreadsheet',
                DriverClass: 'SpreadsheetArtifactViewerPlugin',
                ConfigurationObject: {
                    Thumbnail: { Enabled: true, Mode: 'Structural', MaskLiveDataBlocks: true },
                },
            } as unknown as MJArtifactTypeEntity,
            {
                ID: DATA_TYPE_ID,
                Name: 'Data',
                DriverClass: 'DataArtifactViewerPlugin',
                ConfigurationObject: {
                    Thumbnail: { Enabled: false, Mode: 'Icon' },
                },
            } as unknown as MJArtifactTypeEntity,
        ];

        const makeEntityProxy = (entityName: string) => {
            const fields: Record<string, unknown> = {
                ID: entityName === 'MJ: Artifact Versions'
                    ? `ver-${savedVersions.length + 1}`
                    : `ws-${workingStates.size + 1}`,
                IsSaved: false,
            };
            return new Proxy(fields, {
                get(target, prop) {
                    if (prop === 'NewRecord') return () => true;
                    if (prop === 'Load') return async () => true;
                    if (prop === 'LoadFromData') {
                        return async (data: Record<string, unknown>) => {
                            Object.assign(target, data);
                            return true;
                        };
                    }
                    if (prop === 'Save') {
                        return async () => {
                            target['IsSaved'] = true;
                            if (entityName === 'MJ: Artifact Versions') {
                                savedVersions.push({ ...target });
                            } else if (entityName === 'MJ: Artifact Working States') {
                                workingStates.set(String(target['ArtifactID'] ?? ''), { ...target });
                            }
                            return true;
                        };
                    }
                    if (prop === 'GetAll') return () => ({ ...target });
                    return target[prop as string];
                },
                set(target, prop, value) {
                    target[prop as string] = value;
                    return true;
                },
            }) as unknown as MJArtifactVersionEntity;
        };

        const runViewFn = async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: Artifacts') {
                const match = params.ExtraFilter?.match(/'([^']+)'/);
                const id = match?.[1]?.toLowerCase() ?? '';
                const typeId = artifactsById.get(id);
                return {
                    Success: true,
                    Results: typeId ? [{ ID: id, TypeID: typeId }] : [],
                    TotalRowCount: typeId ? 1 : 0,
                };
            }
            if (params.EntityName === 'MJ: Artifact Working States') {
                const match = params.ExtraFilter?.match(/\bArtifactID='([^']+)'/i);
                const artId = match?.[1]?.toLowerCase() ?? '';
                const existing = workingStates.get(artId);
                return {
                    Success: true,
                    Results: existing ? [existing] : [],
                    TotalRowCount: existing ? 1 : 0,
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'v1-id',
                            VersionNumber: 1,
                            Name: 'Doc V1',
                            Content: 'Initial v1 content',
                            Configuration: JSON.stringify({
                                preserveKey: 'yes',
                                previewSnapshot: { Kind: 'doc', Heading: 'Old', Excerpt: 'Old' },
                                thumbnailDataUrl: 'data:image/png;base64,OLD',
                            }),
                            ContentHash: 'oldhash',
                        },
                    ],
                    TotalRowCount: 1,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        };

        const mockProvider = {
            Entities: [],
            GetEntityObject: async (entityName: string) => makeEntityProxy(entityName),
            RunView: runViewFn,
            RunViews: async (paramsArray: Array<{ EntityName: string; ExtraFilter?: string }>) =>
                Promise.all(paramsArray.map((p) => runViewFn(p))),
        } as unknown as IMetadataProvider & IRunViewProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            mockProvider as unknown as ReturnType<typeof RunView.FromMetadataProvider>,
        );

        resolvePermsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockImplementation(async (_provider, artId) => ({
                ArtifactID: artId,
                CanRead: true,
                CanEdit: true,
                CanShare: true,
                CanDelete: true,
                Source: 'DirectShare',
                Reason: 'Allowed in test',
            }));
        artConfigSpy = vi
            .spyOn(ArtifactMetadataEngine.Instance, 'Config')
            .mockResolvedValue(undefined);
        artTypesSpy = vi
            .spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get')
            .mockReturnValue(mockTypes);

        const server = ArtifactCollaborationServer.Instance;
        await server.Shutdown();
        (server as unknown as { _shuttingDown: boolean })._shuttingDown = false;
        server.SetMetadataProviderOverride(mockProvider);
    });

    afterEach(async () => {
        resolvePermsSpy?.mockRestore();
        artConfigSpy?.mockRestore();
        artTypesSpy?.mockRestore();
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        vi.restoreAllMocks();
    });

    it('persists validated client Rendered screenshot while stripping Structural and Icon thumbnails on server', async () => {
        const validCapture = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

        // 1. Rendered type accepts valid captured WebP screenshot
        const docSave = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            DOC_ART_ID,
            '# Updated Heading\n\nNew rendered body text.',
            TEST_USER,
            true,
            undefined,
            { capturedThumbnailDataUrl: validCapture },
        );
        expect(docSave.Success).toBe(true);
        const docVer = savedVersions[savedVersions.length - 1];
        const docCfg = ParseArtifactVersionConfiguration(docVer['Configuration'] as string);
        expect(docCfg?.thumbnailDataUrl).toBe(validCapture);

        // 2. Structural type rejects spoofed captured screenshot & strips prior snapshot/thumbnail while keeping unrelated keys
        const sheetSave = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            SHEET_ART_ID,
            JSON.stringify({
                Worksheets: [{ SheetID: 's1', Name: 'Sheet1', Cells: { A1: { RawValue: 'Salary' } } }],
            }),
            TEST_USER,
            true,
            undefined,
            { capturedThumbnailDataUrl: validCapture },
        );
        expect(sheetSave.Success).toBe(true);
        const sheetVer = savedVersions[savedVersions.length - 1];
        const sheetCfg = ParseArtifactVersionConfiguration(sheetVer['Configuration'] as string);
        expect(sheetCfg?.thumbnailDataUrl).toBeUndefined();
        expect(sheetCfg?.previewSnapshot).toBeUndefined();

        // 3. Icon type rejects spoofed captured screenshot & strips prior snapshot/thumbnail
        const dataSave = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            DATA_ART_ID,
            'SELECT * FROM Users',
            TEST_USER,
            true,
            undefined,
            { capturedThumbnailDataUrl: validCapture },
        );
        expect(dataSave.Success).toBe(true);
        const dataVer = savedVersions[savedVersions.length - 1];
        const dataCfg = ParseArtifactVersionConfiguration(dataVer['Configuration'] as string);
        expect(dataCfg?.thumbnailDataUrl).toBeUndefined();
        expect(dataCfg?.previewSnapshot).toBeUndefined();
        expect(dataCfg?.preserveKey).toBe('yes');
    });
});
