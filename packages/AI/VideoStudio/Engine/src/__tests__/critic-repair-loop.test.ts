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
    mockReadStoredFile,
    mockLoadDataSnapshotValues,
    mockRubricConfig,
    mockGetAgentRubrics,
    mockGetLatestPublishedVersion,
    mockPrompts,
    mockGetArchetypesForCompany,
    mockGetArchetypeByName,
    mockGetDefaultKit,
} = vi.hoisted(() => ({
    mockReadStoredFile: vi.fn(),
    mockLoadDataSnapshotValues: vi.fn(),
    mockRubricConfig: vi.fn(),
    mockGetAgentRubrics: vi.fn(),
    mockGetLatestPublishedVersion: vi.fn(),
    mockPrompts: [
        {
            ID: 'prompt-critic-id',
            Name: 'Video Studio - Critic',
        },
    ],
    mockGetArchetypesForCompany: vi.fn(() => []),
    mockGetArchetypeByName: vi.fn(() => null),
    mockGetDefaultKit: vi.fn(() => null),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class MockBaseAgent {
        protected AgentRun: { ErrorMessage?: string; FinalPayloadObject?: unknown } | null = {};
        protected ProviderToUse: unknown = undefined;
        protected _fileOutputs: Array<Record<string, unknown>> = [];
        public get FileOutputs(): Array<Record<string, unknown>> {
            return this._fileOutputs;
        }
        protected get AgentHierarchy(): string[] {
            return [];
        }
        protected formatHierarchicalMessage(msg: string): string {
            return msg;
        }
        protected async executeAgentInternal<P = unknown>(
            params: ExecuteAgentParams<P>,
        ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
            return {
                finalStep: {
                    step: 'Success',
                    terminate: true,
                    newPayload: params.payload,
                },
                stepCount: 1,
            };
        }
        protected async validateNextStep<P>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
        }
        protected async validateSubAgentNextStep<P>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
        }
        protected async validateSuccessNextStep<P>(
            _params: ExecuteAgentParams,
            nextStep: BaseAgentNextStep<P>,
        ): Promise<BaseAgentNextStep<P>> {
            return nextStep;
        }
        protected async createStepEntity(): Promise<{ ID: string; TargetLogID?: string }> {
            return { ID: 'step-1' };
        }
        protected async finalizeStepEntity(): Promise<void> {
            // no-op
        }
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Prompts() {
                return mockPrompts;
            },
            get AgentConfigurations() {
                return [];
            },
        },
    },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        VideoStudioEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                GetArchetypesForCompany: mockGetArchetypesForCompany,
                GetArchetypeByName: mockGetArchetypeByName,
            },
        },
        BrandKitEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                BrandKits: [],
                GetDefaultKit: mockGetDefaultKit,
            },
        },
    };
});

vi.mock('@memberjunction/rubrics-base', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/rubrics-base')>();
    return {
        ...actual,
        RubricEngineBase: {
            Instance: {
                Config: mockRubricConfig,
                GetAgentRubrics: mockGetAgentRubrics,
                GetLatestPublishedVersion: mockGetLatestPublishedVersion,
            },
        },
    };
});

vi.mock('../storage.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../storage.js')>();
    return {
        ...actual,
        ReadStoredFile: mockReadStoredFile,
    };
});

vi.mock('../data/data-snapshot.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../data/data-snapshot.js')>();
    return {
        ...actual,
        LoadDataSnapshotValues: mockLoadDataSnapshotValues,
    };
});

import { VideoStudioCriticAgent, type CriticPromptOutput } from '../agents/critic-agent.js';
import { VideoStudioAgent } from '../agents/video-studio-agent.js';
import { CreateDeliveredSpecFixture } from './fixtures/delivered-spec.fixture.js';

class ScriptedCriticAgent extends VideoStudioCriticAgent {
    private _queue: CriticPromptOutput[] = [];

    public Enqueue(output: CriticPromptOutput): void {
        this._queue.push(output);
    }

