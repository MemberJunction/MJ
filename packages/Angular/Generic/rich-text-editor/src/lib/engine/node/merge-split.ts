import { isContainer, isInline, resetNodeCategoryCache } from './category';
import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, createDefaultBlock, fixContainer, fixCursor } from './block';
import {
    areAlike,
    detach,
    empty,
    getNearest,
    indexOfNode,
    isElement,
    isTextNode,
    ownerDocumentOf,
} from './utils';

/**
 * The four structural primitives every editing command is built from: splitting a subtree
 * open, and the three flavours of putting one back together.
 *
 * All of them accept an optional live `Range` and patch its boundary points as they move
 * nodes around. Without that, a command that merges two text nodes would silently drop the
 * caret — the range would still point at a node that is no longer in the document.
 */

/** Where to split: a child index, or the specific child node to split before. */
export type SplitOffset = number | Node | null;

/**
 * Split the tree open from `node` up to (but not including) `stopNode`, returning the node
 * that now begins the right-hand side.
 *
 * Text nodes split with `splitText` and recurse on the parent. Elements are shallow-cloned,
 * the children from `offset` onward move into the clone, and the clone is inserted directly
 * after the original — then the same happens one level up, until `stopNode` is reached.
 *
 * Both halves are passed through `fixCursor`, so neither side is left as an unfocusable
 * empty block.
 */
export function split(node: Node, offset: SplitOffset, stopNode: Node | null, root: Node): Node | null {
    if (isTextNode(node) && node !== stopNode) {
        if (typeof offset !== 'number') {
            throw new Error('split: splitting a text node requires a numeric offset');
        }
        return split(node.parentNode as Node, node.splitText(offset), stopNode, root);
    }

    let nodeAfterSplit = resolveSplitPoint(node, offset);
    const parent = node.parentNode;
    if (!parent || node === stopNode || !isElement(node)) {
        return nodeAfterSplit;
    }

    const clone = node.cloneNode(false) as Element;
    while (nodeAfterSplit) {
        const next: Node | null = nodeAfterSplit.nextSibling;
        clone.appendChild(nodeAfterSplit);
        nodeAfterSplit = next;
    }

    preserveListNumbering(node, clone, root);

    // `node` just lost children and `clone` just gained them, so either may have flipped
    // between block and container. Classifying from a stale cache here is how an emptied
    // block silently misses its filler `<br>`.
    resetNodeCategoryCache();
    fixCursor(node);
    fixCursor(clone);

    parent.insertBefore(clone, node.nextSibling);
    return split(parent, clone, stopNode, root);
}

/** Normalize the `number | Node | null` offset into the first node of the right-hand side. */
function resolveSplitPoint(node: Node, offset: SplitOffset): Node | null {
    if (typeof offset !== 'number') {
        return offset;
    }
    return offset < node.childNodes.length ? node.childNodes[offset] : null;
}

/**
 * Keep an ordered list numbering continuously across a split.
 *
 * Splitting `<ol>` produces a second `<ol>` that would otherwise restart at 1. This only
 * applies inside a blockquote, where splitting a list is a quoting artifact rather than a
 * deliberate "start a new list" action by the user.
 */
function preserveListNumbering(node: Element, clone: Element, root: Node): void {
    if (node.nodeName !== 'OL' || !getNearest(node, root, 'BLOCKQUOTE')) {
        return;
    }
    const original = node as HTMLOListElement;
    (clone as HTMLOListElement).start = (Number(original.start) || 1) + node.childNodes.length;
}

// ---------------------------------------------------------------------------
// mergeInlines
// ---------------------------------------------------------------------------

/**
 * Fuse adjacent "alike" inline siblings throughout `node`, patching `range` as it goes.
 *
 * Formatting commands routinely leave `<b>a</b><b>b</b>` behind; without this the document
 * accumulates redundant wrappers on every keystroke, and `GetHTML` would report a diff for
 * an edit that changed nothing visible.
 *
 * Links are never merged — see `areAlike`.
 */
