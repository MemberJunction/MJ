import { HEADING_TAGS, SHOW_ELEMENT } from '../constants';
import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, createDefaultBlock, fixContainer, fixCursor } from '../node/block';
import { isBlock, resetNodeCategoryCache } from '../node/category';
import { TreeIterator } from '../node/tree-iterator';
import { createElement, detach, empty, getNearest, isElement, ownerDocumentOf, replaceWith, unwrap } from '../node/utils';
import { mergeContainers, split } from '../node/merge-split';
import { expandRangeToBlockBoundaries, moveRangeBoundariesDownTree, moveRangeBoundariesUpTree } from '../range/boundaries';
import { getStartBlockOfRange } from '../range/block-range';
import { extractContentsOfRange, insertNodeInRange } from '../range/contents';

/**
 * The block format engine: quotes, lists, headings.
 *
 * Every block command is the same four steps — `modifyBlocks` owns them and the commands
 * supply only the middle one:
 *
 *   1. widen the selection to whole blocks and lift it to the root;
 *   2. **extract** those blocks into a fragment;
 *   3. hand the fragment to a **pure transform** that returns what should replace it;
 *   4. **reinsert**, then merge the seams (two adjacent `<ul>`s become one).
 *
 * The transforms never see the live document. They cannot leave it half-modified, cannot
 * disturb the selection, and can be tested by feeding them a fragment.
 */

/** A pure transform: takes the extracted fragment, returns the node to reinsert. */
export type BlockTransform = (fragment: DocumentFragment, spec: DefaultBlockSpec) => Node;

/** Per-tag attribute defaults the engine stamps onto elements it creates. */
export type TagAttributeTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Inputs shared by every block command. */
export interface BlockOperationOptions {
    BlockSpec?: DefaultBlockSpec;
    TagAttributes?: TagAttributeTable;
}

/**
 * Run a block transform over the blocks the range touches. Leaves `range` collapsed at the
 * start of the reinserted content, positioned on a text node where possible.
 */
export function modifyBlocks(
    root: Node,
    range: Range,
    transform: BlockTransform,
    options: BlockOperationOptions = {},
): void {
    const spec = options.BlockSpec ?? DEFAULT_BLOCK_SPEC;

    expandRangeToBlockBoundaries(range, root);
    moveRangeBoundariesUpTree(range, root, root);

    const fragment = extractContentsOfRange(range, root, root);
    removeStrayRootFiller(root);

    const replacement = transform(fragment, spec);
    resetNodeCategoryCache();
    insertNodeInRange(range, replacement);

    const container = range.endContainer;
    if (range.endOffset < container.childNodes.length) {
        mergeContainers(container.childNodes[range.endOffset], root, spec);
    }
    mergeContainers(container.childNodes[range.startOffset], root, spec);

    resetNodeCategoryCache();
    range.collapse(true);
    moveRangeBoundariesDownTree(range);
}

/**
 * Extracting every block leaves the root momentarily empty, and `extractContentsOfRange`
 * dutifully gives it a filler `<br>`. A bare `<br>` at root level violates "containers hold
 * only blocks" and would sit beside the reinserted content as a phantom blank line.
 */
function removeStrayRootFiller(root: Node): void {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeName === 'BR') {
            detach(child);
        }
    }
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** Wrap the blocks in one more `<blockquote>`. */
export function increaseQuoteLevel(attributes?: TagAttributeTable): BlockTransform {
    return (fragment) => createElement(ownerDocumentOf(fragment), 'BLOCKQUOTE', attributes?.['BLOCKQUOTE'] ?? null, [fragment]);
}

