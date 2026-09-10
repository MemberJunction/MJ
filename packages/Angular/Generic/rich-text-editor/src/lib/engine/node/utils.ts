import { isLeaf } from './category';

/**
 * Low-level DOM helpers shared across the engine.
 *
 * Everything here is deliberately dumb — no invariant maintenance, no selection awareness.
 * The invariant-preserving operations live in `node/block` and `node/merge-split`, which
 * build on these.
 */

/** Create an element, optionally stamping attributes and appending children. */
export function createElement(
    doc: Document,
    tagName: string,
    attributes?: Readonly<Record<string, string>> | null,
    children?: readonly Node[] | null,
): HTMLElement {
    const element = doc.createElement(tagName);
    if (attributes) {
        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, value);
        }
    }
    if (children) {
        for (const child of children) {
            element.appendChild(child);
        }
    }
    return element;
}

/** Remove a node from its parent and return it. No-op when already detached. */
export function detach<T extends Node>(node: T): T {
    node.parentNode?.removeChild(node);
    return node;
}

/** Swap `node` for `replacement` in the parent. Returns the replacement. */
export function replaceWith<T extends Node>(node: Node, replacement: T): T {
    node.parentNode?.replaceChild(replacement, node);
    return replacement;
}

/** Move every child of `node` into a fragment, leaving `node` empty. */
export function empty(node: Node): DocumentFragment {
    const fragment = ownerDocumentOf(node).createDocumentFragment();
    while (node.firstChild) {
        fragment.appendChild(node.firstChild);
    }
    return fragment;
}

/** Replace `node` with its own children, preserving order and position. */
export function unwrap(node: Node): void {
    const parent = node.parentNode;
    if (!parent) {
        return;
    }
    while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
}

/**
 * The document a node belongs to.
 *
 * A `Document` has a null `ownerDocument`, so it answers for itself — this keeps callers
 * from having to special-case the root.
 */
export function ownerDocumentOf(node: Node): Document {
    return node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : (node.ownerDocument as Document);
}

/**
 * Nearest ancestor-or-self with the given tag name, stopping at (and including) `root`.
 * Returns null when there is no match inside the root.
 */
export function getNearest(node: Node | null, root: Node, tagName: string): Element | null {
    let current: Node | null = node;
    while (current) {
        if (current.nodeName === tagName) {
            return current as Element;
        }
        if (current === root) {
            return null;
        }
        current = current.parentNode;
    }
    return null;
}

/**
 * True when two nodes are similar enough to be merged into one.
 *
 * Links are always excluded: two adjacent `<a>` elements are visually identical but may
 * carry different `href`s, and merging them would silently retarget half the text. Leaves
 * are excluded because merging is defined as adopting the other node's children, which a
 * leaf cannot have.
 */
export function areAlike(node: Node, other: Node): boolean {
    if (isLeaf(node)) {
        return false;
    }
    if (node.nodeType !== other.nodeType || node.nodeName !== other.nodeName) {
        return false;
    }
    if (node.nodeName === 'A') {
        return false;
    }
    if (!isElement(node) || !isElement(other)) {
        // Two text nodes of the same type are always mergeable.
        return true;
    }
    return node.className === other.className && inlineStyleOf(node) === inlineStyleOf(other);
}

/** Narrow a node to an Element. */
export function isElement(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE;
}

/** Narrow a node to a Text node. */
export function isTextNode(node: Node): node is Text {
    return node.nodeType === Node.TEXT_NODE;
}

/** The element's inline `style` attribute as a string, or `''` when it has none. */
function inlineStyleOf(element: Element): string {
    return element.getAttribute('style') ?? '';
}

/**
 * Index of a node among its parent's children.
 *
 * Used to serialize a selection position as an index path for the undo stack, where a live
 * node reference would be meaningless after the document is restored from an HTML string.
 */
export function indexOfNode(node: Node): number {
    const parent = node.parentNode;
    if (!parent) {
        return -1;
    }
    return Array.prototype.indexOf.call(parent.childNodes, node);
}
