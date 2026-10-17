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
        GetKitsForCompany: vi.fn<(companyId?: string | null) => Array<Record<string, unknown>>>(() => []),
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
        protected ProviderToUse: unknown = undefined;
        protected _fileOutputs: Array<Record<string, unknown>> = [];

        public get FileOutputs(): Array<Record<string, unknown>> {
            return this._fileOutputs;
        }

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
            const result =
                hooks.__mockNextStepResult ??
                previousDecision ??
                ({
                    step: 'Retry',
                    terminate: false,
                    newPayload: params.payload,
                } as BaseAgentNextStep<P>);
            if (this._agentRun && result.newPayload !== undefined) {
                this._agentRun.FinalPayloadObject = JSON.parse(JSON.stringify(result.newPayload));
            }
            return result;
        }

        protected async validateNextStep<P = unknown>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
            _currentPayload: P,
            _agentRun: MJAIAgentRunEntityExtended,
            _currentStep: MJAIAgentRunStepEntityExtended,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
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
    validateNextStep<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
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
        stageSucceeded?: boolean,
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
        mockBrandKitEngineInstance.Config.mockResolvedValue(undefined);
        mockBrandKitEngineInstance.BrandKits = [];
        mockBrandKitEngineInstance.GetDefaultKit.mockReturnValue(null);
        mockBrandKitEngineInstance.GetKitsForCompany.mockReturnValue([]);
        mockBrandKitEngineInstance.GetAssets.mockReturnValue([]);
        mockVideoStudioEngineInstance.Config.mockResolvedValue(undefined);
        mockVideoStudioEngineInstance.GetArchetypeByName.mockReturnValue(null);
        mockVideoStudioEngineInstance.GetArchetypesForCompany.mockReturnValue([]);
    });

    it('(1) normalizes {}, refuses early Success with G1 + errorMessage, resolves mode precedence (depth 1 -> Autonomous, planMode -> ApproveStoryboard, two-turn root -> archetype default, archetype switch -> re-evaluates), and keeps resolvePlanModeGate inactive', async () => {
        const agent = createAgent();
        const planGate = await agent.resolvePlanModeGate({ planMode: true } as ExecuteAgentParams);
        expect(planGate).toEqual({ active: false, approved: false });

        const callerPayload: Partial<VideoGenerationSpec> = {};
        let seededPayload: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: callerPayload,
            conversationMessages: [],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                seededPayload = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);
        expect(callerPayload).toEqual({});
        expect(seededPayload).toBeDefined();
        expect(seededPayload?.SpecVersion).toBe('1.0');
        expect(seededPayload?.Status).toBe('Briefing');
        expect(Array.isArray(seededPayload?.Review?.Gates)).toBe(true);
        expect(Array.isArray(seededPayload?.Assets?.Approved)).toBe(true);
        expect(seededPayload?.Render?.Fps).toBe(30);
        expect(seededPayload?.Interaction).toBeUndefined();

        // Acceptance item 1: An early Success on {} is a Retry naming G1, with errorMessage set
        const earlySuccess = await agent.validateSuccessNextStep(
            params,
            { step: 'Success', terminate: true, newPayload: seededPayload },
            seededPayload!,
            dummyRun,
            dummyStep,
        );
        expect(earlySuccess.step).toBe('Retry');
        expect(earlySuccess.retryInstructions).toContain('gate G1');
        expect(earlySuccess.errorMessage).toBeDefined();
        expect(earlySuccess.errorMessage).toContain('gate G1');

        mockVideoStudioEngineInstance.GetArchetypeByName.mockImplementation((name: string) => {
            if (name === 'Customer Story') {
                return { Name: 'Customer Story', DefaultInteractionMode: 'ApproveStoryboard' };
            }
            if (name === 'Topic Explainer') {
                return { Name: 'Topic Explainer', DefaultInteractionMode: 'Autonomous' };
            }
            return null;
        });

        const preProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Pre-Production',
                message: 'Run pre-production',
                terminateAfter: false,
            },
        };

        // Acceptance item 6: depth 1 (below root via parentRun) with no mode resolves to Autonomous without writing Interaction.Mode
        const childAgent = createAgent();
        let childSeeded: Partial<VideoGenerationSpec> | undefined;
        const childParams = {
            payload: {},
            parentRun: { ID: 'parent-run-1' } as MJAIAgentRunEntityExtended,
            __onExecuteAgentInternal: (sp: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                childSeeded = sp.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await childAgent.executeAgentInternal(childParams, dummyConfig);
        expect(childSeeded?.Interaction).toBeUndefined();
        const childStorySpec = CreateDeliveredSpecFixture() as Partial<VideoGenerationSpec>;
        delete childStorySpec.Interaction;
        childStorySpec.Archetype = { Name: 'Customer Story' };
        childStorySpec.Review!.Gates = childStorySpec.Review!.Gates.filter((g) => g.Gate !== 'G2');
        const childPreProd = await childAgent.validateSubAgentNextStep(
            childParams,
            preProdStep,
            childStorySpec,
            dummyRun,
            dummyStep,
        );
        expect(childPreProd.step).toBe('Sub-Agent');

        // Acceptance item 6: planMode: true at root resolves to ApproveStoryboard without writing Interaction.Mode
        const planModeAgent = createAgent();
        let planModeSeeded: Partial<VideoGenerationSpec> | undefined;
        const planModeParams = {
            payload: {},
            planMode: true,
            __onExecuteAgentInternal: (sp: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                planModeSeeded = sp.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await planModeAgent.executeAgentInternal(planModeParams, dummyConfig);
        expect(planModeSeeded?.Interaction).toBeUndefined();
        const planModeExplainerSpec = CreateDeliveredSpecFixture() as Partial<VideoGenerationSpec>;
        delete planModeExplainerSpec.Interaction;
        planModeExplainerSpec.Archetype = { Name: 'Topic Explainer' };
        planModeExplainerSpec.Review!.Gates = planModeExplainerSpec.Review!.Gates.filter((g) => g.Gate !== 'G2');
        const planModePreProd = await planModeAgent.validateSubAgentNextStep(
            planModeParams,
            preProdStep,
            planModeExplainerSpec,
            dummyRun,
            dummyStep,
        );
        expect(planModePreProd.step).toBe('Plan');

        // Acceptance item 6 + Claude Decision 2: Two-turn root archetype default mode + archetype switch:
        // Director first picks an Autonomous archetype ('Topic Explainer') — and even if the stage tries to write
        // Interaction.Mode, the driver drops it — then switches to an ApproveStoryboard archetype ('Customer Story')
        // -> storyboard approval is required (step === 'Plan').
        const turn2Agent = createAgent();
        let turn2Seeded: Partial<VideoGenerationSpec> | undefined;
        const turn2Params = {
            payload: seededPayload, // from Turn 1 where Interaction was left unset
            conversationMessages: [],
            __onExecuteAgentInternal: (sp: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                turn2Seeded = sp.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await turn2Agent.executeAgentInternal(turn2Params, dummyConfig);
        expect(turn2Seeded?.Interaction).toBeUndefined();

        const firstPickSpec = CreateDeliveredSpecFixture();
        firstPickSpec.Archetype = { Name: 'Topic Explainer' };
        firstPickSpec.Interaction = { Mode: 'Autonomous', MaxRepairRounds: 2 }; // stage attempt to write Interaction.Mode
        firstPickSpec.Review.Gates = firstPickSpec.Review.Gates.filter((g) => g.Gate !== 'G2');
        const afterFirstDirector = turn2Agent.ApplyStageResult(
            turn2Params,
            'Video Studio - Director',
            firstPickSpec,
        );
        expect(afterFirstDirector.Interaction).toBeUndefined();

        const switchedSpec = {
            ...afterFirstDirector,
            Archetype: { Name: 'Customer Story' },
        };
        const afterDirectorSwitch = turn2Agent.ApplyStageResult(
            turn2Params,
            'Video Studio - Director',
            switchedSpec,
        );
        expect(afterDirectorSwitch.Interaction).toBeUndefined();

        const pausedOnTurn2 = await turn2Agent.validateSubAgentNextStep(
            turn2Params,
            preProdStep,
            afterDirectorSwitch,
            dummyRun,
            dummyStep,
        );
        expect(pausedOnTurn2.step).toBe('Plan');

        // Action caller with Interaction: { Mode: 'Autonomous', MaxRepairRounds: 9 } and the same archetype switch -> not required,
        // and MaxRepairRounds is always overwritten from settings (2) rather than trusting caller payload (9)
        const callerAutonomousAgent = createAgent();
        const callerAutonomousSpec = CreateDeliveredSpecFixture();
        callerAutonomousSpec.Archetype = { Name: 'Topic Explainer' };
        callerAutonomousSpec.Interaction = { Mode: 'Autonomous', MaxRepairRounds: 9 };
        callerAutonomousSpec.Review.Gates = callerAutonomousSpec.Review.Gates.filter((g) => g.Gate !== 'G2');
        let callerAutonomousSeeded: Partial<VideoGenerationSpec> | undefined;
        const callerAutonomousParams = {
            payload: callerAutonomousSpec,
            conversationMessages: [],
            __onExecuteAgentInternal: (sp: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                callerAutonomousSeeded = sp.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await callerAutonomousAgent.executeAgentInternal(callerAutonomousParams, dummyConfig);
        expect(callerAutonomousSeeded?.Interaction).toEqual({ Mode: 'Autonomous', MaxRepairRounds: 2 });
        const callerSwitched = callerAutonomousAgent.ApplyStageResult(
            callerAutonomousParams,
            'Video Studio - Director',
            {
                ...callerAutonomousSpec,
                Archetype: { Name: 'Customer Story' },
                Interaction: { Mode: 'Autonomous', MaxRepairRounds: 9 },
            },
        );
        expect(callerSwitched.Interaction).toEqual({ Mode: 'Autonomous', MaxRepairRounds: 2 });
        const allowedAutonomous = await callerAutonomousAgent.validateSubAgentNextStep(
            callerAutonomousParams,
            preProdStep,
            callerSwitched,
            dummyRun,
            dummyStep,
        );
        expect(allowedAutonomous.step).toBe('Sub-Agent');

        // A throwing GetArchetypeByName rejects instead of silently resolving to Autonomous
        const throwingEngineAgent = createAgent();
        const throwingEngineParams = {
            payload: {},
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await throwingEngineAgent.executeAgentInternal(throwingEngineParams, dummyConfig);
        mockVideoStudioEngineInstance.GetArchetypeByName.mockImplementationOnce(() => {
            throw new Error('VideoStudioEngine not initialized');
        });
        await expect(
            throwingEngineAgent.validateSubAgentNextStep(
                throwingEngineParams,
                preProdStep,
                childStorySpec,
                dummyRun,
                dummyStep,
            ),
        ).rejects.toThrow('VideoStudioEngine not initialized');
    });

    it('(2) seeds BrandKit assets via AssetType with brand:<Name> and :2 dedup, skips duplicate FileIDs, merges NeverInvent, defaults VoiceID/Provider, forwards ProviderToUse to engine Config, and refuses Pre-Production when BrandKitID is unknown or out of scope', async () => {
        const agent = createAgent();
        const mockProvider = { Name: 'ScopedMetadataProvider' };
        (agent as unknown as { ProviderToUse: unknown }).ProviderToUse = mockProvider;
        const mockContextUser = { ID: 'user-ctx-1' };
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
                AssetType: 'Logo',
                FileID: 'AAAAAAAA-1111-4222-8333-444444444444',
                Usage: 'Primary header logo',
            },
            {
                Name: 'Wordmark',
                AssetType: 'Logo',
                FileID: 'BBBBBBBB-1111-4222-8333-444444444444',
                Usage: 'Monochrome footer logo',
            },
            {
                Name: 'Duplicate File Entry',
                AssetType: 'Logo',
                FileID: 'AAAAAAAA-1111-4222-8333-444444444444',
                Usage: 'Should be skipped because FileID already exists',
            },
        ]);

        let seeded: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: {
                CompanyID: 'C0C0C0C0-D0D0-4E0E-8F0F-111111111111',
            },
            contextUser: mockContextUser,
            conversationMessages: [],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                seeded = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);

        expect(mockVideoStudioEngineInstance.Config).toHaveBeenCalledWith(
            false,
            mockContextUser,
            mockProvider,
        );
        expect(mockBrandKitEngineInstance.Config).toHaveBeenCalledWith(
            false,
            mockContextUser,
            mockProvider,
        );
        expect(seeded?.BrandKitID).toBe(kit.ID);
        expect(seeded?.Assets?.Approved).toHaveLength(2);
        expect(seeded?.Assets?.Approved[0]?.Key).toBe('brand:Wordmark');
        expect(seeded?.Assets?.Approved[0]?.Kind).toBe('Logo');
        expect(seeded?.Assets?.Approved[0]?.MustUse).toBe(false);
        expect(seeded?.Assets?.Approved[1]?.Key).toBe('brand:Wordmark:2');
        expect(seeded?.Assets?.NeverInvent).toContain('Competitor logos');
        expect(seeded?.Audio?.Narration?.VoiceID).toBe('voice-acme-default');
        expect(seeded?.Audio?.Narration?.Provider).toBe('ElevenLabs');

        // When BrandKitID is unknown (not in BrandKitEngine.BrandKits), _brandKitInScope is false
        // and Pre-Production is refused with a Retry naming G1 and errorMessage set
        const missingKitAgent = createAgent();
        mockBrandKitEngineInstance.BrandKits = [];
        const specWithMissingKit = CreateDeliveredSpecFixture();
        specWithMissingKit.BrandKitID = '99999999-8888-4777-8666-555555555555';
        const missingKitParams = {
            payload: specWithMissingKit,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await missingKitAgent.executeAgentInternal(missingKitParams, dummyConfig);
        const preProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Pre-Production',
                message: 'Generate assets',
                terminateAfter: false,
            },
        };
        const refusedPreProdMissingKit = await missingKitAgent.validateSubAgentNextStep(
            missingKitParams,
            preProdStep,
            specWithMissingKit,
            dummyRun,
            dummyStep,
        );
        expect(refusedPreProdMissingKit.step).toBe('Retry');
        expect(refusedPreProdMissingKit.retryInstructions).toContain('G1 (Facts)');
        expect(refusedPreProdMissingKit.errorMessage).toContain('G1 (Facts)');

        // When BrandKitID belongs to another company, _brandKitInScope is false and Pre-Production is refused naming G1
        const outOfScopeAgent = createAgent();
        mockBrandKitEngineInstance.BrandKits = [
            {
                ID: '99999999-8888-4777-8666-555555555555',
                Name: 'Other Tenant Kit',
                CompanyID: 'EEEEEEEE-FFFF-4000-8000-222222222222',
            },
        ];
        const outOfScopeSpec = CreateDeliveredSpecFixture();
        outOfScopeSpec.CompanyID = 'C0C0C0C0-D0D0-4E0E-8F0F-111111111111';
        outOfScopeSpec.BrandKitID = '99999999-8888-4777-8666-555555555555';
        const outOfScopeParams = {
            payload: outOfScopeSpec,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await outOfScopeAgent.executeAgentInternal(outOfScopeParams, dummyConfig);
        const refusedOutOfScope = await outOfScopeAgent.validateSubAgentNextStep(
            outOfScopeParams,
            preProdStep,
            outOfScopeSpec,
            dummyRun,
            dummyStep,
        );
        expect(refusedOutOfScope.step).toBe('Retry');
        expect(refusedOutOfScope.retryInstructions).toContain('G1 (Facts)');
        expect(refusedOutOfScope.errorMessage).toContain('G1 (Facts)');

        // When BrandKitEngine.Config rejects, warmEngines propagates the rejection
        mockBrandKitEngineInstance.Config.mockRejectedValueOnce(new Error('BrandKit DB connection failed'));
        await expect(agent.executeAgentInternal(params, dummyConfig)).rejects.toThrow('BrandKit DB connection failed');
    });

    it('(3) marks G1 Blocked and Status = Blocked after Director when a MustUse requirement is unmet, refusing Art Director with errorMessage', async () => {
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
        expect(refusal.errorMessage).toContain('G1 (Facts)');
        expect(refusal.errorMessage).toContain('UnmetMustUseRequirement');
    });

    it('(4) refuses parallel stage sub-agents, ForEach/While stage loops, and stage Sub-Agent steps with terminateAfter = true or finishIf (all with errorMessage), normalizes ClientTools terminate to false, and passes non-stage ForEach to super', async () => {
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
        expect(validated.errorMessage).toContain('Only one Video Studio stage sub-agent may run at a time');

        // ForEach targeting Pre-Production is refused with errorMessage
        const forEachStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'ForEach',
            terminate: false,
            forEach: {
                collectionPath: 'Beats',
                subAgent: {
                    name: 'Video Studio - Pre-Production',
                    message: 'Generate per beat',
                },
            },
        };
        const refusedForEach = await agent.validateNextStep(params, forEachStep, spec, dummyRun, dummyStep);
        expect(refusedForEach.step).toBe('Retry');
        expect(refusedForEach.retryInstructions).toBe('Call stages with a Sub-Agent step, one at a time');
        expect(refusedForEach.errorMessage).toBe('Call stages with a Sub-Agent step, one at a time');

        // ForEach targeting a non-stage sub-agent reaches super unchanged
        const nonStageForEach: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'ForEach',
            terminate: false,
            forEach: {
                collectionPath: 'Items',
                subAgent: {
                    name: 'External Utility Agent',
                    message: 'Run utility',
                },
            },
        };
        const allowedNonStageForEach = await agent.validateNextStep(
            params,
            nonStageForEach,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(allowedNonStageForEach.step).toBe('ForEach');

        // While targeting Pre-Production is refused with errorMessage
        const whileStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'While',
            terminate: false,
            while: {
                condition: 'payload.Review.Rounds.length < 2',
                subAgent: {
                    name: 'Video Studio - Pre-Production',
                    message: 'Retry generation',
                },
            },
        };
        const refusedWhile = await agent.validateNextStep(params, whileStep, spec, dummyRun, dummyStep);
        expect(refusedWhile.step).toBe('Retry');
        expect(refusedWhile.retryInstructions).toBe('Call stages with a Sub-Agent step, one at a time');
        expect(refusedWhile.errorMessage).toBe('Call stages with a Sub-Agent step, one at a time');

        // Sub-Agent targeting Critic with terminateAfter: true is refused with errorMessage
        const terminateAfterStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Critic',
                message: 'Final review',
                terminateAfter: true,
            },
        };
        const refusedTerminateAfter = await agent.validateSubAgentNextStep(
            params,
            terminateAfterStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(refusedTerminateAfter.step).toBe('Retry');
        expect(refusedTerminateAfter.terminate).toBe(false);
        expect(refusedTerminateAfter.retryInstructions).toBe('Stages never end the run; finish with Success');
        expect(refusedTerminateAfter.errorMessage).toBe('Stages never end the run; finish with Success');

        // Sub-Agent targeting Critic with finishIf set on the BaseAgentNextStep object is refused with errorMessage
        const finishIfStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Critic',
                message: 'Conditional finish',
                terminateAfter: false,
            },
            finishIf: {
                questions: ['Is the film finished?'],
                message: 'Done',
            },
        };
        const refusedFinishIf = await agent.validateSubAgentNextStep(
            params,
            finishIfStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(refusedFinishIf.step).toBe('Retry');
        expect(refusedFinishIf.terminate).toBe(false);
        expect(refusedFinishIf.retryInstructions).toBe('Stages never end the run; finish with Success');
        expect(refusedFinishIf.errorMessage).toBe('Stages never end the run; finish with Success');

        // ClientTools step with terminate: true is normalized to terminate: false
        const clientToolsStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'ClientTools' as BaseAgentNextStep<Partial<VideoGenerationSpec>>['step'],
            terminate: true,
            clientTools: [
                {
                    Name: 'UpdateTimelinePreview',
                    Params: { status: 'Composing' },
                },
            ],
        };
        const normalizedClientTools = await agent.validateNextStep(
            params,
            clientToolsStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(normalizedClientTools.step).toBe('ClientTools');
        expect(normalizedClientTools.terminate).toBe(false);
    });

    it('(5) refuses Pre-Production before G2 with errorMessage, pauses with step = Plan (containing beats) at G2 under ApproveStoryboard (including case-insensitive stage names), and advances on next turn when user approves without mutating caller params', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Interaction.Mode = 'ApproveStoryboard';
        spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate !== 'G2');
        delete spec.Output;
        spec.Review.Rounds = [];

        const preProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Pre-Production',
                message: 'Run pre-production',
                terminateAfter: false,
            },
        };

        // Before G2 storyboard is valid (empty Beats), Pre-Production is refused with Retry + errorMessage
        const unreadySpec = CreateDeliveredSpecFixture();
        unreadySpec.Beats = [];
        const unreadyParams = {
            payload: unreadySpec,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(unreadyParams, dummyConfig);
        const refusedBeforeG2 = await agent.validateSubAgentNextStep(
            unreadyParams,
            preProdStep,
            unreadySpec,
            dummyRun,
            dummyStep,
        );
        expect(refusedBeforeG2.step).toBe('Retry');
        expect(refusedBeforeG2.retryInstructions).toContain('G2 (Plan)');
        expect(refusedBeforeG2.errorMessage).toContain('G2 (Plan)');

        // Case-insensitive stage name: 'video studio - pre-production' with no storyboard -> Retry naming G2
        const lowercasePreProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'video studio - pre-production',
                message: 'Run pre-production lowercase',
                terminateAfter: false,
            },
        };
        const refusedLowercaseBeforeG2 = await agent.validateSubAgentNextStep(
            unreadyParams,
            lowercasePreProdStep,
            unreadySpec,
            dummyRun,
            dummyStep,
        );
        expect(refusedLowercaseBeforeG2.step).toBe('Retry');
        expect(refusedLowercaseBeforeG2.retryInstructions).toContain('G2 (Plan)');
        expect(refusedLowercaseBeforeG2.errorMessage).toContain('G2 (Plan)');

        // With valid storyboard under ApproveStoryboard, Pre-Production returns step = 'Plan' with the beats table
        const params = {
            payload: spec,
            planMode: true,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);

        // Case-insensitive stage name: 'VIDEO STUDIO - PRE-PRODUCTION' under ApproveStoryboard -> Plan
        const uppercasePreProdStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'VIDEO STUDIO - PRE-PRODUCTION',
                message: 'Run pre-production uppercase',
                terminateAfter: false,
            },
        };
        const pausedUppercase = await agent.validateSubAgentNextStep(
            params,
            uppercasePreProdStep,
            spec,
            dummyRun,
            dummyStep,
        );
        expect(pausedUppercase.step).toBe('Plan');
        expect(pausedUppercase.planDetails?.plan).toContain('## Storyboard Review');

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
        expect(paused.planDetails?.plan).toContain('beat-1');
        expect(paused.planDetails?.plan).toContain('Hook');
        expect(paused.newPayload?.Review?.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');

        // Next turn: user approves via form token; caller's params.payload is not mutated
        const callerPausedPayload = JSON.parse(JSON.stringify(paused.newPayload)) as Partial<VideoGenerationSpec>;
        let resumedPayload: Partial<VideoGenerationSpec> | undefined;
        const nextTurnParams = {
            payload: callerPausedPayload,
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
        // Caller's params.payload remains untouched
        expect(callerPausedPayload.Review?.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');
        expect(callerPausedPayload.Review?.Gates.find((g) => g.Gate === 'G2')?.Status).toBe('Blocked');

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

    it('(6) resets G2 to Pending without AwaitingApproval on form-token reject or free-text revision feedback without mutating caller params', async () => {
        const agent = createAgent();
        const makeAwaitingSpec = (): VideoGenerationSpec => {
            const s = CreateDeliveredSpecFixture();
            s.Interaction.Mode = 'ApproveStoryboard';
            s.Review.Gates = [
                { Gate: 'G1', Status: 'Passed', EvidenceRefs: ['brief-verified'], Timestamp: '2026-10-17T00:00:10.000Z' },
                {
                    Gate: 'G2',
                    Status: 'Blocked',
                    Notes: 'AwaitingApproval',
                    EvidenceRefs: [],
                    Timestamp: '2026-10-17T00:00:20.000Z',
                },
            ];
            return s;
        };

        // Form-token reject
        const formRejectCallerSpec = makeAwaitingSpec();
        let formRejectResumed: Partial<VideoGenerationSpec> | undefined;
        await agent.executeAgentInternal(
            {
                payload: formRejectCallerSpec,
                conversationMessages: [
                    {
                        role: 'user',
                        content:
                            'Rejected.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"reject"}]}',
                    },
                ],
                __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                    formRejectResumed = seededParams.payload;
                },
            } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            dummyConfig,
        );
        expect(formRejectCallerSpec.Review.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');
        const g2FormRejected = formRejectResumed?.Review?.Gates.find((g) => g.Gate === 'G2');
        expect(g2FormRejected?.Status).toBe('Pending');
        expect(g2FormRejected?.Notes).toBeUndefined();

        // Free-text revision feedback
        const spec = makeAwaitingSpec();
        let resumedPayload: Partial<VideoGenerationSpec> | undefined;
        const params = {
            payload: spec,
            conversationMessages: [{ role: 'user', content: 'swap beats 2 and 3' }],
            __onExecuteAgentInternal: (seededParams: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                resumedPayload = seededParams.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await agent.executeAgentInternal(params, dummyConfig);
        expect(spec.Review.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');
        const g2 = resumedPayload?.Review?.Gates.find((g) => g.Gate === 'G2');
        expect(g2?.Status).toBe('Pending');
        expect(g2?.Notes).toBeUndefined();
    });

    it('(7) clears stale Output.Videos/G4 approval after Motion Engineer, clears G2 approval/Output.Source after Storyboard, swallows throwing onProgress, preserves evidence on stage failure, fails G2 on narration-less storyboard, and reaches Motion Engineer after narrated Pre-Production succeeds', async () => {
        const agent = createAgent();
        const spec = CreateDeliveredSpecFixture();
        spec.Interaction.Mode = 'ApproveStoryboardAndRoughCut';
        spec.Review.Gates = spec.Review.Gates.map((g) =>
            g.Gate === 'G4' ? { ...g, Status: 'Passed', Notes: 'Approved' } : g,
        );
        spec.Review.Rounds = [
            {
                Round: 1,
                Timestamp: '2026-10-17T00:01:10.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 2.0,
                        Severity: 'Major',
                        Evidence: 'Text overflow',
                        Fix: 'Shrink heading',
                        Status: 'Open',
                    },
                ],
            },
        ];

        // Throwing onProgress is swallowed in both ApplyStageResult and executeAgentInternal
        const throwingProgressParams = {
            payload: spec,
            onProgress: () => {
                throw new Error('Progress callback exploded');
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await expect(agent.executeAgentInternal(throwingProgressParams, dummyConfig)).resolves.toBeDefined();

        const afterMotion = agent.ApplyStageResult(throwingProgressParams, 'Video Studio - Motion Engineer', spec);
        expect(afterMotion.Output?.Videos).toBeUndefined();
        expect(afterMotion.Output?.ContactSheetFileIDs).toBeUndefined();
        expect(afterMotion.Status).toBe('Composed');
        expect(afterMotion.Review?.Gates.find((g) => g.Gate === 'G4')?.Status).toBe('Failed');
        expect(afterMotion.Review?.Gates.find((g) => g.Gate === 'G4')?.Notes).not.toBe('Approved');

        // Storyboard result clears G2 approval and Output.Source, and executeNextStep updates AgentRun.FinalPayloadObject
        // even when the stage name is lowercase ('video studio - storyboard')
        const specBeforeStoryboard = CreateDeliveredSpecFixture();
        specBeforeStoryboard.Interaction.Mode = 'ApproveStoryboard';
        const storyboardParams = {
            payload: specBeforeStoryboard,
            __mockNextStepResult: {
                step: 'Retry',
                terminate: false,
                newPayload: specBeforeStoryboard,
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(storyboardParams, dummyConfig);
        (agent as unknown as { _agentRun: Partial<MJAIAgentRunEntityExtended> })._agentRun = {
            FinalPayloadObject: undefined,
        };
        const storyboardStepResult = await agent.executeNextStep(
            storyboardParams,
            dummyConfig,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: {
                    name: 'video studio - storyboard',
                    message: 'Rebuild beats',
                    terminateAfter: false,
                },
            },
            1,
        );
        expect(storyboardStepResult.newPayload?.Output?.Source).toBeUndefined();
        expect(storyboardStepResult.newPayload?.Output?.Videos).toBeUndefined();
        expect(storyboardStepResult.newPayload?.Review?.Gates.find((g) => g.Gate === 'G2')?.Status).toBe('Pending');
        expect(storyboardStepResult.newPayload?.Review?.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');

        const finalPayloadAfterStoryboard = agent.AgentRun?.FinalPayloadObject as Partial<VideoGenerationSpec> | undefined;
        expect(finalPayloadAfterStoryboard?.Output?.Source).toBeUndefined();
        expect(finalPayloadAfterStoryboard?.Output?.Videos).toBeUndefined();
        expect(finalPayloadAfterStoryboard?.Review?.Gates.find((g) => g.Gate === 'G2')?.Status).toBe('Pending');
        expect(finalPayloadAfterStoryboard?.Review?.Gates.find((g) => g.Gate === 'G2')?.Notes).toBe('AwaitingApproval');

        // When a stage sub-agent fails (result.step === 'Failed'), executeNextStep does NOT clear downstream evidence
        const specBeforeFailedMotion = CreateDeliveredSpecFixture();
        const progressEvents: unknown[] = [];
        const failedStepParams = {
            payload: specBeforeFailedMotion,
            onProgress: (ev: unknown) => progressEvents.push(ev),
            __mockNextStepResult: {
                step: 'Failed',
                terminate: true,
                newPayload: specBeforeFailedMotion,
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        const previousSubAgentDecision: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Motion Engineer',
                message: 'Attempt repair',
                terminateAfter: false,
            },
        };
        const failedResult = await agent.executeNextStep(
            failedStepParams,
            dummyConfig,
            previousSubAgentDecision,
            1,
        );
        expect(failedResult.step).toBe('Failed');
        expect(failedResult.newPayload?.Output?.Videos).toBeDefined();
        expect(failedResult.newPayload?.Output?.ContactSheetFileIDs).toBeDefined();
        expect(failedResult.newPayload?.Review?.Gates.find((g) => g.Gate === 'G3')?.Status).toBe('Passed');
        expect(progressEvents).toHaveLength(1);

        // Narration-less storyboard fails G2 with MissingNarrationScript
        const narrationlessSpec = CreateDeliveredSpecFixture();
        narrationlessSpec.Audio = { Cues: [], Captions: 'None' };
        for (const beat of narrationlessSpec.Beats) {
            delete beat.NarrationKey;
        }
        const afterNarrationlessStoryboard = agent.ApplyStageResult(
            { payload: narrationlessSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            'Video Studio - Storyboard',
            narrationlessSpec,
            true,
        );
        const g2Narrationless = afterNarrationlessStoryboard.Review?.Gates.find((g) => g.Gate === 'G2');
        expect(g2Narrationless?.Status).toBe('Failed');
        expect(g2Narrationless?.Notes).toContain('MissingNarrationScript');

        // Narrated film (with narration lines, no bindings, no asset generation):
        // Missing AudioFileID or Pre-Production failure keeps Status === 'Approved',
        // whereas Pre-Production success with AudioFileID advances Status to 'PreProduced'
        // and allows Motion Engineer to run.
        const narratedSpec = CreateDeliveredSpecFixture();
        narratedSpec.Archetype = { Name: 'product-launch' };
        delete narratedSpec.Output;
        narratedSpec.Review.Rounds = [];
        narratedSpec.DataBindings = [];
        delete narratedSpec.DataSnapshot;
        narratedSpec.Assets.Generate = [];
        narratedSpec.Assets.Approved = narratedSpec.Assets.Approved.filter((a) => a.Provenance !== 'Generated');
        for (const beat of narratedSpec.Beats) {
            beat.DataRefs = [];
            beat.OnScreenText = ['Headline'];
        }
        for (const line of narratedSpec.Audio.Narration!.Script) {
            line.Text = 'Momentum continues across every segment.';
        }
        narratedSpec.Film.OneSentence = 'Q3 revenue momentum reached record highs.';
        narratedSpec.Status = 'Approved';

        const missingAudioFileSpec = JSON.parse(JSON.stringify(narratedSpec)) as VideoGenerationSpec;
        delete missingAudioFileSpec.Audio.Narration!.Script[0].AudioFileID;
        await agent.executeAgentInternal(
            { payload: missingAudioFileSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            dummyConfig,
        );
        const afterIncompletePreProd = agent.ApplyStageResult(
            { payload: missingAudioFileSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            'Video Studio - Pre-Production',
            missingAudioFileSpec,
            true,
        );
        expect(afterIncompletePreProd.Status).toBe('Approved');

        const afterFailedPreProd = agent.ApplyStageResult(
            { payload: missingAudioFileSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            'Video Studio - Pre-Production',
            missingAudioFileSpec,
            false,
        );
        expect(afterFailedPreProd.Status).toBe('Approved');

        const afterSuccessfulPreProd = agent.ApplyStageResult(
            { payload: narratedSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            'Video Studio - Pre-Production',
            narratedSpec,
            true,
        );
        expect(afterSuccessfulPreProd.Status).toBe('PreProduced');

        const motionStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Motion Engineer',
                message: 'Compose narrated film',
                terminateAfter: false,
            },
        };
        const allowedNarratedMotion = await agent.validateSubAgentNextStep(
            { payload: afterSuccessfulPreProd } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            motionStep,
            afterSuccessfulPreProd,
            dummyRun,
            dummyStep,
        );
        expect(allowedNarratedMotion.step).toBe('Sub-Agent');
    });

    it('(8) refuses a 3rd Motion Engineer repair round when MaxRepairRounds is 2 (with errorMessage) and populates HumanReviewNotes on final delivery', async () => {
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
                        Severity: 'Major',
                        Evidence: 'd1',
                        Fix: 'f1',
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
                        Severity: 'Major',
                        Evidence: 'd2',
                        Fix: 'f2',
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
                        Severity: 'Major',
                        Evidence: 'Remaining minor overflow on 9:16',
                        Fix: 'Adjust card padding',
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
        expect(refusedRepair.errorMessage).toContain('G5 (Repair)');

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

    it('(9) refuses forged Passed gates without Output (naming G4 with errorMessage), refuses G6 failure, enforces SPEC-2b before Render (including Produce Video action payload shape without MaxRepairRounds), injects templateParameters for Director/Art Director/Storyboard, and sets Status = Delivered when G1..G6 pass', async () => {
        const agent = createAgent();

        // Acceptance item 2: Forged Passed gates with no Output is still a Retry naming G4 with errorMessage
        const forgedSpec = CreateDeliveredSpecFixture();
        forgedSpec.Review.Gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((g) => ({
            Gate: g as 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6',
            Status: 'Passed',
            Notes: 'Approved',
            EvidenceRefs: ['forged'],
            Timestamp: '2026-10-17T00:02:00.000Z',
        }));
        delete forgedSpec.Output;
        const forgedParams = { payload: forgedSpec } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(forgedParams, dummyConfig);
        const refusedForged = await agent.validateSuccessNextStep(
            forgedParams,
            { step: 'Success', terminate: true, newPayload: forgedSpec },
            forgedSpec,
            dummyRun,
            dummyStep,
        );
        expect(refusedForged.step).toBe('Retry');
        expect(refusedForged.retryInstructions).toContain('gate G4');
        expect(refusedForged.errorMessage).toContain('gate G4');

        // G6 failure (missing PosterFileID) returns Retry naming G6 with errorMessage
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
        expect(rejectedSuccess.errorMessage).toContain('G6');
        expect(rejectedSuccess.newPayload?.Status).not.toBe('Delivered');

        // SPEC-2b pre-Render check: when ValidateVideoGenerationSpecAsync fails (e.g., ArchetypeNotFound),
        // Render is refused with a Retry + errorMessage naming G3 (Stills)
        const renderSpec = CreateDeliveredSpecFixture();
        delete renderSpec.BrandKitID;
        renderSpec.DataBindings = [];
        delete renderSpec.DataSnapshot;
        renderSpec.Assets.Generate = [];
        renderSpec.Assets.Approved = [];
        renderSpec.Assets.Required = [];
        for (const line of renderSpec.Audio.Narration!.Script) {
            line.Text = 'Momentum continues across every segment.';
        }
        renderSpec.Deliverables.Captions = false;
        for (const beat of renderSpec.Beats) {
            beat.DataRefs = [];
            beat.AssetRefs = [];
            beat.OnScreenText = ['Headline'];
        }
        renderSpec.Film.OneSentence = 'Q3 revenue momentum reached record highs.';
        renderSpec.Review.Rounds = [];
        delete renderSpec.Output!.Videos;
        delete renderSpec.Output!.PosterFileID;
        delete renderSpec.Output!.CaptionsFileID;
        delete renderSpec.Output!.ContactSheetFileIDs;

        // Round 3 Fix 1: Produce Video action's exact payload shape (Interaction: { Mode: 'Autonomous' } with no MaxRepairRounds)
        // seeded via executeAgentInternal and passed to validateSubAgentNextStep for Render reaches Sub-Agent (not Retry with InvalidMaxRepairRounds)
        const actionPayloadSpec = JSON.parse(JSON.stringify(renderSpec)) as VideoGenerationSpec;
        actionPayloadSpec.Archetype = { Name: 'product-launch' };
        actionPayloadSpec.Interaction = { Mode: 'Autonomous' } as VideoGenerationSpec['Interaction'];
        let actionSeeded: Partial<VideoGenerationSpec> | undefined;
        const actionRenderParams = {
            payload: actionPayloadSpec,
            __onExecuteAgentInternal: (sp: ExecuteAgentParams<Partial<VideoGenerationSpec>>) => {
                actionSeeded = sp.payload;
            },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(actionRenderParams, dummyConfig);
        expect(actionSeeded?.Interaction).toEqual({ Mode: 'Autonomous', MaxRepairRounds: 2 });

        const renderStep: BaseAgentNextStep<Partial<VideoGenerationSpec>> = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: {
                name: 'Video Studio - Render',
                message: 'Render formats',
                terminateAfter: false,
            },
        };
        const allowedActionRender = await agent.validateSubAgentNextStep(
            actionRenderParams,
            renderStep,
            actionPayloadSpec,
            dummyRun,
            dummyStep,
        );
        expect(allowedActionRender.step).toBe('Sub-Agent');

        for (const line of renderSpec.Audio.Narration!.Script) {
            delete line.AudioFileID;
        }
        mockVideoStudioEngineInstance.GetArchetypeByName.mockReturnValue(null);
        const renderParamsWithUser = {
            payload: renderSpec,
            contextUser: { ID: 'user-1' },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await agent.executeAgentInternal(renderParamsWithUser, dummyConfig);
        const refusedRender = await agent.validateSubAgentNextStep(
            renderParamsWithUser,
            renderStep,
            renderSpec,
            dummyRun,
            dummyStep,
        );
        expect(refusedRender.step).toBe('Retry');
        expect(refusedRender.retryInstructions).toContain('G3 (Stills)');
        expect(refusedRender.retryInstructions).toContain('ArchetypeNotFound');
        expect(refusedRender.errorMessage).toContain('ArchetypeNotFound');

        // Acceptance item 8: Verify templateParameters injection on Director, Art Director, and Storyboard
        const kit = {
            ID: '10101010-2020-4030-8040-505050505050',
            Name: 'Acme Kit',
            CompanyID: incompleteSpec.CompanyID,
            StyleObject: { primaryColor: '#0B1020' },
            VoiceObject: { VoiceID: 'voice-acme-default', Provider: 'ElevenLabs' },
            GenerationPolicyObject: { allowVideo: true },
        };
        incompleteSpec.BrandKitID = kit.ID;
        mockBrandKitEngineInstance.BrandKits = [kit];
        mockBrandKitEngineInstance.GetDefaultKit.mockReturnValue(kit);
        mockVideoStudioEngineInstance.GetArchetypesForCompany.mockReturnValue([
            {
                Name: 'KPI Briefing',
                Status: 'Active',
                Category: 'Marketing',
                MinDurationSeconds: 15,
                MaxDurationSeconds: 60,
                Description: 'Product launch film',
            },
        ]);
        mockVideoStudioEngineInstance.GetArchetypeByName.mockReturnValue({
            Name: 'KPI Briefing',
            Status: 'Active',
            BeatTemplateObject: [{ role: 'Hook', seconds: 4 }],
            PacingObject: { wordsPerMinute: 140 },
            Guidance: 'Open with the primary metric.',
        });

        await agent.executeAgentInternal(incompleteParams, dummyConfig);

        const validatedDirector = await agent.validateSubAgentNextStep(
            incompleteParams,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Director', message: 'Build brief', terminateAfter: false },
            },
            incompleteSpec,
            dummyRun,
            dummyStep,
        );
        expect(validatedDirector.subAgent?.templateParameters?.archetypeCatalog).toContain('KPI Briefing');
        expect(validatedDirector.subAgent?.templateParameters?.archetypeCatalog).toContain('15s–60s');

        const validatedArtDirector = await agent.validateSubAgentNextStep(
            incompleteParams,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Art Director', message: 'Style brief', terminateAfter: false },
            },
            incompleteSpec,
            dummyRun,
            dummyStep,
        );
        expect(validatedArtDirector.subAgent?.templateParameters?.brandKitStyle).toContain('#0B1020');

        const validatedStoryboard = await agent.validateSubAgentNextStep(
            incompleteParams,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Storyboard', message: 'Plan beats', terminateAfter: false },
            },
            incompleteSpec,
            dummyRun,
            dummyStep,
        );
        expect(validatedStoryboard.subAgent?.templateParameters?.archetypeGuidance).toContain(
            'Open with the primary metric.',
        );

        // Acceptance item 3: Full spec passes G1..G6 and sets Status = 'Delivered'
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

    it('(11) VS-ART-2: delivery pushes one System Only FileOutputRef per stored format (without fileData), deduplicates on repeat validateSuccessNextStep, skips inline formats, never sets promoteMediaOutputs/mediaOutputs, and sets artifactDirective (create-new <= 120 chars when started without brief, version-source when started with brief)', async () => {
        // Case A: Started without a brief (fresh run, empty payload)
        const freshAgent = createAgent();
        const freshInitParams = {
            payload: {},
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await freshAgent.executeAgentInternal(freshInitParams, dummyConfig);

        const deliveredSpec = CreateDeliveredSpecFixture();
        deliveredSpec.Film.Formats = ['16:9', '9:16'];
        deliveredSpec.Deliverables.Formats = ['16:9', '9:16'];
        deliveredSpec.Archetype = { Name: 'Product Launch Reel' };
        deliveredSpec.Film.OneSentence =
            'A very detailed one-sentence summary that exceeds one hundred and twenty characters when combined with the archetype prefix so truncation is verified.';
        deliveredSpec.Film.Purpose = 'Show key product highlights to enterprise buyers.';
        deliveredSpec.Output!.ContactSheetFileIDs = {
            '16:9': ['66666666-6666-4666-8666-666666666661'],
            '9:16': ['66666666-6666-4666-8666-666666666662'],
        };
        deliveredSpec.Output!.Videos = {
            '16:9': {
                Format: '16:9',
                FileID: '77777777-7777-4777-8777-777777777771',
                MimeType: 'video/mp4',
                Width: 1920,
                Height: 1080,
                DurationSeconds: 18,
                FileSizeBytes: 8_420_000,
            },
            '9:16': {
                Format: '9:16',
                InlineBase64: Buffer.from('inline-mp4').toString('base64'),
                MimeType: 'video/mp4',
                Width: 1080,
                Height: 1920,
                DurationSeconds: 18,
                FileSizeBytes: 1_200_000,
            },
        };
        deliveredSpec.Output!.RenderMetadata.DurationByFormat = { '16:9': 18, '9:16': 18 };

        const firstDelivered = await freshAgent.validateSuccessNextStep(
            freshInitParams,
            { step: 'Success', terminate: true, newPayload: deliveredSpec },
            deliveredSpec,
            dummyRun,
            dummyStep,
        );
        expect(firstDelivered.step).toBe('Success');
        expect(firstDelivered.newPayload?.Status).toBe('Delivered');
        expect(firstDelivered.newPayload?.Review?.HumanReviewNotes).toContain('Storage');
        expect(firstDelivered.newPayload?.Review?.HumanReviewNotes).toContain('9:16 (1.1 MB)');
        expect((firstDelivered as Record<string, unknown>).promoteMediaOutputs).toBeUndefined();
        expect((firstDelivered as Record<string, unknown>).mediaOutputs).toBeUndefined();

        expect(firstDelivered.artifactDirective).toBeDefined();
        expect(firstDelivered.artifactDirective?.behavior).toBe('create-new');
        expect(firstDelivered.artifactDirective?.name?.length).toBe(120);
        expect(firstDelivered.artifactDirective?.name?.startsWith('Product Launch Reel: ')).toBe(true);
        expect(firstDelivered.artifactDirective?.description).toBe(
            'Show key product highlights to enterprise buyers.',
        );

        // Calling validateSuccessNextStep a second time must not duplicate FileOutputs
        await freshAgent.validateSuccessNextStep(
            freshInitParams,
            { step: 'Success', terminate: true, newPayload: deliveredSpec },
            deliveredSpec,
            dummyRun,
            dummyStep,
        );

        const fileOutputs = (freshAgent as unknown as { FileOutputs: Array<Record<string, unknown>> }).FileOutputs;
        expect(fileOutputs).toHaveLength(1);
        expect(fileOutputs[0]).toEqual({
            fileName: 'video-16x9.mp4',
            mimeType: 'video/mp4',
            fileId: '77777777-7777-4777-8777-777777777771',
            sizeBytes: 8_420_000,
            visibility: 'System Only',
        });
        expect(fileOutputs[0]).not.toHaveProperty('fileData');

        // Case B: Started with a brief (Film.OneSentence already present) -> version-source
        const resumeAgent = createAgent();
        const resumeSpec = CreateDeliveredSpecFixture();
        const resumeParams = {
            payload: resumeSpec,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;
        await resumeAgent.executeAgentInternal(resumeParams, dummyConfig);

        const resumedDelivered = await resumeAgent.validateSuccessNextStep(
            resumeParams,
            { step: 'Success', terminate: true, newPayload: resumeSpec },
            resumeSpec,
            dummyRun,
            dummyStep,
        );
        expect(resumedDelivered.step).toBe('Success');
        expect(resumedDelivered.artifactDirective).toEqual({
            behavior: 'version-source',
        });
    });
});

