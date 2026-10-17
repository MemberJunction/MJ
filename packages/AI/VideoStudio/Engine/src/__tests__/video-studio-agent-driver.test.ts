import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';

const {
    MockBaseAgent,
    mockGetConfigurationParamsWithInheritance,
    mockBrandKitEngineInstance,
    mockVideoStudioEngineInstance,
} = vi.hoisted(() => {
    const mockGetConfigParams = vi.fn<() => Array<{ Name: string; Value: string }>>(() => []);
    const brandKitEngine = {
        Config: vi.fn(async () => undefined),
        BrandKits: [] as Array<Record<string, unknown>>,
        GetDefaultKit: vi.fn<(companyId?: string | null) => Record<string, unknown> | null>(() => null),
        GetAssets: vi.fn<(kitId: string) => Array<Record<string, unknown>>>(() => []),
    };
    const videoStudioEngine = {
        Config: vi.fn(async () => undefined),
        GetArchetypeByName: vi.fn<(name: string, companyId?: string | null) => Record<string, unknown> | null>(() => null),
        GetArchetypesForCompany: vi.fn<(companyId?: string | null) => Array<Record<string, unknown>>>(() => []),
    };

    class HoistedMockBaseAgent {
        protected _agentRun: Partial<MJAIAgentRunEntityExtended> | null = null;
        protected _hierarchy: string[] = ['Video Studio'];

        public get AgentRun(): MJAIAgentRunEntityExtended | null {
            return this._agentRun as MJAIAgentRunEntityExtended | null;
        }

        public get AgentHierarchy(): string[] {
            return this._hierarchy;
        }

        protected async validateAgent(_agent: unknown): Promise<null> {
            return null;
        }

        protected async executeAgentInternal<P = unknown>(
            params: ExecuteAgentParams<P>,
            _config: AgentConfiguration,
        ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
            const hooks = params as ExecuteAgentParams<P> & {
                __onExecuteAgentInternal?: (seededParams: ExecuteAgentParams<P>) => void;
            };
            hooks.__onExecuteAgentInternal?.(params);
            return {
                finalStep: {
                    step: 'Success',
                    terminate: true,
                    newPayload: params.payload,
                } as BaseAgentNextStep<P>,
                stepCount: 1,
            };
        }

        protected async executeNextStep<P = unknown>(
            params: ExecuteAgentParams<P>,
            _config: AgentConfiguration,
            previousDecision: BaseAgentNextStep<P> | null,
            _stepCount: number = 0,
        ): Promise<BaseAgentNextStep<P>> {
            const hooks = params as ExecuteAgentParams<P> & {
                __mockNextStepResult?: BaseAgentNextStep<P>;
            };
            if (hooks.__mockNextStepResult) {
                return hooks.__mockNextStepResult;
            }
            return (
                previousDecision ??
                ({
                    step: 'Retry',
                    terminate: false,
                    newPayload: params.payload,
                } as BaseAgentNextStep<P>)
            );
        }

        protected async validateSubAgentNextStep<P = unknown>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
            _currentPayload: P,
            _agentRun: MJAIAgentRunEntityExtended,
            _currentStep: MJAIAgentRunStepEntityExtended,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
        }

        protected async validateSuccessNextStep<P = unknown>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
            _currentPayload: P,
            _agentRun: MJAIAgentRunEntityExtended,
            _currentStep: MJAIAgentRunStepEntityExtended,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
        }

        protected formatHierarchicalMessage(message: string): string {
            return message;
        }
    }

    return {
        MockBaseAgent: HoistedMockBaseAgent,
        mockGetConfigurationParamsWithInheritance: mockGetConfigParams,
        mockBrandKitEngineInstance: brandKitEngine,
        mockVideoStudioEngineInstance: videoStudioEngine,
    };
});

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: MockBaseAgent,
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                GetConfigurationParamsWithInheritance: mockGetConfigurationParamsWithInheritance,
            };
        },
    },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        BrandKitEngine: {
            get Instance() {
                return mockBrandKitEngineInstance;
            },
        },
        VideoStudioEngine: {
            get Instance() {
                return mockVideoStudioEngineInstance;
            },
        },
    };
});

import { VideoStudioAgent } from '../agents/video-studio-agent.js';
import { CreateDeliveredSpecFixture } from './fixtures/delivered-spec.fixture.js';

