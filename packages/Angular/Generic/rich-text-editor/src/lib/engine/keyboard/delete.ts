import { SHOW_ELEMENT_OR_TEXT } from '../constants';
import { fixContainer, getNextBlock } from '../node/block';
import { isLeaf } from '../node/category';
import { mergeContainers, mergeWithBlock } from '../node/merge-split';
import { TreeIterator } from '../node/tree-iterator';
import { detach, isTextNode } from '../node/utils';
import { getStartBlockOfRange, rangeDoesEndAtBlockBoundary } from '../range/block-range';
import { moveRangeBoundariesDownTree } from '../range/boundaries';
import { deleteContentsOfRange } from '../range/contents';
import { removeWithEmptiedInlineAncestors } from '../zws';
import { afterNativeDelete, nextSiblingAboveBlock } from './delete-common';
import { graphemeLengthAfter } from './grapheme';
import { EditingHost } from './host';

/**
 * Forward Delete — the mirror of Backspace. At the **end of a block** the next block is
 * merged into this one.
 *
 * Within a block the engine deletes **itself**, unlike Backspace. Native forward-delete is
 * where browsers disagree most: Safari deletes nothing, or the wrong thing, when the caret
 * sits at the end of a text node with an inline element or `<img>` next; Chrome and Safari
 * differ on whether a `<br>` before the caret's line counts. Deleting one grapheme, or one
 * leaf, ourselves is deterministic on every engine and testable without a browser. Only when
 * no target can be found is the event left to the browser.
 *
 * Returns true when the event was consumed.
 */
export function handleDelete(host: EditingHost, range: Range): boolean {
    const root = host.Root;
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);

    if (!range.collapsed) {
        deleteContentsOfRange(range, root, host.BlockSpec);
        afterNativeDelete(host, range);
        host.DocumentChanged();
        return true;
    }

    moveRangeBoundariesDownTree(range);
    if (!rangeDoesEndAtBlockBoundary(range, root)) {
        if (!deleteForwardWithinBlock(range, root)) {
            host.SetSelection(range);
            host.ScheduleAfterNativeDelete();
            return false;
        }
        afterNativeDelete(host, range);
        host.DocumentChanged();
        return true;
    }

    const current = getStartBlockOfRange(range, root);
    if (!current) {
        return true;
    }
    fixContainer(current.parentNode ?? root, host.BlockSpec);

    const next = getNextBlock(current, root);
    if (!next) {
        // Last block of the document: nothing follows.
        host.SetSelection(range);
        return true;
    }

    mergeWithBlock(current, next, range, root);
    const neighbour = nextSiblingAboveBlock(current, root);
    if (neighbour) {
        mergeContainers(neighbour, root, host.BlockSpec);
    }
    host.SetSelection(range);
    host.DocumentChanged();
    return true;
}

/** The first leaf or non-empty text node after `(container, offset)` within `block`. */
function nextDeletableAfter(container: Node, offset: number, block: Element): Node | null {
    const walker = new TreeIterator(block, SHOW_ELEMENT_OR_TEXT, (node) => isLeaf(node) || (isTextNode(node) && node.length > 0));
    if (isTextNode(container)) {
        walker.CurrentNode = container;
        return walker.NextNode();
    }
    const at: Node | null = container.childNodes[offset] ?? null;
    if (!at) {
        return null;
    }
    if (walker.IsAcceptableNode(at)) {
        return at;
    }
    walker.CurrentNode = at;
    return walker.NextNode();
}

/**
 * Delete the grapheme or leaf immediately after the caret, within its block. Returns
 * false when nothing deletable could be identified, leaving the browser to try.
 */
function deleteForwardWithinBlock(range: Range, root: Node): boolean {
    const container = range.startContainer;
    const offset = range.startOffset;

    if (isTextNode(container) && offset < container.length) {
        container.deleteData(offset, graphemeLengthAfter(container.data, offset));
        return true;
    }

    const block = getStartBlockOfRange(range, root);
    if (!block) {
        return false;
    }
    const target = nextDeletableAfter(container, offset, block);
    if (!target) {
        return false;
    }
    if (isLeaf(target)) {
        detach(target);
        return true;
    }
    if (isTextNode(target)) {
        target.deleteData(0, graphemeLengthAfter(target.data, 0));
        if (target.length === 0) {
            // Nothing left in it: the node goes, and so does any wrapper it alone kept alive.
            removeWithEmptiedInlineAncestors(target, root);
        }
        return true;
    }
    return false;
}
