/**
 * Load-aware admission control at the dispatch point.
 *
 * Nothing used to observe host health during a run: worker count was fixed for
 * the whole 7.8 h, and the second-half collapse (hourly pass rate dropping to
 * 33 % as memory declined) had no countermeasure. Thehealth supervisor
 * now writes `$RUN_DIR/health-state.json` (`{state, recommendedWorkers,
 * reasons}`); this module lets the parallel work queue consult it before each
 * dispatch and back off — file-based, so there is zero in-process coupling to
 * the monitor.
 *
 * Policy:
 *   - `healthy`  → proceed.
 *   - `degraded` → shed: a worker whose index is at/above `recommendedWorkers`
 *     exits its loop, shrinking effective concurrency. Deterministic by index
 *     (high-index workers shed first) so it converges without a shared counter,
 *     and worker 0 NEVER sheds — the queue always keeps a drainer.
 *   - `critical` → pause dispatch and re-poll until the host recovers, capped so
 *     a permanently-wedged host can't block forever (the circuit breaker owns
 *     the real abort).
 *
 * The decision is a pure function of (state, workerIndex); the file read and the
 * pause loop are injected, so everything is unit-testable without a real file or
 * real timers.
 */

/** Host health level, as written by the supervisor. */
export type HealthLevel = 'healthy' | 'degraded' | 'critical';

/** Parsed `health-state.json`. */
export interface HealthState {
    state: HealthLevel;
    /** Workers the host can currently sustain (≥1). Absent ⇒ treat as 1. */
    recommendedWorkers?: number;
    /** Human-readable reasons for the state (for logging). */
    reasons?: string[];
    updatedAt?: string;
}

/** What a worker should do at a dispatch checkpoint. */
export type AdmissionAction = 'proceed' | 'exit' | 'pause';

/**
 * Pure admission decision for one worker at one checkpoint. `null`/`healthy`
 * proceeds; `critical` pauses; `degraded` sheds workers at/above the recommended
 * count. Worker 0 is the guaranteed floor and never sheds.
 */
export function admissionDecision(state: HealthState | null, workerIndex: number): AdmissionAction {
    if (!state || state.state === 'healthy') {
        return 'proceed';
    }
    if (state.state === 'critical') {
        return 'pause';
    }
    // degraded — shed high-index workers down to the recommended floor.
    const floor = Math.max(1, Math.floor(state.recommendedWorkers ?? 1));
    return workerIndex >= floor ? 'exit' : 'proceed';
}

/**
 * Read + validate `health-state.json`. Returns null on any problem (missing file
 * — the monitor may not be running — malformed JSON, or an unrecognized `state`)
 * so admission fails OPEN: a broken/absent monitor never blocks the run.
 */
export function readHealthState(
    filePath: string,
    readFileSync: (p: string, enc: 'utf8') => string
): HealthState | null {
    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
        if (parsed && (parsed.state === 'healthy' || parsed.state === 'degraded' || parsed.state === 'critical')) {
            return parsed as HealthState;
        }
        return null;
    } catch {
        return null;
    }
}

/** Options for {@link AdmissionController}. */
export interface AdmissionControllerOptions {
    /** Reads the current health state (typically `() => readHealthState(path, fs.readFileSync)`). */
    readHealth: () => HealthState | null;
    /** Hard cap on total pause per dispatch before proceeding anyway. Default 300 000 (5 min). */
    maxPauseMs?: number;
    /** Re-poll interval while paused. Default 5000. */
    pollMs?: number;
    /** Sleep primitive (injected for tests). Default a real setTimeout. */
    sleep?: (ms: number) => Promise<void>;
 /** Fired when a pause hits the cap and we proceed regardless (hook). */
    onPauseCapReached?: (state: HealthState | null) => void;
    /** Optional logger for state transitions. */
    log?: (msg: string) => void;
}

/**
 * Turns the pure {@link admissionDecision} into an awaitable gate for the work
 * queue: `admit(workerIndex)` resolves `'proceed'` (go take an item) or `'exit'`
 * (shed this worker), blocking while the host is `critical` until it recovers or
 * the pause cap is hit.
 */
export class AdmissionController {
    private readonly maxPauseMs: number;
    private readonly pollMs: number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(private readonly opts: AdmissionControllerOptions) {
        this.maxPauseMs = opts.maxPauseMs ?? 300_000;
        this.pollMs = opts.pollMs ?? 5000;
        this.sleep = opts.sleep ?? ((ms) => new Promise(r => setTimeout(r, ms)));
    }

    async admit(workerIndex: number): Promise<'proceed' | 'exit'> {
        let waited = 0;
        let announcedPause = false;
        for (;;) {
            const state = this.opts.readHealth();
            const action = admissionDecision(state, workerIndex);
            if (action === 'proceed') {
                return 'proceed';
            }
            if (action === 'exit') {
                this.opts.log?.(`[admission] worker ${workerIndex} shedding — host ${state?.state} (recommend ${state?.recommendedWorkers ?? '?'} workers)`);
                return 'exit';
            }
            // critical → pause
            if (!announcedPause) {
                this.opts.log?.(`[admission] worker ${workerIndex} pausing — host critical: ${(state?.reasons ?? []).join('; ')}`);
                announcedPause = true;
            }
            if (waited >= this.maxPauseMs) {
                this.opts.onPauseCapReached?.(state);
                this.opts.log?.(`[admission] worker ${workerIndex} pause cap (${this.maxPauseMs}ms) reached — proceeding under critical health`);
                return 'proceed';
            }
            await this.sleep(this.pollMs);
            waited += this.pollMs;
        }
    }
}
