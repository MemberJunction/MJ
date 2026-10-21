/**
 * @fileoverview Shared AI Confidence & Explainability Disclosure contract (`AIConfidenceSignal`)
 * and pure adapters for MemberJunction's AI-driven surfaces (Duplicate Detection, Content
 * Autotagging, Predictive Studio, and general prompt/agent outputs).
 *
 * Designed as a shared TypeScript contract rather than a database table so existing subsystems
 * keep their native persistence columns (`MJDuplicateRunDetailMatch.LLMConfidence`,
 * `MJContentItemTag.Weight`, `TrustVerdict.grade`) while presenting a uniform, plain-language
 * confidence and rationale contract to UI components (`<mj-ai-confidence-badge>`,
 * `<mj-ai-explanation-panel>`).
 *
 * Key design rule: model-level validation grades (`scale === 'grade'`, e.g. Predictive Studio's
 * `TrustGrade`) are NEVER lossily converted into a fabricated per-inference probability percentage.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * The measurement scale of an {@link AIConfidenceSignal}:
 * - `'probability'`: per-inference certainty in `[0, 1]` (e.g., Duplicate Detection `LLMConfidence`, Content Autotagging `Weight`)
 * - `'grade'`: model-level validation quality band (`'Excellent' | 'Good' | 'Fair' | 'Poor'`, e.g., Predictive Studio `TrustGrade`)
 * - `'ordinal'`: qualitative confidence band (`'high' | 'medium' | 'low' | 'unknown'`) without a numeric score
 */
export type AIConfidenceScale = 'probability' | 'grade' | 'ordinal';

/**
 * Plain-language confidence band used for visual styling and non-technical user guidance.
 */
export type AIConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Standardized reliability grades used when `scale === 'grade'`.
 */
export type AIConfidenceGrade = 'Excellent' | 'Good' | 'Fair' | 'Poor';

/**
 * Configurable thresholds for mapping a `[0, 1]` probability onto an {@link AIConfidenceBand}.
 */
export interface AIConfidenceBandThresholds {
    /** Minimum score (inclusive) for `'high'` confidence. Defaults to `0.85`. */
    high?: number;
    /** Minimum score (inclusive) for `'medium'` confidence. Defaults to `0.60`. */
    medium?: number;
}

/**
 * Unified confidence and explainability signal consumed by shared disclosure UI components
 * (`<mj-ai-confidence-badge>` and `<mj-ai-explanation-panel>`).
 */
export interface AIConfidenceSignal {
    /** Measurement scale (`'probability'`, `'grade'`, or `'ordinal'`). */
    scale: AIConfidenceScale;
    /**
     * Normalized confidence score in `[0, 1]` when `scale === 'probability'`, or `null` when
     * unknown or when `scale === 'grade'` / `'ordinal'`.
     */
    confidence: number | null;
    /** Plain-language confidence band (`'high' | 'medium' | 'low' | 'unknown'`). */
    band: AIConfidenceBand;
    /**
     * Plain-language label always shown alongside any numeric indicator so users never see
     * a bare, unexplained percentage (e.g. `'High confidence'`, `'Review recommended'`,
     * `'Low confidence'`, `'Model reliability: Good'`).
     */
    bandLabel: string;
    /**
     * Original raw scale value preserved when `scale === 'grade'` or `'ordinal'`
     * (e.g., `'Excellent'`, `'Good'`, `'Fair'`, `'Poor'`).
     */
    rawScale?: string | null;
    /**
     * Optional 1–5 dot count for compact visual meters when `scale === 'grade'`.
     */
    gradeDots?: number | null;
    /** Optional action or decision recommendation (e.g., `'Merge'`, `'NotDuplicate'`, `'Uncertain'`). */
    recommendation?: string | null;
    /** Plain-language explanation of why the AI reached this output or reliability grade. */
    reasoning: string;
    /** Optional short headline (e.g., `"Right about 8 out of 10 times."`). */
    headline?: string | null;
    /** Optional source `AIPromptRun` ID for provenance trace drill-through. */
    sourcePromptRunID?: string | null;
    /** Optional source `AIAgentRun` ID for provenance trace drill-through. */
    sourceAgentRunID?: string | null;
    /** Whether downstream actions are permitted (`false` when a Poor/unmeasured model locks action). */
    canAct?: boolean;
    /** Plain-language reason when `canAct === false`. */
    gateReason?: string | null;
}

