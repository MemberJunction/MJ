/**
 * @fileoverview Base class for the rerankers that run an MJ prompt: `LLMReranker` and `DecisionReranker`.
 *
 * @module @memberjunction/ai-reranker
 */

import { BaseReranker, ModelUsage } from '@memberjunction/ai';
import type { RerankParams, RerankResponse } from '@memberjunction/ai';
import type { AIModelRunResult } from '@memberjunction/ai-core-plus';

/** The prompt-run entity a model run result carries. */
type ModelRunPromptRun = NonNullable<AIModelRunResult['promptRun']>;

/**
 * A reranker that scores documents by running an MJ prompt, through `AIPromptRunner` or
 * `AIDecisionRunner`. It records its prompt runs under a parent run when it is given one, and a
 * rerank's response carries their tokens and cost as `Usage`, so the caller can book them.
 */
export abstract class BasePromptBackedReranker extends BaseReranker {
    /**
     * The `MJ: AI Prompt Runs` row this rerank is recorded under. When set, every prompt run the
     * reranker makes is created as its child (`ParentID`), so its cost rolls up to the rerank's run.
     * `AIRerankerRunner` sets it to its own run before it calls the driver.
     */
    public ParentPromptRunID?: string;

    /**
     * The usage of each rerank in flight, keyed by that call's params, from `doRerank` until `Rerank`
     * puts it on the response. Keyed per call, so concurrent reranks never mix costs.
     */
    private _usageByCall = new WeakMap<RerankParams, ModelUsage>();

    /**
     * Reranks through `BaseReranker.Rerank`, then puts the usage of the rerank's prompt runs on the
     * response as `Usage`. A failed response carries it too, because a failed call still cost a model
     * call. No `Usage` when no prompt ran.
     */
    public override async Rerank(params: RerankParams): Promise<RerankResponse> {
        const response = await super.Rerank(params);
        const usage = this._usageByCall.get(params);
        if (usage) {
            this._usageByCall.delete(params);
            response.Usage = usage;
        }
        return response;
    }

    /**
     * Records the usage of a rerank's prompt runs, for `Rerank` to put on the response. Record it
     * whenever a prompt ran, because a failed call still cost a model call.
     */
    protected RecordUsage(params: RerankParams, usage: ModelUsage): void {
        this._usageByCall.set(params, usage);
    }

    /**
     * The tokens and cost of one prompt run. The runner's reported cost wins when it has one.
     * Otherwise it is the run's saved cost, which the server computes when the run is saved:
     * `TotalCost`, else `Cost`. The cost is unset when neither is known, so call this after the
     * runner's pending saves.
     */
    protected UsageOf(result: AIModelRunResult): ModelUsage {
        const cost = this.resolveCost(result);
        return new ModelUsage(result.promptTokens ?? 0, result.completionTokens ?? 0, cost.cost, cost.currency);
    }

    /**
     * The usage of several prompt runs together: their tokens added up, and the sum of the costs that
     * are known, in the currency of the first run that has one. The cost is unset when no run's cost
     * is known.
     */
    protected CombinedUsage(usages: ModelUsage[]): ModelUsage {
        const priced = usages.filter(usage => usage.cost !== undefined);
        const cost = priced.length > 0 ? priced.reduce((sum, usage) => sum + (usage.cost ?? 0), 0) : undefined;
        return new ModelUsage(
            usages.reduce((sum, usage) => sum + usage.promptTokens, 0),
            usages.reduce((sum, usage) => sum + usage.completionTokens, 0),
            cost,
            priced.find(usage => usage.costCurrency !== undefined)?.costCurrency
        );
    }

    /** A prompt run's cost: the runner's reported cost, else the run's saved cost, else unset. */
    private resolveCost(result: AIModelRunResult): { cost?: number; currency?: string } {
        if (result.cost !== undefined) {
            return { cost: result.cost, currency: result.costCurrency };
        }
        const run = result.promptRun;
        const runCost = run ? this.savedRunCost(run) : undefined;
        if (runCost === undefined) {
            return { currency: result.costCurrency };
        }
        return { cost: runCost, currency: run?.CostCurrency ?? result.costCurrency };
    }

    /**
     * A saved run's cost: `TotalCost`, else `Cost`. The server writes `TotalCost = 0` for a run it
     * could not price, so `TotalCost` counts only when the run has a `Cost` or a `DescendantCost`.
     */
    private savedRunCost(run: ModelRunPromptRun): number | undefined {
        if (run.Cost == null && run.DescendantCost == null) {
            return undefined;
        }
        return run.TotalCost ?? run.Cost ?? undefined;
    }
}
