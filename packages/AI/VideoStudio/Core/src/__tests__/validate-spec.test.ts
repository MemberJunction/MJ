import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    AUDIO_CUE_KINDS,
    BEAT_TIMELINE_TOLERANCE_SECONDS,
    DEFECT_SEVERITIES,
    DEFECT_STATUSES,
    ExtractNumericLiteralTokens,
    GATE_STATUSES,
    IsNumericLiteralToken,
    MOTION_OBJECT_CLASSES,
    STAGE_REQUIRED_SECTIONS,
    ValidateVideoGenerationSpec,
    VIDEO_ASSET_KINDS,
    VIDEO_ASSET_PROVENANCES,
    VIDEO_CAPTION_MODES,
    VIDEO_DATA_FORMAT_KINDS,
    VIDEO_DATA_SHAPES,
    VIDEO_DATA_SOURCE_KINDS,
    VIDEO_FORMATS,
    VIDEO_GATE_IDS,
    VIDEO_INTERACTION_MODES,
    VIDEO_PRODUCTION_STATUSES,
    VIDEO_RENDER_QUALITIES,
    VIDEO_SPEC_ERROR_CODES,
    VIDEO_STUDIO_SPEC_VERSION,
} from '../index.js';
import type {
    AudioCueKind,
    DefectSeverity,
    DefectStatus,
    GateStatus,
    MotionObjectClass,
    VideoAssetKind,
    VideoAssetProvenance,
    VideoCaptionMode,
    VideoDataFormatKind,
    VideoDataShape,
    VideoDataSourceKind,
    VideoFormat,
    VideoGateId,
    VideoGenerationSpec,
    VideoInteractionMode,
    VideoProductionStatus,
    VideoRenderQuality,
    VideoSpecErrorCode,
    VideoSpecValidationOptions,
} from '../index.js';

// ---------------------------------------------------------------------------
// Stage Fixture Builders
// ---------------------------------------------------------------------------

