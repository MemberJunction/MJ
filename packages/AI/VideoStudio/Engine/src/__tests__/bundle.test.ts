import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { VideoBeat, VideoGenerationSpec } from '@memberjunction/video-studio-core';
import * as storageModule from '../storage.js';
import * as dataSnapshotModule from '../data/data-snapshot.js';
import {
    BuildCheckRequest,
    BuildRenderBundle,
    CheckProductionRules,
    FrameSizeFor,
    MAX_STILL_POINTS,
    ReadAssetBytes,
    StillPointsFor,
} from '../render/bundle.js';

const mockUser = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'Test User',
} as unknown as UserInfo;

function makeMinimalSpec(): VideoGenerationSpec {
    return {
        SpecVersion: '1.0',
        Status: 'Composed',
        Archetype: {
            Name: 'Topic Explainer',
        },
        Film: {
            OneSentence: 'Quarterly growth highlights.',
            Audience: 'Board',
            Purpose: 'Inform board of Q1 revenue.',
            DurationSeconds: 10,
            Formats: ['16:9'],
        },
        Style: {
            Palette: [{ Name: 'background.primary', Value: '#0B132B', Usage: 'Background' }],
            Typography: [
                {
                    Role: 'Headline',
                    FontFamily: 'Brand Sans',
                    FontAssetKey: 'brand-font',
                    Weight: 700,
                    SizeByFormat: { '16:9': '64px' },
                },
            ],
            Composition: 'Hero number left',
            Pacing: {
                AvgSecondsBetweenChanges: 4,
                HoldRules: 'Hold 2s',
            },
            MotionRules: [],
            Keep: [],
            Avoid: [],
            References: [],
        },
        Assets: {
            Approved: [
                {
                    Key: 'brand-logo',
                    Kind: 'Logo',
                    FileID: 'file-logo-1',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Header logo',
                    MustUse: true,
                    StagedPath: 'assets/brand-logo.png',
                },
                {
                    Key: 'brand-font',
                    Kind: 'Font',
                    FileID: 'file-font-1',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Heading font',
                    MustUse: false,
                    StagedPath: 'assets/brand-font.woff2',
                },
            ],
            Required: [],
            NeverInvent: ['brand-logo'],
        },
        DataBindings: [
            {
                Key: 'revenue',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
                Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
            },
        ],
        DataSnapshot: {
            AsOf: '2026-04-17T00:00:00.000Z',
            Sources: ['Inline:revenue'],
            Inline: { revenue: 12500000 },
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Hook',
                StartSeconds: 0,
                EndSeconds: 4,
                EntryState: 'Dark canvas',
                ExitState: 'Hero number',
                Purpose: 'Hook viewer with Q1 revenue',
                OnScreenText: ['{revenue}'],
                AssetRefs: ['brand-logo'],
                DataRefs: ['revenue'],
                LayoutNotes: { '16:9': 'Left aligned KPI' },
            },
            {
                Key: 'beat-2',
                Label: 'Close',
                StartSeconds: 4,
                EndSeconds: 10,
                EntryState: 'Hero number',
                ExitState: 'Logo lockup',
                Purpose: 'Close on brand',
                OnScreenText: ['Thank you'],
                AssetRefs: ['brand-logo'],
                DataRefs: [],
                LayoutNotes: { '16:9': 'Centered lockup' },
            },
        ],
        Audio: {
            Narration: {
                VoiceID: 'voice-1',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'line-1',
                        BeatKey: 'beat-1',
                        Text: 'Revenue reached 12.5 million dollars.',
                        AudioFileID: 'file-audio-1',
                        DurationSeconds: 3.5,
                        StartSeconds: 0,
                        StagedPath: 'audio/line-1.mp3',
                    },
                ],
            },
            Cues: [],
            Captions: 'Burned',
        },
        Render: {
            Renderer: 'HyperFrames',
            Fps: 30,
            Quality: 'standard',
            Seed: 42,
            RendererVersion: '0.8.134',
        },
        Interaction: {
            Mode: 'Autonomous',
            MaxRepairRounds: 2,
        },
        Deliverables: {
            Formats: ['16:9'],
            Poster: true,
            ContactSheets: true,
            Source: true,
            Captions: true,
        },
        Review: {
            Gates: [],
            Rounds: [],
        },
        Output: {
            Videos: {},
            ContactSheetFileIDs: {},
            Source: {
                '16:9': {
                    Format: '16:9',
                    EntryFile: 'index.html',
                    Files: {
                        'index.html': '<!doctype html><html><body>$12.5M</body></html>',
                        'styles.css': 'body { color: #fff; }',
                    },
                    AssetKeys: ['brand-logo', 'brand-font'],
                },
            },
            RenderMetadata: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.8.134',
                Seed: 42,
                Fps: 30,
                DurationByFormat: {},
                RenderedAt: '2026-04-17T00:00:00.000Z',
            },
        },
    };
}