/**
 * Structural input shape satisfied by Duplicate Detection's `DuplicateReasoningCandidateVerdict`
 * and `MJDuplicateRunDetailMatchEntity`.
 */
export interface DuplicateVerdictConfidenceInput {
    Recommendation?: string | null;
    Confidence?: number | null;
    Reasoning?: string | null;
    AIPromptRunID?: string | null;
    AIAgentRunID?: string | null;
    LLMRecommendation?: string | null;
    LLMConfidence?: number | null;
    LLMReasoning?: string | null;
    LLMPromptRunID?: string | null;
    LLMAgentRunID?: string | null;
}

/**
 * Structural input shape satisfied by Content Autotagging's `MJContentItemTagEntity`.
 */
export interface ContentTagConfidenceInput {
    Weight?: number | null;
    Reasoning?: string | null;
    Tag?: string | null;
    ItemID?: string | null;
    AIPromptRunID?: string | null;
    AIAgentRunID?: string | null;
}

/**
 * Structural input shape satisfied by Predictive Studio's `TrustVerdict`.
 */
export interface TrustVerdictConfidenceInput {
    grade: AIConfidenceGrade;
    score01?: number;
    oneLiner: string;
    explanation: string;
    canAct: boolean;
    gateReason: string | null;
    unknown: boolean;
}

/** Default probability threshold (inclusive) for `'high'` confidence. */
export const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.85;

/** Default probability threshold (inclusive) for `'medium'` confidence. */
export const DEFAULT_MEDIUM_CONFIDENCE_THRESHOLD = 0.60;

/**
 * Clamps a finite numeric score to `[0, 1]`, or returns `null` if the input is `null`,
 * `undefined`, or `NaN`.
 */
export function NormalizeProbabilityScore(score: number | null | undefined): number | null {
    if (score == null || !Number.isFinite(score)) {
        return null;
    }
    if (score < 0) return 0;
    if (score > 1) return 1;
    return score;
}

/**
 * Maps a `[0, 1]` probability score (or `null` / `undefined`) onto a plain-language
 * {@link AIConfidenceBand} and human-readable label.
 */
export function DeriveConfidenceBand(
    score: number | null | undefined,
    thresholds?: AIConfidenceBandThresholds
): { band: AIConfidenceBand; bandLabel: string } {
    const normalized = NormalizeProbabilityScore(score);
    if (normalized == null) {
        return {
            band: 'unknown',
            bandLabel: 'Confidence unavailable — review recommended'
        };
    }

    const highCeiling = thresholds?.high ?? DEFAULT_HIGH_CONFIDENCE_THRESHOLD;
    const mediumCeiling = thresholds?.medium ?? DEFAULT_MEDIUM_CONFIDENCE_THRESHOLD;

    if (normalized >= highCeiling) {
        return {
            band: 'high',
            bandLabel: 'High confidence'
        };
    }
    if (normalized >= mediumCeiling) {
        return {
            band: 'medium',
            bandLabel: 'Moderate confidence — review recommended'
        };
    }
    return {
        band: 'low',
        bandLabel: 'Low confidence — manual check required'
    };
}

/**
 * Adapts a Duplicate Detection candidate verdict (`DuplicateReasoningCandidateVerdict` or
 * `MJDuplicateRunDetailMatch` row) into a standardized {@link AIConfidenceSignal}.
 */
