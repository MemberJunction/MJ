/**
 * AIMD (Additive-Increase / Multiplicative-Decrease) concurrency controller for
 * plan.md §7 — "smart-but-careful peak parallelization".
 *
 * Rather than a fixed `syncConcurrency` config, this auto-discovers the highest
 * *safe* in-flight cap at runtime: it ramps the cap up by +1 on every healthy
 * outcome (additive increase) and slashes it by ÷2 on every throttle/error
 * (multiplicative decrease). This is the same control law TCP congestion control
 * uses to find a network's safe throughput — it converges on the source's real
 * peak without tipping into sustained 429s/errors.
 *
 * Pure + dependency-free (no DB, no network, no timers) so it is cheaply and
 * deterministically unit-testable. The engine wires `OnSuccess()` /
 * `OnThrottleOrError()` from each record's per-call outcome and reads the live
 * `Cap` from `RunAdaptive` to bound the promise pool.
 */

/** Options for {@link AdaptiveConcurrencyController}; all bounds are clamped into a sane order. */
export interface AdaptiveConcurrencyOptions {
    /** Starting cap. Defaults to {@link AdaptiveConcurrencyController.Min} (conservative ramp-up). */
    start?: number;
    /** Lower bound for the cap — never decreases below this. Defaults to 1. */
    min?: number;
    /** Upper bound for the cap — never increases above this. Defaults to 16. */
    max?: number;
}

/**
 * Holds a single adaptive concurrency cap and mutates it under the AIMD law.
 * Stateless beyond the current cap and its bounds; safe to share across a single
 * `RunAdaptive` invocation (all calls run on one async thread, so no locking).
 */
export class AdaptiveConcurrencyController {
    private readonly minCap: number;
    private readonly maxCap: number;
    private cap: number;

    constructor(options: AdaptiveConcurrencyOptions = {}) {
        const min = AdaptiveConcurrencyController.normalizeMin(options.min);
        const max = AdaptiveConcurrencyController.normalizeMax(options.max, min);
        const start = AdaptiveConcurrencyController.normalizeStart(options.start, min, max);
        this.minCap = min;
        this.maxCap = max;
        this.cap = start;
    }

    /** The live in-flight cap. Always within `[Min, Max]`. */
    public get Cap(): number {
        return this.cap;
    }

    /** Lower bound the cap can never fall below. */
    public get Min(): number {
        return this.minCap;
    }

    /** Upper bound the cap can never rise above. */
    public get Max(): number {
        return this.maxCap;
    }

    /** Additive increase: a healthy outcome nudges the cap up by 1, clamped to Max. */
    public OnSuccess(): void {
        this.cap = Math.min(this.maxCap, this.cap + 1);
    }

    /** Multiplicative decrease: a throttle/error halves the cap, floored at Min. */
    public OnThrottleOrError(): void {
        this.cap = Math.max(this.minCap, Math.floor(this.cap / 2));
    }

    private static normalizeMin(min: number | undefined): number {
        const n = Number(min);
        return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }

    private static normalizeMax(max: number | undefined, min: number): number {
        const n = Number(max);
        const candidate = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 16;
        return Math.max(candidate, min);
    }

    private static normalizeStart(start: number | undefined, min: number, max: number): number {
        const n = Number(start);
        const candidate = Number.isFinite(n) && n >= 1 ? Math.floor(n) : min;
        return Math.min(Math.max(candidate, min), max);
    }
}

/** Per-item outcome the worker fn reports back so the controller can adapt the cap. */
export interface AdaptiveItemOutcome {
    /** True if the call succeeded (drives additive increase). */
    ok: boolean;
    /** True if the call was throttled/rate-limited (429 etc.) — drives multiplicative decrease. */
    throttled?: boolean;
}

