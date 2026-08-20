/**
 * Optional per-field configuration bag.
 *
 * Stored as JSON in `MJ: Entity Fields.Configuration`. CodeGen emits a
 * typed `ConfigurationObject` accessor on `MJEntityFieldEntity` that
 * returns `IEntityFieldConfiguration | null`.
 */
export interface IEntityFieldConfiguration {
    /**
     * Hierarchy and tree structure configuration for self-referencing foreign keys.
     */
    Hierarchy?: IEntityFieldHierarchyConfig;
}

/**
 * Hierarchy options to explicitly declare recursive tree hierarchies.
 */
export interface IEntityFieldHierarchyConfig {
    /**
     * When true, declares this self-referencing foreign key as an intentional tree hierarchy.
     */
    IsHierarchy?: boolean;

    /**
     * Optional custom maximum recursion depth guard (defaults to 100).
     */
    MaxDepth?: number;
}
