import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { RunView, type UserInfo } from '@memberjunction/core';
import { VideoStudioEngine } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import * as dataSnapshotModule from '../data/data-snapshot.js';
import * as generateAssetsModule from '../generation/generate-assets.js';
import * as narrationPipelineModule from '../narration/narration-pipeline.js';
import {
    LoadVideoStudioPreProductionAgent,
    VideoStudioPreProductionAgent,
} from '../agents/pre-production-agent.js';

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-prompts')>();
    return {
        ...actual,
        AIPromptRunner: vi.fn(),
    };
});

const mockUser = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'System',
} as unknown as UserInfo;

interface StepTrackingExecutionResult {
    finalStep: {
        step: string;
        terminate: boolean;
        newPayload: VideoGenerationSpec;
        previousPayload: VideoGenerationSpec;
        message?: string;
    };
    stepCount: number;
}

function createAgentWithStepTracking(): {
    agent: VideoStudioPreProductionAgent;
    createdSteps: Array<{ stepType: string; stepName: string }>;
    finalizedSteps: Array<{
        stepName?: string;
        success: boolean;
        errorMessage?: string;
    }>;
    execute: (spec: VideoGenerationSpec) => Promise<StepTrackingExecutionResult>;
} {
    const agent = new VideoStudioPreProductionAgent();
    // BaseAgent initializes `private _promptRunner = new AIPromptRunner()` in its field initializer;
    // clear that base-class field init so tests verify VideoStudioPreProductionAgent never constructs or invokes AIPromptRunner.
    vi.mocked(AIPromptRunner).mockClear();
    const createdSteps: Array<{ stepType: string; stepName: string }> = [];
    const finalizedSteps: Array<{
        stepName?: string;
        success: boolean;
        errorMessage?: string;
    }> = [];

    const internal = agent as unknown as {
        _agentRun: MJAIAgentRunEntityExtended;
        createStepEntity: (opts: {
            stepType: string;
            stepName: string;
        }) => Promise<MJAIAgentRunStepEntityExtended>;
        finalizeStepEntity: (
            step: MJAIAgentRunStepEntityExtended,
            success: boolean,
            errorMessage?: string,
        ) => Promise<void>;
        executeAgentInternal: (
            params: ExecuteAgentParams<VideoGenerationSpec>,
            config: AgentConfiguration,
        ) => Promise<{
            finalStep: {
                step: string;
                terminate: boolean;
                newPayload: VideoGenerationSpec;
                previousPayload: VideoGenerationSpec;
                message?: string;
            };
            stepCount: number;
        }>;
    };

    internal._agentRun = {
        ID: 'run-pre-prod-1',
        Steps: [],
    } as unknown as MJAIAgentRunEntityExtended;

    internal.createStepEntity = vi.fn(async (opts) => {
        createdSteps.push({ stepType: opts.stepType, stepName: opts.stepName });
        return {
            ID: `step-${createdSteps.length}`,
            StepType: opts.stepType,
            StepName: opts.stepName,
        } as unknown as MJAIAgentRunStepEntityExtended;
    });

    internal.finalizeStepEntity = vi.fn(async (step, success, errorMessage) => {
        finalizedSteps.push({
            stepName: step?.StepName,
            success,
            errorMessage,
        });
    });

    return {
        agent,
        createdSteps,
        finalizedSteps,
        execute: (spec: VideoGenerationSpec) =>
            internal.executeAgentInternal(
                {
                    agent: {} as never,
                    conversationMessages: [],
                    contextUser: mockUser,
                    payload: spec,
                },
                {} as AgentConfiguration,
            ),
    };
}