/** Aggregate result of a {@link RunAdaptive} pass over a batch of items. */
export interface AdaptiveRunResult {
    /** Number of items whose outcome reported `ok: true`. */
    succeeded: number;
    /** Number of items whose outcome reported `ok: false` (errors, including throttles). */
    failed: number;
    /** Number of outcomes that reported `throttled: true`. */
    throttled: number;
    /** Total items processed (always equals `items.length`). */
    processed: number;
    /** The highest number of fn invocations observed in flight at once during the run. */
    peakInFlight: number;
    /** The cap value at the end of the run (where AIMD converged for this batch). */
    finalCap: number;
}

/**
 * Runs `fn` over `items` with at most `controller.Cap` invocations in flight at
 * any instant, re-reading the cap on every scheduling decision so it tracks the
 * controller as AIMD mutates it. Mirrors `IntegrationEngine.runBounded`'s
 * promise-pool shape, but the pool size is dynamic instead of fixed.
 *
 * Each completed call feeds its outcome back into the controller
 * (`OnThrottleOrError` when `throttled` or `!ok`, else `OnSuccess`) so a later
 * item benefits from (or is protected by) what earlier items revealed about the
 * source's limits. No timers are used — concurrency is bounded purely by how
 * many worker promises are permitted to be active.
 */
export async function RunAdaptive<T>(
    items: T[],
    fn: (item: T) => Promise<AdaptiveItemOutcome>,
    controller: AdaptiveConcurrencyController,
): Promise<AdaptiveRunResult> {
    const result: AdaptiveRunResult = {
        succeeded: 0,
        failed: 0,
        throttled: 0,
        processed: 0,
        peakInFlight: 0,
        finalCap: controller.Cap,
    };
    if (items.length === 0) return result;

    const state: PoolState = { nextIndex: 0, inFlight: 0 };

    const runOne = async (i: number): Promise<void> => {
        state.inFlight++;
        if (state.inFlight > result.peakInFlight) result.peakInFlight = state.inFlight;
        try {
            const outcome = await fn(items[i]);
            applyOutcome(controller, result, outcome);
        } finally {
            state.inFlight--;
            result.processed++;
        }
    };

    // Self-scaling pool: spawn up to Max workers (the hard ceiling). Each worker
    // re-reads the LIVE cap before pulling its next item and yields itself when
    // in-flight has reached the current cap — so a mid-run multiplicative
    // decrease genuinely throttles back the active set, and an increase lets a
    // parked worker resume. Workers exit when the batch is drained.
    const workerCount = Math.min(controller.Max, items.length);
    const workers = Array.from({ length: workerCount }, () => adaptiveWorker(items, controller, state, runOne));
    await Promise.all(workers);

    result.finalCap = controller.Cap;
    return result;
}

/** Mutable counters shared by all workers in a single {@link RunAdaptive} pass. */
interface PoolState {
    /** Index of the next un-claimed item. */
    nextIndex: number;
    /** How many `fn` invocations are currently awaiting. */
    inFlight: number;
}

/**
 * One worker in the adaptive pool. Loops claiming items, but before claiming it
 * gates on the LIVE cap: if in-flight already meets/exceeds `controller.Cap`,
 * the worker yields a microtask and re-checks, so the active set tracks the cap
 * as AIMD shrinks or grows it. Returns when no items remain.
 */
async function adaptiveWorker<T>(
    items: T[],
    controller: AdaptiveConcurrencyController,
    state: PoolState,
    runOne: (i: number) => Promise<void>,
): Promise<void> {
    while (state.nextIndex < items.length) {
        if (state.inFlight >= controller.Cap) {
            // Over the live cap — park this worker for a microtask and re-evaluate.
            await Promise.resolve();
            continue;
        }
        const i = state.nextIndex++;
        if (i >= items.length) return;
        await runOne(i);
    }
}

/** Folds one item outcome into both the running tallies and the controller's cap. */
function applyOutcome(
    controller: AdaptiveConcurrencyController,
    result: AdaptiveRunResult,
    outcome: AdaptiveItemOutcome,
): void {
    if (outcome.throttled) result.throttled++;
    if (outcome.ok) result.succeeded++;
    else result.failed++;

    if (outcome.throttled || !outcome.ok) controller.OnThrottleOrError();
    else controller.OnSuccess();
}
