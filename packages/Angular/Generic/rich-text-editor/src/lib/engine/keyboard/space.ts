import { ZERO_WIDTH_SPACE } from '../constants';
import { getNearestFormat } from '../format/inline';
import { findTrailingLink } from '../format/links';
import { resetNodeCategoryCache } from '../node/category';
import { createElement, isTextNode, ownerDocumentOf } from '../node/utils';
import { moveRangeBoundariesDownTree } from '../range/boundaries';
import { deleteContentsOfRange } from '../range/contents';
import { EditingHost } from './host';

/**
 * Space.
 *
 * The space itself is typed natively. This handler does two things around it: it records
 * an undo checkpoint, so Undo steps back a word at a time rather than a paragraph, and —
 * when `AddLinks` is on — it turns a bare URL or email address the user has just finished
 * typing into a link.
 *
 * Never consumes the event.
 */
export function handleSpace(host: EditingHost, range: Range): boolean {
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);
    if (!range.collapsed) {
        deleteContentsOfRange(range, host.Root, host.BlockSpec);
        host.SetSelection(range);
        host.DocumentChanged();
    }
    if (host.AddLinks) {
        moveRangeBoundariesDownTree(range);
        if (linkifyWordBeforeCaret(host, range)) {
            host.SetSelection(range);
            host.DocumentChanged();
        }
    }
    return false;
}

/**
 * Wrap the word immediately before the caret in `<a>` if it looks like an address.
 * Returns true when a link was made; `range` is left collapsed after the new link.
 */
export function linkifyWordBeforeCaret(host: EditingHost, range: Range): boolean {
    const root = host.Root;
    const container = range.startContainer;
    if (!isTextNode(container) || getNearestFormat(container, root, { Tag: 'A' })) {
        return false;
    }
    const caret = range.startOffset;
    const link = findTrailingLink(container.data.slice(0, caret));
    if (!link) {
        return false;
    }
    const start = link.Index;
    const end = start + link.Text.length;

    const doc = ownerDocumentOf(root);
    // Carve the address out of the text node: [before][address][rest of node].
    const remainder = container.splitText(end);
    const address = start > 0 ? container.splitText(start) : container;
    const anchor = createElement(doc, 'A', { href: link.Href });
    address.parentNode?.replaceChild(anchor, address);
    anchor.appendChild(address);

    // Caret goes into ballast *after* the link so the space about to be typed — and
    // everything after it — lands outside the anchor.
    const ballast = doc.createTextNode(ZERO_WIDTH_SPACE);
    remainder.parentNode?.insertBefore(ballast, remainder);
    if (remainder.data === '') {
        remainder.parentNode?.removeChild(remainder);
    }
    resetNodeCategoryCache();
    range.setStart(ballast, 1);
    range.collapse(true);
    return true;
}
