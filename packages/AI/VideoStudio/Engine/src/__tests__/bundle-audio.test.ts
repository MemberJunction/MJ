import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_DUCKING_SETTINGS,
    DEFAULT_LOUDNESS_TARGET,
    MJ_NARRATION_CUES_PATH,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import * as storageModule from '../storage.js';
import * as dataSnapshotModule from '../data/data-snapshot.js';
import { BuildRenderAudioMix, BuildRenderBundle, CheckProductionRules } from '../render/bundle.js';
import { BuildDefaultAudioSettings } from '../render/render-settings.js';

const mockUser = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Test User' } as unknown as UserInfo;

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


function withAudio(spec: VideoGenerationSpec): VideoGenerationSpec {
    spec.Assets.Approved.push(
        { Key: 'track', Kind: 'Music', FileID: 'f-track', Source: 'Supplied', Provenance: 'Supplied', Usage: 'bed', MustUse: false, StagedPath: 'assets/track.mp3' },
        { Key: 'pop', Kind: 'SoundEffect', FileID: 'f-pop', Source: 'Supplied', Provenance: 'Supplied', Usage: 'pop', MustUse: false, StagedPath: 'assets/pop.wav' },
    );
    spec.Audio.Narration!.Script[0].SpokenText = 'Revenue reached twelve point five million dollars.';
    spec.Audio.Narration!.Script[0].WordTimings = [{ Word: 'Revenue', StartSeconds: 0.3, EndSeconds: 0.7 }];
    spec.Audio.Narration!.Script.push({ Key: 'line-unsynth', BeatKey: 'beat-2', Text: 'Not synthesized yet.' });
    spec.Audio.Music = { AssetKey: 'track' };
    spec.Audio.Cues = [
        { Key: 'pop', TimestampSeconds: 1, Kind: 'Sfx', AssetKey: 'pop', GainDb: -4 },
        { Key: 'whoosh', TimestampSeconds: 4, Kind: 'Sfx', Synth: 'Whoosh' },
        { Key: 'riser', TimestampSeconds: 6, Kind: 'Sfx', Synth: 'Riser', DurationSeconds: 2 },
        { Key: 'duck', TimestampSeconds: 7, Kind: 'MusicDuck' },
        { Key: 'swell', TimestampSeconds: 8.5, Kind: 'MusicSwell', GainDb: 5, DurationSeconds: 1 },
        { Key: 'hush', TimestampSeconds: 9, Kind: 'Silence' },
    ];
    return spec;
}

describe('BuildRenderAudioMix', () => {
    it('plans narration, ducked licensed music, effects, and explicit music events from the spec', () => {
        const plan = BuildRenderAudioMix(withAudio(makeMinimalSpec()), 10);
        expect(plan.DurationSeconds).toBe(10);
        expect(plan.Seed).toBe(42);
        expect(plan.Narration).toEqual([
            {
                Key: 'line-1',
                BeatKey: 'beat-1',
                Src: 'audio/line-1.mp3',
                StartSeconds: 0,
                DurationSeconds: 3.5,
                Text: 'Revenue reached twelve point five million dollars.',
                WordTimings: [{ Word: 'Revenue', StartSeconds: 0.3, EndSeconds: 0.7 }],
            },
        ]);
        expect(plan.Music).toEqual({ Src: 'assets/track.mp3', GainDb: -15 });
        expect(plan.Sfx).toEqual([
            { Key: 'pop', StartSeconds: 1, GainDb: -4, Src: 'assets/pop.wav' },
            { Key: 'whoosh', StartSeconds: 4, GainDb: -1, Synth: 'Whoosh' },
            { Key: 'riser', StartSeconds: 6, GainDb: -1, DurationSeconds: 2, Synth: 'Riser' },
        ]);
        expect(plan.MusicEvents).toEqual([
            { Key: 'duck', Kind: 'Duck', StartSeconds: 7, DurationSeconds: 2, GainDb: -7.5 },
            { Key: 'swell', Kind: 'Swell', StartSeconds: 8.5, DurationSeconds: 1, GainDb: 5 },
        ]);
        expect(plan.Ducking).toEqual(DEFAULT_DUCKING_SETTINGS);
        expect(plan.Loudness).toEqual(DEFAULT_LOUDNESS_TARGET);
        expect(plan.Checks).toEqual(DEFAULT_AUDIO_CHECK_THRESHOLDS);
    });

    it('uses an opt-in synthesized bed when no licensed track is set, louder without narration', () => {
        const spec = makeMinimalSpec();
        spec.Audio.Narration!.Enabled = false;
        spec.Audio.Music = { Synthesized: { Mood: 'Calm', Bpm: 84, Key: 'F' } };
        const audio = BuildDefaultAudioSettings();
        audio.Loudness.IntegratedLufs = -16;
        const plan = BuildRenderAudioMix(spec, 10, audio);
        expect(plan.Narration).toEqual([]);
        expect(plan.Music).toEqual({ Synthesized: { Mood: 'Calm', Bpm: 84, Key: 'F' }, GainDb: -2 });
        expect(plan.Loudness.IntegratedLufs).toBe(-16);
    });

    it('omits music whose licensed asset is not staged', () => {
        const spec = makeMinimalSpec();
        spec.Audio.Music = { AssetKey: 'missing', GainDb: -12 };
        expect(BuildRenderAudioMix(spec, 10).Music).toBeUndefined();
    });
});

describe('narration cues in the bundle', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(storageModule, 'ReadStoredFile').mockImplementation(async (id: string) => Buffer.from(`x:${id}`));
        vi.spyOn(storageModule, 'ReadStoredFileWithType').mockImplementation(async (id: string) => ({ Bytes: Buffer.from(`x:${id}`) }));
        vi.spyOn(dataSnapshotModule, 'LoadDataSnapshotValues').mockResolvedValue({ revenue: 12500000 });
    });

    it('stages mj/narration-cues.js with the word timings and loads it from the entry file', async () => {
        const spec = withAudio(makeMinimalSpec());
        spec.Output!.Source!['16:9']!.Files['index.html'] = '<!doctype html><html><head><title>t</title></head><body>$12.5M</body></html>';
        const bundle = await BuildRenderBundle(spec, '16:9', { ContextUser: mockUser });
        const cues = bundle.Files.find((f) => f.Path === MJ_NARRATION_CUES_PATH);
        expect(cues?.Content).toContain('window.mjCue');
        expect(cues?.Content).toContain('"Revenue"');
        const entry = bundle.Files.find((f) => f.Path === 'index.html')?.Content ?? '';
        expect(entry).toContain(`<head><script src="${MJ_NARRATION_CUES_PATH}"></script><title>`);
    });
});

describe('CheckProductionRules: narration cue references', () => {
    it('flags literal mjCue calls that cannot resolve, with file and line', () => {
        const spec = withAudio(makeMinimalSpec());
        spec.Audio.Narration!.Script[0].StartSeconds = 0;
        spec.Output!.Source!['16:9']!.Files['main.js'] = [
            "const ok = mjCue('line-1', 'revenue');",
            "const bad = mjCue('line-1', 'profit');",
            "const gone = mjCue('line-9', 'x');",
        ].join('\n');
        const issues = CheckProductionRules(spec, { MaxGeneratedVideoSeconds: 40 }).filter((i) => i.Code === 'UnresolvedNarrationCue');
        expect(issues.map((i) => [i.File, i.Line, i.Severity])).toEqual([
            ['main.js', 2, 'Error'],
            ['main.js', 3, 'Error'],
        ]);
        expect(issues[0].Message).toContain('never says "profit"');
    });
});
