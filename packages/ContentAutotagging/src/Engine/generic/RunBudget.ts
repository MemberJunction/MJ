/**
 * Tracks per-run resource consumption against the budget knobs in
 * `IContentSourceConfiguration` (MaxNewTagsPerRun, MaxNewTagsPerItem,
 * MaxTokensPerRun, MaxCostPerRun). Exposes a single `checkBudgets()` method
 * that the autotag engine calls after each batch; when a budget is exceeded
 * the engine pauses the run via the existing CancellationRequested machinery.
 *
 * Per-item counters reset at the start of each ContentItem; per-run counters
 * persist for the lifetime of the budget instance.
 */
export interface RunBudgetLimits {
    /**
     * Maximum number of content items the run may PROCESS before pausing.
     * "Process" means handed to the LLM tagging pipeline — does not include
     * items skipped by change-detection. Most intuitive "do at most N this
     * run, do the rest next time" knob. NULL/unset = unlimited.
     */
    MaxItemsPerRun?: number | null;
    MaxNewTagsPerRun?: number | null;
    MaxNewTagsPerItem?: number | null;
    MaxTokensPerRun?: number | null;
    MaxCostPerRun?: number | null;
}

export type RunBudgetReason =
    | 'MaxItemsPerRunExceeded'
    | 'MaxNewTagsPerRunExceeded'
    | 'MaxTokensPerRunExceeded'
    | 'MaxCostPerRunExceeded';

export interface RunBudgetCheckResult {
    ok: boolean;
    reason?: RunBudgetReason;
    details?: string;
}

export class RunBudget {
    private itemsProcessedThisRun = 0;
    private tagsCreatedThisRun = 0;
    private tagsCreatedThisItem = 0;
    private tokensUsedThisRun = 0;
    private costThisRun = 0;

    public constructor(private readonly limits: RunBudgetLimits) {}

    /** Reset per-item counter; called at the top of each ContentItem. */
    public startItem(): void {
        this.tagsCreatedThisItem = 0;
    }

    /**
     * Record N content items as processed this run. Called once per batch
     * from the engine's OnAfterBatch hook with the batch's contribution to
     * THIS budget (i.e., the subset of the batch belonging to the source
     * this budget tracks).
     */
    public recordItemsProcessed(n: number): void {
        if (Number.isFinite(n) && n > 0) this.itemsProcessedThisRun += n;
    }

    /** Record one auto-created tag. Increments both run and item counters. */
    public recordTagCreated(): void {
        this.tagsCreatedThisRun++;
        this.tagsCreatedThisItem++;
    }

    public recordTokens(n: number): void {
        if (Number.isFinite(n) && n > 0) this.tokensUsedThisRun += n;
    }

    public recordCost(c: number): void {
        if (Number.isFinite(c) && c > 0) this.costThisRun += c;
    }

    /** True if creating one more tag for the current item would exceed `MaxNewTagsPerItem`. */
    public itemTagBudgetExhausted(): boolean {
        if (this.limits.MaxNewTagsPerItem == null) return false;
        return this.tagsCreatedThisItem >= this.limits.MaxNewTagsPerItem;
    }

    /**
     * Check all run-level budgets. Returns the first one exceeded, in a
     * stable order (items → tags → tokens → cost). Items is checked first
     * because it's the most intuitive user-facing cap and "I asked for at
     * most 100 today" should win over the cost calculations that depend on
     * a specific model's pricing.
     */
    public checkBudgets(): RunBudgetCheckResult {
        if (this.limits.MaxItemsPerRun != null && this.itemsProcessedThisRun >= this.limits.MaxItemsPerRun) {
            return {
                ok: false,
                reason: 'MaxItemsPerRunExceeded',
                details: `Processed ${this.itemsProcessedThisRun}/${this.limits.MaxItemsPerRun} items this run.`,
            };
        }
        if (this.limits.MaxNewTagsPerRun != null && this.tagsCreatedThisRun >= this.limits.MaxNewTagsPerRun) {
            return {
                ok: false,
                reason: 'MaxNewTagsPerRunExceeded',
                details: `Created ${this.tagsCreatedThisRun}/${this.limits.MaxNewTagsPerRun} tags this run.`,
            };
        }
        if (this.limits.MaxTokensPerRun != null && this.tokensUsedThisRun >= this.limits.MaxTokensPerRun) {
            return {
                ok: false,
                reason: 'MaxTokensPerRunExceeded',
                details: `Used ${this.tokensUsedThisRun}/${this.limits.MaxTokensPerRun} tokens this run.`,
            };
        }
        if (this.limits.MaxCostPerRun != null && this.costThisRun >= this.limits.MaxCostPerRun) {
            return {
                ok: false,
                reason: 'MaxCostPerRunExceeded',
                details: `Spent $${this.costThisRun.toFixed(4)}/$${this.limits.MaxCostPerRun} this run.`,
            };
        }
        return { ok: true };
    }

    public snapshot(): { items: number; tagsRun: number; tagsItem: number; tokens: number; cost: number } {
        return {
            items: this.itemsProcessedThisRun,
            tagsRun: this.tagsCreatedThisRun,
            tagsItem: this.tagsCreatedThisItem,
            tokens: this.tokensUsedThisRun,
            cost: this.costThisRun,
        };
    }
}
