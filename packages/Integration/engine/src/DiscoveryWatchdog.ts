/**
 * A registry of in-flight discovery samples, reported periodically while any are running.
 *
 * From outside the process, a discovery that is working and one that is hung look identical:
 * nothing is written between the run's start and its end, so a long-but-healthy sample of a slow
 * source and a walk that will never terminate produce the same evidence — none. That is the whole
 * difficulty of diagnosing discovery: the failure mode is silence, and silence is also what
 * success looks like until it finishes.
 *
 * The watchdog turns silence into a statement. Every sample registers itself, notes what stage it
 * is in as it goes, and deregisters when it ends; while anything is registered, a ticker names
 * each object still in flight, how long it has been there, what it is waiting on, and how much it
 * has actually pulled. Silence then means the process is gone — anything still running says so
 * under its own name.
 *
 * Nothing here changes what discovery does; it only makes it visible. The ticker is unref'd, so it
 * can never be the reason Node stays alive, and it exists only while samples are in flight.
 */

import { BaseSingleton, ShutdownRegistry, IShutdownable } from '@memberjunction/global';

/** What one in-flight sample is doing right now. */
export type DiscoveryWatchEntry = {
    /** The external object being sampled. */
    Object: string;
    /** Epoch ms the sample started. */
    StartedMs: number;
    /** Free-text phase, e.g. `FetchChanges#3`. */
    Stage: string;
    /** Pages pulled from the source so far. */
    Pages: number;
    /** Records yielded to the inference so far. */
    Records: number;
    /** Epoch ms the sample must not outlive, when it has a deadline. */
    DeadlineMs?: number;
};

/** Mutable fields a caller may update mid-flight. */
export type DiscoveryWatchPatch = Partial<Pick<DiscoveryWatchEntry, 'Stage' | 'Pages' | 'Records'>>;

export type DiscoveryWatchdogOptions = {
    /** Report interval. `<= 0` disables reporting entirely (tracking still works). */
    IntervalMs?: number;
    /** Clock, injectable for tests. */
    Now?: () => number;
    /** Sink for the report line. */
    Log?: (message: string) => void;
    /** Timer factory, injectable for tests. Must return something `Clear` accepts. */
    SetInterval?: (fn: () => void, ms: number) => unknown;
    Clear?: (handle: unknown) => void;
};

/**
 * Resolves the report interval: `MJ_INTEGRATION_DISCOVERY_WATCHDOG_MS`, default 15s, `0` to
 * silence it. A malformed value falls back to the default rather than disabling the reporting an
 * operator was trying to configure.
 */
export function ResolveWatchdogIntervalMs(env: string | undefined, defaultMs = 15_000): number {
    if (env === undefined || env.trim() === '') return defaultMs;
    const parsed = Number.parseInt(env, 10);
    if (!Number.isFinite(parsed)) return defaultMs;
    return parsed <= 0 ? 0 : parsed;
}

export class DiscoveryWatchdog extends BaseSingleton<DiscoveryWatchdog> implements IShutdownable {
    /**
     * Process-wide instance, resolved through the Global Object Store rather than a static field.
     *
     * That distinction matters here specifically: this package is one of the ones that can be
     * loaded twice in a process (a bundled connector copy alongside the standalone one). A static
     * field would then give each copy its OWN registry and its OWN ticker, so samples registered
     * through one would be absent from the other's report — a watchdog that silently under-reports
     * what is in flight, which is worse than no watchdog, because the whole contract is that
     * silence means the process is gone.
     */
    public static get Instance(): DiscoveryWatchdog {
        return super.getInstance<DiscoveryWatchdog>();
    }

    public readonly ShutdownName = 'DiscoveryWatchdog';

    private readonly inFlight = new Map<string, DiscoveryWatchEntry>();
    private intervalMs: number;
    private now: () => number;
    private log: (message: string) => void;
    private setIntervalFn: (fn: () => void, ms: number) => unknown;
    private clearFn: (handle: unknown) => void;
    private ticker: unknown = null;
    private keySeq = 0;

