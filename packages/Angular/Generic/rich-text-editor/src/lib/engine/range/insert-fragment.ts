import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, fixContainer, fixCursor, getClosestBlock, getNextBlock, isEmptyBlock } from '../node/block';
import { isContainer, isInline, resetNodeCategoryCache } from '../node/category';
import { mergeContainers, mergeWithBlock, split } from '../node/merge-split';
import { detach, getNearest, indexOfNode, isTextNode, ownerDocumentOf } from '../node/utils';
import { getEndBlockOfRange, getStartBlockOfRange } from './block-range';
import { getNodeLength, moveRangeBoundariesDownTree, moveRangeBoundariesUpTree } from './boundaries';
import { deleteContentsOfRange } from './contents';

/**
 * Paste-merge: insert a cleaned fragment at a range so it reads as one document.
 *
 * Dropping a fragment in wholesale would leave `<div>hel</div><div>PASTED</div><div>lo</div>`
 * when the caret sat inside "hello". Instead the fragment's **first block is merged onto the
 * caret's block**, its **last block receives whatever followed the caret**, and anything in
 * between is inserted as blocks after a split. Pasting a single line into the middle of a
 * paragraph therefore produces one paragraph, as it should.
 *
 * The split stops at the nearest enclosing `<blockquote>` rather than the root, so pasting
 * inside a quote keeps the pasted content quoted.
 *
 * Two kinds of first block are never merged: `<pre>` (its whitespace would be reflowed) and
 * anything inside a `<table>` (a cell cannot be joined onto a paragraph).
 */
export function insertTreeFragmentIntoRange(
    range: Range,
    fragment: DocumentFragment,
    root: Node,
    spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC,
): void {
    prepareFragment(fragment, spec);

    if (!range.collapsed) {
        deleteContentsOfRange(range, root, spec);
    }
    moveRangeBoundariesDownTree(range);
    range.collapse(false);

    const stopPoint: Node = getNearest(range.endContainer, root, 'BLOCKQUOTE') ?? root;
    let block = getStartBlockOfRange(range, root);
    const replaceBlock = !!block && isEmptyBlock(block);
    let tail: DocumentFragment | null = null;

    if (block && !replaceBlock && canMergeFirstBlock(fragment)) {
        tail = mergeFirstBlockAtCaret(range, fragment, block, root);
    }

    if (fragment.childNodes.length > 0) {
        if (replaceBlock && block) {
            range.setEndBefore(block);
            range.collapse(false);
            detach(block);
        }
        insertRemainingBlocks(range, fragment, stopPoint, root, spec);
        block = getEndBlockOfRange(range, root);
    }

    if (tail && block) {
        reattachTail(range, block, tail, root);
    }

    resetNodeCategoryCache();
    // Leave the caret after what was inserted, as every editor does.
    range.collapse(false);
    moveRangeBoundariesDownTree(range);
}

/** Give the fragment the document's block structure and fillers before it goes in. */
function prepareFragment(fragment: DocumentFragment, spec: DefaultBlockSpec): void {
    resetNodeCategoryCache();
    fixContainer(fragment, spec);
    for (let node: Node | null = fragment; (node = getNextBlock(node, fragment)); ) {
        fixCursor(node);
    }
}

/** A first block joins the caret's block unless it is preformatted or table plumbing. */
function canMergeFirstBlock(fragment: DocumentFragment): boolean {
    const first = getNextBlock(fragment, fragment);
    return !!first && !getNearest(first, fragment, 'PRE') && !getNearest(first, fragment, 'TABLE');
}

/**
 * Merge the fragment's first block onto the caret's block. Inline content after the caret is
 * set aside and returned so it can follow the pasted content; the range is left at the block
 * level, just after the merged block, ready for the remaining blocks.
 */
