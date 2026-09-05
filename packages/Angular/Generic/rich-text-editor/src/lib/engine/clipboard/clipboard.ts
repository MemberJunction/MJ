import { EditingHost } from '../keyboard/host';
import { afterNativeDelete } from '../keyboard/delete-common';
import { getHTML } from '../html';
import { createElement, isTextNode, ownerDocumentOf } from '../node/utils';
import { getEndBlockOfRange, getStartBlockOfRange } from '../range/block-range';
import { deleteContentsOfRange } from '../range/contents';
import { fragmentToPlainText } from './plain-text';

/**
 * Cut, copy, paste, drop.
 *
 * Copy and cut write **both** `text/html` and `text/plain`, and the HTML carries the inline
 * and block context around the selection (the `<b>` a selected word sat in, the
 * `<blockquote>` a selected paragraph sat in), so pasting elsewhere reproduces what the user
 * saw rather than bare text. Paste reads HTML when present and plain text otherwise, and
 * hands images to the host — the engine never decides what an image becomes.
 *
 * Everything pasted goes through the host's `InsertHTML`/`InsertPlainText`, which run the
 * clean pipeline. Native paste is never allowed to write into the document.
 */

/** What the clipboard handlers need beyond ordinary editing. */
export interface ClipboardHost extends EditingHost {
    /** Optional rewrite of the HTML about to be placed on the clipboard. */
    readonly WillCutCopy: ((html: string) => string) | null;
    InsertHTML(html: string, isPaste: boolean, range?: Range): void;
    InsertPlainText(text: string, isPaste: boolean, range?: Range): void;
    NotifyPasteImage(file: File): void;
}

/**
 * The slice of `DataTransfer` the handlers use. Typed separately so tests can supply a
 * fake in environments (jsdom) that do not implement `DataTransfer`.
 */
export interface ClipboardDataLike {
    readonly types: readonly string[];
    readonly files?: ArrayLike<File>;
    getData(format: string): string;
    setData(format: string, data: string): void;
}

/** A clipboard or drag event, as the handlers see it. */
export interface ClipboardEventLike extends Event {
    readonly clipboardData?: ClipboardDataLike | null;
    readonly dataTransfer?: ClipboardDataLike | null;
}

/** Copy: write the selection with context. Consumes the event when it wrote something. */
export function handleCopy(host: ClipboardHost, event: ClipboardEventLike): boolean {
    const data = event.clipboardData;
    const range = host.GetSelection();
    if (!data || range.collapsed) {
        return false;
    }
    const contents = wrapWithContext(range.cloneContents(), range.commonAncestorContainer, copyRootFor(range, host.Root));
    writeClipboard(data, contents, host);
    event.preventDefault();
    return true;
}

/**
 * Cut: write the selection with context, then delete it through the engine so the
 * document keeps its invariants. A collapsed selection cuts nothing and is consumed.
 */
export function handleCut(host: ClipboardHost, event: ClipboardEventLike): boolean {
    const data = event.clipboardData;
    const range = host.GetSelection();
    if (range.collapsed) {
        event.preventDefault();
        return true;
    }
    if (!data) {
        // Nothing to write to; the browser cuts natively and the repair pass tidies after it.
        host.SaveUndoState(range);
        host.ScheduleAfterNativeDelete();
        return false;
    }
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);

    // The ancestors are captured before deletion: extraction splits them, and the clones
    // taken afterwards would describe the post-cut tree.
    const copyRoot = copyRootFor(range, host.Root);
    const context = ancestorsBetween(range.commonAncestorContainer, copyRoot);
    const removed = deleteContentsOfRange(range, host.Root, host.BlockSpec);
    writeClipboard(data, wrapWithClones(removed, context), host);

    afterNativeDelete(host, range);
    host.DocumentChanged();
    event.preventDefault();
    return true;
}

/**
 * Paste. HTML wins over plain text unless `asPlainText` is set; an image with no HTML beside
 * it goes to the host. Always consumed when clipboard data is readable.
 */
