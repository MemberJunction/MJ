import type { ModelUsage } from '@memberjunction/ai';
import type { TokenUsage } from '../types';

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
        return costUSD(this.InputTokens, this.CacheReadTokens, this.OutputTokens, price);
    }

    /** The count so far as the usage of `model`, with the estimated cost. */
    public ToUsage(model: string, price: Price | null): TokenUsage {
        return { Model: model, InputTokens: this.InputTokens, OutputTokens: this.OutputTokens, CacheReadTokens: this.CacheReadTokens, CostUSD: this.EstimateCostUSD(price) };
    }
}

/** Cost in dollars of a token count at a price per million tokens; 0 without a price. */
function costUSD(inputTokens: number, cacheReadTokens: number, outputTokens: number, price: Price | null): number {
    if (!price) return 0;
    return (inputTokens * price.Input + cacheReadTokens * price.CachedInput + outputTokens * price.Output) / 1_000_000;
}

/**
 * Token usage of one MJ provider call: uncached plus cache-write input as `InputTokens`, cache reads apart, and the
 * cost from `price`. A call without usage counts as zero tokens.
 */
export function UsageFromChat(model: string, u: ModelUsage | undefined, price: Price | null): TokenUsage {
    const input = (u?.promptTokens ?? 0) + (u?.cacheWriteTokens ?? 0); const cached = u?.cacheReadTokens ?? 0; const output = u?.completionTokens ?? 0;
    return { Model: model, InputTokens: input, OutputTokens: output, CacheReadTokens: cached, CostUSD: costUSD(input, cached, output, price) };
}

/** Sum of two usages, under the model of the first. */
export function AddUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
    return { Model: a.Model, InputTokens: a.InputTokens + b.InputTokens, OutputTokens: a.OutputTokens + b.OutputTokens, CacheReadTokens: a.CacheReadTokens + b.CacheReadTokens, CostUSD: a.CostUSD + b.CostUSD };
}

/** Zero usage for `model`. */
export function NoUsage(model: string): TokenUsage { return { Model: model, InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 }; }

/** A generation session that failed after it spent tokens; `Usage` is the host count up to the failure. */
export class SessionError extends Error {
    constructor(message: string, public readonly Usage: TokenUsage) { super(message); this.name = 'SessionError'; }
}
