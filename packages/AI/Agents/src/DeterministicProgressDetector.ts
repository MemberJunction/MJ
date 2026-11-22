/**
 * @fileoverview Deterministic sliding-window progress detector for MemberJunction AI Agents.
 *
 * Evaluates 6 cheap, zero-LLM deterministic signals over a sliding window of recent iterations:
 *   1. Records created / changed
 *   2. Tasks closed
 *   3. New distinct outputs
 *   4. Repeated text (word/character n-gram cosine similarity or embedding cosine similarity over last k outputs)
 *   5. Tokens spent per unit of progress
 *   6. Heap / output variance
 *
 * Classifies each window deterministically into `'Converging'`, `'Stalled'`, or `'Ambiguous'`.
 * Only `'Ambiguous'` is permitted to trigger the bounded sub-200ms {@link FastConvergenceJudge}.
 *
 * @module @memberjunction/ai-agents
 */

import { LimitsConfigResolver, type MJLimitsProgressDetectorConfig } from '@memberjunction/core';
import type {
    ProgressClassification,
    ProgressEvaluationResult,
    ProgressSignalsBreakdown,
} from '@memberjunction/ai-core-plus';

/** Single iteration telemetry sample observed by {@link DeterministicProgressDetector}. */
export interface IterationProgressSample {
    IterationIndex: number;
    StepType: string;
    StepSignature: string;
    RecordsCreatedOrChanged: number;
    TasksClosed: number;
    OutputText: string;
    PayloadFingerprint?: string;
    TokensSpent: number;
    ErrorSignature?: string | null;
    HeapUsedBytes?: number;
    OutputEmbedding?: readonly number[];
}

// Tuning: deterministic composite scoring constants (no RunawayGuard bounds)
const SIGNAL_WEIGHT_RECORDS = 0.24; // Tuning: weight for Signal 1 (records created/changed)
const SIGNAL_WEIGHT_TASKS = 0.20; // Tuning: weight for Signal 2 (tasks closed)
const SIGNAL_WEIGHT_DISTINCT_OUTPUTS = 0.20; // Tuning: weight for Signal 3 (distinct outputs)
const SIGNAL_WEIGHT_NOVELTY = 0.14; // Tuning: weight for Signal 4 (1 - repeated text similarity)
const SIGNAL_WEIGHT_TOKEN_EFFICIENCY = 0.12; // Tuning: weight for Signal 5 (tokens per progress unit)
const SIGNAL_WEIGHT_VARIANCE = 0.10; // Tuning: weight for Signal 6 (heap/output variance health)
const REFERENCE_TOKENS_PER_PROGRESS_UNIT = 2000; // Tuning: normalization anchor for token efficiency score
const NEAR_DUPLICATE_COSINE_THRESHOLD = 0.85; // Tuning: cosine threshold treating consecutive outputs as near-identical
const LAST_K_OUTPUTS_FOR_SIMILARITY = 4; // Tuning: trailing window size for n-gram/embedding repetition check
const NGRAM_SHINGLE_SIZE = 3; // Tuning: character trigram size for deterministic text similarity

/**
 * Evaluates sliding iteration windows across 6 cheap deterministic progress signals
 * and classifies progress as `Converging`, `Stalled`, or `Ambiguous`.
 */
export class DeterministicProgressDetector {
    private samples: IterationProgressSample[] = [];

    /** Appends an observed iteration sample to the detector history. */
    public RecordSample(sample: IterationProgressSample): void {
        this.samples.push({ ...sample });
    }

    /** Returns a shallow copy of recorded samples (for diagnostics or checkpointing). */
    public GetSamples(): IterationProgressSample[] {
        return [...this.samples];
    }

    /** Clears recorded samples (e.g. on human-approved reset during checkpoint resume). */
    public Reset(): void {
        this.samples = [];
    }