function mergeFirstBlockAtCaret(range: Range, fragment: DocumentFragment, block: Element, root: Node): DocumentFragment | null {
    const firstBlock = getNextBlock(fragment, fragment) as Element;

    // Address the caret at the highest level that denotes the same position, so a caret at
    // the edge of a text node or inline wrapper needs no split at all.
    const lifted = liftPosition(range.startContainer, range.startOffset, block);
    let container: Node = lifted.Container;
    let offset = lifted.Offset;

    if (isInline(container)) {
        // Genuinely mid-inline: split the wrapper open up to the block.
        const after = split(container, offset, getClosestBlock(container, root) ?? root, root);
        const parent = after?.parentNode ?? container.parentNode ?? block;
        container = parent;
        offset = after ? indexOfNode(after) : parent.childNodes.length;
    }
    range.setStart(container, offset);
    range.collapse(true);

    let tail: DocumentFragment | null = null;
    if (offset !== getNodeLength(container)) {
        tail = ownerDocumentOf(root).createDocumentFragment();
        while (container.childNodes[offset]) {
            tail.appendChild(container.childNodes[offset]);
        }
        dropRedundantTrailingBreak(tail);
    }

    mergeWithBlock(container, firstBlock, range, root);

    const parent = container.parentNode ?? root;
    range.setEnd(parent, indexOfNode(container) + 1);
    return tail;
}

/** Split the document at the range (up to `stopPoint`) and insert what is left of the fragment. */
function insertRemainingBlocks(range: Range, fragment: DocumentFragment, stopPoint: Node, root: Node, spec: DefaultBlockSpec): void {
    moveRangeBoundariesUpTree(range, stopPoint, stopPoint);
    let nodeAfterSplit = split(range.endContainer, range.endOffset, stopPoint, root);
    const nodeBeforeSplit = nodeAfterSplit ? nodeAfterSplit.previousSibling : stopPoint.lastChild;
    stopPoint.insertBefore(fragment, nodeAfterSplit);
    resetNodeCategoryCache();
    if (nodeAfterSplit) {
        range.setEndBefore(nodeAfterSplit);
    } else {
        range.setEnd(stopPoint, getNodeLength(stopPoint));
    }

    // Hold the end position as (text, offset) — merging containers moves nodes around.
    moveRangeBoundariesDownTree(range);
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    if (nodeAfterSplit && isContainer(nodeAfterSplit)) {
        mergeContainers(nodeAfterSplit, root, spec);
    }
    nodeAfterSplit = nodeBeforeSplit?.nextSibling ?? null;
    if (nodeAfterSplit && isContainer(nodeAfterSplit)) {
        mergeContainers(nodeAfterSplit, root, spec);
    }
    range.setEnd(endContainer, endOffset);
}

/** Put the content that followed the caret back, after the last pasted block's content. */
function reattachTail(range: Range, block: Element, tail: DocumentFragment, root: Node): void {
    const tailRange = range.cloneRange();
    resetNodeCategoryCache();
    fixCursor(block);
    mergeWithBlock(block, tail, tailRange, root);
    range.setEnd(tailRange.endContainer, tailRange.endOffset);
}

/** Climb from `(container, offset)` while the position sits at an edge, stopping at `block`. */
function liftPosition(container: Node, offset: number, block: Node): { Container: Node; Offset: number } {
    let node: Node = container;
    let index = offset;
    while (node !== block) {
        const parent: Node | null = node.parentNode;
        if (!parent) {
            break;
        }
        if (index === 0) {
            index = indexOfNode(node);
        } else if (index === getNodeLength(node)) {
            index = indexOfNode(node) + 1;
        } else {
            break;
        }
        node = parent;
    }
    return { Container: node, Offset: index };
}

/**
 * A `<br>` that ended the caret's block and now trails real content in the set-aside tail
 * would be re-emitted after text, where it renders as a phantom blank line in some mail
 * clients. A tail that is *only* a `<br>` keeps it: `mergeWithBlock` treats that as the
 * filler it is.
 */
function dropRedundantTrailingBreak(tail: DocumentFragment): void {
    const last = tail.lastChild;
    if (!last || last.nodeName !== 'BR' || tail.childNodes.length === 1) {
        return;
    }
    const hasContentBefore = Array.from(tail.childNodes).some(
        (node) => node !== last && (!isTextNode(node) || node.length > 0),
    );
    if (hasContentBefore) {
        detach(last);
    }
}
