import { BaseSingleton } from './BaseSingleton';

/**
 * Implemented by long-lived singletons (engines, services) that own background work
 * — timers, intervals, subscriptions, sockets, child processes — so a coordinated
 * shutdown can release them. Without this contract, `SIGTERM`/`SIGINT` handlers in
 * the entry point have no way to reach into singleton state to clear timers, leaving
 * the process unable to exit cleanly under load tests, CI runs, or graceful drains.
 *
 * Implementers register themselves with `ShutdownRegistry.Instance.Register(this)`
 * (typically in their constructor) and provide a `Shutdown()` that releases the
 * resource synchronously or returns a promise. The registry calls each implementer
 * exactly once per `ShutdownAll()` invocation.
 */
export interface IShutdownable {
    /**
     * Optional human-readable identifier surfaced in shutdown logs and used for
     * de-duplication when `Register` is called repeatedly with the same instance
     * but no name. Falls back to the constructor name.
     */
    readonly ShutdownName?: string;

    /**
     * Release the resource. Must be idempotent — `ShutdownAll()` may be invoked more
     * than once during a slow drain (e.g., SIGTERM followed by SIGINT). Should not
     * throw; failures are logged and remaining shutdowns continue.
     */
    Shutdown(): void | Promise<void>;
}

/**
 * Process-wide registry of `IShutdownable` instances. Stored in the global object
 * store (via `BaseSingleton`) so it's truly singleton across bundler-duplicated
 * code paths. Wire `SIGTERM`/`SIGINT` handlers to `ShutdownAll()` once at app
 * entry — singletons self-register from their constructors and need no further
 * coordination.
 */
export class ShutdownRegistry extends BaseSingleton<ShutdownRegistry> {
    private _items: Set<IShutdownable> = new Set();
    private _shuttingDown = false;

    protected constructor() {
        super();
    }

    public static get Instance(): ShutdownRegistry {
        return super.getInstance<ShutdownRegistry>();
    }

    /**
     * Add a shutdownable to the registry. Safe to call multiple times for the same
     * instance — duplicates are ignored. Should be invoked from the singleton's
     * constructor so registration happens automatically.
     */
    public Register(item: IShutdownable): void {
        this._items.add(item);
    }

    /**
     * Remove a shutdownable from the registry. Use when an instance has its own
     * lifecycle separate from the process (rare for singletons).
     */
    public Unregister(item: IShutdownable): boolean {
        return this._items.delete(item);
    }

    /**
     * Number of registered shutdownables. Exposed for tests and diagnostics.
     */
    public get Count(): number {
        return this._items.size;
    }

    /**
     * Snapshot of registered shutdownables (useful for diagnostics). Returns a
     * copy — mutations don't affect the registry.
     */
    public List(): IShutdownable[] {
        return Array.from(this._items);
    }

    /**
     * Whether a `ShutdownAll()` is currently in flight. Exposed so singletons can
     * skip per-request work during teardown without hard-stopping.
     */
    public get IsShuttingDown(): boolean {
        return this._shuttingDown;
    }

    /**
     * Invoke `Shutdown()` on every registered item. Errors from individual items
     * are caught and logged; remaining items still run. Concurrency is sequential
     * to avoid surprising teardown-order interactions. Returns when all items
     * settle.
     */
    public async ShutdownAll(): Promise<void> {
        this._shuttingDown = true;
        const items = Array.from(this._items);
        for (const item of items) {
            const name = item.ShutdownName || item.constructor?.name || 'anonymous';
            try {
                const result = item.Shutdown();
                if (result && typeof (result as Promise<void>).then === 'function') {
                    await result;
                }
            } catch (e) {
                // Don't let one bad shutdown stop the rest. Use console directly so
                // this works even if a logging singleton is itself mid-shutdown.
                // eslint-disable-next-line no-console
                console.error(`ShutdownRegistry: ${name}.Shutdown() threw`, e);
            }
        }
        this._items.clear();
    }

    /**
     * Drop all registered items without calling their Shutdown methods. Test-only.
     */
    public ResetForTests(): void {
        this._items.clear();
        this._shuttingDown = false;
    }
}
