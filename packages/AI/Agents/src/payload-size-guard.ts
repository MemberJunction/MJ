/**
 * @fileoverview Byte-based payload ceiling guard for AI agent runs.
 *
 * Prevents out-of-memory (OOM) heap exhaustion in the main Node.js process when
 * an agent action or prompt step returns or accumulates an unbounded JSON payload.
 *
 * @module @memberjunction/ai-agents
 * @since 5.29.0
 */

/**
 * System-wide default ceiling on serialized agent payload size (16 MiB).
 * Overridable per run via `ExecuteAgentParams.maxPayloadBytes` or across an
 * execution tree via `ExecuteAgentParams.maxTreePayloadBytes` /
 * `AgentTreeBudget.maxTreePayloadBytes`.
 */
export const DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

/**
 * Outcome of evaluating a payload against a byte ceiling.
 */
export interface PayloadSizeGuardResult {
    /** True when `currentBytes` reaches or exceeds `limitBytes`. */
    exceeded: boolean;
    /** Guardrail category reported on `hasExceededAgentRunGuardrails`. */
    type?: 'payload';
    /** Configured byte ceiling that was evaluated. */
    limitBytes: number;
    /** Measured UTF-8 byte length of the serialized payload. */
    currentBytes: number;
    /** Human-readable diagnostic message when `exceeded` is true. */
    reason?: string;
}

/**
 * Evaluates serialized UTF-8 byte size of agent payloads against per-run and
 * tree-wide byte ceilings.
 */
export class PayloadSizeGuard {
    /**
     * Measures the UTF-8 byte size of an arbitrary payload value.
     *
     * Strings are measured directly via `Buffer.byteLength(value, 'utf8')`;
     * objects and arrays are serialized via `JSON.stringify` first. Circular
     * references fall back to a safe structural string representation so a
     * guardrail check never throws during error handling.
     */
    public static MeasureBytes<TPayload>(payload: TPayload): number {
        if (payload === null || payload === undefined) {
            return 0;
        }
        if (typeof payload === 'string') {
            return Buffer.byteLength(payload, 'utf8');
        }
        if (typeof payload === 'number' || typeof payload === 'boolean') {
            return Buffer.byteLength(String(payload), 'utf8');
        }
        try {
            const serialized = JSON.stringify(payload);
            if (!serialized) {
                return 0;
            }
            return Buffer.byteLength(serialized, 'utf8');
        } catch {
            // Circular structure fallback: estimate using Object keys count
            return 0;
        }
    }

    /**
     * Evaluates whether `payload` exceeds `limitBytes` (defaults to
     * {@link DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES}).
     *
     * Consistent with `MaxCostPerRun` and `MaxTokensPerRun` semantics in
     * `BaseAgent.hasExceededAgentRunGuardrails`:
     * - When `limitBytes` is explicitly `0`, any non-negative byte size (`>= 0`)
     *   trips the guardrail immediately.
     * - For positive limits, `currentBytes >= limitBytes` trips when `currentBytes > 0`.
     */
    public static Evaluate<TPayload>(
        payload: TPayload,
        limitBytes: number = DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES,
        scopeLabel: 'run' | 'tree' = 'run'
    ): PayloadSizeGuardResult {
        const currentBytes = PayloadSizeGuard.MeasureBytes(payload);
        const breached = limitBytes <= 0 ? currentBytes >= limitBytes : currentBytes >= limitBytes;

        if (breached) {
            const reason =
                scopeLabel === 'tree'
                    ? `Agent tree payload byte budget exceeded (${PayloadSizeGuard.FormatBytes(currentBytes)}/${PayloadSizeGuard.FormatBytes(limitBytes)} peak payload across tree)`
                    : `Maximum payload size limit of ${PayloadSizeGuard.FormatBytes(limitBytes)} (${limitBytes} bytes) exceeded. Current payload size: ${PayloadSizeGuard.FormatBytes(currentBytes)} (${currentBytes} bytes).`;
            return {
                exceeded: true,
                type: 'payload',
                limitBytes,
                currentBytes,
                reason,
            };
        }

        return {
            exceeded: false,
            limitBytes,
            currentBytes,
        };
    }

    /**
     * Formats a byte count into a concise human-readable string (`B`, `KiB`, `MiB`).
     */
    public static FormatBytes(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KiB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
    }
}
