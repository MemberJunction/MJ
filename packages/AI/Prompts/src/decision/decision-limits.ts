/**
 * @fileoverview Pure helpers that fit a decision request to a model's declared limits
 * (`ModelConfiguration.Decision`): splitting a request with more questions than one call may carry,
 * refusing one over the other limits before the call, and merging split results back into one.
 *
 * Kept free of the runner so each rule is unit-tested on its own.
 *
 * @module @memberjunction/ai-prompts
 */

import {
    AIErrorType,
    DecisionConfigurationSettings,
    DecisionMedia,
    DecisionQuestion,
    DecisionResult,
    ModelUsage,
} from '@memberjunction/ai';

/**
 * The timeout of a decision call when neither the caller nor the prompt sets one. Native decision
 * models answer in well under a second and `LLM Decision` in a few seconds, so a minute only ever
 * cuts off a stalled provider, and the failover loop then tries the next model.
 */
export const DEFAULT_DECISION_TIMEOUT_MS = 60_000;

/**
 * Characters per token used to estimate a request's size against `MaxStateTokens`. The runner has no
 * tokenizer for decision models, so this is the usual English approximation: an estimate that only
 * catches requests clearly too large. One that slips under it and is too large after all fails at the
 * provider, which also allows failover.
 */
export const DECISION_CHARS_PER_TOKEN = 4;

/** Why a request cannot go to a model, and how the failover loop should read it. */
export interface DecisionLimitError {
    Message: string;
    ErrorType: AIErrorType;
}

/**
 * Splits the questions into chunks of at most `maxQuestionsPerCall`, in their original order. Returns
 * one chunk holding them all when there is no positive limit or the request fits.
 *
 * @param questions The questions, by key.
 * @param maxQuestionsPerCall The model's `MaxQuestionsPerCall`, when declared.
 */
export function SplitDecisionQuestions(
    questions: Record<string, DecisionQuestion>,
    maxQuestionsPerCall: number | null | undefined
): Record<string, DecisionQuestion>[] {
    const entries = Object.entries(questions);
    const size = typeof maxQuestionsPerCall === 'number' && Number.isFinite(maxQuestionsPerCall) ? Math.floor(maxQuestionsPerCall) : 0;
    if (size <= 0 || entries.length <= size) {
        return [questions];
    }
    const chunks: Record<string, DecisionQuestion>[] = [];
    for (let i = 0; i < entries.length; i += size) {
        chunks.push(Object.fromEntries(entries.slice(i, i + size)));
    }
    return chunks;
}

/**
 * The estimated token count of the state plus the largest chunk of questions that one call to this
 * model would carry: the state goes with every chunk.
 *
 * @param state The state, as text or an object.
 * @param questions The questions, by key.
 * @param maxQuestionsPerCall The model's `MaxQuestionsPerCall`, when declared.
 */
export function EstimateDecisionCallTokens(
    state: string | Record<string, unknown>,
    questions: Record<string, DecisionQuestion>,
    maxQuestionsPerCall?: number | null
): number {
    const stateChars = (typeof state === 'string' ? state : JSON.stringify(state) ?? '').length;
    const largestChunkChars = SplitDecisionQuestions(questions, maxQuestionsPerCall)
        .reduce((max, chunk) => Math.max(max, JSON.stringify(chunk).length), 0);
    return Math.ceil((stateChars + largestChunkChars) / DECISION_CHARS_PER_TOKEN);
}

/**
 * Checks a request against the model's declared limits, or returns undefined when it fits. More
 * questions than `MaxQuestionsPerCall` is not a breach: the runner splits the request. A breach allows
 * failover, because another model may accept the request.
 *
 * @param modelName The model's name, for the message.
 * @param limits The model's declared `Decision` settings, when any.
 * @param state The state, as text or an object.
 * @param questions The questions, by key.
 */