    protected override CreatePromptRunner() {
        return {
            ExecutePrompt: async () => {
                const next = this._queue.shift();
                return {
                    success: Boolean(next),
                    result: next,
                    promptRun: { ID: 'prun-loop' },
                };
            },
        } as unknown as ReturnType<VideoStudioCriticAgent['CreatePromptRunner']>;
    }

    public async RunCritic(
        payload: Partial<VideoGenerationSpec>,
    ): Promise<Partial<VideoGenerationSpec>> {
        const { finalStep } = await this.executeAgentInternal<Partial<VideoGenerationSpec>>(
            {
                agent: { ID: 'critic-id', ParentID: 'root-id' },
                payload,
            } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>,
            {} as AgentConfiguration,
        );
        expect(finalStep.step).toBe('Success');
        return finalStep.newPayload!;
    }
}

class ExposedVideoStudioAgent extends VideoStudioAgent {
    public async InitRoot(params: ExecuteAgentParams<Partial<VideoGenerationSpec>>): Promise<void> {
        await this.executeAgentInternal(params, {} as AgentConfiguration);
    }

    public ApplyStage(
        params: ExecuteAgentParams,
        stageName: string,
        payload: Partial<VideoGenerationSpec>,
    ): Partial<VideoGenerationSpec> {
        return this.ApplyStageResult(params, stageName, payload, true);
    }

    public async ValidateSubAgent(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<Partial<VideoGenerationSpec>>,
        payload: Partial<VideoGenerationSpec>,
    ): Promise<BaseAgentNextStep<Partial<VideoGenerationSpec>>> {
        return this.validateSubAgentNextStep(
            params,
            nextStep,
            payload,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );
    }

    public async ValidateSuccess(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<Partial<VideoGenerationSpec>>,
        payload: Partial<VideoGenerationSpec>,
    ): Promise<BaseAgentNextStep<Partial<VideoGenerationSpec>>> {
        return this.validateSuccessNextStep(
            params,
            nextStep,
            payload,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );
    }
}

