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
    mockGetConfigurationParamsWithInheritance: vi.fn<
        (_id: string) => Array<{ Name: string; Value: string; Type: string }>
    >(() => []),
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
    RubricScoring,
    type CachedPublishedVersion,
    type RubricAnswer,
    type RubricScaleRecord,
} from '@memberjunction/rubrics-base';
import {
    MISSING_CRITIC_RUBRIC_ERROR_MESSAGE,
    VideoStudioCriticAgent,
    type CriticPromptCriterionScore,
    type CriticPromptOutput,
} from '../agents/critic-agent.js';
import { VideoStudioAgent } from '../agents/video-studio-agent.js';
import { CreateDeliveredSpecFixture } from './fixtures/delivered-spec.fixture.js';

const RUBRIC_ID = 'B5AEAEF4-C4E6-45C2-92A1-4CA2BE7EDDE7';
const VERSION_ID = 'F60BC0C3-2D42-484D-AD12-E41DD38EC338';
const MEETS_SCALE_ID = 'C882E907-2C02-49B1-919F-8AFCCCD4709F';
const LEVEL_MISS_ID = 'B555FE53-2E9B-4FB6-A092-0AE8E9557367';
const LEVEL_PARTIAL_ID = 'A9E1A258-D99F-47A4-87EF-646C160D0282';
const LEVEL_MEETS_ID = '42707415-F55B-4658-BDED-E6C63CEBAA5C';

const MEETS_SCALE: RubricScaleRecord = {
    id: MEETS_SCALE_ID,
    name: 'Meets / Partial / Miss',
    scaleType: 'Levels',
    higherIsBetter: true,
    levels: [
        {
            id: LEVEL_MISS_ID,
            label: 'Miss',
            value: 0,
            normalizedValue: 0,
            sequence: 1,
        },
        {
            id: LEVEL_PARTIAL_ID,
            label: 'Partial',
            value: 0.5,
            normalizedValue: 0.5,
            sequence: 2,
        },
        {
            id: LEVEL_MEETS_ID,
            label: 'Meets',
            value: 1,
            normalizedValue: 1,
            sequence: 3,
        },
    ],
};

function buildPublishedRubric(): CachedPublishedVersion {
    return {
        id: VERSION_ID,
        rubricId: RUBRIC_ID,
        majorVersion: 1,
        minorVersion: 0,
        patchVersion: 0,
        instructions: 'Evaluate every rendered deliverable format against the production quality rubric.',
        passThreshold: 0.7,
        minimumCompleteness: null,
        notApplicablePolicy: 'NotAllowed',
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        scales: [MEETS_SCALE],
        bands: [],
        nodes: [
            {
                id: 'group-1',
                parentId: null,
                key: 'visual-craft',
                name: 'Visual Craft',
                description: 'Visual hierarchy',
                guidance: '',
                nodeType: 'Group',
                sequence: 1,
                weight: 1,
                scaleId: null,
                isAdvisory: false,
                isGate: false,
                gateMinimumScore: null,
                evidenceRequired: false,
                rationaleRequired: false,
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
                weight: 1,
                scaleId: MEETS_SCALE_ID,
                isAdvisory: false,
                isGate: false,
                gateMinimumScore: null,
                evidenceRequired: false,
                rationaleRequired: false,
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
                weight: 1,
                scaleId: MEETS_SCALE_ID,
                isAdvisory: false,
                isGate: true,
                gateMinimumScore: 0.6,
                evidenceRequired: false,
                rationaleRequired: false,
                anchors: [
                    {
                        scaleLevelId: LEVEL_MEETS_ID,
                        descriptor: 'Generated assets are purely illustrative, clean of garbled text, and disclosed.',
                    },
                    {
                        scaleLevelId: LEVEL_PARTIAL_ID,
                        descriptor: 'Minor background artifacting on a decorative generated asset.',
                    },
                    {
                        scaleLevelId: LEVEL_MISS_ID,
                        descriptor: 'Generated person presented as real or garbled generated text.',
                    },
                ],
            },
        ],
    };
}

