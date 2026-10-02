/**
 * What to give up, when the machine is filling.
 *
 * A sync holds memory in several places at once, and the cheapest thing to give up is rarely the
 * same twice. `ResourcePressure` answers "are we in trouble"; this answers "what do we give up
 * first", which is a different question and the one that was never asked. The engine's only
 * response to pressure was to halve one number — per-layer concurrency — which frees nothing at
 * all once concurrency is already 1 and a single object is handing back 2,000 records per request.
 * That was the sandbox on 2026-09-14: killed at 3,478 MB of 3,830 MB, twice.
 *
 * THE MODEL. Memory in flight is an inventory of CONTRIBUTORS, each with an estimated size and a
 * set of LEVERS that would shrink it. Choosing is then arithmetic rather than a policy argument:
 * take the lever with the best bytes-freed per unit of throughput surrendered, apply it, measure
 * again, repeat until the projection is under target. Greedy, because the levers are close to
 * independent and an optimal search over them would cost more than it saves.
 *
 * WHY RANKING MATTERS MORE THAN THE THRESHOLD. The same two levers invert between connectors.
 * Shrinking the requested batch size is the best lever that exists on a connector that HONOURS it
 * — it is nearly free, since a smaller page costs one extra round trip and no work. On a connector
 * that ignores it, the identical lever frees exactly zero and spends a round trip to do it. The
 * engine already knows which it is facing, on the first batch, from
 * `IntegrationEngine.ClassifyOversizedBatch`. Feeding that verdict in here is what makes one
 * algorithm correct for both, with no per-connector configuration and no advance knowledge.
 *
 * WHAT CANNOT BE MEASURED, AND WHAT IS DONE ABOUT IT. Node cannot attribute resident memory to one
 * object in a shared heap. So per-contributor cost is MODELLED — records in flight times observed
 * bytes per record — and then CALIBRATED: after shedding, the projected saving is compared against
 * the actual movement in RSS, and the ratio corrects future estimates. Without that step this is a
 * heuristic that sounds principled; with it, a model that is wrong by 3x converges within a few
 * batches. The calibration is deliberately damped and clamped, because RSS also moves for reasons
 * that have nothing to do with us (GC timing, another sync, the OS).
 *
 * Pure. No I/O, no clock, no process access — the caller supplies the reading and the inventory.
 */

/** Every lever the engine can actually pull today, cheapest surrender first. */
export type LeverCode =
    /** Stop admitting NEW objects into the layer. Frees only future allocation; costs nothing in flight. */
    | 'HOLD_ADMISSIONS'
    /** Ask the source for smaller pages. Near-free — but only on a connector that honours BatchSize. */
    | 'SHRINK_BATCH'
    /** Flush accumulated writes now rather than at the batch end. Costs round trips, not work. */
    | 'FLUSH_ACCUMULATOR'
    /** Stop prefetching content hashes for the current table. Costs skip detection, not correctness. */
    | 'DROP_HASH_PREFETCH'
    /** Reduce the in-flight object cap. Frees proportionally; costs throughput linearly. */
    | 'REDUCE_CONCURRENCY'
    /** Park another connection's sync at its watermark. Frees a whole footprint; costs that sync's latency. */
    | 'PAUSE_OTHER_SYNC';

export interface Lever {
    Code: LeverCode;
    /** The contributor this acts on. */
    ContributorID: string;
    /** Bytes this is expected to free. A lever that frees nothing is not a lever. */
    FreesBytes: number;
    /**
     * Throughput surrendered, 0..1, as a fraction of this contributor's rate. 0 means genuinely
     * free — holding admissions costs nothing that is already running.
     */
    ThroughputCost: number;
    /** Batches before the memory is actually released. Ranks two otherwise equal levers. */
    LatencyBatches: number;
    /** Whether ramp-up can undo it. An irreversible lever is taken last among equals. */
    Reversible: boolean;
}

export interface Contributor {
    ID: string;
    Kind: 'entity-map' | 'accumulator' | 'hash-prefetch' | 'concurrent-sync' | 'discovery';
    /** Modelled bytes held right now, BEFORE calibration is applied. */
    EstimatedBytes: number;
    Levers: Lever[];
}