function makeBaseSpec(): VideoGenerationSpec {
    return {
        SpecVersion: '1.0',
        Status: 'Storyboarded',
        Archetype: {
            Name: 'Topic Explainer',
        },
        Film: {
            OneSentence: 'Explain ARR growth.',
            Audience: 'Leadership',
            Purpose: 'Align leadership on ARR momentum.',
            DurationSeconds: 8,
            Formats: ['16:9'],
        },
        Style: {
            Palette: [{ Name: 'background.primary', Value: '#000000', Usage: 'Background' }],
            Typography: [
                {
                    Role: 'Headline',
                    FontFamily: 'Inter',
                    Weight: 700,
                    SizeByFormat: { '16:9': '64px' },
                },
            ],
            Composition: 'KPI hero left',
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
                    Key: 'Brand Logo',
                    Kind: 'Logo',
                    FileID: '11111111-1111-4111-8111-111111111101',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Watermark',
                    MustUse: true,
                },
                {
                    Key: 'Heading Font',
                    Kind: 'Font',
                    FileID: '22222222-2222-4222-8222-222222222202',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Headings',
                    MustUse: false,
                },
            ],
            Required: [],
            NeverInvent: ['Brand Logo'],
        },
        DataBindings: [
            {
                Key: 'arr',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
                Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
            },
            {
                Key: 'deals_by_region',
                Source: {
                    Kind: 'View',
                    EntityName: 'Deals',
                    ExtraFilter: "Status = 'Won'",
                    Fields: ['Region', 'Amount'],
                },
                Shape: 'Series',
            },
        ],
        DataSnapshot: {
            AsOf: '2026-04-17T00:00:00.000Z',
            Sources: ['Inline:arr'],
            Inline: { arr: 12500000 },
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Intro',
                StartSeconds: 0,
                EndSeconds: 4,
                EntryState: 'Blank',
                ExitState: 'KPI card',
                Purpose: 'Show ARR',
                OnScreenText: ['{arr} ARR'],
                AssetRefs: ['Brand Logo'],
                DataRefs: ['arr'],
                LayoutNotes: { '16:9': 'Hero KPI' },
            },
            {
                Key: 'beat-2',
                Label: 'Regional Breakdown',
                StartSeconds: 4,
                EndSeconds: 8,
                EntryState: 'KPI card',
                ExitState: 'Bar chart',
                Purpose: 'Show regional contribution',
                OnScreenText: ['Regional Wins'],
                AssetRefs: [],
                DataRefs: ['deals_by_region'],
                LayoutNotes: { '16:9': 'Full width chart' },
            },
        ],
        Audio: {
            Narration: {
                VoiceID: 'voice-1',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'Line 1',
                        BeatKey: 'beat-1',
                        Text: 'ARR reached {arr}.',
                    },
                    {
                        Key: 'Line 2',
                        BeatKey: 'beat-2',
                        Text: 'Every region contributed.',
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
            Seed: 1,
            RendererVersion: '',
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
            RenderMetadata: {
                Renderer: 'HyperFrames',
                RendererVersion: '',
                Seed: 1,
                Fps: 30,
                DurationByFormat: {},
                RenderedAt: '2026-04-17T00:00:00.000Z',
            },
        },
    };
}