function makeBriefingSpec(): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'Briefing',
        Archetype: {
            Name: 'MetricStory',
        },
        Film: {
            OneSentence: 'Show how Q3 revenue grew by 28% year over year.',
            Audience: 'Executive leadership',
            Purpose: 'Quarterly board update',
            DurationSeconds: 10,
            Formats: ['16:9'],
        },
        Assets: {
            Required: [],
            Approved: [],
            Generate: [],
            NeverInvent: ['company logo', 'ARR metrics'],
        },
        Style: {
            Palette: [],
            Typography: [],
            Composition: '',
            Pacing: {
                AvgSecondsBetweenChanges: 0,
                HoldRules: '',
            },
            MotionRules: [],
            Keep: [],
            Avoid: [],
            References: [],
        },
        Beats: [],
        StateList: [],
        DataBindings: [],
        Audio: {
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

function makeStyledSpec(): VideoGenerationSpec {
    const spec = makeBriefingSpec();
    spec.Status = 'Styled';
    spec.BrandKitID = 'bk-001';
    spec.Assets.Approved = [
        {
            Key: 'brand-logo',
            Kind: 'Logo',
            Source: 'Brand Kit Primary Logo',
            Provenance: 'BrandKit',
            Usage: 'Corner watermark',
            MustUse: true,
        },
        {
            Key: 'brand-font',
            Kind: 'Font',
            Source: 'Brand Kit Display Font',
            Provenance: 'BrandKit',
            Usage: 'Headline typography',
            MustUse: true,
        },
        {
            Key: 'bg-music',
            Kind: 'Music',
            Source: 'Licensed ambient underscore',
            Provenance: 'Supplied',
            Usage: 'Background bed',
            MustUse: false,
        },
        {
            Key: 'whoosh-sfx',
            Kind: 'SoundEffect',
            Source: 'Transition pulse SFX',
            Provenance: 'Supplied',
            Usage: 'Beat transition accent',
            MustUse: false,
        },
    ];
    spec.Style = {
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
    };
    return spec;
}

function makeStoryboardedSpec(): VideoGenerationSpec {
    const spec = makeStyledSpec();
    spec.Status = 'Storyboarded';
    spec.DataBindings = [
        {
            Key: 'q3-rev',
            Source: { Kind: 'Query', QueryID: 'qry-rev-q3' },
            Shape: 'Scalar',
            Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
        },
    ];
    spec.Audio = {
        Narration: {
            VoiceID: 'voice-nova',
            Provider: 'ElevenLabs',
            Script: [
                {
                    Key: 'nar-1',
                    BeatKey: 'beat-1',
                    Text: 'In Q3 2026, recurring revenue climbed to $14.2M.',
                },
                {
                    Key: 'nar-2',
                    BeatKey: 'beat-2',
                    Text: 'Customer retention stayed #1 across 24/7 enterprise tiers.',
                },
            ],
        },
        Music: {
            AssetKey: 'bg-music',
            GainDb: -14,
        },
        Captions: 'Burned',
        Cues: [
            {
                Key: 'cue-1',
                TimestampSeconds: 5,
                Kind: 'Sfx',
                AssetKey: 'whoosh-sfx',
                BeatKey: 'beat-2',
            },
        ],
    };
    spec.Beats = [
        {
            Key: 'beat-1',
            Label: 'Hero Revenue Reveal',
            StartSeconds: 0,
            EndSeconds: 5,
            EntryState: 'Dark slate canvas with brand mark in top-left corner',
            ExitState: 'Headline $14.2M locked at center with Q3 subtitle',
            Purpose: 'Anchor the viewer on the headline Q3 revenue number',
            OnScreenText: ['Q3 2026 Revenue', '{q3-rev}'],
            NarrationKey: 'nar-1',
            AssetRefs: ['brand-logo'],
            DataRefs: ['q3-rev'],
            LayoutNotes: {
                '16:9': 'Centered metric hero with 120px safe margins',
            },
        },
        {
            Key: 'beat-2',
            Label: 'Retention Close',
            StartSeconds: 5,
            EndSeconds: 10,
            EntryState: 'Headline $14.2M transitions up into header bar',
            ExitState: 'Brand sign-off card with logo and summary',
            Purpose: 'Close on operational reliability without extra numeric load',
            OnScreenText: ['Ranked #1 in 2026', '24/7 Enterprise Support'],
            NarrationKey: 'nar-2',
            AssetRefs: ['brand-logo'],
            DataRefs: [],
            LayoutNotes: {
                '16:9': 'Two-column badge and logo lockup',
            },
        },
    ];
    return spec;
}

function makePreProducedSpec(): VideoGenerationSpec {
    const spec = makeStoryboardedSpec();
    spec.Status = 'PreProduced';
    spec.Assets.Approved = spec.Assets.Approved.map((asset, index) => ({
        ...asset,
        FileID: `file-00${index + 1}`,
    }));
    spec.DataSnapshot = {
        AsOf: '2026-10-15T12:00:00Z',
        Inline: { 'q3-rev': 14200000 },
        Sources: ['Query:qry-rev-q3'],
    };
    return spec;
}

function makeDeliveredSpec(): VideoGenerationSpec {
    const spec = makePreProducedSpec();
    spec.Status = 'Delivered';
    spec.Review = {
        Gates: [
            { Gate: 'G1', Status: 'Passed', EvidenceRefs: ['ev-1'], Timestamp: '2026-10-15T12:01:00Z' },
            { Gate: 'G2', Status: 'Passed', EvidenceRefs: ['ev-2'], Timestamp: '2026-10-15T12:02:00Z' },
            { Gate: 'G3', Status: 'Passed', EvidenceRefs: ['ev-3'], Timestamp: '2026-10-15T12:03:00Z' },
            { Gate: 'G4', Status: 'Passed', EvidenceRefs: ['ev-4'], Timestamp: '2026-10-15T12:04:00Z' },
            { Gate: 'G5', Status: 'Passed', EvidenceRefs: ['ev-5'], Timestamp: '2026-10-15T12:05:00Z' },
            { Gate: 'G6', Status: 'Passed', EvidenceRefs: ['ev-6'], Timestamp: '2026-10-15T12:06:00Z' },
        ],
        Rounds: [
            {
                Round: 1,
                Timestamp: '2026-10-15T12:05:00Z',
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 1.5,
                        Format: '16:9',
                        Severity: 'Minor',
                        Criterion: 'readability',
                        Evidence: 'Frame 45 contrast ratio 4.2:1',
                        Fix: 'Increase subtitle opacity to 0.92',
                        Status: 'Fixed',
                    },
                ],
            },
        ],
    };
    spec.Output = {
        Videos: {
            '16:9': {
                FileID: 'file-video-16x9',
                Format: '16:9',
                MimeType: 'video/mp4',
                DurationSeconds: 10,
                Width: 1920,
                Height: 1080,
                FileSizeBytes: 4_500_000,
            },
        },
        PosterFileID: 'file-thumb-1',
        CaptionsFileID: 'file-vtt-16x9',
        RenderMetadata: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.8',
            Seed: 42,
            Fps: 30,
            DurationByFormat: { '16:9': 10 },
            RenderedAt: '2026-10-15T12:06:00Z',
        },
    };
    return spec;
}

