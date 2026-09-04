import { isTextNode } from '../node/utils';
import { getNodeLength } from './boundaries';

/**
 * Range/node containment questions.
 *
 * The inline format engine walks text nodes and has to know, for each one, whether the
 * selection touches it at all (partial containment) or covers it completely (full
 * containment). Both are answered by comparing boundary points rather than by walking, so
 * they stay O(depth) regardless of how much content the range spans.
 */

/**
 * True when `node` lies inside `range`.
 *
 * With `partial` set, any overlap counts — a text node with one selected character is
 * "contained". Without it, the node must sit entirely within the range.
 */
export function isNodeContainedInRange(range: Range, node: Node, partial: boolean): boolean {
    const nodeRange = node.ownerDocument?.createRange();
    if (!nodeRange) {
        return false;
    }
    nodeRange.selectNode(node);

    if (partial) {
        // Overlaps unless the node ends before the range starts or starts after it ends.
        const nodeEndsBeforeRangeStart = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0;
        const nodeStartsAfterRangeEnd = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0;
        return !nodeEndsBeforeRangeStart && !nodeStartsAfterRangeEnd;
    }

    const nodeStartsAtOrAfterRangeStart = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0;
    const nodeEndsAtOrBeforeRangeEnd = range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
    return nodeStartsAtOrAfterRangeStart && nodeEndsAtOrBeforeRangeEnd;
}

/**
 * The part of `range` that falls inside `node`, as a new range.
 *
 * Boundaries outside the node are clamped to its edges. Used by the multi-block format
 * operations, which handle each block's slice of the selection independently.
 */
export function clampRangeToNode(range: Range, node: Node): Range {
    const clamped = (node.ownerDocument as Document).createRange();
    const startInside = node === range.startContainer || node.contains(range.startContainer);
    const endInside = node === range.endContainer || node.contains(range.endContainer);

    if (startInside) {
        clamped.setStart(range.startContainer, range.startOffset);
    } else {
        clamped.setStart(node, 0);
    }
    if (endInside) {
        clamped.setEnd(range.endContainer, range.endOffset);
    } else {
        clamped.setEnd(node, getNodeLength(node));
    }
    return clamped;
}

/** True when `node` is a text node with at least one character of content. */
export function isNonEmptyText(node: Node): node is Text {
    return isTextNode(node) && node.length > 0;
}
