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
 * pre-6.2 behavior exactly: nothing is generated and nothing loads eagerly.
 *
 * @see guides/TRANSACTIONS_AND_BATCHING_GUIDE.md
 */
export interface IRelatedRecordCollectionConfig {
    /**
     * The property name generated on the entity subclass, and the companion's stable wire key —
     * e.g. `'Lines'` produces `order.Lines`.
     *
     * **This is a published contract.** It appears in serialized composite payloads, so renaming it
     * breaks in-flight requests and any persisted snapshot that captured one. Must be unique among
     * the collections declared on a single entity.
     */
    Name: string;

    /**
     * Where the collection's records come from. Defaults to `'database'`.
     *
     * - `'database'` — a `RunView` against the related entity, filtered by the join field. Always
     *   correct, always fresh, costs a query. The right choice for transactional data (order lines,
     *   journal entry lines) where staleness is unacceptable.
     * - `'cache'` — the records are taken from whichever loaded `BaseEngine` already holds that
     *   entity, discovered generically through `BaseEngineRegistry.FindCachedEntity()`. Costs **zero
     *   queries**. The right choice for metadata-shaped data that an engine preloads anyway —
     *   action params, prompt models, API key scopes. Falls back to `'database'` when no loaded
     *   engine offers the entity, so a cache miss degrades instead of failing.
     *
     * Not called `'query'` deliberately: in MemberJunction a *Query* is a stored, named artifact
     * (`MJ: Queries`, `RunQuery`), so `Source: 'query'` would read as "this comes from a stored
     * Query" — a different thing entirely.
     */
    Source?: 'database' | 'cache';

    /**
     * Whether the collection refuses mutation. Defaults to `false`, **except when
     * {@link Source} is `'cache'`, where it defaults to `true`.**
     *
     * When `true`: `Add`, `Create`, `Remove` and `Clear` throw, the collection contributes nothing
     * to a save plan, and `Dirty` stays `false`. That last part is not
     * cosmetic — a cache-sourced collection holds the *engine's own entity instances*, so a record
     * dirtied by some unrelated code path would otherwise make every parent holding it report dirty
     * and try to save.
     *
     * **What this cannot enforce:** once you hold a `BaseEntity` you can set fields on it and call
     * `Save()`. Read-only constrains the *collection*, not the records inside it. Which is why the
     * source matters:
     *
     * - `'cache'` + read-only → you get the engine's shared instances. Zero allocation, and the
     *   contract is "do not mutate these".
     * - `'cache'` + writable → the records are **copied** into fresh entity objects on load, so the
     *   engine's cache is never mutated in place. Saving a copy fires the ordinary `BaseEntity`
     *   save event, which the engines already subscribe to, so their caches refresh themselves.
     * - `'database'` → always fresh objects; none of this applies.
     */
    ReadOnly?: boolean;

    /**
     * When the collection populates itself. Defaults to `'explicit'`.
     *
     * - `'explicit'` — nothing loads until the caller awaits `Load()` or
     *   `BaseEntity.LoadRelatedRecords()`. **The right default for `'database'`**: an
     *   automatically-populated collection on a commonly-listed entity is a performance trap.
     * - `'immediate'` — populated automatically by `Load()`. Never by `LoadFromData()`, which is the
     *   per-row materialization path for `RunView(ResultType:'entity_object')` — loading related
     *   records there turns one view into N+1 queries. Use `RunView.IncludeRelatedRecords` for
     *   result sets, which costs 1+K instead.
     * - `'lazy'` — populated on first access to `Items`. **Requires `Source: 'cache'`**, and CodeGen
     *   refuses the combination with `'database'`: a property getter cannot await, so a lazy
     *   database load could only ever silently fail to fill. A cache lookup is synchronous, so lazy
     *   works there — and reproduces exactly the hand-written memoized getters this replaces.
     * - `'never'` — a write-only staging buffer; `Load()` is a no-op.
     *
     * Note that `'lazy'` makes reading `Items` a side-effecting operation: it populates the
     * collection and flips `IsLoaded`. That is deliberate and matches the getters it supersedes.
     */
    Load?: 'explicit' | 'immediate' | 'lazy' | 'never';

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
