import { SHOW_TEXT, ZERO_WIDTH_SPACE, ZERO_WIDTH_SPACE_PATTERN } from './constants';
import { isInline, isLeaf, resetNodeCategoryCache } from './node/category';
import { TreeIterator } from './node/tree-iterator';
import { detach, isElement } from './node/utils';

/**
 * Zero-width space housekeeping.
 *
 * Every ZWS in the document was put there by the engine as caret ballast — inside an empty
 * inline so the caret can enter it, or inside a pending-format wrapper so the next typed
 * character lands formatted. None of it is content. Once the caret has moved on, the ballast
 * is dead weight: it makes an empty `<b></b>` look non-empty to structural checks and lets
 * the caret stop on an invisible character when the user arrows through.
 *
 * This is not a normalization of user content. `GetHTML` strips every ZWS regardless, so
 * removing them from the live DOM changes nothing a consumer can observe.
 */

/**
 * Remove every zero-width space under `root`, except inside `keep`.
 *
 * A text node emptied by the strip is removed, and if that leaves a non-leaf inline element
 * with no children the element is removed too, walking up the chain — a `<b>` whose only
 * content was its pending-format ballast must not survive as an empty tag.
 *
 * `keep` protects the text node the caret is sitting in, so a ZWS that is still doing its
 * job (holding the caret inside a brand-new format wrapper) is not pulled out from under it.
 */
export function removeZeroWidthSpaces(root: Node, keep?: Node | null): void {
    const walker = new TreeIterator<Text>(root, SHOW_TEXT);
    const doomed: Text[] = [];
    for (;;) {
        const text = walker.NextNode();
        if (!text) {
            break;
        }
        if (text === keep || !text.data.includes(ZERO_WIDTH_SPACE)) {
            continue;
        }
        const stripped = text.data.replace(ZERO_WIDTH_SPACE_PATTERN, '');
        if (stripped === '') {
            doomed.push(text);
        } else {
            text.data = stripped;
        }
    }
    for (const text of doomed) {
        removeWithEmptiedInlineAncestors(text, root);
    }
    if (doomed.length > 0) {
        resetNodeCategoryCache();
    }
}

/** Detach `node`, then each inline ancestor that the removal leaves childless. */
export function removeWithEmptiedInlineAncestors(node: Node, root: Node): void {
    let current: Node = node;
    for (;;) {
        const parent: Node | null = current.parentNode;
        detach(current);
        if (!parent || parent === root || !isElement(parent) || isLeaf(parent)) {
            return;
        }
        resetNodeCategoryCache();
        if (parent.childNodes.length > 0 || !isInline(parent)) {
            return;
        }
        current = parent;
    }
}