function makeValidSpecForStage(stage: VideoProductionStatus): VideoGenerationSpec {
    switch (stage) {
        case 'Briefing':
            return makeBriefingSpec();
        case 'Blocked': {
            const spec = makeBriefingSpec();
            spec.Status = 'Blocked';
            spec.Assets.Required = [
                {
                    Key: 'ceo-headshot',
                    Kind: 'Image',
                    Description: 'Executive quote card portrait',
                    MustUse: true,
                    AllowGenerated: false,
                },
            ];
            return spec;
        }
        case 'Styled':
            return makeStyledSpec();
        case 'Storyboarded':
            return makeStoryboardedSpec();
        case 'Approved': {
            const spec = makeStoryboardedSpec();
            spec.Status = 'Approved';
            return spec;
        }
        case 'PreProduced':
            return makePreProducedSpec();
        case 'Composed': {
            const spec = makePreProducedSpec();
            spec.Status = 'Composed';
            return spec;
        }
        case 'RoughCut': {
            const spec = makePreProducedSpec();
            spec.Status = 'RoughCut';
            return spec;
        }
        case 'Reviewed': {
            const spec = makePreProducedSpec();
            spec.Status = 'Reviewed';
            return spec;
        }
        case 'Delivered':
            return makeDeliveredSpec();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STAGE_REQUIRED_SECTIONS and valid stage fixtures', () => {
    it('maps every VideoProductionStatus to its progressive required sections', () => {
        expect(Object.keys(STAGE_REQUIRED_SECTIONS).sort()).toEqual([...VIDEO_PRODUCTION_STATUSES].sort());
        expect(STAGE_REQUIRED_SECTIONS.Briefing).toEqual(['Film']);
        expect(STAGE_REQUIRED_SECTIONS.Blocked).toEqual(['Film']);
        expect(STAGE_REQUIRED_SECTIONS.Styled).toEqual(['Film', 'Style']);
        expect(STAGE_REQUIRED_SECTIONS.Storyboarded).toEqual(['Film', 'Style', 'Beats', 'NarrationScript']);
        expect(STAGE_REQUIRED_SECTIONS.Approved).toEqual(['Film', 'Style', 'Beats', 'NarrationScript']);
        expect(STAGE_REQUIRED_SECTIONS.PreProduced).toEqual([
            'Film',
            'Style',
            'Beats',
            'NarrationScript',
            'PreProduction',
        ]);
        expect(STAGE_REQUIRED_SECTIONS.Composed).toEqual([
            'Film',
            'Style',
            'Beats',
            'NarrationScript',
            'PreProduction',
        ]);
        expect(STAGE_REQUIRED_SECTIONS.RoughCut).toEqual([
            'Film',
            'Style',
            'Beats',
            'NarrationScript',
            'PreProduction',
        ]);
        expect(STAGE_REQUIRED_SECTIONS.Reviewed).toEqual([
            'Film',
            'Style',
            'Beats',
            'NarrationScript',
            'PreProduction',
        ]);
        expect(STAGE_REQUIRED_SECTIONS.Delivered).toEqual([
            'Film',
            'Style',
            'Beats',
            'NarrationScript',
            'PreProduction',
            'Output',
        ]);
    });

    it.each(VIDEO_PRODUCTION_STATUSES)(
        'returns Valid: true with no errors for a valid %s fixture',
        (stage) => {
            const spec = makeValidSpecForStage(stage);
            const result = ValidateVideoGenerationSpec(spec);
            expect(result).toEqual({ Valid: true, Errors: [] });
        },
    );
});

describe('IsNumericLiteralToken and ExtractNumericLiteralTokens', () => {
    it.each([
        ['$1.2M', true],
        ['12%', true],
        ['3,400', true],
        ['−4.5', true], // Unicode minus U+2212
        ['-4.5', true], // ASCII hyphen-minus
        ['+28%', true],
        ['€400', true],
        ['£99.5K', true],
        ['2.5x', true],
        ['42', true],
        ['($14.2M)', true],
        ['Q3', false],
        ['2026', false],
        ['24/7', false],
        ['#1', false],
        ['Q1', false],
        ['2026-10-15', false],
        ['1st', false],
        ['v1.2', false],
        ['', false],
        ['   ', false],
        ['Revenue', false],
    ])('classifies token %j as %s', (token, expected) => {
        expect(IsNumericLiteralToken(token)).toBe(expected);
    });

    it('extracts quantitative tokens from mixed on-screen text and numbers glued to text', () => {
        expect(
            ExtractNumericLiteralTokens(
                'Q3 2026 Revenue grew 12% to $1.2M with 3,400 users (churn −4.5) #1 24/7',
            ),
        ).toEqual(['12%', '$1.2M', '3,400', '−4.5']);
        expect(ExtractNumericLiteralTokens('Q3/2026 24/7 #1 1st v1.2 2026-10-15')).toEqual([]);
        expect(ExtractNumericLiteralTokens('')).toEqual([]);
        expect(ExtractNumericLiteralTokens('   ')).toEqual([]);
    });

    it.each<[string, string[]]>([
        ['B2B growth', []],
        ['COVID-19 recovery', []],
        ['Web3 tools', []],
        ['3D printing', []],
        ['MP4 export', []],
        ['H2O', []],
        ['28%YoY', ['28%']],
        ['up28%', ['28%']],
        ['$14.2M/qtr', ['$14.2M']],
        ['1.2M→3.4M', ['1.2M', '3.4M']],
        ['4,000 new members', ['4,000']],
        ['2B users', ['2B']],
    ])('ExtractNumericLiteralTokens(%j) returns %j', (input, expected) => {
        expect(ExtractNumericLiteralTokens(input)).toEqual(expected);
    });
});

