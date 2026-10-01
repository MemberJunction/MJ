/**
 * Resource-limit policy for sandboxed code execution.
 *
 * ## Why this lives in the service layer
 *
 * `timeoutSeconds` and `memoryLimitMB` are caller-supplied. The callers include the "Execute Code"
 * action, whose parameters are filled in by an AI agent, and Runtime Actions. Left unbounded, an
 * agent (or a prompt-injected document it read) can ask for a day-long timeout or an 8 GB isolate
 * and tie up one of a handful of pooled workers — a denial of service against every other caller
 * sharing the pool. Enforcing the ceiling in {@link CodeExecutionService} rather than in any one
 * action means every present and future caller gets it for free, and the action stays a thin shell.
 */

/** The default, floor and ceiling for each limit. Named so callers and tests share one source. */
export const CODE_EXECUTION_LIMITS = {
    /** Execution timeout, in seconds. */
    Timeout: { DefaultSeconds: 30, MinSeconds: 1, MaxSeconds: 120 },
    /**
     * Per-isolate heap limit, in MB. The floor is isolated-vm's own minimum (8 MB); anything lower
     * is rejected by the native addon with an opaque error rather than a useful one.
     */
    Memory: { DefaultMB: 128, MinMB: 8, MaxMB: 512 },
} as const;

/** One limit the policy changed, for logging. */
export interface LimitAdjustment {
    /** Which parameter was adjusted. */
    Parameter: 'timeoutSeconds' | 'memoryLimitMB';
    /** The value the caller asked for (as received, which may not even be a number). */
    Requested: unknown;
    /** The value that will be used instead. */
    Applied: number;
    /** Why — `invalid`, `below-minimum` or `above-maximum`. */
    Reason: 'invalid' | 'below-minimum' | 'above-maximum';
}

/** The outcome of applying the limit policy to a set of caller-supplied values. */
export interface ResolvedLimits {
    /** Present only when the caller supplied a timeout; absent means "let the worker default". */
    TimeoutSeconds?: number;
    /** Present only when the caller supplied a memory limit. */
    MemoryLimitMB?: number;
    /** Every change the policy made. Empty when the request was already in range. */
    Adjustments: LimitAdjustment[];
}

/**
 * Applies the limit policy to the caller's requested values.
 *
 * - `undefined` / `null` → left absent; the worker applies its own default, which equals
 *   {@link CODE_EXECUTION_LIMITS}'s default. Not an adjustment, so it is not logged.
 * - Not a finite number, or `<= 0` → the default (`invalid`). A negative or NaN timeout is never what
 *   the caller meant, and "no limit" must not be reachable by passing garbage.
 * - Below the floor → the floor. Above the ceiling → the ceiling. `Infinity` is simply "above".
 *
 * Pure: it logs nothing and mutates nothing, so it can be tested exhaustively.
 */
export function ResolveExecutionLimits(requested: { timeoutSeconds?: unknown; memoryLimitMB?: unknown }): ResolvedLimits {
    const adjustments: LimitAdjustment[] = [];
    const timeout = clampLimit(
        'timeoutSeconds',
        requested.timeoutSeconds,
        CODE_EXECUTION_LIMITS.Timeout.MinSeconds,
        CODE_EXECUTION_LIMITS.Timeout.MaxSeconds,
        CODE_EXECUTION_LIMITS.Timeout.DefaultSeconds,
        adjustments,
        false,
    );
    const memory = clampLimit(
        'memoryLimitMB',
        requested.memoryLimitMB,
        CODE_EXECUTION_LIMITS.Memory.MinMB,
        CODE_EXECUTION_LIMITS.Memory.MaxMB,
        CODE_EXECUTION_LIMITS.Memory.DefaultMB,
        adjustments,
        true,
    );
    return { TimeoutSeconds: timeout, MemoryLimitMB: memory, Adjustments: adjustments };
}

/** Clamps one value into `[min, max]`, recording what changed. Returns undefined when not supplied. */
function clampLimit(
    parameter: LimitAdjustment['Parameter'],
    requested: unknown,
    min: number,
    max: number,
    fallback: number,
    adjustments: LimitAdjustment[],
    integer: boolean,
): number | undefined {
    if (requested === undefined || requested === null) {
        return undefined;
    }
    if (typeof requested !== 'number' || Number.isNaN(requested) || requested <= 0) {
        adjustments.push({ Parameter: parameter, Requested: requested, Applied: fallback, Reason: 'invalid' });
        return fallback;
    }
    // Memory is handed to isolated-vm, which wants a whole number of MB.
    const value = integer && Number.isFinite(requested) ? Math.floor(requested) : requested;
    if (value > max) {
        adjustments.push({ Parameter: parameter, Requested: requested, Applied: max, Reason: 'above-maximum' });
        return max;
    }
    if (value < min) {
        adjustments.push({ Parameter: parameter, Requested: requested, Applied: min, Reason: 'below-minimum' });
        return min;
    }
    return value;
}
