import { SHOW_ELEMENT } from '../constants';
import { TreeIterator } from '../node/tree-iterator';
import { unwrap } from '../node/utils';

/**
 * Word/Outlook artifact removal — the **paste** stage only.
 *
 * Pasting from Word drags in a large amount of proprietary markup: `mso-*` CSS properties,
 * `MsoNormal` class names, `xmlns:` declarations, and namespaced elements. None of it means
 * anything outside Word, and left in place it accumulates in every document the user edits.
 *
 * This never runs on the load path. There, the same markup is content to be preserved
 * byte-for-byte, not noise to be scrubbed — which is exactly the distinction the whole
 * editor is built around.
 */

/** Matches a class name Word generates. */
const MSO_CLASS_PATTERN = /^Mso/i;

/** Matches a CSS property in Word's private namespace. */
const MSO_DECLARATION_PATTERN = /^\s*mso-/i;

/** Matches an attribute that declares or references an XML namespace. */
const NAMESPACE_ATTRIBUTE_PATTERN = /^(xmlns($|:)|[a-z]+:)/i;

/** Strip every Word artifact from a subtree, in place. */
export function stripMsoArtifacts(root: Node): void {
    for (const element of collectElements(root)) {
        stripNamespacedElement(element);
        if (!element.isConnected && !root.contains(element)) {
            continue;
        }
        stripMsoClasses(element);
        stripMsoStyleDeclarations(element);
        stripNamespaceAttributes(element);
    }
}

/**
 * Snapshot every element up front.
 *
 * The walk mutates the tree — unwrapping a namespaced element moves its children — so
 * iterating lazily would skip nodes as they are reparented.
 */
function collectElements(root: Node): Element[] {
    const walker = new TreeIterator<Element>(root, SHOW_ELEMENT);
    const elements: Element[] = [];
    for (;;) {
        const next = walker.NextNode();
        if (!next) {
            return elements;
        }
        elements.push(next);
    }
}

/**
 * Replace a namespaced element with its children.
 *
 * Unwrapped rather than deleted: `<o:p>` is usually empty, but `<w:sdt>` and friends can
 * wrap real text, and deleting the wrapper wholesale would take the user's content with it.
 */
function stripNamespacedElement(element: Element): void {
    if (!element.nodeName.includes(':')) {
        return;
    }
    unwrap(element);
}

/** Drop `Mso*` class tokens, removing the attribute entirely once nothing is left. */
function stripMsoClasses(element: Element): void {
    const className = element.getAttribute('class');
    if (!className) {
        return;
    }
    const kept = className.split(/\s+/).filter((token) => token && !MSO_CLASS_PATTERN.test(token));
    if (kept.length === 0) {
        element.removeAttribute('class');
        return;
    }
    if (kept.length !== className.split(/\s+/).filter(Boolean).length) {
        element.setAttribute('class', kept.join(' '));
    }
}

/**
 * Drop `mso-*` declarations from the inline style, keeping everything else.
 *
 * Word mixes real styling (`margin`, `color`) with its own properties in one attribute, so
 * this filters declaration by declaration rather than discarding the attribute.
 */
function stripMsoStyleDeclarations(element: Element): void {
    const style = element.getAttribute('style');
    if (!style) {
        return;
    }
    const declarations = style.split(';').filter((declaration) => declaration.trim().length > 0);
    const kept = declarations.filter((declaration) => !MSO_DECLARATION_PATTERN.test(declaration));
    if (kept.length === declarations.length) {
        return;
    }
    if (kept.length === 0) {
        element.removeAttribute('style');
        return;
    }
    element.setAttribute('style', `${kept.join(';').trim()}`);
}

/** Remove `xmlns` declarations and any other namespace-prefixed attribute. */
function stripNamespaceAttributes(element: Element): void {
    for (const name of element.getAttributeNames()) {
        if (NAMESPACE_ATTRIBUTE_PATTERN.test(name)) {
            element.removeAttribute(name);
        }
    }
}
