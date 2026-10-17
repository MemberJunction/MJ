import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordedCreatedStep {
    stepType: string;
    stepName: string;
    targetId?: string;
    inputData?: unknown;
    entity: { ID: string; TargetLogID: string | null };
}

interface RecordedFinalizedStep {
    stepEntity: { ID: string; TargetLogID: string | null };
    success: boolean;
    errorMessage?: string;
    outputData?: Record<string, unknown>;
}

const { mockReadAssetBytes } = vi.hoisted(() => ({
    mockReadAssetBytes: vi.fn(),
}));

vi.mock('../render/bundle.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../render/bundle.js')>();
    return {
        ...actual,
        ReadAssetBytes: mockReadAssetBytes,
    };
});

vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-agents')>();
    return {
        ...actual,
        BaseAgent: class BaseAgent {
            public RecordedCreatedSteps: RecordedCreatedStep[] = [];
            public RecordedFinalizedSteps: RecordedFinalizedStep[] = [];
            public SuperExecuteCalls: Array<{ params: unknown; config: unknown }> = [];
            protected ProviderToUse: unknown = undefined;

            protected async executeAgentInternal<P = unknown>(
                params: { payload?: P },
                config: unknown,
            ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
                this.SuperExecuteCalls.push({ params, config });
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        newPayload: params.payload as P,
                    } as BaseAgentNextStep<P>,
                    stepCount: 1,
                };
            }

            protected async createStepEntity(opts: {
                stepType: string;
                stepName: string;
                contextUser?: unknown;
                targetId?: string;
                inputData?: unknown;
            }): Promise<{ ID: string; TargetLogID: string | null }> {
                const entity = {
                    ID: `step-${this.RecordedCreatedSteps.length + 1}`,
                    TargetLogID: null,
                };
                this.RecordedCreatedSteps.push({
                    stepType: opts.stepType,
                    stepName: opts.stepName,
                    targetId: opts.targetId,
                    inputData: opts.inputData,
                    entity,
                });
                return entity;
            }

            protected async finalizeStepEntity(
                stepEntity: { ID: string; TargetLogID: string | null },
                success: boolean,
                errorMessage?: string,
                outputData?: Record<string, unknown>,
            ): Promise<void> {
                this.RecordedFinalizedSteps.push({
                    stepEntity,
                    success,
                    errorMessage,
                    outputData,
                });
            }
        },
    };
});

import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    AIPromptParams,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import type {
    KeyframeResult,
    ReferenceAnalysis,
    VideoAsset,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    LoadVideoStudioArtDirectorAgent,
    REFERENCE_ANALYSIS_PROMPT_ID,
    REFERENCE_ANALYSIS_PROMPT_NAME,
    VideoStudioArtDirectorAgent,
} from '../agents/art-director-agent.js';
import { FakeRenderDriver } from '../render/fake-render-driver.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';

const MOCK_USER = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'System',
} as unknown as UserInfo;

const GEMINI_MODEL_ID = 'D4CB204C-1B83-42E1-BD10-20EC65B3A0DC';
const CLAUDE_MODEL_ID = '9604B1A4-2B1C-4F62-9E15-99C48791871B';
const CONFIG_ID = '3A924E5B-928C-4510-B360-776B941DC30F';

interface TestableArtDirectorAgent {
    RecordedCreatedSteps: RecordedCreatedStep[];
    RecordedFinalizedSteps: RecordedFinalizedStep[];
    SuperExecuteCalls: Array<{ params: ExecuteAgentParams<VideoGenerationSpec>; config: AgentConfiguration }>;
    CreatePromptRunner: () => AIPromptRunner;
    executeAgentInternal: <P = unknown>(
        params: ExecuteAgentParams<P>,
        config: AgentConfiguration,
    ) => Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
}

function makeAsset(overrides: Partial<VideoAsset> & { Key: string }): VideoAsset {
    return {
        Kind: 'Image',
        FileID: '11111111-1111-4111-8111-111111111111',
        Source: 'upload.png',
        Provenance: 'Supplied',
        Usage: 'Style reference',
        MustUse: false,
        ...overrides,
    };
}

function makeAnalysis(sourceKey: string): ReferenceAnalysis {
    return {
        SourceKey: 'will-be-overwritten-with-canonical-key',
        PaletteLearned: `Palette from ${sourceKey}`,
        TypographyLearned: `Type from ${sourceKey}`,
        CompositionLearned: `Composition from ${sourceKey}`,
        PacingLearned: `Pacing from ${sourceKey}`,
        MotionLearned: `Motion from ${sourceKey}`,
        DoNotCopy: [`Logo in ${sourceKey}`],
    };
}

