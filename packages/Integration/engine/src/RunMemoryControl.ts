/**
 * The governor, wired to one run.
 *
 * `MemoryGovernor` decides; this applies. It is split that way because the decision is the part
 * worth testing and the application is the part that needs a live sync, and mixing them means
 * neither can be exercised without the other.
 *
 * WHY PER BATCH AND NOT PER TABLE. The engine already measured pressure between entity maps, which
 * is the right place for a WARNING and the wrong place for a DECISION: a table that fetches twelve
 * consecutive 2,000-record pages allocates all of it without ever reaching a boundary. On the
 * sandbox on 2026-09-14 that was the difference between noticing and dying — the process was
 * killed at 3,478 MB of 3,830 MB with the between-tables check never getting a turn.
 *
 * ONE PER RUN, never shared. The engine is a singleton across concurrent syncs, so calibration and
 * shed state held on it would have one connection's behaviour throttling another's.
 */
import { ReadResourcePressure } from './ResourcePressure.js';
import {
    planShedding, calibrate, estimateEntityMapBytes, batchSizeLever, resolveThresholds,
    type Contributor, type Lever, type SheddingPlan, type GovernorReading
} from './MemoryGovernor.js';

export interface RunMemoryControlHooks {
    /** Stop the in-flight cap from growing. Free: costs nothing already running. */
    HoldAdmissions(): void;
    /** Halve the in-flight cap, floored at 1. */
    ReduceConcurrency(): void;
    /**
     * How many maps the layer is currently allowed to run at once.
     *
     * Asked rather than passed, because it is the CURRENT cap and the governor itself moves it —
     * a value captured when the batch started would be stale by the time the next decision uses it.
     */
    CurrentInFlight(): number;
    /** Report what was done, once per run. */
    Report(plan: SheddingPlan): void;
}

/** Below this a batch is too small to be worth sampling, and the estimate would be noise. */
const MIN_SAMPLE_RECORDS = 1;

/**
 * The smallest page this will ask for.
 *
 * Shrinking without a floor converges on one record per round trip, which frees no more memory
 * than a sane page and turns a sync into a latency test. 25 is small enough to matter and large
 * enough that the request overhead still amortises.
 */
export const MIN_BATCH_SIZE = 25;

/**
 * Bytes per record, from one sample.
 *
 * Deliberately crude: stringify ONE record and double it, because a JS string is UTF-16 in memory
 * and a parsed object carries per-property overhead beyond its serialised form. It will be wrong.
 * That is tolerable only because `calibrate` measures the error against real RSS movement and
 * corrects it — without that feedback this number would be superstition. Never stringify the whole
 * batch: measuring the memory problem must not become one.
 */
export function estimateBytesPerRecord(sample: unknown): number {
    try {
        const json = JSON.stringify(sample);
        return json ? json.length * 2 : 0;
    } catch {
        // Circular or unserialisable — no estimate is better than a wrong one.
        return 0;
    }
}

export class RunMemoryControl {
    private calibration = 1;
    private pendingProjection = 0;
    private residentAtDecision: number | null = null;
    private reported = false;

    private batchSize: number;
    /**
     * The smallest page shrinking may reach.
     *
     * `min` of the default floor and the CONFIGURED size, never `max`. A floor applied to the
     * initial value would silently RAISE a deliberately small batch size — which is a real setting,
     * used by connectors with huge rows and by tests that pin the pagination rule — and raising it
     * would both change fetch behaviour and stop an over-size batch from reading as over-size.
     */
    private readonly floor: number;

    constructor(
        private readonly hooks: RunMemoryControlHooks,
        initialBatchSize: number
    ) {
        this.batchSize = initialBatchSize;
        this.floor = Math.max(1, Math.min(MIN_BATCH_SIZE, initialBatchSize));
    }

    /**
     * The page size this run should ask for, which is NOT the engine's field.
     *
     * Per-run because the engine is a singleton: shrinking a shared field would make one
     * connection's misbehaviour set every other connection's page size for as long as the process
     * lived.
     */
    public get BatchSize(): number {
        return this.batchSize;
    }

    /** The live calibration factor, for tests and for the run stream. */
    public get Calibration(): number {
        return this.calibration;
    }