export function handlePaste(host: ClipboardHost, event: ClipboardEventLike, asPlainText: boolean): boolean {
    const data = event.clipboardData;
    if (!data) {
        return false;
    }
    event.preventDefault();

    const html = safeGetData(data, 'text/html');
    const text = safeGetData(data, 'text/plain');
    const image = firstImageFile(data);

    if (image && !html) {
        host.NotifyPasteImage(image);
        return true;
    }
    if (html && !asPlainText) {
        host.InsertHTML(html, true);
    } else if (text) {
        host.InsertPlainText(text, true);
    } else if (image) {
        host.NotifyPasteImage(image);
    }
    return true;
}

/**
 * Drop of external text or HTML, inserted at the drop point when the browser can tell us
 * where that is, else at the selection. Drags that started inside the editor are left to
 * the browser — it moves the content itself, and intercepting would duplicate it.
 */
export function handleDrop(host: ClipboardHost, event: ClipboardEventLike & { clientX?: number; clientY?: number }, isInternal: boolean): boolean {
    const data = event.dataTransfer;
    if (!data || isInternal) {
        return false;
    }
    const html = safeGetData(data, 'text/html');
    const text = safeGetData(data, 'text/plain');
    const image = firstImageFile(data);
    if (!html && !text && !image) {
        return false;
    }
    event.preventDefault();
    if (image && !html && !text) {
        host.NotifyPasteImage(image);
        return true;
    }
    const range = caretRangeAt(host, event.clientX, event.clientY) ?? host.GetSelection();
    if (html) {
        host.InsertHTML(html, true, range);
    } else {
        host.InsertPlainText(text, true, range);
    }
    return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * How far up to reproduce context: within one block, the block itself; across blocks, the
 * root — so a selection spanning two quoted paragraphs copies as a quote of two paragraphs.
 */
function copyRootFor(range: Range, root: Node): Node {
    const start = getStartBlockOfRange(range, root);
    const end = getEndBlockOfRange(range, root);
    return start && start === end ? start : root;
}

/** Elements strictly above `node` up to (excluding) `stop`, innermost first. */
function ancestorsBetween(node: Node, stop: Node): Element[] {
    const ancestors: Element[] = [];
    let current: Node | null = isTextNode(node) ? node.parentNode : node;
    while (current && current !== stop && current.nodeType === Node.ELEMENT_NODE) {
        ancestors.push(current as Element);
        current = current.parentNode;
    }
    return ancestors;
}

function wrapWithContext(contents: DocumentFragment, from: Node, stop: Node): Node {
    return wrapWithClones(contents, ancestorsBetween(from, stop));
}

/** Nest `contents` inside shallow clones of `ancestors` (innermost first). */
function wrapWithClones(contents: Node, ancestors: readonly Element[]): Node {
    let wrapped: Node = contents;
    for (const ancestor of ancestors) {
        const clone = ancestor.cloneNode(false) as Element;
        clone.appendChild(wrapped);
        wrapped = clone;
    }
    return wrapped;
}

/** Place HTML and plain text on the clipboard. */
function writeClipboard(data: ClipboardDataLike, contents: Node, host: ClipboardHost): void {
    const holder = createElement(ownerDocumentOf(host.Root), 'DIV', null, [contents]);
    let html = getHTML(holder);
    if (host.WillCutCopy) {
        html = host.WillCutCopy(html);
    }
    data.setData('text/html', html);
    data.setData('text/plain', fragmentToPlainText(holder));
}

function safeGetData(data: ClipboardDataLike, format: string): string {
    try {
        return data.getData(format) ?? '';
    } catch {
        return '';
    }
}

function firstImageFile(data: ClipboardDataLike): File | null {
    const files = data.files;
    if (!files) {
        return null;
    }
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file && /^image\//.test(file.type)) {
            return file;
        }
    }
    return null;
}

/** The caret position under a point, where the browser exposes one. */
function caretRangeAt(host: ClipboardHost, x: number | undefined, y: number | undefined): Range | null {
    if (x === undefined || y === undefined) {
        return null;
    }
    const doc = ownerDocumentOf(host.Root) as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    if (typeof doc.caretPositionFromPoint === 'function') {
        const position = doc.caretPositionFromPoint(x, y);
        if (position) {
            range = doc.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
        }
    } else if (typeof doc.caretRangeFromPoint === 'function') {
        range = doc.caretRangeFromPoint(x, y);
    }
    if (range && (range.startContainer === host.Root || host.Root.contains(range.startContainer))) {
        return range;
    }
    return null;
}
