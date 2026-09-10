import { SHOW_ELEMENT, SHOW_ELEMENT_OR_TEXT } from '../constants';
import { isInline, isLeaf, resetNodeCategoryCache } from '../node/category';
import { TreeIterator } from '../node/tree-iterator';
import { createElement, detach, isElement, isTextNode, ownerDocumentOf, unwrap } from '../node/utils';
import { isWhitespaceOnly } from '../node/whitespace';
import { RichTextRewriter } from '../../rich-text-editor.types';

/**
 * Structural cleanup — the **paste** stage.
 *
 * ## Why rewriting is paste-only
 *
 * The reference architecture canonicalizes tags (`STRONG`→`B`, `EM`→`I`) on load as well as
 * on paste, so its format engine only ever sees one spelling of "bold". This editor does
 * not, because rewriting on load is a fidelity violation: a document loaded with `<strong>`
 * would come back out of `GetHTML` as `<b>` having never been edited, and
 * `SetHTML(GetHTML(x))` would stop being a fixed point.
 *
 * The cost is carried by the inline format engine instead, which must recognise `<b>` and
 * `<strong>` as the same format. That is the correct place for the cost to land: it is a
 * few extra entries in a lookup table, versus silently rewriting every document that passes
 * through the editor.
 */

/** Elements that never belong in editable content, dropped along with their contents. */
const DISCARDED_TAGS: ReadonlySet<string> = new Set(['HEAD', 'META', 'TITLE', 'LINK', 'BASE']);

/** Options for {@link cleanTree}. */
export interface CleanTreeOptions {
    /** Additional tags to unwrap to their children. */
    Blacklist?: readonly string[];
    /** Rewriters keyed by uppercase tag name, overriding/extending {@link DEFAULT_REWRITERS}. */
    Rewriters?: Readonly<Record<string, RichTextRewriter>>;
    /** Drop `<style>` elements. True on paste; false on the trusted load path. */
    DropStyleElements?: boolean;
}

/**
 * Tag rewrites applied on paste.
 *
 * `FONT` is the interesting one: it is a presentational element with no modern equivalent,
 * so its attributes are translated into an inline-styled `<span>` rather than dropped,
 * which would silently lose the author's colour and sizing.
 */
export const DEFAULT_REWRITERS: Readonly<Record<string, RichTextRewriter>> = {
    STRONG: (element) => renameElement(element, 'B'),
    EM: (element) => renameElement(element, 'I'),
    FONT: (element) => convertFontElement(element),
    SPAN: (element) => convertBoldSpan(element),
};

/**
 * Run the structural cleanup over a subtree, in place.
 *
 * Order is deliberate: discards first (so nothing downstream wastes work on a `<head>`),
 * then rewrites, then whitespace, then empty-inline removal — which has to come last,
 * because a rewrite can leave an element empty.
 */
export function cleanTree(root: Node, options: CleanTreeOptions = {}): void {
    const blacklist = new Set((options.Blacklist ?? []).map((tag) => tag.toUpperCase()));
    const rewriters = { ...DEFAULT_REWRITERS, ...(options.Rewriters ?? {}) };

    discardElements(root, blacklist, options.DropStyleElements === true);
    applyRewriters(root, rewriters);
    prunePureWhitespace(root);
    removeEmptyInlines(root);
    resetNodeCategoryCache();
}

/** Remove discarded tags outright and unwrap blacklisted ones. */
function discardElements(root: Node, blacklist: ReadonlySet<string>, dropStyle: boolean): void {
    for (const element of snapshotElements(root)) {
        const name = element.nodeName;
        if (DISCARDED_TAGS.has(name) || (dropStyle && name === 'STYLE')) {
            detach(element);
            continue;
        }
        if (blacklist.has(name)) {
            unwrap(element);
        }
    }
}

/** Apply the rewriter table to every element that has one. */
function applyRewriters(root: Node, rewriters: Readonly<Record<string, RichTextRewriter>>): void {
    for (const element of snapshotElements(root)) {
        const rewriter = rewriters[element.nodeName];
        if (!rewriter) {
            continue;
        }
        const replacement = rewriter(element);
        if (replacement && replacement !== element) {
            element.parentNode?.replaceChild(replacement, element);
        }
    }
}