    /**
     * Evaluates the current sliding window (or an explicitly supplied sample slice)
     * against the resolved {@link MJLimitsProgressDetectorConfig}.
     */
    public Evaluate(
        config: MJLimitsProgressDetectorConfig = LimitsConfigResolver.Resolve().Limits.ProgressDetector,
        overrideSamples?: readonly IterationProgressSample[],
    ): ProgressEvaluationResult {
        const source = overrideSamples ?? this.samples;
        const windowSize = Math.max(1, config.WindowSize);
        const window = source.slice(-windowSize);
        const signals = this.computeSignals(window);

        if (!config.Enabled) {
            return {
                Checked: false,
                WindowSize: windowSize,
                SampleCount: window.length,
                Classification: 'Converging',
                ProgressScore: 1,
                Reason: 'ProgressDetector disabled by configuration',
                Signals: signals,
                FastJudgeInvoked: false,
            };
        }

        if (source.length < config.MinIterationsBeforeCheck) {
            return {
                Checked: false,
                WindowSize: windowSize,
                SampleCount: window.length,
                Classification: 'Converging',
                ProgressScore: 1,
                Reason: `Warmup iterations (${source.length}/${config.MinIterationsBeforeCheck}) below check threshold`,
                Signals: signals,
                FastJudgeInvoked: false,
            };
        }

        const hardStallReason = this.detectHardStall(signals, config);
        const progressScore = this.computeCompositeProgressScore(signals, config, window);

        if (hardStallReason) {
            return {
                Checked: true,
                WindowSize: windowSize,
                SampleCount: window.length,
                Classification: 'Stalled',
                ProgressScore: Math.min(progressScore, Math.max(0, config.AmbiguityLowScoreThreshold - 0.01)),
                Reason: hardStallReason,
                Signals: signals,
                FastJudgeInvoked: false,
            };
        }

        const classification = this.classifyByScore(progressScore, config);
        const reason = this.buildClassificationReason(classification, progressScore, signals);

        return {
            Checked: true,
            WindowSize: windowSize,
            SampleCount: window.length,
            Classification: classification,
            ProgressScore: progressScore,
            Reason: reason,
            Signals: signals,
            FastJudgeInvoked: false,
        };
    }

    private computeSignals(window: readonly IterationProgressSample[]): ProgressSignalsBreakdown {
        const n = window.length;
        if (n === 0) {
            return this.emptySignals();
        }

        let recordsTotal = 0;
        let tasksClosedTotal = 0;
        let tokensSpentTotal = 0;
        const distinctOutputs = new Set<string>();
        const stepSignatureCounts = new Map<string, number>();

        for (const s of window) {
            recordsTotal += Math.max(0, s.RecordsCreatedOrChanged);
            tasksClosedTotal += Math.max(0, s.TasksClosed);
            tokensSpentTotal += Math.max(0, s.TokensSpent);
            distinctOutputs.add(this.canonicalOutputKey(s));
            stepSignatureCounts.set(s.StepSignature, (stepSignatureCounts.get(s.StepSignature) ?? 0) + 1);
        }

        const repeatedTextSimilarity = this.computeRepeatedTextSimilarity(window.slice(-LAST_K_OUTPUTS_FOR_SIMILARITY));
        const payloadDeltaCount = this.countPayloadTransitions(window);
        const novelOutputUnits = this.countNovelOutputs(window);
        const progressUnitsTotal = recordsTotal + tasksClosedTotal + payloadDeltaCount + novelOutputUnits;
        const tokensPerProgressUnit = progressUnitsTotal > 0
            ? tokensSpentTotal / progressUnitsTotal
            : (tokensSpentTotal > 0 ? Number.POSITIVE_INFINITY : 0);
        const tokenEfficiencyScore = progressUnitsTotal > 0
            ? 1 / (1 + tokensPerProgressUnit / REFERENCE_TOKENS_PER_PROGRESS_UNIT)
            : (tokensSpentTotal === 0 ? 0.5 : 0);

        const maxSameStepCount = Math.max(...stepSignatureCounts.values());
        const duplicateStepRatio = maxSameStepCount / n;
        const zeroPayloadDeltaStreak = this.computeZeroPayloadDeltaStreak(window);
        const repeatingErrorStreak = this.computeRepeatingErrorStreak(window);

        const { outputLengthVariance, heapDeltaBytes, heapGrowthRatio, varianceHealthScore } =
            this.computeVarianceAndHeapSignals(window, progressUnitsTotal);

        return {
            RecordsCreatedOrChangedTotal: recordsTotal,
            RecordsCreatedOrChangedRate: recordsTotal / n,
            TasksClosedTotal: tasksClosedTotal,
            TasksClosedRate: tasksClosedTotal / n,
            DistinctOutputsCount: distinctOutputs.size,
            DistinctOutputRatio: distinctOutputs.size / n,
            RepeatedTextSimilarity: repeatedTextSimilarity,
            TokensSpentTotal: tokensSpentTotal,
            ProgressUnitsTotal: progressUnitsTotal,
            TokensPerProgressUnit: tokensPerProgressUnit,
            TokenEfficiencyScore: tokenEfficiencyScore,
            OutputLengthVariance: outputLengthVariance,
            HeapDeltaBytes: heapDeltaBytes,
            HeapGrowthRatio: heapGrowthRatio,
            VarianceHealthScore: varianceHealthScore,
            DuplicateStepRatio: duplicateStepRatio,
            ZeroPayloadDeltaStreak: zeroPayloadDeltaStreak,
            RepeatingErrorStreak: repeatingErrorStreak,
        };
    }

