import { SHOW_COMMENT, SHOW_ELEMENT, SHOW_TEXT } from '../constants';

/** Predicate deciding whether a node the iterator reached should be yielded. */
export type TreeIteratorFilter = (node: Node) => boolean;

/** Every node passes. Hoisted so the default doesn't allocate per iterator. */
const ACCEPT_ALL: TreeIteratorFilter = () => true;

/**
 * A hand-rolled DOM walker.
 *
 * The native `TreeWalker` would cover the forward case, but it offers no **post-order**
 * traversal, and the engine's backward cleanup passes need exactly that: they remove nodes
 * as they go, so they must visit a node only after everything inside it has been handled.
 * Rather than run two different walker abstractions, all three orders live here.
 *
 * The iterator is a cursor, not an `Iterable` — callers advance it and reposition
 * `CurrentNode` mid-traversal, which is incompatible with a one-shot generator.
 */
export class TreeIterator<T extends Node = Node> {
    /** Traversal boundary. The root itself is never yielded. */
    public readonly Root: Node;

    /** Bitmask of `SHOW_ELEMENT` / `SHOW_TEXT` / `SHOW_COMMENT`. */
    public readonly NodeType: number;

    /** Where the cursor currently sits. Assignable so callers can restart mid-tree. */
    public CurrentNode: Node;

    private readonly filter: TreeIteratorFilter;

    constructor(root: Node, nodeType: number, filter?: TreeIteratorFilter) {
        this.Root = root;
        this.CurrentNode = root;
        this.NodeType = nodeType;
        this.filter = filter ?? ACCEPT_ALL;
    }

    /** True when the node matches both the type mask and the caller's filter. */
    public IsAcceptableNode(node: Node): boolean {
        const mask = maskForNodeType(node.nodeType);
        return (mask & this.NodeType) !== 0 && this.filter(node);
    }

    /**
     * Next node in document (pre-order) order: down into children first, then to the next
     * sibling, then up and over. Returns null at the end of the root's subtree.
     */
    public NextNode(): T | null {
        let current: Node | null = this.CurrentNode;
        for (;;) {
            let node: Node | null = current.firstChild;
            while (!node) {
                if (current === this.Root) {
                    return null;
                }
                node = current.nextSibling;
                if (!node) {
                    current = current.parentNode;
                    if (!current) {
                        return null;
                    }
                }
            }
            if (this.IsAcceptableNode(node)) {
                this.CurrentNode = node;
                return node as T;
            }
            current = node;
        }
    }

    /**
     * Previous node in document (pre-order) order — the exact inverse of {@link NextNode}:
     * to the previous sibling's deepest descendant, else up to the parent.
     */
    public PreviousNode(): T | null {
        let current: Node = this.CurrentNode;
        for (;;) {
            if (current === this.Root) {
                return null;
            }
            let node: Node | null = current.previousSibling;
            if (node) {
                while (node.lastChild) {
                    node = node.lastChild;
                }
            } else {
                node = current.parentNode;
            }
            // Stepping up from a first child lands on the parent, which may be the root.
            // The root is a boundary, never a result — the forward and post-order walks
            // can only reach children, so this is the one direction that has to say so
            // explicitly. Yielding it would let a cleanup pass unwrap the editor element.
            if (!node || node === this.Root) {
                return null;
            }
            if (this.IsAcceptableNode(node)) {
                this.CurrentNode = node;
                return node as T;
            }
            current = node;
        }
    }

    /**
     * Previous node in **post-order** — that is, post-order traversed backwards.
     *
     * Post-order is children-then-parent, so running it in reverse yields
     * **parent-then-children**, working right to left: for `<p><b>x</b>y</p><p>z</p>` the
     * sequence is `P`, `"z"`, `P`, `"y"`, `B`, `"x"`.
     *
     * Use it to sweep a subtree backwards while removing whole branches: reaching a parent
     * before its children means detaching that parent skips its entire subtree, which is
     * what you want when the parent's removal makes the descendants moot. When you need the
     * opposite — children settled before the parent is judged, as when collapsing nested
     * empty inlines — recurse depth-first instead; this walk will not give you that order.
     */
    public PreviousPostOrderNode(): T | null {
        let current: Node | null = this.CurrentNode;
        for (;;) {
            let node: Node | null = current.lastChild;
            while (!node) {
                if (current === this.Root) {
                    return null;
                }
                node = current.previousSibling;
                if (!node) {
                    current = current.parentNode;
                    if (!current) {
                        return null;
                    }
                }
            }
            if (this.IsAcceptableNode(node)) {
                this.CurrentNode = node;
                return node as T;
            }
            current = node;
        }
    }
}

/** Map a `Node.nodeType` to its `SHOW_*` bit; 0 for types the engine never yields. */
function maskForNodeType(nodeType: number): number {
    switch (nodeType) {
        case Node.ELEMENT_NODE:
            return SHOW_ELEMENT;
        case Node.TEXT_NODE:
            return SHOW_TEXT;
        case Node.COMMENT_NODE:
            return SHOW_COMMENT;
        default:
            return 0;
    }
}
