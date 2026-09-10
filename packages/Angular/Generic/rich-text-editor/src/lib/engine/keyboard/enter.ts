import { ZERO_WIDTH_SPACE_PATTERN } from '../constants';
import { removeEmptyInlines } from '../clean/clean-tree';
import { decreaseQuoteLevel } from '../format/block';
import { fixCursor } from '../node/block';
import { resetNodeCategoryCache } from '../node/category';
import { createElement, detach, getNearest, isElement, isTextNode, ownerDocumentOf, replaceWith } from '../node/utils';
import { getStartBlockOfRange, rangeDoesEndAtBlockBoundary } from '../range/block-range';
import { moveRangeBoundariesDownTree } from '../range/boundaries';
import { deleteContentsOfRange, insertNodeInRange } from '../range/contents';
import { createRange } from '../selection';
import { splitBlock } from '../split-block';
import { removeZeroWidthSpaces } from '../zws';
import { EditingHost } from './host';

/**
 * Enter and Shift+Enter.
 *
 * Plain Enter splits the block — except in an *empty* list item or quoted block, where it
 * escapes one level instead, matching the muscle memory every mail composer has trained.
 * Inside `<pre>` it inserts a literal newline. Shift+Enter inserts a `<br>` within the
 * current block.
 */

/** Handle Enter. Always consumes the event. */
export function handleEnter(host: EditingHost, range: Range, shift: boolean): void {
    const root = host.Root;
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);

    if (!range.collapsed) {
        deleteContentsOfRange(range, root, host.BlockSpec);
    }
    moveRangeBoundariesDownTree(range);

    if (shift) {
        insertLineBreak(host, range);
        return;
    }

    const block = getStartBlockOfRange(range, root);
    if (!block) {
        insertLineBreak(host, range);
        return;
    }

    if (getNearest(block, root, 'PRE')) {
        insertNewlineCharacter(host, range);
        return;
    }

    if (isBlankLine(block) && escapeEmptyLine(host, range, block)) {
        return;
    }

    const after = splitBlock(root, block, range.startContainer, range.startOffset, host.BlockSpec, host.TagAttributes);

    // The seam on the left: ballast and hollow wrappers the split left at the block's end.
    removeZeroWidthSpaces(block);
    pruneEmptyTextNodes(block);
    removeEmptyInlines(block);
    resetNodeCategoryCache();
    fixCursor(block);

    const focus = descendToCaretPosition(after);
    host.SetSelection(createRange(focus, 0));
    host.DocumentChanged();
}

/**
 * Enter on an empty list item or quoted line lifts it out one level instead of adding another
 * empty line. Returns false when the line is not inside a list or quote.
 */
function escapeEmptyLine(host: EditingHost, range: Range, block: Element): boolean {
    if (host.ChangeListLevel(range, -1)) {
        host.SetSelection(range);
        host.DocumentChanged();
        return true;
    }
    if (getNearest(block, host.Root, 'BLOCKQUOTE')) {
        host.ModifyBlocks(decreaseQuoteLevel(), range);
        host.SetSelection(range);
        host.DocumentChanged();
        return true;
    }
    return false;
}

/**
 * Insert `<br>` at the caret. A break at the very end of a block needs a second one behind
 * it, or the browser has no line to draw the caret on — exactly what Chrome's own
 * `insertLineBreak` does.
 */
export function insertLineBreak(host: EditingHost, range: Range): void {
    const root = host.Root;
    const doc = ownerDocumentOf(root);
    const br = createElement(doc, 'BR');
    insertNodeInRange(range, br);
    range.setStartAfter(br);
    range.collapse(true);
    moveRangeBoundariesDownTree(range);
    if (rangeDoesEndAtBlockBoundary(range, root)) {
        const trailing = createElement(doc, 'BR');
        insertNodeInRange(range, trailing);
        range.setStartBefore(trailing);
        range.collapse(true);
    }
    host.SetSelection(range);
    host.DocumentChanged();
}

/** Enter inside `<pre>`: a newline character, not a new block. */
function insertNewlineCharacter(host: EditingHost, range: Range): void {
    const newline = ownerDocumentOf(host.Root).createTextNode('\n');
    insertNodeInRange(range, newline);
    range.setStart(newline, 1);
    range.collapse(true);
    host.SetSelection(range);
    host.DocumentChanged();
}

/** Drop zero-length text nodes, which `splitText` at an edge leaves behind. */
function pruneEmptyTextNodes(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
        if (isTextNode(child) && child.data === '') {
            detach(child);
        } else if (isElement(child)) {
            pruneEmptyTextNodes(child);
        }
    }
}

/** A block with nothing the user typed in it — filler `<br>` and ballast do not count. */
function isBlankLine(block: Element): boolean {
    if (block.querySelector('IMG,HR,INPUT,IFRAME')) {
        return false;
    }
    return (block.textContent ?? '').replace(ZERO_WIDTH_SPACE_PATTERN, '') === '';
}

/**
 * Walk down the new block to where the caret should land, tidying as it goes: empty text
 * nodes are dropped, and a cloned link with no text is discarded so typing on the new line
 * does not silently extend the link above it.
 */
function descendToCaretPosition(block: Element): Node {
    let focus: Node = block;
    while (isElement(focus)) {
        if (focus.nodeName === 'A' && isHollowText(focus.textContent)) {
            const text = ownerDocumentOf(focus).createTextNode('');
            replaceWith(focus, text);
            focus = text;
            break;
        }
        let child: Node | null = focus.firstChild;
        while (child && isTextNode(child) && child.data === '') {
            const next: Node | null = child.nextSibling;
            if (!next || next.nodeName === 'BR') {
                break;
            }
            detach(child);
            child = next;
        }
        if (!child || child.nodeName === 'BR' || isTextNode(child)) {
            break;
        }
        focus = child;
    }
    resetNodeCategoryCache();
    return focus;
}

function isHollowText(text: string | null): boolean {
    return (text ?? '').replace(ZERO_WIDTH_SPACE_PATTERN, '') === '';
}
