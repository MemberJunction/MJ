import { SHOW_ELEMENT } from '../constants';
import { createDefaultBlock, fixCursor } from '../node/block';
import { isBlock, resetNodeCategoryCache } from '../node/category';
import { TreeIterator } from '../node/tree-iterator';
import { RichTextBrPolicy } from '../../rich-text-editor.types';

/**
 * `<br>` handling, and the reason it is decided **per content source** rather than globally.
 *
 * A trailing `<br>` is ambiguous: in Gmail-composed mail it is usually a real blank line the
 * author typed, while in Word-pasted markup it is usually a layout artifact. The reference
 * implementation applies one rule everywhere and consequently eats meaningful trailing
 * breaks out of pasted email (fastmail/Squire #481).
 *
 * So the policy follows the source:
 *
 * - **`'preserve'`** (load) — do nothing at all. Loaded content is authoritative; a `<br>`
 *   the user did not touch stays exactly where it was.
 * - **`'normalize'`** (paste) — convert `<br>`-soup into real block structure, so pasted
 *   content adopts the document's block model instead of importing a foreign one.
 */

/**
 * Apply the `<br>` policy to a subtree, in place.
 *
 * Returns without touching anything under `'preserve'` — the no-op is the point, not an
 * unimplemented case.
 */
export function cleanupBRs(root: Node, policy: RichTextBrPolicy): void {
    if (policy === 'preserve') {
        return;
    }
    for (const block of snapshotBlocks(root)) {
        splitBlockOnLineBreaks(block);
    }
    resetNodeCategoryCache();
}

/**
 * Split one block at each `<br>` it directly contains.
 *
 * `a<br>b` becomes two blocks; `a<br><br>b` becomes three, the middle one empty — which is
 * exactly the blank line the two consecutive breaks represented.
 *
 * A **trailing** `<br>` produces a final empty segment that is deliberately discarded:
 * `a<br>` renders as one line, so turning it into a line plus a blank line would invent
 * vertical space the author never wrote.
 */
function splitBlockOnLineBreaks(block: Element): void {
    const segments = partitionOnLineBreaks(block);
    if (segments.length <= 1) {
        return;
    }
    if (isEmptySegment(segments[segments.length - 1])) {
        segments.pop();
    }
    if (segments.length <= 1) {
        // A single trailing break and nothing else to split on. It has already been
        // detached by the partition, and the block keeps the rest of its children — which
        // is precisely the "drop the redundant trailing break" outcome.
        //
        // Except when that break WAS the whole block: `<div><br></div>` is an empty line,
        // and the detached `<br>` was its filler, not a redundant trailing break. fixCursor
        // puts it back, and correctly declines to when real content remains.
        resetNodeCategoryCache();
        fixCursor(block);
        return;
    }

    const parent = block.parentNode;
    if (!parent) {
        return;
    }
    const doc = block.ownerDocument as Document;
    for (const segment of segments) {
        // Each new block keeps the original's tag and attributes, so splitting a styled
        // paragraph yields styled paragraphs rather than bare divs.
        const replacement = createDefaultBlock(doc, { Tag: block.nodeName, Attributes: null });
        copyAttributes(block, replacement);
        for (const node of segment) {
            replacement.appendChild(node);
        }
        resetNodeCategoryCache();
        fixCursor(replacement);
        parent.insertBefore(replacement, block);
    }
    parent.removeChild(block);
}

/** Group a block's direct children into runs separated by `<br>` elements. */
function partitionOnLineBreaks(block: Element): Node[][] {
    const segments: Node[][] = [[]];
    let sawLineBreak = false;
    for (const child of Array.from(block.childNodes)) {
        if (child.nodeName === 'BR') {
            sawLineBreak = true;
            block.removeChild(child);
            segments.push([]);
            continue;
        }
        segments[segments.length - 1].push(child);
    }
    return sawLineBreak ? segments : [segments[0]];
}

/** True when a segment holds nothing that renders. */
function isEmptySegment(segment: readonly Node[]): boolean {
    return segment.every((node) => (node.textContent ?? '') === '' && node.nodeType === Node.TEXT_NODE);
}

/** Copy every attribute from one element to another. */
function copyAttributes(from: Element, to: Element): void {
    for (const name of from.getAttributeNames()) {
        to.setAttribute(name, from.getAttribute(name) ?? '');
    }
}

/** Snapshot blocks before mutating, since splitting replaces them. */
function snapshotBlocks(root: Node): Element[] {
    const walker = new TreeIterator<Element>(root, SHOW_ELEMENT, isBlock);
    const blocks: Element[] = [];
    for (;;) {
        const next = walker.NextNode();
        if (!next) {
            return blocks;
        }
        blocks.push(next);
    }
}
