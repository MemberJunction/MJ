import { SHOW_ELEMENT_OR_TEXT, ZERO_WIDTH_SPACE, ZERO_WIDTH_SPACE_PATTERN } from '../constants';
import { getClosestBlock, fixCursor } from '../node/block';
import { isInline, isLeaf, resetNodeCategoryCache } from '../node/category';
import { mergeInlines, split } from '../node/merge-split';
import { TreeIterator } from '../node/tree-iterator';
import { createElement, detach, indexOfNode, isElement, isTextNode, ownerDocumentOf, unwrap } from '../node/utils';
import { getBlocksInRange } from '../range/block-range';
import { moveRangeBoundariesDownTree, moveRangeBoundariesUpTree } from '../range/boundaries';
import { clampRangeToNode, isNodeContainedInRange } from '../range/containment';
import { insertNodeInRange } from '../range/contents';
import { removeZeroWidthSpaces } from '../zws';

/**
 * The inline format engine: bold, italic, underline, strikethrough, inline code, links.
 *
 * An inline format is a tag plus, optionally, attributes that must match (`A` with a given
 * `href`). Applying one wraps each text node in the selection; removing one splits the
 * document open at the selection edges and unwraps whatever falls inside. The document is
 * touched only at the selection and its immediate seams — never re-canonicalized.
 *
 * ## Aliases
 *
 * The clean pipeline rewrites `STRONG`→`B` and `EM`→`I` on **paste only**; on load, tags are
 * preserved exactly. This engine therefore has to recognise both spellings of every format
 * it manages, or the Bold button would read as off over a loaded `<strong>`. The alias table
 * is the entire cost of that fidelity decision.
 */

/** A format the engine can query, apply, or remove. */
export interface InlineFormat {
    /** Uppercase tag name — the canonical spelling the engine *creates*. */
    Tag: string;
    /** Attributes that must be present with these exact values to count as a match. */
    Attributes?: Readonly<Record<string, string>> | null;
}

/** Tags that mean the same thing, keyed by the canonical tag the engine creates. */
export const INLINE_FORMAT_ALIASES: Readonly<Record<string, ReadonlySet<string>>> = {
    B: new Set(['B', 'STRONG']),
    I: new Set(['I', 'EM']),
    S: new Set(['S', 'STRIKE', 'DEL']),
    U: new Set(['U']),
    CODE: new Set(['CODE', 'TT', 'KBD', 'SAMP']),
    A: new Set(['A']),
};

/** Every tag name that counts as `format.Tag`. */
export function tagsMatching(format: InlineFormat): ReadonlySet<string> {
    return INLINE_FORMAT_ALIASES[format.Tag] ?? new Set([format.Tag]);
}

/** True when the element is `format.Tag` (or an alias) and carries the required attributes. */
export function elementMatchesFormat(element: Element, format: InlineFormat): boolean {
    if (!tagsMatching(format).has(element.nodeName)) {
        return false;
    }
    const attributes = format.Attributes;
    if (!attributes) {
        return true;
    }
    for (const [name, value] of Object.entries(attributes)) {
        if (element.getAttribute(name) !== value) {
            return false;
        }
    }
    return true;
}

/** Nearest ancestor-or-self matching the format, bounded by `root`. */
export function getNearestFormat(node: Node | null, root: Node, format: InlineFormat): Element | null {
    let current: Node | null = node;
    while (current && current !== root) {
        if (isElement(current) && elementMatchesFormat(current, format)) {
            return current;
        }
        current = current.parentNode;
    }
    return null;
}

/**
 * Does the whole selection carry the format?
 *
 * A collapsed selection has the format if the caret is inside a matching element. A
 * non-collapsed one has it only if every text node it touches does — partial coverage reads
 * as "off", which is what makes toggling on a mixed selection apply rather than remove.
 */
