/**
 * Whitespace predicates.
 *
 * HTML collapses runs of whitespace, so a text node made entirely of spaces/tabs/newlines
 * between two blocks renders as nothing and is safe to prune. The same text node *inside*
 * a `<pre>` is significant and must never be touched — every caller is responsible for
 * checking its `<pre>` context before pruning.
 */

/**
 * Matches any character that is not collapsible whitespace.
 *
 * Deliberately narrower than `\S`: only space, tab, carriage return, and newline collapse
 * in HTML. A non-breaking space is NOT whitespace for this purpose — it renders, and the
 * engine inserts them on purpose (see `NON_BREAKING_SPACE`), so treating one as prunable
 * would delete visible content.
 */
export const NOT_WHITESPACE = /[^ \t\r\n]/;

/** True when the string is empty or contains only collapsible whitespace. */
export function isWhitespaceOnly(text: string): boolean {
    return !NOT_WHITESPACE.test(text);
}

/**
 * True when the node is a text node whose content collapses away entirely.
 *
 * Note that a zero-width space is not collapsible whitespace, so a ZWS-bearing text node
 * is correctly reported as non-empty — the engine relies on those surviving.
 */
export function isCollapsibleWhitespaceNode(node: Node): boolean {
    return node.nodeType === Node.TEXT_NODE && isWhitespaceOnly(node.nodeValue ?? '');
}
