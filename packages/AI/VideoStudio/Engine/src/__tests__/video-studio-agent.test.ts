import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { BrandKitEngine, VideoStudioEngine } from '@memberjunction/core-entities';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import {
    INLINE_VIDEO_BASE64_SENTINEL,
    LoadVideoStudioAgent,
    VIDEO_STUDIO_STAGES,
    VideoStudioAgent,
} from '../agents/video-studio-agent.js';
import * as storageModule from '../storage.js';

interface TestHarness {
    agent: VideoStudioAgent;
    agentEntity: MJAIAgentEntityExtended;
    agentRun: MJAIAgentRunEntityExtended;
    contextUser: UserInfo;
    createdSteps: Array<{ stepType: string; stepName: string }>;
    finalizedSteps: Array<{
        stepEntity: MJAIAgentRunStepEntityExtended | null;
        success: boolean;
        errorMessage?: string;
    }>;
    invokeValidateWithTracking: () => Promise<ReturnType<VideoStudioAgent['validateAgent']>>;
}

function createHarness(
    hierarchy: string[],
    agentName = 'Video Studio',
): TestHarness {
    const agent = new VideoStudioAgent();
    const agentEntity = {
        ID: '637A678A-0BF8-49DD-BA9E-B2FB97577BD1',
        Name: agentName,
        Status: 'Active',
        StartingPayloadValidation: null,
        StartingPayloadValidationMode: 'Fail',
    } as unknown as MJAIAgentEntityExtended;

    const agentRun = {
        ID: '11111111-2222-3333-4444-555555555555',
        Status: 'Running',
        Success: null,
        ErrorMessage: null,
        FinalStep: null,
        Save: vi.fn().mockResolvedValue(true),
    } as unknown as MJAIAgentRunEntityExtended;

    const contextUser = {
        ID: '00000000-0000-0000-0000-000000000001',
        Name: 'System',
    } as unknown as UserInfo;

    const createdSteps: Array<{ stepType: string; stepName: string }> = [];
    const finalizedSteps: Array<{
        stepEntity: MJAIAgentRunStepEntityExtended | null;
        success: boolean;
        errorMessage?: string;
    }> = [];

    const internal = agent as unknown as {
        _agentRun: MJAIAgentRunEntityExtended;
        _agentHierarchy: string[];
        createStepEntity: (opts: {
            stepType: string;
            stepName: string;
            contextUser?: UserInfo;
            completed?: { success: boolean; errorMessage?: string };
        }) => Promise<MJAIAgentRunStepEntityExtended | null>;
        finalizeStepEntity: (
            stepEntity: MJAIAgentRunStepEntityExtended | null,
            success: boolean,
            errorMessage?: string,
        ) => Promise<void>;
        validateAgentWithTracking: (
            a: MJAIAgentEntityExtended,
            u?: UserInfo,
        ) => Promise<ReturnType<VideoStudioAgent['validateAgent']>>;
    };

    internal._agentRun = agentRun;
    internal._agentHierarchy = [...hierarchy];
    internal.createStepEntity = vi.fn(async (opts) => {
        createdSteps.push({ stepType: opts.stepType, stepName: opts.stepName });
        const step = {
            ID: '99999999-8888-7777-6666-555555555555',
            StepType: opts.stepType,
            StepName: opts.stepName,
        } as unknown as MJAIAgentRunStepEntityExtended;
        // BaseAgent saves the validation step already completed in one INSERT (`completed`) instead of
        // createStepEntity + finalizeStepEntity, so record that outcome as the finalized step too.
        if (opts.completed) {
            finalizedSteps.push({
                stepEntity: step,
                success: opts.completed.success,
                errorMessage: opts.completed.errorMessage,
            });
        }
        return step;
    });
    internal.finalizeStepEntity = vi.fn(async (stepEntity, success, errorMessage) => {
        finalizedSteps.push({ stepEntity, success, errorMessage });
    });

    return {
        agent,
        agentEntity,
        agentRun,
        contextUser,
        createdSteps,
        finalizedSteps,
        invokeValidateWithTracking: () =>
            internal.validateAgentWithTracking(agentEntity, contextUser),
    };
}