/**
 * Remove text nodes that are nothing but collapsible whitespace.
 *
 * Skipped inside `<pre>`, where whitespace is the content. Also skipped when the text sits
 * between two inline nodes, where the space is a real word separator rather than markup
 * indentation.
 */
function prunePureWhitespace(root: Node): void {
    const walker = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
    const doomed: Text[] = [];
    for (;;) {
        const node = walker.NextNode();
        if (!node) {
            break;
        }
        if (!isTextNode(node) || !isWhitespaceOnly(node.data)) {
            continue;
        }
        if (isInsidePreformatted(node, root) || separatesInlineContent(node)) {
            continue;
        }
        doomed.push(node);
    }
    for (const node of doomed) {
        detach(node);
    }
}

/** True when the node has a `<pre>` ancestor within the subtree being cleaned. */
function isInsidePreformatted(node: Node, root: Node): boolean {
    let current: Node | null = node.parentNode;
    while (current && current !== root.parentNode) {
        if (current.nodeName === 'PRE') {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

/** True when whitespace sits between two inline neighbours and is therefore a real space. */
function separatesInlineContent(node: Node): boolean {
    const previous = node.previousSibling;
    const next = node.nextSibling;
    return !!previous && !!next && isInline(previous) && isInline(next);
}

/**
 * Remove inline elements that contain nothing.
 *
 * Recurses **depth-first, children before parent**, so a nested chain collapses in a single
 * pass: in `<span><i></i></span>` the `<i>` is removed first, which is what leaves the
 * `<span>` empty and therefore eligible in the same sweep.
 *
 * Deliberately not written on `PreviousPostOrderNode` — that walk yields parents *before*
 * their children, which would judge the `<span>` while it still had an `<i>` inside and
 * leave the chain half-collapsed.
 */
export function removeEmptyInlines(root: Node): void {
    for (const child of Array.from(root.childNodes)) {
        if (!isElement(child)) {
            continue;
        }
        removeEmptyInlines(child);
        if (!isLeaf(child) && isInline(child) && child.childNodes.length === 0) {
            detach(child);
        }
    }
}

/** Snapshot elements before mutating, since the walk reparents nodes. */
function snapshotElements(root: Node): Element[] {
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

/** Re-tag an element, carrying its attributes and children across. */
function renameElement(element: Element, tagName: string): Element {
    const replacement = createElement(ownerDocumentOf(element), tagName);
    for (const name of element.getAttributeNames()) {
        replacement.setAttribute(name, element.getAttribute(name) ?? '');
    }
    while (element.firstChild) {
        replacement.appendChild(element.firstChild);
    }
    return replacement;
}

/** Translate a legacy `<font>` element into an inline-styled `<span>`. */
function convertFontElement(element: Element): Element {
    const span = createElement(ownerDocumentOf(element), 'SPAN');
    const styles: string[] = [];
    const color = element.getAttribute('color');
    const face = element.getAttribute('face');
    if (color) {
        styles.push(`color:${color}`);
    }
    if (face) {
        styles.push(`font-family:${face}`);
    }
    const existing = element.getAttribute('style');
    if (existing) {
        styles.push(existing.replace(/;\s*$/, ''));
    }
    if (styles.length > 0) {
        span.setAttribute('style', styles.join(';'));
    }
    while (element.firstChild) {
        span.appendChild(element.firstChild);
    }
    return span;
}

/**
 * Turn a `<span style="font-weight:bold">` into a real `<b>`.
 *
 * Word and Google Docs both emit weight-styled spans rather than semantic tags; without
 * this the format engine cannot tell the text is bold, and the toolbar button reads as off
 * over visibly bold text.
 */
function convertBoldSpan(element: Element): Element | null {
    const style = element.getAttribute('style');
    if (!style || !/font-weight\s*:\s*(bold|[7-9]00)\b/i.test(style)) {
        return null;
    }
    const bold = createElement(ownerDocumentOf(element), 'B');
    const remaining = style
        .split(';')
        .filter((declaration) => declaration.trim() && !/^\s*font-weight\s*:/i.test(declaration))
        .join(';')
        .trim();
    if (remaining) {
        bold.setAttribute('style', remaining);
    }
    for (const name of element.getAttributeNames()) {
        if (name !== 'style') {
            bold.setAttribute(name, element.getAttribute(name) ?? '');
        }
    }
    while (element.firstChild) {
        bold.appendChild(element.firstChild);
    }
    return bold;
}