type TestableVideoStudioAgent = VideoStudioAgent & {
    executeAgentInternal<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams<P>,
        config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
    executeNextStep<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams<P>,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount?: number,
    ): Promise<BaseAgentNextStep<P>>;
    validateSubAgentNextStep<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>>;
    validateSuccessNextStep<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>>;
    resolvePlanModeGate(params: ExecuteAgentParams): Promise<{ active: boolean; approved: boolean }>;
    ApplyStageResult(
        params: ExecuteAgentParams,
        stageName: string,
        payload: Partial<VideoGenerationSpec>,
    ): Partial<VideoGenerationSpec>;
};

describe('VideoStudioAgent driver lifecycle', () => {
    const createAgent = (): TestableVideoStudioAgent =>
        new VideoStudioAgent() as unknown as TestableVideoStudioAgent;
    const dummyRun = {} as MJAIAgentRunEntityExtended;
    const dummyStep = {} as MJAIAgentRunStepEntityExtended;
    const dummyConfig = {} as AgentConfiguration;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfigurationParamsWithInheritance.mockReturnValue([]);
        mockBrandKitEngineInstance.BrandKits = [];
        mockBrandKitEngineInstance.GetDefaultKit.mockReturnValue(null);
        mockBrandKitEngineInstance.GetAssets.mockReturnValue([]);
        mockVideoStudioEngineInstance.GetArchetypeByName.mockReturnValue(null);
        mockVideoStudioEngineInstance.GetArchetypesForCompany.mockReturnValue([]);
    });

    it('(1) normalizes an empty payload {}, resolves Standard settings, and disables base Plan Mode', async () => {
        const agent = createAgent();
        const planGate = await agent.resolvePlanModeGate({} as ExecuteAgentParams);
        expect(planGate).toEqual({ active: false, approved: false });

        let seededPayload: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: {},
            conversationMessages: [],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                seededPayload = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);
        expect(seededPayload).toBeDefined();
        expect(seededPayload?.SpecVersion).toBe('1.0');
        expect(seededPayload?.Status).toBe('Briefing');
        expect(Array.isArray(seededPayload?.Review?.Gates)).toBe(true);
        expect(Array.isArray(seededPayload?.Assets?.Approved)).toBe(true);
        expect(seededPayload?.Render?.Fps).toBe(30);
        expect(seededPayload?.Interaction?.Mode).toBe('Autonomous');
        expect(seededPayload?.Interaction?.MaxRepairRounds).toBe(2);
    });

    it('(2) seeds BrandKit assets with brand:<Name> and :2 dedup, skips duplicate FileIDs, merges NeverInvent, and defaults VoiceID/Provider', async () => {
        const agent = createAgent();
        const kit = {
            ID: '10101010-2020-4030-8040-505050505050',
            Name: 'Acme Corporate Kit',
            CompanyID: 'C0C0C0C0-D0D0-4E0E-8F0F-111111111111',
            NeverInventObject: ['Competitor logos', 'Unaudited ARR figures'],
            VoiceObject: {
                VoiceID: 'voice-acme-default',
                Provider: 'ElevenLabs',
            },
            StyleObject: { primary: '#0B1020' },
        };
        mockBrandKitEngineInstance.GetDefaultKit.mockReturnValue(kit);
        mockBrandKitEngineInstance.BrandKits = [kit];
        mockBrandKitEngineInstance.GetAssets.mockReturnValue([
            {
                Name: 'Wordmark',
                Kind: 'Logo',
                FileID: 'AAAAAAAA-1111-4222-8333-444444444444',
                Usage: 'Primary header logo',
                MustUse: true,
            },
            {
                Name: 'Wordmark',
                Kind: 'Logo',
                FileID: 'BBBBBBBB-1111-4222-8333-444444444444',
                Usage: 'Monochrome footer logo',
                MustUse: false,
            },
            {
                Name: 'Duplicate File Entry',
                Kind: 'Logo',
                FileID: 'AAAAAAAA-1111-4222-8333-444444444444',
                Usage: 'Should be skipped because FileID already exists',
            },
        ]);

        let seeded: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: {
                CompanyID: 'C0C0C0C0-D0D0-4E0E-8F0F-111111111111',
            },
            conversationMessages: [],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                seeded = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);

        expect(seeded?.BrandKitID).toBe(kit.ID);
        expect(seeded?.Assets?.Approved).toHaveLength(2);
        expect(seeded?.Assets?.Approved[0]?.Key).toBe('brand:Wordmark');
        expect(seeded?.Assets?.Approved[1]?.Key).toBe('brand:Wordmark:2');
        expect(seeded?.Assets?.NeverInvent).toContain('Competitor logos');
        expect(seeded?.Audio?.Narration?.VoiceID).toBe('voice-acme-default');
        expect(seeded?.Audio?.Narration?.Provider).toBe('ElevenLabs');
    });

    it('(3) marks G1 Blocked and Status = Blocked after Director when a MustUse requirement is unmet, refusing Art Director', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Assets.Required.push({
            Key: 'ceo_signature',
            Kind: 'Image',
            Description: 'Handwritten CEO signature graphic',
            MustUse: true,
            AllowGenerated: false,
        });

        const progressEvents: unknown[] = [];
        const params = {
            payload: spec,
            onProgress: (ev: unknown) => progressEvents.push(ev),
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        const afterDirector = agent.ApplyStageResult(params, 'Video Studio - Director', spec);
        expect(afterDirector.Status).toBe('Blocked');
        expect(afterDirector.Review?.Gates.find((g) => g.Gate === 'G1')?.Status).toBe('Blocked');
        expect(progressEvents).toHaveLength(1);

        const artDirectorStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Art Director',
                message: 'Style the video',
                terminateAfter: false,
            },
        };
        const refusal = await agent.validateSubAgentNextStep(
            params,
            artDirectorStep,
            afterDirector,
            dummyRun,
            dummyStep,
        );
        expect(refusal.step).toBe('Retry');
        expect(refusal.retryInstructions).toContain('G1 (Facts)');
        expect(refusal.retryInstructions).toContain('UnmetMustUseRequirement');
    });

    it('(4) refuses parallel stage sub-agent invocations in validateSubAgentNextStep', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        const params = { payload: spec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        const parallelStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgents: [
                { name: 'Video Studio - Director', message: 'Run director', terminateAfter: false },
                { name: 'Video Studio - Art Director', message: 'Run art director', terminateAfter: false },
            ],
        };

        const validated = await agent.validateSubAgentNextStep(
            params,
            parallelStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(validated.step).toBe('Retry');
        expect(validated.retryInstructions).toContain('Only one Video Studio stage sub-agent may run at a time');
    });

    it('(5) pauses with step = Plan at G2 under ApproveStoryboard before Pre-Production, and advances on next turn when user approves', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Interaction.Mode = 'ApproveStoryboard';
        spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate !== 'G2');
        delete spec.Output;
        spec.Review.Rounds = [];

        const params = {
            payload: spec,
            planMode: true,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);

        const preProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Pre-Production',
                message: 'Run pre-production',
                terminateAfter: false,
            },
        };

        const paused = await agent.validateSubAgentNextStep(
            params,
            preProdStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(paused.step).toBe('Plan');
        expect(paused.terminate).toBe(false);
        expect(paused.planDetails?.plan).toContain('## Storyboard Review');
        expect(paused.newPayload?.Review?.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');

        // Next turn: user approves via form token
        let resumedPayload: Partial<VideoGenerationSpec> | undefined;
        const nextTurnParams = {
            payload: paused.newPayload,
            lastRunId: 'run-prev-123',
            conversationMessages: [
                {
                    role: 'user',
                    content:
                        'Approved.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"approve"}]}',
                },
            ],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                resumedPayload = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(nextTurnParams, dummyConfig);
        const g2AfterResume = resumedPayload?.Review?.Gates.find((g) => g.Gate === 'G2');
        expect(g2AfterResume?.Status).toBe('Passed');
        expect(g2AfterResume?.Notes).toBe('Approved');
        expect(g2AfterResume?.EvidenceRefs).toContain('approval:run-prev-123');

        // Now Pre-Production is allowed
        const allowed = await agent.validateSubAgentNextStep(
            nextTurnParams,
            preProdStep,
            resumedPayload!,
            dummyRun,
            dummyStep,
        );
        expect(allowed.step).toBe('Sub-Agent');
    });

    it('(6) resets G2 to Pending without AwaitingApproval when user replies with free-text revision feedback', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Interaction.Mode = 'ApproveStoryboard';
        spec.Review.Gates = [
            { Gate: 'G1', Status: 'Passed', EvidenceRefs: ['brief-verified'], Timestamp: '2026-10-17T00:00:10.000Z' },
            {
                Gate: 'G2',
                Status: 'Blocked',
                Notes: 'AwaitingApproval',
                EvidenceRefs: [],
                Timestamp: '2026-10-17T00:00:20.000Z',
            },
        ];

        let resumedPayload: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: spec,
            conversationMessages: [{ role: 'user', content: 'swap beats 2 and 3' }],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                resumedPayload = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);
        const g2 = resumedPayload?.Review?.Gates.find((g) => g.Gate === 'G2');
        expect(g2?.Status).toBe('Pending');
        expect(g2?.Notes).toBeUndefined();
    });

    it('(7) clears stale Output.Videos and ContactSheetFileIDs when Motion Engineer repairs after Critic failure', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Review.Rounds = [
            {
                Round: 1,
                Timestamp: '2026-10-17T00:01:10.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 2.0,
                        Category: 'Overflow',
                        Severity: 'Major',
                        Evidence: 'Text overflow',
                        SuggestedFix: 'Shrink heading',
                        Status: 'Open',
                    },
                ],
            },
        ];

        const params = { payload: spec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        const afterMotion = agent.ApplyStageResult(params, 'Video Studio - Motion Engineer', spec);
        expect(afterMotion.Output?.Videos).toBeUndefined();
        expect(afterMotion.Output?.ContactSheetFileIDs).toBeUndefined();
        expect(afterMotion.Status).toBe('Composed');
        expect(afterMotion.Review?.Gates.find((g) => g.Gate === 'G4')?.Status).toBe('Failed');
    });

    it('(8) refuses a 3rd Motion Engineer repair round when MaxRepairRounds is 2 and populates HumanReviewNotes on final delivery', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        delete spec.Review.HumanReviewNotes;
        spec.Review.Rounds = [
            {
                Round: 1,
                Timestamp: '2026-10-17T00:01:05.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 1.0,
                        Category: 'Overflow',
                        Severity: 'Major',
                        Evidence: 'd1',
                        SuggestedFix: 'f1',
                        Status: 'Open',
                    },
                ],
            },
            {
                Round: 2,
                Timestamp: '2026-10-17T00:01:10.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 1.0,
                        Category: 'Overflow',
                        Severity: 'Major',
                        Evidence: 'd2',
                        SuggestedFix: 'f2',
                        Status: 'Open',
                    },
                ],
            },
            {
                Round: 3,
                Timestamp: '2026-10-17T00:01:15.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 1.0,
                        Category: 'Overflow',
                        Severity: 'Major',
                        Evidence: 'Remaining minor overflow on 9:16',
                        SuggestedFix: 'Adjust card padding',
                        Status: 'Open',
                    },
                ],
            },
        ];

        const params = { payload: spec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(params, dummyConfig);

        const motionStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Motion Engineer',
                message: 'Repair again',
                terminateAfter: false,
            },
        };
        const refusedRepair = await agent.validateSubAgentNextStep(
            params,
            motionStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(refusedRepair.step).toBe('Retry');
        expect(refusedRepair.retryInstructions).toContain('G5 (Repair)');

        const successStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Success',
            terminate: true,
            newPayload: spec,
        };
        const delivered = await agent.validateSuccessNextStep(
            params,
            successStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(delivered.step).toBe('Success');
        expect(delivered.newPayload?.Status).toBe('Delivered');
        expect(delivered.newPayload?.Review?.HumanReviewNotes).toContain('Deferred defects');
        expect(delivered.newPayload?.Review?.HumanReviewNotes).toContain('hero_abstract_grid');
    });

    it('(9) refuses Success when G6 fails, injects stage templateParameters, and sets Status = Delivered only when G1..G6 all pass', async () => {
        const agent = createAgent();
        const incompleteSpec = CreateDeliveredSpecFixture();
        delete incompleteSpec.Output!.PosterFileID;

        const incompleteParams = {
            payload: incompleteSpec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(incompleteParams, dummyConfig);

        const rejectedSuccess = await agent.validateSuccessNextStep(
            incompleteParams,
            { step: 'Success', terminate: true, newPayload: incompleteSpec },
            incompleteSpec,
            dummyRun,
            dummyStep,
        );
        expect(rejectedSuccess.step).toBe('Retry');
        expect(rejectedSuccess.retryInstructions).toContain('G6');
        expect(rejectedSuccess.newPayload?.Status).not.toBe('Delivered');

        // Verify templateParameters injection on Director sub-agent call
        const directorStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Director',
                message: 'Build brief',
                terminateAfter: false,
            },
        };
        const validatedDirector = await agent.validateSubAgentNextStep(
            incompleteParams,
            directorStep,
            incompleteSpec,
            dummyRun,
            dummyStep,
        );
        expect(validatedDirector.subAgent?.templateParameters?.archetypeCatalog).toBeDefined();

        // Full spec passes G1..G6 and sets Status = 'Delivered'
        const completeSpec = CreateDeliveredSpecFixture();
        const completeParams = {
            payload: completeSpec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(completeParams, dummyConfig);
        const acceptedSuccess = await agent.validateSuccessNextStep(
            completeParams,
            { step: 'Success', terminate: true, newPayload: completeSpec },
            completeSpec,
            dummyRun,
            dummyStep,
        );
        expect(acceptedSuccess.step).toBe('Success');
        expect(acceptedSuccess.newPayload?.Status).toBe('Delivered');
    });
});