export function CheckDecisionLimits(
    modelName: string,
    limits: DecisionConfigurationSettings | null | undefined,
    state: string | Record<string, unknown>,
    questions: Record<string, DecisionQuestion>
): DecisionLimitError | undefined {
    if (!limits) {
        return undefined;
    }
    for (const [key, q] of Object.entries(questions)) {
        if (q.Kind === 'Choice' && exceeds(limits.MaxChoiceOptions, q.Options.length)) {
            return { ErrorType: 'InvalidRequest', Message: `Choice '${key}' has ${q.Options.length} options, over the limit of ${limits.MaxChoiceOptions} for '${modelName}'` };
        }
        if (q.Kind === 'Score' && exceeds(limits.MaxScoreLevels, q.Levels.length)) {
            return { ErrorType: 'InvalidRequest', Message: `Score '${key}' has ${q.Levels.length} levels, over the limit of ${limits.MaxScoreLevels} for '${modelName}'` };
        }
    }
    const tokens = EstimateDecisionCallTokens(state, questions, limits.MaxQuestionsPerCall);
    if (exceeds(limits.MaxStateTokens, tokens)) {
        return {
            ErrorType: 'ContextLengthExceeded',
            Message: `The state and questions come to about ${tokens} tokens per call, over the limit of ${limits.MaxStateTokens} for '${modelName}'`,
        };
    }
    return undefined;
}

/**
 * Merges the results of a split request into one successful result: every chunk's answers, the summed
 * token usage and cost, and the first chunk's resolved model. Every result must be a success; the
 * runner returns the first failed chunk instead of merging.
 *
 * @param results The chunk results, in chunk order. At least one.
 */
export function MergeChunkedDecisionResults(results: DecisionResult[]): DecisionResult {
    const first = results[0];
    const last = results[results.length - 1];
    const merged = new DecisionResult(true, first.startTime, last.endTime);
    for (const result of results) {
        Object.assign(merged.Answers, result.Answers);
    }
    merged.Usage = sumUsage(results);
    merged.ResolvedModel = results.find(r => r.ResolvedModel)?.ResolvedModel;
    return merged;
}

/** The chunks' usage, summed. The cost is summed only when every chunk reported one. */
function sumUsage(results: DecisionResult[]): ModelUsage | undefined {
    const usages = results.map(r => r.Usage).filter((u): u is ModelUsage => u !== undefined);
    if (usages.length === 0) {
        return undefined;
    }
    const promptTokens = usages.reduce((total, u) => total + (u.promptTokens ?? 0), 0);
    const completionTokens = usages.reduce((total, u) => total + (u.completionTokens ?? 0), 0);
    const everyCost = usages.length === results.length && usages.every(u => typeof u.cost === 'number');
    const cost = everyCost ? usages.reduce((total, u) => total + (u.cost ?? 0), 0) : undefined;
    return new ModelUsage(promptTokens, completionTokens, cost, usages.find(u => u.costCurrency)?.costCurrency);
}

/** Whether a declared positive limit is exceeded. */
function exceeds(limit: number | null | undefined, count: number): boolean {
    return typeof limit === 'number' && limit > 0 && count > limit;
}

/**
 * What a decision run row records about the request's media: each item's type, MIME type, and its URI
 * or the size of its data, never the data itself, which can be megabytes of base64. An empty object
 * when there is no media, so the row's `Messages` keeps its old shape.
 *
 * @param media The request's media.
 */
export function DescribeDecisionMediaForRun(
    media: readonly DecisionMedia[] | null | undefined
): { Media?: Array<{ Type: string; MimeType: string; URI?: string; DataBase64Length?: number }> } {
    if (!media || media.length === 0) {
        return {};
    }
    return {
        Media: media.map(m => ({
            Type: m.Type,
            MimeType: m.MimeType,
            ...(m.URI ? { URI: m.URI } : {}),
            ...(m.Data ? { DataBase64Length: m.Data.length } : {}),
        })),
    };
}