export function hasFormat(root: Node, range: Range, format: InlineFormat): boolean {
    const probe = range.cloneRange();
    tightenRangeEdges(probe);

    const common = probe.commonAncestorContainer;
    if (getNearestFormat(common, root, format)) {
        return true;
    }
    if (isTextNode(common)) {
        return false;
    }

    const walker = new TreeIterator<Text>(common, SHOW_ELEMENT_OR_TEXT, (node) =>
        isTextNode(node) && isNodeContainedInRange(probe, node, true),
    );
    let sawText = false;
    for (;;) {
        const text = walker.NextNode();
        if (!text) {
            break;
        }
        if (!getNearestFormat(text, root, format)) {
            return false;
        }
        sawText = true;
    }
    return sawText;
}

/**
 * Pull the edges of a non-collapsed range in off adjacent text nodes it does not actually
 * cover: a start at the very end of one text node means "the next node", and an end at the
 * very start of one means "the previous node". Without this, `<b>a</b>|bc` with the caret
 * dragged from just after `a` would report bold because the start boundary technically sits
 * inside the `<b>`'s text.
 */
function tightenRangeEdges(range: Range): void {
    if (range.collapsed) {
        return;
    }
    const start = range.startContainer;
    if (isTextNode(start) && range.startOffset === start.length && start.nextSibling) {
        range.setStartBefore(start.nextSibling);
    }
    const end = range.endContainer;
    if (isTextNode(end) && range.endOffset === 0 && end.previousSibling) {
        range.setEndAfter(end.previousSibling);
    }
}

// ---------------------------------------------------------------------------
// addFormat
// ---------------------------------------------------------------------------

/**
 * Apply a format across the range, mutating `range` to cover the result.
 *
 * Collapsed: a **pending format**. An empty wrapper holding a zero-width space is inserted
 * and the caret placed after the space, so the next typed character lands inside the wrapper
 * — how "press Bold, then type" works in every editor. If nothing is typed the wrapper is
 * swept away the next time the engine clears zero-width spaces.
 *
 * Non-collapsed: each text node (and `<br>`/`<img>` leaf) the range touches is wrapped
 * unless it already sits inside a matching element. Text nodes are split at the range edges
 * first so only the selected characters are wrapped.
 */
export function addFormat(root: Node, range: Range, format: InlineFormat): void {
    if (range.collapsed) {
        addPendingFormat(root, range, format);
        return;
    }

    const doc = ownerDocumentOf(root);
    const walker = new TreeIterator(range.commonAncestorContainer, SHOW_ELEMENT_OR_TEXT, (node) =>
        (isTextNode(node) || node.nodeName === 'BR' || node.nodeName === 'IMG') &&
        isNodeContainedInRange(range, node, true),
    );
    const bounds = positionWalkerAtStart(walker, range);
    if (!bounds) {
        return;
    }
    let current: Node | null = walker.CurrentNode;
    while (current) {
        if (!getNearestFormat(current, root, format)) {
            const node = trimToSelection(current, bounds);
            walker.CurrentNode = node;
            const wrapper = createElement(doc, format.Tag, format.Attributes ?? null);
            node.parentNode?.replaceChild(wrapper, node);
            wrapper.appendChild(node);
        }
        current = walker.NextNode();
    }

    resetNodeCategoryCache();
    range.setStart(bounds.StartContainer, bounds.StartOffset);
    range.setEnd(bounds.EndContainer, bounds.EndOffset);
    mergeInlines(range.commonAncestorContainer, range);
    moveRangeBoundariesDownTree(range);
}

/** The range's boundaries as plain values, kept current while text nodes are split. */
interface RangeBounds {
    StartContainer: Node;
    StartOffset: number;
    EndContainer: Node;
    EndOffset: number;
}

/**
 * Put the walker on the first node it accepts within the range and return the bounds to
 * track, or null when the range holds nothing to format.
 */
function positionWalkerAtStart(walker: TreeIterator, range: Range): RangeBounds | null {
    const bounds: RangeBounds = {
        StartContainer: range.startContainer,
        StartOffset: range.startOffset,
        EndContainer: range.endContainer,
        EndOffset: range.endOffset,
    };
    walker.CurrentNode = bounds.StartContainer;
    if (!walker.IsAcceptableNode(bounds.StartContainer)) {
        const first = walker.NextNode();
        if (!first) {
            return null;
        }
        bounds.StartContainer = first;
        bounds.StartOffset = 0;
    }
    return bounds;
}

