import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import {
    CODE_FALLBACK_LIMITS,
    LogStatus,
    type MJLimitsProgressDetectorConfig,
    type UserInfo,
} from '@memberjunction/core';
import {
    ExtractProgressDiagnosticsFromRunData,
    type MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    DeterministicProgressDetector,
    type IterationProgressSample,
} from '../DeterministicProgressDetector';
import {
    FastConvergenceJudge,
    type FastConvergenceJudgeEvaluator,
} from '../FastConvergenceJudge';
import { AgentDecisionService } from '../AgentDecisionService';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

function createDetectorConfig(
    overrides: Partial<MJLimitsProgressDetectorConfig> = {},
): MJLimitsProgressDetectorConfig {
    return {
        ...CODE_FALLBACK_LIMITS.ProgressDetector,
        ...overrides,
    };
}

function makeConvergingSamples(count: number): IterationProgressSample[] {
    const distinctTopics = [
        'Reconciled accounts receivable subledger invoices against bank clearing settlement batch.',
        'Audited regional warehouse pallet counts and flagged shrink variances in zone delta.',
        'Published quarterly payroll withholding schedule and verified federal tax deposit receipts.',
        'Normalized vendor procurement contracts with updated renewal clauses and volume rebates.',
        'Completed clinical billing claim scrubbing for outpatient radiology diagnostic codes.',
        'Validated cryptographic webhook signatures across downstream fulfillment microservices.',
    ];
    return Array.from({ length: count }, (_, idx) => ({
        IterationIndex: idx + 1,
        StepType: 'Actions',
        StepSignature: `Actions:CreateRecord-${idx + 1}`,
        RecordsCreatedOrChanged: 2,
        TasksClosed: idx % 2 === 0 ? 1 : 0,
        OutputText: distinctTopics[idx % distinctTopics.length].repeat((idx % 3) + 1),
        PayloadFingerprint: `payload-v${idx + 1}`,
        TokensSpent: 400,
        ErrorSignature: null,
        HeapUsedBytes: 50_000_000 + idx * 10_000,
    }));
}

function makeStalledRepeatedSamples(count: number): IterationProgressSample[] {
    const repeatedText = 'Retrying search for record ID 999 with identical query parameters and no new results.';
    return Array.from({ length: count }, (_, idx) => ({
        IterationIndex: idx + 1,
        StepType: 'Actions',
        StepSignature: 'Actions:SearchRecords',
        RecordsCreatedOrChanged: 0,
        TasksClosed: 0,
        OutputText: repeatedText,
        PayloadFingerprint: 'payload-unchanged',
        TokensSpent: 4_500,
        ErrorSignature: null,
        HeapUsedBytes: 50_000_000 + idx * 25_000_000,
    }));
}

function makeAmbiguousSamples(count: number): IterationProgressSample[] {
    return Array.from({ length: count }, (_, idx) => ({
        IterationIndex: idx + 1,
        StepType: 'Actions',
        StepSignature: idx % 2 === 0 ? 'Actions:InspectSchema' : 'Actions:QueryCandidate',
        RecordsCreatedOrChanged: 0,
        TasksClosed: 0,
        OutputText: idx % 2 === 0
            ? `Inspecting candidate table ${idx} schema metadata and column constraints.`
            : `Evaluating filter selectivity for candidate partition ${idx * 13}.`,
        PayloadFingerprint: `ambiguous-state-${idx % 2}`,
        TokensSpent: 1_800,
        ErrorSignature: null,
        HeapUsedBytes: 50_000_000 + idx * 100_000,
    }));
}

