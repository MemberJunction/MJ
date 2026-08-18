import { CompositeKey } from '@memberjunction/core';

/**
 * Orientation options for the visual hierarchy layout.
 *
 * - `'top-to-bottom'`: Classical vertical tree / organizational chart (root at top, leaves at bottom).
 * - `'left-to-right'`: Horizontal branch hierarchy (root at left, leaves at right), ideal for deep taxonomies.
 */
export type HierarchyTreeOrientation = 'top-to-bottom' | 'left-to-right';

/**
 * Node card styling variant.
 *
 * - `'card'`: Detailed rectangular card with icon, title, subtitle badge, and action buttons.
 * - `'compact'`: Streamlined pill-style node card for dense taxonomies.
 */
export type HierarchyNodeStyle = 'card' | 'compact';

/**
 * Represents a single node within the visual hierarchy tree.
 *
 * Contains both domain entity data and layout/interactive state (expansion,
 * selection, highlight, descendant counts, and primary key composite mapping).
 */
export interface HierarchyNodeData<T = Record<string, unknown>> {
    /**
     * Unique string identifier for the node, typically the serialized primary key or single ID value.
     */
    ID: string;

    /**
     * The MemberJunction composite primary key representing this entity record.
     * Derived dynamically from entity metadata to support composite keys.
     */
    PrimaryKey: CompositeKey;

    /**
     * Primary display label for the node card (e.g. Organization Name, Category Name).
     */
    Name: string;

    /**
     * Optional secondary subtitle or description (e.g. Type, Account Code, Role).
     */
    Subtitle?: string;

    /**
     * Font Awesome icon class or image URL displayed in the node card header (e.g. `'fa-solid fa-building'`).
     */
    Icon?: string;

    /**
     * Accent color hex or CSS variable string for the node's visual badge and border indicator.
     */
    Color?: string;

    /**
     * The primary key string of the parent node, or `null`/`undefined` for root nodes.
     */
    ParentID?: string | null;

    /**
     * Number of immediate direct child nodes.
     */
    DirectChildCount: number;

    /**
     * Total recursive count of all descendants under this subtree.
     */
    TotalDescendantCount: number;

    /**
     * The depth level of this node within the hierarchy (0 for root nodes).
     */
    Depth: number;

    /**
     * Whether this node's children are currently expanded (`true`) or collapsed (`false`).
     */
    IsExpanded: boolean;

    /**
     * Whether this node is currently selected/active in the view.
     */
    IsSelected: boolean;

    /**
     * Whether this node matches an active search query or highlighted path.
     */
    IsHighlighted: boolean;

    /**
     * Whether this node is currently set as the temporary focused subtree root.
     */
    IsFocusRoot: boolean;

    /**
     * The underlying MemberJunction entity instance or record object if loaded.
     */
    Record?: T;

    /**
     * Currently visible child nodes in the visual layout.
     */
    Children: HierarchyNodeData<T>[];

    /**
     * Full set of child nodes preserved when the node is collapsed.
     * @internal
     */
    _allChildren?: HierarchyNodeData<T>[];

    /**
     * Layout coordinate X computed by D3.
     * @internal
     */
    x?: number;

    /**
     * Layout coordinate Y computed by D3.
     * @internal
     */
    y?: number;
}

/**
 * Declarative configuration options for the {@link HierarchyTreeComponent}.
 */
export interface HierarchyTreeConfig {
    /**
     * The MemberJunction entity name (e.g. `'MJ_BizApps_Common: Organizations'`, `'MJ_BizApps_Orders: Product Categories'`).
     * The component queries this entity and uses its metadata for primary keys and foreign keys.
     */
    EntityName: string;

    /**
     * The self-referencing foreign key field name that points to the parent record (e.g. `'ParentID'`, `'ParentCategoryID'`).
     * If omitted, defaults to `'ParentID'` or automatically resolves from the entity's self-referencing foreign key metadata.
     */
    ParentField?: string;

