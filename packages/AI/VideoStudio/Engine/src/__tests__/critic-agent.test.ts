import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
} from '@memberjunction/ai-core-plus';
import type { ChatMessageContentBlock } from '@memberjunction/ai';
import type {
    DefectSeverity,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

const {
    mockReadStoredFile,
    mockLoadDataSnapshotValues,
    mockRubricConfig,
    mockGetAgentRubrics,
    mockGetLatestPublishedVersion,
    mockPrompts,
    mockGetConfigurationParamsWithInheritance,
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
    mockGetConfigurationParamsWithInheritance: vi.fn(() => []),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class MockBaseAgent {
        protected AgentRun: { ErrorMessage?: string } | null = {};
        protected ProviderToUse: unknown = undefined;
        protected formatHierarchicalMessage(msg: string): string {
            return msg;
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
            GetConfigurationParamsWithInheritance: mockGetConfigurationParamsWithInheritance,
        },
    },
}));

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

import {
    MISSING_CRITIC_RUBRIC_ERROR_MESSAGE,
    VideoStudioCriticAgent,
    type CriticPromptOutput,
} from '../agents/critic-agent.js';
import { VideoStudioAgent } from '../agents/video-studio-agent.js';
import { CreateDeliveredSpecFixture } from './fixtures/delivered-spec.fixture.js';

const RUBRIC_ID = 'rubric-vpq-001';

function buildPublishedRubric() {
    return {
        rubricId: RUBRIC_ID,
        rubricName: 'Video Production Quality',
        versionId: 'ver-1',
        versionNumber: 1,
        status: 'Published',
        scoringMode: 'Weighted',
        passThresholdScore: 75,
        nodes: [
            {
                id: 'group-1',
                key: 'visual-craft',
                name: 'Visual Craft',
                description: 'Visual hierarchy',
                guidance: '',
                nodeType: 'Group',
                sequence: 1,
                weight: 50,
                isGate: false,
            },
            {
                id: 'crit-1',
                parentId: 'group-1',
                key: 'text-legibility',
                name: 'Text Legibility',
                description: 'Text is legible in all frames.',
                guidance: 'Check contrast and overflow.',
                nodeType: 'Criterion',
                sequence: 1,
                weight: 50,
                isGate: false,
            },
            {
                id: 'crit-2',
                parentId: 'group-1',
                key: 'generated-assets-are-honest-and-disclosed',
                name: 'Generated Assets Are Honest and Disclosed',
                description: 'No generated person presented as real; no garbled text.',
                guidance: 'Inspect generated assets.',
                nodeType: 'Criterion',
                sequence: 2,
                weight: 50,
                isGate: true,
            },
        ],
    };
}

class TestableCriticAgent extends VideoStudioCriticAgent {
    public ExecutedPromptCalls: Array<{
        data: Record<string, unknown>;
        messages?: Array<{ role: string; content: string | ChatMessageContentBlock[] }>;
    }> = [];

    private _runnerQueue: Array<{
        success: boolean;
        errorMessage?: string;
        result?: CriticPromptOutput;
    }> = [];

    public EnqueuePromptOutcome(outcome: {
        success: boolean;
        errorMessage?: string;
        result?: CriticPromptOutput;
    }): void {
        this._runnerQueue.push(outcome);
    }

    protected override CreatePromptRunner() {
        return {
            ExecutePrompt: async (promptParams: {
                data?: Record<string, unknown>;
                conversationMessages?: Array<{
                    role: string;
                    content: string | ChatMessageContentBlock[];
                }>;
            }) => {
                this.ExecutedPromptCalls.push({
                    data: (promptParams.data ?? {}) as Record<string, unknown>,
                    messages: promptParams.conversationMessages,
                });
                const next = this._runnerQueue.shift() ?? {
                    success: false,
                    errorMessage: 'No queued prompt outcome',
                };
                return {
                    success: next.success,
                    errorMessage: next.errorMessage,
                    result: next.result,
                    promptRun: { ID: `prun-${this.ExecutedPromptCalls.length}` },
                };
            },
        } as unknown as ReturnType<VideoStudioCriticAgent['CreatePromptRunner']>;
    }

    public async RunForTest<P = Partial<VideoGenerationSpec>>(
        params: ExecuteAgentParams<P>,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        return this.executeAgentInternal<P>(params, {} as AgentConfiguration);
    }
}