/**
 * Split a boundary text node so only its selected characters get wrapped, updating the
 * recorded bounds to follow the split. Returns the node that should be wrapped.
 */
function trimToSelection(node: Node, bounds: RangeBounds): Node {
    if (!isTextNode(node)) {
        return node;
    }
    if (node === bounds.EndContainer && node.length > bounds.EndOffset) {
        node.splitText(bounds.EndOffset);
    }
    if (node !== bounds.StartContainer || bounds.StartOffset === 0) {
        return node;
    }
    const tail = node.splitText(bounds.StartOffset);
    if (bounds.EndContainer === node) {
        bounds.EndContainer = tail;
        bounds.EndOffset -= bounds.StartOffset;
    } else if (bounds.EndContainer === node.parentNode) {
        bounds.EndOffset += 1;
    }
    bounds.StartContainer = tail;
    bounds.StartOffset = 0;
    return tail;
}

/** The collapsed-selection branch of {@link addFormat}. */
function addPendingFormat(root: Node, range: Range, format: InlineFormat): void {
    const doc = ownerDocumentOf(root);
    const wrapper = createElement(doc, format.Tag, format.Attributes ?? null);
    resetNodeCategoryCache();
    fixCursor(wrapper);
    insertNodeInRange(range, wrapper);

    const ballast = wrapper.firstChild;
    const focusNode: Node = ballast ?? wrapper;
    range.setStart(focusNode, isTextNode(focusNode) ? focusNode.length : 0);
    range.collapse(true);

    // Any *other* pending-format ballast in this block is now stale.
    const block = getClosestBlock(wrapper, root);
    if (block) {
        removeZeroWidthSpaces(block, ballast);
    }
}

// ---------------------------------------------------------------------------
// removeFormat
// ---------------------------------------------------------------------------

/**
 * Remove a format across the range, mutating `range` to cover the result.
 *
 * Collapsed: the caret "escapes" the format. The enclosing element is split at the caret
 * and a zero-width-space text node placed between the halves, so subsequent typing is
 * unformatted. Other formats the caret was inside are re-wrapped around the escape point —
 * turning italic off while in bold-italic leaves you in bold.
 *
 * Non-collapsed: handled block by block. Within each block, the slice of the selection is
 * split open up to the block, every matching element in the resulting sibling run is
 * unwrapped, and alike inline neighbours are merged back together.
 */
export function removeFormat(root: Node, range: Range, format: InlineFormat): void {
    if (range.collapsed) {
        escapeFormatAtCaret(root, range, format);
        return;
    }
    unwrapInRange(root, range, (element) => elementMatchesFormat(element, format));
}

/**
 * Strip every inline element from the range, leaving plain text (and `<br>`s) inside the
 * existing blocks. Links go too — "remove formatting" is expected to produce clean text.
 */
export function removeAllFormatting(root: Node, range: Range): void {
    if (range.collapsed) {
        return;
    }
    unwrapInRange(root, range, (element) => isInline(element) && !isLeaf(element));
}

/** The collapsed-selection branch of {@link removeFormat}. */
function escapeFormatAtCaret(root: Node, range: Range, format: InlineFormat): void {
    const formatElement = getNearestFormat(range.startContainer, root, format);
    const parent = formatElement?.parentNode;
    if (!formatElement || !parent) {
        return;
    }

    // Formats between the caret and the one being removed survive the escape.
    const preserved = inlineAncestorsBetween(range.startContainer, formatElement);

    const rightHalf = split(range.startContainer, range.startOffset, parent, root);
    const doc = ownerDocumentOf(root);
    const escape = doc.createTextNode(ZERO_WIDTH_SPACE);
    let insertion: Node = escape;
    for (const ancestor of preserved) {
        const clone = ancestor.cloneNode(false) as Element;
        clone.appendChild(insertion);
        insertion = clone;
    }
    parent.insertBefore(insertion, rightHalf);

    resetNodeCategoryCache();
    range.setStart(escape, 1);
    range.collapse(true);

    discardIfHollow(insertion.previousSibling);
    discardIfHollow(insertion.nextSibling);
    resetNodeCategoryCache();
}

