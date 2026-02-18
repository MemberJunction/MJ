/**
 * Tree Types and Interfaces for @memberjunction/ng-trees
 */

// ========================================
// Entity Configuration Types
// ========================================

/**
 * Configuration for the tree's branch (category/folder) entity.
 * Branches can contain other branches and/or leaf nodes.
 */
export interface TreeBranchConfig {
    /** Entity name for branch nodes (e.g., 'MJ: Query Categories') */
    EntityName: string;

    /** Field to display as node label (default: 'Name') */
    DisplayField?: string;

    /** Primary key field (default: 'ID') */
    IDField?: string;

    /** Parent ID field for hierarchy (default: 'ParentID') */
    ParentIDField?: string;

    /** Field name for node icon (dynamic per-node) */
    IconField?: string;

    /** Static icon if IconField not provided (default: 'fa-solid fa-folder') */
    DefaultIcon?: string;

    /** Field name for icon/folder color */
    ColorField?: string;

    /** Default color if ColorField not provided */
    DefaultColor?: string;

    /** Optional extra filter for RunView */
    ExtraFilter?: string;

    /** Optional order by clause (default: 'Name ASC') */
    OrderBy?: string;

    /** Optional field to show as secondary text/description */
    DescriptionField?: string;

    /** Optional field for badge/count display */
    BadgeField?: string;

    /** Whether to cache results locally (default: true) */
    CacheLocal?: boolean;
}

/**
 * Configuration for M2M junction table relationships.
 * Used when leaves relate to branches through an intermediate junction table.
 */
export interface TreeJunctionConfig {
    /** Junction entity name (e.g., 'MJ: Collection Artifacts') */
    EntityName: string;

    /** Field in junction that references the leaf entity (e.g., 'ArtifactVersionID') */
    LeafForeignKey: string;

    /** Field in junction that references the branch entity (e.g., 'CollectionID') */
    BranchForeignKey: string;

    /** Optional extra filter for the junction query */
    ExtraFilter?: string;

    /** Whether to cache junction results locally (default: true) */
    CacheLocal?: boolean;

    /**
     * Optional indirect mapping when junction references an intermediate entity.
     * Example: CollectionArtifact.ArtifactVersionID -> ArtifactVersion.ArtifactID -> Artifact.ID
     */
    IndirectLeafMapping?: {
        /** Intermediate entity name (e.g., 'MJ: Artifact Versions') */
        IntermediateEntity: string;

        /** ID field in intermediate entity that junction references (e.g., 'ID') */
        IntermediateIDField: string;

        /** Field in intermediate entity that points to the actual leaf (e.g., 'ArtifactID') */
        LeafIDField: string;

        /** Optional extra filter for the intermediate entity query */
        ExtraFilter?: string;

        /** Whether to cache intermediate results locally (default: true) */
        CacheLocal?: boolean;
    };
}

/**
 * Configuration for the tree's leaf entity (optional).
 * Leaf nodes are the selectable items within branch nodes.
 */
export interface TreeLeafConfig {
    /** Entity name for leaf nodes (e.g., 'Queries') */
    EntityName: string;

    /**
     * Field that links to parent branch (e.g., 'CategoryID').
     * Leave empty string if using JunctionConfig for M2M relationships.
     */
    ParentField: string;

    /** Field to display as node label (default: 'Name') */
    DisplayField?: string;

    /** Primary key field (default: 'ID') */
    IDField?: string;

    /** Field name for node icon (dynamic per-node) */
    IconField?: string;

    /** Static icon for all leaves (default: 'fa-solid fa-file') */
    DefaultIcon?: string;

    /** Optional extra filter for RunView */
    ExtraFilter?: string;

    /** Optional order by clause (default: 'Name ASC') */
    OrderBy?: string;

    /** Optional field to show as secondary text/description */
    DescriptionField?: string;

    /** Optional field for badge/count display */
    BadgeField?: string;

    /**
     * Optional M2M junction configuration for indirect parent relationships.
     * When specified, leaves are parented to branches based on junction table lookups
     * instead of using the direct ParentField.
     */
    JunctionConfig?: TreeJunctionConfig;

    /** Whether to cache results locally (default: true) */
    CacheLocal?: boolean;
}

// ========================================
// Tree Node Types
// ========================================

/**
 * Node type identifier
 */
export type TreeNodeType = 'branch' | 'leaf';

/**
 * Internal tree node representation
 */
export interface TreeNode {
    /** Unique identifier */
    ID: string;

    /** Display text (from DisplayField) */
    Label: string;

    /** Node type: branch (folder) or leaf (item) */
    Type: TreeNodeType;

    /** Parent node ID (null for root nodes) */
    ParentID: string | null;

    /** Icon class (Font Awesome or similar) */
    Icon: string;

    /** Icon color (CSS color value) */
    Color?: string;

    /** Original entity data for custom access */
    Data: Record<string, unknown>;

