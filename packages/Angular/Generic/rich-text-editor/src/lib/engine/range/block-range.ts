import { SHOW_ELEMENT_OR_TEXT, ZERO_WIDTH_SPACE } from '../constants';
import { getBlockWalker, getClosestBlock, getNextBlock, getPreviousBlock } from '../node/block';
import { isBlock, isInline, isLeaf } from '../node/category';
import { TreeIterator } from '../node/tree-iterator';
import { isElement, isTextNode } from '../node/utils';

/**
 * Answering block-level questions about a range: which blocks does it touch, and is it
 * sitting exactly on a block edge?
 *
 * The boundary predicates are what let Backspace tell "delete a character" from "merge
 * with the previous block", and what let Enter tell "split here" from "escape this quote".
 */

/**
 * The first block the range starts inside, or null when it starts outside any block.
 *
 * Note this is the block *containing* the start, not necessarily one fully selected.
 */
export function getStartBlockOfRange(range: Range, root: Node): Element | null {
    const container = range.startContainer;
    if (isInline(container)) {
        return getClosestBlock(container, root);
    }
    if (container !== root && isElement(container) && isBlock(container)) {
        return container;
    }
    return firstBlockAtOrAfter(container, range.startOffset, root);
}

/** The last block the range ends inside, or null when it ends outside any block. */
export function getEndBlockOfRange(range: Range, root: Node): Element | null {
    const container = range.endContainer;
    if (isInline(container)) {
        return getClosestBlock(container, root);
    }
    if (container !== root && isElement(container) && isBlock(container)) {
        return container;
    }
    return lastBlockAtOrBefore(container, range.endOffset, root);
}

/** The block at or after a `(container, offset)` position. */
function firstBlockAtOrAfter(container: Node, offset: number, root: Node): Element | null {
    const child: Node | null = container.childNodes[offset] ?? null;
    if (!child) {
        return getNextBlock(container, root);
    }
    if (isElement(child) && isBlock(child)) {
        return child;
    }
    const walker = getBlockWalker(child, root);
    // Position *before* the child so the walk can still yield the child's own descendants.
    walker.CurrentNode = child;
    return walker.NextNode();
}

/** The block at or before a `(container, offset)` position. */
function lastBlockAtOrBefore(container: Node, offset: number, root: Node): Element | null {
    const child: Node | null = offset > 0 ? (container.childNodes[offset - 1] ?? null) : null;
    if (!child) {
        return getPreviousBlock(container, root);
    }
    if (isElement(child) && isBlock(child)) {
        return child;
    }
    const walker = getBlockWalker(child, root);
    walker.CurrentNode = child;
    return walker.PreviousNode() ?? getClosestBlock(child, root);
}

/**
 * Every block the range touches, in document order.
 *
 * The range is read as-is; callers that want whole blocks should
 * `expandRangeToBlockBoundaries` first.
 */
export function getBlocksInRange(range: Range, root: Node): Element[] {
    const start = getStartBlockOfRange(range, root);
    const end = getEndBlockOfRange(range, root);
    if (!start || !end) {
        return [];
    }
    const blocks: Element[] = [start];
    if (start === end) {
        return blocks;
    }
    const walker = getBlockWalker(start, root);
    for (;;) {
        const next = walker.NextNode();
        if (!next) {
            return blocks;
        }
        blocks.push(next);
        if (next === end) {
            return blocks;
        }
    }
}

/**
 * True when the range's start sits at the very beginning of its block.
 *
 * Zero-width spaces are skipped: they are caret ballast the engine inserted, never content
 * the user typed, so a caret sitting after one is still at the start of the block.
 */
export function rangeDoesStartAtBlockBoundary(range: Range, root: Node): boolean {
    const container = range.startContainer;
    let nodeAtCursor: Node | null;

    if (isTextNode(container)) {
        if (hasVisibleTextBefore(container.data, range.startOffset)) {
            return false;
        }
        nodeAtCursor = container;
    } else {
        nodeAtCursor = container.childNodes[range.startOffset] ?? null;
        if (nodeAtCursor && !root.contains(nodeAtCursor)) {
            nodeAtCursor = null;
        }
        if (!nodeAtCursor) {
            const before = range.startOffset > 0 ? container.childNodes[range.startOffset - 1] : null;
            if (before && isTextNode(before) && before.length > 0) {
                return false;
            }
            nodeAtCursor = before;
        }
    }

    return !hasContentBefore(nodeAtCursor, range, root);
}

/** True when the range's end sits at the very end of its block. */
export function rangeDoesEndAtBlockBoundary(range: Range, root: Node): boolean {
    const container = range.endContainer;
    const offset = range.endOffset;

    if (isTextNode(container)) {
        if (hasVisibleTextAfter(container.data, offset)) {
            return false;
        }
        return !hasContentAfter(container, range, root);
    }

    const nodeAtCursor: Node | null = container.childNodes[offset] ?? null;
    return !hasContentAfter(nodeAtCursor ?? container, range, root);
}

/** True when any character before `offset` is something other than a zero-width space. */
function hasVisibleTextBefore(text: string, offset: number): boolean {
    for (let index = offset; index > 0; index -= 1) {
        if (text.charAt(index - 1) !== ZERO_WIDTH_SPACE) {
            return true;
        }
    }
    return false;
}

/** True when any character at or after `offset` is something other than a zero-width space. */
function hasVisibleTextAfter(text: string, offset: number): boolean {
    for (let index = offset; index < text.length; index += 1) {
        if (text.charAt(index) !== ZERO_WIDTH_SPACE) {
            return true;
        }
    }
    return false;
}

/** Renderable content: a leaf like `<br>`/`<img>`, or a text node with characters in it. */
function isRenderableContent(node: Node): boolean {
    return isLeaf(node) || (isTextNode(node) && node.length > 0);
}

/** True when the block holding the range's start has renderable content before `node`. */
function hasContentBefore(node: Node | null, range: Range, root: Node): boolean {
    const block = getStartBlockOfRange(range, root);
    if (!block || !node) {
        return false;
    }
    const walker = new TreeIterator(block, SHOW_ELEMENT_OR_TEXT, isRenderableContent);
    walker.CurrentNode = node;
    return walker.PreviousNode() !== null;
}

/** True when the block holding the range's end has renderable content after `node`. */
function hasContentAfter(node: Node, range: Range, root: Node): boolean {
    const block = getEndBlockOfRange(range, root);
    if (!block) {
        return false;
    }
    const walker = new TreeIterator(block, SHOW_ELEMENT_OR_TEXT, isRenderableContent);
    walker.CurrentNode = node;
    return walker.NextNode() !== null;
}