export interface GovernorReading {
    ResidentBytes: number;
    HostTotalBytes: number | null;
    /** Reclaimable-aware free memory. Null off Linux. */
    HostAvailableBytes: number | null;
}

export interface SheddingPlan {
    /** Levers to apply, in order. Empty when nothing needs doing — or when nothing can be done. */
    Levers: Lever[];
    /** Bytes the plan expects to free, calibrated. */
    ProjectedFreedBytes: number;
    /** True when every available lever was taken and the projection still misses the target. */
    Exhausted: boolean;
    /** Why this plan exists, in one line, for the run stream. */
    Reason: string;
}

/**
 * Fraction of host memory above which shedding starts, and the fraction it sheds back down TO.
 *
 * Two numbers, not one, on purpose: shedding to exactly the trigger guarantees an immediate
 * re-trigger and a sawtooth that spends its whole life at the edge of a kill. The gap is the
 * hysteresis that lets a sync do some work between decisions.
 */
export const SHED_ABOVE_FRACTION = 0.70;
export const SHED_DOWN_TO_FRACTION = 0.55;

/**
 * Operator overrides for both thresholds.
 *
 * Two reasons, and the second is the important one.
 *
 * A tenant KNOWN to be tight can be told to start shedding earlier, without waiting for it to fall
 * over first. And a safety mechanism whose only proof is the disaster it exists to prevent is not
 * a tested mechanism: verifying this on a healthy workspace previously required making the
 * workspace unhealthy. Lowering the trigger for one run makes it demonstrable on demand, which is
 * how it should have been provable from the start.
 *
 * Clamped to a sane band and validated as a pair: a trigger at or below the target would shed
 * forever, and a nonsense value silently ignored is worse than one rejected, so both fall back
 * together to the defaults rather than half-applying.
 */
export function resolveThresholds(env: Record<string, string | undefined> = process.env): {
    ShedAbove: number;
    ShedDownTo: number;
} {
    const num = (v: string | undefined): number | null => {
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
    };
    const above = num(env.MJ_INTEGRATION_SHED_ABOVE_FRACTION);
    const downTo = num(env.MJ_INTEGRATION_SHED_DOWN_TO_FRACTION);
    if (above === null && downTo === null) {
        return { ShedAbove: SHED_ABOVE_FRACTION, ShedDownTo: SHED_DOWN_TO_FRACTION };
    }
    const a = above ?? SHED_ABOVE_FRACTION;
    const d = downTo ?? SHED_DOWN_TO_FRACTION;
    // The target must sit BELOW the trigger or every shed re-triggers immediately and the run
    // spends its life at the edge. An inverted pair is a mistake, not an instruction.
    if (d >= a) {
        return { ShedAbove: SHED_ABOVE_FRACTION, ShedDownTo: SHED_DOWN_TO_FRACTION };
    }
    return { ShedAbove: a, ShedDownTo: d };
}

/** Calibration is damped and bounded — RSS moves for reasons that are not ours. */
export const CALIBRATION_DAMPING = 0.3;
export const CALIBRATION_MIN = 0.25;
export const CALIBRATION_MAX = 4;

/**
 * Rank one lever. Higher is better.
 *
 * Bytes per unit of throughput surrendered. A free lever cannot divide by zero and must not be
 * merely "very good" — it has to outrank every costed lever no matter how large that one's saving,
 * because taking a free lever first is never wrong.
 */
export function scoreLever(l: Lever): number {
    if (l.FreesBytes <= 0) return -1;
    if (l.ThroughputCost <= 0) return Number.POSITIVE_INFINITY;
    return l.FreesBytes / l.ThroughputCost;
}

/** Order: best score, then reversible before not, then soonest effect. */
export function rankLevers(levers: readonly Lever[]): Lever[] {
    return levers
        .filter(l => l.FreesBytes > 0)
        .slice()
        .sort((a, b) => {
            const d = scoreLever(b) - scoreLever(a);
            if (d !== 0 && Number.isFinite(d)) return d;
            if (scoreLever(a) !== scoreLever(b)) return scoreLever(b) === Number.POSITIVE_INFINITY ? 1 : -1;
            if (a.Reversible !== b.Reversible) return a.Reversible ? -1 : 1;
            return a.LatencyBatches - b.LatencyBatches;
        });
}

