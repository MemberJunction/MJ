import { ZERO_WIDTH_SPACE_PATTERN } from './constants';
import { cleanForLoad, CleanOptions } from './clean/pipeline';
import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, createDefaultBlock, fixCursor } from './node/block';
import { resetNodeCategoryCache } from './node/category';
import { isTextNode } from './node/utils';
import { SHOW_TEXT } from './constants';
import { TreeIterator } from './node/tree-iterator';

/**
 * The document boundary: getting content in, and getting it back out.
 *
 * `SetHTML` and `GetHTML` are two of the three places the engine is allowed to normalize
 * (paste is the third). Everything between them runs on the live DOM untouched.
 */

/**
 * Replace the root's contents with `html`.
 *
 * Sanitizes once, enforces the container invariant, and stops. Nothing else is rewritten —
 * see `clean/pipeline` for why the load path is deliberately the thin one.
 */
export function setHTML(root: Element, html: string | null | undefined, options: CleanOptions): void {
    const fragment = cleanForLoad(html, options);
    const spec = options.BlockSpec ?? DEFAULT_BLOCK_SPEC;

    while (root.firstChild) {
        root.removeChild(root.firstChild);
    }
    root.appendChild(fragment);
    resetNodeCategoryCache();
    ensureEditable(root, spec);
}

/**
 * Serialize the root's contents.
 *
 * Reads from a **clone**, never the live DOM. Stripping zero-width spaces out of the real
 * document would move the caret out from under the user mid-edit — the ZWS the caret is
 * sitting in is load-bearing right up until the moment it is serialized away.
 *
 * Filler `<br>`s are intentionally left in. They are not an artifact: an empty block
 * without one collapses to zero height in every mail client, so emitting them IS the
 * blank-line product requirement.
 */
export function getHTML(root: Element): string {
    const clone = root.cloneNode(true) as Element;
    stripZeroWidthSpaces(clone);
    return clone.innerHTML;
}

/**
 * Remove every zero-width space from a detached tree.
 *
 * Text nodes left empty by the strip are removed too, so the output has no vestigial nodes
 * — an empty text node is invisible in HTML but shows up as a node-count difference to
 * anything comparing structure.
 */
function stripZeroWidthSpaces(root: Element): void {
    const walker = new TreeIterator<Text>(root, SHOW_TEXT);
    const texts: Text[] = [];
    for (;;) {
        const node = walker.NextNode();
        if (!node) {
            break;
        }
        texts.push(node);
    }
    for (const text of texts) {
        if (!isTextNode(text)) {
            continue;
        }
        const stripped = text.data.replace(ZERO_WIDTH_SPACE_PATTERN, '');
        if (stripped === text.data) {
            continue;
        }
        if (stripped === '') {
            text.parentNode?.removeChild(text);
            continue;
        }
        text.data = stripped;
    }
}

/**
 * Guarantee the root has at least one block to hold a caret.
 *
 * Only fires for genuinely empty content — loading `''` still has to produce something the
 * user can type into.
 */
function ensureEditable(root: Element, spec: DefaultBlockSpec): void {
    if (root.firstChild) {
        return;
    }
    const block = createDefaultBlock(root.ownerDocument, spec);
    root.appendChild(block);
    resetNodeCategoryCache();
    fixCursor(block);
}
