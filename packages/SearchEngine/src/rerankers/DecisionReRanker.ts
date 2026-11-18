/**
 * @fileoverview Decision-model re-ranker for SearchEngine scopes.
 *
 * Scores each candidate with a typed decision: one Likelihood per candidate ("this document bears on
 * the request"), asked through the `Default Decision` prompt (or a configured decision prompt) and its
 * failover chain. A decision call bills input tokens only, so it is a cheap way to rerank a scope
 * without a provider key of its own: it uses whichever decision models the prompt can run on.
 *
 * The scoring itself is the AI layer's `DecisionReranker` (registered by `@memberjunction/ai-reranker`,
 * which both server bootstraps load), resolved through the ClassFactory, so SearchEngine takes no
 * dependency on it. This file adds what scope search needs on top: the scope config mapping, the
 * relevance threshold, and per-search cost reporting from the decision runs' recorded usage.
 *
 * Opt-in per scope: `SearchScope.ScopeConfig.reRanker.driverClass = 'DecisionReRanker'`. No existing
 * scope's reranker changes.
 *
 * @module @memberjunction/search-engine
 */

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { BaseReranker as AIBaseReranker, RerankParams, RerankResult } from '@memberjunction/ai';
import { BaseReRanker } from '../generic/BaseReRanker';
import { SearchResultItem } from '../generic/search.types';

/** The AI-layer reranker this one resolves through the ClassFactory. */
export const DECISION_AI_RERANKER_KEY = 'DecisionReranker';

/**
 * The pre-call cost estimate per candidate, in cents: about 150 input tokens per question (the
 * candidate's title and snippet plus the shared query) at $0.10 per million input tokens. A decision
 * call bills input tokens only. The actual cost is reported after the call from the runs' usage.
 */
export const DECISION_RERANK_ESTIMATED_CENTS_PER_CANDIDATE = 0.0015;

/**
 * Wraps the AI layer's `DecisionReranker` for scope search: maps the scope config onto its options,
 * applies the threshold, and keeps the call's usage so the cost is reported only for real calls.
 */
class DecisionScopeAIReranker extends AIBaseReranker {
    public LastCallSucceeded = false;
    public LastCostCents: number | null = null;

    constructor(private readonly decision: AIBaseReranker) {
        super('', 'Decision');
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        this.LastCallSucceeded = false;
        this.LastCostCents = null;
        const config = params.options ?? {};
        const response = await this.decision.Rerank({ ...params, options: decisionOptions(config) });
        if (!response.success) {
            throw new Error(response.errorMessage ?? 'Decision rerank failed');
        }
        this.LastCallSucceeded = true;
        this.LastCostCents = usageCents(response.Usage?.cost, response.Usage?.costCurrency);
        return applyThreshold(response.results, config['minRelevanceThreshold']);
    }
}

/** Scope config as the AI-layer `DecisionReranker`'s `DecisionRerankOptions`. */
function decisionOptions(config: Record<string, unknown>): Record<string, unknown> {
    return {
        TimeoutMS: config['timeoutMS'],
        MaxDocumentsPerCall: config['maxDocumentsPerCall'],
    };
}

/** A run's cost in cents, when it is reported in US dollars. */
function usageCents(cost: number | undefined, currency: string | undefined): number | null {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) {
        return null;
    }
    return !currency || currency.toUpperCase() === 'USD' ? cost * 100 : null;
}

/**
 * Drops results below the threshold, unless none reaches it, in which case all are kept, as the
 * other scope rerankers do. The scores are uncalibrated Likelihoods, so keep the threshold low.
 */
function applyThreshold(results: RerankResult[], threshold: unknown): RerankResult[] {
    if (typeof threshold !== 'number') {
        return results;
    }
    const kept = results.filter(r => r.relevanceScore >= threshold);
    return kept.length > 0 ? kept : results;
}

/**
 * Decision-model re-ranker for SearchEngine. Configured per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'DecisionReRanker'`.
 *
 * Configuration keys in `ScopeConfig.reRanker.config`:
 * - `promptID`: the decision prompt to ask. Default: `Default Decision`.
 * - `timeoutMS`: the time budget for the decision calls, all together. Default: the AI layer's 15 s.
 * - `maxDocumentsPerCall`: candidates per decision call when no model the prompt runs on declares
 *   `Decision.MaxQuestionsPerCall`. Default: the AI layer's 20; larger lists split across parallel calls.
 * - `minRelevanceThreshold`: relevance cutoff (0.0-1.0). The scores are uncalibrated Likelihoods, so
 *   start low (0.1). Results below it are dropped, unless none reaches it.
 *
 * The decisions run as the searching user. A failed rerank falls back to the fused order, as every
 * scope reranker does.
 */
@RegisterClass(BaseReRanker, 'DecisionReRanker')
export class DecisionReRanker extends BaseReRanker {
    private currentAIReranker: DecisionScopeAIReranker | null = null;

    public get DriverClass(): string {
        return 'DecisionReRanker';
    }
    public override get Name(): string {
        return 'Decision Model';
    }
    public override get Version(): string {
        return '1';
    }

    /** Every candidate is one question, so the list is bounded to keep a rerank's calls few and fast. */
    public override GetMaxResultCount(): number {
        return 200;
    }

    /** See {@link DECISION_RERANK_ESTIMATED_CENTS_PER_CANDIDATE}. */
    public override EstimateCostCents(resultCount: number): number {
        return Math.max(1, resultCount) * DECISION_RERANK_ESTIMATED_CENTS_PER_CANDIDATE;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        contextUser: UserInfo,
    ): AIBaseReranker | null {
        if (this.currentAIReranker) return this.currentAIReranker;
        if (!contextUser) {
            LogError('DecisionReRanker: no user to run the decisions as; skipping the rerank.');
            return null;
        }
        const promptID = typeof config?.['promptID'] === 'string' ? config['promptID'] : '';
        const decision = MJGlobal.Instance.ClassFactory.TryCreateInstance<AIBaseReranker>(
            AIBaseReranker, DECISION_AI_RERANKER_KEY, '', '', promptID, contextUser
        );
        if (!decision.Resolved || !decision.Instance) {
            LogError(`DecisionReRanker: the "${DECISION_AI_RERANKER_KEY}" AI reranker is not registered (is @memberjunction/ai-reranker loaded?): ${decision.Reason}`);
            return null;
        }
        this.currentAIReranker = new DecisionScopeAIReranker(decision.Instance);
        return this.currentAIReranker;
    }

    /** Reports the decision runs' actual cost (else the estimate) after a successful rerank. */
    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        this.currentAIReranker = null;
        const aiReranker = this.getAIReranker(config, contextUser) as DecisionScopeAIReranker | null;
        try {
            if (!aiReranker) {
                return candidates.slice(0, topN);
            }
            const result = await super.ReRank(query, candidates, topN, contextUser, config);
            if (aiReranker.LastCallSucceeded) {
                this.reportCost(aiReranker.LastCostCents ?? this.EstimateCostCents(candidates.length));
            }
            return result;
        } finally {
            this.currentAIReranker = null;
        }
    }
}

/**
 * Tree-shake prevention helper. Call from a consumer's `public-api.ts` (or from a generated
 * registration manifest) to guarantee the `@RegisterClass` side-effect runs.
 */
export function LoadDecisionReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = DecisionReRanker;
}
