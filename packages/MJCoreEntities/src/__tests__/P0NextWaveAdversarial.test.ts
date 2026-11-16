import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, RunView, UserInfo, type RunViewResult } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '../custom/ArtifactPermissionDelegate';
import {
    BuildArtifactPreviewSnapshot,
    MergeArtifactVersionPreviewConfig,
    type ArtifactPreviewSnapshot,
} from '../custom/ArtifactPreviewSnapshot';
import { ArtifactSynthesisEngine } from '../custom/ArtifactSynthesisEngine';
import {
    ComputeFrozenSnapshotHash,
    DocumentLiveBlockEngine,
    ValidateFrozenBlockSnapshot,
} from '../custom/DocumentLiveBlockEngine';
import { SlideDeckEngine } from '../custom/SlideDeckEngine';
import {
    ExportDeckToPptxBytesInternal,
    ImportDeckFromPptxBytesInternal,
} from '../custom/SlideDeckPptxEngine';
import {
    LoadSpreadsheetEngine,
    SpreadsheetEngine,
    type SpreadsheetCellEditContext,
} from '../custom/SpreadsheetEngine';

const mockNetworkProvider = {
    ProviderType: 'Network',
    Entities: [],
} as typeof Metadata.Provider;

function makeUser(id: string, name = 'Test User'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.com`;
    return u;
}

const UUID_OWNER = '10000000-0000-4000-8000-000000000010';
const UUID_GRANTEE = '10000000-0000-4000-8000-000000000020';
const UUID_ART = '20000000-0000-4000-8000-000000000010';
const UUID_CHILD_ART = '20000000-0000-4000-8000-000000000011';
const UUID_COLL = '30000000-0000-4000-8000-000000000010';
const UUID_PARENT_COLL = '30000000-0000-4000-8000-000000000011';
const UUID_ART_ENTITY = '40000000-0000-4000-8000-000000000099';

const TEST_SIGNING_SECRET = 'adversarial-test-hmac-secret-at-least-32-bytes!';

describe('P0 Next-Wave Adversarial Regression Suite (NW-2, P0-R5, P0-R6)', () => {
    beforeEach(() => {
        LoadSpreadsheetEngine();
        DocumentLiveBlockEngine.Instance.SetSigningSecret(TEST_SIGNING_SECRET);
        DocumentLiveBlockEngine.Instance.RegisterArtifactFileBytesLoader(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        DocumentLiveBlockEngine.Instance.SetSigningSecret(TEST_SIGNING_SECRET);
        DocumentLiveBlockEngine.Instance.RegisterArtifactFileBytesLoader(null);
    });

    // -----------------------------------------------------------------------
    // NW-2: ArtifactPermissionDelegate union & delegated child readable IDs
    // -----------------------------------------------------------------------

    it('NW-2: ArtifactPermissionDelegate unions direct read-only share with higher collection-ancestry grants', async () => {
        const grantee = makeUser(UUID_GRANTEE, 'Grantee');
        const rv = new RunView();
        vi.spyOn(rv, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ID: 'ap-ro', CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [{ ID: 'ver-art-1', ArtifactID: UUID_ART }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return {
                    Success: true,
                    Results: [{ CollectionID: UUID_COLL, ArtifactVersionID: 'ver-art-1' }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            if (params.EntityName === 'MJ: Collections') {
                const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                if (filterStr.includes(UUID_COLL)) {
                    return {
                        Success: true,
                        Results: [{ ID: UUID_COLL, OwnerID: UUID_OWNER, ParentID: UUID_PARENT_COLL }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        UserView: null,
                        ErrorMessage: '',
                        ExecutionTime: 1,
                    };
                }
                if (filterStr.includes(UUID_PARENT_COLL)) {
                    return {
                        Success: true,
                        Results: [{ ID: UUID_PARENT_COLL, OwnerID: UUID_OWNER, ParentID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        UserView: null,
                        ErrorMessage: '',
                        ExecutionTime: 1,
                    };
                }
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [
                        {
                            CollectionID: UUID_PARENT_COLL,
                            CanRead: true,
                            CanEdit: true,
                            CanDelete: true,
                            CanShare: false,
                        },
                    ],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                UserView: null,
                ErrorMessage: '',
                ExecutionTime: 1,
            };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv);

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            mockNetworkProvider,
            UUID_ART,
            grantee
        );
        expect(perms.CanRead).toBe(true);
        expect(perms.CanEdit).toBe(true);
        expect(perms.CanDelete).toBe(true);
        expect(perms.CanShare).toBe(false);
    });

    it('NW-2: BuildReadableArtifactIdSet includes delegated child artifacts targeting MJ: Artifacts', async () => {
        const grantee = makeUser(UUID_GRANTEE, 'Grantee');
        const rv = new RunView();
        vi.spyOn(rv, 'RunView').mockImplementation(async (params) => {
            const filterStr = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            if (params.EntityName === 'MJ: Artifacts') {
                if (filterStr.includes(`DelegateEntityID='${UUID_ART_ENTITY}'`)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: UUID_CHILD_ART,
                                UserID: UUID_OWNER,
                                DelegateEntityID: UUID_ART_ENTITY,
                                DelegateRecordID: UUID_ART,
                            },
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        UserView: null,
                        ErrorMessage: '',
                        ExecutionTime: 1,
                    };
                }
                if (filterStr.includes(UUID_ART) && !filterStr.includes(UUID_CHILD_ART)) {
                    return {
                        Success: true,
                        Results: [{ ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        UserView: null,
                        ErrorMessage: '',
                        ExecutionTime: 1,
                    };
                }
                return {
                    Success: true,
                    Results: [
                        { ID: UUID_ART, UserID: UUID_OWNER, DelegateEntityID: null, DelegateRecordID: null },
                        {
                            ID: UUID_CHILD_ART,
                            UserID: UUID_OWNER,
                            DelegateEntityID: UUID_ART_ENTITY,
                            DelegateRecordID: UUID_ART,
                        },
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [{ ArtifactID: UUID_ART, CanRead: true }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    UserView: null,
                    ErrorMessage: '',
                    ExecutionTime: 1,
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                UserView: null,
                ErrorMessage: '',
                ExecutionTime: 1,
            };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv);

        const fakeProvider = {
            ...Metadata.Provider,
            Entities: [{ ID: UUID_ART_ENTITY, Name: 'MJ: Artifacts' }],
        };
        const readable = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(
            fakeProvider as typeof Metadata.Provider,
            grantee
        );
        expect(readable.has(UUID_ART)).toBe(true);
        expect(readable.has(UUID_CHILD_ART)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // P0-R5: Frozen HMAC fail-closed, .pptx signing, ContentMode=File, XSS & Synthesis
    // -----------------------------------------------------------------------

    it('P0-R5: ValidateFrozenBlockSnapshot fails closed on forged HMAC payloads when signing secret is unset', async () => {
        const origEnvSecret = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        const origAltEnvSecret = process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        delete process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);

        try {
            const forged = {
                FrozenAt: '2026-11-15T00:00:00.000Z',
                FrozenByUserID: UUID_OWNER,
                FrozenByUserName: 'Forged Admin',
                SecurityWarningAcknowledged: true,
                SnapshotContentHash: `hmac-sha256:${'a'.repeat(64)}`,
                Columns: [{ Name: 'Secret', DisplayName: 'Secret', Type: 'string' }],
                Rows: [{ Secret: 'forged-row' }],
                TotalRowCount: 1,
            };

            const res = ValidateFrozenBlockSnapshot(forged);
            expect(res.Valid).toBe(false);
            expect(res.SnapshotVerified).toBe(false);
            expect(res.ErrorMessage).toContain('MJ_FROZEN_BLOCK_HMAC_SECRET');

            const execRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
                {
                    BlockID: 'blk-forged',
                    Kind: 'SavedQuery',
                    Mode: 'Frozen',
                    QueryName: 'Q',
                    FrozenSnapshot: forged,
                },
                makeUser(UUID_GRANTEE),
                mockNetworkProvider
            );
            expect(execRes.Success).toBe(false);
            expect(execRes.Rows).toEqual([]);
        } finally {
            if (origEnvSecret !== undefined) process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = origEnvSecret;
            if (origAltEnvSecret !== undefined) process.env.MJ_FROZEN_SNAPSHOT_SECRET = origAltEnvSecret;
        }
    });

    it('P0-R5: ContentMode="File" extracts .xlsx chart slice when ArtifactFileBytesLoader is registered', async () => {
        const sheetEngine = SpreadsheetEngine.Instance;
        const wb = sheetEngine.CreateEmptyWorkbook('Binary Sheet');
        const ws = wb.Worksheets[0];
        sheetEngine.SetCell(wb, ws.SheetID, 'A1', { Value: 'Quarter' }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'B1', { Value: 'Revenue' }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'A2', { Value: 'Q1' }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'B2', { Value: 500 }, true);
        ws.Charts.push({
            ChartID: 'chart-file',
            Title: 'File Chart',
            ChartType: 'bar',
            SheetID: ws.SheetID,
            SourceRange: 'A1:B2',
            PositionCell: 'D1',
        });
        const xlsxBytes = sheetEngine.ExportToXlsxBytes(wb);

        DocumentLiveBlockEngine.Instance.RegisterArtifactFileBytesLoader(async (fileId) =>
            fileId === 'file-xlsx-1' ? xlsxBytes : null
        );

        const rv = new RunView();
        vi.spyOn(rv, 'RunViews').mockResolvedValue([
            {
                Success: true,
                Results: [{ ID: UUID_ART, Name: 'Financials.xlsx', Type: 'Excel Spreadsheet' }],
                RowCount: 1,
                TotalRowCount: 1,
                ErrorMessage: '',
                ExecutionTime: 1,
            },
            {
                Success: true,
                Results: [
                    {
                        ID: 'ver-file-1',
                        ArtifactID: UUID_ART,
                        VersionNumber: 1,
                        ContentMode: 'File',
                        FileID: 'file-xlsx-1',
                        Content: null,
                        Configuration: null,
                    },
                ],
                RowCount: 1,
                TotalRowCount: 1,
                ErrorMessage: '',
                ExecutionTime: 1,
            },
        ] as [RunViewResult<Record<string, string>>, RunViewResult<Record<string, string | number | null>>]);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: UUID_ART,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
            Reason: 'Owner',
        });

        const execRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
            {
                BlockID: 'blk-xlsx-slice',
                Kind: 'Artifact',
                Mode: 'Live',
                ArtifactID: UUID_ART,
                SheetID: ws.SheetID,
                SheetChartID: 'chart-file',
            },
            makeUser(UUID_OWNER),
            mockNetworkProvider
        );
        expect(execRes.Success).toBe(true);
        expect(execRes.Rows).toEqual([{ Quarter: 'Q1', Revenue: 500 }]);
    });

    it('P0-R5: PPTX export skips tampered FrozenSnapshot & PPTX import signs when secret set or downgrades when unset', () => {
        const slideEngine = SlideDeckEngine.Instance;
        let deck = slideEngine.CreateDefaultDeck('PPTX Security');
        deck = slideEngine.UpsertSlideRegion(deck, deck.Slides[0].SlideID, {
            RegionID: 'r-tampered-chart',
            Kind: 'mj-block',
            Label: 'Tampered Chart',
            MarkdownContent: '',
            BlockSpec: {
                BlockID: 'blk-tampered',
                Kind: 'SavedQuery',
                Mode: 'Frozen',
                Title: 'Tampered',
                QueryName: 'Q',
                DisplayMode: 'chart',
                ChartType: 'bar',
                FrozenSnapshot: {
                    FrozenAt: '2026-11-01T00:00:00Z',
                    FrozenByUserID: UUID_OWNER,
                    FrozenByUserName: 'Attacker',
                    SecurityWarningAcknowledged: true,
                    SnapshotContentHash: `hmac-sha256:${'f'.repeat(64)}`,
                    Columns: [{ Name: 'X', DisplayName: 'X', Type: 'string' }],
                    Rows: [{ X: 'EVIL_INJECTED_ROW' }],
                    TotalRowCount: 1,
                },
            },
        }).Deck;

        const exportedTampered = ExportDeckToPptxBytesInternal(deck);
        const exportedFiles = SpreadsheetEngine.Instance.ExtractZipArchive(exportedTampered);
        const slide1Xml = new TextDecoder().decode(exportedFiles.get('ppt/slides/slide1.xml') ?? new Uint8Array());
        expect(exportedFiles.has('ppt/charts/chart1.xml')).toBe(false);
        expect(slide1Xml).not.toContain('EVIL_INJECTED_ROW');

        // Valid signed chart exports cleanly and re-imports with verified HMAC when secret is configured
        const validSnap = {
            FrozenAt: '2026-11-01T00:00:00Z',
            FrozenByUserID: UUID_OWNER,
            FrozenByUserName: 'Alice',
            SecurityWarningAcknowledged: true,
            Binding: { BlockID: 'blk-valid', Kind: 'SavedQuery', SourceTargetID: 'Q' },
            Columns: [
                { Name: 'Label', DisplayName: 'Label', Type: 'string' },
                { Name: 'Val', DisplayName: 'Val', Type: 'number' },
            ],
            Rows: [{ Label: 'Q1', Val: 42 }],
            TotalRowCount: 1,
        };
        const validDeck = slideEngine.UpsertSlideRegion(slideEngine.CreateDefaultDeck('Valid PPTX'), 'slide-1', {
            RegionID: 'r-valid-chart',
            Kind: 'mj-block',
            Label: 'Valid Chart',
            MarkdownContent: '',
            BlockSpec: {
                BlockID: 'blk-valid',
                Kind: 'SavedQuery',
                Mode: 'Frozen',
                Title: 'Valid',
                QueryName: 'Q',
                DisplayMode: 'chart',
                ChartType: 'bar',
                FrozenSnapshot: {
                    ...validSnap,
                    SnapshotContentHash: ComputeFrozenSnapshotHash(validSnap),
                },
            },
        }).Deck;
        const validBytes = ExportDeckToPptxBytesInternal(validDeck);

        // Even with a signing secret configured, imported PPTX charts MUST NOT be forged into
        // HMAC-signed Mode:'Frozen' SavedQuery snapshots (`S3`) — always materialize static rich-text.
        const importedSigned = ImportDeckFromPptxBytesInternal(validBytes);
        const signedRegions = importedSigned.Slides.flatMap((s) => s.Regions);
        expect(signedRegions.some((r) => r.BlockSpec?.Mode === 'Frozen')).toBe(false);
        expect(signedRegions.some((r) => r.Kind === 'rich-text' && r.MarkdownContent.includes('| Q1 | 42 |'))).toBe(true);

        // With secret unset, imported chart likewise materializes static rich-text markdown
        const origEnv = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
        try {
            const importedNoSecret = ImportDeckFromPptxBytesInternal(validBytes);
            const downgraded = importedNoSecret.Slides.flatMap((s) => s.Regions);
            expect(downgraded.some((r) => r.BlockSpec?.Mode === 'Frozen')).toBe(false);
        } finally {
            if (origEnv !== undefined) process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = origEnv;
        }
    });

    it('P0-R5: MergeArtifactVersionPreviewConfig strips SVG XSS thumbnailDataUrl even when snapshot === null, and masks indirect sheet formulas', () => {
        const rawEvilConfig = JSON.stringify({
            customFlag: true,
            thumbnailDataUrl: 'data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        });
        const merged = MergeArtifactVersionPreviewConfig(rawEvilConfig, null, null, false);
        expect(merged).not.toBeNull();
        const parsed = JSON.parse(merged!) as Record<string, string | boolean | ArtifactPreviewSnapshot | undefined>;
        expect(parsed.customFlag).toBe(true);
        expect(parsed.thumbnailDataUrl).toBeUndefined();

        // Indirect formula referencing a live =MJ.VIEW cell must be masked as '•••' in preview snapshot
        const sheetEngine = SpreadsheetEngine.Instance;
        const wb = sheetEngine.CreateEmptyWorkbook('Indirect Leak');
        const ws = wb.Worksheets[0];
        sheetEngine.SetCell(wb, ws.SheetID, 'A1', { Formula: '=MJ.VIEW("Users")' }, false);
        ws.Cells['A1'].ComputedValue = 'TOP_SECRET_EMAIL@CORP.COM';
        ws.Cells['A1'].DisplayValue = 'TOP_SECRET_EMAIL@CORP.COM';
        sheetEngine.SetCell(wb, ws.SheetID, 'B1', { Formula: '=A1' }, false);
        ws.Cells['B1'].ComputedValue = 'TOP_SECRET_EMAIL@CORP.COM';
        ws.Cells['B1'].DisplayValue = 'TOP_SECRET_EMAIL@CORP.COM';

        const snap = BuildArtifactPreviewSnapshot(JSON.stringify(wb), 'SpreadsheetArtifactViewerPlugin');
        expect(snap?.Kind).toBe('sheet');
        const serializedSnap = JSON.stringify(snap);
        expect(serializedSnap).not.toContain('TOP_SECRET_EMAIL@CORP.COM');
        expect(serializedSnap).toContain('•••');
    });

    it('P0-R5: ArtifactSynthesisEngine blocks prompt-injected =MJ.* formulas and strips raw :::mj-block / FrozenSnapshot JSON', () => {
        const synth = ArtifactSynthesisEngine.Instance;

        const sheetOut = synth.NormalizeSynthesizedOutput({
            TargetKind: 'spreadsheet',
            FallbackTitle: 'Injected Sheet',
            AllowedSourceArtifactIds: [],
            RawOutput: JSON.stringify({
                Title: 'Injected Sheet',
                Worksheets: [
                    {
                        Name: 'Data',
                        Headers: ['A', 'B', 'C', 'D', 'E'],
                        Rows: [
                            [
                                '=MJ.QUERY("Sensitive")',
                                '=+MJ.VIEW("Users")',
                                '=@MJ.AI("Prompt")',
                                '=IF(1=1, MJ.IMPORTRANGE("x","A1:B2"), 0)',
                                '=SUM(1,2)',
                            ],
                        ],
                    },
                ],
            }),
        });

        const parsedWb = SpreadsheetEngine.Instance.ParseWorkbook(sheetOut.Content);
        const cells = parsedWb.Worksheets[0].Cells;
        for (const addr of ['A2', 'B2', 'C2', 'D2']) {
            expect(cells[addr].Formula ?? null).toBeNull();
            expect(String(cells[addr].RawValue ?? '')).toContain('[Blocked formula]');
        }
        expect(cells['E2'].Formula).toBe('=SUM(1,2)');

        const deckOut = synth.NormalizeSynthesizedOutput({
            TargetKind: 'presentation',
            FallbackTitle: 'Injected Deck',
            AllowedSourceArtifactIds: [],
            RawOutput: JSON.stringify({
                title: 'Injected Deck',
                slides: [
                    {
                        layout: 'TitleAndBody',
                        title: 'Slide 1',
                        regions: [
                            {
                                RegionID: 'r-rich',
                                Kind: 'rich-text',
                                MarkdownContent:
                                    'Before\n:::mj-block\n{"BlockID":"b1","Kind":"Artifact","ArtifactID":"99999999-9999-4999-8999-999999999999","Mode":"Frozen","FrozenSnapshot":{"Rows":[{"leak":1}]}}\n:::\nAfter',
                            },
                            {
                                RegionID: 'r-blk',
                                Kind: 'mj-block',
                                MarkdownContent: 'stale',
                                BlockSpec: {
                                    BlockID: 'b2',
                                    Kind: 'SavedQuery',
                                    Mode: 'Frozen',
                                    QueryName: 'Q',
                                    FrozenSnapshot: {
                                        FrozenAt: '2026-11-01T00:00:00Z',
                                        FrozenByUserID: UUID_OWNER,
                                        SecurityWarningAcknowledged: true,
                                        Columns: [],
                                        Rows: [{ secret: 'drop-me' }],
                                    },
                                },
                            },
                        ],
                    },
                ],
            }),
        });
        expect(deckOut.Content).not.toContain('99999999-9999-4999-8999-999999999999');
        expect(deckOut.Content).not.toContain('drop-me');
        expect(deckOut.Content).not.toContain('FrozenSnapshot');
    });

    // -----------------------------------------------------------------------
    // P0-R6: SpreadsheetEngine coupled spill #CYCLE!, ProtectedRanges locks, static spill preservation, CSV
    // -----------------------------------------------------------------------

    it('P0-R6: coupled dynamic-array spill ping-pong terminates cleanly with #CYCLE! instead of hanging', () => {
        const engine = SpreadsheetEngine.Instance;
        const wb = engine.CreateEmptyWorkbook('Coupled Spill PingPong');
        const ws = wb.Worksheets[0];

        engine.SetCell(wb, ws.SheetID, 'A1', { Formula: '=IF(B2=1,{0;0},{1;1})' }, false);
        engine.SetCell(wb, ws.SheetID, 'B1', { Formula: '=IF(A2=1,{1;1},{0;0})' }, false);

        const startedAt = Date.now();
        engine.EvaluateWorkbook(wb);
        const elapsedMs = Date.now() - startedAt;

        expect(elapsedMs).toBeLessThan(2000);
        expect([ws.Cells['A1']?.ComputedValue, ws.Cells['B1']?.ComputedValue]).toContain('#CYCLE!');
    });

    it('P0-R6: dynamic-array and =MJ.* spills refuse to overwrite ProtectedRanges on non-anchor destination cells', async () => {
        const engine = SpreadsheetEngine.Instance;
        const ownerCtx: SpreadsheetCellEditContext = { UserID: UUID_OWNER, IsEditor: true };
        const viewerCtx: SpreadsheetCellEditContext = { UserID: UUID_GRANTEE, IsEditor: false };

        const wb = engine.CreateEmptyWorkbook('Protected Spill');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'B2', { Value: 'LOCKED_VALUE' }, false);
        engine.AddProtectedRange(wb, ws.SheetID, {
            RangeID: 'prot-b2',
            Range: 'B1:B4',
            LockedByUserID: UUID_OWNER,
            AllowEditors: false,
        });

        // Dynamic array in unlocked A2 spilling horizontally into protected B2
        engine.SetCell(wb, ws.SheetID, 'A2', { Formula: '={10,99}' }, true, viewerCtx);
        expect(ws.Cells['A2'].ComputedValue).toBe('#SPILL!');
        expect(ws.Cells['B2'].ComputedValue).toBe('LOCKED_VALUE');
        expect(ws.Cells['B2'].SpilledFrom ?? null).toBeNull();

        // Owner CAN spill across their own protected range
        engine.ClearRange(wb, ws.SheetID, 'B2', true, ownerCtx);
        engine.SetCell(wb, ws.SheetID, 'A2', { Formula: '={10,99}' }, true, ownerCtx);
        expect(ws.Cells['A2'].ComputedValue).toBe(10);
        expect(ws.Cells['B2'].ComputedValue).toBe(99);
        expect(ws.Cells['B2'].SpilledFrom).toBe('A2');

        // =MJ.IMPORTRANGE multi-cell spill also refuses protected destination cells for non-owner
        const wbMj = engine.CreateEmptyWorkbook('Protected MJ Spill');
        const wsMj = wbMj.Worksheets[0];
        engine.SetCell(wbMj, wsMj.SheetID, 'B1', { Value: 'KEEP_LOCKED' }, false);
        engine.AddProtectedRange(wbMj, wsMj.SheetID, {
            RangeID: 'prot-mj',
            Range: 'B1:C3',
            LockedByUserID: UUID_OWNER,
            AllowEditors: false,
        });
        engine.SetCell(
            wbMj,
            wsMj.SheetID,
            'A1',
            { Formula: `=MJ.IMPORTRANGE("${UUID_ART}", "Sheet1!A1:B2")` },
            false
        );
        await engine.EvaluateMjCustomFunctions(wbMj, makeUser(UUID_GRANTEE), Metadata.Provider, {
            EditContext: viewerCtx,
            ImportRangeResolver: async () => ({
                BlockID: 'ir',
                Kind: 'Artifact',
                Mode: 'Live',
                Success: true,
                Columns: [
                    { Name: 'Col1', DisplayName: 'Col1', Type: 'string' },
                    { Name: 'Col2', DisplayName: 'Col2', Type: 'number' },
                ],
                Rows: [
                    { Col1: 'a', Col2: 1 },
                    { Col1: 'b', Col2: 2 },
                ],
                TotalRowCount: 2,
            }),
        });
        expect(wsMj.Cells['A1'].ComputedValue).toBe('#SPILL!');
        expect(wsMj.Cells['B1'].ComputedValue).toBe('KEEP_LOCKED');
    });

    it('P0-R6: Add/RemoveValidationRule and Add/RemoveConditionalFormat enforce ProtectedRanges when editContext is provided', () => {
        const engine = SpreadsheetEngine.Instance;
        const ownerCtx: SpreadsheetCellEditContext = { UserID: UUID_OWNER, IsEditor: true };
        const viewerCtx: SpreadsheetCellEditContext = { UserID: UUID_GRANTEE, IsEditor: false };

        const wb = engine.CreateEmptyWorkbook('Protected Rules');
        const ws = wb.Worksheets[0];
        engine.AddProtectedRange(wb, ws.SheetID, {
            RangeID: 'prot-rules',
            Range: 'A1:B5',
            LockedByUserID: UUID_OWNER,
            AllowEditors: false,
        });

        expect(() =>
            engine.AddValidationRule(
                wb,
                ws.SheetID,
                { RuleID: 'v1', Range: 'B2', RuleType: 'numberRange', MinValue: 0, MaxValue: 10 },
                viewerCtx
            )
        ).toThrow(/protected range/i);
        expect(() =>
            engine.AddConditionalFormat(
                wb,
                ws.SheetID,
                { RuleID: 'cf1', Range: 'A2:B2', Operator: 'gt', Value1: 5, HighlightTone: 'warning' },
                viewerCtx
            )
        ).toThrow(/protected range/i);

        engine.AddValidationRule(
            wb,
            ws.SheetID,
            { RuleID: 'v1', Range: 'B2', RuleType: 'numberRange', MinValue: 0, MaxValue: 10 },
            ownerCtx
        );
        engine.AddConditionalFormat(
            wb,
            ws.SheetID,
            { RuleID: 'cf1', Range: 'A2:B2', Operator: 'gt', Value1: 5, HighlightTone: 'warning' },
            ownerCtx
        );

        expect(() => engine.RemoveValidationRule(wb, ws.SheetID, 'v1', viewerCtx)).toThrow(/protected range/i);
        expect(() => engine.RemoveConditionalFormat(wb, ws.SheetID, 'cf1', viewerCtx)).toThrow(/protected range/i);
        expect(engine.RemoveValidationRule(wb, ws.SheetID, 'v1', ownerCtx)).toBe(true);
        expect(engine.RemoveConditionalFormat(wb, ws.SheetID, 'cf1', ownerCtx)).toBe(true);
    });

    it('P0-R6: SerializeWorkbook preserves static =SEQUENCE(4) SpilledFrom cells while stripping viewer-scoped spills', async () => {
        const engine = SpreadsheetEngine.Instance;
        const wb = engine.CreateEmptyWorkbook('Static Spill Serialization');
        const ws = wb.Worksheets[0];
        engine.SetCell(wb, ws.SheetID, 'A1', { Formula: '=SEQUENCE(4)' }, true);
        expect(ws.Cells['A4']?.ComputedValue).toBe(4);
        expect(ws.Cells['A4']?.SpilledFrom).toBe('A1');

        // Also include an =MJ.IMPORTRANGE spill that MUST still be stripped
        engine.SetCell(wb, ws.SheetID, 'C1', { Formula: `=MJ.IMPORTRANGE("${UUID_ART}", "Sheet1!A1:C2")` }, false);
        await engine.EvaluateMjCustomFunctions(wb, makeUser(UUID_OWNER), Metadata.Provider, {
            ImportRangeResolver: async () => ({
                BlockID: 'ir-strip',
                Kind: 'Artifact',
                Mode: 'Live',
                Success: true,
                Columns: [{ Name: 'Secret', DisplayName: 'Secret', Type: 'string' }],
                Rows: [{ Secret: 'r1' }, { Secret: 'r2' }],
                TotalRowCount: 2,
            }),
        });
        expect(ws.Cells['C2']?.ComputedValue).toBe('r2');
        expect(ws.Cells['C2']?.SpilledFrom).toBe('C1');

        const serialized = engine.SerializeWorkbook(wb);
        expect(serialized).not.toContain('r2');
        const parsed = JSON.parse(serialized) as { Worksheets: Array<{ Cells: Record<string, { ComputedValue?: number; SpilledFrom?: string | null }> }> };
        expect(parsed.Worksheets[0].Cells['A4']?.ComputedValue).toBe(4);
        expect(parsed.Worksheets[0].Cells['A4']?.SpilledFrom).toBe('A1');
        expect(parsed.Worksheets[0].Cells['C2']).toBeUndefined();
    });

    it('P0-R6: clearLiveTableCellsOnAccessDenied marks ALL columns even when LastColumnCount === 0, and CSV neutralizes whitespace/newline formulas', async () => {
        const engine = SpreadsheetEngine.Instance;
        const wb = engine.CreateEmptyWorkbook('Denied MultiCol Table');
        const ws = wb.Worksheets[0];
        ws.LiveTables.push({
            TableID: 'tbl-denied-multi',
            Title: 'Deals',
            SourceType: 'EntityView',
            EntityName: 'MJ: Artifacts',
            Mode: 'Live',
            AnchorCell: 'A1',
            IncludeHeaders: true,
            Fields: ['ID', 'Name', 'Owner', 'Amount'],
            LastColumnCount: 0,
            LastRowCount: 2,
        });

        vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValue({
            BlockID: 'tbl-denied-multi',
            Kind: 'EntityView',
            Mode: 'Live',
            Success: false,
            AccessDenied: true,
            ErrorMessage: 'Denied',
            Columns: [],
            Rows: [],
            TotalRowCount: 0,
        });

        await engine.RefreshLiveTables(wb, makeUser(UUID_GRANTEE), Metadata.Provider);
        expect(ws.Cells['A1']?.ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(ws.Cells['B1']?.ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(ws.Cells['C1']?.ComputedValue).toBe('#MJ_ACCESS_DENIED!');
        expect(ws.Cells['D2']?.ComputedValue).toBe('#MJ_ACCESS_DENIED!');

        // CSV whitespace & newline neutralization
        const csvWb = engine.ImportFromCsv('Header\n"  =SUM(1,2)"\n"\t=CMD()"\n"\n=HYPERLINK()"');
        expect(csvWb.Worksheets[0].Cells['A2']?.Formula ?? null).toBeNull();
        expect(csvWb.Worksheets[0].Cells['A3']?.Formula ?? null).toBeNull();

        const exportedCsv = engine.ExportToCsv(csvWb);
        expect(exportedCsv).toContain("'  =SUM(1,2)");
        expect(exportedCsv).toContain("'\t=CMD()");
        expect(exportedCsv).toContain("'\n=HYPERLINK()");
    });
});
