import { isLeaf } from '../node/category';
import { indexOfNode, isTextNode } from '../node/utils';
import { getEndBlockOfRange, getStartBlockOfRange } from './block-range';

/**
 * Range boundary discipline.
 *
 * A DOM position is ambiguous: "the start of this paragraph" can be written as
 * `(paragraph, 0)`, or as `(firstTextNode, 0)`, and the two behave differently under
 * mutation. The engine therefore normalizes deliberately before every operation:
 *
 * - **down** the tree before reading content or placing a caret, so positions are as deep
 *   and specific as possible;
 * - **up** the tree before a structural split, so the split happens at the level the
 *   operation actually means to cut.
 *
 * Getting this wrong doesn't throw — it silently splits at the wrong depth, which is how
 * editors end up shredding markup one keystroke at a time.
 */

/** Number of addressable positions inside a node: characters for text, children otherwise. */
export function getNodeLength(node: Node): number {
    if (isTextNode(node)) {
        return node.length;
    }
    return node.childNodes.length;
}

/** The child sitting immediately after a `(container, offset)` position, if any. */
export function getNodeAfterOffset(container: Node, offset: number): Node | null {
    if (isTextNode(container)) {
        return offset < container.length ? container : null;
    }
    return container.childNodes[offset] ?? null;
}

/** The child sitting immediately before a `(container, offset)` position, if any. */
export function getNodeBeforeOffset(container: Node, offset: number): Node | null {
    if (isTextNode(container)) {
        return offset > 0 ? container : null;
    }
    return offset > 0 ? (container.childNodes[offset - 1] ?? null) : null;
}

/**
 * Push both boundaries as deep into the tree as they can go, landing on text positions.
 *
 * Call before reading content or placing a caret. Leaves stop the descent — you cannot
 * descend into a `<br>`.
 */
export function moveRangeBoundariesDownTree(range: Range): void {
    // A collapsed range has to descend ONCE. The two ends descend in opposite directions —
    // start reaches forward into the following child, end reaches back into the preceding
    // one — which for a caret would drive them apart and invert the range, silently
    // relocating the caret to the wrong side of the position it was meant to mark.
    if (range.collapsed) {
        const caret = descendStart(range.startContainer, range.startOffset);
        range.setStart(caret.Container, caret.Offset);
        range.collapse(true);
        return;
    }

    const start = descendStart(range.startContainer, range.startOffset);
    const end = descendEnd(range.endContainer, range.endOffset);
    range.setStart(start.Container, start.Offset);
    range.setEnd(end.Container, end.Offset);
}

/** A `(container, offset)` pair. */
interface Position {
    Container: Node;
    Offset: number;
}

/** Descend the start boundary to the deepest equivalent position. */
function descendStart(container: Node, offset: number): Position {
    let node = container;
    let index = offset;
    while (!isTextNode(node)) {
        const child: Node | null = node.childNodes[index] ?? null;
        if (!child || isLeaf(child)) {
            // Nothing to descend into going forward. A text node just behind the position
            // is still a better home for the caret than a parent-and-index pair.
            const previous = index > 0 ? node.childNodes[index - 1] : null;
            if (previous && isTextNode(previous)) {
                return { Container: previous, Offset: previous.length };
            }
            break;
        }
        node = child;
        index = 0;
    }
    return { Container: node, Offset: index };
}

/** Descend the end boundary to the deepest equivalent position. */
function descendEnd(container: Node, offset: number): Position {
    let node = container;
    let index = offset;
    while (!isTextNode(node)) {
        if (index === 0) {
            const first: Node | null = node.firstChild;
            if (!first || isLeaf(first)) {
                break;
            }
            node = first;
            continue;
        }
        const child: Node | null = node.childNodes[index - 1] ?? null;
        if (!child || isLeaf(child)) {
            break;
        }
        node = child;
        index = getNodeLength(node);
    }
    return { Container: node, Offset: index };
}

/**
 * Lift both boundaries as high as they can go without changing the position they denote.
 *
 * A start boundary at offset 0 means "before everything in this node", which is the same
 * position as "before this node" one level up. Likewise an end boundary at the node's full
 * length. Call before a structural split so the split cuts at the intended level rather
 * than shredding an inline wrapper the operation never meant to touch.
 */
export function moveRangeBoundariesUpTree(
    range: Range,
    startMax: Node,
    endMax: Node,
): void {
    let startContainer = range.startContainer;
    let startOffset = range.startOffset;
    while (startOffset === 0 && startContainer !== startMax) {
        const parent = startContainer.parentNode;
        if (!parent) {
            break;
        }
        startOffset = indexOfNode(startContainer);
        startContainer = parent;
    }

    let endContainer = range.endContainer;
    let endOffset = range.endOffset;
    while (endOffset === getNodeLength(endContainer) && endContainer !== endMax) {
        const parent = endContainer.parentNode;
        if (!parent) {
            break;
        }
        endOffset = indexOfNode(endContainer) + 1;
        endContainer = parent;
    }

    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer, endOffset);
}

/**
 * Grow the range so it covers whole blocks at both ends.
 *
 * Every block-level command (quote, list, heading) runs on whole blocks, so this is the
 * first thing `modifyBlocks` does. A selection of two words in the middle of a paragraph
 * becomes a selection of that paragraph.
 */
export function expandRangeToBlockBoundaries(range: Range, root: Node): void {
    const start = getStartBlockOfRange(range, root);
    const end = getEndBlockOfRange(range, root);
    if (!start || !end) {
        return;
    }
    const startParent = start.parentNode;
    const endParent = end.parentNode;
    if (!startParent || !endParent) {
        return;
    }
    range.setStart(startParent, indexOfNode(start));
    range.setEnd(endParent, indexOfNode(end) + 1);
}
