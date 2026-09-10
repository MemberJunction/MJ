import { indexOfNode } from './node/utils';

/**
 * Selection ↔ index-path serialization.
 *
 * The undo stack stores the document as an HTML string, which means every live node
 * reference in a saved selection is meaningless by the time the state is restored. An index
 * path — "child 2 of child 0 of the root, offset 5" — survives the round trip because it
 * addresses the position structurally, and the restored DOM has exactly the same structure
 * the snapshot was taken from.
 *
 * The reference implementation solves this by inserting bookmark `<input>` elements into the
 * document before snapshotting. That leaks markup into the serialized HTML if anything goes
 * wrong between insert and remove, and it mutates the document for a read operation. Index
 * paths do neither.
 */

/** A selection reduced to two structural addresses. */
export interface SerializedSelection {
    /** Child indices from the root down to the start container. */
    StartPath: readonly number[];
    StartOffset: number;
    /** Child indices from the root down to the end container. */
    EndPath: readonly number[];
    EndOffset: number;
}

/**
 * Serialize a range relative to `root`. Returns null when either end is outside the root,
 * since there is nothing structural to say about it.
 */
export function serializeSelection(range: Range, root: Node): SerializedSelection | null {
    const startPath = pathFromRoot(range.startContainer, root);
    const endPath = pathFromRoot(range.endContainer, root);
    if (!startPath || !endPath) {
        return null;
    }
    return {
        StartPath: startPath,
        StartOffset: range.startOffset,
        EndPath: endPath,
        EndOffset: range.endOffset,
    };
}

/**
 * Rebuild a range from a serialized selection. Returns null if the structure no longer
 * matches — the caller then falls back to a sensible default rather than throwing.
 */
export function deserializeSelection(selection: SerializedSelection, root: Node): Range | null {
    const start = nodeAtPath(selection.StartPath, root);
    const end = nodeAtPath(selection.EndPath, root);
    if (!start || !end) {
        return null;
    }
    const startOffset = clampOffset(start, selection.StartOffset);
    const endOffset = clampOffset(end, selection.EndOffset);
    const range = (root.ownerDocument as Document).createRange();
    try {
        range.setStart(start, startOffset);
        range.setEnd(end, endOffset);
    } catch {
        return null;
    }
    return range;
}

/** Child indices from `root` down to `node`, or null when `node` is not inside `root`. */
function pathFromRoot(node: Node, root: Node): number[] | null {
    const path: number[] = [];
    let current: Node = node;
    while (current !== root) {
        const index = indexOfNode(current);
        const parent: Node | null = current.parentNode;
        if (index < 0 || !parent) {
            return null;
        }
        path.push(index);
        current = parent;
    }
    return path.reverse();
}

/** Follow an index path from `root`; null if any step is out of range. */
function nodeAtPath(path: readonly number[], root: Node): Node | null {
    let current: Node = root;
    for (const index of path) {
        const child: Node | null = current.childNodes[index] ?? null;
        if (!child) {
            return null;
        }
        current = child;
    }
    return current;
}

/** Keep an offset addressable within its node. */
function clampOffset(node: Node, offset: number): number {
    const length = node.nodeType === Node.TEXT_NODE ? (node as Text).length : node.childNodes.length;
    return Math.max(0, Math.min(offset, length));
}
