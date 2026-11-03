/**
 * One load at a time for an engine's `Config`, shared by callers that do not force a reload.
 *
 * A caller that does not force joins the load already running. A caller that forces waits for
 * the running load to settle and then runs its own, with its own arguments: joining instead would
 * hand it a load started for another user, without the refresh it asked for (#5644).
 */
export class SharedLoad {
    private _current: Promise<void> | null = null;

    /** True while a load is running. */
    public get IsRunning(): boolean {
        return this._current !== null;
    }

    /**
     * Runs `load`, or joins the running load when `force` is false.
     *
     * @param force - When true, never joins: waits for any running load, then runs `load`
     * @param load - Starts the load; called only when this caller's load is the one that runs
     * @returns Settles with the load this caller ran or joined; a forced caller is not failed by
     *   the earlier load it waited for
     */
    public async Run(force: boolean, load: () => Promise<void>): Promise<void> {
        while (this._current) {
            if (!force) {
                return this._current;
            }
            // Another forced caller may start a load while this one waits, so check again.
            await this._current.catch(() => undefined);
        }
        const current = load();
        this._current = current;
        try {
            await current;
        } finally {
            if (this._current === current) {
                this._current = null;
            }
        }
    }
}
