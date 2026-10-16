import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    ValidateVideoGenerationSpec,
    VIDEO_STUDIO_SPEC_VERSION,
    VideoDataBinding,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

const {
    mockRunView,
    mockRunViews,
    mockRunQueries,
    mockStorageState,
    mockDriverGetObject,
    mockLogError,
} = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockRunViews: vi.fn(),
    mockRunQueries: vi.fn(),
    mockDriverGetObject: vi.fn(),
    mockStorageState: {
        Config: vi.fn().mockResolvedValue(undefined),
        HasStorageAccounts: true,
        UploadFile: vi.fn(),
        ResolveFileObject: vi.fn(),
    },
    mockLogError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public Provider?: unknown;
        constructor(provider?: unknown) {
            this.Provider = provider;
        }
        public RunView = mockRunView;
        public RunViews = mockRunViews;
    }
    class MockRunQuery {
        public Provider?: unknown;
        constructor(provider?: unknown) {
            this.Provider = provider;
        }
        public RunQueries = mockRunQueries;
    }
    return {
        ...actual,
        RunView: MockRunView,
        RunQuery: MockRunQuery,
        LogError: mockLogError,
    };
});

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        get Instance() {
            return mockStorageState;
        },
    },
}));

import {
    CaptureDataSnapshot,
    LoadDataSnapshotValues,
    MAX_ROWS_PER_BINDING,
    SNAPSHOT_INLINE_MAX_BYTES,
} from '../data/data-snapshot.js';
import { ReadStoredFile } from '../storage.js';

const QUERY_ID_1 = '11111111-1111-4111-8111-111111111111';
const QUERY_ID_2 = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_VERSION_ID_1 = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_VERSION_ID_2 = '44444444-4444-4444-8444-444444444444';
const FILE_ID_1 = '55555555-5555-4555-8555-555555555555';

const contextUser = {
    ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    Email: 'analyst@integration.test',
    Name: 'Analyst User',
} as unknown as UserInfo;

