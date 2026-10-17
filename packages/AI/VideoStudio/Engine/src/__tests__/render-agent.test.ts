import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import * as storageModule from '../storage.js';
import { FakeRenderDriver } from '../render/fake-render-driver.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';
import {
    LoadVideoStudioRenderAgent,
    NO_STORAGE_ACCOUNT_ERROR_MESSAGE,
    VideoStudioRenderAgent,
} from '../agents/render-agent.js';

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

interface RenderAgentTestResult {
    finalStep: {
        step: string;
        terminate: boolean;
        newPayload: VideoGenerationSpec;
        previousPayload: VideoGenerationSpec;
        message?: string;
    };
    stepCount: number;
}

function createRenderAgentHarness(): {
    agent: VideoStudioRenderAgent;
    createdSteps: Array<{ stepType: string; stepName: string }>;
    finalizedSteps: Array<{ stepName?: string; success: boolean; errorMessage?: string }>;
    progressUpdates: Array<{ step: string; message: string }>;
    execute: (
        spec: VideoGenerationSpec,
        cancellationToken?: AbortSignal,
    ) => Promise<RenderAgentTestResult>;
} {
    const agent = new VideoStudioRenderAgent();
    // BaseAgent initializes `private _promptRunner = new AIPromptRunner()` in its field initializer;
    // clear that base-class field init so tests verify VideoStudioRenderAgent never constructs or invokes AIPromptRunner.
    vi.mocked(AIPromptRunner).mockClear();
    const createdSteps: Array<{ stepType: string; stepName: string }> = [];
    const finalizedSteps: Array<{ stepName?: string; success: boolean; errorMessage?: string }> = [];
    const progressUpdates: Array<{ step: string; message: string }> = [];

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
        ID: 'run-render-1',
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
        progressUpdates,
        execute: (spec: VideoGenerationSpec, cancellationToken?: AbortSignal) =>
            internal.executeAgentInternal(
                {
                    agent: {} as never,
                    conversationMessages: [],
                    contextUser: mockUser,
                    payload: spec,
                    cancellationToken,
                    onProgress: (p) => {
                        progressUpdates.push({ step: p.step, message: p.message });
                    },
                },
                {} as AgentConfiguration,
            ),
    };
}

function makeDualFormatSpec(): VideoGenerationSpec {
    return {
        SpecVersion: '1.0',
        Status: 'Composed',
        Archetype: {
            Name: 'Topic Explainer',
        },
        Film: {
            OneSentence: 'Dual format product launch.',
            Audience: 'Customers',
            Purpose: 'Announce launch across desktop and mobile.',
            DurationSeconds: 6,
            Formats: ['16:9', '9:16'],
        },
        Style: {
            Palette: [{ Name: 'background.primary', Value: '#0A0A0A', Usage: 'Background' }],
            Typography: [
                {
                    Role: 'Headline',
                    FontFamily: 'Brand Sans',
                    FontAssetKey: 'brand-font',
                    Weight: 700,
                    SizeByFormat: { '16:9': '64px', '9:16': '52px' },
                },
            ],
            Composition: 'Hero title centered',
            Pacing: {
                AvgSecondsBetweenChanges: 3,
                HoldRules: 'Hold 1.5s',
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
                    Usage: 'Corner watermark',
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
        DataBindings: [],
        DataSnapshot: {
            AsOf: '2026-04-17T00:00:00.000Z',
            Sources: [],
            Inline: {},
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Hook',
                StartSeconds: 0,
                EndSeconds: 3,
                EntryState: 'Dark canvas',
                ExitState: 'Hero title',
                Purpose: 'Hook viewer on launch day',
                OnScreenText: ['Launch Day'],
                AssetRefs: ['brand-logo'],
                DataRefs: [],
                LayoutNotes: { '16:9': 'Wide hero', '9:16': 'Stacked hero' },
            },
            {
                Key: 'beat-2',
                Label: 'CTA',
                StartSeconds: 3,
                EndSeconds: 6,
                EntryState: 'Hero title',
                ExitState: 'CTA card',
                Purpose: 'Drive trial signups',
                OnScreenText: ['Try it today'],
                AssetRefs: ['brand-logo'],
                DataRefs: [],
                LayoutNotes: { '16:9': 'Centered CTA', '9:16': 'Bottom CTA' },
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
                        Text: 'Welcome to launch day.',
                        AudioFileID: 'file-audio-1',
                        DurationSeconds: 2.8,
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
            Seed: 7,
            RendererVersion: '',
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
                    EvidenceRefs: ['brief:ok'],
                    Timestamp: '2026-04-17T00:00:00.000Z',
                },
                {
                    Gate: 'G2',
                    Status: 'Passed',
                    EvidenceRefs: ['storyboard:ok'],
                    Timestamp: '2026-04-17T00:00:00.000Z',
                },
                {
                    Gate: 'G3',
                    Status: 'Pending',
                    EvidenceRefs: [],
                    Timestamp: '2026-04-17T00:00:00.000Z',
                },
            ],
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
                        'index.html': '<!doctype html><html><body>16:9</body></html>',
                    },
                    AssetKeys: ['brand-logo'],
                },
                '9:16': {
                    Format: '9:16',
                    EntryFile: 'index.html',
                    Files: {
                        'index.html': '<!doctype html><html><body>9:16</body></html>',
                    },
                    AssetKeys: ['brand-logo'],
                },
            },
            RenderMetadata: {
                Renderer: 'HyperFrames',
                RendererVersion: '',
                Seed: 7,
                Fps: 30,
                DurationByFormat: {},
                RenderedAt: '2026-04-17T00:00:00.000Z',
            },
        },
    };
}

