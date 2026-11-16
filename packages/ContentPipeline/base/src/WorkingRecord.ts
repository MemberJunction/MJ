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
 * Passed from stage to stage. Stages never touch storage: `WorkingRecordHydrator` builds one from a row and
 * `WorkingRecordCommitter` writes the changes back, which is what lets the same stage code run live or as a test.
 *
 * @example
 * ```ts
 * record.Propose('Title', parsed.heading, 6, 'Extract.Html');   // persisted, competes on confidence
 * record.SetExtension('Extract.Html', 'headingDepth', 2);       // in memory, for a later stage
 * ```
 */
export class WorkingRecord {
    private readonly _fields = new Map<WellKnownField, WorkingRecordField>();
    private readonly _extensions = new Map<string, unknown>();
    private readonly _changed = new Set<WellKnownField>();
    private readonly _children: WorkingRecord[] = [];
    private _complete = false;

    constructor(public readonly Identity: WorkingRecordIdentity) {}

    public get Entity(): WorkingRecordEntity {
        return this.Identity.Entity;
    }

    /**
     * A stage has declared this record finished: committing it marks every other pending status Skipped.
     * Discover raises it when a source already supplies everything a use case needs.
     */
    public get IsComplete(): boolean {
        return this._complete;
    }

    public MarkComplete(): void {
        this._complete = true;
    }

    /** Records produced from this one — Discover's items, an archive's members, a document's chunks. */
    public get Children(): readonly WorkingRecord[] {
        return this._children;
    }

    public AddChild(child: WorkingRecord): void {
        this._children.push(child);
    }

    /** A well-known field's value, or `null` if nothing has set it. */
    public Get(field: WellKnownField): WellKnownFieldValue {
        return this._fields.get(field)?.Value ?? null;
    }

    public GetField(field: WellKnownField): WorkingRecordField | undefined {
        return this._fields.get(field);
    }

    /** The field's confidence; 0 when nothing has set it. */
    public GetConfidence(field: WellKnownField): number {
        return this._fields.get(field)?.Confidence ?? 0;
    }

    /**
     * Offer a value; it is taken if `confidence` is strictly higher than the current one, or when the
     * proposing stage is replacing a value that the same stage wrote on a prior run (hydrated via
     * {@link Restore}). That lets two stages resolve a shared field on merit while allowing a stage to
     * refresh its own output on re-execution.
     *
     * @returns True if the proposal was taken.
     */
    public Propose(field: WellKnownField, value: WellKnownFieldValue, confidence: number, setBy: string): boolean {
        const existing = this._fields.get(field);
        const sameStage =
            existing != null &&
            (existing.SetBy === setBy || (!this._changed.has(field) && existing.SetBy.split('.')[0] === setBy.split('.')[0]));
        if (existing && (sameStage ? (!this._changed.has(field) ? false : existing.Confidence > confidence) : existing.Confidence >= confidence)) {
            return false;
        }
        this._fields.set(field, new WorkingRecordField(value, confidence, setBy));
        this._changed.add(field);
        return true;
    }

    /** Set a field unconditionally. For the hydrator, which restores what storage already holds. */
    public Restore(field: WellKnownField, value: WellKnownFieldValue, confidence: number, setBy: string): void {
        this._fields.set(field, new WorkingRecordField(value, confidence, setBy));
    }

    /** Fields changed since hydration — the only ones the committer writes. */
    public get ChangedFields(): readonly WellKnownField[] {
        return [...this._changed];
    }

    public ClearChanged(): void {
        this._changed.clear();
    }

    /** Read an in-memory value a stage left for a later one. `namespace` is the writing stage's name. */
    public GetExtension<T = unknown>(namespace: string, key: string): T | undefined {
        return this._extensions.get(`${namespace}.${key}`) as T | undefined;
    }

    /** Leave an in-memory value for a later stage in this run. Never persisted. */
    public SetExtension(namespace: string, key: string, value: unknown): void {
        this._extensions.set(`${namespace}.${key}`, value);
    }

    /** Every extension key set, as `namespace.key`. */
    public get ExtensionKeys(): readonly string[] {
        return [...this._extensions.keys()];
    }

    /**
     * The `FieldConfidence` column's value. Fields at confidence 0 (hydrated from rows written outside the
     * pipeline) are left out — they have no provenance to record.
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
