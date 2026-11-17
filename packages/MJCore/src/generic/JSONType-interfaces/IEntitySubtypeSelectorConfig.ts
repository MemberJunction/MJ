/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IEntitySubtypeSelectorConfig.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Policy controlling what happens when a saved record's subtype selector now resolves to a
 * different child entity (or to no child entity when a child row already exists).
 *
 * - `'Refuse'` (default): fails the save rather than leaving or replacing the existing child row.
 * - `'Replace'`: deletes the existing child subtree and creates the newly resolved child row (if any)
 *   atomically in one transaction, recording the deletion in Record Changes.
 *
 * Moving a saved record from a type with **no** extension entity to a type **with** an extension
 * entity is always allowed under both policies.
 */
export type SubtypeSelectorChangeBehavior = 'Refuse' | 'Replace';

/**
 * Declarative configuration for resolving a per-type behavior driver class through `ClassFactory`.
 */
export interface IEntitySubtypeDriverConfig {
    /**
     * Dotted foreign-key dereference path from this entity to the column holding the driver's
     * `ClassFactory` registration key (for example, `"TypeID.DriverClass"`).
     * Empty string or null on the target row resolves to no driver.
     */
    Path: string;

    /**
     * Optional base class name under which drivers for this type family register in `ClassFactory`
     * (for example, `"ConversationTypeDriver"` or `"CommentTypeDriver"`).
     * Defaults to `"EntitySubtypeDriverBase"` when omitted.
     */
    BaseClass?: string;
}

/**
 * Declarative configuration for resolving a per-type UI component/driver class through `ClassFactory`.
 */
export interface IEntitySubtypeUIDriverConfig {
    /**
     * Dotted foreign-key dereference path from this entity to the column holding the UI driver's
     * `ClassFactory` registration key (for example, `"CommentTypeID.UIDriverClass"`).
     * Empty string or null on the target row resolves to no custom UI driver.
     */
    Path: string;
}

/**
 * Declarative configuration for prospective IsA subtype resolution and type-driven extensions on an entity.
 *
 * Stored in the `SubtypeSelector` column of `MJ: Entities`.
 *
 * Used by `BaseEntity` to resolve and auto-create IS-A child rows, enforce subtype-change policies,
 * invoke per-type behavior drivers, validate type-table extension entity references, and fold
 * subtype fields or custom UI drivers into generated forms.
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

    /**
     * When `true`, `BaseEntity.Save()` automatically creates and links the resolved IS-A child row
     * in the same transaction whenever it is missing, so callers do not need to call `EnsureISAChild()`
     * manually. Defaults to `false`.
     */
    AutoEnsureOnSave?: boolean;

    /**
     * Controls what happens when a saved record's selector resolves to a different child entity than
     * its existing child row (or resolves to `null` when a child row already exists).
     *
     * Defaults to `'Refuse'`. Moving from no extension entity (`null`) to an extension entity is
     * always allowed.
     */
    OnSubtypeChange?: SubtypeSelectorChangeBehavior;

    /**
     * Optional per-type behavior driver resolved through `ClassFactory` and cached per type.
     * `BaseEntity` invokes `Validate`, `BeforeSave`, `AfterSave`, and `OnFieldChanged` when implemented
     * on the resolved driver; type-family-specific methods live on the configured `BaseClass`.
     */
    Driver?: IEntitySubtypeDriverConfig;

    /**
     * When `true`, the parent entity's generated Angular form automatically displays the resolved
     * child entity's fields (or its {@link UIDriver} component, if configured) in a dedicated section
     * as soon as a type is selected — including on unsaved new records before their first save.
     * Defaults to `false`.
     */
    FoldIntoForm?: boolean;

    /**
     * Optional per-type UI component/driver class resolved through `ClassFactory`.
     * Used in place of generated child fields when {@link FoldIntoForm} is `true`, and usable by
     * specialized panels (such as the Notes & suggestions panel) to render records of that type.
     */
    UIDriver?: IEntitySubtypeUIDriverConfig;
}