export function mergeInlines(node: Node, range?: Range | null): void {
    mergeAlikeSiblings(node, range);
    for (const child of Array.from(node.childNodes)) {
        if (isElement(child)) {
            mergeInlines(child, range);
        }
    }
}

/** One right-to-left pass fusing each child into its predecessor where they are alike. */
function mergeAlikeSiblings(node: Node, range?: Range | null): void {
    const children = node.childNodes;
    let index = children.length;
    while (index-- > 1) {
        const child = children[index];
        const previous = children[index - 1];
        if (!isInline(child) || !areAlike(child, previous)) {
            continue;
        }
        if (isTextNode(child) && isTextNode(previous)) {
            mergeTextNodes(previous, child, range);
        } else {
            mergeElements(previous, child, range);
        }
    }
}

/** Append `source`'s text to `target` and remove it, moving any range boundary along. */
function mergeTextNodes(target: Text, source: Text, range?: Range | null): void {
    // Character offset of the seam, captured before the append lengthens `target`.
    const seam = target.length;
    applyMerge(range, target, source, seam, () => {
        target.appendData(source.data);
        detach(source);
    });
}

/** Move `source`'s children into `target` and remove it, moving any range boundary along. */
function mergeElements(target: Node, source: Node, range?: Range | null): void {
    // Child index of the seam, captured before the append adds children.
    const seam = target.childNodes.length;
    applyMerge(range, target, source, seam, () => {
        target.appendChild(empty(source));
        detach(source);
    });
}

/** A range boundary as an explicit pair, so it survives the DOM mutation between reads. */
interface Boundary {
    Container: Node;
    Offset: number;
}

/**
 * Run a merge mutation and carry the range across it.
 *
 * Order matters and is easy to get wrong: boundaries are **captured first**, the DOM is
 * mutated **second**, and the range is rewritten **last**. Writing the new offset before
 * the append throws `IndexSizeError`, because the offset only becomes valid once `target`
 * has actually grown.
 */
function applyMerge(
    range: Range | null | undefined,
    target: Node,
    source: Node,
    seam: number,
    mutate: () => void,
): void {
    if (!range) {
        mutate();
        resetNodeCategoryCache();
        return;
    }

    const parent = source.parentNode;
    const sourceIndex = indexOfNode(source);
    const start: Boundary = { Container: range.startContainer, Offset: range.startOffset };
    const end: Boundary = { Container: range.endContainer, Offset: range.endOffset };

    mutate();
    resetNodeCategoryCache();

    const movedStart = remapBoundary(start, target, source, parent, sourceIndex, seam);
    const movedEnd = remapBoundary(end, target, source, parent, sourceIndex, seam);
    range.setStart(movedStart.Container, movedStart.Offset);
    range.setEnd(movedEnd.Container, movedEnd.Offset);
}

/**
 * Translate one boundary across "source's content moved into target, then source was removed".
 *
 * Three cases, and missing the third is a subtle caret-loss bug:
 *  1. The boundary was *inside* source — it shifts into target, past the seam.
 *  2. The boundary was in the shared parent pointing **at** source — it lands on the seam
 *     inside target. `mergeWithBlock` produces this case every time, because it positions
 *     the caret by child index rather than inside a text node.
 *  3. The boundary was in the shared parent pointing **after** source — one child is gone,
 *     so the index shifts down by one.
 */
function remapBoundary(
    boundary: Boundary,
    target: Node,
    source: Node,
    parent: Node | null,
    sourceIndex: number,
    seam: number,
): Boundary {
    if (boundary.Container === source) {
        return { Container: target, Offset: seam + boundary.Offset };
    }
    if (parent && boundary.Container === parent && sourceIndex >= 0) {
        if (boundary.Offset === sourceIndex) {
            return { Container: target, Offset: seam };
        }
        if (boundary.Offset > sourceIndex) {
            return { Container: parent, Offset: boundary.Offset - 1 };
        }
    }
    return boundary;
}

