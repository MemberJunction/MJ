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
    MaxNewTagsPerRun?: number | null;
    MaxNewTagsPerItem?: number | null;
    MaxTokensPerRun?: number | null;
    MaxCostPerRun?: number | null;
}

export type RunBudgetReason =
    | 'MaxNewTagsPerRunExceeded'
    | 'MaxTokensPerRunExceeded'
    | 'MaxCostPerRunExceeded';

export interface RunBudgetCheckResult {
    ok: boolean;
    reason?: RunBudgetReason;
    details?: string;
}

export class RunBudget {
    private tagsCreatedThisRun = 0;
    private tagsCreatedThisItem = 0;
    private tokensUsedThisRun = 0;
    private costThisRun = 0;

    public constructor(private readonly limits: RunBudgetLimits) {}

    /** Reset per-item counter; called at the top of each ContentItem. */
    public startItem(): void {
        this.tagsCreatedThisItem = 0;
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
     * stable order (tags → tokens → cost).
     */
    public checkBudgets(): RunBudgetCheckResult {
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

    public snapshot(): { tagsRun: number; tagsItem: number; tokens: number; cost: number } {
        return {
            tagsRun: this.tagsCreatedThisRun,
            tagsItem: this.tagsCreatedThisItem,
            tokens: this.tokensUsedThisRun,
            cost: this.costThisRun,
        };
    }
}
