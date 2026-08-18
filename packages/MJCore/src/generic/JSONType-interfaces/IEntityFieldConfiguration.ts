/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IEntityFieldConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

export interface IEntityFieldHierarchyConfig {
    /**
     * When true, declares this self-referencing foreign key as an intentional tree hierarchy.
     * CodeGen will emit the 4-part Table-Valued Function (TVF) suite (RootID, Descendants, Ancestors, HierarchyMeta),
     * project Root/Depth/Path/IsLeaf/ChildCount columns into the base view, and generate typed GetDescendants(),
     * GetAncestors(), and GetChildren() methods on the entity subclass.
     */
    IsHierarchy?: boolean;

    /**
     * Optional custom maximum recursion depth guard (defaults to 100).
     */
    MaxDepth?: number;
}

export interface IEntityFieldConfiguration {
    /** Hierarchy and tree structure configuration for self-referencing foreign keys */
    Hierarchy?: IEntityFieldHierarchyConfig;

    /** Future extensible field-level configuration bags */
    [key: string]: unknown;
}
