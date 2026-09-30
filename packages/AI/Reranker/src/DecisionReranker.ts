/**
 * @fileoverview Reranker that scores each document with a typed decision.
 *
 * Asks one Likelihood question per document through `AIDecisionRunner`, with the query as the state,
 * and uses each answer's probability as the document's relevance score.
 *
 * @module @memberjunction/ai-reranker
 */

import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseReranker } from '@memberjunction/ai';
import type { DecisionAnswer, DecisionQuestion, RerankDocument, RerankParams, RerankResult } from '@memberjunction/ai';
import { LogStatus, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionParams, AIDecisionRunner } from '@memberjunction/ai-prompts';
import type { AIDecisionRunResult, ModelVendorCandidate } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BasePromptBackedReranker } from './BasePromptBackedReranker';

/** The decision prompt the reranker asks when it is given no prompt ID. */
const DEFAULT_DECISION_PROMPT_NAME = 'Default Decision';

/** Each document's question is this statement followed by the document's text. */
const QUESTION_STATEMENT = 'This note bears on the request: ';

/**
 * How long a rerank's decision calls may take, all together, in milliseconds, unless the caller sets
 * `DecisionRerankOptions.TimeoutMS`. Memory injection waits for the rerank before an agent's first
 * prompt, so the budget is short, but it leaves room for a chat-model fallback such as `LLM Decision`
 * to answer a full batch.
 */
export const DEFAULT_DECISION_RERANK_TIMEOUT_MS = 15_000;

/**
 * Settings a caller can give one `DecisionReranker` rerank, in `RerankParams.options`. Other rerankers
 * ignore them. `RerankerService` fills them from the agent's `RerankerConfiguration`. A setting that is
 * not a positive number is ignored, and its default applies.
 *
 * A type rather than an interface, so that it is assignable to `RerankParams.options`.
 */
export type DecisionRerankOptions = {
    /**
     * The time budget for the rerank's decision calls, all together, in milliseconds. When it runs out
     * the calls are aborted and the rerank fails. Default: {@link DEFAULT_DECISION_RERANK_TIMEOUT_MS}.
     */
    TimeoutMS?: number;
};

/**
 * The decision runner the reranker calls. It adds one thing to `AIDecisionRunner`: the per-call
 * question limit of the models a decision prompt can run on.
 */
class DecisionRerankRunner extends AIDecisionRunner {
    /**
     * The smallest `MaxQuestionsPerCall` that any model the prompt can run on declares in its effective
     * model configuration. The smallest keeps every call within the limit of whichever model answers
     * it, failover included.
     *
     * @param prompt - The decision prompt
     * @returns The limit, or undefined when no candidate declares one, or when the prompt has no
     * candidates (the decision call then reports why)
     */
    public GetMaxQuestionsPerCall(prompt: MJAIPromptEntityExtended): number | undefined {
        const limits = this.candidatesFor(prompt)
            .map(candidate => this.maxQuestionsPerCallOf(candidate))
            .filter((limit): limit is number => limit !== undefined);
        return limits.length > 0 ? Math.min(...limits) : undefined;
    }

    /** The prompt's model candidates, or none when the base cannot build any. */
    private candidatesFor(prompt: MJAIPromptEntityExtended): ModelVendorCandidate[] {
        try {
            return this.BuildModelVendorCandidates(prompt);
        } catch {
            return [];
        }
    }

    /**
     * A candidate's `Decision.MaxQuestionsPerCall`, merged from its model type, model and model-vendor
     * row the way `AIDecisionRunner` reads it when it checks a call.
     */
    private maxQuestionsPerCallOf(candidate: ModelVendorCandidate): number | undefined {
        const modelVendorRow = candidate.vendorId
            ? (candidate.model.ModelVendors ?? []).find(mv => UUIDsEqual(mv.VendorID, candidate.vendorId))
            : undefined;
        const limit = AIEngine.Instance.GetEffectiveModelConfiguration(candidate.model.ID, modelVendorRow?.ID)?.Decision?.MaxQuestionsPerCall;
        return typeof limit === 'number' && limit >= 1 ? Math.floor(limit) : undefined;
    }
}

