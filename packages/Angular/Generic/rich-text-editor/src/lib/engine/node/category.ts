import { INLINE_TAGS, LEAF_TAGS, NodeCategory } from '../constants';

/**
 * Structural classification of DOM nodes — the foundation the whole engine rests on.
 *
 * The defining idea: **category is computed from content, not from the tag name.** An
 * element whose children are all inline is a `'block'`; the moment one child is itself a
 * block, the element becomes a `'container'`. That is why the engine needs no schema —
 * it reads the structure that is actually there instead of imposing one.
 */

/**
 * Memoizes the computed category per node.
 *
 * Classification is recursive (an element's category depends on its children's), so this
 * turns a repeated O(subtree) question into O(1). The cache is invalidated wholesale on
 * any document mutation via {@link resetNodeCategoryCache}; per-subtree invalidation is a
 * deliberate later optimization, not a v1 requirement.
 */
let categoryCache = new WeakMap<Node, NodeCategory>();

/**
 * Discard every memoized category.
 *
 * Must be called after any structural mutation. Mutating a node can change not only its
 * own category but that of every ancestor, so there is no cheap partial invalidation —
 * dropping the whole map is both correct and, being a WeakMap allocation, very cheap.
 */
export function resetNodeCategoryCache(): void {
    categoryCache = new WeakMap<Node, NodeCategory>();
}

/**
 * True for elements that cannot hold children (`BR`, `HR`, `IMG`, `INPUT`, `IFRAME`).
 *
 * Splitting, wrapping, and merging all bail on leaves: a leaf moves wholesale or not at all.
 */
export function isLeaf(node: Node): boolean {
    return node.nodeType === Node.ELEMENT_NODE && LEAF_TAGS.has(node.nodeName);
}

/**
 * Classify a node as inline, block, or container.
 *
 * Text and comment nodes are both `'inline'`. Treating comments as inline is a deliberate
 * departure from the reference implementation, which classifies them as blocks: if a
 * comment were a block, then an ordinary `<div>text<!--[if mso]>…<![endif]--></div>` would
 * classify as a container, and `fixContainer` would wrap the loose text in a new block —
 * silently restructuring content the user never touched. Comment-bearing markup is exactly
 * what the fidelity contract exists to protect, so comments are inline here.
 */
export function getNodeCategory(node: Node): NodeCategory {
    switch (node.nodeType) {
        case Node.TEXT_NODE:
        case Node.COMMENT_NODE:
            return 'inline';
        case Node.ELEMENT_NODE:
        case Node.DOCUMENT_FRAGMENT_NODE:
            break;
        default:
            // Doctypes, processing instructions, and friends. Never editable content;
            // classifying them as blocks keeps them out of inline-formatting paths.
            return 'block';
    }

    const cached = categoryCache.get(node);
    if (cached !== undefined) {
        return cached;
    }

    const category = computeElementCategory(node);
    categoryCache.set(node, category);
    return category;
}

/** Classification for elements and fragments, split out to keep {@link getNodeCategory} flat. */
function computeElementCategory(node: Node): NodeCategory {
    if (!everyChildIsInline(node)) {
        return 'container';
    }
    return INLINE_TAGS.has(node.nodeName) ? 'inline' : 'block';
}

/**
 * True when every child is inline — the test that separates a block from a container.
 *
 * An element with no children vacuously satisfies this, so an empty `<div>` is a block
 * (which is what makes it eligible for a filler `<br>`) while an empty `<span>` is inline.
 */
function everyChildIsInline(node: Node): boolean {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i += 1) {
        if (getNodeCategory(children[i]) !== 'inline') {
            return false;
        }
    }
    return true;
}

/** True when the node participates in an inline formatting context. */
export function isInline(node: Node): boolean {
    return getNodeCategory(node) === 'inline';
}

/**
 * True when the node is a block — it holds inline content directly and is the unit that
 * block-level operations (quote, list, heading) act upon.
 */
export function isBlock(node: Node): boolean {
    return getNodeCategory(node) === 'block';
}

/**
 * True when the node holds other blocks. Block operations recurse *through* containers
 * rather than acting on them.
 */
export function isContainer(node: Node): boolean {
    return getNodeCategory(node) === 'container';
}
