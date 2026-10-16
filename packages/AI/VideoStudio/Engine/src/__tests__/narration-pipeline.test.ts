import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechAlignment, SpeechResult } from '@memberjunction/ai';
import { UserInfo } from '@memberjunction/core';
import {
    VIDEO_STUDIO_SPEC_VERSION,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

const {
    mockRunTextToSpeech,
    mockAiEngineState,
    mockStorageState,
    mockLogError,
} = vi.hoisted(() => ({
    mockRunTextToSpeech: vi.fn(),
    mockAiEngineState: {
        Config: vi.fn().mockResolvedValue(undefined),
        Models: [] as Record<string, unknown>[],
        ModelTypes: [] as Record<string, unknown>[],
        ModelVendors: [] as Record<string, unknown>[],
        Vendors: [] as Record<string, unknown>[],
        VendorTypeDefinitions: [] as Record<string, unknown>[],
    },
    mockStorageState: {
        Config: vi.fn().mockResolvedValue(undefined),
        HasStorageAccounts: true,
        UploadFile: vi.fn(),
    },
    mockLogError: vi.fn(),
}));

vi.mock('@memberjunction/ai-prompts', () => {
    class MockAITextToSpeechRunner {
        public Provider?: unknown;
        public RunTextToSpeech = mockRunTextToSpeech;
    }
    return {
        AITextToSpeechRunner: MockAITextToSpeechRunner,
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        get Instance() {
            return mockAiEngineState;
        },
    },
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageEngine: {
        get Instance() {
            return mockStorageState;
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: mockLogError,
    };
});

import {
    ResolveNarrationModelID,
    RunNarrationPipeline,
} from '../narration/narration-pipeline.js';

const fakeUser = { ID: 'user-001', Name: 'Test User' } as unknown as UserInfo;

function makeAlignmentForWord(word: string, startSec: number, endSec: number): SpeechAlignment {
    const chars = word.split('');
    const step = chars.length > 0 ? (endSec - startSec) / chars.length : 0;
    return {
        Characters: chars,
        StartSeconds: chars.map((_c, idx) => Number((startSec + idx * step).toFixed(3))),
        EndSeconds: chars.map((_c, idx) => Number((startSec + (idx + 1) * step).toFixed(3))),
    };
}

function makeBaseSpec(): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'Storyboarded',
        Archetype: { Name: 'MetricStory' },
        Film: {
            OneSentence: 'Test narration pipeline.',
            Audience: 'Engineering',
            Purpose: 'Verification',
            DurationSeconds: 10,
            Formats: ['16:9'],
        },
        Assets: {
            Required: [],
            Approved: [],
            Generate: [],
            NeverInvent: [],
        },
        Style: {
            Palette: [],
            Typography: [],
            Composition: '',
            Pacing: { AvgSecondsBetweenChanges: 4, HoldRules: '' },
            MotionRules: [],
            Keep: [],
            Avoid: [],
            References: [],
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Beat 1',
                StartSeconds: 0,
                EndSeconds: 5,
                EntryState: 'Start',
                ExitState: 'End',
                Purpose: 'Intro',
                OnScreenText: ['{kpi.revenue}'],
                NarrationKey: 'line-1',
                DataRefs: ['kpi.revenue'],
                AssetRefs: [],
                LayoutNotes: { '16:9': 'Center' },
            },
            {
                Key: 'beat-2',
                Label: 'Beat 2',
                StartSeconds: 5,
                EndSeconds: 10,
                EntryState: 'Mid',
                ExitState: 'Done',
                Purpose: 'Outro',
                OnScreenText: ['Summary'],
                NarrationKey: 'line-2',
                DataRefs: [],
                AssetRefs: [],
                LayoutNotes: { '16:9': 'Center' },
            },
        ],
        StateList: [],
        DataBindings: [],
        Audio: {
            Narration: {
                VoiceID: 'voice-eleven-123',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'line-1',
                        BeatKey: 'beat-1',
                        Text: 'Revenue reached {kpi.revenue}.',
                    },
                    {
                        Key: 'line-2',
                        BeatKey: 'beat-2',
                        Text: 'Momentum stayed strong.',
                    },
                ],
            },
            Captions: 'Burned',
            Cues: [],
        },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.8',
            Fps: 30,
            Seed: 7,
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