    /**
     * The field name to use for the primary node label.
     * If omitted, automatically defaults to the entity's configured `NameField` / `IsNameField`.
     */
    NameField?: string;

    /**
     * Optional field name to use for the node subtitle / secondary tag (e.g. `'OrganizationType'`, `'AccountCode'`).
     */
    SubtitleField?: string;

    /**
     * Optional field name containing a Font Awesome icon class or image URL.
     */
    IconField?: string;

    /**
     * Default Font Awesome icon class when a node does not provide one.
     * @default `'fa-solid fa-sitemap'`
     */
    DefaultIcon?: string;

    /**
     * Optional field name containing a hex color or theme token for the node accent.
     */
    ColorField?: string;

    /**
     * Default accent color when a node does not provide one.
     * @default `'#38bdf8'`
     */
    DefaultColor?: string;

    /**
     * Optional SQL-like filter string applied to the `RunView` query (e.g. `'IsActive = 1'`).
     */
    ExtraFilter?: string;

    /**
     * Optional order-by clause for sorting sibling nodes (e.g. `'Name ASC'`, `'Sequence ASC'`).
     * @default `'Name ASC'`
     */
    OrderBy?: string;

    /**
     * Optional maximum number of rows to retrieve via `RunView`. `0` loads all records.
     * @default 0
     */
    MaxRows?: number;

    /**
     * Optional active / selected record ID. When provided, the node is highlighted and all ancestors
     * are expanded so it is visible in full tree context.
     */
    ActiveRecordID?: string;

    /**
     * Optional subtree focus record ID. When provided, the tree renders only the specified record and its descendants.
     */
    FocusRecordID?: string;

    /**
     * Layout orientation.
     * @default `'top-to-bottom'`
     */
    Orientation?: HierarchyTreeOrientation;

    /**
     * Visual style for node cards.
     * @default `'card'`
     */
    NodeStyle?: HierarchyNodeStyle;

    /**
     * Whether to allow interactive drag-and-drop reparenting of nodes.
     * @default false
     */
    AllowDragDropReparent?: boolean;

    /**
     * Whether to display quick node action buttons (Open Record, Add Child, Focus Subtree) on node cards.
     * @default true
     */
    AllowNodeActions?: boolean;

    /**
     * Whether to display the interactive search / filter bar at the top of the tree.
     * @default true
     */
    ShowSearch?: boolean;

    /**
     * Whether to display the zoom / navigation toolbar (Fit, Zoom In, Zoom Out, Expand All, Collapse All).
     * @default true
     */
    ShowToolbar?: boolean;

    /**
     * Maximum depth to expand initially upon loading. `0` expands all levels.
     * @default 0
     */
    InitialExpandDepth?: number;

    /**
     * Width of individual node cards in pixels.
     * @default 230
     */
    NodeWidth?: number;

    /**
     * Height of individual node cards in pixels.
     * @default 90
     */
    NodeHeight?: number;

    /**
     * Horizontal spacing between sibling nodes in pixels.
     * @default 40
     */
    SiblingSpacing?: number;

    /**
     * Vertical spacing between hierarchy depth levels in pixels.
     * @default 70
     */
    LevelSpacing?: number;

    /**
     * Total height of the tree container (e.g. `'100%'`, `'560px'`).
     * @default `'100%'`
     */
    Height?: string;

    /**
     * Minimum height of the tree container.
     * @default `'500px'`
     */
    MinHeight?: string;

    /**
     * Whether single-clicking a node card triggers navigation to that record.
     * @default true
     */
    NavigateOnNodeClick?: boolean;

    /**
     * When multiple root trees exist and an active/focus record is specified,
     * automatically focuses on the root branch containing the active record.
     * Users can click "Show All Roots" to zoom out to the full forest.
     * @default true
     */
    AutoRootFocus?: boolean;

    /**
     * Whether to enable verbose diagnostic console logging.
     * @default false
     */
    Verbose?: boolean;
}
