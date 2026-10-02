/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IEntitySubtypeSelectorConfig.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Declarative configuration for prospective IsA subtype resolution on an entity.
 *
 * Stored in the `SubtypeSelector` column of `MJ: Entities`.
 *
 * Used by `BaseEntity.ResolveSubtypeEntityName()` as a fallback when no runtime
 * `EntitySubtypeResolver` is registered, and by offline generators like Loom
 * that inspect metadata without executing the MJ runtime.
 *
 * @see plans/sync-composition-axes.md
 */
export interface IEntitySubtypeSelectorConfig {
    /**
     * A dotted foreign-key dereference path ending at a column whose value is an MJ entity name.
     * Empty string or null resolves to no subtype.
     *
     * Example: `"ProductID.ProductTypeID.OrderLineExtensionEntity"`
     * On an Order Line, this traverses OrderLine.ProductID -> Product.ProductTypeID -> ProductType.OrderLineExtensionEntity,
     * reading the target subtype entity name.
     */
    Path: string;

    /**
     * Whether `BaseEntity` also walks {@link Path} for a record it LOADS, not only for one it creates,
     * so the load can fetch the named child's row directly instead of first querying every child's
     * table. Optional; `false` or absent keeps loads as they were, with the discovery query.
     *
     * On load, only hops that a loaded `BaseEngine` holds as entity objects are walked. A hop that
     * isn't cached gives no hint, never a query. Turn it on when records of a subtyped type have
     * their subtype row: a record whose type names a child it has no row for costs one extra round
     * trip per load.
     *
     * Ignored while an `EntitySubtypeResolver` is registered for the entity: the resolver owns the
     * rule, and gives load hints by overriding its `ResolveLoadHint` method.
     */
    UseForLoadedRecords?: boolean;
}