describe('RunNarrationPipeline and ResolveNarrationModelID', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiEngineState.Models = [
            {
                ID: 'model-openai-tts',
                Name: 'OpenAI TTS',
                IsActive: true,
                AIModelType: 'TTS',
                PowerRank: 100,
                ModelVendors: [
                    { Vendor: 'OpenAI', Status: 'Active', Type: 'Inference Provider' },
                ],
            },
            {
                ID: 'model-eleven-v3',
                Name: 'Eleven Labs',
                IsActive: true,
                AIModelType: 'TTS',
                PowerRank: 5,
                ModelVendors: [
                    { Vendor: 'Eleven Labs', Status: 'Active', Type: 'Inference Provider' },
                ],
            },
            {
                ID: 'model-eleven-v4',
                Name: 'Eleven v4',
                IsActive: true,
                AIModelType: 'TTS',
                PowerRank: 15,
                ModelVendors: [
                    { Vendor: 'Eleven Labs', Status: 'Active', Type: 'Inference Provider' },
                ],
            },
        ];
        mockStorageState.HasStorageAccounts = true;
        let uploadCounter = 0;
        mockStorageState.UploadFile.mockImplementation(async () => {
            uploadCounter += 1;
            return { FileID: `file-uploaded-${uploadCounter}` };
        });
    });

    it('matches ElevenLabs to metadata vendor "Eleven Labs" and picks highest PowerRank', () => {
        expect(ResolveNarrationModelID('ElevenLabs')).toBe('model-eleven-v4');
        expect(ResolveNarrationModelID('eleven-labs')).toBe('model-eleven-v4');
        expect(ResolveNarrationModelID('UnknownVendor')).toBeUndefined();
    });

    it('emits one Error issue and never calls AITextToSpeechRunner when no TTS model matches', async () => {
        const spec = makeBaseSpec();
        spec.Audio.Narration!.Provider = 'NonExistentProvider';

        const result = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            BindingText: { 'kpi.revenue': '$14.2M' },
        });

        expect(mockRunTextToSpeech).not.toHaveBeenCalled();
        expect(result.Clips).toEqual([]);
        expect(result.Issues).toEqual([
            expect.objectContaining({
                Code: 'NarrationModelNotFound',
                Severity: 'Error',
            }),
        ]);
    });

    it('skips model resolution when options.ModelID is explicitly supplied', async () => {
        const spec = makeBaseSpec();
        spec.Audio.Narration!.Script = [
            { Key: 'line-1', BeatKey: 'beat-1', Text: 'Direct model pin.' },
        ];
        mockRunTextToSpeech.mockResolvedValueOnce({
            Success: true,
            PromptRunID: 'pr-1',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.alloc(16_000),
                Alignment: makeAlignmentForWord('Direct', 0.0, 1.5),
            } satisfies SpeechResult,
        });

        await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            ModelID: 'explicit-model-id',
        });

        expect(mockAiEngineState.Config).not.toHaveBeenCalled();
        expect(mockRunTextToSpeech).toHaveBeenCalledTimes(1);
        expect(mockRunTextToSpeech).toHaveBeenCalledWith(
            expect.objectContaining({
                ModelID: 'explicit-model-id',
                IncludeTimestamps: true,
                voice: 'voice-eleven-123',
                output_format: 'mp3_44100_128',
            }),
        );
    });

    it('substitutes {BindingKey} placeholders for TTS while preserving authored NarrationLine.Text, and skips lines with unresolved placeholders', async () => {
        const spec = makeBaseSpec();
        spec.Audio.Narration!.Script = [
            {
                Key: 'line-resolved',
                BeatKey: 'beat-1',
                Text: 'Revenue reached {kpi.revenue} this quarter.',
            },
            {
                Key: 'line-unresolved',
                BeatKey: 'beat-2',
                Text: 'Pipeline grew by {kpi.missing}.',
            },
        ];

        mockRunTextToSpeech.mockResolvedValueOnce({
            Success: true,
            PromptRunID: 'pr-resolved',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.from('audio-1'),
                Alignment: makeAlignmentForWord('Revenue', 0.0, 2.5),
            } satisfies SpeechResult,
        });

        const result = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            BindingText: { 'kpi.revenue': '$14.2M' },
        });

        expect(mockRunTextToSpeech).toHaveBeenCalledTimes(1);
        expect(mockRunTextToSpeech).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'Revenue reached $14.2M this quarter.',
                IncludeTimestamps: true,
                ModelID: 'model-eleven-v4',
                voice: 'voice-eleven-123',
            }),
        );
        expect(result.Spec.Audio.Narration!.Script[0].Text).toBe(
            'Revenue reached {kpi.revenue} this quarter.',
        );
        expect(result.Issues).toContainEqual(
            expect.objectContaining({
                Code: 'UnresolvedPlaceholder',
                Severity: 'Error',
                LineKey: 'line-unresolved',
                BeatKey: 'beat-2',
            }),
        );
    });

    it('applies duration precedence: usage seconds > alignment end > CBR byte estimate', async () => {
        const spec = makeBaseSpec();
        spec.Beats = [
            { ...spec.Beats[0], Key: 'b1', StartSeconds: 0, EndSeconds: 3, NarrationKey: 'l1' },
            { ...spec.Beats[1], Key: 'b2', StartSeconds: 3, EndSeconds: 6, NarrationKey: 'l2' },
            { ...spec.Beats[1], Key: 'b3', StartSeconds: 6, EndSeconds: 9, NarrationKey: 'l3' },
        ];
        spec.Audio.Narration!.Script = [
            { Key: 'l1', BeatKey: 'b1', Text: 'Usage wins.' },
            { Key: 'l2', BeatKey: 'b2', Text: 'Alignment wins.' },
            { Key: 'l3', BeatKey: 'b3', Text: 'CBR estimate wins.' },
        ];

        // Line 1: both usage (3.7s) and alignment (2.1s) present -> usage (3.7s) wins
        mockRunTextToSpeech.mockResolvedValueOnce({
            Success: true,
            PromptRunID: 'pr-1',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.alloc(64_000),
                usage: { unitKind: 'Seconds', outputUnits: 3.7 } as SpeechResult['usage'],
                Alignment: makeAlignmentForWord('Usage', 0.0, 2.1),
            } satisfies SpeechResult,
        });

        // Line 2: no usage, alignment ends at 4.4s, 64_000 bytes (4.0s CBR) -> alignment (4.4s) wins
        mockRunTextToSpeech.mockResolvedValueOnce({
            Success: true,
            PromptRunID: 'pr-2',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.alloc(64_000),
                Alignment: makeAlignmentForWord('Alignment', 0.0, 4.4),
            } satisfies SpeechResult,
        });

        // Line 3: no usage, no alignment, 32_000 bytes -> 32_000 * 8 / 128_000 = 2.0s CBR estimate + NoWordTimings warning
        mockRunTextToSpeech.mockResolvedValueOnce({
            Success: true,
            PromptRunID: 'pr-3',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.alloc(32_000),
            } satisfies SpeechResult,
        });

        const result = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            ModelID: 'model-eleven-v4',
        });

        const fittedLines = result.Spec.Audio.Narration!.Script;
        expect(fittedLines[0].DurationSeconds).toBe(3.7);
        expect(fittedLines[1].DurationSeconds).toBe(4.4);
        expect(fittedLines[2].DurationSeconds).toBe(2.0);
        expect(result.Issues).toContainEqual(
            expect.objectContaining({
                Code: 'NoWordTimings',
                Severity: 'Warning',
                LineKey: 'l3',
            }),
        );
    });

    it('handles storage configured, no storage accounts, and upload failure without throwing', async () => {
        const spec = makeBaseSpec();
        spec.Audio.Narration!.Script = [
            { Key: 'line-1', BeatKey: 'beat-1', Text: 'First clip.' },
            { Key: 'line-2', BeatKey: 'beat-2', Text: 'Second clip.' },
        ];

        mockRunTextToSpeech
            .mockResolvedValueOnce({
                Success: true,
                PromptRunID: 'pr-1',
                SpeechResult: {
                    success: true,
                    content: '',
                    data: Buffer.from('bytes-1'),
                    Alignment: makeAlignmentForWord('First', 0.0, 1.2),
                } satisfies SpeechResult,
            })
            .mockResolvedValueOnce({
                Success: true,
                PromptRunID: 'pr-2',
                SpeechResult: {
                    success: true,
                    content: '',
                    data: Buffer.from('bytes-2'),
                    Alignment: makeAlignmentForWord('Second', 0.0, 1.5),
                } satisfies SpeechResult,
            });

        // First upload succeeds, second upload throws, captions upload succeeds
        mockStorageState.UploadFile
            .mockResolvedValueOnce({ FileID: 'file-clip-1' })
            .mockRejectedValueOnce(new Error('S3 network error'))
            .mockResolvedValueOnce({ FileID: 'file-captions-vtt' });

        const result = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            ModelID: 'model-eleven-v4',
        });

        expect(result.Spec.Audio.Narration!.Script[0].AudioFileID).toBe('file-clip-1');
        expect(result.Spec.Audio.Narration!.Script[1].AudioFileID).toBeUndefined();
        expect(result.Clips[0].FileID).toBe('file-clip-1');
        expect(result.Clips[1].FileID).toBeUndefined();
        expect(result.Clips[1].Data.toString()).toBe('bytes-2');
        expect(result.CaptionsFileID).toBe('file-captions-vtt');
        expect(result.Issues).toContainEqual(
            expect.objectContaining({
                Code: 'ClipNotStored',
                Severity: 'Warning',
                LineKey: 'line-2',
            }),
        );

        // Now verify HasStorageAccounts = false
        mockStorageState.HasStorageAccounts = false;
        mockRunTextToSpeech.mockResolvedValue({
            Success: true,
            PromptRunID: 'pr-no-acct',
            SpeechResult: {
                success: true,
                content: '',
                data: Buffer.from('bytes-no-acct'),
                Alignment: makeAlignmentForWord('Clip', 0.0, 1.0),
            } satisfies SpeechResult,
        });

        const noAcctResult = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            ModelID: 'model-eleven-v4',
        });
        expect(noAcctResult.Clips).toHaveLength(2);
        expect(noAcctResult.Clips[0].FileID).toBeUndefined();
        expect(noAcctResult.Issues.filter((i) => i.Code === 'ClipNotStored')).toHaveLength(2);
    });

    it('omits captions when Audio.Captions === "None" and continues after a failed line', async () => {
        const spec = makeBaseSpec();
        spec.Audio.Captions = 'None';
        spec.Audio.Narration!.Script = [
            { Key: 'line-fail', BeatKey: 'beat-1', Text: 'Will fail.' },
            { Key: 'line-ok', BeatKey: 'beat-2', Text: 'Will succeed.' },
        ];

        mockRunTextToSpeech
            .mockResolvedValueOnce({
                Success: false,
                ErrorMessage: 'Rate limit exceeded',
            })
            .mockResolvedValueOnce({
                Success: true,
                PromptRunID: 'pr-ok',
                SpeechResult: {
                    success: true,
                    content: '',
                    data: Buffer.from('ok-bytes'),
                    Alignment: makeAlignmentForWord('Will', 0.0, 2.0),
                } satisfies SpeechResult,
            });

        const result = await RunNarrationPipeline(spec, {
            ContextUser: fakeUser,
            ModelID: 'model-eleven-v4',
        });

        expect(result.CaptionsVtt).toBeUndefined();
        expect(result.CaptionsFileID).toBeUndefined();
        expect(result.Clips).toHaveLength(1);
        expect(result.Clips[0].LineKey).toBe('line-ok');
        expect(result.Issues).toContainEqual(
            expect.objectContaining({
                Code: 'SynthesisFailed',
                Severity: 'Error',
                LineKey: 'line-fail',
                Message: 'Rate limit exceeded',
            }),
        );
    });
});