    private emptySignals(): ProgressSignalsBreakdown {
        return {
            RecordsCreatedOrChangedTotal: 0,
            RecordsCreatedOrChangedRate: 0,
            TasksClosedTotal: 0,
            TasksClosedRate: 0,
            DistinctOutputsCount: 0,
            DistinctOutputRatio: 1,
            RepeatedTextSimilarity: 0,
            TokensSpentTotal: 0,
            ProgressUnitsTotal: 0,
            TokensPerProgressUnit: 0,
            TokenEfficiencyScore: 1,
            OutputLengthVariance: 0,
            HeapDeltaBytes: 0,
            HeapGrowthRatio: 0,
            VarianceHealthScore: 1,
            DuplicateStepRatio: 0,
            ZeroPayloadDeltaStreak: 0,
            RepeatingErrorStreak: 0,
        };
    }

    private canonicalOutputKey(sample: IterationProgressSample): string {
        const text = sample.OutputText.trim().toLowerCase().replace(/\s+/g, ' ');
        return `${text}|${sample.PayloadFingerprint ?? ''}`;
    }

    private countPayloadTransitions(window: readonly IterationProgressSample[]): number {
        let transitions = 0;
        let prev: string | undefined;
        for (const s of window) {
            if (s.PayloadFingerprint !== undefined) {
                if (prev !== undefined && s.PayloadFingerprint !== prev) {
                    transitions++;
                }
                prev = s.PayloadFingerprint;
            }
        }
        return transitions;
    }

    private countNovelOutputs(window: readonly IterationProgressSample[]): number {
        if (window.length <= 1) return 0;
        let novel = 0;
        for (let i = 1; i < window.length; i++) {
            const cur = window[i].OutputText.trim();
            if (cur.length === 0) continue;
            const sim = this.samplePairSimilarity(window[i - 1], window[i]);
            if (sim < NEAR_DUPLICATE_COSINE_THRESHOLD) {
                novel++;
            }
        }
        return novel;
    }

    private computeRepeatedTextSimilarity(recent: readonly IterationProgressSample[]): number {
        if (recent.length < 2) {
            return 0;
        }
        let sumSim = 0;
        let pairCount = 0;
        for (let i = 0; i < recent.length; i++) {
            for (let j = i + 1; j < recent.length; j++) {
                sumSim += this.samplePairSimilarity(recent[i], recent[j]);
                pairCount++;
            }
        }
        return pairCount > 0 ? Math.min(1, Math.max(0, sumSim / pairCount)) : 0;
    }

    private samplePairSimilarity(a: IterationProgressSample, b: IterationProgressSample): number {
        if (
            a.OutputEmbedding &&
            b.OutputEmbedding &&
            a.OutputEmbedding.length > 0 &&
            a.OutputEmbedding.length === b.OutputEmbedding.length
        ) {
            return this.vectorCosineSimilarity(a.OutputEmbedding, b.OutputEmbedding);
        }
        return this.ngramCosineSimilarity(a.OutputText, b.OutputText);
    }

    private vectorCosineSimilarity(a: readonly number[], b: readonly number[]): number {
        let dot = 0;
        let magA = 0;
        let magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        const denom = Math.sqrt(magA) * Math.sqrt(magB);
        return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
    }

    private ngramCosineSimilarity(rawA: string, rawB: string): number {
        const a = rawA.trim().toLowerCase().replace(/\s+/g, ' ');
        const b = rawB.trim().toLowerCase().replace(/\s+/g, ' ');
        if (a.length === 0 && b.length === 0) {
            return 1;
        }
        if (a.length === 0 || b.length === 0) {
            return 0;
        }
        if (a === b) {
            return 1;
        }
        const vecA = this.buildNgramVector(a);
        const vecB = this.buildNgramVector(b);
        let dot = 0;
        let magA = 0;
        let magB = 0;
        for (const [gram, countA] of vecA.entries()) {
            magA += countA * countA;
            const countB = vecB.get(gram);
            if (countB !== undefined) {
                dot += countA * countB;
            }
        }
        for (const countB of vecB.values()) {
            magB += countB * countB;
        }
        const denom = Math.sqrt(magA) * Math.sqrt(magB);
        return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
    }

