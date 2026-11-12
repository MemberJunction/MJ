/**
 * @fileoverview The near-miss tag match asked as a decision: when a keyword's best semantic match
 * scores just under the match threshold (the suggestion band), one Likelihood asks whether the
 * keyword names the same concept as that tag.
 *
 * The existing path queues the keyword for review (`Reason = 'BelowThreshold'`) and tags nothing.
 * Through `RunDecisionUse` this use can:
 * - `Prompt`: only queue, as today. No decision is asked.
 * - `Shadow` (the default): queue as today; the decision runs beside it and its run records the
 *   probability it gave (`RunName = 'Shadow: tag-match'`). How reviewers then act on the queued
 *   suggestions labels those runs for the calibration fit.
 * - `Decision`: apply the tag when the **calibrated** probability is at or above
 *   {@link TAG_MATCH_DECISION_MIN_PROBABILITY}. Anything else, including an answer from a model with
 *   no calibration for this use, falls back to queuing. The decision can only turn a queued keyword
 *   into a match; it never removes a suggestion a reviewer would otherwise have seen.
 *
 * It applies in every taxonomy mode, constrained included: the band is reached before a mode's
 * no-match rule runs, and a match to an existing tag creates nothing.
 *
 * Kept apart from `TagEngine` so the question, state and reading rules are unit-tested on their own.
 *
 * @module @memberjunction/tag-engine
 */

import type { DecisionAnswer, LikelihoodQuestion } from '@memberjunction/ai';
import {
    CalibrateDecisionProbability,
    type DecisionAnsweringModel,
    type DecisionCalibrationKey,
    type DecisionCalibrationSource,
} from '@memberjunction/ai-core-plus';
import {
    ResolveDecisionUseMode,
    type AIDecisionRunResult,
    type DecisionUseMode,
    type ShadowDecisionComparison,
} from '@memberjunction/ai-prompts';

/** The decision use: names shadow runs and selects the calibration. */
export const TAG_MATCH_DECISION_USE = 'tag-match';

/** The Likelihood's question key, and the calibration's `Question`. */
export const TAG_MATCH_DECISION_QUESTION = 'same';

/** Which calibration the Likelihood reads. */
export const TAG_MATCH_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({
    Use: TAG_MATCH_DECISION_USE,
    Question: TAG_MATCH_DECISION_QUESTION,
});

/**
 * The least calibrated probability at which `Decision` mode applies the tag. High on purpose: a wrong
 * tag is applied silently, while a missed one only waits in the review queue it reaches today.
 */
export const TAG_MATCH_DECISION_MIN_PROBABILITY = 0.8;

/** The raw probability a shadow comparison reads as "the decision would apply it", until a calibration is fitted. */
export const TAG_MATCH_SHADOW_RAW_THRESHOLD = 0.5;

/** The mode used when nothing is configured: `Shadow`, until a calibration is fitted. */
export const TAG_MATCH_DEFAULT_DECISION_MODE: DecisionUseMode = 'Shadow';

/**
 * The decision call's timeout. Short, because tag resolution holds `TagEngine`'s mutex while it
 * waits: a slow answer falls back to queuing rather than stalling every other resolution.
 */
export const TAG_MATCH_DECISION_TIMEOUT_MS = 5_000;

let tagMatchDecisionMode: DecisionUseMode = TAG_MATCH_DEFAULT_DECISION_MODE;

/**
 * Sets how near-miss tag matches are answered. MJServer calls it at startup from
 * `decisions.tagMatch` in its config. A value that is not a mode (case-insensitive) restores the
 * default, `Shadow`.
 *
 * @param mode `Prompt`, `Shadow` or `Decision`.
 */
export function SetTagMatchDecisionMode(mode: unknown): void {
    tagMatchDecisionMode = ResolveDecisionUseMode(mode, TAG_MATCH_DEFAULT_DECISION_MODE);
}

/** How near-miss tag matches are answered now. */
export function GetTagMatchDecisionMode(): DecisionUseMode {
    return tagMatchDecisionMode;
}

/** What the decision is asked about: the keyword, and the tag it nearly matched. */
export interface TagMatchDecisionInput {
    /** The keyword or phrase the classifier produced. */
    Keyword: string;
    /** The tag's display name, or its name when it has none. */
    TagName: string;
    /** The tag's description, when it has one. */
    TagDescription: string | null;
    /** The tag's ancestors' names, root first, which disambiguate a short name ("Python" under "Animals"). */
    TagPath: string[];
    /** The text the keyword came from, when the caller has it. Trimmed to {@link TAG_MATCH_MAX_SOURCE_CHARS}. */
    SourceText?: string | null;
}

/** How much of the source text goes into the state. Enough to disambiguate, not the whole document. */
export const TAG_MATCH_MAX_SOURCE_CHARS = 600;

/**
 * The one Likelihood. It names the tag and quotes its description and path, since a native decision
 * driver may read the question apart from the state.
 *
 * @param input The keyword and its near-miss tag.
 */
