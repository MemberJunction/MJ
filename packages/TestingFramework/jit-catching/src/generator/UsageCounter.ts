/** Usage fields of one Anthropic API message as the Agent SDK reports them. */
export interface ApiUsage { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; }
/** Dollars per million tokens. */
export interface Price { Input: number; Output: number; CachedInput: number; }

/** Host-side token count for one agent session. Each API message id counts once; cache tokens count as input. */
export class UsageCounter {
    private readonly seen = new Set<string>();
    /** Uncached input plus cache-creation tokens. */
    public InputTokens = 0;
    public CacheReadTokens = 0;
    public OutputTokens = 0;

    public Add(messageId: string, u: ApiUsage | undefined): void {
        if (this.seen.has(messageId)) return;
        this.seen.add(messageId);
        this.InputTokens += (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
        this.CacheReadTokens += u?.cache_read_input_tokens ?? 0;
        this.OutputTokens += u?.output_tokens ?? 0;
    }

    /** Distinct API messages seen. */
    public get Turns(): number { return this.seen.size; }

    /** Tokens checked against the session budget. Output counts here run low; the `result` message has the exact figure. */
    public get BudgetTokens(): number { return this.InputTokens + this.CacheReadTokens + this.OutputTokens; }

    /** Dollar estimate from prices per million tokens; used when an aborted session has no `result` message. */
    public EstimateCostUSD(price: Price | null): number {
        if (!price) return 0;
        return (this.InputTokens * price.Input + this.CacheReadTokens * price.CachedInput + this.OutputTokens * price.Output) / 1_000_000;
    }
}
