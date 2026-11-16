/**
 * Runs an engine's load so concurrent callers share it, without letting a forced reload return a
 * load that may have read before the caller asked.
 *
 * - A call while nothing is loading starts the load.
 * - A call without `forceRefresh` while a load is running waits for that load.
 * - A call with `forceRefresh` while a load is running waits for it and then runs one more load,
 *   because the running load may have read before the caller's own writes. Forced calls that
 *   arrive before that extra load starts share it, so a burst of `Config(true)` calls costs at
 *   most one extra load. A forced call that arrives once the extra load is running queues another.
 *
 * Loads never overlap: the extra load starts only after the running one has settled, so an older
 * read can never land after a newer one. `BaseEngine.Load` follows the same rules; engines that
 * wrap a `BaseEngine` with their own `Config` use this class.
 *
 * ```ts
 * private _load = new SharedLoad();
 *
 * public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
 *     if (this._loaded && !forceRefresh) return;
 *     return this._load.Run(forceRefresh === true, () => this.innerLoad(forceRefresh, contextUser));
 * }
 * ```
 */
export class SharedLoad {
    private _running: Promise<void> | null = null;
    private _forcedAfterRunning: Promise<void> | null = null;

    /** True while a load is running. */
    public get IsLoading(): boolean {
        return this._running !== null;
    }

    /**
     * Runs `load`, or joins the load that is running, as described on the class.
     *
     * @param forceRefresh - True when the caller needs a load that starts after this call.
     * @param load - Starts one load. For a forced call that has to wait, the queued load uses the
     *   `load` of the first forced call that queued it.
     * @returns Settles with the load the caller ends up on; rejects when that load rejects.
     */
    public Run(forceRefresh: boolean, load: () => Promise<void>): Promise<void> {
        if (this._running) {
            if (!forceRefresh) {
                return this._running;
            }
            this._forcedAfterRunning ??= this._running
                .catch(() => undefined)
                .then(() => {
                    this._forcedAfterRunning = null;
                    return this.Run(true, load);
                });
            return this._forcedAfterRunning;
        }
        // `.finally` runs after this assignment even when `load` throws synchronously.
        const running: Promise<void> = SharedLoad.invoke(load).finally(() => {
            if (this._running === running) {
                this._running = null;
            }
        });
        this._running = running;
        return running;
    }

    /** Calls `load`, turning a synchronous throw into a rejection. */
    private static invoke(load: () => Promise<void>): Promise<void> {
        try {
            return load();
        } catch (e) {
            return Promise.reject(e);
        }
    }
}
