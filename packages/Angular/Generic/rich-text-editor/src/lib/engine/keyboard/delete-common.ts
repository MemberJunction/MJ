import { ZERO_WIDTH_SPACE_PATTERN } from '../constants';
import { fixCursor, getPreviousBlock } from '../node/block';
import { isBlock, isInline, resetNodeCategoryCache } from '../node/category';
import { indexOfNode, isTextNode } from '../node/utils';
import { getStartBlockOfRange } from '../range/block-range';
import { moveRangeBoundariesDownTree } from '../range/boundaries';
import { EditingHost } from './host';

/**
 * Repair after a **native** deletion.
 *
 * Mid-text Backspace and Delete are left to the browser — it handles grapheme clusters,
 * IME state, and surrogate pairs better than any hand-written code would — but the browser
 * does not maintain this engine's invariants. Once it has run, this pass removes the hollow
 * inline wrappers a deletion can leave behind (`<b></b>` after deleting the last bold
 * character), gives an emptied block its filler `<br>`, and puts the caret back on a text
 * position.
 */
export function afterNativeDelete(host: EditingHost, range: Range = host.GetSelection()): void {
    const root = host.Root;
    let node: Node = range.startContainer;
    if (isTextNode(node) && node.parentNode) {
        node = node.parentNode;
    }
    let parent: Node = node;
    while (parent !== root && isInline(parent) && isHollow(parent)) {
        node = parent;
        parent = node.parentNode ?? root;
    }
    if (node !== parent) {
        range.setStart(parent, indexOfNode(node));
        range.collapse(true);
        parent.removeChild(node);
        resetNodeCategoryCache();
        if (!isBlock(parent)) {
            parent = getPreviousBlock(parent, root) ?? root;
        }
        fixCursor(parent);
        moveRangeBoundariesDownTree(range);
    }

    // The browser normally leaves a `<br>` in a block it has emptied, but not every engine
    // does, and an unfocusable empty block is the one state the editor must never present.
    const block = getStartBlockOfRange(range, root);
    if (block) {
        resetNodeCategoryCache();
        fixCursor(block);
    }
    moveRangeBoundariesDownTree(range);
    host.SetSelection(range);
}

/** True when an inline element holds nothing but caret ballast. */
function isHollow(node: Node): boolean {
    return (node.textContent ?? '').replace(ZERO_WIDTH_SPACE_PATTERN, '') === '';
}

/**
 * After a block merge, the containers on either side of the seam may now be alike —
 * deleting the only paragraph between two blockquotes should leave one quote, not two.
 * Finds the first ancestor of `block` with a following sibling and returns that sibling.
 */
export function nextSiblingAboveBlock(block: Node, root: Node): Node | null {
    let node: Node | null = block.parentNode;
    while (node && node !== root && !node.nextSibling) {
        node = node.parentNode;
    }
    if (!node || node === root) {
        return null;
    }
    return node.nextSibling;
}