describe('VideoStudioRenderAgent (VS-AGT-3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(storageModule, 'ReadStoredFile').mockImplementation(async (fileId: string) =>
            Buffer.from(`stored:${fileId}`, 'utf8'),
        );
        let fileCounter = 0;
        vi.spyOn(storageModule, 'StoreFile').mockImplementation(async (input) => {
            fileCounter += 1;
            return `stored-${fileCounter}-${input.FileName}`;
        });
    });

    afterEach(async () => {
        await VideoRenderEngine.Instance.Shutdown();
    });

    it('registers VideoStudioRenderAgent on BaseAgent with MJGlobal', () => {
        LoadVideoStudioRenderAgent();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseAgent,
            'VideoStudioRenderAgent',
        );
        expect(reg?.SubClass).toBe(VideoStudioRenderAgent);
    });

    it('happy path (FakeRenderDriver + two formats 16:9 and 9:16): runs Check, CaptureStills, BuildContactSheet, Render per format (stepCount === 8); populates Videos, ContactSheetFileIDs, PosterFileID, RenderMetadata, and G3 Passed', async () => {
        const fakeDriver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { createdSteps, finalizedSteps, progressUpdates, execute } =
            createRenderAgentHarness();
        const spec = makeDualFormatSpec();

        const result = await execute(spec);

        expect(result.stepCount).toBe(8);
        expect(result.finalStep.step).toBe('Success');
        expect(createdSteps).toEqual([
            { stepType: 'Validation', stepName: 'Check 16:9' },
            { stepType: 'Tool', stepName: 'Stills 16:9' },
            { stepType: 'Tool', stepName: 'Contact sheets 16:9' },
            { stepType: 'Tool', stepName: 'Render 16:9' },
            { stepType: 'Validation', stepName: 'Check 9:16' },
            { stepType: 'Tool', stepName: 'Stills 9:16' },
            { stepType: 'Tool', stepName: 'Contact sheets 9:16' },
            { stepType: 'Tool', stepName: 'Render 9:16' },
        ]);
        expect(finalizedSteps.every((s) => s.success)).toBe(true);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[0].step).toBe('subagent_execution');

        const updated = result.finalStep.newPayload;
        expect(updated.Output?.Videos['16:9']).toMatchObject({
            Format: '16:9',
            Width: 1920,
            Height: 1080,
            MimeType: 'video/mp4',
            DurationSeconds: 6,
        });
        expect(updated.Output?.Videos['9:16']).toMatchObject({
            Format: '9:16',
            Width: 1080,
            Height: 1920,
            MimeType: 'video/mp4',
            DurationSeconds: 6,
        });
        expect(updated.Output?.PosterFileID).toMatch(/poster\.png$/);
        expect(updated.Output?.ContactSheetFileIDs?.['16:9']?.length).toBe(2); // 1 Grid + 1 TransitionStrip
        expect(updated.Output?.ContactSheetFileIDs?.['9:16']?.length).toBe(2);

        expect(updated.Output?.RenderMetadata).toMatchObject({
            Renderer: 'HyperFrames',
            RendererVersion: '0.8.134',
            Seed: 7,
            Fps: 30,
            DurationByFormat: {
                '16:9': 6,
                '9:16': 6,
            },
        });

        const g3 = updated.Review.Gates.find((g) => g.Gate === 'G3');
        expect(g3?.Status).toBe('Passed');
        expect(g3?.EvidenceRefs).toEqual([
            ...(updated.Output?.ContactSheetFileIDs?.['16:9'] ?? []),
            ...(updated.Output?.ContactSheetFileIDs?.['9:16'] ?? []),
            'check:16:9:passed',
            'check:9:16:passed',
        ]);
        expect(AIPromptRunner).not.toHaveBeenCalled();
    });

    it('Check returning an Error issue fails on the "Check <fmt>" step before Render is called with [Category] Code: Message @ File:Line', async () => {
        const fakeDriver = new FakeRenderDriver({
            CheckIssues: [
                {
                    Code: 'MJ_TEXT_OVERLAP',
                    Category: 'Layout',
                    Severity: 'Error',
                    Message: 'Elements #title and #subtitle overlap by 42px.',
                    File: 'index.html',
                    Line: 18,
                },
            ],
        });
        const renderSpy = vi.spyOn(fakeDriver, 'Render');
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { createdSteps, finalizedSteps, execute } = createRenderAgentHarness();
        const spec = makeDualFormatSpec();

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.stepCount).toBe(1);
        expect(createdSteps).toEqual([{ stepType: 'Validation', stepName: 'Check 16:9' }]);
        expect(finalizedSteps[0].success).toBe(false);
        expect(renderSpy).not.toHaveBeenCalled();
        expect(result.finalStep.message).toContain(
            '[Layout] MJ_TEXT_OVERLAP: Elements #title and #subtitle overlap by 42px. @ index.html:18',
        );
    });

    it('CheckProductionRules Provenance or Audio failure still calls driver.Check once and blocks Render', async () => {
        const fakeDriver = new FakeRenderDriver();
        const checkSpy = vi.spyOn(fakeDriver, 'Check');
        const renderSpy = vi.spyOn(fakeDriver, 'Render');
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { execute } = createRenderAgentHarness();
        const spec = makeDualFormatSpec();
        // Add a generated asset missing PromptRunID
        spec.Assets.Approved.push({
            Key: 'bad-gen-asset',
            Kind: 'Image',
            FileID: 'file-bad-gen',
            Source: 'AI',
            Provenance: 'Generated',
            Usage: 'Hero',
            MustUse: false,
            Generation: {
                ModelID: 'm-1',
                PromptRunID: '',
                Prompt: 'Sunset',
                ReferenceKeys: [],
            },
        });

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(checkSpy).toHaveBeenCalledTimes(1);
        expect(renderSpy).not.toHaveBeenCalled();
        expect(result.finalStep.message).toContain('[Provenance] MissingGeneratedAssetProvenance:');
    });

    it('renderResult.HasAudio === false when narration is present fails the run with an Audio issue', async () => {
        const fakeDriver = new FakeRenderDriver();
        const originalRender = fakeDriver.Render.bind(fakeDriver);
        vi.spyOn(fakeDriver, 'Render').mockImplementation(async (req, onProgress, signal) => {
            const res = await originalRender(req, onProgress, signal);
            return { ...res, HasAudio: false };
        });
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { execute } = createRenderAgentHarness();
        const spec = makeDualFormatSpec();

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.message).toContain('[Audio] MissingRenderedAudioTrack:');
    });

    it('StoreFile returning undefined fails with the exact storage-account guidance message', async () => {
        const fakeDriver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(fakeDriver);
        vi.spyOn(storageModule, 'StoreFile').mockResolvedValue(undefined);

        const { execute } = createRenderAgentHarness();
        const spec = makeDualFormatSpec();

        const result = await execute(spec);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.message).toBe(NO_STORAGE_ACCOUNT_ERROR_MESSAGE);
    });

    it('params.cancellationToken abort propagates to driver.Render and ends Failed', async () => {
        const fakeDriver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { execute } = createRenderAgentHarness();
        const spec = makeDualFormatSpec();
        // Trigger fake hang so Render waits on the AbortSignal
        spec.Output!.Source!['16:9']!.Files['index.html'] =
            '<!doctype html><html><body data-fake-hang="true"></body></html>';

        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('Caller cancelled render')), 25);

        const result = await execute(spec, controller.signal);

        expect(result.finalStep.step).toBe('Failed');
        expect(result.finalStep.newPayload).toBe(spec);
    });

    it('swallows a throwing onProgress callback and never stores raw video bytes in newPayload or step OutputData', async () => {
        const fakeDriver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(fakeDriver);

        const { agent } = createRenderAgentHarness();
        const stepOutputs: string[] = [];
        const internal = agent as unknown as {
            createStepEntity: (opts: {
                stepType: string;
                stepName: string;
            }) => Promise<MJAIAgentRunStepEntityExtended>;
            executeAgentInternal: (
                params: ExecuteAgentParams<VideoGenerationSpec>,
                config: AgentConfiguration,
            ) => Promise<{
                finalStep: {
                    step: string;
                    newPayload: VideoGenerationSpec;
                };
            }>;
        };
        const origCreate = internal.createStepEntity;
        internal.createStepEntity = vi.fn(async (opts) => {
            const step = await origCreate(opts);
            Object.defineProperty(step, 'OutputData', {
                set(v: string) {
                    stepOutputs.push(v);
                },
                get() {
                    return stepOutputs[stepOutputs.length - 1] ?? '';
                },
            });
            return step;
        });

        const spec = makeDualFormatSpec();
        const result = await internal.executeAgentInternal(
            {
                agent: {} as never,
                conversationMessages: [],
                contextUser: mockUser,
                payload: spec,
                onProgress: () => {
                    throw new Error('Caller progress handler exploded');
                },
            },
            {} as AgentConfiguration,
        );

        expect(result.finalStep.step).toBe('Success');
        const payloadStr = JSON.stringify(result.finalStep.newPayload);
        expect(payloadStr).not.toContain('ftypisom');
        for (const out of stepOutputs) {
            expect(out).not.toContain('ftypisom');
        }
    });
});