    /**
     * Called after every fetched batch.
     *
     * Never throws and never blocks the sync: a governor that can fail a run is worse than no
     * governor, because it turns an occasional memory problem into a constant availability one.
     */
    public async NoteBatch(opts: {
        EntityMapID: string;
        ObservedRecords: number;
        SampleRecord: unknown;
        HonoursBatchSize: boolean;
    }): Promise<SheddingPlan | null> {
        try {
            const reading = await this.read();
            if (!reading) return null;

            // Close the loop on the PREVIOUS decision before making a new one: how much did the
            // last shed actually free? Done first so this batch's plan uses a corrected model.
            if (this.pendingProjection > 0 && this.residentAtDecision !== null) {
                this.calibration = calibrate(
                    this.calibration,
                    this.pendingProjection,
                    this.residentAtDecision - reading.ResidentBytes
                );
                this.pendingProjection = 0;
                this.residentAtDecision = null;
            }

            const t = resolveThresholds();
            const plan = planShedding(reading, this.inventory(opts), this.calibration, t.ShedAbove, t.ShedDownTo);
            if (plan.Levers.length === 0 && !plan.Exhausted) return plan;

            this.apply(plan);
            if (plan.ProjectedFreedBytes > 0) {
                this.pendingProjection = plan.ProjectedFreedBytes;
                this.residentAtDecision = reading.ResidentBytes;
            }
            if (!this.reported) {
                this.reported = true;
                this.hooks.Report(plan);
            }
            return plan;
        } catch {
            return null;
        }
    }

    private async read(): Promise<GovernorReading | null> {
        const r = await ReadResourcePressure();
        if (r.HostMemTotalBytes === null) return null;
        return {
            ResidentBytes: r.ResidentBytes,
            HostTotalBytes: r.HostMemTotalBytes,
            HostAvailableBytes: r.HostMemAvailableBytes
        };
    }

    /**
     * What is holding memory right now, as best this process can tell.
     *
     * The current map's batch is modelled from the records ACTUALLY returned — the gap between
     * that and what was requested is the whole point. Other in-flight maps are assumed to cost the
     * same, which is wrong in detail and right in aggregate: they are running the same connector
     * against the same-shaped source, and calibration absorbs the rest.
     */
    private inventory(opts: {
        EntityMapID: string;
        ObservedRecords: number;
        SampleRecord: unknown;
        HonoursBatchSize: boolean;
    }): Contributor[] {
        if (opts.ObservedRecords < MIN_SAMPLE_RECORDS) return [];
        const perRecord = estimateBytesPerRecord(opts.SampleRecord);
        const thisMap = estimateEntityMapBytes(opts.ObservedRecords, perRecord);
        if (thisMap <= 0) return [];

        const others = Math.max(0, this.hooks.CurrentInFlight() - 1);
        const levers: Lever[] = [
            {
                Code: 'HOLD_ADMISSIONS',
                ContributorID: opts.EntityMapID,
                // Frees nothing resident — it prevents the NEXT allocation. Valued at one map so it
                // ranks first (cost 0) without over-promising what it recovers.
                FreesBytes: others > 0 ? thisMap : Math.floor(thisMap / 2),
                ThroughputCost: 0,
                LatencyBatches: 0,
                Reversible: true
            },
            batchSizeLever(opts.EntityMapID, thisMap, opts.HonoursBatchSize)
        ];
        if (others > 0) {
            levers.push({
                Code: 'REDUCE_CONCURRENCY',
                ContributorID: 'layer',
                // Halving the cap releases roughly half of what the OTHER maps hold, as they drain.
                FreesBytes: Math.floor((others * thisMap) / 2),
                ThroughputCost: 0.5,
                LatencyBatches: 1,
                Reversible: true
            });
        }
        return [
            { ID: opts.EntityMapID, Kind: 'entity-map', EstimatedBytes: thisMap * (others + 1), Levers: levers }
        ];
    }

    private apply(plan: SheddingPlan): void {
        for (const lever of plan.Levers) {
            switch (lever.Code) {
                case 'HOLD_ADMISSIONS':
                    this.hooks.HoldAdmissions();
                    break;
                case 'REDUCE_CONCURRENCY':
                    this.hooks.ReduceConcurrency();
                    break;
                case 'SHRINK_BATCH':
                    this.batchSize = Math.max(this.floor, Math.floor(this.batchSize / 2));
                    break;
                default:
                    // FLUSH_ACCUMULATOR / DROP_HASH_PREFETCH / PAUSE_OTHER_SYNC are modelled but not
                    // yet reachable from here. Silently ignoring one would make the plan a lie, so
                    // the inventory above never offers them.
                    break;
            }
        }
    }
}
