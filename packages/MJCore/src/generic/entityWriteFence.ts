/**
 * Orders cache reads and fills against the saves and deletes this process sees.
 *
 * The cache maintains its RunView slots from BaseEntity events, but that maintenance runs after
 * the save returns, and a read that started before a save can finish after it. Without an order
 * between the two, a read can be served a slot the maintenance has not reached yet, or a read
 * that began before the write can store its pre-write rows after the maintenance ran, where they
 * are served as a hit until the slot expires (#3059).
 *
 * The fence keeps two things per entity:
 * - the sequence number of the entity's last write, so a fill can tell whether a write happened
 *   after its read began ({@link WrittenSince});
 * - how many maintenance passes for the entity are still running, so a read can treat the
 *   entity's slots as a miss until they settle ({@link IsMaintaining}).
 *
 * Entity names are compared trimmed and lowercased. Process-local: writes made on another server
 * reach this one through remote invalidation, which this fence does not order.
 */
export class EntityWriteFence {
    private _sequence = 0;
    private readonly _lastWrite = new Map<string, number>();
    private readonly _maintaining = new Map<string, number>();

    /**
     * The current write sequence. A read captures it before it queries, and passes it back as
     * `since` to {@link WrittenSince} when it stores its rows.
     */
    public get Current(): number {
        return this._sequence;
    }

    /** Records a write to `entityName`. Call synchronously, as the write is reported. */
    public RecordWrite(entityName: string): void {
        const name = normalize(entityName);
        if (!name) {
            return;
        }
        this._sequence++;
        this._lastWrite.set(name, this._sequence);
    }

    /** True when `entityName` was written after `since` (a value of {@link Current}) was read. */
    public WrittenSince(entityName: string, since: number): boolean {
        const name = normalize(entityName);
        return !!name && (this._lastWrite.get(name) ?? 0) > since;
    }

    /** Marks a maintenance pass for `entityName` as running. Pair with {@link EndMaintenance}. */
    public BeginMaintenance(entityName: string): void {
        const name = normalize(entityName);
        if (name) {
            this._maintaining.set(name, (this._maintaining.get(name) ?? 0) + 1);
        }
    }

    /** Marks one maintenance pass for `entityName` as finished. */
    public EndMaintenance(entityName: string): void {
        const name = normalize(entityName);
        if (!name) {
            return;
        }
        const remaining = (this._maintaining.get(name) ?? 1) - 1;
        if (remaining > 0) {
            this._maintaining.set(name, remaining);
        } else {
            this._maintaining.delete(name);
        }
    }

    /** True while a maintenance pass for `entityName` is running. */
    public IsMaintaining(entityName: string): boolean {
        return this._maintaining.size > 0 && this._maintaining.has(normalize(entityName));
    }

    /**
     * Runs `work` as a maintenance pass for every entity in `entityNames`. The passes begin
     * synchronously and end when `work` settles, whether it resolves or rejects.
     */
    public async Maintain<T>(entityNames: Iterable<string>, work: () => Promise<T>): Promise<T> {
        const names = [...entityNames];
        for (const name of names) {
            this.BeginMaintenance(name);
        }
        try {
            return await work();
        } finally {
            for (const name of names) {
                this.EndMaintenance(name);
            }
        }
    }
}

function normalize(entityName: string | null | undefined): string {
    return entityName ? entityName.trim().toLowerCase() : '';
}
