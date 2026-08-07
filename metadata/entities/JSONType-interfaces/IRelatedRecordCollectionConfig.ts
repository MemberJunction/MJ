/**
 * Declares an `EntityRelationship` as a first-class **related-record collection** — a set of child
 * rows that load, validate and persist as one unit with their parent.
 *
 * Stored in the `RelatedRecordCollection` column of the `MJ: Entity Relationships` entity. When
 * non-null, CodeGen emits a typed declaration onto the generated entity subclass:
 *
 * ```typescript
 * public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
 *     Name: 'Lines',
 *     RelatedEntity: 'MJ_BizApps_Orders: Order Lines',   // from EntityRelationship.RelatedEntity
 *     RelatedEntityJoinField: 'OrderHeaderID',           // from EntityRelationship.RelatedEntityJoinField
 *     OrderBy: 'LineNumber ASC',
 *     Load: 'explicit',
 *     OnRemove: 'delete',
 *     Sequence: { Field: 'LineNumber', From: 1 },
 * });
 * ```
 *
 * **`RelatedEntity` and `RelatedEntityJoinField` are deliberately absent from this interface.** They
 * already exist as columns on the same `EntityRelationship` row, and duplicating them here would
 * create two sources of truth that can disagree — with the JSON copy winning silently. CodeGen reads
 * them from the row's own columns.
 *
 * NULL means the relationship is not a declared collection. That is the default and reproduces
 * pre-6.2 behaviour exactly: nothing is generated and nothing loads eagerly.
 *
 * @see guides/TRANSACTIONS_AND_BATCHING_GUIDE.md
 */
export interface IRelatedRecordCollectionConfig {
    /**
     * The property name generated on the entity subclass, and the companion's stable wire key —
     * e.g. `'Lines'` produces `order.Lines`.
     *
     * **This is a published contract.** It appears in serialised composite payloads, so renaming it
     * breaks in-flight requests and any persisted snapshot that captured one. Must be unique among
     * the collections declared on a single entity.
     */
    Name: string;

    /**
     * When the collection populates itself from the database. Defaults to `'explicit'`.
     *
     * - `'explicit'` — nothing loads until the caller awaits `Load()`. **The right default**: an
     *   eager collection on a commonly-listed entity is a performance trap.
     * - `'eager'` — populated automatically by `Load()`. Never by `LoadFromData()`, which is the
     *   per-row materialisation path for `RunView(ResultType:'entity_object')` — loading children
     *   there turns one view into N+1 queries. Use `RunView.IncludeRelatedRecords` for result sets,
     *   which costs 1+K instead.
     * - `'never'` — a write-only staging buffer; `Load()` is a no-op.
     */
    Load?: 'explicit' | 'eager' | 'never';

    /**
     * What removing a record from the collection means. Defaults to `'delete'`.
     *
     * - `'delete'` — the row is deleted when the parent saves. Correct for true composition, where
     *   the related record has no meaning without its parent (order lines, journal entry lines).
     * - `'orphan'` — the row is left in place, foreign key untouched. Correct for aggregation.
     * - `'refuse'` — removal throws. For collections where detaching is always a bug.
     */
    OnRemove?: 'delete' | 'orphan' | 'refuse';

    /**
     * `OrderBy` clause applied when loading, e.g. `'LineNumber ASC'`. Strongly recommended whenever
     * {@link Sequence} is set — a sequenced collection loaded in arbitrary order will be renumbered
     * into that arbitrary order on the next mutation.
     */
    OrderBy?: string;

    /** Automatic, gap-free sequence numbering maintained across adds and removals. */
    Sequence?: {
        /** The related entity's sequence field, e.g. `'LineNumber'`. */
        Field: string;
        /** Value assigned to the first record. Defaults to 1. */
        From?: number;
    };

    /**
     * Whether the collection empties itself after a successful save. Defaults to `false`.
     *
     * `true` models a staging buffer for pending inserts rather than a live view of persisted rows —
     * the shape order-line entry uses today. `false` keeps saved records in memory with their
     * server-assigned keys, which is what most callers expect.
     */
    ClearAfterSave?: boolean;
}
