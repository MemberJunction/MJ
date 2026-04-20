/**
 * Tree Event System for @memberjunction/ng-trees
 *
 * Follows the Before/After cancelable event pattern from entity-data-grid.
 * Before events can be canceled, After events are informational.
 */

import { TreeNode, TreeBranchConfig, TreeLeafConfig } from '../models/tree-types';

// Forward declaration to avoid circular dependency
export type TreeComponentRef = unknown;

// ========================================
// Base Event Classes
// ========================================

/**
 * Base class for all tree events
 */
export class TreeEventArgs {
    /** The tree component that raised the event */
    readonly Tree: TreeComponentRef;

    /** Timestamp when event was raised */
    readonly Timestamp: Date;

    constructor(tree: TreeComponentRef) {
        this.Tree = tree;
        this.Timestamp = new Date();
    }
}

/**
 * Base class for cancelable events (Before events)
 */
export class CancelableTreeEventArgs extends TreeEventArgs {
    /** Set to true to cancel the operation */
    Cancel: boolean = false;

    /** Optional reason for cancellation (for logging/debugging) */
    CancelReason?: string;

    constructor(tree: TreeComponentRef) {
        super(tree);
    }
}

/**
 * Base class for node-related events
 */
export class NodeEventArgs extends TreeEventArgs {
    /** The node involved in the event */
    readonly Node: TreeNode;

    constructor(tree: TreeComponentRef, node: TreeNode) {
        super(tree);
        this.Node = node;
    }
}

/**
 * Base class for cancelable node events
 */
export class CancelableNodeEventArgs extends NodeEventArgs {
    /** Set to true to cancel the operation */
    Cancel: boolean = false;

    /** Optional reason for cancellation */
    CancelReason?: string;

    constructor(tree: TreeComponentRef, node: TreeNode) {
        super(tree, node);
    }
}

// ========================================
// Node Selection Events
// ========================================

/**
 * Fired before a node is selected - can be canceled
 */
export class BeforeNodeSelectEventArgs extends CancelableNodeEventArgs {
    /** Whether this is adding to selection (multi-select) or replacing */
    readonly IsAdditive: boolean;

    /** Current selection before this change */
    readonly CurrentSelection: TreeNode[];

    constructor(
        tree: TreeComponentRef,
        node: TreeNode,
        isAdditive: boolean,
        currentSelection: TreeNode[]
    ) {
        super(tree, node);
        this.IsAdditive = isAdditive;
        this.CurrentSelection = [...currentSelection];
    }
}

/**
 * Fired after a node is selected
 */
export class AfterNodeSelectEventArgs extends NodeEventArgs {
    /** Whether this was additive selection */
    readonly WasAdditive: boolean;

    /** New selection state */
    readonly NewSelection: TreeNode[];

    /** Previous selection state */
    readonly PreviousSelection: TreeNode[];

    constructor(
        tree: TreeComponentRef,
        node: TreeNode,
        wasAdditive: boolean,
        newSelection: TreeNode[],
        previousSelection: TreeNode[]
    ) {
        super(tree, node);
        this.WasAdditive = wasAdditive;
        this.NewSelection = [...newSelection];
        this.PreviousSelection = [...previousSelection];
    }
}

/**
 * Fired before a node is deselected - can be canceled
 */
export class BeforeNodeDeselectEventArgs extends CancelableNodeEventArgs {
    /** Current selection before this change */
    readonly CurrentSelection: TreeNode[];

    constructor(
        tree: TreeComponentRef,
        node: TreeNode,
        currentSelection: TreeNode[]
    ) {
        super(tree, node);
        this.CurrentSelection = [...currentSelection];
    }
}

/**
 * Fired after a node is deselected
 */
export class AfterNodeDeselectEventArgs extends NodeEventArgs {
    /** New selection state */
    readonly NewSelection: TreeNode[];

    /** Previous selection state */
    readonly PreviousSelection: TreeNode[];

    constructor(
        tree: TreeComponentRef,
        node: TreeNode,
        newSelection: TreeNode[],
        previousSelection: TreeNode[]
    ) {
        super(tree, node);
        this.NewSelection = [...newSelection];
        this.PreviousSelection = [...previousSelection];
    }
}

// ========================================
// Node Expand/Collapse Events
// ========================================

/**
 * Fired before a node is expanded - can be canceled
 */
export class BeforeNodeExpandEventArgs extends CancelableNodeEventArgs {
    constructor(tree: TreeComponentRef, node: TreeNode) {
        super(tree, node);
    }
}