describe('Critic bounded repair loop (MaxRepairRounds = 2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRubricConfig.mockResolvedValue(undefined);
        mockGetAgentRubrics.mockReturnValue([
            {
                rubricId: 'rubric-vpq-001',
                purpose: 'Evaluation',
                isDefault: true,
                status: 'Active',
                priority: 1,
            },
        ]);
        mockGetLatestPublishedVersion.mockReturnValue({
            rubricId: 'rubric-vpq-001',
            rubricName: 'Video Production Quality',
            versionId: 'ver-1',
            versionNumber: 1,
            status: 'Published',
            nodes: [
                {
                    id: 'crit-1',
                    key: 'text-legibility-and-contrast',
                    name: 'Text Legibility and Contrast',
                    description: 'All text is legible.',
                    guidance: 'Check margins and contrast.',
                    nodeType: 'Criterion',
                    sequence: 1,
                    weight: 100,
                    isGate: false,
                },
            ],
        });
        mockLoadDataSnapshotValues.mockResolvedValue({});
        mockReadStoredFile.mockResolvedValue(Buffer.from('fake-png', 'utf8'));
    });

    it('drives two repair rounds and then delivers with deferred defect notes once MaxRepairRounds = 2 is exhausted', async () => {
        const baseSpec = CreateDeliveredSpecFixture();
        baseSpec.Deliverables.Formats = ['16:9'];
        baseSpec.Interaction = { Mode: 'Autonomous', MaxRepairRounds: 2 };
        baseSpec.Review = {
            Gates: [{ Gate: 'G3', Status: 'Passed', EvidenceRefs: ['cs-1'], Timestamp: '2026-10-17T00:01:00.000Z' }],
            Rounds: [],
        };
        baseSpec.Output!.RenderMetadata.RenderedAt = '2026-10-17T00:01:00.000Z';

        const rootAgent = new ExposedVideoStudioAgent();
        const criticAgent = new ScriptedCriticAgent();
        const params = {
            agent: { ID: 'root-id', Name: 'Video Studio' },
            payload: baseSpec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        await rootAgent.InitRoot(params);

        // --- Round 1: returns 2 Major defects ---
        criticAgent.Enqueue({
            Summary: 'Round 1 found 2 major layout defects.',
            Defects: [
                {
                    Timestamp: 1.2,
                    Beat: 'hook',
                    Criterion: 'text-legibility-and-contrast',
                    Severity: 'Major',
                    Evidence: 'Headline overflows right safe zone',
                    Fix: 'Clamp headline max-width to 80%',
                },
                {
                    Timestamp: 5.4,
                    Beat: 'proof',
                    Criterion: 'text-legibility-and-contrast',
                    Severity: 'Major',
                    Evidence: 'Subtitle overlaps bar chart axis',
                    Fix: 'Shift subtitle up by 24px',
                },
            ],
            Scores: { OverallScore: 65, MaxScore: 100, Passed: false, Criteria: [] },
        });

        let spec = await criticAgent.RunCritic(baseSpec);
        spec = rootAgent.ApplyStage(params, 'Video Studio - Critic', spec);

        // G5 fails on round 1 (2 open Major defects, 0 repairs used < MaxRepairRounds 2)
        const g5AfterR1 = spec.Review?.Gates.find((g) => g.Gate === 'G5');
        expect(g5AfterR1?.Status).toBe('Failed');

        // Motion Engineer is allowed (repair 1) and receives repairBrief naming both defects
        const repair1Decision = await rootAgent.ValidateSubAgent(
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Motion Engineer', message: 'Repair round 1', terminateAfter: false },
            },
            spec,
        );
        expect(repair1Decision.step).toBe('Sub-Agent');
        const repairBrief1 = repair1Decision.subAgent?.templateParameters?.repairBrief ?? '';
        expect(repairBrief1).toContain('Headline overflows right safe zone');
        expect(repairBrief1).toContain('Clamp headline max-width to 80%');
        expect(repairBrief1).toContain('Subtitle overlaps bar chart axis');
        expect(repairBrief1).toContain('Shift subtitle up by 24px');
        expect(repairBrief1).toContain(
            'Patch only these sections. Keep every other part of the composition unchanged.',
        );

        // Simulate Motion Engineer + Render for repair 1
        spec = rootAgent.ApplyStage(params, 'Video Studio - Motion Engineer', spec);
        spec.Output = {
            ...CreateDeliveredSpecFixture().Output!,
            RenderMetadata: {
                ...CreateDeliveredSpecFixture().Output!.RenderMetadata,
                RenderedAt: '2026-10-17T00:02:00.000Z',
            },
        };
        spec.Review!.Gates = [
            ...spec.Review!.Gates.filter((g) => g.Gate !== 'G3'),
            { Gate: 'G3', Status: 'Passed', EvidenceRefs: ['cs-1'], Timestamp: '2026-10-17T00:02:00.000Z' },
        ];
        spec = rootAgent.ApplyStage(params, 'Video Studio - Render', spec);

        // --- Round 2: returns 1 new Major defect; earlier two become Fixed ---
        criticAgent.Enqueue({
            Summary: 'Round 2 found 1 new major defect on cta beat.',
            Defects: [
                {
                    Timestamp: 9.0,
                    Beat: 'cta',
                    Criterion: 'text-legibility-and-contrast',
                    Severity: 'Major',
                    Evidence: 'CTA button label contrast is 2.8:1',
                    Fix: 'Darken button background to #0F172A',
                },
            ],
            Scores: { OverallScore: 74, MaxScore: 100, Passed: false, Criteria: [] },
        });

        spec = await criticAgent.RunCritic(spec);
        spec = rootAgent.ApplyStage(params, 'Video Studio - Critic', spec);

        expect(spec.Review?.Rounds?.[0]?.Defects.every((d) => d.Status === 'Fixed')).toBe(true);
        expect(spec.Review?.Rounds?.[1]?.Defects[0]?.Status).toBe('Open');

        const g5AfterR2 = spec.Review?.Gates.find((g) => g.Gate === 'G5');
        expect(g5AfterR2?.Status).toBe('Failed');

        // Repair 2 is allowed
        const repair2Decision = await rootAgent.ValidateSubAgent(
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Motion Engineer', message: 'Repair round 2', terminateAfter: false },
            },
            spec,
        );
        expect(repair2Decision.step).toBe('Sub-Agent');
        expect(repair2Decision.subAgent?.templateParameters?.repairBrief).toContain(
            'CTA button label contrast is 2.8:1',
        );

        // Simulate Motion Engineer + Render for repair 2
        spec = rootAgent.ApplyStage(params, 'Video Studio - Motion Engineer', spec);
        spec.Output = {
            ...CreateDeliveredSpecFixture().Output!,
            RenderMetadata: {
                ...CreateDeliveredSpecFixture().Output!.RenderMetadata,
                RenderedAt: '2026-10-17T00:03:00.000Z',
            },
        };
        spec.Review!.Gates = [
            ...spec.Review!.Gates.filter((g) => g.Gate !== 'G3'),
            { Gate: 'G3', Status: 'Passed', EvidenceRefs: ['cs-1'], Timestamp: '2026-10-17T00:03:00.000Z' },
        ];
        spec = rootAgent.ApplyStage(params, 'Video Studio - Render', spec);

        // --- Round 3: returns 1 Major defect; G5 passes by exhaustion (Rounds.length - 1 == 2 >= MaxRepairRounds) ---
        criticAgent.Enqueue({
            Summary: 'Round 3 still has 1 major defect.',
            Defects: [
                {
                    Timestamp: 10.5,
                    Beat: 'outro',
                    Criterion: 'text-legibility-and-contrast',
                    Severity: 'Major',
                    Evidence: 'URL badge slightly clipped on mobile preview',
                    Fix: 'Increase bottom margin by 12px',
                },
            ],
            Scores: { OverallScore: 78, MaxScore: 100, Passed: false, Criteria: [] },
        });

        spec = await criticAgent.RunCritic(spec);
        spec = rootAgent.ApplyStage(params, 'Video Studio - Critic', spec);

        const g5AfterR3 = spec.Review?.Gates.find((g) => g.Gate === 'G5');
        expect(g5AfterR3?.Status).toBe('Passed');
        expect(spec.Review?.Rounds?.[2]?.Defects[0]?.Status).toBe('Deferred');
        expect(spec.Review?.HumanReviewNotes).toContain('Deferred defects (1)');
        expect(spec.Review?.HumanReviewNotes).toContain(
            '[Major] 16:9 at 10.5s, beat outro: URL badge slightly clipped on mobile preview. Suggested fix: Increase bottom margin by 12px',
        );

        // A further Motion Engineer call is refused naming G5
        const refusedRepair3 = await rootAgent.ValidateSubAgent(
            params,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { name: 'Video Studio - Motion Engineer', message: 'Attempt repair 3', terminateAfter: false },
            },
            spec,
        );
        expect(refusedRepair3.step).toBe('Retry');
        expect(refusedRepair3.retryInstructions).toContain('G5');
        expect(refusedRepair3.errorMessage).toContain('G5');

        // validateSuccessNextStep returns Success with Status: 'Delivered' and the notes
        const deliveredStep = await rootAgent.ValidateSuccess(
            params,
            {
                step: 'Success',
                terminate: true,
                newPayload: spec,
            },
            spec,
        );
        expect(deliveredStep.step).toBe('Success');
        expect(deliveredStep.newPayload?.Status).toBe('Delivered');
        expect(deliveredStep.newPayload?.Review?.HumanReviewNotes).toContain('Deferred defects (1)');
        expect(deliveredStep.newPayload?.Review?.HumanReviewNotes).toContain(
            'URL badge slightly clipped on mobile preview',
        );
    });
});
