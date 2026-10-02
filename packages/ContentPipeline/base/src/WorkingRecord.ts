/**
 * @fileoverview {@link WorkingRecord} — the structure every stage reads and writes.
 *
 * @module @memberjunction/content-pipeline-base
 */

import {
    FieldConfidenceMap,
    WellKnownField,
    WellKnownFieldValue,
    WellKnownFields,
    WorkingRecordEntity,
    WorkingRecordField,
    WorkingRecordIdentity,
} from './WorkingRecord.types.js';

/**
 * The coin of the realm, passed from stage to stage.
 *
 * Stages never touch storage. They receive one of these, read what they need, propose values for
 * what they produce, and return it. `WorkingRecordHydrator` builds one from a persisted row and
 * `WorkingRecordCommitter` writes the changed parts back — those two are the only places a database
 * is involved, and neither belongs to any stage.
 *
 * @example
 * ```ts
 * // A stage proposing a title it is fairly confident about.
 * record.Propose('Title', parsed.heading, 6, 'Extract.Html');
 *
 * // A stage stashing something only a later stage in this same run needs.
 * record.SetExtension('Extract.Html', 'headingDepth', 2);
 * ```
 */
export class WorkingRecord {
    /** Which record this is, persisted or not. */
    public readonly Identity: WorkingRecordIdentity;

    private readonly _fields = new Map<WellKnownField, WorkingRecordField>();
    private readonly _extensions = new Map<string, unknown>();
    private readonly _changed = new Set<WellKnownField>();
    private readonly _children: WorkingRecord[] = [];
    private _complete = false;

    constructor(identity: WorkingRecordIdentity) {
        this.Identity = identity;
    }

    /** Convenience: the entity this record stands for. */
    public get Entity(): WorkingRecordEntity {
        return this.Identity.Entity;
    }

    /**
     * Whether a stage has declared this record finished — nothing further needs to happen to it,
     * whatever stages might otherwise pick it up later.
     *
     * Committing a complete record sets every downstream status field so no later stage treats it
     * as ready. Discover raises this when a source hands it a record that already carries
     * everything a use case needs, which is why "does this item need extraction" is never a rule
     * Extract itself has to know.
     */
    public get IsComplete(): boolean {
        return this._complete;
    }

    /** Raise the completion signal. Any stage may do this; it is not a special case. */
    public MarkComplete(): void {
        this._complete = true;
    }

    /**
     * Records this one produced that the platform never handed to the processor — Discover's found
     * items, a splitting reader's blocks.
     *
     * The processor commits them (live) or reports them (test), and each gets its own detail row, so
     * a Discover-into-Extract test can show per-item results.
     */
    public get Children(): readonly WorkingRecord[] {
        return this._children;
    }

    /**
     * Emit a record produced by working on this one.
     *
     * The child's identity is ephemeral until committed, exactly as this record's was before it was
     * persisted.
     */
    public AddChild(child: WorkingRecord): void {
        this._children.push(child);
    }

    /** The current value of a well-known field, or `null` if no stage has set it. */
    public Get(field: WellKnownField): WellKnownFieldValue {
        return this._fields.get(field)?.Value ?? null;
    }

    /** The full entry for a well-known field — value, confidence and provenance — if it has one. */
    public GetField(field: WellKnownField): WorkingRecordField | undefined {
        return this._fields.get(field);
    }

    /** The confidence currently attached to a field. Zero when nothing has set it. */
    public GetConfidence(field: WellKnownField): number {
        return this._fields.get(field)?.Confidence ?? 0;
    }

    /**
     * Offer a value for a well-known field, taking it only if this proposal is more trusted than
     * what is already there.
     *
     * Strictly higher wins; equal confidence leaves the existing value alone. This is what lets two
     * stages that have never heard of each other resolve a shared field correctly — neither needs
     * to know it is competing with anything, only how much to trust its own kind of finding.
     *
     * @param field The well-known field being proposed.
     * @param value The proposed value.
     * @param confidence How much the calling stage trusts it. Higher is more trusted; no ceiling.
     * @param setBy The proposing stage, e.g. `Discover.RSS`.
     * @returns True if the proposal was taken.
     */
    public Propose(field: WellKnownField, value: WellKnownFieldValue, confidence: number, setBy: string): boolean {
        const existing = this._fields.get(field);
        if (existing && existing.Confidence >= confidence) {
            return false;
        }
        this._fields.set(field, new WorkingRecordField(value, confidence, setBy));
        this._changed.add(field);
        return true;
    }

    /**
     * Set a well-known field regardless of what is already there.
     *
     * Reserved for the hydrator, which is restoring what storage already holds rather than
     * competing with it. Stages use {@link Propose}.
     */
    public Restore(field: WellKnownField, value: WellKnownFieldValue, confidence: number, setBy: string): void {
        this._fields.set(field, new WorkingRecordField(value, confidence, setBy));
    }

    /**
     * The well-known fields whose values have actually changed since hydration.
     *
     * The committer writes only these, which is what keeps a commit cheap and makes repeating one
     * harmless.
     */
    public get ChangedFields(): readonly WellKnownField[] {
        return [...this._changed];
    }

    /** Forget which fields changed. Called by the committer once it has written them. */
    public ClearChanged(): void {
        this._changed.clear();
    }

    /**
     * Read a value another stage left in the extension space.
     *
     * @param namespace The registered name of the stage that wrote it, e.g. `Extract.Html`.
     * @param key The key within that namespace.
     */
    public GetExtension<T = unknown>(namespace: string, key: string): T | undefined {
        return this._extensions.get(`${namespace}.${key}`) as T | undefined;
    }

    /**
     * Write a value into the extension space, for a later stage in the same run.
     *
     * Nothing here is persisted. A stage that needs its output to survive the run writes a
     * well-known field instead — and if none fits, that is the signal to add a real column and
     * declare the mapping once, which is additive and local to the one stage that needed it.
     *
     * Keys are namespaced under the writing stage's registered name, which is what keeps two
     * independently written stages from colliding.
     */
    public SetExtension(namespace: string, key: string, value: unknown): void {
        this._extensions.set(`${namespace}.${key}`, value);
    }

    /** Every extension key currently set, as fully-qualified `namespace.key` strings. */
    public get ExtensionKeys(): readonly string[] {
        return [...this._extensions.keys()];
    }

    /**
     * The confidence map in the shape the `FieldConfidence` column stores.
     *
     * Only fields some stage actually claimed are included. A field carrying confidence 0 — a value
     * hydrated from a row written before this column existed, or by something outside the pipeline —
     * has no provenance to record, and inventing one would misreport where the value came from. Its
     * absence already says what is true: nothing has claimed it, so any proposal wins.
     */
    public ToFieldConfidence(): FieldConfidenceMap {
        const map: FieldConfidenceMap = {};
        for (const field of WellKnownFields) {
            const entry = this._fields.get(field);
            if (entry && entry.Confidence > 0) {
                map[field] = { Score: entry.Confidence, SetBy: entry.SetBy };
            }
        }
        return map;
    }
}
