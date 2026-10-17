import { describe, expect, it } from 'vitest';
import type {
    CheckRequest,
    ContactSheetRequest,
    KeyframeRequest,
    RenderHealth,
    RenderRequest,
    RenderWorkerErrorBody,
    StillsRequest,
    VideoBeatTemplate,
    VideoGenerationSpec,
} from '../index.js';

describe('VideoGenerationSpec & Render Wire Contract Types', () => {
    it('constructs a complete 3-beat KPI briefing VideoGenerationSpec with 1 data binding, 1 generated asset, and 2 formats', () => {
        const spec: VideoGenerationSpec = {
            SpecVersion: '1.0',
            Status: 'Delivered',
            Archetype: {
                ArchetypeID: '11111111-1111-4111-8111-111111111111',
                Name: 'KPI Briefing',
            },
            BrandKitID: '22222222-2222-4222-8222-222222222222',
            CompanyID: '33333333-3333-4333-8333-333333333333',
            Film: {
                OneSentence: 'Q3 ARR grew 28% YoY to $14.2M driven by enterprise expansion.',
                Audience: 'Executive leadership and board members preparing for the Q3 review.',
                Purpose: 'Deliver a 15-second pre-meeting KPI briefing with verified ARR numbers.',
                DurationSeconds: 15,
                Formats: ['16:9', '9:16'],
                Language: 'en-US',
            },
            Assets: {
                Approved: [
                    {
                        Key: 'brand-logo-primary',
                        Kind: 'Logo',
                        FileID: '44444444-4444-4444-8444-444444444444',
                        Source: 'Brand Kit Primary Logo (SVG)',
                        Provenance: 'BrandKit',
                        Usage: 'Corner watermark and closing end card',
                        MustUse: true,
                        StagedPath: 'assets/brand-logo-primary.svg',
                    },
                    {
                        Key: 'hero-abstract-backdrop',
                        Kind: 'Image',
                        FileID: '55555555-5555-4555-8555-555555555555',
                        Source: 'Generated abstract dark slate architectural light streak backdrop',
                        Provenance: 'Generated',
                        Usage: 'Subtle atmospheric texture behind the Hook beat headline',
                        MustUse: false,
                        StagedPath: 'assets/hero-abstract-backdrop.png',
                        Generation: {
                            ModelID: '66666666-6666-4666-8666-666666666666',
                            PromptRunID: '77777777-7777-4777-8777-777777777777',
                            Prompt: 'Minimalist dark slate architectural glass streaks, soft teal rim light, no text, no logos',
                            Seed: 42,
                            ReferenceKeys: ['brand-logo-primary'],
                            Cost: 0.04,
                            C2PA: true,
                        },
                    },
                ],
                Required: [
                    {
                        Key: 'brand-logo-primary',
                        Kind: 'Logo',
                        Description: 'Official company logo for brand attribution on the end card.',
                        MustUse: true,
                        AllowGenerated: false,
                        SatisfiedByAssetKey: 'brand-logo-primary',
                    },
                    {
                        Key: 'hero-abstract-backdrop',
                        Kind: 'Image',
                        Description: 'Optional atmospheric background image behind the opening hook.',
                        MustUse: false,
                        AllowGenerated: true,
                        SatisfiedByAssetKey: 'hero-abstract-backdrop',
                    },
                ],
                Generate: [
                    {
                        Key: 'hero-abstract-backdrop',
                        Kind: 'Image',
                        Prompt: 'Minimalist dark slate architectural glass streaks, soft teal rim light, no text, no logos',
                        Purpose: 'Provide depth behind the opening KPI hook without competing with foreground typography.',
                        Format: '16:9',
                        ReferenceKeys: ['brand-logo-primary'],
                        WantAudio: false,
                    },
                ],
                NeverInvent: ['company logo', 'product UI screenshots', 'customer logos', 'ARR metrics'],
            },
            Style: {
                Palette: [
                    {
                        Name: 'background.primary',
                        Value: '#0F172A',
                        Usage: 'Primary canvas background across all beats',
                    },
                    {
                        Name: 'text.primary',
                        Value: '#F8FAFC',
                        Usage: 'Headlines and primary metric callouts',
                    },
                    {
                        Name: 'accent.positive',
                        Value: '#10B981',
                        Usage: 'Positive YoY delta badge and bar highlight',
                    },
                ],
                Typography: [
                    {
                        Role: 'Headline',
                        FontFamily: 'Inter',
                        Weight: 700,
                        SizeByFormat: {
                            '16:9': '64px',
                            '9:16': '52px',
                        },
                        LineHeight: '1.1',
                        LetterSpacing: '-0.02em',
                    },
                    {
                        Role: 'MetricValue',
                        FontFamily: 'JetBrains Mono',
                        Weight: 700,
                        SizeByFormat: {
                            '16:9': '96px',
                            '9:16': '76px',
                        },
                    },
                ],
                Composition: 'Single dominant metric focal point per beat with generous 12% perimeter safe margin.',
                Pacing: {
                    AvgSecondsBetweenChanges: 2.5,
                    HoldRules: 'Hold final metric values static for at least 1.5s before cut; hold end card for 2.0s.',
                    MinBeatDurationSeconds: 3,
                    MaxBeatDurationSeconds: 7,
                },
                MotionRules: [
                    {
                        ObjectClass: 'Headline',
                        Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        DurationMs: 420,
                        Notes: 'Translate Y 24px -> 0px with opacity fade',
                    },
                    {
                        ObjectClass: 'DataMetric',
                        Easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                        DurationMs: 650,
                        Notes: 'Count up from baseline and settle 1.5s before beat exit',
                    },
                ],
                Texture: 'Subtle 2% monochromatic film grain over dark slate canvas',
                Keep: ['High-contrast tabular numerals', 'Restrained single-axis motion'],
                Avoid: ['Centered text over busy gradients', 'Simultaneous competing charts'],
                References: [
                    {
                        SourceKey: 'brand-logo-primary',
                        PaletteLearned: 'Deep slate background paired with emerald accent preserves executive tone.',
                        TypographyLearned: 'Tight tracking on bold geometric sans headlines.',
                        CompositionLearned: 'Asymmetric left-aligned anchor in 16:9, stacked top-third anchor in 9:16.',
                        PacingLearned: 'Crisp cut on spoken verb with 1.5s metric hold.',
                        MotionLearned: 'Fast-out cubic-bezier entrances without bounce.',
                        DoNotCopy: ['Competitor tagline phrasing'],
                    },
                ],
            },
            Beats: [
                {
                    Key: 'beat-1-hook',
                    Label: 'Hook',
                    StartSeconds: 0,
                    EndSeconds: 4.5,
                    EntryState: 'Dark slate canvas with subtle backdrop fade-in',
                    ExitState: 'Headline locked in upper third ready for metric reveal',
                    Purpose: 'Anchor the viewer on Q3 ARR momentum in the first 2 seconds.',
                    OnScreenText: ['Q3 ARR Momentum', '+28% YoY'],
                    DataRefs: ['kpi.arr.q3'],
                    AssetRefs: ['hero-abstract-backdrop'],
                    NarrationKey: 'narr-1',
                    LayoutNotes: {
                        '16:9': 'Left-aligned headline at 10% inset; growth pill to the right.',
                        '9:16': 'Stacked headline and growth pill centered in upper safe zone.',
                    },
                },
                {
                    Key: 'beat-2-reveal',
                    Label: 'Reveal',
                    StartSeconds: 4.5,
                    EndSeconds: 10.5,
                    EntryState: 'Headline transitions to compact header as KPI counter enters',
                    ExitState: '$14.2M counter settled with YoY comparison bar locked',
                    Purpose: 'Present the verified $14.2M Q3 ARR figure and +28% delta clearly.',
                    OnScreenText: ['$14.2M', '+28% vs Q3 Prior Year'],
                    DataRefs: ['kpi.arr.q3'],
                    AssetRefs: [],
                    NarrationKey: 'narr-2',
                    LayoutNotes: {
                        '16:9': 'Two-column split: giant $14.2M callout left, comparison bar right.',
                        '9:16': 'Vertical stack: $14.2M callout above full-width comparison bar.',
                    },
                },
                {
                    Key: 'beat-3-close',
                    Label: 'Close',
                    StartSeconds: 10.5,
                    EndSeconds: 15,
                    EntryState: 'Metric card scales down into summary badge alongside brand logo',
                    ExitState: 'Static provenance end card held for 2.0s',
                    Purpose: 'Close with takeaway and data provenance timestamp.',
                    OnScreenText: ['Enterprise Expansion Led Q3', 'As of 2026-10-15'],
                    DataRefs: ['kpi.arr.q3'],
                    AssetRefs: ['brand-logo-primary'],
                    NarrationKey: 'narr-3',
                    LayoutNotes: {
                        '16:9': 'Brand logo top-left, summary headline center, provenance footer bottom-left.',
                        '9:16': 'Brand logo top-center, summary card middle, provenance footer above bottom safe margin.',
                    },
                },
            ],
            StateList: ['HOOK', 'METRIC_REVEAL', 'PROVENANCE_CLOSE'],
            DataBindings: [
                {
                    Key: 'kpi.arr.q3',
                    Source: {
                        Kind: 'Query',
                        QueryID: '88888888-8888-4888-8888-888888888888',
                        Parameters: {
                            FiscalQuarter: '2026-Q3',
                        },
                    },
                    Shape: 'Delta',
                    Format: {
                        Kind: 'Currency',
                        Currency: 'USD',
                        Decimals: 1,
                    },
                    Label: 'Q3 Ending ARR',
                },
            ],
            DataSnapshot: {
                Inline: {
                    'kpi.arr.q3': {
                        Current: 14200000,
                        FormattedCurrent: '$14.2M',
                        DeltaPercent: 28,
                        FormattedDelta: '+28%',
                    },
                },
                AsOf: '2026-10-15T14:30:00.000Z',
                Sources: ['Query:88888888-8888-4888-8888-888888888888'],
            },
            Audio: {
                Narration: {
                    VoiceID: 'voice-exec-warm',
                    Provider: 'ElevenLabs',
                    Script: [
                        {
                            Key: 'narr-1',
                            BeatKey: 'beat-1-hook',
                            Text: 'Third quarter recurring revenue accelerated twenty-eight percent year over year.',
                            AudioFileID: '99999999-9999-4999-8999-999999999991',
                            StagedPath: 'audio/narr-1.mp3',
                            StartSeconds: 0.2,
                            DurationSeconds: 3.9,
                            WordTimings: [
                                { Word: 'Third', StartSeconds: 0.2, EndSeconds: 0.5 },
                                { Word: 'quarter', StartSeconds: 0.5, EndSeconds: 0.9 },
                            ],
                        },
                        {
                            Key: 'narr-2',
                            BeatKey: 'beat-2-reveal',
                            Text: 'Ending ARR reached fourteen point two million dollars.',
                            AudioFileID: '99999999-9999-4999-8999-999999999992',
                            StagedPath: 'audio/narr-2.mp3',
                            StartSeconds: 4.7,
                            DurationSeconds: 4.2,
                        },
                        {
                            Key: 'narr-3',
                            BeatKey: 'beat-3-close',
                            Text: 'Enterprise expansion led the quarter.',
                            AudioFileID: '99999999-9999-4999-8999-999999999993',
                            StagedPath: 'audio/narr-3.mp3',
                            StartSeconds: 10.7,
                            DurationSeconds: 2.3,
                        },
                    ],
                },
                Cues: [
                    {
                        Key: 'cue-reveal-tick',
                        TimestampSeconds: 4.5,
                        Kind: 'Sfx',
                        BeatKey: 'beat-2-reveal',
                        Notes: 'Subtle low-frequency pulse aligned with KPI counter entrance',
                    },
                ],
                Captions: 'Sidecar',
            },
            Render: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.9.0',
                Fps: 30,
                Seed: 104729,
                Quality: 'standard',
            },
            Interaction: {
                Mode: 'Autonomous',
                MaxRepairRounds: 2,
            },
            Deliverables: {
                Formats: ['16:9', '9:16'],
                Poster: true,
                ContactSheets: true,
                Source: true,
                Captions: true,
            },
            Review: {
                Gates: [
                    {
                        Gate: 'G1',
                        Status: 'Passed',
                        EvidenceRefs: ['Query:88888888-8888-4888-8888-888888888888'],
                        Timestamp: '2026-10-15T14:30:05.000Z',
                    },
                    {
                        Gate: 'G6',
                        Status: 'Passed',
                        EvidenceRefs: [
                            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
                        ],
                        Timestamp: '2026-10-15T14:32:00.000Z',
                    },
                ],
                Rounds: [
                    {
                        Round: 1,
                        Timestamp: '2026-10-15T14:31:20.000Z',
                        ContactSheetFileIDs: {
                            '16:9': ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'],
                            '9:16': ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'],
                        },
                        Defects: [],
                        Summary: 'All numbers match snapshot; typography and safe margins pass on both formats.',
                    },
                ],
                Scores: {
                    OverallScore: 95,
                    MaxScore: 100,
                    Passed: true,
                    Criteria: [
                        {
                            Criterion: 'data_fidelity',
                            Score: 10,
                            MaxScore: 10,
                            Passed: true,
                            Notes: 'Exact match with kpi.arr.q3 snapshot.',
                        },
                    ],
                },
            },
            Output: {
                Videos: {
                    '16:9': {
                        Format: '16:9',
                        FileID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                        MimeType: 'video/mp4',
                        Width: 1920,
                        Height: 1080,
                        DurationSeconds: 15,
                        FileSizeBytes: 4194304,
                    },
                    '9:16': {
                        Format: '9:16',
                        FileID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
                        MimeType: 'video/mp4',
                        Width: 1080,
                        Height: 1920,
                        DurationSeconds: 15,
                        FileSizeBytes: 3981312,
                    },
                },
                PosterFileID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                ContactSheetFileIDs: {
                    '16:9': ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'],
                    '9:16': ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'],
                },
                CaptionsFileID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
                Source: {
                    '16:9': {
                        Format: '16:9',
                        EntryFile: 'index.html',
                        Files: {
                            'index.html': '<!doctype html><html><body></body></html>',
                        },
                        AssetKeys: ['brand-logo-primary', 'hero-abstract-backdrop'],
                    },
                    '9:16': {
                        Format: '9:16',
                        EntryFile: 'index.html',
                        Files: {
                            'index.html': '<!doctype html><html><body></body></html>',
                        },
                        AssetKeys: ['brand-logo-primary', 'hero-abstract-backdrop'],
                    },
                },
                RenderMetadata: {
                    Renderer: 'HyperFrames',
                    RendererVersion: '0.9.0',
                    Seed: 104729,
                    Fps: 30,
                    DurationByFormat: {
                        '16:9': 15,
                        '9:16': 15,
                    },
                    RenderedAt: '2026-10-15T14:31:55.000Z',
                },
                GenerationProvenance: {
                    Assets: [
                        {
                            AssetKey: 'hero-abstract-backdrop',
                            Kind: 'Image',
                            ModelID: '66666666-6666-4666-8666-666666666666',
                            PromptRunID: '77777777-7777-4777-8777-777777777777',
                            Cost: 0.04,
                            C2PA: true,
                        },
                    ],
                    TotalVideoSeconds: 0,
                    TotalCost: 0.04,
                },
                CriticRounds: 1,
            },
        };

        expect(spec.SpecVersion).toBe('1.0');
        expect(spec.Beats).toHaveLength(3);
        expect(spec.DataBindings).toHaveLength(1);
        expect(spec.Assets.Generate).toHaveLength(1);
        expect(spec.Deliverables.Formats).toEqual(['16:9', '9:16']);
        expect(spec.Output?.Videos['16:9']?.Width).toBe(1920);
        expect(spec.Output?.Videos['9:16']?.Height).toBe(1920);
    });

    it('constructs a complete RenderRequest and related worker wire contract shapes', () => {
        const renderRequest: RenderRequest = {
            JobID: 'job-kpi-briefing-16x9',
            Bundle: {
                Format: '16:9',
                EntryFile: 'index.html',
                Files: [
                    {
                        Path: 'index.html',
                        Content: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body></body></html>',
                    },
                    {
                        Path: 'styles.css',
                        Content: 'body { margin: 0; background: #0F172A; color: #F8FAFC; }',
                    },
                ],
                Assets: [
                    {
                        Key: 'brand-logo-primary',
                        RelativePath: 'assets/brand-logo-primary.svg',
                        MimeType: 'image/svg+xml',
                        DataBase64: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
                    },
                ],
                DataSnapshot: {
                    'kpi.arr.q3': {
                        Current: 14200000,
                        FormattedCurrent: '$14.2M',
                    },
                },
                Seed: 104729,
            },
            Width: 1920,
            Height: 1080,
            Fps: 30,
            DurationSeconds: 15,
            Quality: 'standard',
            TimeoutMs: 120000,
        };

        const beatTemplate: VideoBeatTemplate = {
            Key: 'hook',
            Label: 'Hook',
            Purpose: 'State the headline metric takeaway in the first 3 seconds.',
            MinDurationSeconds: 2,
            MaxDurationSeconds: 5,
            DefaultDurationSeconds: 3.5,
            RequiresDataBinding: true,
        };

        const stillsRequest: StillsRequest = {
            Bundle: renderRequest.Bundle,
            Width: 1920,
            Height: 1080,
            Points: [
                {
                    Key: 'beat-1-mid',
                    TimestampSeconds: 2.25,
                    BeatKey: 'beat-1-hook',
                    Role: 'BeatMidpoint',
                    Label: 'Hook @ 2.25s',
                },
            ],
            ImageFormat: 'png',
        };

        const contactSheetRequest: ContactSheetRequest = {
            Format: '16:9',
            Stills: [
                {
                    Key: 'beat-1-mid',
                    TimestampSeconds: 2.25,
                    BeatKey: 'beat-1-hook',
                    Role: 'BeatMidpoint',
                    MimeType: 'image/png',
                    Width: 1920,
                    Height: 1080,
                    ImageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                },
            ],
            Columns: 3,
            MaxTilesPerSheet: 6,
            IncludeTransitionStrip: true,
        };

        const checkRequest: CheckRequest = {
            Bundle: renderRequest.Bundle,
            Width: 1920,
            Height: 1080,
            SampleTimestampsSeconds: [2.25, 7.5, 12.75],
            AllowedDataLiterals: ['$14.2M', '+28%', '2026-10-15'],
        };

        const keyframeRequest: KeyframeRequest = {
            VideoBase64: 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=',
            MimeType: 'video/mp4',
            MaxFrames: 12,
            BuildContactSheet: true,
        };

        const health: RenderHealth = {
            Healthy: true,
            NodeVersion: 'v24.18.0',
            HyperFramesVersion: '0.9.0',
            ChromiumVersion: '134.0.6998.35',
            FfmpegVersion: '7.1',
            Errors: [],
        };

        const geometryMismatchError: RenderWorkerErrorBody = {
            Code: 'GEOMETRY_MISMATCH',
            Message: 'Entry HTML data-width (1280) does not match request Width (1920).',
        };

        expect(renderRequest.Bundle.Format).toBe('16:9');
        expect(renderRequest.Bundle.Files).toHaveLength(2);
        expect(beatTemplate.Key).toBe('hook');
        expect(stillsRequest.Points).toHaveLength(1);
        expect(contactSheetRequest.Stills).toHaveLength(1);
        expect(checkRequest.AllowedDataLiterals).toContain('$14.2M');
        expect(keyframeRequest.MaxFrames).toBe(12);
        expect(health.Healthy).toBe(true);
        expect(geometryMismatchError.Code).toBe('GEOMETRY_MISMATCH');
    });
});
