/**
 * @fileoverview Byte-based payload ceiling guard for AI agent runs.
 *
 * Prevents out-of-memory (OOM) heap exhaustion in the main Node.js process when
 * an agent action or prompt step returns or accumulates an unbounded JSON payload.
 *
 * @module @memberjunction/ai-agents
 * @since 6.2.0
 */

import { LogError } from '@memberjunction/core';

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
    /**
     * Measured UTF-8 byte length of the serialized payload. `Infinity` when the payload is too
     * large for V8 to serialize at all.
     */
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
     * objects and arrays are serialized via `JSON.stringify` first.
     *
     * A guardrail must not fail open on the very payloads it exists to stop, so a payload too
     * large for V8 to serialize (`RangeError: Invalid string length`) measures as `Infinity` and
     * trips every ceiling. A payload that cannot be serialized for any other reason (a circular
     * reference, a `BigInt`) is logged and measures as 0: its size is unknown, and it will fail
     * loudly at the next persistence step anyway.
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
        } catch (error) {
            if (error instanceof RangeError) {
                return Number.POSITIVE_INFINITY;
            }
            const message = error instanceof Error ? error.message : String(error);
            LogError(`PayloadSizeGuard: payload could not be serialized to measure its size, so the payload byte ceiling was not applied to it: ${message}`);
            return 0;
        }
    }

    /**
     * Evaluates whether `payload` exceeds `limitBytes` (defaults to
     * {@link DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES}).
     *
     * The ceiling trips when `currentBytes >= limitBytes`, the same comparison
     * `BaseAgent.hasExceededAgentRunGuardrails` uses for `MaxCostPerRun` and `MaxTokensPerRun`.
     * A limit of `0` therefore trips on every payload, including an empty one.
     */
    public static Evaluate<TPayload>(
        payload: TPayload,
        limitBytes: number = DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES,
        scopeLabel: 'run' | 'tree' = 'run'
    ): PayloadSizeGuardResult {
        const currentBytes = PayloadSizeGuard.MeasureBytes(payload);

        if (currentBytes >= limitBytes) {
            const reason =
                scopeLabel === 'tree'
                    ? `Agent tree payload byte budget exceeded (${PayloadSizeGuard.FormatBytes(currentBytes)}/${PayloadSizeGuard.FormatBytes(limitBytes)} peak payload across tree)`
                    : `Maximum payload size limit of ${PayloadSizeGuard.FormatBytes(limitBytes)} (${limitBytes} bytes) exceeded. Current payload size: ${PayloadSizeGuard.FormatBytes(currentBytes)}${Number.isFinite(currentBytes) ? ` (${currentBytes} bytes)` : ''}.`;
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
        if (!Number.isFinite(bytes)) {
            return 'more than V8 can serialize';
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KiB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
    }
}
