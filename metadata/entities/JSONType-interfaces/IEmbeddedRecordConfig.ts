/**
 * Declares an `EntityField` (a foreign key on **this** entity) as a first-class
 * **embedded record** — a 1:1 peer `BaseEntity` that loads, validates and persists
 * as one unit with its owner.
 *
 * Stored in the `EmbeddedRecord` column of `MJ: Entity Fields`. When non-null,
 * CodeGen emits `{FieldName}_Object` / `{FieldName}_EnsureObject()` on the
 * generated entity subclass.
 *
 * **`RelatedEntity` and the FK field name are deliberately absent.** They already
 * exist as `EntityField.RelatedEntityID` and `EntityField.Name`. Duplicating them
 * here would create two sources of truth that can disagree — with the JSON copy
 * winning silently. CodeGen reads them from the row.
 *
 * **Mandatory vs optional is `EntityField.AllowsNull`**, not a flag here. A
 * non-nullable FK is provisioned with `GetEntityObject` / `NewRecord`. A nullable
 * FK stays `null` until `{FieldName}_EnsureObject()` or until `Load()` finds a
 * value.
 *
 * NULL means the field is an ordinary FK. That is the default and reproduces
 * pre-feature behaviour exactly: nothing is generated and nothing is constructed
 * at `GetEntityObject` time.
 *
 * @see packages/MJCore/docs/embedded-records.md
 * @see plans/embedded-records.md
 */
export interface IEmbeddedRecordConfig {
    /**
     * What happens to the embedded row when the owner clears the relationship
     * or is deleted. Defaults to `'orphan'`.
     *
     * - `'orphan'` — null the FK, leave the embedded row. Correct when the
     *   target is a first-class document in another bounded context (a Deal's
     *   Order).
     * - `'delete'` — delete the embedded row after the owner (the FK lives on
     *   the owner, so the owner must go first).
     * - `'refuse'` — `Clear()` throws. For relationships where detaching is
     *   always a bug.
     */
    OnClear?: 'delete' | 'orphan' | 'refuse';

    /**
     * How far `owner.Load()` walks into the embedded record. Defaults to `'inherit'`.
     *
     * - `'inherit'` — the embedded is loaded as `embedded.Load()` would: fields,
     *   IS-A chain, immediate companions, nested embeddeds. Explicit
     *   related-record collections stay explicit.
     * - `'related'` — also `LoadRelatedRecords()` on the embedded, so e.g.
     *   `deal.Load()` brings `Order.Lines` too.
     */
    LoadNested?: 'inherit' | 'related';
}
