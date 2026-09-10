import { isElement, isTextNode } from './node/utils';

/**
 * Reading and writing the document selection, scoped to the editor root.
 *
 * The browser has one selection per document; the editor cares only about the part of it
 * that falls inside its root. Everything here answers "where is the caret *in the editor*",
 * falling back to a remembered position when the real selection has wandered off (into a
 * toolbar button, say) so that a command fired from that button still has somewhere to act.
 */

/** A range collapsed at `(node, offset)`. */
export function createRange(node: Node, offset: number, endNode?: Node, endOffset?: number): Range {
    const range = (node.ownerDocument as Document).createRange();
    range.setStart(node, offset);
    if (endNode) {
        range.setEnd(endNode, endOffset ?? 0);
    } else {
        range.collapse(true);
    }
    return range;
}

/**
 * The live document selection as a range, if it lies inside `root`.
 *
 * Returns a **clone**, so callers can mutate it freely without moving the user's caret
 * until they explicitly write it back with {@link applySelection}.
 */
export function readSelectionWithin(root: Node): Range | null {
    const selection = (root.ownerDocument as Document).getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    if (!isRangeWithin(range, root)) {
        return null;
    }
    return range.cloneRange();
}

/** True when both ends of the range are inside (or at) `root`. */
export function isRangeWithin(range: Range, root: Node): boolean {
    return containsOrIs(root, range.startContainer) && containsOrIs(root, range.endContainer);
}

/** Make `range` the document selection. */
export function applySelection(range: Range, root: Node): void {
    const selection = (root.ownerDocument as Document).getSelection();
    if (!selection) {
        return;
    }
    // Replacing rather than mutating in place: some engines (Safari) ignore setBaseAndExtent
    // on a range object they already hold, whereas remove-then-add is honoured everywhere.
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * The element path from the root to the selection's start, as a `>`-joined string of tag
 * names — `'DIV>BLOCKQUOTE>B'`.
 *
 * Toolbars string-match against this to derive pressed state, which is O(path length)
 * rather than a tree walk per button per selection change. Tag names only: class and id
 * would make the string document-specific without telling a toolbar anything it needs.
 */
export function getPath(node: Node, root: Node): string {
    const names: string[] = [];
    let current: Node | null = isTextNode(node) ? node.parentNode : node;
    while (current && current !== root) {
        if (isElement(current)) {
            names.push(current.nodeName);
        }
        current = current.parentNode;
    }
    if (current !== root) {
        // Never reached the root — the node isn't in the editor.
        return '';
    }
    return names.reverse().join('>');
}

/** Whether `ancestor` is `node` or contains it. */
function containsOrIs(ancestor: Node, node: Node): boolean {
    return ancestor === node || ancestor.contains(node);
}
