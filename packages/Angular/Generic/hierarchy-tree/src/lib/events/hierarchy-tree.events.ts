import { HierarchyNodeData } from '../models/hierarchy-tree.types';

/**
 * Base class for all cancelable hierarchy tree events.
 * Provides standard cancellation lifecycle semantics.
 */
export class CancelableHierarchyEvent {
    private _isCanceled = false;
    private _cancelReason?: string;

    /**
     * Whether the event was canceled by a subscriber.
     */
    public get IsCanceled(): boolean {
        return this._isCanceled;
    }

    /**
     * Optional reason provided when the event was canceled.
     */
    public get CancelReason(): string | undefined {
        return this._cancelReason;
    }

    /**
     * Cancels the pending action, preventing the component from proceeding.
     *
     * @param reason - Optional diagnostic message explaining why the action was canceled
     */
    public Cancel(reason?: string): void {
        this._isCanceled = true;
        this._cancelReason = reason;
    }
}

/**
 * Event emitted when an action is performed on a node.
 */
export interface HierarchyNodeEvent<T = Record<string, unknown>> {
    /** The node that triggered the event. */
    Node: HierarchyNodeData<T>;

    /** Native browser event if triggered via direct user interaction. */
    OriginalEvent?: MouseEvent | TouchEvent;
}

/**
 * Cancelable event emitted before a node state change (expand, collapse, select).
 */
export class CancelableHierarchyNodeEvent<T = Record<string, unknown>> extends CancelableHierarchyEvent {
    constructor(
        public readonly Node: HierarchyNodeData<T>,
        public readonly OriginalEvent?: MouseEvent | TouchEvent
    ) {
        super();
    }
}

/**
 * Event emitted after a node is reparented within the hierarchy.
 */
export interface ReparentEvent<T = Record<string, unknown>> {
    /** The node being moved / reparented. */
    Node: HierarchyNodeData<T>;

    /** The previous parent node's ID, or `null` if the node was a root. */
    OldParentID: string | null;

    /** The new parent node's ID, or `null` if moved to root. */
    NewParentID: string | null;

    /** The new parent node instance, or `null` if moved to root. */
    NewParentNode?: HierarchyNodeData<T> | null;
}

/**
 * Cancelable event emitted before a node is reparented.
 * Subscribers can inspect the proposed new parent and cancel the mutation.
 */
export class CancelableReparentEvent<T = Record<string, unknown>> extends CancelableHierarchyEvent {
    constructor(
        public readonly Node: HierarchyNodeData<T>,
        public readonly OldParentID: string | null,
        public readonly NewParentID: string | null,
        public readonly NewParentNode?: HierarchyNodeData<T> | null
    ) {
        super();
    }
}

/**
 * Event emitted when a user triggers a custom or built-in action button on a node card.
 */
export interface NodeActionEvent<T = Record<string, unknown>> {
    /** The node on which the action was invoked. */
    Node: HierarchyNodeData<T>;

    /** The identifier of the action (e.g. `'open'`, `'add-child'`, `'focus'`, `'reparent'`). */
    Action: 'open' | 'add-child' | 'focus' | 'reset-focus' | string;
}
