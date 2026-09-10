import { TAG_AFTER_SPLIT } from './constants';
import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, fixCursor } from './node/block';
import { resetNodeCategoryCache } from './node/category';
import { split } from './node/merge-split';
import { createElement, empty, isElement, ownerDocumentOf, replaceWith } from './node/utils';
import { TagAttributeTable } from './format/block';

/**
 * Split a block at a position — what Enter does.
 *
 * The split climbs from the caret up to the block's parent, cloning every inline wrapper on
 * the way, so formatting continues into the new block: press Enter mid-bold and the next
 * line is bold too. The **second** half is then retagged according to `TAG_AFTER_SPLIT` —
 * Enter at the end of a heading yields an ordinary paragraph, Enter in a list item yields
 * another item, Enter in `<pre>` stays `<pre>`.
 *
 * Returns the block that now begins the right-hand side.
 */
export function splitBlock(
    root: Node,
    block: Element,
    node: Node,
    offset: number,
    spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC,
    attributes?: TagAttributeTable,
): Element {
    const parent = block.parentNode ?? root;
    const nodeAfterSplit = split(node, offset, parent, root);
    if (!nodeAfterSplit || !isElement(nodeAfterSplit)) {
        // Splitting at the very end of the last child yields nothing on the right;
        // `split` still created a clone of the block and placed it after the original.
        const next = block.nextSibling;
        if (next && isElement(next)) {
            return retagIfNeeded(root, block, next, spec, attributes);
        }
        throw new Error('splitBlock: the split produced no right-hand block');
    }
    return retagIfNeeded(root, block, nodeAfterSplit, spec, attributes);
}

/** Apply the `TAG_AFTER_SPLIT` rule to the right-hand half. */
function retagIfNeeded(
    root: Node,
    original: Element,
    after: Element,
    spec: DefaultBlockSpec,
    attributes?: TagAttributeTable,
): Element {
    const tagAfter = TAG_AFTER_SPLIT[original.nodeName];
    const wanted = tagAfter === undefined || tagAfter === null ? spec.Tag : tagAfter;
    if (after.nodeName === wanted) {
        return after;
    }
    const doc = ownerDocumentOf(root);
    const isDefault = wanted === spec.Tag;
    const replacement = createElement(
        doc,
        wanted,
        isDefault ? (spec.Attributes ?? null) : (attributes?.[wanted] ?? null),
    );
    const dir = after.getAttribute('dir');
    if (dir) {
        replacement.setAttribute('dir', dir);
    }
    replacement.appendChild(empty(after));
    replaceWith(after, replacement);
    resetNodeCategoryCache();
    fixCursor(replacement);
    return replacement;
}