/** Inline elements strictly between `node` and `stop`, innermost first. */
function inlineAncestorsBetween(node: Node, stop: Node): Element[] {
    const ancestors: Element[] = [];
    let current: Node | null = isTextNode(node) ? node.parentNode : node;
    while (current && current !== stop) {
        if (isElement(current) && isInline(current)) {
            ancestors.push(current);
        }
        current = current.parentNode;
    }
    return ancestors;
}

/**
 * Shared machinery for {@link removeFormat} and {@link removeAllFormatting}: per block,
 * split the selection open and unwrap what `shouldUnwrap` selects among the run.
 */
function unwrapInRange(root: Node, range: Range, shouldUnwrap: (element: Element) => boolean): void {
    const blocks = getBlocksInRange(range, root);
    if (blocks.length === 0) {
        return;
    }

    let newStart: { Container: Node; Offset: number } | null = null;
    let newEnd: { Container: Node; Offset: number } | null = null;

    for (const block of blocks) {
        const slice = clampRangeToNode(range, block);
        moveRangeBoundariesUpTree(slice, block, block);

        const runEnd = split(slice.endContainer, slice.endOffset, block, root);
        const runStart = split(slice.startContainer, slice.startOffset, block, root);
        const startIndex = runStart ? indexOfNode(runStart) : block.childNodes.length;

        unwrapRun(runStart, runEnd, shouldUnwrap);

        const endIndex = runEnd ? indexOfNode(runEnd) : block.childNodes.length;
        if (!newStart) {
            newStart = { Container: block, Offset: startIndex };
        }
        newEnd = { Container: block, Offset: endIndex };
    }

    resetNodeCategoryCache();
    if (newStart && newEnd) {
        range.setStart(newStart.Container, newStart.Offset);
        range.setEnd(newEnd.Container, newEnd.Offset);
    }
    for (const block of blocks) {
        mergeInlines(block, range);
    }
    moveRangeBoundariesDownTree(range);
}

/** Unwrap matching elements among the siblings `[start, end)` and their descendants. */
function unwrapRun(start: Node | null, end: Node | null, shouldUnwrap: (element: Element) => boolean): void {
    let current: Node | null = start;
    while (current && current !== end) {
        const next: Node | null = current.nextSibling;
        unwrapMatching(current, shouldUnwrap);
        current = next;
    }
    resetNodeCategoryCache();
}

/** Depth-first: unwrap matching descendants, then the node itself if it matches. */
function unwrapMatching(node: Node, shouldUnwrap: (element: Element) => boolean): void {
    if (!isElement(node)) {
        return;
    }
    for (const child of Array.from(node.childNodes)) {
        unwrapMatching(child, shouldUnwrap);
    }
    if (shouldUnwrap(node)) {
        unwrap(node);
    }
}

/**
 * Drop a non-leaf inline sibling that holds nothing renderable — the empty half a split
 * leaves behind when the caret sat at the very edge of a formatted run.
 */
function discardIfHollow(node: Node | null): void {
    if (!node || !isElement(node) || isLeaf(node) || !isInline(node)) {
        return;
    }
    const text = (node.textContent ?? '').replace(ZERO_WIDTH_SPACE_PATTERN, '');
    if (text === '' && !node.querySelector('BR,IMG,HR')) {
        detach(node);
    }
}

// ---------------------------------------------------------------------------
// changeFormat
// ---------------------------------------------------------------------------

/**
 * Remove one format and/or add another in a single operation. Either may be null.
 * The removal runs first so a re-application (a link with a new `href`) lands cleanly.
 */
export function changeFormat(
    root: Node,
    range: Range,
    add: InlineFormat | null,
    remove: InlineFormat | null,
): void {
    if (remove) {
        removeFormat(root, range, remove);
    }
    if (add) {
        addFormat(root, range, add);
    }
}

/** Toggle: remove when the whole selection has the format, otherwise apply it. */
export function toggleFormat(root: Node, range: Range, format: InlineFormat): void {
    if (hasFormat(root, range, format)) {
        removeFormat(root, range, format);
    } else {
        addFormat(root, range, format);
    }
}
