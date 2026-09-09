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
}