describe('Runtime union value lists stay in sync with video-generation-spec.ts unions', () => {
    it('matches every union member at both compile time and source-ast level', () => {
        expectTypeOf<(typeof VIDEO_PRODUCTION_STATUSES)[number]>().toEqualTypeOf<VideoProductionStatus>();
        expectTypeOf<(typeof VIDEO_FORMATS)[number]>().toEqualTypeOf<VideoFormat>();
        expectTypeOf<(typeof VIDEO_ASSET_KINDS)[number]>().toEqualTypeOf<VideoAssetKind>();
        expectTypeOf<(typeof VIDEO_ASSET_PROVENANCES)[number]>().toEqualTypeOf<VideoAssetProvenance>();
        expectTypeOf<(typeof MOTION_OBJECT_CLASSES)[number]>().toEqualTypeOf<MotionObjectClass>();
        expectTypeOf<(typeof VIDEO_DATA_SOURCE_KINDS)[number]>().toEqualTypeOf<VideoDataSourceKind>();
        expectTypeOf<(typeof VIDEO_DATA_SHAPES)[number]>().toEqualTypeOf<VideoDataShape>();
        expectTypeOf<(typeof VIDEO_DATA_FORMAT_KINDS)[number]>().toEqualTypeOf<VideoDataFormatKind>();
        expectTypeOf<(typeof AUDIO_CUE_KINDS)[number]>().toEqualTypeOf<AudioCueKind>();
        expectTypeOf<(typeof VIDEO_CAPTION_MODES)[number]>().toEqualTypeOf<VideoCaptionMode>();
        expectTypeOf<(typeof VIDEO_RENDER_QUALITIES)[number]>().toEqualTypeOf<VideoRenderQuality>();
        expectTypeOf<(typeof VIDEO_INTERACTION_MODES)[number]>().toEqualTypeOf<VideoInteractionMode>();
        expectTypeOf<(typeof VIDEO_GATE_IDS)[number]>().toEqualTypeOf<VideoGateId>();
        expectTypeOf<(typeof GATE_STATUSES)[number]>().toEqualTypeOf<GateStatus>();
        expectTypeOf<(typeof DEFECT_SEVERITIES)[number]>().toEqualTypeOf<DefectSeverity>();
        expectTypeOf<(typeof DEFECT_STATUSES)[number]>().toEqualTypeOf<DefectStatus>();

        const specSourcePath = resolve(dirname(fileURLToPath(import.meta.url)), '../video-generation-spec.ts');
        const sourceText = readFileSync(specSourcePath, 'utf8');

        const extractUnionLiterals = (typeName: string): string[] => {
            const regex = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?);`);
            const match = sourceText.match(regex);
            expect(match, `Union ${typeName} not found in video-generation-spec.ts`).not.toBeNull();
            const body = match![1].replace(/\/\/.*$/gm, '');
            return Array.from(body.matchAll(/'([^']+)'/g), (m) => m[1]);
        };

        const runtimePairs: Array<[string, readonly string[]]> = [
            ['VideoProductionStatus', VIDEO_PRODUCTION_STATUSES],
            ['VideoFormat', VIDEO_FORMATS],
            ['VideoAssetKind', VIDEO_ASSET_KINDS],
            ['VideoAssetProvenance', VIDEO_ASSET_PROVENANCES],
            ['MotionObjectClass', MOTION_OBJECT_CLASSES],
            ['VideoDataSourceKind', VIDEO_DATA_SOURCE_KINDS],
            ['VideoDataShape', VIDEO_DATA_SHAPES],
            ['VideoDataFormatKind', VIDEO_DATA_FORMAT_KINDS],
            ['AudioCueKind', AUDIO_CUE_KINDS],
            ['VideoCaptionMode', VIDEO_CAPTION_MODES],
            ['VideoRenderQuality', VIDEO_RENDER_QUALITIES],
            ['VideoInteractionMode', VIDEO_INTERACTION_MODES],
            ['VideoGateId', VIDEO_GATE_IDS],
            ['GateStatus', GATE_STATUSES],
            ['DefectSeverity', DEFECT_SEVERITIES],
            ['DefectStatus', DEFECT_STATUSES],
        ];

        for (const [typeName, runtimeList] of runtimePairs) {
            expect([...runtimeList].sort(), `${typeName} runtime list drifted from union definition`).toEqual(
                extractUnionLiterals(typeName).sort(),
            );
        }
    });
});

describe('One fixture per VideoSpecErrorCode (each proving that code and ONLY that code fires)', () => {
    const singleCodeFixtures: Record<
        VideoSpecErrorCode,
        {
            spec: VideoGenerationSpec;
            stage?: VideoProductionStatus;
            options?: VideoSpecValidationOptions;
            expectedPath: string;
        }
    > = {
        InvalidSpecVersion: (() => {
            const spec = makeBriefingSpec();
            (spec as { SpecVersion: string }).SpecVersion = '0.9';
            return { spec, expectedPath: 'SpecVersion' };
        })(),
        InvalidEnumValue: (() => {
            const spec = makeBriefingSpec();
            (spec.Render as { Quality: string }).Quality = 'ultra';
            return { spec, expectedPath: 'Render.Quality' };
        })(),
        MissingArchetypeName: (() => {
            const spec = makeBriefingSpec();
            spec.Archetype.Name = '   ';
            return { spec, expectedPath: 'Archetype.Name' };
        })(),
        MissingFilmField: (() => {
            const spec = makeBriefingSpec();
            spec.Film.OneSentence = '';
            return { spec, expectedPath: 'Film.OneSentence' };
        })(),
        InvalidFilmDuration: (() => {
            const spec = makeBriefingSpec();
            spec.Film.DurationSeconds = 0;
            return { spec, expectedPath: 'Film.DurationSeconds' };
        })(),
        MissingFilmFormats: (() => {
            const spec = makeBriefingSpec();
            spec.Film.Formats = [];
            return { spec, expectedPath: 'Film.Formats' };
        })(),
        MissingDeliverableFormats: (() => {
            const spec = makeBriefingSpec();
            spec.Deliverables.Formats = [];
            return { spec, expectedPath: 'Deliverables.Formats' };
        })(),
        InvalidRenderConfig: (() => {
            const spec = makeBriefingSpec();
            spec.Render.Fps = 0;
            return { spec, expectedPath: 'Render.Fps' };
        })(),
        InvalidMaxRepairRounds: (() => {
            const spec = makeBriefingSpec();
            spec.Interaction.MaxRepairRounds = -1;
            return { spec, expectedPath: 'Interaction.MaxRepairRounds' };
        })(),
        MissingStyleSection: (() => {
            const spec = makeStyledSpec();
            spec.Style.Composition = '';
            return { spec, expectedPath: 'Style.Composition' };
        })(),
        MissingBeats: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats = [];
            return { spec, expectedPath: 'Beats' };
        })(),
        MissingBeatField: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[1].ExitState = '   ';
            return { spec, expectedPath: 'Beats[1].ExitState' };
        })(),
        InvalidBeatTiming: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats = [
                {
                    ...spec.Beats[0],
                    StartSeconds: 0,
                    EndSeconds: 0,
                },
                {
                    ...spec.Beats[1],
                    StartSeconds: 0,
                    EndSeconds: 10,
                },
            ];
            return { spec, expectedPath: 'Beats[0].EndSeconds' };
        })(),
        BeatsMustStartAtZero: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[0].StartSeconds = BEAT_TIMELINE_TOLERANCE_SECONDS + 0.1;
            return { spec, expectedPath: 'Beats[0].StartSeconds' };
        })(),
        NonContiguousBeats: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[1].StartSeconds = 5.5;
            return { spec, expectedPath: 'Beats[1].StartSeconds' };
        })(),
        BeatsDurationMismatch: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[1].EndSeconds = 9.0;
            return { spec, expectedPath: 'Beats[1].EndSeconds' };
        })(),
        MissingBeatLayoutNote: (() => {
            const spec = makeStoryboardedSpec();
            delete spec.Beats[0].LayoutNotes['16:9'];
            return { spec, expectedPath: 'Beats[0].LayoutNotes.16:9' };
        })(),
        UnknownOnScreenPlaceholder: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[0].OnScreenText = ['Revenue {unknown-binding}'];
            return { spec, expectedPath: 'Beats[0].OnScreenText[0]' };
        })(),
        UnboundNumericOnScreenText: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[1].OnScreenText = ['Revenue jumped 12%'];
            return { spec, expectedPath: 'Beats[1].OnScreenText[0]' };
        })(),
        UnmetMustUseRequirement: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Required = [
                {
                    Key: 'must-have-logo',
                    Kind: 'Logo',
                    Description: 'Primary watermark',
                    MustUse: true,
                    AllowGenerated: false,
                },
            ];
            return { spec, expectedPath: 'Assets.Required[0]' };
        })(),
        GeneratedAssetNotAllowedForRequirement: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Approved = [
                {
                    Key: 'gen-hero',
                    Kind: 'Image',
                    Source: 'Generated abstract prism',
                    Provenance: 'Generated',
                    Usage: 'Hero image',
                    MustUse: false,
                    Generation: {
                        ModelID: 'model-img-1',
                        PromptRunID: 'pr-001',
                        Prompt: 'Abstract geometric glass prism',
                        ReferenceKeys: [],
                    },
                },
            ];
            spec.Assets.Required = [
                {
                    Key: 'gen-hero',
                    Kind: 'Image',
                    Description: 'Product screenshot must be authentic',
                    MustUse: true,
                    AllowGenerated: false,
                },
            ];
            return { spec, expectedPath: 'Assets.Required[0]' };
        })(),
        MissingGeneratedAssetProvenance: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Approved = [
                {
                    Key: 'gen-bg',
                    Kind: 'Image',
                    Source: 'Generated background',
                    Provenance: 'Generated',
                    Usage: 'Backdrop',
                    MustUse: false,
                },
            ];
            return { spec, expectedPath: 'Assets.Approved[0].Generation' };
        })(),
        MissingApprovedAssetSourceId: (() => {
            const spec = makePreProducedSpec();
            delete spec.Assets.Approved[0].FileID;
            return { spec, expectedPath: 'Assets.Approved[0]' };
        })(),
        MissingGenerationPurpose: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Generate = [
                {
                    Key: 'gen-plate',
                    Kind: 'Image',
                    Purpose: '',
                    Prompt: 'Dark studio backdrop',
                    ReferenceKeys: [],
                },
            ];
            return { spec, expectedPath: 'Assets.Generate[0].Purpose' };
        })(),
        MissingGenerationDuration: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Generate = [
                {
                    Key: 'gen-video-no-dur',
                    Kind: 'Video',
                    Purpose: 'Ambient loop',
                    Prompt: 'Slow particles',
                    ReferenceKeys: [],
                },
            ];
            return { spec, expectedPath: 'Assets.Generate[0].DurationSeconds' };
        })(),
        GenerationDurationExceedsLimit: (() => {
            const spec = makeBriefingSpec();
            spec.Assets.Generate = [
                {
                    Key: 'gen-loop',
                    Kind: 'Video',
                    Purpose: 'Ambient background plate',
                    Prompt: 'Slow drifting light streaks',
                    DurationSeconds: 12,
                    ReferenceKeys: [],
                },
            ];
            return {
                spec,
                options: { MaxGeneratedVideoSeconds: 8 },
                expectedPath: 'Assets.Generate[0].DurationSeconds',
            };
        })(),
        UnresolvedReferenceKey: (() => {
            const spec = makeStoryboardedSpec();
            spec.Beats[0].AssetRefs = ['missing-asset-key'];
            return { spec, expectedPath: 'Beats[0].AssetRefs[0]' };
        })(),
        MissingNarrationScript: (() => {
            const spec = makeStoryboardedSpec();
            delete spec.Beats[0].NarrationKey;
            delete spec.Beats[1].NarrationKey;
            delete spec.Audio.Narration;
            return { spec, expectedPath: 'Audio.Narration' };
        })(),
        AudioCueOutsideTimeline: (() => {
            const spec = makeStoryboardedSpec();
            spec.Audio.Cues[0].TimestampSeconds = 12;
            return { spec, expectedPath: 'Audio.Cues[0].TimestampSeconds' };
        })(),
        MissingDataSnapshot: (() => {
            const spec = makePreProducedSpec();
            delete spec.DataSnapshot;
            return { spec, expectedPath: 'DataSnapshot' };
        })(),
        MissingOutputManifest: (() => {
            const spec = makeDeliveredSpec();
            delete spec.Output;
            return { spec, expectedPath: 'Output' };
        })(),
        MissingOutputVideoPayload: (() => {
            const spec = makeDeliveredSpec();
            delete spec.Output!.Videos['16:9']!.FileID;
            return { spec, expectedPath: 'Output.Videos.16:9' };
        })(),
        OutputVideoFormatKeyMismatch: (() => {
            const spec = makeDeliveredSpec();
            (spec.Output!.Videos['16:9'] as { Format: VideoFormat }).Format = '9:16';
            return { spec, expectedPath: 'Output.Videos.16:9.Format' };
        })(),
    };

    it('covers every member of VIDEO_SPEC_ERROR_CODES', () => {
        expect(Object.keys(singleCodeFixtures).sort()).toEqual([...VIDEO_SPEC_ERROR_CODES].sort());
    });

    it.each(VIDEO_SPEC_ERROR_CODES)(
        'fires only %s for its dedicated fixture',
        (errorCode) => {
            const fixture = singleCodeFixtures[errorCode];
            const result = ValidateVideoGenerationSpec(fixture.spec, fixture.stage, fixture.options);
            expect(result.Valid).toBe(false);
            expect(result.Errors.map((e) => e.Code)).toEqual([errorCode]);
            expect(result.Errors[0].Path).toBe(fixture.expectedPath);
            expect(result.Errors[0].Message.length).toBeGreaterThan(10);
        },
    );
});

describe('Cross-references, review round 1 regressions, and multi-error collection', () => {
    it('reports all five errors when a spec has five unrelated problems', () => {
        const spec = makeStoryboardedSpec();
        // 1. InvalidSpecVersion
        (spec as { SpecVersion: string }).SpecVersion = '2.0';
        // 2. MissingFilmField
        spec.Film.Audience = '';
        // 3. MissingBeatField
        spec.Beats[0].Purpose = '';
        // 4. UnboundNumericOnScreenText
        spec.Beats[1].OnScreenText = ['Grew by $3,400'];
        // 5. AudioCueOutsideTimeline
        spec.Audio.Cues[0].TimestampSeconds = -1;

        const result = ValidateVideoGenerationSpec(spec);
        expect(result.Valid).toBe(false);
        expect(result.Errors).toHaveLength(5);
        expect(result.Errors.map((e) => e.Code)).toEqual([
            'InvalidSpecVersion',
            'MissingFilmField',
            'MissingBeatField',
            'UnboundNumericOnScreenText',
            'AudioCueOutsideTimeline',
        ]);
    });

    it('rejects invented numeric literals even when the beat has a bound DataRef placeholder', () => {
        const spec = makeStoryboardedSpec();
        spec.Beats[0].OnScreenText = ['Revenue {q3-rev}, churn down 3%, 4,000 new members'];
        spec.Beats[0].DataRefs = ['q3-rev'];

        const result = ValidateVideoGenerationSpec(spec);
        expect(result.Valid).toBe(false);
        expect(result.Errors.map((e) => e.Code)).toEqual(['UnboundNumericOnScreenText']);
        expect(result.Errors[0].Path).toBe('Beats[0].OnScreenText[0]');
        expect(result.Errors[0].Message).toContain('3%');
        expect(result.Errors[0].Message).toContain('4,000');
    });

    it.each(VIDEO_PRODUCTION_STATUSES)(
        'never throws on empty {} or partial beat objects at stage %s',
        (stage) => {
            expect(() => ValidateVideoGenerationSpec({} as VideoGenerationSpec, stage)).not.toThrow();
            const emptyResult = ValidateVideoGenerationSpec({} as VideoGenerationSpec, stage);
            expect(emptyResult.Valid).toBe(false);
            expect(emptyResult.Errors.length).toBeGreaterThan(0);

            const partialBeatSpec = {
                ...makeBriefingSpec(),
                Beats: [{ Key: 'beat-partial' } as unknown as VideoGenerationSpec['Beats'][number]],
                Assets: {
                    Approved: [],
                    Required: [],
                    Generate: [{ Key: 'gen-partial', Kind: 'Image', Purpose: 'P', Prompt: 'Pr' } as unknown as VideoGenerationSpec['Assets']['Generate'][number]],
                    NeverInvent: [],
                },
            };
            expect(() => ValidateVideoGenerationSpec(partialBeatSpec, stage)).not.toThrow();
            const partialResult = ValidateVideoGenerationSpec(partialBeatSpec, stage);
            expect(partialResult.Valid).toBe(false);
            expect(partialResult.Errors.some((e) => e.Code === 'InvalidBeatTiming')).toBe(true);
        },
    );

    it('reports InvalidBeatTiming on non-finite beat StartSeconds/EndSeconds and AudioCueOutsideTimeline on non-finite cue timestamps', () => {
        const spec = makeStoryboardedSpec();
        (spec.Beats[0] as { StartSeconds: unknown }).StartSeconds = undefined;
        (spec.Beats[1] as { EndSeconds: unknown }).EndSeconds = Number.NaN;
        (spec.Audio.Cues[0] as { TimestampSeconds: unknown }).TimestampSeconds = undefined;

        const result = ValidateVideoGenerationSpec(spec);
        const codePaths = result.Errors.map((e) => `${e.Code}@${e.Path}`);
        expect(codePaths).toContain('InvalidBeatTiming@Beats[0].StartSeconds');
        expect(codePaths).toContain('InvalidBeatTiming@Beats[1].EndSeconds');
        expect(codePaths).toContain('AudioCueOutsideTimeline@Audio.Cues[0].TimestampSeconds');
    });

    it('checks every cross-reference key across Required, Generate, Typography, Beats, and Audio', () => {
        const spec = makeStoryboardedSpec();
        spec.Assets.Required = [
            {
                Key: 'req-logo',
                Kind: 'Logo',
                Description: 'Header mark',
                MustUse: false,
                AllowGenerated: false,
                SatisfiedByAssetKey: 'nonexistent-approved',
            },
        ];
        spec.Assets.Generate = [
            {
                Key: 'gen-1',
                Kind: 'Video',
                Purpose: 'Intro b-roll',
                Prompt: 'Abstract particles',
                DurationSeconds: 4,
                ReferenceKeys: ['brand-kit-only-key', 'missing-ref-key'],
                Keyframes: [
                    { Seconds: 0, AssetKey: 'brand-kit-only-key' },
                    { Seconds: 4, AssetKey: 'missing-kf-key' },
                ],
            },
        ];
        spec.Style.Typography[0].FontAssetKey = 'missing-font-key';
        spec.Beats[0].AssetRefs = ['missing-beat-asset'];
        spec.Beats[0].DataRefs = ['missing-data-binding'];
        spec.Beats[0].OnScreenText = ['{missing-data-binding}'];
        spec.Beats[0].NarrationKey = 'missing-narration-key';
        spec.Audio.Narration!.Script[0].BeatKey = 'missing-beat-key';
        spec.Audio.Music!.AssetKey = 'missing-music-key';
        spec.Audio.Cues[0].AssetKey = 'missing-cue-asset';
        spec.Audio.Cues[0].BeatKey = 'missing-cue-beat';

        const result = ValidateVideoGenerationSpec(spec, spec.Status, {
            BrandKitAssetKeys: ['brand-kit-only-key'],
            MaxGeneratedVideoSeconds: 8,
        });

        expect(result.Valid).toBe(false);
        expect(result.Errors.every((e) => e.Code === 'UnresolvedReferenceKey')).toBe(true);
        expect(result.Errors.map((e) => e.Path)).toEqual([
            'Assets.Required[0].SatisfiedByAssetKey',
            'Assets.Generate[0].ReferenceKeys[1]',
            'Assets.Generate[0].Keyframes[1].AssetKey',
            'Style.Typography[0].FontAssetKey',
            'Beats[0].AssetRefs[0]',
            'Beats[0].DataRefs[0]',
            'Beats[0].NarrationKey',
            'Audio.Narration.Script[0].BeatKey',
            'Audio.Music.AssetKey',
            'Audio.Cues[0].AssetKey',
            'Audio.Cues[0].BeatKey',
        ]);
    });

    it('reports InvalidEnumValue across all union-typed fields when given invalid runtime strings', () => {
        const spec = makeDeliveredSpec();
        (spec as { Status: string }).Status = 'BadStatus';
        (spec.Film.Formats as string[])[0] = '4:3';
        (spec.Deliverables.Formats as string[])[0] = '21:9';
        (spec.Assets.Approved[0] as { Kind: string }).Kind = 'Spreadsheet';
        (spec.Assets.Approved[0] as { Provenance: string }).Provenance = 'Stolen';
        spec.Assets.Required = [
            {
                Key: 'brand-logo',
                Kind: 'BadKind' as VideoAssetKind,
                Description: 'Test',
                MustUse: false,
                AllowGenerated: true,
            },
        ];
        spec.Assets.Generate = [
            {
                Key: 'gen-1',
                Kind: 'Audio' as 'Image',
                Purpose: 'Test',
                Prompt: 'Test prompt',
                Format: '4:3' as VideoFormat,
                ReferenceKeys: [],
            },
        ];
        (spec.Style.MotionRules[0] as { ObjectClass: string }).ObjectClass = 'Spaceship';
        (spec.DataBindings[0].Source as { Kind: string }).Kind = 'CSV';
        (spec.DataBindings[0] as { Shape: string }).Shape = 'Cube';
        (spec.DataBindings[0].Format as { Kind: string }).Kind = 'Hex';
        (spec.Audio as { Captions: string }).Captions = 'Teletext';
        (spec.Audio.Cues[0] as { Kind: string }).Kind = 'Horn';
        (spec.Render as { Quality: string }).Quality = '4k';
        (spec.Interaction as { Mode: string }).Mode = 'Manual';
        (spec.Review.Gates[0] as { Gate: string }).Gate = 'G99';
        (spec.Review.Gates[0] as { Status: string }).Status = 'Skipped';
        (spec.Review.Rounds[0].Defects[0] as { Format: string }).Format = '4:3';
        (spec.Review.Rounds[0].Defects[0] as { Severity: string }).Severity = 'Trivial';
        (spec.Review.Rounds[0].Defects[0] as { Status: string }).Status = 'Ignored';

        const result = ValidateVideoGenerationSpec(spec, 'BadStage' as VideoProductionStatus);
        const enumErrorPaths = result.Errors.filter((e) => e.Code === 'InvalidEnumValue').map((e) => e.Path);
        expect(enumErrorPaths).toEqual([
            'Status',
            'Stage',
            'Film.Formats[0]',
            'Deliverables.Formats[0]',
            'Assets.Approved[0].Kind',
            'Assets.Approved[0].Provenance',
            'Assets.Required[0].Kind',
            'Assets.Generate[0].Kind',
            'Assets.Generate[0].Format',
            'Style.MotionRules[0].ObjectClass',
            'DataBindings[0].Source.Kind',
            'DataBindings[0].Shape',
            'DataBindings[0].Format.Kind',
            'Audio.Captions',
            'Audio.Cues[0].Kind',
            'Render.Quality',
            'Interaction.Mode',
            'Review.Gates[0].Gate',
            'Review.Gates[0].Status',
            'Review.Rounds[0].Defects[0].Format',
            'Review.Rounds[0].Defects[0].Severity',
            'Review.Rounds[0].Defects[0].Status',
        ]);
    });

    it('covers remaining edge branches in Film, Style, Assets, Render, and Output validation', () => {
        const spec = makeStyledSpec();
        spec.Film.Purpose = '';
        spec.Style.Palette = [];
        spec.Style.Typography = [];
        spec.Style.Pacing = { AvgSecondsBetweenChanges: 0, HoldRules: '' };
        spec.Style.MotionRules = [];
        (spec.Render as { Renderer: string }).Renderer = 'Remotion';
        spec.Assets.Generate = [
            {
                Key: 'gen-no-prompt',
                Kind: 'Image',
                Purpose: 'Valid purpose',
                Prompt: '   ',
                DurationSeconds: -2,
                ReferenceKeys: [],
            },
        ];
        spec.Output = {
            Videos: {
                '16:9': {
                    InlineBase64: 'AAAA',
                    Format: '16:9',
                    MimeType: 'video/mp4',
                    DurationSeconds: 10,
                    Width: 1920,
                    Height: 1080,
                    FileSizeBytes: 128,
                },
            },
            RenderMetadata: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.1.8',
                Seed: 42,
                Fps: 30,
                DurationByFormat: { '16:9': 10 },
                RenderedAt: '2026-10-15T12:06:00Z',
            },
        };

        const result = ValidateVideoGenerationSpec(spec, 'Delivered');
        const paths = result.Errors.map((e) => `${e.Code}@${e.Path}`);
        expect(paths).toContain('MissingFilmField@Film.Purpose');
        expect(paths).toContain('MissingStyleSection@Style.Palette');
        expect(paths).toContain('MissingStyleSection@Style.Typography');
        expect(paths).toContain('MissingStyleSection@Style.Pacing');
        expect(paths).toContain('MissingStyleSection@Style.MotionRules');
        expect(paths).toContain('InvalidRenderConfig@Render.Renderer');
        expect(paths).toContain('MissingGenerationPurpose@Assets.Generate[0].Prompt');
        expect(paths).toContain('GenerationDurationExceedsLimit@Assets.Generate[0].DurationSeconds');

        // Also check Render.RendererVersion missing branch and Output missing deliverable format branch
        const spec2 = makeDeliveredSpec();
        spec2.Render.RendererVersion = '';
        spec2.Deliverables.Formats = ['16:9', '9:16'];
        spec2.Beats.forEach((b) => {
            b.LayoutNotes['9:16'] = 'Vertical stack';
        });
        const result2 = ValidateVideoGenerationSpec(spec2, 'Delivered');
        const paths2 = result2.Errors.map((e) => `${e.Code}@${e.Path}`);
        expect(paths2).toContain('InvalidRenderConfig@Render.RendererVersion');
        expect(paths2).toContain('MissingOutputManifest@Output.Videos.9:16');
    });
});