    private buildNgramVector(text: string): Map<string, number> {
        const map = new Map<string, number>();
        if (text.length < NGRAM_SHINGLE_SIZE) {
            map.set(text, 1);
            return map;
        }
        for (let i = 0; i <= text.length - NGRAM_SHINGLE_SIZE; i++) {
            const gram = text.slice(i, i + NGRAM_SHINGLE_SIZE);
            map.set(gram, (map.get(gram) ?? 0) + 1);
        }
        return map;
    }

    private computeZeroPayloadDeltaStreak(window: readonly IterationProgressSample[]): number {
        let streak = 0;
        for (let i = window.length - 1; i >= 1; i--) {
            const cur = window[i];
            const prev = window[i - 1];
            const samePayload =
                cur.PayloadFingerprint !== undefined &&
                prev.PayloadFingerprint !== undefined &&
                cur.PayloadFingerprint === prev.PayloadFingerprint;
            const noHardProgress = cur.RecordsCreatedOrChanged === 0 && cur.TasksClosed === 0;
            if (samePayload && noHardProgress) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    private computeRepeatingErrorStreak(window: readonly IterationProgressSample[]): number {
        let streak = 0;
        let lastErr: string | null = null;
        for (let i = window.length - 1; i >= 0; i--) {
            const err = window[i].ErrorSignature?.trim() || null;
            if (!err) {
                break;
            }
            if (lastErr === null) {
                lastErr = err;
                streak = 1;
            } else if (err === lastErr) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    private computeVarianceAndHeapSignals(
        window: readonly IterationProgressSample[],
        progressUnitsTotal: number,
    ): {
        outputLengthVariance: number;
        heapDeltaBytes: number;
        heapGrowthRatio: number;
        varianceHealthScore: number;
    } {
        const lengths = window.map((s) => s.OutputText.trim().length);
        const meanLen = lengths.reduce((acc, v) => acc + v, 0) / lengths.length;
        const variance = lengths.reduce((acc, v) => acc + (v - meanLen) ** 2, 0) / lengths.length;
        const cv = meanLen > 0 ? Math.sqrt(variance) / meanLen : 0;

        const heapSamples = window
            .map((s) => s.HeapUsedBytes)
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
        let heapDeltaBytes = 0;
        let heapGrowthRatio = 0;
        if (heapSamples.length >= 2) {
            const first = heapSamples[0];
            const last = heapSamples[heapSamples.length - 1];
            heapDeltaBytes = last - first;
            heapGrowthRatio = first > 0 ? Math.max(0, heapDeltaBytes / first) : 0;
        }

        // Healthy runs show non-zero output variation (unless already producing hard record/task progress)
        // and bounded heap growth per progress unit.
        const outputVarScore = Math.min(1, cv / 0.25);
        const heapPenalty = progressUnitsTotal === 0 && heapGrowthRatio > 0.25 ? Math.min(0.8, heapGrowthRatio) : 0;
        const varianceHealthScore = Math.max(0, Math.min(1, outputVarScore * (1 - heapPenalty)));

        return {
            outputLengthVariance: variance,
            heapDeltaBytes,
            heapGrowthRatio,
            varianceHealthScore,
        };
    }

    private detectHardStall(
        signals: ProgressSignalsBreakdown,
        config: MJLimitsProgressDetectorConfig,
    ): string | null {
        if (signals.RepeatingErrorStreak >= config.RepeatingErrorWindowCount) {
            return `Repeating identical error across ${signals.RepeatingErrorStreak} consecutive iterations (threshold ${config.RepeatingErrorWindowCount})`;
        }
        const noHardProgress = signals.RecordsCreatedOrChangedTotal === 0 && signals.TasksClosedTotal === 0;
        if (
            signals.ZeroPayloadDeltaStreak >= config.NoPayloadDeltaWindowCount &&
            noHardProgress &&
            (signals.DuplicateStepRatio >= config.DuplicateStepRatioThreshold ||
                signals.RepeatedTextSimilarity >= NEAR_DUPLICATE_COSINE_THRESHOLD)
        ) {
            return `Zero payload delta across ${signals.ZeroPayloadDeltaStreak} consecutive iterations with repetitive outputs/steps`;
        }
        if (
            noHardProgress &&
            signals.DuplicateStepRatio >= config.DuplicateStepRatioThreshold &&
            signals.RepeatedTextSimilarity >= NEAR_DUPLICATE_COSINE_THRESHOLD
        ) {
            return `High step duplication (${(signals.DuplicateStepRatio * 100).toFixed(0)}%) and repeated text (${(signals.RepeatedTextSimilarity * 100).toFixed(0)}%) with zero record/task progress`;
        }
        return null;
    }

    private computeCompositeProgressScore(
        signals: ProgressSignalsBreakdown,
        config: MJLimitsProgressDetectorConfig,
        window: readonly IterationProgressSample[],
    ): number {
        const recordScore = Math.min(1, signals.RecordsCreatedOrChangedRate);
        const taskScore = Math.min(1, signals.TasksClosedRate * 2);
        const distinctScore = Math.min(1, signals.DistinctOutputRatio);
        const noveltyScore = Math.max(0, 1 - signals.RepeatedTextSimilarity);
        const tokenScore = signals.TokenEfficiencyScore;
        const varianceScore = signals.VarianceHealthScore;

        let hardProgressContribution =
            recordScore * SIGNAL_WEIGHT_RECORDS +
            taskScore * SIGNAL_WEIGHT_TASKS;

        // Multi-step agents executing actions/sub-agents without writing MJ records or scratchpad
        // tasks still demonstrate concrete forward progress when their payload evolves across
        // distinct non-oscillating states without duplicate step/error patterns.
        if (signals.RecordsCreatedOrChangedTotal === 0 && signals.TasksClosedTotal === 0 && window.length > 0) {
            const distinctPayloads = new Set<string>();
            for (const s of window) {
                if (s.PayloadFingerprint !== undefined && s.PayloadFingerprint.length > 0) {
                    distinctPayloads.add(s.PayloadFingerprint);
                }
            }
            const distinctPayloadRatio = distinctPayloads.size / window.length;
            const payloadTransitions = this.countPayloadTransitions(window);
            if (
                distinctPayloadRatio >= 0.5 &&
                payloadTransitions >= Math.floor(window.length / 2) &&
                signals.DuplicateStepRatio < 0.5 &&
                signals.RepeatedTextSimilarity < NEAR_DUPLICATE_COSINE_THRESHOLD &&
                signals.RepeatingErrorStreak === 0
            ) {
                hardProgressContribution =
                    Math.min(1, distinctPayloadRatio) * (SIGNAL_WEIGHT_RECORDS + SIGNAL_WEIGHT_TASKS);
            }
        }

        let score =
            hardProgressContribution +
            distinctScore * SIGNAL_WEIGHT_DISTINCT_OUTPUTS +
            noveltyScore * SIGNAL_WEIGHT_NOVELTY +
            tokenScore * SIGNAL_WEIGHT_TOKEN_EFFICIENCY +
            varianceScore * SIGNAL_WEIGHT_VARIANCE;

        // Penalize heavy step duplication without hard progress
        if (signals.DuplicateStepRatio >= config.DuplicateStepRatioThreshold && signals.RecordsCreatedOrChangedTotal === 0 && signals.TasksClosedTotal === 0) {
            score *= 0.5;
        }
        return Math.max(0, Math.min(1, score));
    }

    private classifyByScore(
        score: number,
        config: MJLimitsProgressDetectorConfig,
    ): ProgressClassification {
        if (score < config.AmbiguityLowScoreThreshold) {
            return 'Stalled';
        }
        if (score >= config.AmbiguityHighScoreThreshold) {
            return 'Converging';
        }
        return 'Ambiguous';
    }

    private buildClassificationReason(
        classification: ProgressClassification,
        score: number,
        signals: ProgressSignalsBreakdown,
    ): string {
        return (
            `Progress ${classification} (score=${score.toFixed(3)}, ` +
            `records=${signals.RecordsCreatedOrChangedTotal}, tasksClosed=${signals.TasksClosedTotal}, ` +
            `distinctRatio=${signals.DistinctOutputRatio.toFixed(2)}, repeatSim=${signals.RepeatedTextSimilarity.toFixed(2)}, ` +
            `tokensPerUnit=${Number.isFinite(signals.TokensPerProgressUnit) ? Math.round(signals.TokensPerProgressUnit) : 'Inf'})`
        );
    }
}