/**
 * Decide what to give up.
 *
 * Takes levers in ranked order until the calibrated projection reaches the target, and STOPS —
 * over-shedding is its own failure, because every lever surrendered is throughput the customer
 * paid for and a ramp-back that has to be earned again.
 *
 * Returns an empty plan when there is no pressure, and an EXHAUSTED plan when there is pressure
 * and nothing left to give. Exhausted is the honest signal that the workspace is too small for the
 * work — it is not a reason to keep cutting past the point of progress.
 */
export function planShedding(
    reading: GovernorReading,
    contributors: readonly Contributor[],
    calibration = 1,
    shedAbove = SHED_ABOVE_FRACTION,
    shedDownTo = SHED_DOWN_TO_FRACTION
): SheddingPlan {
    const total = reading.HostTotalBytes;
    if (!total || total <= 0) {
        // No denominator, no judgement. Guessing here is how a workspace off Linux gets throttled
        // for no reason.
        return { Levers: [], ProjectedFreedBytes: 0, Exhausted: false, Reason: 'host memory unknown' };
    }
    const fraction = reading.ResidentBytes / total;
    if (fraction < shedAbove) {
        return { Levers: [], ProjectedFreedBytes: 0, Exhausted: false, Reason: 'within headroom' };
    }
    const targetBytes = total * shedDownTo;
    const mustFree = reading.ResidentBytes - targetBytes;

    const ranked = rankLevers(contributors.flatMap(c => c.Levers));
    const taken: Lever[] = [];
    let freed = 0;
    for (const lever of ranked) {
        if (freed >= mustFree) break;
        taken.push(lever);
        freed += lever.FreesBytes * calibration;
    }
    return {
        Levers: taken,
        ProjectedFreedBytes: freed,
        Exhausted: freed < mustFree,
        Reason:
            taken.length === 0
                ? 'under pressure with no lever available'
                : `at ${Math.round(fraction * 100)}% of machine memory — shedding ${taken.length} of ${ranked.length} available`
    };
}

/**
 * Correct the model against reality.
 *
 * `actualFreedBytes` is the drop in RSS observed after the plan took effect; negative means memory
 * grew anyway, which happens and must not invert the model. Damped so one noisy sample cannot
 * swing the estimate, and clamped so a pathological reading cannot drive the governor into either
 * doing nothing or shedding everything.
 */
export function calibrate(previous: number, projectedFreedBytes: number, actualFreedBytes: number): number {
    if (projectedFreedBytes <= 0) return previous;
    const observed = Math.max(0, actualFreedBytes) / projectedFreedBytes;
    const next = previous * (1 - CALIBRATION_DAMPING) + observed * CALIBRATION_DAMPING;
    return Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, next));
}

/**
 * The per-object cost model: records held times observed bytes per record.
 *
 * `observedBatchSize` is what the connector ACTUALLY returned, never what was asked for — the gap
 * between the two is the whole reason this exists.
 */
export function estimateEntityMapBytes(observedBatchSize: number, bytesPerRecord: number): number {
    if (observedBatchSize <= 0 || bytesPerRecord <= 0) return 0;
    return observedBatchSize * bytesPerRecord;
}

/**
 * Build the batch-size lever, which is the one that inverts between connectors.
 *
 * `honoursBatchSize` comes from the engine's own first-batch verdict. When false the lever is
 * still RETURNED, with a zero saving, rather than omitted — so a caller can see that it was
 * considered and rejected on evidence, instead of wondering whether anyone looked.
 */
export function batchSizeLever(
    contributorID: string,
    currentBytes: number,
    honoursBatchSize: boolean
): Lever {
    return {
        Code: 'SHRINK_BATCH',
        ContributorID: contributorID,
        FreesBytes: honoursBatchSize ? Math.floor(currentBytes / 2) : 0,
        // Nearly free where it works: one extra round trip per page, no extra work.
        ThroughputCost: 0.05,
        LatencyBatches: 1,
        Reversible: true
    };
}