/**
 * Fired after a node is expanded
 */
export class AfterNodeExpandEventArgs extends NodeEventArgs {
    /** Number of visible children after expansion */
    readonly ChildCount: number;

    constructor(tree: TreeComponentRef, node: TreeNode, childCount: number) {
        super(tree, node);
        this.ChildCount = childCount;
    }
}

/**
 * Fired before a node is collapsed - can be canceled
 */
export class BeforeNodeCollapseEventArgs extends CancelableNodeEventArgs {
    constructor(tree: TreeComponentRef, node: TreeNode) {
        super(tree, node);
    }
}

/**
 * Fired after a node is collapsed
 */
export class AfterNodeCollapseEventArgs extends NodeEventArgs {
    constructor(tree: TreeComponentRef, node: TreeNode) {
        super(tree, node);
    }
}

// ========================================
// Node Click Events
// ========================================

/**
 * Fired before a node click is processed - can be canceled
 */
export class BeforeNodeClickEventArgs extends CancelableNodeEventArgs {
    /** The mouse event */
    readonly MouseEvent: MouseEvent;

    constructor(tree: TreeComponentRef, node: TreeNode, mouseEvent: MouseEvent) {
        super(tree, node);
        this.MouseEvent = mouseEvent;
    }
}

/**
 * Fired after a node click
 */
export class AfterNodeClickEventArgs extends NodeEventArgs {
    /** The mouse event */
    readonly MouseEvent: MouseEvent;

    constructor(tree: TreeComponentRef, node: TreeNode, mouseEvent: MouseEvent) {
        super(tree, node);
        this.MouseEvent = mouseEvent;
    }
}

/**
 * Fired before a node double-click - can be canceled
 */
export class BeforeNodeDoubleClickEventArgs extends CancelableNodeEventArgs {
    /** The mouse event */
    readonly MouseEvent: MouseEvent;

    constructor(tree: TreeComponentRef, node: TreeNode, mouseEvent: MouseEvent) {
        super(tree, node);
        this.MouseEvent = mouseEvent;
    }
}

/**
 * Fired after a node double-click
 */
export class AfterNodeDoubleClickEventArgs extends NodeEventArgs {
    /** The mouse event */
    readonly MouseEvent: MouseEvent;

    constructor(tree: TreeComponentRef, node: TreeNode, mouseEvent: MouseEvent) {
        super(tree, node);
        this.MouseEvent = mouseEvent;
    }
}

// ========================================
// Data Loading Events
// ========================================

/**
 * Fired before data load - can be canceled or configs modified
 */
export class BeforeDataLoadEventArgs extends CancelableTreeEventArgs {
    /** The branch configuration that will be used */
    readonly BranchConfig: TreeBranchConfig;

    /** The leaf configuration that will be used (if any) */
    readonly LeafConfig?: TreeLeafConfig;

    /** Set to modify the extra filter for branches */
    ModifiedBranchFilter?: string;

    /** Set to modify the extra filter for leaves */
    ModifiedLeafFilter?: string;

    constructor(
        tree: TreeComponentRef,
        branchConfig: TreeBranchConfig,
        leafConfig?: TreeLeafConfig
    ) {
        super(tree);
        this.BranchConfig = { ...branchConfig };
        this.LeafConfig = leafConfig ? { ...leafConfig } : undefined;
    }
}

/**
 * Fired after data load
 */
export class AfterDataLoadEventArgs extends TreeEventArgs {
    /** Whether the load was successful */
    readonly Success: boolean;

    /** Total number of branch nodes loaded */
    readonly BranchCount: number;

    /** Total number of leaf nodes loaded */
    readonly LeafCount: number;

    /** Total number of all nodes */
    readonly TotalNodes: number;

    /** Time taken to load in milliseconds */
    readonly LoadTimeMs: number;

    /** Error message if load failed */
    readonly Error?: string;

    constructor(
        tree: TreeComponentRef,
        success: boolean,
        branchCount: number,
        leafCount: number,
        loadTimeMs: number,
        error?: string
    ) {
        super(tree);
        this.Success = success;
        this.BranchCount = branchCount;
        this.LeafCount = leafCount;
        this.TotalNodes = branchCount + leafCount;
        this.LoadTimeMs = loadTimeMs;
        this.Error = error;
    }
}

// ========================================
// Search Events
// ========================================

/**
 * Fired before search is applied - can be canceled or modified
 */
export class BeforeSearchEventArgs extends CancelableTreeEventArgs {
    /** The search text entered */
    readonly SearchText: string;