    /** Child nodes (branches and/or leaves) */
    Children: TreeNode[];

    /** UI state: is node expanded */
    Expanded: boolean;

    /** UI state: is node selected */
    Selected: boolean;

    /** Depth level (0 = root) */
    Level: number;

    /** Is this node currently loading children */
    Loading: boolean;

    /** Secondary description text */
    Description?: string;

    /** Badge text (e.g., count) */
    Badge?: string;

    /** Is this node visible (for filtering) */
    Visible: boolean;

    /** Does this node match the current search */
    MatchesSearch: boolean;

    /** Entity name this node came from */
    EntityName: string;
}

// ========================================
// Selection Types
// ========================================

/**
 * Selection mode for the tree
 */
export type TreeSelectionMode = 'single' | 'multiple' | 'none';

/**
 * What node types can be selected
 */
export type TreeSelectableTypes = 'branch' | 'leaf' | 'both';

// ========================================
// Component Configuration Types
// ========================================

/**
 * CSS class overrides for tree styling
 */
export interface TreeStyleConfig {
    /** Class for the tree container */
    ContainerClass?: string;

    /** Class for tree nodes */
    NodeClass?: string;

    /** Class for selected nodes */
    SelectedClass?: string;

    /** Class for hovered nodes */
    HoverClass?: string;

    /** Class for branch nodes */
    BranchClass?: string;

    /** Class for leaf nodes */
    LeafClass?: string;

    /** Class for expanded branches */
    ExpandedClass?: string;

    /** Class for the dropdown container */
    DropdownClass?: string;

    /** Class for the search input */
    SearchInputClass?: string;
}

/**
 * Keyboard navigation configuration
 */
export interface TreeKeyboardConfig {
    /** Enable keyboard navigation (default: true) */
    Enabled?: boolean;

    /** Enable type-ahead search (default: true) */
    TypeAhead?: boolean;

    /** Key to expand node (default: 'ArrowRight') */
    ExpandKey?: string;

    /** Key to collapse node (default: 'ArrowLeft') */
    CollapseKey?: string;

    /** Key to select node (default: 'Enter' or 'Space') */
    SelectKey?: string;
}

// ========================================
// Dropdown Configuration Types
// ========================================

/**
 * Dropdown positioning preference
 */
export type DropdownPosition = 'auto' | 'below' | 'above';

/**
 * Configuration for dropdown behavior
 */
export interface TreeDropdownConfig {
    /** Preferred position (default: 'auto') */
    Position?: DropdownPosition;

    /** Max height of dropdown (default: '300px') */
    MaxHeight?: string;

    /** Min width of dropdown (default: match input) */
    MinWidth?: string;

    /** Close on outside click (default: true) */
    CloseOnOutsideClick?: boolean;

    /** Close on selection (single mode only, default: true) */
    CloseOnSelect?: boolean;

    /** Close on escape key (default: true) */
    CloseOnEscape?: boolean;

    /** Animation duration in ms (default: 150) */
    AnimationDuration?: number;
}

// ========================================
// Search Configuration Types
// ========================================

/**
 * Configuration for search behavior
 */
export interface TreeSearchConfig {
    /** Enable search (default: true for dropdown) */
    Enabled?: boolean;

    /** Placeholder text */
    Placeholder?: string;

    /** Minimum characters to trigger search (default: 1) */
    MinLength?: number;

    /** Debounce time in ms (default: 200) */
    DebounceMs?: number;

    /** Search branches (default: true) */
    SearchBranches?: boolean;

    /** Search leaves (default: true) */
    SearchLeaves?: boolean;

    /** Case sensitive search (default: false) */
    CaseSensitive?: boolean;

    /** Search in description field too (default: false) */
    SearchDescription?: boolean;

    /** Highlight matching text (default: true) */
    HighlightMatches?: boolean;

    /** Auto-expand to show matches (default: true) */
    AutoExpandMatches?: boolean;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Create a default TreeNode
 */
export function createDefaultTreeNode(partial: Partial<TreeNode> = {}): TreeNode {
    return {
        ID: '',
        Label: '',
        Type: 'branch',
        ParentID: null,
        Icon: 'fa-solid fa-folder',
        Data: {},
        Children: [],
        Expanded: false,
        Selected: false,
        Level: 0,
        Loading: false,
        Visible: true,
        MatchesSearch: false,
        EntityName: '',
        ...partial
    };
}

/**
 * Create default branch config with sensible defaults
 */
export function createDefaultBranchConfig(partial: Partial<TreeBranchConfig> = {}): TreeBranchConfig {
    return {
        EntityName: '',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        OrderBy: 'Name ASC',
        ...partial
    };
}

/**
 * Create default leaf config with sensible defaults
 */
export function createDefaultLeafConfig(partial: Partial<TreeLeafConfig> = {}): TreeLeafConfig {
    return {
        EntityName: '',
        ParentField: '',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-file',
        OrderBy: 'Name ASC',
        ...partial
    };
}