/** Unwrap the outermost `<blockquote>` around each block. */
export function decreaseQuoteLevel(): BlockTransform {
    return (fragment) => {
        const quotes = Array.from(fragment.querySelectorAll('blockquote')).filter(
            (quote) => !getNearest(quote.parentNode, fragment, 'BLOCKQUOTE'),
        );
        for (const quote of quotes) {
            unwrap(quote);
        }
        return fragment;
    };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** List container tags. */
export type ListTag = 'OL' | 'UL';

/**
 * Turn each block into an item of a `type` list, or retag lists of the other type.
 *
 * Blocks that are already items keep their place; a `<ul>` asked to become ordered is
 * re-created as an `<ol>` with the same items. Adjacent new items share one list.
 */
export function makeList(type: ListTag, attributes?: TagAttributeTable): BlockTransform {
    return (fragment) => {
        const doc = ownerDocumentOf(fragment);
        const walker = new TreeIterator<Element>(fragment, SHOW_ELEMENT, isBlock);
        for (;;) {
            let node: Element | null = walker.NextNode();
            if (!node) {
                break;
            }
            const parent = node.parentNode;
            if (parent && parent.nodeName === 'LI') {
                // A block nested inside an item: operate on the item.
                node = parent as Element;
                walker.CurrentNode = node.lastChild ?? node;
            }
            if (node.nodeName !== 'LI') {
                const item = createElement(doc, 'LI', attributes?.['LI'] ?? null);
                const previous = node.previousSibling;
                if (previous && previous.nodeName === type) {
                    previous.appendChild(item);
                    detach(node);
                } else {
                    replaceWith(node, createElement(doc, type, attributes?.[type] ?? null, [item]));
                }
                item.appendChild(empty(node));
                walker.CurrentNode = item;
            } else {
                const list = node.parentNode;
                if (list && isElement(list) && list.nodeName !== type && /^[OU]L$/.test(list.nodeName)) {
                    replaceWith(list, createElement(doc, type, attributes?.[type] ?? null, [empty(list)]));
                }
            }
        }
        resetNodeCategoryCache();
        return fragment;
    };
}

/** Flatten every list in the fragment back into default blocks. */
export function removeList(): BlockTransform {
    return (fragment, spec) => {
        const doc = ownerDocumentOf(fragment);
        for (const item of Array.from(fragment.querySelectorAll('li'))) {
            resetNodeCategoryCache();
            if (isBlock(item)) {
                const block = createDefaultBlock(doc, spec, [empty(item)]);
                replaceWith(item, block);
                resetNodeCategoryCache();
                fixCursor(block);
            } else {
                fixContainer(item, spec);
                unwrap(item);
            }
        }
        for (const list of Array.from(fragment.querySelectorAll('ul,ol'))) {
            unwrap(list);
        }
        resetNodeCategoryCache();
        return fragment;
    };
}

/**
 * The list a range sits in, with the first and last items it touches.
 *
 * Unlike the other block commands, changing list *level* is not a fragment transform: the
 * item being nested has to move into its **previous sibling**, which is outside any
 * selection-derived fragment. So the level operations work in place, and this is how they
 * find their operands.
 */
export interface ListSelection {
    List: Element;
    StartItem: Element | null;
    EndItem: Element | null;
}

/** Locate the enclosing list and the items the range spans, or null outside a list. */
export function getListSelection(range: Range, root: Node): ListSelection | null {
    let list: Node | null = range.commonAncestorContainer;
    while (list && list !== root && !/^[OU]L$/.test(list.nodeName)) {
        list = list.parentNode;
    }
    if (!list || list === root || !isElement(list)) {
        return null;
    }
    return {
        List: list,
        StartItem: itemUnder(list, range.startContainer, range.startOffset, 'forward'),
        EndItem: itemUnder(list, range.endContainer, range.endOffset, 'backward'),
    };
}

/** The `<li>` child of `list` that holds a boundary, snapping off whitespace between items. */
function itemUnder(list: Element, container: Node, offset: number, snap: 'forward' | 'backward'): Element | null {
    let node: Node | null = container;
    if (node === list) {
        node = snap === 'forward' ? (list.childNodes[offset] ?? list.lastChild) : (list.childNodes[offset - 1] ?? list.firstChild);
    }
    while (node && node.parentNode !== list) {
        node = node.parentNode;
    }
    while (node && node.nodeName !== 'LI') {
        node = snap === 'forward' ? node.nextSibling : node.previousSibling;
    }
    return node && isElement(node) ? node : null;
}

/** A range's boundaries, held as plain values so they survive the nodes being moved. */
interface SavedRange {
    StartContainer: Node;
    StartOffset: number;
    EndContainer: Node;
    EndOffset: number;
}

function saveRange(range: Range): SavedRange {
    return {
        StartContainer: range.startContainer,
        StartOffset: range.startOffset,
        EndContainer: range.endContainer,
        EndOffset: range.endOffset,
    };
}

/**
 * Put a saved range back after its nodes have been moved. Moving a node collapses any live
 * range inside it up to the old parent, so the boundaries are re-applied from the saved
 * values; `replaced` maps nodes that no longer exist to their successors.
 */
function restoreRange(range: Range, saved: SavedRange, replaced: ReadonlyMap<Node, Node>): void {
    const start = replaced.get(saved.StartContainer) ?? saved.StartContainer;
    const end = replaced.get(saved.EndContainer) ?? saved.EndContainer;
    range.setStart(start, Math.min(saved.StartOffset, lengthOf(start)));
    range.setEnd(end, Math.min(saved.EndOffset, lengthOf(end)));
}

function lengthOf(node: Node): number {
    return node.nodeType === Node.TEXT_NODE ? (node as Text).length : node.childNodes.length;
}

/**
 * Nest the selected items one level deeper — **inside the previous item**, which is the
 * only valid place for a sublist. The reference implementation emits `<ul>` as a direct
 * child of `<ul>`; browsers render it, but the markup is invalid and mail clients disagree
 * about the indent (fastmail/Squire #483).
 *
 * The first item of a list has nothing to nest under and is left alone. Returns whether
 * anything changed; the range keeps addressing the same content.
 */
export function increaseListLevel(root: Node, range: Range, attributes?: TagAttributeTable): boolean {
    const selection = getListSelection(range, root);
    if (!selection) {
        return false;
    }
    const { List: list } = selection;
    const start = selection.StartItem;
    const end = selection.EndItem ?? start;
    const previous = start?.previousElementSibling ?? null;
    if (!start || !end || !previous || previous.nodeName !== 'LI') {
        return false;
    }

    const saved = saveRange(range);
    const type = list.nodeName;
    let sublist = previous.lastElementChild;
    if (!sublist || sublist.nodeName !== type) {
        sublist = createElement(ownerDocumentOf(list), type, attributes?.[type] ?? null);
        previous.appendChild(sublist);
    }
    let item: Node | null = start;
    while (item) {
        const next: Node | null = item === end ? null : item.nextSibling;
        sublist.appendChild(item);
        item = next;
    }

    resetNodeCategoryCache();
    restoreRange(range, saved, new Map());
    return true;
}

/**
 * Lift the selected items one level. A nested item becomes a sibling of the item it was
 * nested under, and any items that followed it in the sublist become *its* sublist. A
 * top-level item leaves the list and becomes a default block, splitting the list around it.
 *
 * Returns whether anything changed; the range keeps addressing the same content.
 */
export function decreaseListLevel(root: Node, range: Range, spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC): boolean {
    const selection = getListSelection(range, root);
    if (!selection) {
        return false;
    }
    const { List: list } = selection;
    const start = selection.StartItem ?? firstItemOf(list);
    const end = selection.EndItem ?? lastItemOf(list) ?? start;
    if (!start || !end) {
        return false;
    }

    const saved = saveRange(range);
    const replaced = new Map<Node, Node>();

    let newParent: Node = list.parentNode ?? root;
    // Items after the selection stay in a list of their own — split off here.
    let insertBefore: Node | null = end.nextSibling ? split(list, end.nextSibling, newParent, root) : list.nextSibling;

    if (newParent !== root && newParent.nodeName === 'LI') {
        // Nested: the outdented items become siblings of the item they were under, and the
        // split-off followers are carried along as the last item's own sublist.
        const outerItem = newParent;
        newParent = outerItem.parentNode ?? root;
        adoptFollowers(end, insertBefore);
        insertBefore = outerItem.nextSibling;
    }

    const leavingLists = !/^[OU]L$/.test(newParent.nodeName);
    let item: Node | null = start;
    while (item) {
        const next: Node | null = item === end ? null : item.nextSibling;
        list.removeChild(item);
        const liberated = leavingLists && isElement(item) && item.nodeName === 'LI' ? liberateItem(item, spec, replaced, newParent) : item;
        newParent.insertBefore(liberated, insertBefore);
        item = next;
    }

    if (!list.firstChild) {
        detach(list);
    }
    if (insertBefore) {
        mergeContainers(insertBefore, root, spec);
    }
    resetNodeCategoryCache();
    restoreRange(range, saved, replaced);
    return true;
}

/** Move `first` and everything after it into `item`, as its trailing sublist content. */
function adoptFollowers(item: Element, first: Node | null): void {
    let follower: Node | null = first;
    while (follower) {
        const next: Node | null = follower.nextSibling;
        item.appendChild(follower);
        follower = next;
    }
}

/**
 * Turn a list item leaving its list into default blocks: an inline-content item becomes one
 * block, a container item becomes its blocks. Records the replacement so a caret that was
 * addressed inside the item can be restored.
 */
function liberateItem(item: Element, spec: DefaultBlockSpec, replaced: Map<Node, Node>, fallback: Node): Node {
    const doc = ownerDocumentOf(item);
    resetNodeCategoryCache();
    if (isBlock(item)) {
        const block = createDefaultBlock(doc, spec, [empty(item)]);
        resetNodeCategoryCache();
        fixCursor(block);
        replaced.set(item, block);
        return block;
    }
    fixContainer(item, spec);
    const blocks = empty(item);
    replaced.set(item, blocks.firstChild ?? fallback);
    return blocks;
}

function firstItemOf(list: Element): Element | null {
    return Array.from(list.children).find((child) => child.nodeName === 'LI') ?? null;
}

function lastItemOf(list: Element): Element | null {
    const items = Array.from(list.children).filter((child) => child.nodeName === 'LI');
    return items[items.length - 1] ?? null;
}

function copyAttributes(from: Element, to: Element): void {
    for (const name of from.getAttributeNames()) {
        to.setAttribute(name, from.getAttribute(name) ?? '');
    }
}

// ---------------------------------------------------------------------------
// Headings / block type
// ---------------------------------------------------------------------------

/**
 * Block tags whose *contents* are retagged rather than the element itself — changing a
 * list item or table cell into an `<h2>` would destroy the structure around it.
 */
const WRAP_CONTENTS_TAGS: ReadonlySet<string> = new Set(['LI', 'TD', 'TH', 'CAPTION', 'DT', 'DD']);

/**
 * Retag every block in the fragment as `tag`, or as the default block when `tag` is null.
 *
 * Attributes travel with the block: a styled paragraph made into a heading keeps its style.
 * Reverting to the default block applies the configured default attributes on top.
 *
 * The reference implementation has no block-type API at all — headings there are a
 * consumer-side hack. This is the missing primitive.
 */
export function setBlockType(tag: string | null, attributes?: TagAttributeTable): BlockTransform {
    return (fragment, spec) => {
        const doc = ownerDocumentOf(fragment);
        const targetTag = (tag ?? spec.Tag).toUpperCase();
        const walker = new TreeIterator<Element>(fragment, SHOW_ELEMENT, isBlock);
        const blocks: Element[] = [];
        for (;;) {
            const block = walker.NextNode();
            if (!block) {
                break;
            }
            blocks.push(block);
        }
        for (const block of blocks) {
            if (WRAP_CONTENTS_TAGS.has(block.nodeName)) {
                const inner = createElement(doc, targetTag, attributes?.[targetTag] ?? null, [empty(block)]);
                block.appendChild(inner);
                continue;
            }
            if (block.nodeName === targetTag) {
                continue;
            }
            const replacement = createElement(doc, targetTag, attributes?.[targetTag] ?? null);
            copyAttributes(block, replacement);
            if (tag === null && spec.Attributes) {
                for (const [name, value] of Object.entries(spec.Attributes)) {
                    replacement.setAttribute(name, value);
                }
            }
            replacement.appendChild(empty(block));
            replaceWith(block, replacement);
        }
        resetNodeCategoryCache();
        return fragment;
    };
}

/** True for the heading tags the toolbar exposes. */
export function isHeadingTag(tag: string): boolean {
    return HEADING_TAGS.has(tag.toUpperCase());
}

/** Tag name of the block the range starts in, or null outside any block. */
export function getBlockTag(root: Node, range: Range): string | null {
    return getStartBlockOfRange(range, root)?.nodeName ?? null;
}