    protected constructor() {
        super();
        this.intervalMs = ResolveWatchdogIntervalMs(process.env.MJ_INTEGRATION_DISCOVERY_WATCHDOG_MS);
        this.now = () => Date.now();
        this.log = message => console.log(message);
        this.setIntervalFn = (fn, ms) => {
            const handle = setInterval(fn, ms);
            // Never hold the process open for a diagnostic.
            if (typeof (handle as { unref?: () => void }).unref === 'function') (handle as { unref: () => void }).unref();
            return handle;
        };
        this.clearFn = handle => clearInterval(handle as ReturnType<typeof setInterval>);
        ShutdownRegistry.Instance.Register(this);
    }

    /**
     * Overrides the defaults — the interval, and the clock/timer/log seams the tests drive.
     * Mirrors {@link AgentRunWatchdog.Configure}: a singleton cannot take constructor arguments,
     * because `BaseSingleton` returns the stored instance and would discard them.
     *
     * Restarts the ticker when one is already running, so a changed interval takes effect at once.
     */
    public Configure(options: DiscoveryWatchdogOptions = {}): void {
        if (options.IntervalMs !== undefined) this.intervalMs = options.IntervalMs;
        if (options.Now) this.now = options.Now;
        if (options.Log) this.log = options.Log;
        if (options.SetInterval) this.setIntervalFn = options.SetInterval;
        if (options.Clear) this.clearFn = options.Clear;
        if (this.ticker !== null) {
            this.stopTicker();
            this.ensureTicker();
        }
    }

    /** Drops all in-flight state and stops the ticker. For tests, and for a clean shutdown. */
    public Reset(): void {
        this.inFlight.clear();
        this.stopTicker();
        this.keySeq = 0;
    }

    /** IShutdownable: a diagnostic ticker must not keep firing while the process drains. */
    public async Shutdown(): Promise<void> {
        this.stopTicker();
    }

    /** Registers a sample and returns the key used to update and end it. */
    public Start(objectName: string, deadlineMs?: number): string {
        const key = `${objectName}#${++this.keySeq}`;
        this.inFlight.set(key, {
            Object: objectName,
            StartedMs: this.now(),
            Stage: 'starting',
            Pages: 0,
            Records: 0,
            DeadlineMs: deadlineMs,
        });
        this.ensureTicker();
        return key;
    }

    /** Updates an in-flight sample. A key that has already ended is ignored. */
    public Note(key: string | undefined, patch: DiscoveryWatchPatch): void {
        if (!key) return;
        const entry = this.inFlight.get(key);
        if (entry) Object.assign(entry, patch);
    }

    /** Deregisters a sample. Stops the ticker once nothing is left in flight. */
    public End(key: string | undefined): void {
        if (!key) return;
        this.inFlight.delete(key);
        if (this.inFlight.size === 0) this.stopTicker();
    }

    /** Read-only view of what is in flight, for callers that want the numbers at the end. */
    public Peek(key: string | undefined): Readonly<DiscoveryWatchEntry> | undefined {
        return key ? this.inFlight.get(key) : undefined;
    }

    /** The report line, or `null` when nothing is in flight. Pure — this is what the ticker logs. */
    public BuildReport(): string | null {
        if (this.inFlight.size === 0) return null;
        const now = this.now();
        const entries = [...this.inFlight.values()].sort((a, b) => a.StartedMs - b.StartedMs);
        const oldestSec = Math.round((now - entries[0].StartedMs) / 1000);
        const rows = entries.map(e =>
            `"${e.Object}" ${Math.round((now - e.StartedMs) / 1000)}s stage=${e.Stage} pages=${e.Pages} records=${e.Records}` +
            (e.DeadlineMs !== undefined ? ` deadlineIn=${Math.round((e.DeadlineMs - now) / 1000)}s` : ''));
        return `[DiscoveryWatchdog] ${entries.length} object(s) still in flight, oldest ${oldestSec}s:\n    ${rows.join('\n    ')}`;
    }

    /** Emits one report immediately. Exposed so the ticker and tests drive the same path. */
    public Tick(): void {
        if (this.inFlight.size === 0) {
            this.stopTicker();
            return;
        }
        const report = this.BuildReport();
        if (report) this.log(report);
    }

    private ensureTicker(): void {
        if (this.intervalMs <= 0 || this.ticker !== null) return;
        this.ticker = this.setIntervalFn(() => this.Tick(), this.intervalMs);
    }

    private stopTicker(): void {
        if (this.ticker === null) return;
        this.clearFn(this.ticker);
        this.ticker = null;
    }
}
