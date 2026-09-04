import { NON_BREAKING_SPACE, ZERO_WIDTH_SPACE_PATTERN } from '../constants';
import { findLinks } from '../format/links';
import { DefaultBlockSpec } from '../node/block';
import { isBlock, isContainer } from '../node/category';
import { isElement, isTextNode } from '../node/utils';

/**
 * Plain text in both directions: what goes on the clipboard beside the HTML, and how
 * pasted plain text becomes blocks.
 */

/**
 * Render a subtree as plain text. Blocks become lines, `<br>` becomes a newline, caret
 * ballast disappears. Deterministic, unlike `innerText`, which depends on layout and is
 * absent in headless environments.
 */
export function fragmentToPlainText(node: Node): string {
    const out: string[] = [];
    appendPlainText(node, out);
    return out.join('').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function appendPlainText(node: Node, out: string[]): void {
    if (isTextNode(node)) {
        out.push(node.data.replace(ZERO_WIDTH_SPACE_PATTERN, ''));
        return;
    }
    if (!isElement(node) && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
        return;
    }
    if (node.nodeName === 'BR') {
        out.push('\n');
        return;
    }
    const isBlockLike = isElement(node) && (isBlock(node) || isContainer(node));
    if (isBlockLike) {
        ensureLineBreak(out);
    }
    for (const child of Array.from(node.childNodes)) {
        appendPlainText(child, out);
    }
    if (isBlockLike) {
        ensureLineBreak(out);
    }
}

function ensureLineBreak(out: string[]): void {
    if (out.length > 0 && !out[out.length - 1].endsWith('\n')) {
        out.push('\n');
    }
}

/**
 * Turn pasted plain text into HTML the paste pipeline can insert: one default block per
 * line, blank lines as filler blocks, HTML characters escaped, leading/trailing/double
 * spaces made non-breaking so they survive HTML whitespace collapsing, and — when
 * `addLinks` is set — addresses wrapped in `<a>`.
 */
export function plainTextToHtml(text: string, spec: DefaultBlockSpec, addLinks: boolean): string {
    const tag = spec.Tag.toLowerCase();
    const attributes = Object.entries(spec.Attributes ?? {})
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join('');
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    return lines
        .map((line) => {
            const content = line === '' ? '<br>' : renderLine(line, addLinks);
            return `<${tag}${attributes}>${content}</${tag}>`;
        })
        .join('');
}

/** Escape one line and mark up any addresses in it. */
function renderLine(line: string, addLinks: boolean): string {
    const spaced = preserveSpaces(line);
    if (!addLinks) {
        return escapeHtml(spaced);
    }
    // Addresses never contain spaces, so matching after the space rewrite is safe.
    const parts: string[] = [];
    let cursor = 0;
    for (const link of findLinks(spaced)) {
        parts.push(escapeHtml(spaced.slice(cursor, link.Index)));
        parts.push(`<a href="${escapeAttribute(link.Href)}">${escapeHtml(link.Text)}</a>`);
        cursor = link.Index + link.Text.length;
    }
    parts.push(escapeHtml(spaced.slice(cursor)));
    return parts.join('');
}

/** Leading, trailing, and doubled spaces collapse in HTML; make them non-breaking. */
function preserveSpaces(text: string): string {
    // Function replacements: a string in the replacement slot would have `$` sequences expanded.
    return text
        .replace(/^ /, () => NON_BREAKING_SPACE)
        .replace(/ $/, () => NON_BREAKING_SPACE)
        .replace(/ {2}/g, () => ` ${NON_BREAKING_SPACE}`);
}

export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
    return escapeHtml(text).replace(/"/g, '&quot;');
}