describe('VideoStudioArtDirectorAgent', () => {
    let fakeDriver: FakeRenderDriver;

    beforeEach(() => {
        LoadVideoStudioArtDirectorAgent();
        mockReadAssetBytes.mockReset();
        fakeDriver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(fakeDriver);
    });

    afterEach(() => {
        VideoRenderEngine.Instance.UseDriver(null);
        vi.restoreAllMocks();
    });

    it('registers VideoStudioArtDirectorAgent on BaseAgent and matches metadata DriverClass', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
            BaseAgent,
            'VideoStudioArtDirectorAgent',
        );
        expect(instance).toBeInstanceOf(VideoStudioArtDirectorAgent);

        const metadataPath = resolve(
            import.meta.dirname,
            '../../../../../../metadata/agents/.video-studio-agent.json',
        );
        interface AgentMetadataNode {
            fields?: { Name?: string; DriverClass?: string };
            primaryKey?: { ID?: string };
            relatedEntities?: Record<string, AgentMetadataNode[]>;
        }
        const agentsJson = JSON.parse(readFileSync(metadataPath, 'utf8')) as AgentMetadataNode[];
        const allAgents = agentsJson.flatMap((r) => [
            r,
            ...(r.relatedEntities?.['MJ: AI Agents'] ?? []),
        ]);
        const artDirectorRecord = allAgents.find(
            (r) =>
                r.primaryKey?.ID === 'A0BA1441-55DC-43A2-A0A7-ED196F2BF6CC' ||
                r.fields?.Name === 'Video Studio - Art Director',
        );
        expect(artDirectorRecord?.fields?.DriverClass).toBe('VideoStudioArtDirectorAgent');
    });

    it('routes video-capable models via native video_url blocks for videos <= 20 MiB and image_url blocks for images, forwards configurationId, and appends Style.References without mutating input payload', async () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            Prompts: [
                {
                    ID: REFERENCE_ANALYSIS_PROMPT_ID,
                    Name: REFERENCE_ANALYSIS_PROMPT_NAME,
                } as unknown as MJAIPromptEntityExtended,
            ],
            PromptModels: [
                {
                    ID: 'pm-1',
                    PromptID: REFERENCE_ANALYSIS_PROMPT_ID,
                    ModelID: GEMINI_MODEL_ID,
                    ConfigurationID: null,
                    Priority: 10,
                    Status: 'Active',
                } as unknown as MJAIPromptModelEntity,
            ],
            GetConfigurationChain: vi.fn().mockReturnValue([]),
            ModelSupportsModality: vi
                .fn()
                .mockImplementation(
                    (modelId: string, modality: string, direction: string) =>
                        modelId === GEMINI_MODEL_ID &&
                        modality === 'Video' &&
                        direction === 'Input',
                ),
        } as unknown as AIEngine);

        const extractKeyframesSpy = vi.spyOn(fakeDriver, 'ExtractKeyframes');

        mockReadAssetBytes.mockImplementation(async (asset: VideoAsset) => {
            if (asset.Kind === 'Video') {
                return { Bytes: Buffer.from('small-video-bytes'), MimeType: 'video/mp4' };
            }
            return { Bytes: Buffer.from('image-bytes'), MimeType: 'image/png' };
        });

        const agent = new VideoStudioArtDirectorAgent() as unknown as TestableArtDirectorAgent;
        const capturedPromptParams: AIPromptParams[] = [];

        vi.spyOn(agent, 'CreatePromptRunner').mockImplementation(
            () =>
                ({
                    ExecutePrompt: vi.fn().mockImplementation(async (promptParams: AIPromptParams) => {
                        capturedPromptParams.push(promptParams);
                        const data = promptParams.data as { sourceKey: string };
                        return {
                            success: true,
                            result: makeAnalysis(data.sourceKey),
                            promptRun: { ID: `run-${capturedPromptParams.length}` },
                        };
                    }),
                }) as unknown as AIPromptRunner,
        );

        const initialSpec: Partial<VideoGenerationSpec> = {
            Film: {
                OneSentence: 'Show Q3 revenue growth.',
                Audience: 'Board of Directors',
                Purpose: 'Quarterly update',
                DurationSeconds: 30,
                Formats: ['16:9'],
            },
            Assets: {
                Approved: [
                    makeAsset({ Key: 'attachment:board-slide.png', Kind: 'Image', Source: 'board-slide.png' }),
                    makeAsset({ Key: 'attachment:sizzle.mp4', Kind: 'Video', Source: 'sizzle.mp4' }),
                ],
                Required: [],
                NeverInvent: [],
            },
        };

        const params: ExecuteAgentParams<Partial<VideoGenerationSpec>> = {
            agent: { ID: 'A0BA1441-55DC-43A2-A0A7-ED196F2BF6CC', Name: 'Video Studio - Art Director' } as never,
            contextUser: MOCK_USER,
            configurationId: CONFIG_ID,
            conversationMessages: [],
            payload: initialSpec,
        };

        const result = await agent.executeAgentInternal(params, {} as AgentConfiguration);

        expect(result.finalStep.step).toBe('Success');
        expect(extractKeyframesSpy).not.toHaveBeenCalled();
        expect(capturedPromptParams).toHaveLength(2);
        expect(capturedPromptParams[0].configurationId).toBe(CONFIG_ID);
        expect(capturedPromptParams[1].configurationId).toBe(CONFIG_ID);

        // Verify first call (Image)
        const firstData = capturedPromptParams[0].data as Record<string, unknown>;
        expect(firstData).toEqual({
            sourceKey: 'attachment:board-slide.png',
            referenceKind: 'Image',
            filmSummary: 'Show Q3 revenue growth. | Audience: Board of Directors | Purpose: Quarterly update',
        });
        const firstBlocks = capturedPromptParams[0].conversationMessages?.[0]?.content;
        expect(Array.isArray(firstBlocks)).toBe(true);
        if (Array.isArray(firstBlocks)) {
            expect(firstBlocks[1]).toMatchObject({
                type: 'image_url',
                mimeType: 'image/png',
            });
        }

        // Verify second call (Video native)
        const secondData = capturedPromptParams[1].data as Record<string, unknown>;
        expect(secondData).toEqual({
            sourceKey: 'attachment:sizzle.mp4',
            referenceKind: 'Video (native)',
            filmSummary: 'Show Q3 revenue growth. | Audience: Board of Directors | Purpose: Quarterly update',
        });
        const secondBlocks = capturedPromptParams[1].conversationMessages?.[0]?.content;
        expect(Array.isArray(secondBlocks)).toBe(true);
        if (Array.isArray(secondBlocks)) {
            expect(secondBlocks).toHaveLength(2);
            expect(secondBlocks[1]).toMatchObject({
                type: 'video_url',
                mimeType: 'video/mp4',
            });
        }

        // Verify input payload was not mutated and super received both ReferenceAnalysis entries
        expect(initialSpec.Style).toBeUndefined();
        expect(agent.SuperExecuteCalls).toHaveLength(1);
        const forwardedSpec = agent.SuperExecuteCalls[0].params.payload;
        expect(forwardedSpec?.Style?.References).toHaveLength(2);
        expect(forwardedSpec?.Style?.References?.map((r) => r.SourceKey)).toEqual([
            'attachment:board-slide.png',
            'attachment:sizzle.mp4',
        ]);
    });

    it('extracts keyframe contact sheets via FakeRenderDriver.ExtractKeyframes when the primary model is not video-capable', async () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            Prompts: [
                {
                    ID: REFERENCE_ANALYSIS_PROMPT_ID,
                    Name: REFERENCE_ANALYSIS_PROMPT_NAME,
                } as unknown as MJAIPromptEntityExtended,
            ],
            PromptModels: [
                {
                    ID: 'pm-claude',
                    PromptID: REFERENCE_ANALYSIS_PROMPT_ID,
                    ModelID: CLAUDE_MODEL_ID,
                    ConfigurationID: null,
                    Priority: 10,
                    Status: 'Active',
                } as unknown as MJAIPromptModelEntity,
            ],
            GetConfigurationChain: vi.fn().mockReturnValue([]),
            ModelSupportsModality: vi.fn().mockReturnValue(false),
        } as unknown as AIEngine);

        const extractKeyframesSpy = vi.spyOn(fakeDriver, 'ExtractKeyframes').mockResolvedValue({
            DurationSeconds: 12,
            Frames: [],
            Sheets: [
                {
                    Index: 0,
                    Kind: 'Grid',
                    MimeType: 'image/png',
                    Width: 1920,
                    Height: 1080,
                    StillKeys: ['frame-0'],
                    ImageBase64: 'contact-sheet-0',
                },
            ],
        } satisfies KeyframeResult);

        mockReadAssetBytes.mockResolvedValue({
            Bytes: Buffer.from('reference-video-bytes'),
            MimeType: 'video/mp4',
        });

        const agent = new VideoStudioArtDirectorAgent() as unknown as TestableArtDirectorAgent;
        const capturedPromptParams: AIPromptParams[] = [];

        vi.spyOn(agent, 'CreatePromptRunner').mockImplementation(
            () =>
                ({
                    ExecutePrompt: vi.fn().mockImplementation(async (promptParams: AIPromptParams) => {
                        capturedPromptParams.push(promptParams);
                        const data = promptParams.data as { sourceKey: string };
                        return {
                            success: true,
                            result: makeAnalysis(data.sourceKey),
                            promptRun: { ID: 'run-keyframes' },
                        };
                    }),
                }) as unknown as AIPromptRunner,
        );

        const params: ExecuteAgentParams<Partial<VideoGenerationSpec>> = {
            agent: { ID: 'A0BA1441-55DC-43A2-A0A7-ED196F2BF6CC', Name: 'Video Studio - Art Director' } as never,
            contextUser: MOCK_USER,
            conversationMessages: [],
            payload: {
                Assets: {
                    Approved: [
                        makeAsset({ Key: 'attachment:ref.mp4', Kind: 'Video', Source: 'ref.mp4' }),
                    ],
                    Required: [],
                    NeverInvent: [],
                },
            },
        };

        await agent.executeAgentInternal(params, {} as AgentConfiguration);

        expect(extractKeyframesSpy).toHaveBeenCalledTimes(1);
        expect(extractKeyframesSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                BuildContactSheet: true,
            }),
            undefined,
        );
        expect(capturedPromptParams).toHaveLength(1);
        expect((capturedPromptParams[0].data as Record<string, unknown>).referenceKind).toBe(
            'Video (keyframes)',
        );
        const blocks = capturedPromptParams[0].conversationMessages?.[0]?.content;
        expect(Array.isArray(blocks)).toBe(true);
        if (Array.isArray(blocks)) {
            expect(blocks.some((b) => b.type === 'video_url')).toBe(false);
            expect(blocks[1]).toEqual({
                type: 'image_url',
                content: 'data:image/png;base64,contact-sheet-0',
                mimeType: 'image/png',
            });
        }
    });

    it('logs errors and continues when one reference out of three fails, leaving two analyses with canonical SourceKey and calling super once', async () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            Prompts: [
                {
                    ID: REFERENCE_ANALYSIS_PROMPT_ID,
                    Name: REFERENCE_ANALYSIS_PROMPT_NAME,
                } as unknown as MJAIPromptEntityExtended,
            ],
            PromptModels: [],
            GetConfigurationChain: vi.fn().mockReturnValue([]),
            ModelSupportsModality: vi.fn().mockReturnValue(false),
        } as unknown as AIEngine);

        mockReadAssetBytes
            .mockResolvedValueOnce({ Bytes: Buffer.from('ok-image-1'), MimeType: 'image/png' })
            .mockRejectedValueOnce(new Error('Storage offline for asset 2'))
            .mockResolvedValueOnce({ Bytes: Buffer.from('ok-image-3'), MimeType: 'image/png' });

        const agent = new VideoStudioArtDirectorAgent() as unknown as TestableArtDirectorAgent;
        vi.spyOn(agent, 'CreatePromptRunner').mockImplementation(
            () =>
                ({
                    ExecutePrompt: vi.fn().mockImplementation(async (promptParams: AIPromptParams) => {
                        const data = promptParams.data as { sourceKey: string };
                        return {
                            success: true,
                            result: makeAnalysis(data.sourceKey),
                            promptRun: { ID: `run-${data.sourceKey}` },
                        };
                    }),
                }) as unknown as AIPromptRunner,
        );

        const params: ExecuteAgentParams<Partial<VideoGenerationSpec>> = {
            agent: { ID: 'A0BA1441-55DC-43A2-A0A7-ED196F2BF6CC', Name: 'Video Studio - Art Director' } as never,
            contextUser: MOCK_USER,
            conversationMessages: [],
            payload: {
                Assets: {
                    Approved: [
                        makeAsset({ Key: 'attachment:first.png', Kind: 'Image' }),
                        makeAsset({ Key: 'attachment:broken.png', Kind: 'Image' }),
                        makeAsset({ Key: 'attachment:third.png', Kind: 'Image' }),
                    ],
                    Required: [],
                    NeverInvent: [],
                },
            },
        };

        const result = await agent.executeAgentInternal(params, {} as AgentConfiguration);
        expect(result.finalStep.step).toBe('Success');
        expect(agent.SuperExecuteCalls).toHaveLength(1);

        const forwardedSpec = agent.SuperExecuteCalls[0].params.payload;
        expect(forwardedSpec?.Style?.References).toHaveLength(2);
        expect(forwardedSpec?.Style?.References?.map((r) => r.SourceKey)).toEqual([
            'attachment:first.png',
            'attachment:third.png',
        ]);
    });
});
