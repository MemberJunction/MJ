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
        return {
            ID: '99999999-8888-7777-6666-555555555555',
            StepType: opts.stepType,
            StepName: opts.stepName,
        } as unknown as MJAIAgentRunStepEntityExtended;
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
                Source: 'Conversation attachment',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
            {
                Key: 'attachment:reference-reel.mp4',
                Kind: 'Video',
                ArtifactVersionID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
                Source: 'Conversation attachment',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
            {
                Key: 'attachment:sketch.jpg',
                Kind: 'Image',
                FileID: 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
                Source: 'Conversation attachment',
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            },
        ]);
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
});