    /** Set to modify the search text */
    ModifiedSearchText?: string;

    constructor(tree: TreeComponentRef, searchText: string) {
        super(tree);
        this.SearchText = searchText;
    }
}

/**
 * Fired after search is applied
 */
export class AfterSearchEventArgs extends TreeEventArgs {
    /** The search text that was used */
    readonly SearchText: string;

    /** Number of nodes matching the search */
    readonly MatchCount: number;

    /** Number of branch nodes matching */
    readonly BranchMatchCount: number;

    /** Number of leaf nodes matching */
    readonly LeafMatchCount: number;

    /** The matching nodes */
    readonly MatchedNodes: TreeNode[];

    constructor(
        tree: TreeComponentRef,
        searchText: string,
        matchedNodes: TreeNode[]
    ) {
        super(tree);
        this.SearchText = searchText;
        this.MatchedNodes = [...matchedNodes];
        this.MatchCount = matchedNodes.length;
        this.BranchMatchCount = matchedNodes.filter(n => n.Type === 'branch').length;
        this.LeafMatchCount = matchedNodes.filter(n => n.Type === 'leaf').length;
    }
}

/**
 * Fired when search is cleared
 */
export class SearchClearedEventArgs extends TreeEventArgs {
    /** The previous search text */
    readonly PreviousSearchText: string;

    constructor(tree: TreeComponentRef, previousSearchText: string) {
        super(tree);
        this.PreviousSearchText = previousSearchText;
    }
}

// ========================================
// Dropdown Events
// ========================================

/**
 * Fired before dropdown opens - can be canceled
 */
export class BeforeDropdownOpenEventArgs extends CancelableTreeEventArgs {
    constructor(tree: TreeComponentRef) {
        super(tree);
    }
}

/**
 * Fired after dropdown opens
 */
export class AfterDropdownOpenEventArgs extends TreeEventArgs {
    /** The position where dropdown was rendered */
    readonly Position: 'above' | 'below';

    constructor(tree: TreeComponentRef, position: 'above' | 'below') {
        super(tree);
        this.Position = position;
    }
}

/**
 * Fired before dropdown closes - can be canceled
 */
export class BeforeDropdownCloseEventArgs extends CancelableTreeEventArgs {
    /** Reason for closing */
    readonly Reason: 'selection' | 'escape' | 'outsideClick' | 'programmatic';

    constructor(tree: TreeComponentRef, reason: 'selection' | 'escape' | 'outsideClick' | 'programmatic') {
        super(tree);
        this.Reason = reason;
    }
}

/**
 * Fired after dropdown closes
 */
export class AfterDropdownCloseEventArgs extends TreeEventArgs {
    /** Reason dropdown was closed */
    readonly Reason: 'selection' | 'escape' | 'outsideClick' | 'programmatic';

    constructor(tree: TreeComponentRef, reason: 'selection' | 'escape' | 'outsideClick' | 'programmatic') {
        super(tree);
        this.Reason = reason;
    }
}

// ========================================
// Keyboard Navigation Events
// ========================================

/**
 * Fired before keyboard navigation - can be canceled
 */
export class BeforeKeyboardNavigateEventArgs extends CancelableTreeEventArgs {
    /** The keyboard event */
    readonly KeyboardEvent: KeyboardEvent;

    /** The key that was pressed */
    readonly Key: string;

    /** The currently focused node (if any) */
    readonly CurrentNode: TreeNode | null;

    /** The node that will be focused */
    readonly TargetNode: TreeNode | null;

    constructor(
        tree: TreeComponentRef,
        keyboardEvent: KeyboardEvent,
        currentNode: TreeNode | null,
        targetNode: TreeNode | null
    ) {
        super(tree);
        this.KeyboardEvent = keyboardEvent;
        this.Key = keyboardEvent.key;
        this.CurrentNode = currentNode;
        this.TargetNode = targetNode;
    }
}

/**
 * Fired after keyboard navigation
 */
export class AfterKeyboardNavigateEventArgs extends TreeEventArgs {
    /** The key that was pressed */
    readonly Key: string;

    /** The previously focused node */
    readonly PreviousNode: TreeNode | null;

    /** The newly focused node */
    readonly CurrentNode: TreeNode | null;

    constructor(
        tree: TreeComponentRef,
        key: string,
        previousNode: TreeNode | null,
        currentNode: TreeNode | null
    ) {
        super(tree);
        this.Key = key;
        this.PreviousNode = previousNode;
        this.CurrentNode = currentNode;
    }
}
