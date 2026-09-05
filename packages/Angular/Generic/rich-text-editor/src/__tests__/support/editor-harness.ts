import { resetNodeCategoryCache } from '../../lib/engine/node/category';
import { SHOW_TEXT } from '../../lib/engine/constants';
import { TreeIterator } from '../../lib/engine/node/tree-iterator';

/**
 * Test harness: load HTML with caret/selection markers.
 *
 * `|` marks a collapsed caret; `[` and `]` bracket a selection. Markers are removed from
 * the loaded content, so `loadWithSelection(root, '<div>he|llo</div>')` yields
 * `<div>hello</div>` and a range collapsed between `e` and `l`.
 *
 * Markers only work inside text; put them in a text node, not between tags. To address
 * an element boundary, build the range by hand.
 */

export interface Loaded {
    Root: HTMLElement;
    Range: Range;
}

/** Build an editor root attached to the document, as the real component would. */
export function createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    document.body.appendChild(root);
    resetNodeCategoryCache();
    return root;
}

/** Load raw HTML (no sanitizing, no fixContainer) and resolve markers into a range. */
export function loadWithSelection(root: HTMLElement, html: string): Range {
    root.innerHTML = html;
    resetNodeCategoryCache();
    const range = document.createRange();
    let start: { Node: Text; Offset: number } | null = null;
    let end: { Node: Text; Offset: number } | null = null;

    const walker = new TreeIterator<Text>(root, SHOW_TEXT);
    const texts: Text[] = [];
    for (;;) {
        const text = walker.NextNode();
        if (!text) {
            break;
        }
        texts.push(text);
    }
    for (const text of texts) {
        for (;;) {
            const index = text.data.search(/[|[\]]/);
            if (index < 0) {
                break;
            }
            const marker = text.data.charAt(index);
            text.deleteData(index, 1);
            if (marker === '|' || marker === '[') {
                start = { Node: text, Offset: index };
            }
            if (marker === '|' || marker === ']') {
                end = { Node: text, Offset: index };
            }
        }
    }
    if (!start || !end) {
        throw new Error(`loadWithSelection: no marker in ${html}`);
    }
    range.setStart(start.Node, start.Offset);
    range.setEnd(end.Node, end.Offset);
    // Empty text nodes left by a marker at the very edge of a node are dropped; the range
    // has already moved to the parent per live-range semantics.
    for (const text of texts) {
        if (text.data === '' && text.parentNode) {
            text.parentNode.removeChild(text);
        }
    }
    resetNodeCategoryCache();
    return range;
}

/** Serialize the root with `|` / `[ ]` markers re-inserted for the given range. */
export function htmlWithSelection(root: HTMLElement, range: Range): string {
    const clone = root.cloneNode(true) as HTMLElement;
    const cloneRange = mapRangeToClone(root, clone, range);
    if (cloneRange.collapsed) {
        insertMarker(cloneRange.startContainer, cloneRange.startOffset, '|');
    } else {
        // End first so the start offset stays valid.
        insertMarker(cloneRange.endContainer, cloneRange.endOffset, ']');
        insertMarker(cloneRange.startContainer, cloneRange.startOffset, '[');
    }
    return clone.innerHTML;
}

function mapRangeToClone(root: Node, clone: Node, range: Range): Range {
    const mapped = document.createRange();
    mapped.setStart(mapNode(root, clone, range.startContainer), range.startOffset);
    mapped.setEnd(mapNode(root, clone, range.endContainer), range.endOffset);
    return mapped;
}

function mapNode(root: Node, clone: Node, node: Node): Node {
    const path: number[] = [];
    let current: Node = node;
    while (current !== root) {
        const parent = current.parentNode as Node;
        path.push(Array.prototype.indexOf.call(parent.childNodes, current));
        current = parent;
    }
    let target: Node = clone;
    for (const index of path.reverse()) {
        target = target.childNodes[index];
    }
    return target;
}

function insertMarker(container: Node, offset: number, marker: string): void {
    if (container.nodeType === Node.TEXT_NODE) {
        (container as Text).insertData(offset, marker);
        return;
    }
    const text = document.createTextNode(marker);
    const reference = container.childNodes[offset] ?? null;
    container.insertBefore(text, reference);
}

/** Put the range into the live document selection. */
export function select(range: Range): void {
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
}