export function BuildTagMatchQuestions(input: TagMatchDecisionInput): Record<string, LikelihoodQuestion> {
    const path = input.TagPath.length > 0 ? ` (under ${input.TagPath.join(' > ')})` : '';
    const description = input.TagDescription?.trim() ? `, described as "${input.TagDescription.trim()}"` : '';
    return {
        [TAG_MATCH_DECISION_QUESTION]: {
            Kind: 'Likelihood',
            Instructions:
                `The keyword "${input.Keyword}" names the same concept as the existing tag "${input.TagName}"${path}${description}, ` +
                `so tagging the content with that tag is correct.`,
        },
    };
}

/**
 * The state: the keyword, the tag, and the start of the source text when there is one.
 *
 * @param input The keyword and its near-miss tag.
 */
export function BuildTagMatchState(input: TagMatchDecisionInput): Record<string, unknown> {
    const state: Record<string, unknown> = {
        keyword: input.Keyword,
        tag: input.TagName,
        tagPath: input.TagPath.join(' > '),
    };
    if (input.TagDescription?.trim()) {
        state.tagDescription = input.TagDescription.trim();
    }
    const source = input.SourceText?.trim();
    if (source) {
        state.sourceText = source.length > TAG_MATCH_MAX_SOURCE_CHARS ? `${source.slice(0, TAG_MATCH_MAX_SOURCE_CHARS)}…` : source;
    }
    return state;
}

/** The decision's answer, raw and calibrated. */
export interface TagMatchDecisionVerdict {
    RawProbability: number | null;
    CalibratedProbability: number | null;
}

/** The model that answered a decision run, for calibration. */
export function TagMatchAnsweredBy(run: AIDecisionRunResult): DecisionAnsweringModel {
    return { ModelName: run.modelInfo?.modelName, ResolvedModel: run.DecisionResult?.ResolvedModel };
}

/**
 * The answer, raw and calibrated for the model that answered. A missing or non-Likelihood answer
 * reads as null.
 *
 * @param answers The decision's answers.
 * @param answeredBy The model that answered.
 * @param source Where the calibrations are declared, normally `AIEngine.Instance`.
 */
export function ReadTagMatchVerdict(
    answers: Record<string, DecisionAnswer>,
    answeredBy: DecisionAnsweringModel,
    source: DecisionCalibrationSource | null | undefined
): TagMatchDecisionVerdict {
    const answer = answers[TAG_MATCH_DECISION_QUESTION];
    const raw = answer?.Kind === 'Likelihood' && Number.isFinite(answer.Probability) ? answer.Probability : null;
    const calibrated = raw === null ? null : CalibrateDecisionProbability(source, TAG_MATCH_CALIBRATION_KEY, raw, answeredBy);
    return { RawProbability: raw, CalibratedProbability: calibrated };
}

/**
 * Whether `Decision` mode applies the tag: true only for a calibrated probability at or above
 * {@link TAG_MATCH_DECISION_MIN_PROBABILITY}. False otherwise, including an uncalibrated answer, so
 * the keyword is queued as it is today.
 *
 * @param verdict The decision's answer.
 */
export function TagMatchApplies(verdict: TagMatchDecisionVerdict): boolean {
    return verdict.CalibratedProbability !== null && verdict.CalibratedProbability >= TAG_MATCH_DECISION_MIN_PROBABILITY;
}

/**
 * How the decision compares with the existing path, for a shadow run. The existing path never
 * applies a near-miss tag, so "agreed" means the decision would not have applied it either, at a raw
 * {@link TAG_MATCH_SHADOW_RAW_THRESHOLD}. The real label comes later, from how a reviewer acts on the
 * queued suggestion; `Details` keeps what the fit needs to join them.
 *
 * @param input The keyword and its near-miss tag.
 * @param verdict The decision's answer.
 * @param tagID The near-miss tag's ID.
 * @param score The semantic similarity that put the keyword in the band.
 */
export function CompareTagMatchDecision(
    input: TagMatchDecisionInput,
    verdict: TagMatchDecisionVerdict,
    tagID: string,
    score: number
): ShadowDecisionComparison {
    const wouldApply = verdict.RawProbability !== null && verdict.RawProbability >= TAG_MATCH_SHADOW_RAW_THRESHOLD;
    const raw = verdict.RawProbability === null ? 'no answer' : verdict.RawProbability.toFixed(3);
    return {
        Agreed: !wouldApply,
        Summary: `"${input.Keyword}" vs tag "${input.TagName}" (similarity ${score.toFixed(3)}): decision ${raw}, ` +
            `${wouldApply ? 'would apply it' : 'would queue it'}; the existing path queued it`,
        Details: {
            Keyword: input.Keyword,
            TagID: tagID,
            TagName: input.TagName,
            SimilarityScore: score,
            RawProbability: verdict.RawProbability,
            CalibratedProbability: verdict.CalibratedProbability,
        },
    };
}
