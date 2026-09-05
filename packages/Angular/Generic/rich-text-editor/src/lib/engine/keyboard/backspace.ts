import { decreaseQuoteLevel } from '../format/block';
import { removeFormat } from '../format/inline';
import { fixContainer, getPreviousBlock } from '../node/block';
import { mergeContainers, mergeWithBlock } from '../node/merge-split';
import { getNearest, isTextNode } from '../node/utils';
import { getStartBlockOfRange, rangeDoesStartAtBlockBoundary } from '../range/block-range';
import { moveRangeBoundariesDownTree } from '../range/boundaries';
import { deleteContentsOfRange } from '../range/contents';
import { afterNativeDelete, nextSiblingAboveBlock } from './delete-common';
import { EditingHost } from './host';

/**
 * Backspace.
 *
 * Three cases. A selection is deleted outright. A caret at the **start of a block** merges
 * that block into the previous one — or, at the very start of the document, lifts it out of
 * its list or quote. A caret anywhere else is left to the browser's native deletion, with a
 * repair pass scheduled behind it.
 *
 * Returns true when the event was consumed and the browser must not act.
 */
export function handleBackspace(host: EditingHost, range: Range): boolean {
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
    if (!rangeDoesStartAtBlockBoundary(range, root)) {
        if (unlinkOnBackspaceIntoAutolink(host, range)) {
            return true;
        }
        host.SetSelection(range);
        host.ScheduleAfterNativeDelete();
        return false;
    }

    const current = getStartBlockOfRange(range, root);
    if (!current) {
        return true;
    }
    fixContainer(current.parentNode ?? root, host.BlockSpec);

    const previous = getPreviousBlock(current, root);
    if (previous) {
        mergeIntoPreviousBlock(host, range, previous, current);
    } else {
        escapeAtDocumentStart(host, range, current);
    }
    return true;
}

/** Join the caret's block onto the one before it, then fuse containers the join made adjacent. */
function mergeIntoPreviousBlock(host: EditingHost, range: Range, previous: Element, current: Element): void {
    mergeWithBlock(previous, current, range, host.Root);
    const neighbour = nextSiblingAboveBlock(previous, host.Root);
    if (neighbour) {
        mergeContainers(neighbour, host.Root, host.BlockSpec);
    }
    host.SetSelection(range);
    host.DocumentChanged();
}

/** First block of the document: nothing to merge into, but a list or quote can be escaped. */
function escapeAtDocumentStart(host: EditingHost, range: Range, current: Element): void {
    if (host.ChangeListLevel(range, -1)) {
        host.SetSelection(range);
        host.DocumentChanged();
    } else if (getNearest(current, host.Root, 'BLOCKQUOTE')) {
        host.ModifyBlocks(decreaseQuoteLevel(), range);
        host.SetSelection(range);
        host.DocumentChanged();
    } else {
        host.SetSelection(range);
    }
}

/**
 * Backspacing into the end of a link whose text *is* its address — the shape autolinking
 * produces — deletes the character **and removes the link**. Otherwise the user is left
 * with `https://example.co` pointing at `https://example.com`, a link that lies. Safari
 * never does this itself; the other engines are inconsistent; so the engine owns it.
 */
function unlinkOnBackspaceIntoAutolink(host: EditingHost, range: Range): boolean {
    const text = range.startContainer;
    const offset = range.startOffset;
    if (!isTextNode(text) || offset === 0 || offset !== text.length) {
        return false;
    }
    const link = text.parentNode;
    if (!link || link.nodeName !== 'A') {
        return false;
    }
    const href = (link as Element).getAttribute('href') ?? '';
    if (!href.includes(text.data)) {
        return false;
    }
    text.deleteData(offset - 1, 1);
    const linkRange = (host.Root.ownerDocument as Document).createRange();
    linkRange.selectNode(link);
    removeFormat(host.Root, linkRange, { Tag: 'A' });
    // `text` may have been merged into a neighbour; the unwrapped range still ends where the
    // address does.
    range.setStart(linkRange.endContainer, linkRange.endOffset);
    range.collapse(true);
    host.SetSelection(range);
    host.DocumentChanged();
    return true;
}