function makePreProducedFixtureSpec(bindings: VideoDataBinding[]): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'PreProduced',
        BrandKitID: 'bk-001',
        Archetype: { Name: 'MetricStory' },
        Film: {
            OneSentence: 'Show how Q3 revenue grew by 12% over prior quarter.',
            Audience: 'Executive leadership',
            Purpose: 'Quarterly board update',
            DurationSeconds: 10,
            Formats: ['16:9'],
        },
        Assets: {
            Required: [],
            Approved: [
                {
                    Key: 'brand-logo',
                    Kind: 'Logo',
                    Source: 'Brand Kit Primary Logo',
                    Provenance: 'BrandKit',
                    Usage: 'Corner watermark',
                    MustUse: true,
                    FileID: 'file-logo-001',
                },
                {
                    Key: 'brand-font',
                    Kind: 'Font',
                    Source: 'Brand Kit Display Font',
                    Provenance: 'BrandKit',
                    Usage: 'Headline typography',
                    MustUse: true,
                    FileID: 'file-font-001',
                },
                {
                    Key: 'bg-music',
                    Kind: 'Music',
                    Source: 'Licensed ambient underscore',
                    Provenance: 'Supplied',
                    Usage: 'Background bed',
                    MustUse: false,
                    FileID: 'file-music-001',
                },
            ],
            Generate: [],
            NeverInvent: ['company logo', 'ARR metrics'],
        },
        Style: {
            Palette: [
                { Name: 'Surface', Value: '#0F172A', Usage: 'Background' },
                { Name: 'Ink', Value: '#F8FAFC', Usage: 'PrimaryText' },
                { Name: 'Accent', Value: '#38BDF8', Usage: 'Highlight' },
            ],
            Typography: [
                {
                    Role: 'Display',
                    FontFamily: 'Inter',
                    Weight: 700,
                    FontAssetKey: 'brand-font',
                    SizeByFormat: { '16:9': '64px' },
                },
            ],
            Composition: '60/30/10 focal hierarchy with generous negative space.',
            Pacing: {
                AvgSecondsBetweenChanges: 3.5,
                HoldRules: 'Hold hero metric for at least 1.5s before secondary reveal.',
            },
            MotionRules: [
                {
                    ObjectClass: 'DataMetric',
                    Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    DurationMs: 650,
                    Notes: 'Count up and settle 1.5s before exit',
                },
            ],
            Keep: ['Tabular numerals'],
            Avoid: ['Busy backgrounds'],
            References: [],
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Hero Revenue Reveal',
                StartSeconds: 0,
                EndSeconds: 5,
                EntryState: 'Dark slate canvas with brand mark in top-left corner',
                ExitState: 'Headline locked at center',
                Purpose: 'Anchor the viewer on the headline Q3 revenue number',
                OnScreenText: ['Q3 Revenue', `{${bindings[0]?.Key ?? 'kpi.revenue'}}`],
                NarrationKey: 'nar-1',
                AssetRefs: ['brand-logo'],
                DataRefs: bindings.map((b) => b.Key),
                LayoutNotes: { '16:9': 'Centered metric hero' },
            },
            {
                Key: 'beat-2',
                Label: 'Sign-off Close',
                StartSeconds: 5,
                EndSeconds: 10,
                EntryState: 'Transition into closing card',
                ExitState: 'Brand sign-off card with logo',
                Purpose: 'Close on summary card',
                OnScreenText: ['Enterprise Summary'],
                NarrationKey: 'nar-2',
                AssetRefs: ['brand-logo'],
                DataRefs: [],
                LayoutNotes: { '16:9': 'Centered logo lockup' },
            },
        ],
        StateList: [],
        DataBindings: bindings,
        Audio: {
            Narration: {
                VoiceID: 'voice-nova',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'nar-1',
                        BeatKey: 'beat-1',
                        Text: 'Revenue climbed strongly in Q3.',
                        AudioFileID: 'file-nar-1',
                        DurationSeconds: 4.2,
                    },
                    {
                        Key: 'nar-2',
                        BeatKey: 'beat-2',
                        Text: 'Momentum continues across every segment.',
                        AudioFileID: 'file-nar-2',
                        DurationSeconds: 4.0,
                    },
                ],
            },
            Music: {
                AssetKey: 'bg-music',
                GainDb: -14,
            },
            Captions: 'Burned',
            Cues: [],
        },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.8',
            Fps: 30,
            Seed: 42,
            Quality: 'standard',
        },
        Deliverables: {
            Formats: ['16:9'],
            Poster: true,
            ContactSheets: true,
            Source: true,
            Captions: true,
        },
        Interaction: {
            Mode: 'Autonomous',
            MaxRepairRounds: 2,
        },
        Review: {
            Gates: [],
            Rounds: [],
        },
    };
}