function buildNineCriterionRubric(): CachedPublishedVersion {
    const criterionDefs: Array<{ key: string; name: string; isGate: boolean }> = [
        { key: 'hook-lands-in-the-first-two-seconds', name: 'Hook Lands in the First Two Seconds', isGate: false },
        { key: 'readable-at-phone-size', name: 'Readable at Phone Size', isGate: false },
        { key: 'type-and-color-stay-consistent', name: 'Type and Color Stay Consistent', isGate: false },
        { key: 'motion-has-weight-and-a-clear-focus', name: 'Motion Has Weight and a Clear Focus', isGate: false },
        { key: 'sound-is-in-sync-with-the-picture', name: 'Sound Is in Sync with the Picture', isGate: false },
        { key: 'stays-on-brand', name: 'Stays on Brand', isGate: false },
        { key: 'shown-values-match-the-data-snapshot', name: 'Shown Values Match the Data Snapshot', isGate: true },
        { key: 'final-frame-works-as-a-poster', name: 'Final Frame Works as a Poster', isGate: false },
        { key: 'generated-assets-are-honest-and-disclosed', name: 'Generated Assets Are Honest and Disclosed', isGate: true },
    ];

    return {
        id: VERSION_ID,
        rubricId: RUBRIC_ID,
        majorVersion: 1,
        minorVersion: 0,
        patchVersion: 0,
        instructions: 'Evaluate every rendered deliverable format against the production quality rubric.',
        passThreshold: 0.7,
        minimumCompleteness: null,
        notApplicablePolicy: 'NotAllowed',
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        scales: [MEETS_SCALE],
        bands: [],
        nodes: criterionDefs.map((def, idx) => ({
            id: `crit-node-${idx + 1}`,
            parentId: null,
            key: def.key,
            name: def.name,
            description: `${def.name} description.`,
            guidance: `${def.name} guidance.`,
            nodeType: 'Criterion' as const,
            sequence: idx + 1,
            weight: 1,
            scaleId: MEETS_SCALE_ID,
            isAdvisory: false,
            isGate: def.isGate,
            gateMinimumScore: def.isGate ? 0.6 : null,
            evidenceRequired: false,
            rationaleRequired: false,
        })),
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
                    Criteria: [
                        { Criterion: 'text-legibility', Level: 'Miss' },
                        { Criterion: 'generated-assets-are-honest-and-disclosed', Level: 'Meets' },
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
                    Criteria: [
                        { Criterion: 'text-legibility', Level: 'Meets' },
                        { Criterion: 'generated-assets-are-honest-and-disclosed', Level: 'Meets' },
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
        expect(firstCall.data.rubricCriteria).toContain(
            'Evaluate every rendered deliverable format against the production quality rubric.',
        );
        expect(firstCall.data.rubricCriteria).toContain(
            '- generated-assets-are-honest-and-disclosed [GATE]',
        );
        expect(firstCall.data.rubricCriteria).toContain(
            'Meets: Generated assets are purely illustrative, clean of garbled text, and disclosed.',
        );

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
                Scores: { Criteria: [] },
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
                Scores: { Criteria: [] },
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
                    Criteria: [
                        { Criterion: 'text-legibility', Level: 'Meets' },
                        { Criterion: 'generated-assets-are-honest-and-disclosed', Level: 'Meets' },
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
        mockGetConfigurationParamsWithInheritance.mockImplementation((id: string) =>
            id === 'cfg-high'
                ? [{ Name: 'VideoStudio.MaxRepairRounds', Value: '3', Type: 'number' }]
                : [],
        );

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
            configurationId: 'cfg-high',
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
            configurationId: 'cfg-high',
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

    it('(9) computes scores via RubricScoring.Compute on RUB-1 nine criteria (two gates): (a) gate Miss fails review, (b) two non-gate Partials pass review, (c) numeric Score without Level is unanswered and fails gate', async () => {
        const nineCritRubric = buildNineCriterionRubric();
        mockGetLatestPublishedVersion.mockReturnValue(nineCritRubric);

        const spec = CreateDeliveredSpecFixture();
        spec.Deliverables.Formats = ['16:9'];
        spec.Review.Rounds = [];

        // (a) All Meets except generated-assets-are-honest-and-disclosed at Miss
        const answersA: RubricAnswer[] = nineCritRubric.nodes.map((node) => ({
            criterionId: node.id,
            scaleLevelId:
                node.key === 'generated-assets-are-honest-and-disclosed'
                    ? LEVEL_MISS_ID
                    : LEVEL_MEETS_ID,
            rawValue: node.key === 'generated-assets-are-honest-and-disclosed' ? 0 : 1,
        }));
        const expectedA = RubricScoring.Compute({ version: nineCritRubric, answers: answersA });

        const agentA = new TestableCriticAgent();
        agentA.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Case (a): gate Miss',
                Defects: [],
                Scores: {
                    Criteria: nineCritRubric.nodes.map((node) => ({
                        Criterion: node.key,
                        Level:
                            node.key === 'generated-assets-are-honest-and-disclosed'
                                ? 'Miss'
                                : 'Meets',
                    })),
                },
            },
        });

        const { finalStep: stepA } = await agentA.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(stepA.newPayload?.Review?.Scores?.OverallScore).toBe(expectedA.normalizedScore);
        expect(stepA.newPayload?.Review?.Scores?.OverallScore).toBe(0.888889);
        expect(stepA.newPayload?.Review?.Scores?.Passed).toBe(expectedA.passed);
        expect(stepA.newPayload?.Review?.Scores?.Passed).toBe(false);

        // (b) Two non-gate criteria at Partial and the rest Meets -> review passes (8/9 = 0.888889 >= 0.7)
        const partialKeys = new Set(['readable-at-phone-size', 'stays-on-brand']);
        const answersB: RubricAnswer[] = nineCritRubric.nodes.map((node) => ({
            criterionId: node.id,
            scaleLevelId: partialKeys.has(node.key) ? LEVEL_PARTIAL_ID : LEVEL_MEETS_ID,
            rawValue: partialKeys.has(node.key) ? 0.5 : 1,
        }));
        const expectedB = RubricScoring.Compute({ version: nineCritRubric, answers: answersB });

        const agentB = new TestableCriticAgent();
        agentB.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Case (b): two non-gate Partials pass overall review',
                Defects: [],
                Scores: {
                    Criteria: nineCritRubric.nodes.map((node) => ({
                        Criterion: node.key,
                        Level: partialKeys.has(node.key) ? 'Partial' : 'Meets',
                    })),
                },
            },
        });

        const { finalStep: stepB } = await agentB.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(stepB.newPayload?.Review?.Scores?.OverallScore).toBe(expectedB.normalizedScore);
        expect(stepB.newPayload?.Review?.Scores?.Passed).toBe(expectedB.passed);
        expect(stepB.newPayload?.Review?.Scores?.Passed).toBe(true);
        const partialCriterionEntry = stepB.newPayload?.Review?.Scores?.Criteria.find(
            (c) => c.Criterion === 'readable-at-phone-size',
        );
        expect(partialCriterionEntry?.Score).toBe(0.5);
        expect(partialCriterionEntry?.Passed).toBe(false);

        // (c) Criterion entry with only Score: 1 (no Level) counts as unanswered, so a gate given only Score: 1 fails
        const answersC: RubricAnswer[] = nineCritRubric.nodes
            .filter((node) => node.key !== 'generated-assets-are-honest-and-disclosed')
            .map((node) => ({
                criterionId: node.id,
                scaleLevelId: LEVEL_MEETS_ID,
                rawValue: 1,
            }));
        const expectedC = RubricScoring.Compute({ version: nineCritRubric, answers: answersC });
        expect(expectedC.outcome).toBe('GateFailed');
        expect(expectedC.passed).toBe(false);

        const agentC = new TestableCriticAgent();
        agentC.EnqueuePromptOutcome({
            success: true,
            result: {
                Summary: 'Case (c): gate given Score: 1 without Level is unanswered',
                Defects: [],
                Scores: {
                    Criteria: nineCritRubric.nodes.map((node) =>
                        node.key === 'generated-assets-are-honest-and-disclosed'
                            ? ({
                                  Criterion: node.key,
                                  Score: 1,
                              } as unknown as CriticPromptCriterionScore)
                            : { Criterion: node.key, Level: 'Meets' },
                    ),
                },
            },
        });

        const { finalStep: stepC } = await agentC.RunForTest({
            agent: { ID: 'critic-id', ParentID: 'root-id' },
            payload: spec,
        } as unknown as ExecuteAgentParams<Partial<VideoGenerationSpec>>);

        expect(stepC.newPayload?.Review?.Scores?.OverallScore).toBe(expectedC.normalizedScore);
        expect(stepC.newPayload?.Review?.Scores?.Passed).toBe(false);
        const unansweredGate = stepC.newPayload?.Review?.Scores?.Criteria.find(
            (c) => c.Criterion === 'generated-assets-are-honest-and-disclosed',
        );
        expect(unansweredGate?.Passed).toBe(false);
    });
});