describe('bundle.ts (VS-AGT-3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('FrameSizeFor covers all 9 (format, quality) combinations', () => {
        expect(FrameSizeFor('16:9', 'draft')).toEqual({ Width: 1280, Height: 720 });
        expect(FrameSizeFor('9:16', 'draft')).toEqual({ Width: 720, Height: 1280 });
        expect(FrameSizeFor('1:1', 'draft')).toEqual({ Width: 720, Height: 720 });

        expect(FrameSizeFor('16:9', 'standard')).toEqual({ Width: 1920, Height: 1080 });
        expect(FrameSizeFor('9:16', 'standard')).toEqual({ Width: 1080, Height: 1920 });
        expect(FrameSizeFor('1:1', 'standard')).toEqual({ Width: 1080, Height: 1080 });

        expect(FrameSizeFor('16:9', 'high')).toEqual({ Width: 2560, Height: 1440 });
        expect(FrameSizeFor('9:16', 'high')).toEqual({ Width: 1440, Height: 2560 });
        expect(FrameSizeFor('1:1', 'high')).toEqual({ Width: 1440, Height: 1440 });
    });

    it('StillPointsFor returns beat midpoints first, then Poster, then interior transition pairs (±0.1 s), and caps at 48 points on a 30-beat spec', () => {
        const spec = makeMinimalSpec();
        const points = StillPointsFor(spec);

        // 2 beat midpoints + 1 poster + 1 interior boundary (2 transition points) = 5 points
        expect(points).toHaveLength(5);
        expect(points[0]).toMatchObject({
            Role: 'BeatMidpoint',
            BeatKey: 'beat-1',
            TimestampSeconds: 2,
        });
        expect(points[1]).toMatchObject({
            Role: 'BeatMidpoint',
            BeatKey: 'beat-2',
            TimestampSeconds: 7,
        });
        expect(points[2]).toMatchObject({
            Role: 'Poster',
            TimestampSeconds: 10,
        });
        expect(points[3]).toMatchObject({
            Role: 'TransitionStart',
            BeatKey: 'beat-1',
            TimestampSeconds: 3.9,
        });
        expect(points[4]).toMatchObject({
            Role: 'TransitionEnd',
            BeatKey: 'beat-2',
            TimestampSeconds: 4.1,
        });

        // 3-beat spec: 3 midpoints + 1 poster + 2 interior boundaries (4 transition points) = 8 points
        const threeBeatSpec: Pick<VideoGenerationSpec, 'Beats' | 'Film'> = {
            Film: {
                OneSentence: 'Three beat test',
                Audience: 'All',
                Purpose: 'Verify 3-beat still points',
                DurationSeconds: 12,
                Formats: ['16:9'],
            },
            Beats: [
                {
                    Key: 'b1',
                    Label: 'Beat 1',
                    StartSeconds: 0,
                    EndSeconds: 4,
                    EntryState: 'S',
                    ExitState: 'E',
                    Purpose: 'P1',
                    OnScreenText: [],
                    AssetRefs: [],
                    DataRefs: [],
                    LayoutNotes: { '16:9': 'L1' },
                },
                {
                    Key: 'b2',
                    Label: 'Beat 2',
                    StartSeconds: 4,
                    EndSeconds: 8,
                    EntryState: 'S',
                    ExitState: 'E',
                    Purpose: 'P2',
                    OnScreenText: [],
                    AssetRefs: [],
                    DataRefs: [],
                    LayoutNotes: { '16:9': 'L2' },
                },
                {
                    Key: 'b3',
                    Label: 'Beat 3',
                    StartSeconds: 8,
                    EndSeconds: 12,
                    EntryState: 'S',
                    ExitState: 'E',
                    Purpose: 'P3',
                    OnScreenText: [],
                    AssetRefs: [],
                    DataRefs: [],
                    LayoutNotes: { '16:9': 'L3' },
                },
            ],
        };
        const threeBeatPoints = StillPointsFor(threeBeatSpec);
        expect(
            threeBeatPoints.map((p) => ({
                Role: p.Role,
                BeatKey: p.BeatKey,
                TimestampSeconds: p.TimestampSeconds,
            })),
        ).toEqual([
            { Role: 'BeatMidpoint', BeatKey: 'b1', TimestampSeconds: 2 },
            { Role: 'BeatMidpoint', BeatKey: 'b2', TimestampSeconds: 6 },
            { Role: 'BeatMidpoint', BeatKey: 'b3', TimestampSeconds: 10 },
            { Role: 'Poster', BeatKey: 'b3', TimestampSeconds: 12 },
            { Role: 'TransitionStart', BeatKey: 'b1', TimestampSeconds: 3.9 },
            { Role: 'TransitionEnd', BeatKey: 'b2', TimestampSeconds: 4.1 },
            { Role: 'TransitionStart', BeatKey: 'b2', TimestampSeconds: 7.9 },
            { Role: 'TransitionEnd', BeatKey: 'b3', TimestampSeconds: 8.1 },
        ]);

        // 30-beat spec: 30 midpoints + 1 poster + 58 transition points = 89 -> capped at 48
        const thirtyBeats: VideoBeat[] = Array.from({ length: 30 }, (_, idx) => ({
            Key: `b-${idx + 1}`,
            Label: `Beat ${idx + 1}`,
            StartSeconds: idx * 2,
            EndSeconds: (idx + 1) * 2,
            EntryState: 'Start',
            ExitState: 'End',
            Purpose: 'Beat purpose',
            OnScreenText: [],
            AssetRefs: [],
            DataRefs: [],
            LayoutNotes: { '16:9': 'Standard' },
        }));
        const capped = StillPointsFor({
            Beats: thirtyBeats,
            Film: {
                OneSentence: 'Long video',
                Audience: 'All',
                Purpose: 'Test',
                DurationSeconds: 60,
                Formats: ['16:9'],
            },
        });
        expect(capped).toHaveLength(MAX_STILL_POINTS);
        expect(capped.slice(0, 30).every((p) => p.Role === 'BeatMidpoint')).toBe(true);
        expect(capped[30].Role).toBe('Poster');
        expect(
            capped
                .slice(31)
                .every((p) => p.Role === 'TransitionStart' || p.Role === 'TransitionEnd'),
        ).toBe(true);
    });

    it('ReadAssetBytes reads from FileID, reads from file-backed ArtifactVersionID, and throws naming asset.Key when neither resolves', async () => {
        const readStoredSpy = vi
            .spyOn(storageModule, 'ReadStoredFile')
            .mockImplementation(async (fileId: string) => Buffer.from(`bytes:${fileId}`, 'utf8'));

        // 1. Direct FileID
        const fromFile = await ReadAssetBytes(
            { Key: 'hero-logo', FileID: 'file-123' },
            mockUser,
        );
        expect(fromFile.Bytes.toString('utf8')).toBe('bytes:file-123');
        expect(readStoredSpy).toHaveBeenCalledWith('file-123', mockUser, undefined);

        // 2. File-backed ArtifactVersionID
        const mockProvider = {
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [
                    {
                        ID: 'av-999',
                        FileID: 'file-from-av',
                        MimeType: 'image/svg+xml',
                    },
                ],
            }),
        } as unknown as IMetadataProvider;
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
            mockProvider.RunView as unknown as typeof RunView.prototype.RunView,
        );

        const fromAv = await ReadAssetBytes(
            { Key: 'chart-svg', ArtifactVersionID: 'av-999' },
            mockUser,
            mockProvider,
        );
        expect(fromAv.Bytes.toString('utf8')).toBe('bytes:file-from-av');
        expect(fromAv.MimeType).toBe('image/svg+xml');

        // 3. ArtifactVersionID without FileID throws naming asset.Key
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'av-inline-only', FileID: null }],
        } as never);
        await expect(
            ReadAssetBytes({ Key: 'missing-backing-file', ArtifactVersionID: 'av-inline-only' }, mockUser),
        ).rejects.toThrow(/missing-backing-file/);

        // 4. Neither FileID nor ArtifactVersionID throws naming asset.Key
        await expect(
            ReadAssetBytes({ Key: 'orphan-asset' }, mockUser),
        ).rejects.toThrow(/orphan-asset/);
    });

    it('BuildRenderBundle collects Output.Source[format].Files, staged approved assets, staged narration clips, mj/chart-kit.js, mj/fonts.css, DataSnapshot, and Seed without mutating spec', async () => {
        vi.spyOn(storageModule, 'ReadStoredFile').mockImplementation(async (fileId: string) =>
            Buffer.from(`content:${fileId}`, 'utf8'),
        );
        const loadValuesSpy = vi
            .spyOn(dataSnapshotModule, 'LoadDataSnapshotValues')
            .mockResolvedValue({ revenue: 12500000 });

        const spec = makeMinimalSpec();
        const frozenBefore = JSON.stringify(spec);

        const bundle = await BuildRenderBundle(spec, '16:9', { ContextUser: mockUser });

        expect(JSON.stringify(spec)).toBe(frozenBefore);
        expect(loadValuesSpy).toHaveBeenCalledTimes(1);
        expect(bundle.Format).toBe('16:9');
        expect(bundle.EntryFile).toBe('index.html');
        expect(bundle.Seed).toBe(42);
        expect(bundle.DataSnapshot).toEqual({
            revenue: 12500000,
            __asOf: 'Data as of 2026-04-17',
        });

        const filePaths = bundle.Files.map((f) => f.Path);
        expect(filePaths).toContain('index.html');
        expect(filePaths).toContain('styles.css');
        expect(filePaths).toContain('mj/chart-kit.js');
        expect(filePaths).toContain('mj/fonts.css');

        const fontsFile = bundle.Files.find((f) => f.Path === 'mj/fonts.css');
        expect(fontsFile?.Content).toContain('@font-face');
        expect(fontsFile?.Content).toContain("font-family: 'Brand Sans'");
        expect(fontsFile?.Content).toContain('assets/brand-font.woff2');

        expect(bundle.Assets).toEqual([
            {
                Key: 'brand-logo',
                RelativePath: 'assets/brand-logo.png',
                MimeType: 'image/png',
                DataBase64: Buffer.from('content:file-logo-1', 'utf8').toString('base64'),
            },
            {
                Key: 'brand-font',
                RelativePath: 'assets/brand-font.woff2',
                MimeType: 'font/woff2',
                DataBase64: Buffer.from('content:file-font-1', 'utf8').toString('base64'),
            },
            {
                Key: 'line-1',
                RelativePath: 'audio/line-1.mp3',
                MimeType: 'audio/mpeg',
                DataBase64: Buffer.from('content:file-audio-1', 'utf8').toString('base64'),
            },
        ]);

        const checkReq = BuildCheckRequest(spec, '16:9', bundle, { revenue: 12500000 });
        expect(checkReq.Width).toBe(1920);
        expect(checkReq.Height).toBe(1080);
        expect(checkReq.AllowedDataLiterals).toContain('$12.5M');
        expect(checkReq.BoundDataLiterals?.revenue).toContain('$12.5M');
        expect(checkReq.RequiredFinalFrameText).toEqual(['Data as of 2026-04-17']);
    });

    it('CheckProductionRules catches missing PromptRunID, generated video total > MaxGeneratedVideoSeconds, missing AudioFileID, and unstaged Music.AssetKey', () => {
        const spec = makeMinimalSpec();
        spec.Assets.Approved.push(
            {
                Key: 'gen-img-no-run',
                Kind: 'Image',
                FileID: 'file-gen-1',
                Source: 'AI',
                Provenance: 'Generated',
                Usage: 'Background',
                MustUse: false,
                Generation: {
                    ModelID: 'model-1',
                    PromptRunID: '',
                    Prompt: 'Abstract waves',
                    ReferenceKeys: [],
                },
            },
            {
                Key: 'gen-vid-1',
                Kind: 'Video',
                FileID: 'file-gen-v1',
                Source: 'AI',
                Provenance: 'Generated',
                Usage: 'B-roll 1',
                MustUse: false,
                Generation: {
                    ModelID: 'model-v',
                    PromptRunID: 'run-v1',
                    Prompt: 'Clouds',
                    ReferenceKeys: [],
                    DurationSeconds: 10,
                },
            },
            {
                Key: 'gen-vid-2',
                Kind: 'Video',
                FileID: 'file-gen-v2',
                Source: 'AI',
                Provenance: 'Generated',
                Usage: 'B-roll 2',
                MustUse: false,
                Generation: {
                    ModelID: 'model-v',
                    PromptRunID: 'run-v2',
                    Prompt: 'Ocean',
                    ReferenceKeys: [],
                    DurationSeconds: 8,
                },
            },
        );
        spec.Audio.Narration!.Script.push({
            Key: 'line-missing-audio',
            BeatKey: 'beat-2',
            Text: 'Missing audio clip.',
        });
        spec.Audio.Music = {
            AssetKey: 'missing-music-track',
            GainDb: -14,
        };

        const issues = CheckProductionRules(spec, { MaxGeneratedVideoSeconds: 15 });

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    Category: 'Provenance',
                    Severity: 'Error',
                    Code: 'MissingGeneratedAssetProvenance',
                }),
                expect.objectContaining({
                    Category: 'Provenance',
                    Severity: 'Error',
                    Code: 'MaxGeneratedVideoSecondsExceeded',
                }),
                expect.objectContaining({
                    Category: 'Audio',
                    Severity: 'Error',
                    Code: 'MissingNarrationAudio',
                }),
                expect.objectContaining({
                    Category: 'Audio',
                    Severity: 'Error',
                    Code: 'UnstagedMusicAsset',
                }),
            ]),
        );
    });
});