/**
 * Decision-based implementation of the BaseReranker class. It makes one `AIDecisionRunner` call: the
 * query is the state, and each document is one Likelihood question ("This note bears on the request:
 * <document text>"). A document's relevance score is the probability.
 *
 * Every call writes an `MJ: AI Prompt Runs` row through the decision runner, which also selects the
 * decision model, resolves its credentials and fails over. When the reranker is given a parent run
 * (`ParentPromptRunID`, which `AIRerankerRunner` sets), those rows are its children, and a rerank's
 * response carries their tokens and cost as `Usage`.
 *
 * Configuration:
 * - The decision prompt is the one whose ID the reranker is given, or `Default Decision` when it is
 *   given none. It receives that ID the same way `LLMReranker` receives its prompt's.
 * - It needs no API key: the decision runner resolves its own models' keys.
 * - When there are more documents than the smallest `MaxQuestionsPerCall` among the prompt's models,
 *   they are split across parallel calls.
 * - The decision calls share one time budget, `DecisionRerankOptions.TimeoutMS` in the rerank's
 *   `options`, or {@link DEFAULT_DECISION_RERANK_TIMEOUT_MS}.
 *
 * A failed decision call, an answer missing for any document, or a budget that runs out fails the
 * whole rerank. No score is ever invented.
 *
 * The scores are Likelihood probabilities, which are not calibrated, so a low
 * `RerankerConfiguration.minRelevanceThreshold` suits this reranker: 0.1 is the recommended start.
 *
 * Usage:
 * ```typescript
 * const reranker = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>(
 *     BaseReranker,
 *     'DecisionReranker',
 *     '', // No API key needed
 *     '', // No model name needed
 *     decisionPromptID, // or '' for Default Decision
 *     contextUser
 * );
 * const response = await reranker.Rerank({ query, documents });
 * ```
 */
@RegisterClass(BaseReranker, 'DecisionReranker')
export class DecisionReranker extends BasePromptBackedReranker {
    private _promptID: string;
    private _contextUser: UserInfo;

    /**
     * Create a new DecisionReranker instance.
     * @param apiKey - Not used, pass an empty string
     * @param modelName - The reranker model's API name, for logging only
     * @param promptID - ID of the decision prompt to ask, or an empty string for `Default Decision`
     * @param contextUser - User context for the decision calls
     */
    constructor(apiKey: string, modelName: string, promptID: string, contextUser: UserInfo) {
        super(apiKey, modelName || 'Decision');
        this._promptID = promptID;
        this._contextUser = contextUser;
    }

    /**
     * The ID of the decision prompt the reranker asks. Empty when it asks `Default Decision`.
     */
    public get PromptID(): string {
        return this._promptID;
    }