// ---------------------------------------------------------------------------
// mergeWithBlock
// ---------------------------------------------------------------------------

/**
 * Pull the contents of block `next` into block `block`, leaving the caret at the seam.
 *
 * This is what Backspace at the start of a block does, and what paste does when joining a
 * pasted first block onto the caret's block. The filler `<br>` at the end of `block` is
 * stripped first — it was there to hold an empty line open, and there is now real content
 * following it.
 *
 * The now-empty ancestor chain above `next` is detached too, so merging the only item out
 * of a list doesn't leave a stray empty `<ul>` behind.
 */
export function mergeWithBlock(block: Node, next: Node, range: Range, root: Node): void {
    detach(highestLoneAncestor(next, root));

    let offset = block.childNodes.length;
    const last = block.lastChild;
    if (last && last.nodeName === 'BR') {
        block.removeChild(last);
        offset -= 1;
    }

    // The source's filler goes too. A block whose only child is a `<br>` is an empty line
    // being merged away; carrying its filler across would append a spurious line break to
    // content that is no longer empty.
    const onlyChild = next.childNodes.length === 1 ? next.firstChild : null;
    if (onlyChild && onlyChild.nodeName === 'BR') {
        next.removeChild(onlyChild);
    }

    block.appendChild(empty(next));
    resetNodeCategoryCache();
    range.setStart(block, offset);
    range.collapse(true);
    mergeInlines(block, range);
}

/**
 * Climb from `node` while each parent has it as an only child — the topmost wrapper that
 * would be left empty once `node` is removed.
 */
function highestLoneAncestor(node: Node, root: Node): Node {
    let current = node;
    for (;;) {
        const parent = current.parentNode;
        if (!parent || parent === root || !isElement(parent) || parent.childNodes.length !== 1) {
            return current;
        }
        current = parent;
    }
}

// ---------------------------------------------------------------------------
// mergeContainers
// ---------------------------------------------------------------------------

/**
 * Fuse `node` into an alike preceding sibling — two adjacent `<ul>`s become one, two
 * adjacent `<blockquote>`s become one.
 *
 * Called at both seams after any block operation reinserts a transformed fragment; without
 * it, quoting two adjacent paragraphs would produce two separate blockquotes rather than
 * one containing both.
 */
export function mergeContainers(node: Node, root: Node, spec: DefaultBlockSpec = DEFAULT_BLOCK_SPEC): void {
    const previous = node.previousSibling;
    const first = node.firstChild;
    const isListItem = node.nodeName === 'LI';

    // A list item only merges when it begins with a nested list; otherwise merging would
    // join two unrelated items into one.
    if (isListItem && (!first || !/^[OU]L$/.test(first.nodeName))) {
        return;
    }

    if (previous && areAlike(previous, node)) {
        if (!isContainer(previous)) {
            if (!isListItem) {
                return;
            }
            // The previous item holds loose inline content; give it a block of its own so
            // the two items can be containers together.
            const block = createDefaultBlock(ownerDocumentOf(previous), spec);
            block.appendChild(empty(previous));
            previous.appendChild(block);
        }
        detach(node);
        // Read the category BEFORE the move — afterwards `node` is empty and would
        // classify differently.
        const needsContainerFix = !isContainer(node);
        previous.appendChild(empty(node));
        resetNodeCategoryCache();
        if (needsContainerFix) {
            fixContainer(previous, spec);
        }
        if (first) {
            mergeContainers(first, root, spec);
        }
        return;
    }

    if (isListItem) {
        // A list item starting with a nested list needs a block to hold the caret before it.
        const block = createDefaultBlock(ownerDocumentOf(node), spec);
        node.insertBefore(block, first);
        fixCursor(block);
    }
}
