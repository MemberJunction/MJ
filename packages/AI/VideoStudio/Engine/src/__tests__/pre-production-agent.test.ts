import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { VideoStudioEngine } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import * as dataSnapshotModule from '../data/data-snapshot.js';
import * as narrationPipelineModule from '../narration/narration-pipeline.js';
import {
    LoadVideoStudioPreProductionAgent,
    VideoStudioPreProductionAgent,
} from '../agents/pre-production-agent.js';

const mockUser = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'System',
} as unknown as UserInfo;

function createAgentWithStepTracking(): {
    agent: VideoStudioPreProductionAgent;
    createdSteps: Array<{ stepType: string; stepName: string }>;
    finalizedSteps: Array<{
        stepName?: string;
        success: boolean;
        errorMessage?: string;
    }>;
    execute: (
        spec: VideoGenerationSpec,
    ) => Promise<ReturnType<VideoStudioPreProductionAgent['executeAgentInternal']>>;
} {
    const agent = new VideoStudioPreProductionAgent();
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
                    FileID: 'file-logo-1',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Watermark',
                    MustUse: true,
                },
                {
                    Key: 'Heading Font',
                    Kind: 'Font',
                    FileID: 'file-font-1',
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
        expect(updated.Assets.Approved[0].StagedPath).toBe('assets/Brand-Logo.png');
        expect(updated.Assets.Approved[1].StagedPath).toBe('assets/Heading-Font.woff2');
        expect(updated.Audio.Narration?.Script[0].StagedPath).toBe('audio/Line-1.mp3');
        expect(updated.Audio.Narration?.Script[1].StagedPath).toBe('audio/Line-2.mp3');
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
});