describe('DeterministicProgressDetector — 6 signals & classification', () => {
    let detector: DeterministicProgressDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        detector = new DeterministicProgressDetector();
    });

    it('evaluates all 6 deterministic progress signals and classifies active progress as Converging', () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6, WindowSize: 10 });
        for (const sample of makeConvergingSamples(6)) {
            detector.RecordSample(sample);
        }

        const result = detector.Evaluate(config);

        expect(result.Checked).toBe(true);
        expect(result.Classification).toBe('Converging');
        expect(result.ProgressScore).toBeGreaterThanOrEqual(config.AmbiguityHighScoreThreshold);
        // Signal 1: records created/changed
        expect(result.Signals.RecordsCreatedOrChangedTotal).toBe(12);
        expect(result.Signals.RecordsCreatedOrChangedRate).toBe(2);
        // Signal 2: tasks closed
        expect(result.Signals.TasksClosedTotal).toBe(3);
        expect(result.Signals.TasksClosedRate).toBe(0.5);
        // Signal 3: distinct outputs
        expect(result.Signals.DistinctOutputsCount).toBe(6);
        expect(result.Signals.DistinctOutputRatio).toBe(1);
        // Signal 4: repeated text similarity (low for distinct text)
        expect(result.Signals.RepeatedTextSimilarity).toBeLessThan(0.75);
        // Signal 5: tokens spent per progress unit
        expect(result.Signals.TokensSpentTotal).toBe(2400);
        expect(result.Signals.TokensPerProgressUnit).toBeLessThan(500);
        expect(result.Signals.TokenEfficiencyScore).toBeGreaterThan(0.7);
        // Signal 6: heap / output variance
        expect(result.Signals.OutputLengthVariance).toBeGreaterThan(0);
        expect(result.Signals.HeapDeltaBytes).toBe(50_000);
        expect(result.Signals.VarianceHealthScore).toBeGreaterThan(0.5);
    });

    it('detects Stalled via n-gram similarity, zero record/task progress, zero payload delta, and heap/token waste', () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6, WindowSize: 10 });
        for (const sample of makeStalledRepeatedSamples(6)) {
            detector.RecordSample(sample);
        }

        const result = detector.Evaluate(config);

        expect(result.Checked).toBe(true);
        expect(result.Classification).toBe('Stalled');
        expect(result.Signals.RecordsCreatedOrChangedTotal).toBe(0);
        expect(result.Signals.TasksClosedTotal).toBe(0);
        expect(result.Signals.DistinctOutputsCount).toBe(1);
        expect(result.Signals.RepeatedTextSimilarity).toBe(1);
        expect(result.Signals.TokensPerProgressUnit).toBe(Number.POSITIVE_INFINITY);
        expect(result.Signals.OutputLengthVariance).toBe(0);
        expect(result.Signals.HeapGrowthRatio).toBeGreaterThan(1);
        expect(result.Signals.ZeroPayloadDeltaStreak).toBe(5);
    });

    it('supports embedding cosine similarity for Signal 4 when OutputEmbedding vectors are supplied', () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6, WindowSize: 6 });
        const samples = Array.from({ length: 6 }, (_, idx) => ({
            IterationIndex: idx + 1,
            StepType: 'Actions',
            StepSignature: 'Actions:Repeat',
            RecordsCreatedOrChanged: 0,
            TasksClosed: 0,
            OutputText: `Paraphrase variant ${idx}`,
            PayloadFingerprint: 'same-fp',
            TokensSpent: 3000,
            OutputEmbedding: [0.9, 0.1, 0.0],
        }));

        const result = detector.Evaluate(config, samples);
        expect(result.Signals.RepeatedTextSimilarity).toBeCloseTo(1, 5);
        expect(result.Classification).toBe('Stalled');
    });

    it('detects Stalled immediately on repeating identical errors reaching RepeatingErrorWindowCount', () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6, RepeatingErrorWindowCount: 4 });
        const samples: IterationProgressSample[] = [
            ...makeConvergingSamples(2),
            ...Array.from({ length: 4 }, (_, idx) => ({
                IterationIndex: idx + 3,
                StepType: 'Actions',
                StepSignature: 'Actions:CallAPI',
                RecordsCreatedOrChanged: 0,
                TasksClosed: 0,
                OutputText: `API call attempt ${idx} failed`,
                PayloadFingerprint: 'err-fp',
                TokensSpent: 500,
                ErrorSignature: 'HTTP 503 Service Unavailable',
            })),
        ];

        const result = detector.Evaluate(config, samples);
        expect(result.Classification).toBe('Stalled');
        expect(result.Signals.RepeatingErrorStreak).toBe(4);
        expect(result.Reason).toContain('Repeating identical error');
    });

    it('classifies borderline runs into Ambiguous strictly between AmbiguityLowScoreThreshold and AmbiguityHighScoreThreshold', () => {
        const config = createDetectorConfig({
            MinIterationsBeforeCheck: 6,
            AmbiguityLowScoreThreshold: 0.25,
            AmbiguityHighScoreThreshold: 0.65,
        });
        const result = detector.Evaluate(config, makeAmbiguousSamples(6));

        expect(result.Checked).toBe(true);
        expect(result.Classification).toBe('Ambiguous');
        expect(result.ProgressScore).toBeGreaterThanOrEqual(0.25);
        expect(result.ProgressScore).toBeLessThan(0.65);
    });
});