describe('VideoStudioAgent cycle guard (VS-INV-2)', () => {
    it('registers VideoStudioAgent on BaseAgent with MJGlobal and exposes VIDEO_STUDIO_STAGES', () => {
        LoadVideoStudioAgent();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseAgent,
            'VideoStudioAgent',
        );
        expect(reg?.SubClass).toBe(VideoStudioAgent);
        expect(VIDEO_STUDIO_STAGES).toHaveLength(7);
    });

    it('fails validation and writes a failed Validation step when Video Studio is in the ancestor hierarchy', async () => {
        // initializeAgentRun sets _agentHierarchy = [...parentAgentHierarchy, agent.Name]
        const parentHierarchy = [
            'Video Studio',
            'Video Studio - Director',
            'Research Agent',
            'Research Report Writer',
        ];
        const harness = createHarness([...parentHierarchy, 'Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        const expectedMessage =
            'Video Studio is already running higher in this call chain (Video Studio → Video Studio - Director → Research Agent → Research Report Writer → Video Studio). A production cannot start another production.';
        expect(harness.agentRun.ErrorMessage).toBe(expectedMessage);
        expect(harness.agentRun.Status).toBe('Failed');
        expect(harness.agentRun.Success).toBe(false);
        expect(harness.agentRun.FinalStep).toBe('Failed');

        expect(harness.createdSteps).toEqual([
            { stepType: 'Validation', stepName: 'Agent Validation' },
        ]);
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(false);
        expect(harness.finalizedSteps[0].errorMessage).toBe(expectedMessage);
    });

    it('matches ancestor names case-insensitively and trimmed', async () => {
        const harness = createHarness([
            '  video studio  ',
            'Video Studio - Director',
            'Research Agent',
            'Research Report Writer',
            'Video Studio',
        ]);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(harness.agentRun.ErrorMessage).toContain(
            'Video Studio is already running higher in this call chain',
        );
        expect(harness.finalizedSteps[0]?.success).toBe(false);
    });

    it('passes validation when called from Query Builder', async () => {
        const harness = createHarness(['Query Builder', 'Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).toBeNull();
        expect(harness.agentRun.Status).toBe('Running');
        expect(harness.agentRun.ErrorMessage).toBeNull();
        expect(harness.createdSteps).toEqual([
            { stepType: 'Validation', stepName: 'Agent Validation' },
        ]);
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(true);
    });

    it('passes validation on a root run (only Video Studio in _agentHierarchy)', async () => {
        const harness = createHarness(['Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).toBeNull();
        expect(harness.agentRun.Status).toBe('Running');
        expect(harness.agentRun.ErrorMessage).toBeNull();
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(true);
    });

    it('refuses a task-graph-dispatched run whose reconstructed parentAgentHierarchy contains Video Studio (VS-INV-2b)', async () => {
        // TaskGraphAgentRunner walks ParentRunID across sub-agent and task-graph hops and passes
        // parentAgentHierarchy (root-first) to AgentRunner.RunAgent, which BaseAgent turns into
        // _agentHierarchy = [...parentAgentHierarchy, agent.Name].
        const parentAgentHierarchy = [
            'Video Studio',
            'Video Studio - Director',
            'Research Agent',
            'Report Writer',
        ];
        const harness = createHarness([
            ...parentAgentHierarchy,
            'Video Studio',
        ]);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(harness.agentRun.Status).toBe('Failed');
        expect(harness.agentRun.ErrorMessage).toBe(
            'Video Studio is already running higher in this call chain (Video Studio → Video Studio - Director → Research Agent → Report Writer → Video Studio). A production cannot start another production.',
        );
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(false);
    });
});

describe('VideoStudioAgent conversation attachment intake (VS-AGT-6)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function setupBaseMocks(): {
        getSeededPayload: () => Partial<VideoGenerationSpec> | undefined;
    } {
        let capturedSeeded: Partial<VideoGenerationSpec> | undefined;

        vi.spyOn(BrandKitEngine, 'Instance', 'get').mockReturnValue({
            Config: vi.fn().mockResolvedValue(undefined),
            BrandKits: [],
            GetDefaultKit: vi.fn().mockReturnValue(null),
            GetAssets: vi.fn().mockReturnValue([]),
        } as unknown as BrandKitEngine);

        vi.spyOn(VideoStudioEngine, 'Instance', 'get').mockReturnValue({
            Config: vi.fn().mockResolvedValue(undefined),
            GetArchetypeByName: vi.fn().mockReturnValue(null),
        } as unknown as VideoStudioEngine);

        vi.spyOn(
            BaseAgent.prototype as unknown as {
                executeAgentInternal: (
                    params: ExecuteAgentParams<Partial<VideoGenerationSpec>>,
                    config: AgentConfiguration,
                ) => Promise<{ finalStep: BaseAgentNextStep<Partial<VideoGenerationSpec>>; stepCount: number }>;
            },
            'executeAgentInternal',
        ).mockImplementation(async (params) => {
            capturedSeeded = params.payload;
            return {
                finalStep: {
                    step: 'Success',
                    terminate: true,
                    newPayload: params.payload,
                } as BaseAgentNextStep<Partial<VideoGenerationSpec>>,
                stepCount: 1,
            };
        });

        return {
            getSeededPayload: () => capturedSeeded,
        };
    }

    it('intakes FileID, ArtifactVersionID, and InlineData attachments from MJ: Conversation Detail Attachments and deduplicates existing entries', async () => {
        const { getSeededPayload } = setupBaseMocks();
        const harness = createHarness(['Video Studio']);

        const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [
                // 1. FileID-backed image
                {
                    ID: 'att-1',
                    MimeType: 'image/png',
                    FileName: 'moodboard.png',
                    FileID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
                    InlineData: null,
                    ArtifactVersionID: null,
                },
                // 2. ArtifactVersionID-backed video
                {
                    ID: 'att-2',
                    MimeType: 'video/mp4',
                    FileName: 'reference-reel.mp4',
                    FileID: null,
                    InlineData: null,
                    ArtifactVersionID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
                },
                // 3. InlineData-only image (uploaded via StoreFile)
                {
                    ID: 'att-3',
                    MimeType: 'image/jpeg',
                    FileName: 'sketch.jpg',
                    FileID: null,
                    InlineData: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`,
                    ArtifactVersionID: null,
                },
                // 4. Already in Assets.Approved (case-insensitive FileID match) -> skipped
                {
                    ID: 'att-dup',
                    MimeType: 'image/png',
                    FileName: 'dup.png',
                    FileID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    InlineData: null,
                    ArtifactVersionID: null,
                },
            ],
        } as unknown as RunViewResult);

        const storeFileSpy = vi
            .spyOn(storageModule, 'StoreFile')
            .mockResolvedValue('DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD');

        const invokeInternal = harness.agent as unknown as {
            executeAgentInternal: (
                params: ExecuteAgentParams<Partial<VideoGenerationSpec>>,
                config: AgentConfiguration,
            ) => Promise<unknown>;
        };

        await invokeInternal.executeAgentInternal(
            {
                agent: harness.agentEntity,
                contextUser: harness.contextUser,
                conversationId: "conv-123's-id",
                conversationMessages: [],
                payload: {
                    Assets: {
                        Approved: [
                            {
                                Key: 'existing:logo',
                                Kind: 'Image',
                                FileID: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC',
                                Source: 'Existing',
                                Provenance: 'Supplied',
                                Usage: 'Existing',
                                MustUse: false,
                            },
                        ],
                        Required: [],
                        NeverInvent: [],
                    },
                },
            },
            {} as AgentConfiguration,
        );

        expect(runViewSpy).toHaveBeenCalledTimes(1);
        const [rvParams, rvUser] = runViewSpy.mock.calls[0] as [RunViewParams, UserInfo | undefined];
        expect(rvParams.EntityName).toBe('MJ: Conversation Detail Attachments');
        expect(rvParams.ExtraFilter).toBe(
            "ConversationDetailID IN (SELECT ID FROM __mj.vwConversationDetails WHERE ConversationID = 'conv-123''s-id') AND (MimeType LIKE 'image/%' OR MimeType LIKE 'video/%')",
        );
        expect(rvParams.Fields).toEqual([
            'ID',
            'MimeType',
            'FileName',
            'FileID',
            'InlineData',
            'ArtifactVersionID',
        ]);
        expect(rvParams.ResultType).toBe('simple');
        expect(rvUser).toBe(harness.contextUser);

        expect(storeFileSpy).toHaveBeenCalledTimes(1);
        expect(storeFileSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                FileName: 'sketch.jpg',
                MimeType: 'image/jpeg',
                Content: Buffer.from('jpeg-bytes'),
            }),
        );

        const seeded = getSeededPayload();
        expect(seeded?.Assets?.Approved).toHaveLength(4);
        expect(seeded?.Assets?.Approved.slice(1)).toEqual([
            {
                Key: 'attachment:moodboard.png',
                Kind: 'Image',
                FileID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
                Source: 'Conversation attachment att-1',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
            {
                Key: 'attachment:reference-reel.mp4',
                Kind: 'Video',
                ArtifactVersionID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
                Source: 'Conversation attachment att-2',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
            {
                Key: 'attachment:sketch.jpg',
                Kind: 'Image',
                FileID: 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
                Source: 'Conversation attachment att-3',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
        ]);
    });

    it('deduplicates inline-only conversation attachments across turns without re-running StoreFile or appending a :2 asset', async () => {
        const { getSeededPayload } = setupBaseMocks();
        const harness = createHarness(['Video Studio']);

        const inlineRow = {
            ID: 'att-inline-1',
            MimeType: 'image/jpeg',
            FileName: 'sketch.jpg',
            FileID: null,
            InlineData: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`,
            ArtifactVersionID: null,
        };
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [inlineRow],
        } as unknown as RunViewResult);

        let uploadCounter = 0;
        const storeFileSpy = vi.spyOn(storageModule, 'StoreFile').mockImplementation(async () => {
            uploadCounter += 1;
            return uploadCounter === 1
                ? 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD'
                : 'EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE';
        });

        const invokeInternal = harness.agent as unknown as {
            executeAgentInternal: (
                params: ExecuteAgentParams<Partial<VideoGenerationSpec>>,
                config: AgentConfiguration,
            ) => Promise<unknown>;
        };

        // Turn 1: initial run intakes the inline attachment via StoreFile
        await invokeInternal.executeAgentInternal(
            {
                agent: harness.agentEntity,
                contextUser: harness.contextUser,
                conversationId: 'conv-multi-turn',
                conversationMessages: [],
                payload: {},
            },
            {} as AgentConfiguration,
        );
        const turn1Seeded = getSeededPayload();
        expect(storeFileSpy).toHaveBeenCalledTimes(1);
        expect(turn1Seeded?.Assets?.Approved).toHaveLength(1);
        expect(turn1Seeded?.Assets?.Approved[0]).toMatchObject({
            Key: 'attachment:sketch.jpg',
            FileID: 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
            Source: 'Conversation attachment att-inline-1',
        });

        // Turn 2: pass turn 1's seeded payload back in with the same inline attachment row still in the DB
        await invokeInternal.executeAgentInternal(
            {
                agent: harness.agentEntity,
                contextUser: harness.contextUser,
                conversationId: 'conv-multi-turn',
                conversationMessages: [],
                payload: structuredClone(turn1Seeded),
            },
            {} as AgentConfiguration,
        );
        const turn2Seeded = getSeededPayload();
        expect(storeFileSpy).toHaveBeenCalledTimes(1);
        expect(
            turn2Seeded?.Assets?.Approved.filter((a) => a.Key.startsWith('attachment:')),
        ).toHaveLength(1);
        expect(turn2Seeded?.Assets?.Approved[0].Key).toBe('attachment:sketch.jpg');
    });

    it('skips attachment RunView when conversationId is omitted and never fails the run when RunView throws or returns Success: false', async () => {
        const { getSeededPayload } = setupBaseMocks();
        const harness = createHarness(['Video Studio']);

        const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockRejectedValueOnce(
            new Error('Database connection lost'),
        );

        const invokeInternal = harness.agent as unknown as {
            executeAgentInternal: (
                params: ExecuteAgentParams<Partial<VideoGenerationSpec>>,
                config: AgentConfiguration,
            ) => Promise<unknown>;
        };

        // 1. Omitted conversationId -> RunView is not called
        await invokeInternal.executeAgentInternal(
            {
                agent: harness.agentEntity,
                contextUser: harness.contextUser,
                conversationMessages: [],
                payload: {},
            },
            {} as AgentConfiguration,
        );
        expect(runViewSpy).not.toHaveBeenCalled();

        // 2. Present conversationId where RunView rejects -> never throws
        await expect(
            invokeInternal.executeAgentInternal(
                {
                    agent: harness.agentEntity,
                    contextUser: harness.contextUser,
                    conversationId: 'conv-err',
                    conversationMessages: [],
                    payload: {},
                },
                {} as AgentConfiguration,
            ),
        ).resolves.toBeDefined();
        expect(runViewSpy).toHaveBeenCalledTimes(1);

        expect(getSeededPayload()?.Assets?.Approved).toEqual([]);
    });

    it('strips Output.Videos[*].InlineBase64 to [inline-mp4] during the root loop and restores the raw base64 on Delivered exit with the Storage warning in HumanReviewNotes', async () => {
        const { CreateDeliveredSpecFixture } = await import('./fixtures/delivered-spec.fixture.js');
        const harness = createHarness(['Video Studio']);
        const rawMp4Base6416x9 = Buffer.from('00000018667479706d703432-inline-mp4-16x9').toString('base64');
        const rawMp4Base649x16 = Buffer.from('00000018667479706d703432-inline-mp4-9x16').toString('base64');

        const fullDelivered = CreateDeliveredSpecFixture();
        const savedReview = structuredClone(fullDelivered.Review);

        const specAfterRender: Partial<VideoGenerationSpec> = structuredClone(fullDelivered);
        specAfterRender.Status = 'RoughCut';
        specAfterRender.Output!.PosterFileID = 'inline:11111111-1111-4111-8111-111111111111';
        specAfterRender.Output!.ContactSheetFileIDs = {
            '16:9': ['inline:22222222-2222-4222-8222-222222222222'],
            '9:16': ['inline:33333333-3333-4333-8333-333333333333'],
        };
        delete specAfterRender.Output!.Videos['16:9']!.FileID;
        specAfterRender.Output!.Videos['16:9']!.InlineBase64 = rawMp4Base6416x9;
        delete specAfterRender.Output!.Videos['9:16']!.FileID;
        specAfterRender.Output!.Videos['9:16']!.InlineBase64 = rawMp4Base649x16;

        const driver = harness.agent as unknown as {
            ApplyStageResult: (
                params: ExecuteAgentParams,
                stageName: string,
                payload: Partial<VideoGenerationSpec>,
                stageSucceeded?: boolean,
            ) => Partial<VideoGenerationSpec>;
            validateSuccessNextStep: (
                params: ExecuteAgentParams,
                nextStep: BaseAgentNextStep<Partial<VideoGenerationSpec>>,
                currentPayload: Partial<VideoGenerationSpec>,
                agentRun: MJAIAgentRunEntityExtended,
                currentStep: MJAIAgentRunStepEntityExtended,
            ) => Promise<BaseAgentNextStep<Partial<VideoGenerationSpec>>>;
        };

        const params: ExecuteAgentParams = {
            agent: harness.agentEntity,
            contextUser: harness.contextUser,
            conversationMessages: [],
        };

        // 1. After Render finishes, ApplyStageResult replaces InlineBase64 with the sentinel in the loop payload
        const afterRenderLoopPayload = driver.ApplyStageResult(
            params,
            'Video Studio - Render',
            specAfterRender,
            true,
        );
        expect(afterRenderLoopPayload.Output?.Videos?.['16:9']?.InlineBase64).toBe(
            INLINE_VIDEO_BASE64_SENTINEL,
        );
        expect(afterRenderLoopPayload.Output?.Videos?.['9:16']?.InlineBase64).toBe(
            INLINE_VIDEO_BASE64_SENTINEL,
        );
        expect(JSON.stringify(afterRenderLoopPayload)).not.toContain(rawMp4Base6416x9);
        expect(JSON.stringify(afterRenderLoopPayload)).not.toContain(rawMp4Base649x16);

        // 2. Critic passes G5 on the loop payload (still holding the sentinel)
        const afterCriticInput: Partial<VideoGenerationSpec> = {
            ...afterRenderLoopPayload,
            Review: {
                Gates: afterRenderLoopPayload.Review?.Gates ?? [],
                Scores: savedReview.Scores,
                Rounds: savedReview.Rounds,
            },
        };
        const afterCriticLoopPayload = driver.ApplyStageResult(
            params,
            'Video Studio - Critic',
            afterCriticInput,
            true,
        );
        expect(afterCriticLoopPayload.Output?.Videos?.['16:9']?.InlineBase64).toBe(
            INLINE_VIDEO_BASE64_SENTINEL,
        );

        // 3. On Success exit, validateSuccessNextStep restores the full InlineBase64 and includes the Storage warning
        const stepEntity = {
            ID: 'step-final',
            StepType: 'Validation',
            StepName: 'Success Validation',
        } as unknown as MJAIAgentRunStepEntityExtended;
        const deliveredStep = await driver.validateSuccessNextStep(
            params,
            {
                step: 'Success',
                terminate: true,
                previousPayload: afterCriticLoopPayload,
                newPayload: afterCriticLoopPayload,
            },
            afterCriticLoopPayload,
            harness.agentRun,
            stepEntity,
        );

        expect(deliveredStep.step).toBe('Success');
        expect(deliveredStep.newPayload?.Status).toBe('Delivered');
        expect(deliveredStep.newPayload?.Output?.Videos?.['16:9']?.InlineBase64).toBe(
            rawMp4Base6416x9,
        );
        expect(deliveredStep.newPayload?.Output?.Videos?.['9:16']?.InlineBase64).toBe(
            rawMp4Base649x16,
        );
        // Ephemeral inline:<uuid> IDs are stripped on terminal exit so saved artifacts never trigger
        // failing CreateMediaAccessToken GraphQL calls
        expect(deliveredStep.newPayload?.Output?.PosterFileID).toBeUndefined();
        expect(deliveredStep.newPayload?.Output?.ContactSheetFileIDs).toBeUndefined();
        expect(deliveredStep.newPayload?.Review?.HumanReviewNotes).toContain(
            'Stored inline in the database, not in file storage',
        );
    });

    it('clears stale nested arrays (Beats[i].AssetRefs = [], DataRefs = [], OnScreenText = []) when subAgentPayload explicitly sets [] and initializes DataBindings even when Film is absent', async () => {
        const { CreateDeliveredSpecFixture } = await import('./fixtures/delivered-spec.fixture.js');
        const harness = createHarness(['Video Studio']);

        const mergedByPayloadManager = CreateDeliveredSpecFixture();
        mergedByPayloadManager.Status = 'Storyboarded';
        // Simulate PayloadManager.mergeUpstreamPayload retaining stale array entries when Storyboard
        // returned AssetRefs: [], DataRefs: [], OnScreenText: []
        mergedByPayloadManager.Beats[0].AssetRefs = ['stale-asset-key'];
        mergedByPayloadManager.Beats[0].DataRefs = ['stale-data-key'];
        mergedByPayloadManager.Beats[0].OnScreenText = ['Stale headline'];

        const subAgentPayload = CreateDeliveredSpecFixture();
        subAgentPayload.Status = 'Storyboarded';
        subAgentPayload.Beats[0].AssetRefs = [];
        subAgentPayload.Beats[0].DataRefs = [];
        subAgentPayload.Beats[0].OnScreenText = [];

        const driver = harness.agent as unknown as {
            ApplyStageResult: (
                params: ExecuteAgentParams,
                stageName: string,
                payload: Partial<VideoGenerationSpec>,
                stageSucceeded?: boolean,
                subAgentPayload?: Partial<VideoGenerationSpec>,
            ) => Partial<VideoGenerationSpec>;
        };

        const params: ExecuteAgentParams = {
            agent: harness.agentEntity,
            contextUser: harness.contextUser,
            conversationMessages: [],
        };

        const afterStoryboard = driver.ApplyStageResult(
            params,
            'Video Studio - Storyboard',
            mergedByPayloadManager,
            true,
            subAgentPayload,
        );

        expect(afterStoryboard.Beats?.[0]?.AssetRefs).toEqual([]);
        expect(afterStoryboard.Beats?.[0]?.DataRefs).toEqual([]);
        expect(afterStoryboard.Beats?.[0]?.OnScreenText).toEqual([]);

        // Also verify DataBindings is initialized to [] when Film is absent
        const withoutFilm = driver.ApplyStageResult(
            params,
            'Video Studio - Director',
            {} as Partial<VideoGenerationSpec>,
            false,
        );
        expect(withoutFilm.DataBindings).toEqual([]);
    });
});