export function FromDuplicateVerdict(
    verdict: DuplicateVerdictConfidenceInput,
    options?: {
        thresholds?: AIConfidenceBandThresholds;
        promptRunID?: string | null;
        agentRunID?: string | null;
    }
): AIConfidenceSignal {
    const rawConfidence = verdict.Confidence !== undefined ? verdict.Confidence : verdict.LLMConfidence;
    const confidence = NormalizeProbabilityScore(rawConfidence);
    const recommendation = (verdict.Recommendation ?? verdict.LLMRecommendation ?? null) || null;
    const reasoning = (verdict.Reasoning ?? verdict.LLMReasoning ?? '').trim()
        || 'No rationale was recorded for this duplicate comparison.';
    const sourcePromptRunID = options?.promptRunID ?? verdict.AIPromptRunID ?? verdict.LLMPromptRunID ?? null;
    const sourceAgentRunID = options?.agentRunID ?? verdict.AIAgentRunID ?? verdict.LLMAgentRunID ?? null;

    const { band, bandLabel } = DeriveConfidenceBand(confidence, options?.thresholds);

    return {
        scale: 'probability',
        confidence,
        band,
        bandLabel,
        recommendation,
        reasoning,
        sourcePromptRunID,
        sourceAgentRunID,
        canAct: true,
        gateReason: null
    };
}

/**
 * Adapts a Content Autotagging item tag (`MJContentItemTag` row or tag result) into a
 * standardized {@link AIConfidenceSignal}.
 *
 * Defaults the high-confidence threshold to `0.90` to match Content Autotagging's historical
 * `HIGH_CONFIDENCE_THRESHOLD = 0.9`, while allowing callers to override via `thresholds`.
 */
export function FromContentItemTag(
    tag: ContentTagConfidenceInput,
    options?: {
        thresholds?: AIConfidenceBandThresholds;
    }
): AIConfidenceSignal {
    const confidence = NormalizeProbabilityScore(tag.Weight);
    const effectiveThresholds: AIConfidenceBandThresholds = {
        high: options?.thresholds?.high ?? 0.90,
        medium: options?.thresholds?.medium ?? DEFAULT_MEDIUM_CONFIDENCE_THRESHOLD
    };
    const { band, bandLabel } = DeriveConfidenceBand(confidence, effectiveThresholds);
    const reasoning = (tag.Reasoning ?? '').trim()
        || (tag.Tag ? `Tag "${tag.Tag}" was assigned without an explicit rationale.` : 'No tag rationale recorded.');

    return {
        scale: 'probability',
        confidence,
        band,
        bandLabel,
        recommendation: tag.Tag ?? null,
        reasoning,
        sourcePromptRunID: tag.AIPromptRunID ?? null,
        sourceAgentRunID: tag.AIAgentRunID ?? null,
        canAct: true,
        gateReason: null
    };
}

/**
 * Adapts a Predictive Studio `TrustVerdict` into a standardized {@link AIConfidenceSignal}.
 *
 * Preserves the banded `grade` (`'Excellent' | 'Good' | 'Fair' | 'Poor'`) on `rawScale` and
 * leaves `confidence: null` so model-level validation quality is never presented as a fake
 * per-record probability percentage.
 */
export function FromTrustVerdict(verdict: TrustVerdictConfidenceInput): AIConfidenceSignal {
    if (verdict.unknown) {
        return {
            scale: 'grade',
            confidence: null,
            band: 'unknown',
            bandLabel: 'Model reliability: Unmeasured',
            rawScale: null,
            gradeDots: 0,
            headline: verdict.oneLiner,
            reasoning: verdict.explanation,
            canAct: false,
            gateReason: verdict.gateReason
        };
    }

    const gradeToBand: Record<AIConfidenceGrade, AIConfidenceBand> = {
        Excellent: 'high',
        Good: 'high',
        Fair: 'medium',
        Poor: 'low'
    };
    const gradeToDots: Record<AIConfidenceGrade, number> = {
        Excellent: 5,
        Good: 4,
        Fair: 3,
        Poor: 1
    };

    return {
        scale: 'grade',
        confidence: null,
        band: gradeToBand[verdict.grade],
        bandLabel: `Model reliability: ${verdict.grade}`,
        rawScale: verdict.grade,
        gradeDots: gradeToDots[verdict.grade],
        headline: verdict.oneLiner,
        reasoning: verdict.explanation,
        canAct: verdict.canAct,
        gateReason: verdict.gateReason
    };
}