describe('VS-DAT-1: CaptureDataSnapshot & LoadDataSnapshotValues', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStorageState.HasStorageAccounts = true;
        mockStorageState.Config.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('omits Snapshot when bindings array is empty', async () => {
        const res = await CaptureDataSnapshot([], undefined, { ContextUser: contextUser });
        expect(res.Snapshot).toBeUndefined();
        expect(res.Values).toEqual({});
        expect(res.Issues).toEqual([]);
        expect(mockRunViews).not.toHaveBeenCalled();
        expect(mockRunQueries).not.toHaveBeenCalled();
    });

    it('batches two View bindings + one Artifact binding into ONE RunViews call (3 params) and two Query bindings into ONE RunQueries call, all as ContextUser', async () => {
        mockRunViews.mockResolvedValueOnce([
            { Success: true, Results: [{ TotalRevenue: 14200000 }] },
            {
                Success: true,
                Results: [
                    { Region: 'NA', Revenue: 8200000 },
                    { Region: 'EMEA', Revenue: 6000000 },
                ],
            },
            {
                Success: true,
                Results: [
                    {
                        ID: ARTIFACT_VERSION_ID_1,
                        ContentMode: 'Text',
                        Content: JSON.stringify({
                            tables: [
                                {
                                    name: 'snapshot',
                                    rows: [
                                        { Tier: 'Enterprise', Accounts: 48 },
                                        { Tier: 'MidMarket', Accounts: 120 },
                                    ],
                                },
                            ],
                        }),
                    },
                ],
            },
        ]);

        mockRunQueries.mockResolvedValueOnce([
            { Success: true, Results: [{ CurrentARR: 112, PriorARR: 100 }] },
            { Success: true, Results: [{ ChurnRate: 0.018 }] },
        ]);

        const bindings: VideoDataBinding[] = [
            {
                Key: 'view.rev.total',
                Source: {
                    Kind: 'View',
                    EntityName: 'MJ: Invoices',
                    ExtraFilter: "Status = 'Paid'",
                    Fields: ['TotalRevenue'],
                },
                Shape: 'Scalar',
            },
            {
                Key: 'view.rev.byRegion',
                Source: {
                    Kind: 'View',
                    EntityName: 'MJ: Invoices',
                    Fields: ['Region', 'Revenue'],
                },
                Shape: 'Series',
            },
            {
                Key: 'artifact.tiers',
                Source: {
                    Kind: 'Artifact',
                    ArtifactVersionID: ARTIFACT_VERSION_ID_1,
                },
                Shape: 'Table',
            },
            {
                Key: 'query.arr.delta',
                Source: {
                    Kind: 'Query',
                    QueryID: QUERY_ID_1,
                    Parameters: { Quarter: 'Q3' },
                },
                Shape: 'Delta',
            },
            {
                Key: 'query.churn',
                Source: {
                    Kind: 'Query',
                    QueryID: QUERY_ID_2,
                },
                Shape: 'Scalar',
            },
        ];

        const res = await CaptureDataSnapshot(bindings, undefined, { ContextUser: contextUser });

        expect(res.Issues).toEqual([]);
        expect(mockRunViews).toHaveBeenCalledTimes(1);
        const [viewParamsArg, viewUserArg] = mockRunViews.mock.calls[0];
        expect(viewUserArg).toBe(contextUser);
        expect(viewParamsArg).toHaveLength(3);
        expect(viewParamsArg[0]).toEqual({
            EntityName: 'MJ: Invoices',
            ExtraFilter: "Status = 'Paid'",
            Fields: ['TotalRevenue'],
            ResultType: 'simple',
            MaxRows: MAX_ROWS_PER_BINDING,
        });
        expect(viewParamsArg[1]).toEqual({
            EntityName: 'MJ: Invoices',
            ExtraFilter: undefined,
            Fields: ['Region', 'Revenue'],
            ResultType: 'simple',
            MaxRows: MAX_ROWS_PER_BINDING,
        });
        expect(viewParamsArg[2]).toEqual({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN ('${ARTIFACT_VERSION_ID_1}')`,
            Fields: ['ID', 'Content', 'ContentMode', 'FileID', 'MimeType'],
            ResultType: 'simple',
            MaxRows: MAX_ROWS_PER_BINDING,
        });

        expect(mockRunQueries).toHaveBeenCalledTimes(1);
        const [queryParamsArg, queryUserArg] = mockRunQueries.mock.calls[0];
        expect(queryUserArg).toBe(contextUser);
        expect(queryParamsArg).toHaveLength(2);
        expect(queryParamsArg[0]).toEqual({
            QueryID: QUERY_ID_1,
            Parameters: { Quarter: 'Q3' },
            MaxRows: MAX_ROWS_PER_BINDING,
        });
        expect(queryParamsArg[1]).toEqual({
            QueryID: QUERY_ID_2,
            Parameters: undefined,
            MaxRows: MAX_ROWS_PER_BINDING,
        });

        expect(res.Values['view.rev.total']).toBe(14200000);
        expect(res.Values['view.rev.byRegion']).toEqual([
            { Label: 'NA', Value: 8200000 },
            { Label: 'EMEA', Value: 6000000 },
        ]);
        expect(res.Values['artifact.tiers']).toEqual([
            { Tier: 'Enterprise', Accounts: 48 },
            { Tier: 'MidMarket', Accounts: 120 },
        ]);
        expect(res.Values['query.arr.delta']).toEqual({
            Current: 112,
            Previous: 100,
            Change: 12,
            ChangePercent: 0.12,
        });
        expect(res.Values['query.churn']).toBe(0.018);
    });

    it('freezes Scalar, Series, Table, and Delta shapes accurately (including Delta 112 vs 100 -> 0.12 and Previous 0 -> null)', async () => {
        mockRunViews.mockResolvedValueOnce([
            // View Scalar: respects Fields[0] even when row keys are in different order
            { Success: true, Results: [{ IgnoredFirstKey: 'wrong', HeadlineLabel: 'Q3 Winner', ExtraCol: 99 }] },
            // View Series: Fields[0] = Label, Fields[1] = Value
            {
                Success: true,
                Results: [
                    { Amount: 250, MonthName: 'Jul', Extra: true },
                    { Amount: 310, MonthName: 'Aug', Extra: false },
                ],
            },
            // View Table: projects only selected Fields
            {
                Success: true,
                Results: [
                    { ID: 'row-1', Name: 'Acme', Active: true,ARR: 50000, SecretInternal: 'strip-me' },
                ],
            },
        ]);

        mockRunQueries.mockResolvedValueOnce([
            // Query Delta: 112 vs 100 -> Change: 12, ChangePercent: 0.12 (skips non-numeric label column)
            { Success: true, Results: [{ Metric: 'Revenue', CurrentVal: 112, PreviousVal: 100 }] },
            // Query Delta with Previous = 0 -> ChangePercent: null
            { Success: true, Results: [{ CurrentVal: 45, PreviousVal: 0 }] },
        ]);

        const bindings: VideoDataBinding[] = [
            {
                Key: 'scalar.headline',
                Source: { Kind: 'View', EntityName: 'MJ: Reports', Fields: ['HeadlineLabel'] },
                Shape: 'Scalar',
            },
            {
                Key: 'series.monthly',
                Source: { Kind: 'View', EntityName: 'MJ: Reports', Fields: ['MonthName', 'Amount'] },
                Shape: 'Series',
            },
            {
                Key: 'table.accounts',
                Source: { Kind: 'View', EntityName: 'MJ: Accounts', Fields: ['Name', 'Active', 'ARR'] },
                Shape: 'Table',
            },
            {
                Key: 'delta.growth',
                Source: { Kind: 'Query', QueryID: QUERY_ID_1 },
                Shape: 'Delta',
            },
            {
                Key: 'delta.zeroPrev',
                Source: { Kind: 'Query', QueryID: QUERY_ID_2 },
                Shape: 'Delta',
            },
        ];

        const res = await CaptureDataSnapshot(bindings, undefined, { ContextUser: contextUser });

        expect(res.Issues).toEqual([]);
        expect(res.Values['scalar.headline']).toBe('Q3 Winner');
        expect(res.Values['series.monthly']).toEqual([
            { Label: 'Jul', Value: 250 },
            { Label: 'Aug', Value: 310 },
        ]);
        expect(res.Values['table.accounts']).toEqual([
            { Name: 'Acme', Active: true, ARR: 50000 },
        ]);
        expect(res.Values['delta.growth']).toEqual({
            Current: 112,
            Previous: 100,
            Change: 12,
            ChangePercent: 0.12,
        });
        expect(res.Values['delta.zeroPrev']).toEqual({
            Current: 45,
            Previous: 0,
            Change: 45,
            ChangePercent: null,
        });
    });

    it('records one Error issue per failing binding (missing View Fields, invalid QueryID, empty Artifact rows, missing Inline, Success: false) while capturing valid bindings', async () => {
        mockRunViews.mockResolvedValueOnce([
            // Valid View binding succeeds
            { Success: true, Results: [{ Total: 999 }] },
            // Denied View binding returns Success: false
            { Success: false, Results: [], ErrorMessage: 'User does not have permissions to read entity' },
            // MJ: Artifact Versions read returns an artifact with no rows
            {
                Success: true,
                Results: [
                    {
                        ID: ARTIFACT_VERSION_ID_1,
                        ContentMode: 'Text',
                        Content: JSON.stringify({ tables: [{ name: 'empty', rows: [] }] }),
                    },
                ],
            },
        ]);

        mockRunQueries.mockResolvedValueOnce([
            // Valid Query binding succeeds
            { Success: true, Results: [{ Count: 42 }] },
        ]);

        const bindings: VideoDataBinding[] = [
            {
                Key: 'view.noFields',
                Source: { Kind: 'View', EntityName: 'MJ: Users' },
                Shape: 'Table',
            },
            {
                Key: 'view.ok',
                Source: { Kind: 'View', EntityName: 'MJ: Invoices', Fields: ['Total'] },
                Shape: 'Scalar',
            },
            {
                Key: 'view.denied',
                Source: { Kind: 'View', EntityName: 'MJ: Secret', Fields: ['ID'] },
                Shape: 'Table',
            },
            {
                Key: 'query.badId',
                Source: { Kind: 'Query', QueryID: 'not-a-valid-uuid' },
                Shape: 'Scalar',
            },
            {
                Key: 'query.ok',
                Source: { Kind: 'Query', QueryID: QUERY_ID_1 },
                Shape: 'Scalar',
            },
            {
                Key: 'artifact.empty',
                Source: { Kind: 'Artifact', ArtifactVersionID: ARTIFACT_VERSION_ID_1 },
                Shape: 'Table',
            },
            {
                Key: 'inline.missing',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
            },
            {
                Key: 'inline.ok',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
            },
        ];

        const res = await CaptureDataSnapshot(
            bindings,
            { 'inline.ok': 'Provided Inline Value' },
            { ContextUser: contextUser },
        );

        // Valid bindings still captured
        expect(res.Values).toEqual({
            'view.ok': 999,
            'query.ok': 42,
            'inline.ok': 'Provided Inline Value',
        });

        // Exactly 5 Error issues for the 5 broken bindings
        const errorIssues = res.Issues.filter((i) => i.Severity === 'Error');
        expect(errorIssues).toHaveLength(5);
        expect(errorIssues.map((i) => i.BindingKey).sort()).toEqual([
            'artifact.empty',
            'inline.missing',
            'query.badId',
            'view.denied',
            'view.noFields',
        ]);
        const emptyArtifactIssue = errorIssues.find((i) => i.BindingKey === 'artifact.empty');
        expect(emptyArtifactIssue?.Message).toContain('artifact.empty');
    });

    it('emits RowsTruncated warning at 500 rows and handles Inline vs FileID vs SnapshotStoredInline fallback', async () => {
        const fiveHundredRows = Array.from({ length: MAX_ROWS_PER_BINDING }, (_, idx) => ({
            Label: `Row-${idx}`,
            Val: idx,
        }));

        // Case A: 500 rows + small inline limit + storage succeeds -> FileID and no Inline
        mockRunViews.mockResolvedValueOnce([{ Success: true, Results: fiveHundredRows }]);
        mockStorageState.UploadFile.mockResolvedValueOnce({ FileID: FILE_ID_1 });

        const binding: VideoDataBinding = {
            Key: 'series.large',
            Source: { Kind: 'View', EntityName: 'MJ: Metrics', Fields: ['Label', 'Val'] },
            Shape: 'Series',
        };

        const resStored = await CaptureDataSnapshot([binding], undefined, {
            ContextUser: contextUser,
            InlineMaxBytes: 256,
            StorageAccountID: 'acc-1',
        });

        expect(resStored.Issues).toEqual([
            expect.objectContaining({
                Severity: 'Warning',
                Code: 'RowsTruncated',
                BindingKey: 'series.large',
            }),
        ]);
        expect(resStored.Values['series.large']).toHaveLength(MAX_ROWS_PER_BINDING);
        expect(resStored.Snapshot?.FileID).toBe(FILE_ID_1);
        expect(resStored.Snapshot?.Inline).toBeUndefined();
        expect(mockStorageState.UploadFile).toHaveBeenCalledWith(
            expect.objectContaining({
                fileName: 'data-snapshot.json',
                mimeType: 'application/json',
                contextUser,
                storageAccountId: 'acc-1',
                description: `Video Studio data snapshot as of ${resStored.Snapshot?.AsOf}`,
            }),
        );

        // Case B: over the limit, storage fails -> keeps Inline + emits SnapshotStoredInline warning
        mockRunViews.mockResolvedValueOnce([{ Success: true, Results: fiveHundredRows }]);
        mockStorageState.UploadFile.mockRejectedValueOnce(new Error('S3 bucket unreachable'));

        const resFallback = await CaptureDataSnapshot([binding], undefined, {
            ContextUser: contextUser,
            InlineMaxBytes: 256,
        });

        expect(resFallback.Snapshot?.FileID).toBeUndefined();
        expect(resFallback.Snapshot?.Inline).toBeDefined();
        expect(resFallback.Issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ Severity: 'Warning', Code: 'RowsTruncated' }),
                expect.objectContaining({ Severity: 'Warning', Code: 'SnapshotStoredInline' }),
            ]),
        );

        // Case C: small snapshot within default SNAPSHOT_INLINE_MAX_BYTES -> Inline without calling UploadFile
        mockStorageState.UploadFile.mockClear();
        mockRunViews.mockResolvedValueOnce([{ Success: true, Results: [{ Label: 'A', Val: 1 }] }]);

        const resInline = await CaptureDataSnapshot([binding], undefined, {
            ContextUser: contextUser,
        });

        expect(SNAPSHOT_INLINE_MAX_BYTES).toBe(65536);
        expect(resInline.Snapshot?.Inline).toEqual({
            'series.large': [{ Label: 'A', Value: 1 }],
        });
        expect(resInline.Snapshot?.FileID).toBeUndefined();
        expect(mockStorageState.UploadFile).not.toHaveBeenCalled();
    });

    it('uses a single AsOf timestamp (fake timers) and produces sorted unique Sources', async () => {
        vi.useFakeTimers();
        const frozenDate = new Date('2026-10-16T15:30:45.123Z');
        vi.setSystemTime(frozenDate);

        mockRunViews.mockResolvedValueOnce([
            { Success: true, Results: [{ V: 1 }] },
            { Success: true, Results: [{ V: 2 }] },
            {
                Success: true,
                Results: [
                    {
                        ID: ARTIFACT_VERSION_ID_2,
                        ContentMode: 'Text',
                        Content: JSON.stringify({ rows: [{ Col: 'A' }] }),
                    },
                ],
            },
        ]);
        mockRunQueries.mockResolvedValueOnce([
            { Success: true, Results: [{ Q: 10 }] },
            { Success: true, Results: [{ Q: 20 }] },
        ]);

        const bindings: VideoDataBinding[] = [
            {
                Key: 'v1',
                Source: { Kind: 'View', EntityName: 'MJ: Users', Fields: ['V'] },
                Shape: 'Scalar',
            },
            // Duplicate entity view to verify deduplication in Sources
            {
                Key: 'v2',
                Source: { Kind: 'View', EntityName: 'MJ: Users', Fields: ['V'] },
                Shape: 'Scalar',
            },
            {
                Key: 'q1',
                Source: { Kind: 'Query', QueryID: QUERY_ID_1 },
                Shape: 'Scalar',
            },
            // Duplicate QueryID to verify deduplication in Sources
            {
                Key: 'q2',
                Source: { Kind: 'Query', QueryID: QUERY_ID_1 },
                Shape: 'Scalar',
            },
            {
                Key: 'a1',
                Source: { Kind: 'Artifact', ArtifactVersionID: ARTIFACT_VERSION_ID_2 },
                Shape: 'Scalar',
            },
            {
                Key: 'i1',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
            },
        ];

        const res = await CaptureDataSnapshot(
            bindings,
            { i1: 77 },
            { ContextUser: contextUser },
        );

        expect(res.Issues).toEqual([]);
        expect(res.Snapshot?.AsOf).toBe('2026-10-16T15:30:45.123Z');
        expect(res.Snapshot?.Sources).toEqual([
            `Artifact:${ARTIFACT_VERSION_ID_2}`,
            'Inline:i1',
            `Query:${QUERY_ID_1}`,
            'View:MJ: Users',
        ]);
    });

    it('round-trips both inline and file-backed snapshots via LoadDataSnapshotValues and reads File-mode artifacts via ReadStoredFile', async () => {
        // 1. File-mode Artifact during CaptureDataSnapshot
        const artifactPayload = {
            tables: [{ name: 't1', rows: [{ Product: 'Studio', Seats: 300 }] }],
        };
        mockRunViews.mockResolvedValueOnce([
            {
                Success: true,
                Results: [
                    {
                        ID: ARTIFACT_VERSION_ID_1,
                        ContentMode: 'File',
                        FileID: FILE_ID_1,
                        MimeType: 'application/json',
                    },
                ],
            },
        ]);
        mockRunView.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: FILE_ID_1, ProviderID: 'prov-1', ProviderKey: 'artifacts/snap.json', Name: 'snap.json' }],
        });
        mockStorageState.ResolveFileObject.mockResolvedValueOnce({
            Account: { ID: 'acc-1' },
            Driver: { GetObject: mockDriverGetObject },
            ObjectKey: 'artifacts/snap.json',
        });
        mockDriverGetObject.mockResolvedValueOnce(Buffer.from(JSON.stringify(artifactPayload), 'utf8'));

        const artifactBinding: VideoDataBinding = {
            Key: 'artifact.fileMode',
            Source: { Kind: 'Artifact', ArtifactVersionID: ARTIFACT_VERSION_ID_1 },
            Shape: 'Table',
        };

        const captureInline = await CaptureDataSnapshot([artifactBinding], undefined, {
            ContextUser: contextUser,
        });
        expect(captureInline.Issues).toEqual([]);
        expect(captureInline.Values).toEqual({
            'artifact.fileMode': [{ Product: 'Studio', Seats: 300 }],
        });

        // Round-trip Inline snapshot
        const loadedFromInline = await LoadDataSnapshotValues(captureInline.Snapshot!, {
            ContextUser: contextUser,
        });
        expect(loadedFromInline).toEqual(captureInline.Values);

        // 2. Round-trip FileID-backed snapshot
        const storedBuffer = Buffer.from(JSON.stringify(captureInline.Values), 'utf8');
        mockRunView.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: FILE_ID_1, ProviderID: 'prov-1', ProviderKey: 'snapshots/data-snapshot.json', Name: 'data-snapshot.json' }],
        });
        mockStorageState.ResolveFileObject.mockResolvedValueOnce({
            Account: { ID: 'acc-1' },
            Driver: { GetObject: mockDriverGetObject },
            ObjectKey: 'snapshots/data-snapshot.json',
        });
        mockDriverGetObject.mockResolvedValueOnce(storedBuffer);

        const loadedFromFile = await LoadDataSnapshotValues(
            {
                FileID: FILE_ID_1,
                AsOf: '2026-10-16T15:30:45.123Z',
                Sources: [`Artifact:${ARTIFACT_VERSION_ID_1}`],
            },
            { ContextUser: contextUser },
        );
        expect(loadedFromFile).toEqual(captureInline.Values);
        expect(mockStorageState.ResolveFileObject).toHaveBeenLastCalledWith(
            expect.objectContaining({ ProviderID: 'prov-1' }),
            contextUser,
            'Read',
            undefined,
        );

        // ReadStoredFile throws on invalid UUID or missing row
        await expect(ReadStoredFile('bad-id', contextUser)).rejects.toThrow(/Invalid file ID/);
        mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'Access denied' });
        await expect(ReadStoredFile(FILE_ID_1, contextUser)).rejects.toThrow(/Access denied/);
    });

    it('produces a Snapshot that passes ValidateVideoGenerationSpec(spec, "PreProduced") with no MissingDataSnapshot', async () => {
        mockRunQueries.mockResolvedValueOnce([
            { Success: true, Results: [{ Q3Revenue: 14200000 }] },
        ]);

        const bindings: VideoDataBinding[] = [
            {
                Key: 'q3-rev',
                Source: { Kind: 'Query', QueryID: QUERY_ID_1 },
                Shape: 'Scalar',
                Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
            },
        ];

        const spec = makePreProducedFixtureSpec(bindings);

        // Before attaching DataSnapshot, PreProduced validation fails with MissingDataSnapshot
        const beforeValidation = ValidateVideoGenerationSpec(spec, 'PreProduced');
        expect(beforeValidation.Errors.some((i) => i.Code === 'MissingDataSnapshot')).toBe(true);

        // Capture snapshot and attach to spec
        const captured = await CaptureDataSnapshot(spec.DataBindings, undefined, {
            ContextUser: contextUser,
        });
        expect(captured.Issues).toEqual([]);
        spec.DataSnapshot = captured.Snapshot;

        const afterValidation = ValidateVideoGenerationSpec(spec, 'PreProduced');
        expect(afterValidation.Errors.some((i) => i.Code === 'MissingDataSnapshot')).toBe(false);
        expect(afterValidation.Valid).toBe(true);
    });
});
