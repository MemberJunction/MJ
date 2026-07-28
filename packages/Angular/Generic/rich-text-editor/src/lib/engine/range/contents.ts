import { NON_BREAKING_SPACE } from '../constants';
import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, createDefaultBlock, fixCursor } from '../node/block';
import { resetNodeCategoryCache } from '../node/category';
import { mergeWithBlock, split } from '../node/merge-split';
import { indexOfNode, isTextNode, ownerDocumentOf } from '../node/utils';
import {
    moveRangeBoundariesDownTree,
    moveRangeBoundariesUpTree,
} from './boundaries';
import { getEndBlockOfRange, getStartBlockOfRange } from './block-range';

/**
 * Moving content into and out of a range.
 *
 * These three are the only places in the engine that structurally add or remove document
 * content outside of a specific command, and each of them maintains the range as it works —
 * a caller can always read the caret position straight back off the range afterwards.
 */

/**
 * Insert a node (or fragment) at the range's start, leaving the range around it.
 *
 * When the start sits mid-text the text node is split so the insertion lands between the
 * halves; when it sits at either edge no split happens, which keeps the document from
 * accumulating fragmented text nodes on every insertion.
 */
export function insertNodeInRange(range: Range, node: Node): void {
    let startContainer = range.startContainer;
    let startOffset = range.startOffset;
    let endContainer = range.endContainer;
    let endOffset = range.endOffset;

    if (isTextNode(startContainer)) {
        const parent = startContainer.parentNode;
        if (!parent) {
            throw new Error('insertNodeInRange: the range starts in a detached text node');
        }
        if (startOffset === 0) {
            startOffset = indexOfNode(startContainer);
        } else if (startOffset === startContainer.length) {
            startOffset = indexOfNode(startContainer) + 1;
        } else {
            const afterSplit = startContainer.splitText(startOffset);
            if (endContainer === startContainer) {
                // The end was in the same text node; it now lives in the right-hand half.
                endOffset -= startOffset;
                endContainer = afterSplit;
            } else if (endContainer === parent) {
                // The split added a sibling before the end's index.
                endOffset += 1;
            }
            startOffset = indexOfNode(afterSplit);
        }
        startContainer = parent;
    }

    const children = startContainer.childNodes;
    const countBefore = children.length;
    if (startOffset >= countBefore) {
        startContainer.appendChild(node);
    } else {
        startContainer.insertBefore(node, children[startOffset]);
    }
    if (startContainer === endContainer) {
        // A fragment contributes several children at once.
        endOffset += children.length - countBefore;
    }

    resetNodeCategoryCache();
    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer, endOffset);
}

/**
 * Remove the range's contents into a fragment and return it, collapsing the range at the
 * resulting seam.
 *
 * The **end is split before the start**, and the order is not interchangeable: splitting
 * the start first shifts every node after it, invalidating the end offset that was captured
 * from the original range.
 */
export function extractContentsOfRange(range: Range, common: Node | null, root: Node): DocumentFragment {
    const fragment = ownerDocumentOf(root).createDocumentFragment();
    if (range.collapsed) {
        return fragment;
    }

    let ancestor: Node = common ?? range.commonAncestorContainer;
    if (isTextNode(ancestor)) {
        ancestor = ancestor.parentNode as Node;
    }

    const endNode = split(range.endContainer, range.endOffset, ancestor, root);
    let startNode = split(range.startContainer, range.startOffset, ancestor, root);

    while (startNode && startNode !== endNode) {
        const next: Node | null = startNode.nextSibling;
        fragment.appendChild(startNode);
        startNode = next;
    }

    resetNodeCategoryCache();
    range.setStart(ancestor, endNode ? indexOfNode(endNode) : ancestor.childNodes.length);
    range.collapse(true);
    fixCursor(ancestor);
    return fragment;
}

/**
 * Delete the range's contents, joining the partial blocks at either end back together.
 *
 * This is the difference between deleting and merely extracting: a selection spanning two
 * paragraphs leaves one paragraph, not two half-empty ones.
 */