describe('FastConvergenceJudge — Ambiguous-only invocation, <200ms bound, and diagnostics logging', () => {
    let detector: DeterministicProgressDetector;
    let judge: FastConvergenceJudge;

    beforeEach(() => {
        vi.clearAllMocks();
        detector = new DeterministicProgressDetector();
        judge = new FastConvergenceJudge();
    });

    it('invokes FastConvergenceJudge STRICTLY and ONLY on Ambiguous — NEVER on Converging or Stalled', async () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6 });
        const evaluatorSpy = vi.fn<FastConvergenceJudgeEvaluator>(async () => ({
            Converging: true,
            Reason: 'Model confirmed progress',
            LatencyMs: 15,
            TimedOut: false,
            UsedFallback: false,
            Source: 'Model',
        }));

        // 1) Converging -> evaluator NOT called
        const convergingDet = detector.Evaluate(config, makeConvergingSamples(6));
        expect(convergingDet.Classification).toBe('Converging');
        const convergingOut = await judge.EvaluateIfAmbiguous({
            DetectorResult: convergingDet,
            Iteration: 6,
            StateSummary: 'converging state',
            Config: config,
            Evaluator: evaluatorSpy,
        });
        expect(convergingOut.FastJudgeInvoked).toBe(false);
        expect(evaluatorSpy).toHaveBeenCalledTimes(0);

        // 2) Stalled -> evaluator NOT called
        const stalledDet = detector.Evaluate(config, makeStalledRepeatedSamples(6));
        expect(stalledDet.Classification).toBe('Stalled');
        const stalledOut = await judge.EvaluateIfAmbiguous({
            DetectorResult: stalledDet,
            Iteration: 6,
            StateSummary: 'stalled state',
            Config: config,
            Evaluator: evaluatorSpy,
        });
        expect(stalledOut.FastJudgeInvoked).toBe(false);
        expect(evaluatorSpy).toHaveBeenCalledTimes(0);

        // 3) Ambiguous -> evaluator IS called and logs short reason to run diagnostics
        const ambiguousDet = detector.Evaluate(config, makeAmbiguousSamples(6));
        expect(ambiguousDet.Classification).toBe('Ambiguous');
        const runStub: Pick<MJAIAgentRunEntityExtended, 'ID' | 'Data'> = {
            ID: '44444444-4444-4444-8444-444444444444',
            Data: JSON.stringify({ existingKey: 'preserved' }),
        };

        const ambiguousOut = await judge.EvaluateIfAmbiguous({
            DetectorResult: ambiguousDet,
            Iteration: 6,
            StateSummary: 'ambiguous exploration phase',
            Config: config,
            AgentRun: runStub,
            ContextUser: { ID: 'user-1' } as UserInfo,
            Evaluator: evaluatorSpy,
        });

        expect(evaluatorSpy).toHaveBeenCalledTimes(1);
        expect(ambiguousOut.FastJudgeInvoked).toBe(true);
        expect(ambiguousOut.Classification).toBe('Converging');
        expect(ambiguousOut.FastJudgeResult?.Reason).toBe('Model confirmed progress');
        expect(ambiguousOut.FastJudgeResult?.LatencyMs).toBeLessThanOrEqual(200);

        const diag = ExtractProgressDiagnosticsFromRunData(runStub.Data);
        expect(diag).not.toBeNull();
        expect(diag?.FastJudgeEntries).toHaveLength(1);
        expect(diag?.FastJudgeEntries[0].Reason).toBe('Model confirmed progress');
        expect(diag?.FastJudgeEntries[0].Converging).toBe(true);
        expect(JSON.parse(runStub.Data!).existingKey).toBe('preserved');
        expect(LogStatus).toHaveBeenCalledWith(expect.stringContaining('[FastConvergenceJudge]'));
    });

    it('enforces sub-200ms timeout bound and applies PauseForHuman / ContinueWithWarning fallback without blocking', async () => {
        const config = createDetectorConfig({
            MinIterationsBeforeCheck: 6,
            FastJudgeTimeoutMs: 60,
            FastJudgeFailureFallback: 'PauseForHuman',
        });
        const slowEvaluator: FastConvergenceJudgeEvaluator = ({ Signal }) =>
            new Promise((resolve) => {
                const timer = setTimeout(() => {
                    resolve({
                        Converging: true,
                        Reason: 'Too late',
                        LatencyMs: 500,
                        TimedOut: false,
                        UsedFallback: false,
                        Source: 'Model',
                    });
                }, 500);
                Signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
            });

        const ambiguousDet = detector.Evaluate(config, makeAmbiguousSamples(6));
        const runStub: Pick<MJAIAgentRunEntityExtended, 'ID' | 'Data'> = {
            ID: '55555555-5555-4555-8555-555555555555',
            Data: null,
        };

        const t0 = Date.now();
        const judged = await judge.EvaluateIfAmbiguous({
            DetectorResult: ambiguousDet,
            Iteration: 6,
            StateSummary: 'slow judge test',
            Config: config,
            AgentRun: runStub,
            Evaluator: slowEvaluator,
        });
        const wallMs = Date.now() - t0;

        expect(wallMs).toBeLessThan(200);
        expect(judged.FastJudgeInvoked).toBe(true);
        expect(judged.FastJudgeResult?.TimedOut).toBe(true);
        expect(judged.FastJudgeResult?.UsedFallback).toBe(true);
        expect(judged.FastJudgeResult?.Converging).toBe(false);
        expect(judged.Classification).toBe('Stalled');

        const diag = ExtractProgressDiagnosticsFromRunData(runStub.Data);
        expect(diag?.FastJudgeEntries[0].TimedOut).toBe(true);
        expect(diag?.FastJudgeEntries[0].Reason).toContain('timed out');
    });

    it('classifies genuinely progressing non-DB multi-step payload transitions as Converging without invoking FastConvergenceJudge', async () => {
        const config = createDetectorConfig({ MinIterationsBeforeCheck: 6, WindowSize: 10 });
        const stageDescriptions = [
            'Director outlined narrative arc and pacing targets for intro sequence.',
            'Art Director selected high-contrast color palette and lighting keyframe style.',
            'Storyboard drafted six camera shot compositions with voiceover timing cues.',
            'Pre-Production generated hero b-roll visual assets and validated audio sync.',
            'Motion Engineer assembled scene transitions and typography overlays.',
            'Critic reviewed final render frame continuity and approved delivery spec.',
        ];
        const samples: IterationProgressSample[] = stageDescriptions.map((desc, idx) => ({
            IterationIndex: idx + 1,
            StepType: idx % 2 === 0 ? 'Sub-Agent' : 'Actions',
            StepSignature: `Step:Stage-${idx + 1}`,
            RecordsCreatedOrChanged: 0,
            TasksClosed: 0,
            OutputText: desc.repeat((idx % 2) + 1),
            PayloadFingerprint: JSON.stringify({ stage: idx + 1, artifacts: [`art-${idx + 1}`] }),
            TokensSpent: 450,
            ErrorSignature: null,
            HeapUsedBytes: 50_000_000 + idx * 10_000,
        }));

        const result = detector.Evaluate(config, samples);
        expect(result.Checked).toBe(true);
        expect(result.Classification).toBe('Converging');
        expect(result.ProgressScore).toBeGreaterThanOrEqual(config.AmbiguityHighScoreThreshold);
    });

    it('skips decision model calls in FastConvergenceJudge when a TestLLM stub is active on BaseLLM', async () => {
        class TestLLM {
            public constructor(_apiKey?: string) {}
        }
        class TestLLMRegistrationHandle extends TestLLM {}

        const factory = MJGlobal.Instance.ClassFactory;
        const prior = factory.GetRegistration(BaseLLM, 'OpenAILLM');
        factory.Register(BaseLLM, TestLLMRegistrationHandle, 'OpenAILLM', 999);
        const decisionService = new AgentDecisionService();
        const askSpy = vi.spyOn(decisionService, 'Ask');
        const stubJudge = new FastConvergenceJudge(decisionService);
        try {
            const ambiguousDet = detector.Evaluate(createDetectorConfig(), makeAmbiguousSamples(6));
            const evaluated = await stubJudge.EvaluateIfAmbiguous({
                DetectorResult: ambiguousDet,
                Iteration: 6,
                StateSummary: 'ambiguous under test llm',
                Config: createDetectorConfig(),
                ContextUser: { ID: 'user-test-llm' } as UserInfo,
            });
            expect(askSpy).not.toHaveBeenCalled();
            expect(evaluated.FastJudgeInvoked).toBe(true);
            expect(evaluated.Classification).toBe('Converging');
            expect(evaluated.FastJudgeResult?.UsedFallback).toBe(true);
            expect(evaluated.FastJudgeResult?.Reason).toContain('TestLLM');
        } finally {
            if (prior) {
                factory.Register(BaseLLM, prior.SubClass, 'OpenAILLM', 1000);
            }
        }
    });
});