describe('VideoStudioCriticAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRubricConfig.mockResolvedValue(undefined);
        mockGetAgentRubrics.mockReturnValue([
            {
                rubricId: RUBRIC_ID,
                purpose: 'Evaluation',
                isDefault: true,
                status: 'Active',
                priority: 1,
            },
        ]);
        mockGetLatestPublishedVersion.mockReturnValue(buildPublishedRubric());
        mockLoadDataSnapshotValues.mockResolvedValue({ arr_total: 12400000 });
        mockReadStoredFile.mockImplementation(async (fileId: string) =>
            Buffer.from(`png-bytes-for-${fileId}`, 'utf8'),
        );
    });

    it('(1) two formats: makes two prompt calls, sends at most 5 image_url blocks with mimeType image/png plus tables, and appends a round with up to 3 sorted, keyed, Open defects per format', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9', '9:16'];
        spec.Review.Rounds = [];
        spec.Output = {
            ...spec.Output!,
            ContactSheetFileIDs: {
                '16:9': ['16x9-g1', '16x9-g2', '16x9-g3', '16x9-g4', '16x9-g5', '16x9-g6', '16x9-strip'],
                '9:16': ['9x16-g1', '9x16-g2', '9x16-strip'],
            },
        };

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: '16:9 has four issues.',
                Defects: [
                    {
                        Timestamp: 1.0,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'Minor',
                        Evidence: 'Minor kerning issue',
                        Fix: 'Adjust tracking',
                    },
                    {
                        Timestamp: 2.0,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'Blocker',
                        Evidence: 'Headline clipped off-frame',
                        Fix: 'Wrap headline',
                    },
                    {
                        Timestamp: 3.0,
                        Beat: 'proof',
                        Criterion: 'text-legibility',
                        Severity: 'Major',
                        Evidence: 'Low contrast label',
                        Fix: 'Use #FFFFFF text',
                    },
                    {
                        Timestamp: 4.0,
                        Beat: 'cta',
                        Criterion: 'text-legibility',
                        Severity: 'Minor',
                        Evidence: 'Fourth defect should be dropped',
                        Fix: 'N/A',
                    },
                ],
                Scores: {
                    OverallScore: 0.5,
                    MaxScore: 1,
                    Passed: false,
                    Criteria: [
                        { Key: 'text-legibility', Level: 'Miss', Score: 0, Passed: false },
                        { Key: 'generated-assets-are-honest-and-disclosed', Level: 'Meets', Score: 1, Passed: true },
                    ],
                },
            },
        });
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: '9:16 looks clean except one minor.',
                Defects: [
                    {
                        Timestamp: 1.5,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'Minor',
                        Evidence: 'Subhead slightly tight',
                        Fix: 'Add 4px top margin',
                    },
                ],
                Scores: {
                    OverallScore: 1,
                    MaxScore: 1,
                    Passed: true,
                    Criteria: [
                        { Key: 'text-legibility', Level: 'Meets', Score: 1, Passed: true },
                        { Key: 'generated-assets-are-honest-and-disclosed', Level: 'Meets', Score: 1, Passed: true },
                    ],
                },
            },
        });

        const params = {
            agent: { ID: 'critic-agent-id', ParentID: 'root-studio-id' },
            payload: spec,
            contextUser: { ID: 'user-1' },
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        const { finalStep } = await agent.RunForTest(params);

        expect(finalStep.step).toBe('Success');
        expect(agent.ExecutedPromptCalls).toHaveLength(2);

        // First call: 16:9 had 6 grids + 1 strip -> picked 4 grids + strip = 5 image_url blocks
        const firstCall = agent.ExecutedPromptCalls[0];
        expect(firstCall.data.format).toBe('16:9');
        expect(firstCall.data.round).toBe(1);
        expect(firstCall.data.beatsTable).toContain('beat-1');
        expect(firstCall.data.timelineTable).toContain('Narration');
        expect(firstCall.data.boundValues).toBeDefined();
        expect(firstCall.data.rubricCriteria).toContain('generated-assets-are-honest-and-disclosed');

        const firstBlocks = firstCall.messages?.[0]?.content as ChatMessageContentBlock[];
        const firstImages = firstBlocks.filter((b) => b.type === 'image_url');
        expect(firstImages).toHaveLength(5);
        for (const img of firstImages) {
            expect(img.mimeType).toBe('image/png');
            expect(img.content.startsWith('data:image/png;base64,')).toBe(true);
        }

        // Second call: 9:16 had 2 grids + 1 strip -> 3 image_url blocks
        const secondBlocks = agent.ExecutedPromptCalls[1].messages?.[0]?.content as ChatMessageContentBlock[];
        const secondImages = secondBlocks.filter((b) => b.type === 'image_url');
        expect(secondImages).toHaveLength(3);

        const rounds = finalStep.newPayload?.Review?.Rounds ?? [];
        expect(rounds).toHaveLength(1);
        const r1 = rounds[0];
        expect(r1.Round).toBe(1);
        // 3 defects from 16:9 (sorted Blocker, Major, Minor) + 1 from 9:16 = 4 total
        expect(r1.Defects).toHaveLength(4);
        expect(r1.Defects.slice(0, 3).map((d) => d.Severity)).toEqual(['Blocker', 'Major', 'Minor']);
        expect(r1.Defects.slice(0, 3).map((d) => d.Key)).toEqual([
            'r1-16:9-1',
            'r1-16:9-2',
            'r1-16:9-3',
        ]);
        expect(r1.Defects[3].Key).toBe('r1-9:16-1');
        expect(r1.Defects.every((d) => d.Status === 'Open')).toBe(true);

        // Scores: worst per criterion across formats via RubricScoring.Compute
        const scores = finalStep.newPayload?.Review?.Scores;
        expect(scores?.RubricID).toBe(RUBRIC_ID);
        expect(scores?.OverallScore).toBe(0.5);
        expect(scores?.MaxScore).toBe(1);
        expect(scores?.Passed).toBe(false);
        const legibility = scores?.Criteria.find((c) => c.Criterion === 'text-legibility');
        expect(legibility?.Score).toBe(0);
        expect(legibility?.Passed).toBe(false);
    });

    it('(2) an earlier defect not re-reported becomes Fixed; a re-reported one stays Open', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        spec.Review.Rounds = [
            {
                Round: 1,
                Timestamp: '2026-10-16T00:00:00.000Z',
                Summary: 'Round 1',
                Defects: [
                    {
                        Key: 'r1-16:9-1',
                        Format: '16:9',
                        Timestamp: 1.0,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'Major',
                        Evidence: 'Headline clipped',
                        Fix: 'Fix headline',
                        Status: 'Open',
                    },
                    {
                        Key: 'r1-16:9-2',
                        Format: '16:9',
                        Timestamp: 3.0,
                        Beat: 'proof',
                        Criterion: 'text-legibility',
                        Severity: 'Major',
                        Evidence: 'Chart label overlap',
                        Fix: 'Move label',
                        Status: 'Open',
                    },
                ],
            },
        ];

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Round 2 re-reports proof beat only',
                Defects: [
                    {
                        Timestamp: 3.2,
                        Beat: 'proof',
                        Criterion: 'text-legibility',
                        Severity: 'Major',
                        Evidence: 'Chart label still overlaps slightly',
                        Fix: 'Increase padding',
                    },
                ],
                Scores: { OverallScore: 0.5, MaxScore: 1, Passed: false, Criteria: [] },
            },
        });

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        const rounds = finalStep.newPayload?.Review?.Rounds ?? [];
        expect(rounds).toHaveLength(2);
        expect(rounds[0].Defects[0].Status).toBe('Fixed');
        expect(rounds[0].Defects[1].Status).toBe('Open');
        expect(rounds[1].Defects[0].Status).toBe('Open');
    });

    it('(3) an unknown AssetKey is dropped, and a known one in Assets.Approved is kept', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        const knownKey = spec.Assets.Approved[0].Key;
        spec.Review.Rounds = [];

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Asset check',
                Defects: [
                    {
                        Timestamp: 1.0,
                        Beat: 'hook',
                        Criterion: 'generated-assets-are-honest-and-disclosed',
                        Severity: 'Blocker',
                        Evidence: 'Garbled text in generated clip',
                        Fix: 'Regenerate asset',
                        AssetKey: knownKey,
                    },
                    {
                        Timestamp: 2.0,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'Minor',
                        Evidence: 'Unknown asset ref',
                        Fix: 'Fix it',
                        AssetKey: 'non_existent_asset_key_999',
                    },
                ],
                Scores: { OverallScore: 0.5, MaxScore: 1, Passed: false, Criteria: [] },
            },
        });

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        const defects = finalStep.newPayload?.Review?.Rounds?.[0]?.Defects ?? [];
        expect(defects).toHaveLength(2);
        expect(defects[0].AssetKey).toBe(knownKey);
        expect(defects[1].AssetKey).toBeUndefined();
    });

    it('(4) no rubric linked or not published: returns Failed and makes no prompt call', async () => {
        mockGetAgentRubrics.mockReturnValue([]);
        const spec = CreateDeliveredSpecFixture();
        const agent = new TestableCriticAgent();

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(finalStep.step).toBe('Failed');
        expect(finalStep.errorMessage).toBe(MISSING_CRITIC_RUBRIC_ERROR_MESSAGE);
        expect(agent.ExecutedPromptCalls).toHaveLength(0);
    });

    it('(5) a failed prompt call: returns Failed and appends no round', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9', '9:16'];
        spec.Review.Rounds = [];

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: false,
            errorMessage: 'Rate limit exceeded on vision model',
        });

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(finalStep.step).toBe('Failed');
        expect(finalStep.errorMessage).toContain('Rate limit exceeded');
        expect(finalStep.newPayload?.Review?.Rounds ?? []).toHaveLength(0);
    });

    it('(6) newPayload touches only Review.Rounds and Review.Scores (Gates and Status are untouched)', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        spec.Status = 'RoughCut';
        const originalGates = structuredClone(spec.Review.Gates);
        const originalBeats = structuredClone(spec.Beats);

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Clean pass',
                Defects: [],
                Scores: {
                    OverallScore: 1,
                    MaxScore: 1,
                    Passed: true,
                    Criteria: [
                        { Key: 'text-legibility', Level: 'Meets' },
                        { Key: 'generated-assets-are-honest-and-disclosed', Level: 'Meets' },
                    ],
                },
            },
        });

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(finalStep.step).toBe('Success');
        expect(finalStep.newPayload?.Status).toBe('RoughCut');
        expect(finalStep.newPayload?.Review?.Gates).toEqual(originalGates);
        expect(finalStep.newPayload?.Beats).toEqual(originalBeats);
        expect(finalStep.newPayload?.Review?.Rounds).toHaveLength(2);
        expect(finalStep.newPayload?.Review?.Scores?.OverallScore).toBe(1);
    });

    it('(7) resolves maxRounds from ResolveVideoStudioSettings(configId).MaxRepairRounds + 1 regardless of payload Interaction.MaxRepairRounds', async () => {
        mockGetConfigurationParamsWithInheritance.mockReturnValue([
            { Name: 'VideoStudio.MaxRepairRounds', Value: '3', Type: 'number' },
        ]);

        const specWithOverride = CreateDeliveredSpecFixture();
        specWithOverride.Deliverables.Formats = ['16:9'];
        specWithOverride.Interaction = { Mode: 'Autonomous', MaxRepairRounds: 9 };

        const agent1 = new TestableCriticAgent();
        agent1.EnqueuePromptOutcome({
            success: true,
            result: { Summary: 'Pass', Defects: [] },
        });
        await agent1.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: specWithOverride,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(agent1.ExecutedPromptCalls[0].data.maxRounds).toBe(4);

        const specWithoutInteraction = CreateDeliveredSpecFixture();
        specWithoutInteraction.Deliverables.Formats = ['16:9'];
        delete specWithoutInteraction.Interaction;

        const agent2 = new TestableCriticAgent();
        agent2.EnqueuePromptOutcome({
            success: true,
            result: { Summary: 'Pass', Defects: [] },
        });
        await agent2.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: specWithoutInteraction,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(agent2.ExecutedPromptCalls[0].data.maxRounds).toBe(4);
    });

    it('(8) normalizes severity case-insensitively and maps unknown severities to Major so G5 fails on ApplyStageResult', async () => {
        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        spec.Review.Rounds = [];

        const agent = new TestableCriticAgent();
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Casing and unknown severity check',
                Defects: [
                    {
                        Timestamp: 1.0,
                        Beat: 'hook',
                        Criterion: 'text-legibility',
                        Severity: 'blocker' as DefectSeverity,
                        Evidence: 'Lowercase blocker',
                        Fix: 'Fix blocker',
                    },
                    {
                        Timestamp: 2.0,
                        Beat: 'proof',
                        Criterion: 'text-legibility',
                        Severity: 'Critical' as DefectSeverity,
                        Evidence: 'Unrecognized severity',
                        Fix: 'Fix critical',
                    },
                ],
            },
        });

        const params = {
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>;

        const { finalStep } = await agent.RunForTest(params);
        const defects = finalStep.newPayload?.Review?.Rounds?.[0]?.Defects ?? [];
        expect(defects).toHaveLength(2);
        expect(defects[0].Severity).toBe('Blocker');
        expect(defects[1].Severity).toBe('Major');

        // Verify that a single 'Critical' -> 'Major' defect causes G5 to fail in VideoStudioAgent.ApplyStageResult
        class StageApplier extends VideoStudioAgent {
            public Apply(p: ExecuteAgentParams, s: Partial<VideoGenerationSpec>): Partial<VideoGenerationSpec> {
                return this.ApplyStageResult(p, 'Video Studio - Critic', s, true);
            }
        }
        const singleCriticalSpec = CreateDeliveredSpecFixture();
        singleCriticalSpec.Deliverables.Formats = ['16:9'];
        singleCriticalSpec.Review.Rounds = [];

        const agentCriticalOnly = new TestableCriticAgent();
        agentCriticalOnly.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Critical only',
                Defects: [
                    {
                        Timestamp: 2.0,
                        Beat: 'proof',
                        Criterion: 'text-legibility',
                        Severity: 'Critical' as DefectSeverity,
                        Evidence: 'Critical issue',
                        Fix: 'Fix critical issue',
                    },
                ],
            },
        });
        const { finalStep: critStep } = await agentCriticalOnly.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: singleCriticalSpec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        const applied = new StageApplier().Apply(params, critStep.newPayload!);
        const g5 = applied.Review?.Gates.find((g) => g.Gate === 'G5');
        expect(g5?.Status).toBe('Failed');
    });

    it('(9) computes scores via RubricScoring.Compute so a failed gate or omitted Scores produces Passed: false', async () => {
        mockGetLatestPublishedVersion.mockReturnValue({
            rubricId: RUBRIC_ID,
            rubricName: 'Video Production Quality',
            versionId: 'ver-1',
            versionNumber: 1,
            status: 'Published',
            scoringMode: 'Weighted',
            passThresholdScore: 0.7,
            nodes: [
                {
                    id: 'crit-1',
                    key: 'text-legibility',
                    name: 'Text Legibility',
                    description: 'Text is legible.',
                    guidance: '',
                    nodeType: 'Criterion',
                    sequence: 1,
                    weight: 50,
                    isGate: false,
                },
                {
                    id: 'crit-2',
                    key: 'generated-assets-are-honest-and-disclosed',
                    name: 'Generated Assets Are Honest and Disclosed',
                    description: 'Assets are honest.',
                    guidance: '',
                    nodeType: 'Criterion',
                    sequence: 2,
                    weight: 50,
                    isGate: true,
                    gateMinimumScore: 0.6,
                },
            ],
        });

        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        spec.Review.Rounds = [];

        const agent = new TestableCriticAgent();
        // Normal criterion at Meets (1.0) and gate criterion at Partial (0.5 < 0.6 gateMinimumScore):
        // weighted mean is 0.75 (>= 0.7 passThreshold), but gate fails so Passed must be false!
        agent.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Gate failed despite weighted score above threshold',
                Defects: [],
                Scores: {
                    Criteria: [
                        { Key: 'text-legibility', Level: 'Meets' },
                        { Key: 'generated-assets-are-honest-and-disclosed', Level: 'Partial' },
                    ],
                },
            },
        });

        const { finalStep } = await agent.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(finalStep.newPayload?.Review?.Scores?.OverallScore).toBe(0.75);
        expect(finalStep.newPayload?.Review?.Scores?.Passed).toBe(false);

        // Also verify that when Scores is omitted by the prompt, Passed is false
        const agentNoScores = new TestableCriticAgent();
        agentNoScores.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Scores omitted by LLM',
                Defects: [],
            },
        });
        const { finalStep: emptyScoresStep } = await agentNoScores.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(emptyScoresStep.newPayload?.Review?.Scores?.Passed).toBe(false);
    });
});
