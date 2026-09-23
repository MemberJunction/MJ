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

    /**
     * Record cloning configuration for this field.
     * @see plans/record-cloning/README.md §4.3
     */
    Clone?: IEntityFieldCloneConfiguration;
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

/**
 * Record cloning configuration for an entity field.
 * @see plans/record-cloning/README.md §4.3
 */
export interface IEntityFieldCloneConfiguration {
    /** Copy (default) | Reset (column default, or Value) | Suffix (naming template) | Prompt | Ownership | ServerAllocated | Remap (FK inside the set → new key) | RemapJSON | Transform */
    Policy?: 'Copy' | 'Reset' | 'Suffix' | 'Prompt' | 'Ownership' | 'ServerAllocated' | 'Remap' | 'RemapJSON' | 'Transform';
    Value?: unknown;
    JsonRemap?: IJsonRemapSpec[];
    Transform?: unknown;
}

export interface IJsonRemapSpec {
    /** Path selector: dot segments and [*] for arrays, e.g. 'layout.content[*].componentState.config.viewId'. */
    Path: string;
    /** remap = rewrite via key map when the target is in the clone set, else per OnMissing; reuse = leave; regenerate = new UUID; null = set null; drop = remove element/key. */
    Mode: 'remap' | 'reuse' | 'regenerate' | 'null' | 'drop';
    /** Entity the ID refers to, for remap. */
    Entity?: string;
    /** For remap when the referenced record was not cloned: reuse the original (default) or drop the element and count it. */
    OnMissing?: 'reuse' | 'drop';
}