    /**
     * Scores every document with one Likelihood question, splitting the questions across parallel
     * calls when there are more than one call may carry. Records the usage of every call, the failed
     * ones included, before it fails on any of them.
     */
    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const prompt = this.resolvePrompt();
        const runner = new DecisionRerankRunner();
        const batches = this.splitIntoBatches(params.documents, runner.GetMaxQuestionsPerCall(prompt));
        LogStatus(`DecisionReranker: Scoring ${params.documents.length} documents in ${batches.length} decision call(s)`);
        const timeoutMS = this.positiveOption(params, 'TimeoutMS') ?? DEFAULT_DECISION_RERANK_TIMEOUT_MS;
        const results = await this.askWithinBudget(runner, prompt, params.query, batches, timeoutMS);
        // The decision runner saves its runs fire-and-forget, and the server prices a run when it saves
        // it. Wait for the saves, so UsageOf can read each run's cost, and so each save's cost rollup to
        // the parent run lands before the parent run is finalized.
        await runner.WaitForPendingPromptRunSaves();
        this.RecordUsage(params, this.CombinedUsage(results.map(result => this.UsageOf(result))));
        const scored = batches.flatMap((batch, index) => this.scoreBatch(batch, results[index]));
        return this.sortByRelevance(scored);
    }

    /** The decision prompt with the configured ID, or `Default Decision` when none is configured. */
    private resolvePrompt(): MJAIPromptEntityExtended {
        const prompts = AIEngine.Instance.Prompts;
        if (this._promptID) {
            const configured = prompts.find(p => UUIDsEqual(p.ID, this._promptID));
            if (!configured) {
                throw new Error(`DecisionReranker: Decision prompt not found with ID: ${this._promptID}`);
            }
            return configured;
        }
        const target = DEFAULT_DECISION_PROMPT_NAME.toLowerCase();
        const fallback = prompts.find(p => p.Name?.trim().toLowerCase() === target);
        if (!fallback) {
            throw new Error(`DecisionReranker: The '${DEFAULT_DECISION_PROMPT_NAME}' prompt was not found`);
        }
        return fallback;
    }

    /** A setting the caller gave in `params.options`, when it is a positive number. */
    private positiveOption(params: RerankParams, key: keyof DecisionRerankOptions): number | undefined {
        const value = params.options?.[key];
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    }

    /**
     * Asks every batch's decision call in parallel, within one time budget. When the budget runs out
     * it aborts the calls, through the cancellation token they share (the decision runner hands it to
     * each driver call, failover included), and throws, so the rerank fails like any other error and
     * the caller falls back. It does not wait for the aborted calls; their runs are still recorded.
     */
    private async askWithinBudget(
        runner: DecisionRerankRunner,
        prompt: MJAIPromptEntityExtended,
        query: string,
        batches: RerankDocument[][],
        timeoutMS: number
    ): Promise<AIDecisionRunResult[]> {
        const budget = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                const error = new Error(`DecisionReranker: The decision calls did not finish within ${timeoutMS} ms`);
                budget.abort(error);
                reject(error);
            }, timeoutMS);
        });
        const calls = Promise.all(batches.map(batch => runner.ExecuteDecision(this.buildDecisionParams(prompt, query, batch, budget.signal))));
        try {
            return await Promise.race([calls, expired]);
        } finally {
            clearTimeout(timer);
        }
    }

    /** Splits the documents into batches of at most `limit`, or one batch when there is no limit. */
    private splitIntoBatches(documents: RerankDocument[], limit: number | undefined): RerankDocument[][] {
        if (limit === undefined || documents.length <= limit) {
            return [documents];
        }
        const batches: RerankDocument[][] = [];
        for (let start = 0; start < documents.length; start += limit) {
            batches.push(documents.slice(start, start + limit));
        }
        return batches;
    }

    /** Scores a batch's documents by their answers' probabilities, or throws when its decision call failed. */
    private scoreBatch(documents: RerankDocument[], result: AIDecisionRunResult): RerankResult[] {
        if (!result.success) {
            throw new Error(`DecisionReranker: Decision call failed: ${result.errorMessage || 'Unknown error'}`);
        }
        return documents.map((document, index) => this.toRerankResult(document, result.Answers[this.questionKey(index)]));
    }

    /**
     * The decision call for a batch: the query as the state, one Likelihood question per document, and
     * the rerank's shared cancellation token.
     */
    private buildDecisionParams(
        prompt: MJAIPromptEntityExtended,
        query: string,
        documents: RerankDocument[],
        cancellationToken: AbortSignal
    ): AIDecisionParams {
        const questions: Record<string, DecisionQuestion> = {};
        documents.forEach((document, index) => {
            questions[this.questionKey(index)] = { Kind: 'Likelihood', Instructions: `${QUESTION_STATEMENT}${document.text}` };
        });
        const decisionParams = new AIDecisionParams();
        decisionParams.prompt = prompt;
        decisionParams.contextUser = this._contextUser;
        decisionParams.State = query;
        decisionParams.Questions = questions;
        decisionParams.cancellationToken = cancellationToken;
        if (this.ParentPromptRunID) {
            decisionParams.parentPromptRunId = this.ParentPromptRunID;
        }
        return decisionParams;
    }

    /** The key of a document's question within its batch. Keys are labels for code; the model never reads them. */
    private questionKey(index: number): string {
        return `document_${index}`;
    }

    /** Scores a document by its answer's probability, or throws when there is no valid answer for it. */
    private toRerankResult(document: RerankDocument, answer: DecisionAnswer | undefined): RerankResult {
        if (answer?.Kind !== 'Likelihood' || !Number.isFinite(answer.Probability) || answer.Probability < 0 || answer.Probability > 1) {
            throw new Error(`DecisionReranker: No valid Likelihood answer for document ${document.id}`);
        }
        return {
            id: document.id,
            relevanceScore: answer.Probability,
            document,
            rank: 0 // Set by BaseReranker
        };
    }
}
