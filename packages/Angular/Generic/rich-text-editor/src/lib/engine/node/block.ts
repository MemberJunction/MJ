import { DEFAULT_BLOCK_TAG, FIX_CONTAINER_SKIP_TAGS, SHOW_ELEMENT, ZERO_WIDTH_SPACE } from '../constants';
import { isBlock, isContainer, isInline, isLeaf, resetNodeCategoryCache } from './category';
import { TreeIterator } from './tree-iterator';
import { createElement, isElement, isTextNode, ownerDocumentOf } from './utils';

/**
 * The structural invariants, and the block-navigation helpers built on them.
 *
 * ## The rule that governs this file
 *
 * These invariants are maintained **locally, at edit sites — never by a document sweep.**
 * Nothing here is ever run over the whole document "to tidy it up". `fixContainer` fixes
 * only the wrappers it creates; it deliberately leaves existing blocks alone, even empty
 * ones. That is not an oversight — it is the fidelity contract. A load-time sweep that
 * inserted a filler `<br>` into every empty `<td>` of a quoted layout table would rewrite
 * content the user never touched, which is the exact failure mode this editor exists to
 * avoid.
 *
 * The consequence: content loaded with a bare `<div></div>` keeps it, and stays unfocusable
 * until an edit reaches it. That is the intended trade. Blank lines the *editor* produces
 * always get their filler `<br>`, because those go through `fixCursor` at the edit site.
 */

/** How to build the editor's default block. Mirrors the `BlockTag`/`BlockAttributes` config. */
export interface DefaultBlockSpec {
    Tag: string;
    Attributes?: Readonly<Record<string, string>> | null;
}

/** `<div>` with no attributes — Gmail's composer shape, one line-height in every mail client. */
export const DEFAULT_BLOCK_SPEC: DefaultBlockSpec = { Tag: DEFAULT_BLOCK_TAG, Attributes: null };

/** Elements that render on their own and therefore save a block from needing a filler. */
const RENDERED_LEAF_SELECTOR = 'BR,IMG,HR,INPUT,IFRAME';

/** Create the configured default block, optionally adopting `children`. */
export function createDefaultBlock(
    doc: Document,
    spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC,
    children?: readonly Node[] | null,
): HTMLElement {
    return createElement(doc, spec.Tag, spec.Attributes ?? null, children);
}

/**
 * Make a node renderable and focusable — **this one function is the blank-line guarantee.**
 *
 * An empty block receives a filler `<br>`; without it the block collapses to zero height
 * and vanishes in every mail client. An empty inline element receives a zero-width space,
 * because WebKit refuses to place a caret inside an empty text node.
 *
 * The ZWS goes in on every engine, not just WebKit. Feature-detecting the quirk would make
 * behavior differ across browsers for no benefit: `GetHTML` strips every ZWS on the way
 * out, so an unnecessary one is invisible, while a missing one is a caret that won't land.
 *
 * Returns the same node, for chaining.
 */
export function fixCursor<T extends Node>(node: T): T {
    if (isTextNode(node)) {
        return node;
    }
    if (isInline(node)) {
        fixEmptyInline(node);
    } else if (isBlock(node)) {
        fixEmptyBlock(node);
    }
    return node;
}

/** Give an empty inline element a zero-width space so the caret can enter it. */
function fixEmptyInline(node: Node): void {
    if (isLeaf(node) || node.firstChild) {
        return;
    }
    node.appendChild(ownerDocumentOf(node).createTextNode(ZERO_WIDTH_SPACE));
}

/** Give an empty block a filler `<br>` so it occupies one line. */
function fixEmptyBlock(node: Node): void {
    if (!isEmptyBlock(node)) {
        return;
    }
    node.appendChild(createElement(ownerDocumentOf(node), 'BR'));
}

/**
 * True when a block has nothing that renders.
 *
 * Whitespace-only content deliberately does NOT count as empty. A block holding a space
 * collapses to zero height just as a truly empty one does, but adding a filler `<br>`
 * beside existing text would change content the user did not touch — and this predicate
 * gates a mutation, so it errs toward leaving things alone.
 */
export function isEmptyBlock(block: Node): boolean {
    if (isElement(block) && block.querySelector(RENDERED_LEAF_SELECTOR)) {
        return false;
    }
    return (block.textContent ?? '') === '';
}

/**
 * Enforce "containers hold only blocks": wrap each run of loose inline children in a
 * default block, and recurse into nested containers.
 *
 * Skipped entirely inside table and list plumbing, and inside `<p>`/`<pre>`, where the
 * children are either invalid to wrap or already valid as-is (see `FIX_CONTAINER_SKIP_TAGS`).
 *
 * Only the wrappers this function creates are passed through `fixCursor`. Pre-existing
 * blocks are never touched.
 */
export function fixContainer(container: Node, spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC): Node {
    if (isElement(container) && FIX_CONTAINER_SKIP_TAGS.has(container.nodeName)) {
        return container;
    }

    const doc = ownerDocumentOf(container);
    let wrapper: HTMLElement | null = null;

    for (const child of Array.from(container.childNodes)) {
        const isLineBreak = child.nodeName === 'BR';
        if (!isLineBreak && isInline(child)) {
            // A comment joins a wrapper that is already open — it sits amid inline content
            // and belongs on that line — but never opens one itself. A standalone comment
            // between blocks renders nothing; wrapping it in a block would give it a filler
            // `<br>` and thereby insert a visible blank line into content nobody edited.
            // This is how Outlook conditional comments survive a load unmoved.
            if (child.nodeType === Node.COMMENT_NODE && !wrapper) {
                continue;
            }
            wrapper = wrapper ?? createDefaultBlock(doc, spec);
            wrapper.appendChild(child);
            continue;
        }

        if (isLineBreak || wrapper) {
            // A `<br>` loose among blocks becomes its own blank-line block; otherwise this
            // is simply the end of a run of inline children.
            wrapper = wrapper ?? createDefaultBlock(doc, spec);
            // Children just moved into the wrapper, so any category memoized for it (or for
            // the container above) is stale. See the note on resetNodeCategoryCache.
            resetNodeCategoryCache();
            fixCursor(wrapper);
            if (isLineBreak) {
                container.replaceChild(wrapper, child);
            } else {
                container.insertBefore(wrapper, child);
            }
            wrapper = null;
        }

        if (isContainer(child)) {
            fixContainer(child, spec);
        }
    }

    if (wrapper) {
        resetNodeCategoryCache();
        container.appendChild(fixCursor(wrapper));
    }
    return container;
}

// ---------------------------------------------------------------------------
// Block navigation
// ---------------------------------------------------------------------------

/** Nearest ancestor-or-self that is a block, bounded by `root`. */
export function getClosestBlock(node: Node | null, root: Node): Element | null {
    let current: Node | null = node;
    while (current && current !== root) {
        if (isElement(current) && isBlock(current)) {
            return current;
        }
        current = current.parentNode;
    }
    return null;
}

/** A `TreeIterator` positioned at `node`, yielding only blocks within `root`. */
export function getBlockWalker(node: Node, root: Node): TreeIterator<Element> {
    const walker = new TreeIterator<Element>(root, SHOW_ELEMENT, isBlock);
    walker.CurrentNode = node;
    return walker;
}

/** The next block after `node` in document order, or null at the end of the document. */
export function getNextBlock(node: Node, root: Node): Element | null {
    return getBlockWalker(node, root).NextNode();
}

/** The previous block before `node` in document order, or null at the start. */
export function getPreviousBlock(node: Node, root: Node): Element | null {
    return getBlockWalker(node, root).PreviousNode();
}