describe('VideoStudioPreProductionAgent (VS-AGT-3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(VideoStudioEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(VideoStudioEngine.Instance, 'GetArchetypeByName').mockReturnValue(undefined);
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Files') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: '11111111-1111-4111-8111-111111111101',
                            ContentType: 'image/png',
                            Name: 'brand-logo.png',
                        },
                        {
                            ID: '22222222-2222-4222-8222-222222222202',
                            ContentType: 'font/woff2',
                            Name: 'heading.woff2',
                        },
                    ],
                } as never;
            }
            return {
                Success: true,
                Results: [],
            } as never;
        });
    });

    it('registers VideoStudioPreProductionAgent on BaseAgent with MJGlobal', () => {
        LoadVideoStudioPreProductionAgent();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseAgent,
            'VideoStudioPreProductionAgent',
        );
        expect(reg?.SubClass).toBe(VideoStudioPreProductionAgent);
    });

    it('happy path: Inline + View bindings + 2-beat narration writes DataSnapshot, re-timed Beats, Film.DurationSeconds, Output.CaptionsFileID, and StagedPath on every asset and narration line (stepCount === 3)', async () => {
        const configSpy = vi
            .spyOn(VideoStudioEngine.Instance, 'Config')
            .mockResolvedValue(undefined);
        vi.spyOn(VideoStudioEngine.Instance, 'GetArchetypeByName').mockReturnValue({
            MinDurationSeconds: 30,
            MaxDurationSeconds: 180,
        } as never);
        const captureSpy = vi
            .spyOn(dataSnapshotModule, 'CaptureDataSnapshot')
            .mockResolvedValue({
                Snapshot: {
                    AsOf: '2026-04-17T01:00:00.000Z',
                    Sources: ['Inline:arr', 'View:Deals'],
                    Inline: {
                        arr: 12500000,
                        deals_by_region: [{ Label: 'NA', Value: 8000000 }],
                    },
                },
                Values: {
                    arr: 12500000,
                    deals_by_region: [{ Label: 'NA', Value: 8000000 }],
                },
                Issues: [],
            });

        const narrationSpy = vi
            .spyOn(narrationPipelineModule, 'RunNarrationPipeline')
            .mockImplementation(async (inputSpec, options) => ({
                Spec: {
                    ...inputSpec,
                    Film: {
                        ...inputSpec.Film,
                        DurationSeconds: 8.6,
                    },
                    Beats: [
                        {
                            ...inputSpec.Beats[0],
                            StartSeconds: 0,
                            EndSeconds: 4.5,
                        },
                        {
                            ...inputSpec.Beats[1],
                            StartSeconds: 4.5,
                            EndSeconds: 8.6,
                        },
                    ],
                    Audio: {
                        ...inputSpec.Audio,
                        Narration: {
                            VoiceID: 'voice-1',
                            Provider: 'ElevenLabs',
                            Script: [
                                {
                                    Key: 'Line 1',
                                    BeatKey: 'beat-1',
                                    Text: `ARR reached ${options.BindingText?.arr ?? ''}.`,
                                    AudioFileID: 'audio-file-1',
                                    DurationSeconds: 4.2,
                                    StartSeconds: 0,
                                },
                                {
                                    Key: 'Line 2',
                                    BeatKey: 'beat-2',
                                    Text: 'Every region contributed.',
                                    AudioFileID: 'audio-file-2',
                                    DurationSeconds: 3.8,
                                    StartSeconds: 4.5,
                                },
                            ],
                        },
                    },
                },
                Clips: [],
                CaptionsVtt: 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.200\nARR reached $12.5M.\n',
                CaptionsFileID: 'vtt-file-1',
                Issues: [],
            }));

        const { createdSteps, finalizedSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        const result = await execute(spec);

        expect(result.stepCount).toBe(3);
        expect(result.finalStep.step).toBe('Success');
        expect(createdSteps).toEqual([
            { stepType: 'Tool', stepName: 'Data Snapshot' },
            { stepType: 'Tool', stepName: 'Narration' },
            { stepType: 'Tool', stepName: 'Stage Assets' },
        ]);
        expect(finalizedSteps.every((s) => s.success)).toBe(true);

        expect(configSpy).toHaveBeenCalledWith(false, mockUser, undefined);
        expect(captureSpy).toHaveBeenCalledTimes(1);
        expect(narrationSpy).toHaveBeenCalledTimes(1);
        expect(narrationSpy.mock.calls[0][1].BindingText).toEqual({
            arr: '$12.5M',
        });
        expect(narrationSpy.mock.calls[0][1].FilmBounds).toEqual({
            MinSeconds: 30,
            MaxSeconds: 180,
        });

        const updated = result.finalStep.newPayload;
        expect(updated.DataSnapshot?.AsOf).toBe('2026-04-17T01:00:00.000Z');
        expect(updated.Beats[0].EndSeconds).toBe(4.5);
        expect(updated.Beats[1].EndSeconds).toBe(8.6);
        expect(updated.Film.DurationSeconds).toBe(8.6);
        expect(updated.Output?.CaptionsFileID).toBe('vtt-file-1');
        expect(updated.Assets.Approved[0].StagedPath).toBe('assets/brand-logo-11111111.png');
        expect(updated.Assets.Approved[1].StagedPath).toBe('assets/heading-font-22222222.woff2');
        expect(updated.Audio.Narration?.Script[0].StagedPath).toBe('audio/line-1.mp3');
        expect(updated.Audio.Narration?.Script[1].StagedPath).toBe('audio/line-2.mp3');
        expect(AIPromptRunner).not.toHaveBeenCalled();
    });

    it('skips "Data Snapshot" step when DataBindings is empty (stepCount === 2)', async () => {
        const captureSpy = vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot');
        vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline').mockImplementation(
            async (inputSpec) => ({
                Spec: inputSpec,
                Clips: [],
                CaptionsVtt: 'WEBVTT\n\n',
                CaptionsFileID: 'vtt-file-empty',
                Issues: [],
            }),
        );

        const { createdSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.DataBindings = [];
        delete spec.DataSnapshot;

        const result = await execute(spec);

        expect(result.stepCount).toBe(2);
        expect(result.finalStep.step).toBe('Success');
        expect(captureSpy).not.toHaveBeenCalled();
        expect(createdSteps.map((s) => s.stepName)).toEqual(['Narration', 'Stage Assets']);
    });

    it('missing query parameter or failing entity filter fails the run cleanly, returns the unchanged incoming payload, and surfaces every DataSnapshotIssue in the message', async () => {
        vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot').mockResolvedValue({
            Snapshot: {
                AsOf: '2026-04-17T01:00:00.000Z',
                Sources: [],
                Inline: {},
            },
            Values: {},
            Issues: [
                {
                    BindingKey: 'arr',
                    Severity: 'Error',
                    Code: 'MissingQueryParameter',
                    Message: 'Required query parameter "regionId" was not provided.',
                },
                {
                    BindingKey: 'deals_by_region',
                    Severity: 'Error',
                    Code: 'EntityViewFailed',
                    Message: 'RunView failed: invalid filter column "BadCol".',
                },
            ],
        });
        const narrationSpy = vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline');

        const { finalizedSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        const originalSnapshotJson = JSON.stringify(spec);

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.newPayload).toBe(spec);
        expect(JSON.stringify(result.finalStep.newPayload)).toBe(originalSnapshotJson);
        expect(narrationSpy).not.toHaveBeenCalled();
        expect(finalizedSteps).toHaveLength(1);
        expect(finalizedSteps[0].success).toBe(false);
        expect(result.finalStep.message).toContain('MissingQueryParameter');
        expect(result.finalStep.message).toContain('EntityViewFailed');
        expect(result.finalStep.message).toContain('Never fill in a placeholder or invent');
    });

    it('missing storage account fails when RunNarrationPipeline emits ClipNotStored and leaves incoming payload unchanged', async () => {
        vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot').mockResolvedValue({
            Snapshot: {
                AsOf: '2026-04-17T01:00:00.000Z',
                Sources: ['Inline:arr'],
                Inline: { arr: 12500000 },
            },
            Values: { arr: 12500000 },
            Issues: [],
        });

        vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline').mockImplementation(
            async (inputSpec) => ({
                Spec: inputSpec,
                Clips: [],
                CaptionsVtt: 'WEBVTT\n\n',
                Issues: [
                    {
                        Severity: 'Warning',
                        Code: 'ClipNotStored',
                        LineKey: 'Line 1',
                        Message:
                            'TTS audio synthesized for line "Line 1" could not be stored because no storage account resolved.',
                    },
                ],
            }),
        );

        const { execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        const originalJson = JSON.stringify(spec);

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.newPayload).toBe(spec);
        expect(JSON.stringify(result.finalStep.newPayload)).toBe(originalJson);
        expect(result.finalStep.message).toContain('ClipNotStored');
        expect(result.finalStep.message).toContain('Never fill in a placeholder or invent');
    });

    it('passes archetype FilmBounds to RunNarrationPipeline and finalizes step with success=false when a step throws', async () => {
        vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot').mockRejectedValueOnce(
            new Error('Database connection lost during snapshot'),
        );

        const { finalizedSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.newPayload).toBe(spec);
        expect(finalizedSteps).toHaveLength(1);
        expect(finalizedSteps[0].success).toBe(false);
        expect(finalizedSteps[0].errorMessage).toContain('Database connection lost during snapshot');
    });

    it('resolves asset extensions from stored ContentType/MimeType and file Name fallback, and deduplicates colliding sanitized keys with 8-hex-digit ID prefix and numeric suffixes', async () => {
        vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline').mockImplementation(
            async (inputSpec) => ({
                Spec: inputSpec,
                Clips: [],
                CaptionsVtt: 'WEBVTT\n\n',
                CaptionsFileID: 'vtt-file-empty',
                Issues: [],
            }),
        );

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Files') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'a1111111-1111-4111-8111-111111111101',
                            ContentType: 'image/svg+xml',
                            Name: 'logo-upper.svg',
                        },
                        {
                            ID: 'b2222222-2222-4222-8222-222222222202',
                            ContentType: 'application/octet-stream',
                            Name: 'wordmark.svg',
                        },
                        {
                            ID: 'c3333333-3333-4333-8333-333333333303',
                            ContentType: 'image/png',
                            Name: 'cyrillic.png',
                        },
                    ],
                } as never;
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'd4444444-4444-4444-8444-444444444404',
                            FileID: null,
                            MimeType: 'image/webp',
                            Name: 'artifact-hero.webp',
                        },
                    ],
                } as never;
            }
            return { Success: true, Results: [] } as never;
        });

        const { execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.DataBindings = [];
        spec.Assets.Approved = [
            {
                Key: 'Logo.svg',
                Kind: 'Logo',
                FileID: 'a1111111-1111-4111-8111-111111111101',
                Source: 'BrandKit',
                Provenance: 'BrandKit',
                Usage: 'Primary logo',
                MustUse: true,
            },
            {
                Key: 'logo.svg',
                Kind: 'Logo',
                FileID: 'b2222222-2222-4222-8222-222222222202',
                Source: 'BrandKit',
                Provenance: 'BrandKit',
                Usage: 'Secondary wordmark (filename extension fallback)',
                MustUse: false,
            },
            {
                Key: 'brand:Логотип',
                Kind: 'Logo',
                FileID: 'c3333333-3333-4333-8333-333333333303',
                Source: 'BrandKit',
                Provenance: 'BrandKit',
                Usage: 'Primary Cyrillic logo',
                MustUse: false,
            },
            {
                Key: 'brand:Логотип белый',
                Kind: 'Logo',
                FileID: 'c3333333-3333-4333-8333-333333333303',
                Source: 'BrandKit',
                Provenance: 'BrandKit',
                Usage: 'White Cyrillic logo sharing FileID',
                MustUse: false,
            },
            {
                Key: 'Hero Cutout',
                Kind: 'Image',
                ArtifactVersionID: 'd4444444-4444-4444-8444-444444444404',
                Source: 'AI',
                Provenance: 'Generated',
                Usage: 'Hero background',
                MustUse: false,
            },
        ];

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Success');
        const approved = result.finalStep.newPayload.Assets.Approved;
        expect(approved[0].StagedPath).toBe('assets/logo-svg-a1111111.svg');
        expect(approved[1].StagedPath).toBe('assets/logo-svg-b2222222.svg');
        expect(approved[2].StagedPath).toBe('assets/brand-c3333333.png');
        expect(approved[3].StagedPath).toBe('assets/brand-c3333333-2.png');
        expect(approved[4].StagedPath).toBe('assets/hero-cutout-d4444444.webp');
    });

    it('refuses to stage an asset when neither stored ContentType/MimeType nor stored file Name yields a known extension, before calling RunNarrationPipeline', async () => {
        const narrationSpy = vi
            .spyOn(narrationPipelineModule, 'RunNarrationPipeline')
            .mockImplementation(async (inputSpec) => ({
                Spec: inputSpec,
                Clips: [],
                CaptionsVtt: 'WEBVTT\n\n',
                CaptionsFileID: 'vtt-file-empty',
                Issues: [],
            }));

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Files') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: '11111111-1111-4111-8111-111111111101',
                            ContentType: 'application/octet-stream',
                            Name: 'brand-logo-without-ext',
                        },
                    ],
                } as never;
            }
            return { Success: true, Results: [] } as never;
        });

        const { execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.DataBindings = [];
        spec.Assets.Approved = [spec.Assets.Approved[0]];

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.message).toContain('Brand Logo');
        expect(result.finalStep.message).toContain('has no supported extension');
        expect(narrationSpy).not.toHaveBeenCalled();
    });

    it('runs "Generate Assets" step between "Data Snapshot" and "Narration" when Assets.Generate is non-empty (VS-GEN-6)', async () => {
        const callOrder: string[] = [];
        vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot').mockImplementation(async () => {
            callOrder.push('Data Snapshot');
            return {
                Snapshot: {
                    AsOf: '2026-04-17T01:00:00.000Z',
                    Sources: ['Inline:arr'],
                    Inline: { arr: 12500000 },
                },
                Values: { arr: 12500000 },
                Issues: [],
            };
        });

        vi.spyOn(generateAssetsModule, 'GenerateRequestedAssets').mockImplementation(
            async (inputSpec) => {
                callOrder.push('Generate Assets');
                const updated: VideoGenerationSpec = JSON.parse(JSON.stringify(inputSpec));
                updated.Assets.Generate![0].Status = 'Generated';
                updated.Assets.Approved.push({
                    Key: 'ambient-bg',
                    Kind: 'Video',
                    FileID: '99999999-9999-4999-8999-999999999909',
                    Source: 'Generated by Veo 3.1',
                    Provenance: 'Generated',
                    Usage: 'Background loop. Play muted.',
                    MustUse: false,
                    Generation: {
                        ModelID: 'model-veo-3-1',
                        PromptRunID: 'pr-vid-1',
                        Prompt: 'Soft slate gradient',
                        ReferenceKeys: [],
                        DurationSeconds: 6,
                        Cost: 0.42,
                        C2PA: true,
                    },
                });
                return {
                    Spec: updated,
                    Issues: [],
                    GeneratedKeys: ['ambient-bg'],
                    TotalCost: 0.42,
                    RequestSummaries: [
                        {
                            Key: 'ambient-bg',
                            Kind: 'Video',
                            Status: 'Generated',
                            ModelID: 'model-veo-3-1',
                            DurationSeconds: 6,
                            Cost: 0.42,
                        },
                    ],
                };
            },
        );

        vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline').mockImplementation(
            async (inputSpec) => {
                callOrder.push('Narration');
                return {
                    Spec: inputSpec,
                    Clips: [],
                    CaptionsVtt: 'WEBVTT\n\n',
                    CaptionsFileID: 'vtt-file-1',
                    Issues: [],
                };
            },
        );

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Files') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: '11111111-1111-4111-8111-111111111101',
                            ContentType: 'image/png',
                            Name: 'brand-logo.png',
                        },
                        {
                            ID: '22222222-2222-4222-8222-222222222202',
                            ContentType: 'font/woff2',
                            Name: 'heading.woff2',
                        },
                        {
                            ID: '99999999-9999-4999-8999-999999999909',
                            ContentType: 'video/mp4',
                            Name: 'generated-ambient-bg.mp4',
                        },
                    ],
                } as never;
            }
            return { Success: true, Results: [] } as never;
        });

        const { createdSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.Assets.Generate = [
            {
                Key: 'ambient-bg',
                Kind: 'Video',
                Purpose: 'Background loop',
                Prompt: 'Soft slate gradient',
                ReferenceKeys: [],
                DurationSeconds: 6,
            },
        ];

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Success');
        expect(callOrder).toEqual(['Data Snapshot', 'Generate Assets', 'Narration']);
        expect(createdSteps.map((s) => s.stepName)).toEqual([
            'Data Snapshot',
            'Generate Assets',
            'Narration',
            'Stage Assets',
        ]);
        const genAsset = result.finalStep.newPayload.Assets.Approved.find(
            (a) => a.Key === 'ambient-bg',
        );
        expect(genAsset?.StagedPath).toBe('assets/ambient-bg-99999999.mp4');
    });

    it('when a generation request is Blocked, skips Narration and Stage Assets and returns Success with statuses and reasons in message (VS-GEN-6)', async () => {
        vi.spyOn(dataSnapshotModule, 'CaptureDataSnapshot').mockResolvedValue({
            Snapshot: {
                AsOf: '2026-04-17T01:00:00.000Z',
                Sources: ['Inline:arr'],
                Inline: { arr: 12500000 },
            },
            Values: { arr: 12500000 },
            Issues: [],
        });

        vi.spyOn(generateAssetsModule, 'GenerateRequestedAssets').mockImplementation(
            async (inputSpec) => {
                const updated: VideoGenerationSpec = JSON.parse(JSON.stringify(inputSpec));
                updated.Assets.Generate![0].Status = 'Blocked';
                updated.Assets.Generate![0].BlockedReason =
                    'NeverInventMatch: Prompt matches NeverInvent entry "Brand Logo".';
                return {
                    Spec: updated,
                    Issues: [
                        {
                            RequestKey: 'fake-logo-bg',
                            Code: 'NeverInventMatch',
                            Severity: 'Error',
                            Message:
                                'NeverInventMatch: Prompt matches NeverInvent entry "Brand Logo".',
                        },
                    ],
                    GeneratedKeys: [],
                    TotalCost: 0,
                    RequestSummaries: [
                        {
                            Key: 'fake-logo-bg',
                            Kind: 'Image',
                            Status: 'Blocked',
                            BlockedReason:
                                'NeverInventMatch: Prompt matches NeverInvent entry "Brand Logo".',
                        },
                    ],
                };
            },
        );

        const narrationSpy = vi.spyOn(narrationPipelineModule, 'RunNarrationPipeline');

        const { createdSteps, execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.Assets.Generate = [
            {
                Key: 'fake-logo-bg',
                Kind: 'Image',
                Purpose: 'Divider card',
                Prompt: 'Animated Brand Logo on pedestal',
                ReferenceKeys: [],
            },
        ];

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Success');
        expect(narrationSpy).not.toHaveBeenCalled();
        expect(createdSteps.map((s) => s.stepName)).toEqual(['Data Snapshot', 'Generate Assets']);
        expect(result.finalStep.newPayload.Assets.Generate?.[0].Status).toBe('Blocked');
        expect(result.finalStep.newPayload.Assets.Generate?.[0].BlockedReason).toContain(
            'NeverInventMatch',
        );
        expect(result.finalStep.message).toContain('fake-logo-bg');
        expect(result.finalStep.message).toContain('NeverInventMatch');
    });

    it('fails staging when a Generated asset in Assets.Approved has a non-UUID FileID ("file-1") rather than bypassing MJ: Files lookup (VS-GEN-6 Fix 4)', async () => {
        const { execute } = createAgentWithStepTracking();
        const spec = makeBaseSpec();
        spec.DataBindings = [];
        spec.Assets.Approved.push({
            Key: 'bad-gen-video',
            Kind: 'Video',
            FileID: 'file-1',
            Source: 'Generated by Veo 3.1',
            Provenance: 'Generated',
            Usage: 'Background loop. Play muted.',
            MustUse: false,
            Generation: {
                ModelID: 'model-veo-3-1',
                PromptRunID: 'pr-vid-bad',
                Prompt: 'Soft slate gradient',
                ReferenceKeys: [],
                DurationSeconds: 6,
            },
        });

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.message).toContain('bad-gen-video');
        expect(result.finalStep.message).toContain('is not a valid UUID');
    });
});