export function deleteContentsOfRange(
    range: Range,
    root: Node,
    spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC,
): DocumentFragment {
    const startBlock = getStartBlockOfRange(range, root);
    const endBlock = getEndBlockOfRange(range, root);

    // Lift only as far as the enclosing blocks, never to the root. Lifting to the root
    // turns "select all the text in this paragraph" into "select the paragraph", and the
    // extraction then removes the paragraph itself — losing the user's `<p>` (and its
    // attributes) instead of leaving it empty.
    moveRangeBoundariesUpTree(range, startBlock ?? root, endBlock ?? root);

    const fragment = extractContentsOfRange(range, root, root);
    moveRangeBoundariesDownTree(range);

    joinBlocksAtSeam(range, root, startBlock);
    ensureRootIsEditable(range, root, spec);

    // The join leaves the caret addressed by child index; descend it back onto a text
    // position so it survives later mutations — and so the space fix below can see the
    // character it needs to look at.
    moveRangeBoundariesDownTree(range);
    convertTrailingSpaceToNonBreaking(range);
    return fragment;
}

/**
 * Rejoin the two partial blocks the extraction left facing each other.
 *
 * The tail block has to be **refetched** rather than captured up front. `split` keeps the
 * original node as the *left* half, so a pre-captured "end block" reference points at the
 * piece that just got extracted; the surviving right-hand half is a fresh clone that only
 * exists after the split. Merging against the stale reference silently does nothing, and
 * the deletion leaves two paragraphs where there should be one.
 *
 * When the selection covered whole blocks, `startBlock` was itself extracted and is no
 * longer in the document — that is the signal that nothing should be joined.
 */
function joinBlocksAtSeam(range: Range, root: Node, startBlock: Element | null): void {
    if (!startBlock || !root.contains(startBlock)) {
        return;
    }
    const tailBlock = getStartBlockOfRange(range, root);
    if (tailBlock && tailBlock !== startBlock && root.contains(tailBlock)) {
        mergeWithBlock(startBlock, tailBlock, range, root);
    }
    fixCursor(startBlock);
}

/**
 * Guarantee the root still has a block to put the caret in after a delete emptied it.
 *
 * Two states need repair, not one. An empty root is the obvious case; the subtler one is a
 * root holding nothing but a bare `<br>`, which `extractContentsOfRange` produces when it
 * calls `fixCursor` on a root that just became empty — the root classifies as a block at
 * that instant and gets a filler. A loose `<br>` at root level violates "containers hold
 * only blocks", so it is rehomed into a real block here.
 *
 * This is an edit-site fix, not a document sweep — it only runs on a root the delete just
 * emptied.
 */
function ensureRootIsEditable(range: Range, root: Node, spec: DefaultBlockSpec): void {
    const first = root.firstChild;
    const isBareFiller = !!first && root.childNodes.length === 1 && first.nodeName === 'BR';
    if (first && !isBareFiller) {
        return;
    }

    const block = createDefaultBlock(ownerDocumentOf(root), spec);
    if (isBareFiller && first) {
        root.removeChild(first);
    }
    root.appendChild(block);
    resetNodeCategoryCache();
    fixCursor(block);
    range.setStart(block, 0);
    range.collapse(true);
}

/**
 * Swap a plain space immediately before the caret for a non-breaking one.
 *
 * A trailing plain space does not render, so deleting the word after one would make the
 * space visually disappear and the caret appear to jump backwards. Only the genuinely
 * trailing case is converted — a space with text after it renders fine and is left alone.
 */
function convertTrailingSpaceToNonBreaking(range: Range): void {
    const container = range.startContainer;
    if (!isTextNode(container) || !range.collapsed) {
        return;
    }
    const offset = range.startOffset;
    if (offset === 0 || offset !== container.length) {
        return;
    }
    if (container.data.charAt(offset - 1) !== ' ') {
        return;
    }
    container.replaceData(offset - 1, 1, NON_BREAKING_SPACE);
}
