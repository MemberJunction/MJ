import { describe, expect, it } from 'vitest';
import {
    DeriveConfidenceBand,
    FromContentItemTag,
    FromDuplicateVerdict,
    FromTrustVerdict,
    NormalizeProbabilityScore,
} from '../ai-confidence';

describe('AIConfidenceSignal adapters and helpers', () => {
    describe('NormalizeProbabilityScore', () => {
        it('clamps probability values to [0.0, 1.0] and returns null for null/undefined/NaN', () => {
            expect(NormalizeProbabilityScore(0.84)).toBe(0.84);
            expect(NormalizeProbabilityScore(-0.25)).toBe(0);
            expect(NormalizeProbabilityScore(1.5)).toBe(1);
            expect(NormalizeProbabilityScore(null)).toBeNull();
            expect(NormalizeProbabilityScore(undefined)).toBeNull();
            expect(NormalizeProbabilityScore(Number.NaN)).toBeNull();
        });
    });

    describe('DeriveConfidenceBand', () => {
        it('derives high / medium / low / unknown bands and plain-language labels from probability scores', () => {
            expect(DeriveConfidenceBand(0.90)).toEqual({
                band: 'high',
                bandLabel: 'High confidence',
            });
            expect(DeriveConfidenceBand(0.85)).toEqual({
                band: 'high',
                bandLabel: 'High confidence',
            });
            expect(DeriveConfidenceBand(0.70)).toEqual({
                band: 'medium',
                bandLabel: 'Moderate confidence — review recommended',
            });
            expect(DeriveConfidenceBand(0.60)).toEqual({
                band: 'medium',
                bandLabel: 'Moderate confidence — review recommended',
            });
            expect(DeriveConfidenceBand(0.32)).toEqual({
                band: 'low',
                bandLabel: 'Low confidence — manual check required',
            });
            expect(DeriveConfidenceBand(null)).toEqual({
                band: 'unknown',
                bandLabel: 'Confidence unavailable — review recommended',
            });
        });

        it('respects custom high and medium thresholds', () => {
            expect(DeriveConfidenceBand(0.88, { high: 0.90, medium: 0.60 }).band).toBe('medium');
            expect(DeriveConfidenceBand(0.92, { high: 0.90, medium: 0.60 }).band).toBe('high');
        });
    });

    describe('FromDuplicateVerdict', () => {
        it('maps duplicate detection verdict with probability score and audit provenance', () => {
            const signal = FromDuplicateVerdict({
                LLMConfidence: 0.91,
                LLMRecommendation: 'Merge',
                LLMReasoning: 'Exact email match and normalized phone number match.',
                LLMAgentRunID: 'run-123',
                LLMPromptRunID: 'prompt-456',
            });

            expect(signal.confidence).toBe(0.91);
            expect(signal.scale).toBe('probability');
            expect(signal.band).toBe('high');
            expect(signal.bandLabel).toBe('High confidence');
            expect(signal.recommendation).toBe('Merge');
            expect(signal.reasoning).toBe('Exact email match and normalized phone number match.');
            expect(signal.sourceAgentRunID).toBe('run-123');
            expect(signal.sourcePromptRunID).toBe('prompt-456');
            expect(signal.canAct).toBe(true);
            expect(signal.gateReason).toBeNull();
        });
    });

    describe('FromContentItemTag', () => {
        it('maps content autotagging weight into a probability signal using 0.90 high threshold default', () => {
            const signal = FromContentItemTag({
                Weight: 0.85,
                Tag: 'Enterprise Security',
                Reasoning: 'Mentions KMS rotation and envelope encryption.',
                AIPromptRunID: 'prompt-789',
            });

            expect(signal.confidence).toBe(0.85);
            expect(signal.scale).toBe('probability');
            expect(signal.band).toBe('medium'); // 0.85 < 0.90 default high threshold for content tagging
            expect(signal.recommendation).toBe('Enterprise Security');
            expect(signal.sourcePromptRunID).toBe('prompt-789');
        });
    });

    describe('FromTrustVerdict', () => {
        it('preserves categorical grade (Excellent/Good/Fair/Poor) with scale: grade and confidence: null', () => {
            const signal = FromTrustVerdict({
                grade: 'Good',
                score01: 0.82,
                oneLiner: 'Right about 8 out of 10 times.',
                explanation: 'Validated on held-out historical cohort.',
                canAct: true,
                gateReason: null,
                unknown: false,
            });

            expect(signal.scale).toBe('grade');
            expect(signal.rawScale).toBe('Good');
            expect(signal.confidence).toBeNull();
            expect(signal.band).toBe('high');
            expect(signal.bandLabel).toBe('Model reliability: Good');
            expect(signal.gradeDots).toBe(4);
            expect(signal.headline).toBe('Right about 8 out of 10 times.');
            expect(signal.canAct).toBe(true);
        });

        it('maps unmeasured trust verdicts (unknown: true) to unknown band and locks downstream action', () => {
            const signal = FromTrustVerdict({
                grade: 'Poor',
                oneLiner: 'Not yet evaluated.',
                explanation: 'No held-out validation metrics exist for this model version.',
                canAct: false,
                gateReason: 'Run a validation pass before enabling automated actions.',
                unknown: true,
            });

            expect(signal.scale).toBe('grade');
            expect(signal.rawScale).toBeNull();
            expect(signal.confidence).toBeNull();
            expect(signal.band).toBe('unknown');
            expect(signal.bandLabel).toBe('Model reliability: Unmeasured');
            expect(signal.gradeDots).toBe(0);
            expect(signal.canAct).toBe(false);
            expect(signal.gateReason).toBe('Run a validation pass before enabling automated actions.');
        });
    });
});
