/**
 * Realtime `response.done` usage extraction — the one place that knows WHERE each OpenAI-protocol
 * provider puts its token counts.
 *
 * Deliberately dependency-free and in its own module (the same reasoning as
 * `transcriptContinuation.ts`): both the server-side driver and the browser realtime client need
 * it, and their unit tests mock `@memberjunction/ai` wholesale. Keeping this free of imports lets
 * those tests pull in the REAL implementation instead of restating the parsing rule in a stub —
 * which is precisely the failure mode that let this bug ship in the first place.
 */

/**
 * The raw usage payload carried by an OpenAI-protocol `response.done` frame. Per-response DELTAS
 * on every provider that sends it. Indexed so per-modality detail blocks survive untyped.
 */
export interface RealtimeResponseDoneUsage {
    input_tokens?: number;
    output_tokens?: number;
    [detail: string]: unknown;
}

/**
 * A `response.done` frame, declaring BOTH slots the OpenAI-compatible providers use for usage.
 * See {@link ResolveResponseDoneUsage}.
 */
export interface RealtimeResponseDoneFrame {
    /**
     * OpenAI populates usage here. xAI sends this present but EMPTY.
     *
     * Typed as `unknown` deliberately: this is untrusted wire data, and each provider SDK declares
     * its own concrete usage interface (without the index signature {@link RealtimeResponseDoneUsage}
     * carries). Accepting `unknown` lets every SDK's frame type be passed in directly — no cast at
     * the call site — while {@link ResolveResponseDoneUsage} does the narrowing centrally.
     */
    response?: { usage?: unknown } | null;
    /** xAI populates usage here, as a sibling of `response`. OpenAI omits it. */
    usage?: unknown;
}

/** True when a usage payload actually carries token counts (not absent, not an empty `{}`). */
function usageHasTokenCounts(usage: unknown): usage is RealtimeResponseDoneUsage {
    if (usage === null || typeof usage !== 'object') {
        return false;
    }
    const candidate = usage as { input_tokens?: unknown; output_tokens?: unknown };
    return typeof candidate.input_tokens === 'number' || typeof candidate.output_tokens === 'number';
}

/**
 * Picks the usage payload out of an OpenAI-protocol `response.done` frame, tolerating the two
 * layouts the compatible providers actually send on the wire:
 *
 * - **OpenAI** (`gpt-realtime`): populated `response.usage`; no top-level `usage`.
 * - **xAI** (Grok Voice): populated TOP-LEVEL `usage`; `response.usage` present but `{}`.
 *
 * Nested wins whenever it carries real numbers, so OpenAI's behavior is unchanged and xAI is
 * picked up as a fallback. If xAI later populates the nested slot, this keeps working untouched —
 * hence prefer-and-fall-back rather than switching outright.
 *
 * **The empty-object check is the entire point.** Callers used to read only `response.usage` and
 * guard with `if (!usage) return`. For xAI that value is `{}` — which is TRUTHY — so the guard
 * never fired: a usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those
 * clamped to `0` downstream, an all-zero delta was dropped, and the session's tokens were never
 * recorded at all (NULL on `AIPromptRun`) instead of failing loudly. Shared here so the
 * client-direct and server-bridged paths cannot drift apart on it again.
 *
 * @param event The `response.done` frame.
 * @returns The payload carrying token counts, or `undefined` when neither slot has any.
 */
export function ResolveResponseDoneUsage(event: RealtimeResponseDoneFrame): RealtimeResponseDoneUsage | undefined {
    if (usageHasTokenCounts(event.response?.usage)) {
        return event.response?.usage;
    }
    return usageHasTokenCounts(event.usage) ? event.usage : undefined;
}
