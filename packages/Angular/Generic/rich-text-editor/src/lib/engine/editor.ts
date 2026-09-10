import { RichTextCommand, RichTextEditorConfig } from '../rich-text-editor.types';
import { DEFAULT_BLOCK_TAG } from './constants';
import { RichTextEventEmitter, RichTextEngineEventHandler, RichTextEngineEventName } from './events';
import {
    BlockTransform,
    ListTag,
    TagAttributeTable,
    decreaseListLevel,
    decreaseQuoteLevel,
    getBlockTag,
    getListSelection,
    increaseListLevel,
    increaseQuoteLevel,
    makeList,
    modifyBlocks,
    removeList,
    setBlockType,
} from './format/block';
import {
    InlineFormat,
    addFormat,
    changeFormat,
    getNearestFormat,
    hasFormat,
    removeAllFormatting,
    removeFormat,
} from './format/inline';
import { ClipboardEventLike, ClipboardHost, handleCopy, handleCut, handleDrop, handlePaste } from './clipboard/clipboard';
import { plainTextToHtml } from './clipboard/plain-text';
import { cleanForPaste } from './clean/pipeline';
import { getHTML, setHTML } from './html';
import { afterNativeDelete } from './keyboard/delete-common';
import { KeyHandler, createKeyHandlers, dispatchBeforeInput, dispatchKeydown } from './keyboard/dispatch';
import { handleEnter, insertLineBreak } from './keyboard/enter';
import { EditingHost } from './keyboard/host';
import { detectMacPlatform, keyStringFor } from './keyboard/keys';
import { DefaultBlockSpec, createDefaultBlock, fixCursor } from './node/block';
import { resetNodeCategoryCache } from './node/category';
import { getNearest, isTextNode, ownerDocumentOf } from './node/utils';
import { deserializeSelection, serializeSelection } from './path';
import { getStartBlockOfRange } from './range/block-range';
import { moveRangeBoundariesDownTree } from './range/boundaries';
import { deleteContentsOfRange, insertNodeInRange } from './range/contents';
import { insertTreeFragmentIntoRange } from './range/insert-fragment';
import { applySelection, createRange, getPath, isRangeWithin, readSelectionWithin } from './selection';
import { UndoSnapshot, UndoStack } from './undo';
import { removeZeroWidthSpaces } from './zws';

/**
 * The editor engine: one instance per `contenteditable` root.
 *
 * Everything below this class is a pure function over the DOM. This is where state lives —
 * the configuration, the remembered selection, the undo stack, the listeners — and where
 * the public command surface is. The Angular component (P4) is a thin wrapper over it; a
 * non-Angular host could drive it directly.
 *
 * ## What the engine never does
 *
 * It never sweeps the document. Content is normalized at `SetHTML`, at paste (P3), and at
 * the local seams of the command being executed. There is no "on change" pass. If you find
 * yourself wanting one, the fix belongs in the command that left the seam dirty.
 */
/** Block-level elements a caret cannot follow at the end of the document. */
const TRAILING_LINE_BLOCKERS: ReadonlySet<string> = new Set(['BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'PRE', 'HR', 'FIGURE']);

export class RichTextEngine implements ClipboardHost {
    /** The `contenteditable` element the engine edits. */
    public readonly Root: HTMLElement;
    /** The configuration this engine was built with. */
    public readonly Config: RichTextEditorConfig;
    /** Tag and attributes of the default block, resolved from `Config`. */
    public readonly BlockSpec: DefaultBlockSpec;
    /** Per-tag attribute defaults from `Config.TagAttributes`. */
    public readonly TagAttributes: TagAttributeTable | undefined;
    /** Whether typing a space after a bare address turns it into a link. */
    public readonly AddLinks: boolean;
    /** Optional rewrite of HTML placed on the clipboard by cut and copy. */
    public readonly WillCutCopy: ((html: string) => string) | null;

    private readonly document: Document;
    private readonly events: RichTextEventEmitter;
    private readonly undo: UndoStack;
    private readonly keyHandlers: Readonly<Record<string, KeyHandler>>;
    private readonly primaryModifier: 'Meta-' | 'Ctrl-';
    private readonly didError: (error: unknown) => void;

    /** Where the caret was last seen inside the root — the fallback when focus is elsewhere. */
    private lastSelection: Range | null = null;
    private lastPath = '';
    private lastUndoState = { CanUndo: false, CanRedo: false };
    private nativeDeletePending = false;
    private afterDeleteTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;
    /** An IME composition is in progress; structural handling waits for it to end. */
    private composing = false;
    /** Ctrl/Cmd+Shift+V was pressed: the paste event that follows inserts plain text. */
    private plainTextPasteRequested = false;
    /** A drag started inside the editor; its drop is the browser's to handle. */
    private internalDrag = false;

    private readonly listeners: Array<{ Target: EventTarget; Type: string; Handler: EventListener }> = [];

    constructor(root: HTMLElement, config: RichTextEditorConfig = {}) {
        this.Root = root;
        this.Config = config;
        this.document = ownerDocumentOf(root);
        this.didError = config.DidError ?? ((error: unknown) => console.error(error));
        this.events = new RichTextEventEmitter(this.didError);
        this.BlockSpec = {
            Tag: (config.BlockTag ?? DEFAULT_BLOCK_TAG).toUpperCase(),
            Attributes: config.BlockAttributes ?? null,
        };
        this.TagAttributes = config.TagAttributes;
        this.AddLinks = config.AddLinks ?? true;
        this.WillCutCopy = config.WillCutCopy ?? null;
        this.undo = new UndoStack({
            Limit: config.UndoLimit ?? 50,
            SizeThreshold: config.UndoSizeThreshold ?? -1,
        });
        const isMac = detectMacPlatform();
        this.primaryModifier = isMac ? 'Meta-' : 'Ctrl-';
        this.keyHandlers = createKeyHandlers(isMac);

        root.setAttribute('contenteditable', 'true');
        this.attachListeners();
        if (!root.firstChild) {
            this.SetHTML('');
        }
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /** Subscribe to an engine event. Returns the engine for chaining. */
    public On<K extends RichTextEngineEventName>(name: K, handler: RichTextEngineEventHandler<K>): this {
        this.events.On(name, handler);
        return this;
    }

    /** Unsubscribe a handler registered with `On`. */
    public Off<K extends RichTextEngineEventName>(name: K, handler: RichTextEngineEventHandler<K>): this {
        this.events.Off(name, handler);
        return this;
    }

    // -----------------------------------------------------------------------
    // Content
    // -----------------------------------------------------------------------

    /**
     * Load content. Resets undo history — and records the loaded document as the first
     * entry, so that the very first keystrokes can be undone back to what was loaded.
     */
    public SetHTML(html: string | null | undefined): void {
        setHTML(this.Root, html, { Config: this.Config, BlockSpec: this.BlockSpec });
        this.undo.Clear();
        const start = createRange(this.Root, 0);
        moveRangeBoundariesDownTree(start);
        this.lastSelection = start;
        this.undo.Checkpoint(this.snapshot(start));
        this.emitUndoStateIfChanged();
        if (this.hasFocus()) {
            applySelection(start, this.Root);
        }
        this.updatePath(start);
    }

    /** Serialize content. Ballast is stripped; filler `<br>`s are kept on purpose. */
    public GetHTML(): string {
        return getHTML(this.Root);
    }

    // -----------------------------------------------------------------------
    // Selection & focus
    // -----------------------------------------------------------------------

    /**
     * The current selection, as a range the caller may mutate. Falls back to the last
     * position seen inside the editor, then to the start of the document.
     */
    public GetSelection(): Range {
        const live = readSelectionWithin(this.Root);
        if (live) {
            this.lastSelection = live.cloneRange();
            return live;
        }
        if (this.lastSelection && isRangeWithin(this.lastSelection, this.Root)) {
            return this.lastSelection.cloneRange();
        }
        const start = createRange(this.Root, 0);
        moveRangeBoundariesDownTree(start);
        return start;
    }

    /** Make `range` the selection and remember it. */
    public SetSelection(range: Range): void {
        if (!isRangeWithin(range, this.Root)) {
            return;
        }
        this.lastSelection = range.cloneRange();
        applySelection(range, this.Root);
        this.updatePath(range);
    }

    /** Focus the root and restore the last caret position seen inside it. */
    public Focus(): void {
        this.Root.focus();
        if (this.lastSelection && isRangeWithin(this.lastSelection, this.Root)) {
            applySelection(this.lastSelection, this.Root);
        }
    }

    /** Remove focus from the editing surface. */
    public Blur(): void {
        this.Root.blur();
    }

    /** Tag-name path from the root to the selection start — `'DIV>BLOCKQUOTE>B'`. */
    public GetPath(): string {
        return getPath(this.GetSelection().startContainer, this.Root);
    }

    // -----------------------------------------------------------------------
    // Undo
    // -----------------------------------------------------------------------

    /** Whether Undo has a state to return to. */
    public get CanUndo(): boolean {
        return this.undo.CanUndo;
    }

    /** Whether Redo has a state to move forward to. */
    public get CanRedo(): boolean {
        return this.undo.CanRedo;
    }

    /** Record the document before a mutation. Commands call this; hosts may too. */
    public SaveUndoState(range: Range = this.GetSelection()): void {
        this.undo.Checkpoint(this.snapshot(range));
        this.emitUndoStateIfChanged();
    }

    /** Restore the previous snapshot, recording the current document first if it has unsaved changes. */
    public Undo(): void {
        const snapshot = this.undo.Undo(this.snapshot(this.GetSelection()));
        if (snapshot) {
            this.restore(snapshot);
        }
        this.emitUndoStateIfChanged();
    }

    /** Reapply the snapshot that Undo stepped back from. */
    public Redo(): void {
        const snapshot = this.undo.Redo();
        if (snapshot) {
            this.restore(snapshot);
        }
        this.emitUndoStateIfChanged();
    }

    // -----------------------------------------------------------------------
    // Inline formatting
    // -----------------------------------------------------------------------

    /** Whether the whole selection carries the inline format (aliases included). */
    public HasFormat(format: InlineFormat, range: Range = this.GetSelection()): boolean {
        return hasFormat(this.Root, range, format);
    }

    /** Remove one format and/or add another over the selection. */
    public ChangeFormat(add: InlineFormat | null, remove: InlineFormat | null, range: Range = this.GetSelection()): void {
        this.runCommand(range, () => changeFormat(this.Root, range, add, remove));
    }

    /** Remove the format when the whole selection has it, otherwise apply it. */
    public ToggleFormat(format: InlineFormat, range: Range = this.GetSelection()): void {
        if (this.HasFormat(format, range)) {
            this.runCommand(range, () => removeFormat(this.Root, range, format));
        } else {
            this.runCommand(range, () => addFormat(this.Root, range, format));
        }
    }

    /**
     * Link the selection to `href`. With a collapsed selection the address itself is inserted
     * as the link text — there is nothing else to link.
     */
    public MakeLink(href: string, attributes: Readonly<Record<string, string>> = {}, range: Range = this.GetSelection()): void {
        const format: InlineFormat = { Tag: 'A', Attributes: { href, ...attributes } };
        this.runCommand(range, () => {
            const existing = getNearestFormat(range.startContainer, this.Root, { Tag: 'A' });
            if (range.collapsed && existing) {
                // Inside a link already: retarget it rather than nest a new one.
                existing.setAttribute('href', href);
                for (const [name, value] of Object.entries(attributes)) {
                    existing.setAttribute(name, value);
                }
                return;
            }
            if (range.collapsed) {
                const text = this.document.createTextNode(href);
                range.insertNode(text);
                range.selectNodeContents(text);
            }
            changeFormat(this.Root, range, format, { Tag: 'A' });
        });
    }

    /** The `href` of the link the selection starts in, or null when it is not in one. */
    public GetLinkHref(range: Range = this.GetSelection()): string | null {
        return getNearestFormat(range.startContainer, this.Root, { Tag: 'A' })?.getAttribute('href') ?? null;
    }

    /** Remove the link around or within the selection. */
    public RemoveLink(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => {
            const startLink = getNearestFormat(range.startContainer, this.Root, { Tag: 'A' });
            const endLink = getNearestFormat(range.endContainer, this.Root, { Tag: 'A' });
            if (startLink) {
                range.setStartBefore(startLink);
            }
            if (endLink) {
                range.setEndAfter(endLink);
            }
            if (range.collapsed) {
                return;
            }
            removeFormat(this.Root, range, { Tag: 'A' });
        });
    }

    /** Strip every inline element from the selection, leaving plain text in its blocks. */
    public RemoveAllFormatting(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => removeAllFormatting(this.Root, range));
    }

    // -----------------------------------------------------------------------
    // Block formatting
    // -----------------------------------------------------------------------

    /** Run a block transform over the selection's blocks. See `format/block`. */
    public ModifyBlocks(transform: BlockTransform, range: Range = this.GetSelection()): void {
        modifyBlocks(this.Root, range, transform, { BlockSpec: this.BlockSpec, TagAttributes: this.TagAttributes });
    }

    /** Wrap the selection's blocks in one more `<blockquote>`. */
    public IncreaseQuoteLevel(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(increaseQuoteLevel(this.TagAttributes), range));
    }

    /** Unwrap the outermost `<blockquote>` around the selection's blocks. */
    public DecreaseQuoteLevel(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(decreaseQuoteLevel(), range));
    }

    /** Turn the selection's blocks into a bulleted list, or retag an enclosing numbered one. */
    public MakeUnorderedList(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(makeList('UL', this.TagAttributes), this.coverListOfOtherType(range, 'UL')));
    }

    /** Turn the selection's blocks into a numbered list, or retag an enclosing bulleted one. */
    public MakeOrderedList(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(makeList('OL', this.TagAttributes), this.coverListOfOtherType(range, 'OL')));
    }

    /** Flatten the selected list items back into default blocks. */
    public RemoveList(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(removeList(), range));
    }

    /** Nest the selected list items one level deeper. */
    public IncreaseListLevel(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ChangeListLevel(range, 1));
    }

    /** Lift the selected list items one level. */
    public DecreaseListLevel(range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ChangeListLevel(range, -1));
    }

    /** In-place list nesting. See `format/block` for why this is not a block transform. */
    public ChangeListLevel(range: Range, delta: 1 | -1): boolean {
        return delta > 0
            ? increaseListLevel(this.Root, range, this.TagAttributes)
            : decreaseListLevel(this.Root, range, this.BlockSpec);
    }

    /** Retag the selection's blocks: `'H1'`…`'H3'`, or `null` for the default block. */
    public SetBlockType(tag: string | null, range: Range = this.GetSelection()): void {
        this.runCommand(range, () => this.ModifyBlocks(setBlockType(tag, this.TagAttributes), range));
    }

    /** Tag name of the block the selection starts in. */
    public GetBlockTag(range: Range = this.GetSelection()): string | null {
        return getBlockTag(this.Root, range);
    }

    /** True when the selection starts inside `tag` (`'BLOCKQUOTE'`, `'UL'`, `'OL'`, …). */
    public IsInside(tag: string, range: Range = this.GetSelection()): boolean {
        const block = getStartBlockOfRange(range, this.Root);
        return !!block && !!getNearest(block, this.Root, tag.toUpperCase());
    }

    // -----------------------------------------------------------------------
    // Structural insertions
    // -----------------------------------------------------------------------

    /** Programmatic Enter. */
    public SplitBlock(range: Range = this.GetSelection()): void {
        handleEnter(this, range, false);
    }

    /** Programmatic Shift+Enter. */
    public InsertLineBreak(range: Range = this.GetSelection()): void {
        this.RemoveZeroWidthSpaces();
        this.SaveUndoState(range);
        insertLineBreak(this, range);
    }

    /**
     * Insert HTML at the selection. The content is treated as untrusted and runs the full
     * paste pipeline regardless of where it came from; with `isPaste` the `willPaste` event
     * fires first and may cancel or amend the fragment.
     */
    public InsertHTML(html: string, isPaste = false, range: Range = this.GetSelection()): void {
        const fragment = cleanForPaste(html, { Config: this.Config, BlockSpec: this.BlockSpec });
        if (isPaste) {
            const event = { Fragment: fragment, Cancel: false };
            this.events.Emit('willPaste', event);
            if (event.Cancel) {
                return;
            }
        }
        this.runCommand(range, () => insertTreeFragmentIntoRange(range, fragment, this.Root, this.BlockSpec));
    }

    /**
     * Insert plain text at the selection. Lines become blocks; inside `<pre>` the text goes
     * in verbatim with its newlines.
     */
    public InsertPlainText(text: string, isPaste = false, range: Range = this.GetSelection()): void {
        const block = getStartBlockOfRange(range, this.Root);
        if (block && getNearest(block, this.Root, 'PRE')) {
            this.runCommand(range, () => {
                if (!range.collapsed) {
                    deleteContentsOfRange(range, this.Root, this.BlockSpec);
                }
                const node = this.document.createTextNode(text.replace(/\r\n?/g, '\n'));
                insertNodeInRange(range, node);
                range.setStart(node, node.length);
                range.collapse(true);
            });
            return;
        }
        this.InsertHTML(plainTextToHtml(text, this.BlockSpec, this.AddLinks), isPaste, range);
    }

    /** The clipboard carried an image; tell the host. */
    public NotifyPasteImage(file: File): void {
        this.events.Emit('pasteImage', { File: file });
    }

    /**
     * Insert an image at the selection. `src` may be a URL, a `cid:` reference, or a data URI;
     * it goes through the same sanitize boundary as any other insertion.
     */
    public InsertImage(src: string, alt = '', range: Range = this.GetSelection()): void {
        const img = this.document.createElement('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', alt);
        this.InsertHTML(img.outerHTML, false, range);
    }

    /**
     * Whether the document ends in something the caret cannot be placed after — a quote, a
     * list, a table, a preformatted block — so the user has no way to type below it.
     */
    public NeedsTrailingLine(): boolean {
        const last = this.Root.lastElementChild;
        return !!last && TRAILING_LINE_BLOCKERS.has(last.nodeName);
    }

    /**
     * Append an empty default block after the document and put the caret in it.
     *
     * This is the explicit, user-invoked replacement for the reference implementation's
     * automatic "ensure bottom line" pass, which the engine deliberately does not run (it
     * would append a blank line to a quoted thread on every edit anywhere above it). Here the
     * user asked for the line — by clicking below the content or through the host — so adding
     * it is an edit, not a normalization. Returns the new block.
     */
    public AppendTrailingLine(): Element {
        const block = createDefaultBlock(this.document, this.BlockSpec);
        this.RemoveZeroWidthSpaces();
        this.SaveUndoState();
        this.Root.appendChild(block);
        resetNodeCategoryCache();
        fixCursor(block);
        const range = createRange(block, 0);
        this.SetSelection(range);
        this.DocumentChanged();
        return block;
    }

    // -----------------------------------------------------------------------
    // Toolbar vocabulary
    // -----------------------------------------------------------------------

    /** Execute a toolbar command by name. `link` needs an address and is not routed here. */
    public ExecuteCommand(command: Exclude<RichTextCommand, 'link'>): void {
        switch (command) {
            case 'bold':
                return this.ToggleFormat({ Tag: 'B' });
            case 'italic':
                return this.ToggleFormat({ Tag: 'I' });
            case 'underline':
                return this.ToggleFormat({ Tag: 'U' });
            case 'strikethrough':
                return this.ToggleFormat({ Tag: 'S' });
            case 'code':
                return this.ToggleFormat({ Tag: 'CODE' });
            case 'blockquote':
                return this.IsInside('BLOCKQUOTE') ? this.DecreaseQuoteLevel() : this.IncreaseQuoteLevel();
            case 'orderedList':
                return this.IsInside('OL') ? this.RemoveList() : this.MakeOrderedList();
            case 'bulletList':
                return this.IsInside('UL') ? this.RemoveList() : this.MakeUnorderedList();
            case 'heading1':
                return this.toggleHeading('H1');
            case 'heading2':
                return this.toggleHeading('H2');
            case 'heading3':
                return this.toggleHeading('H3');
            case 'removeFormat':
                return this.RemoveAllFormatting();
            case 'undo':
                return this.Undo();
            case 'redo':
                return this.Redo();
        }
    }

    /** Whether a toolbar command should render as pressed for the current selection. */
    public IsCommandActive(command: RichTextCommand): boolean {
        switch (command) {
            case 'bold':
                return this.HasFormat({ Tag: 'B' });
            case 'italic':
                return this.HasFormat({ Tag: 'I' });
            case 'underline':
                return this.HasFormat({ Tag: 'U' });
            case 'strikethrough':
                return this.HasFormat({ Tag: 'S' });
            case 'code':
                return this.HasFormat({ Tag: 'CODE' });
            case 'link':
                return this.HasFormat({ Tag: 'A' });
            case 'blockquote':
                return this.IsInside('BLOCKQUOTE');
            case 'orderedList':
                return this.IsInside('OL');
            case 'bulletList':
                return this.IsInside('UL');
            case 'heading1':
                return this.GetBlockTag() === 'H1';
            case 'heading2':
                return this.GetBlockTag() === 'H2';
            case 'heading3':
                return this.GetBlockTag() === 'H3';
            default:
                return false;
        }
    }

    // -----------------------------------------------------------------------
    // EditingHost plumbing
    // -----------------------------------------------------------------------

    /** Sweep caret ballast the engine inserted earlier, sparing the node the caret is in. */
    public RemoveZeroWidthSpaces(): void {
        if (this.composing) {
            // The IME owns the text node under the caret until compositionend.
            return;
        }
        const range = readSelectionWithin(this.Root) ?? this.lastSelection;
        const keep = range && isTextNode(range.startContainer) ? range.startContainer : null;
        removeZeroWidthSpaces(this.Root, keep);
    }

    /**
     * A command finished mutating the document.
     *
     * The result is recorded as its own checkpoint. Without that, typing after a command would
     * coalesce into the command's undo step — "press Bold, type a word, Undo" would remove the
     * word *and* the bold in one go. Native typing (see {@link nativeInputChanged}) never
     * checkpoints; consecutive keystrokes stay one step.
     */
    public DocumentChanged(): void {
        resetNodeCategoryCache();
        this.undo.MarkChanged();
        this.undo.Checkpoint(this.snapshot(this.lastSelection ?? this.GetSelection()));
        this.emitUndoStateIfChanged();
        this.events.Emit('input', undefined);
    }

    /** The browser changed the document (typing, native deletion, IME). One step per run. */
    private nativeInputChanged(): void {
        resetNodeCategoryCache();
        this.undo.MarkChanged();
        this.emitUndoStateIfChanged();
        this.events.Emit('input', undefined);
    }

    /** Queue the structural repair that follows a deletion left to the browser. */
    public ScheduleAfterNativeDelete(): void {
        this.nativeDeletePending = true;
        if (this.afterDeleteTimer !== null) {
            clearTimeout(this.afterDeleteTimer);
        }
        this.afterDeleteTimer = setTimeout(() => {
            this.afterDeleteTimer = null;
            this.nativeDeletePending = false;
            if (this.destroyed) {
                return;
            }
            this.guard(() => afterNativeDelete(this));
        }, 0);
    }

    /** Detach every listener. The root is left as it is. */
    public Destroy(): void {
        this.destroyed = true;
        for (const { Target, Type, Handler } of this.listeners) {
            Target.removeEventListener(Type, Handler);
        }
        this.listeners.length = 0;
        if (this.afterDeleteTimer !== null) {
            clearTimeout(this.afterDeleteTimer);
            this.afterDeleteTimer = null;
        }
        this.events.RemoveAll();
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /** The standard command envelope: sweep ballast, checkpoint, mutate, reselect, notify. */
    private runCommand(range: Range, mutate: () => void): void {
        this.RemoveZeroWidthSpaces();
        this.SaveUndoState(range);
        mutate();
        this.SetSelection(range);
        this.DocumentChanged();
    }

    /**
     * Asking for a bulleted list from inside a numbered one means "make *this list*
     * bulleted", not "carve my item out into a list of its own". Widen the range to the
     * whole enclosing list when its type differs from the one requested.
     */
    private coverListOfOtherType(range: Range, type: ListTag): Range {
        const selection = getListSelection(range, this.Root);
        if (selection && selection.List.nodeName !== type) {
            range.selectNodeContents(selection.List);
        }
        return range;
    }

    private toggleHeading(tag: string): void {
        this.SetBlockType(this.GetBlockTag() === tag ? null : tag);
    }

    private snapshot(range: Range): UndoSnapshot {
        return { Html: this.Root.innerHTML, Selection: serializeSelection(range, this.Root) };
    }

    /** Restore a snapshot verbatim — this HTML came from our own DOM and is already clean. */
    private restore(snapshot: UndoSnapshot): void {
        this.Root.innerHTML = snapshot.Html;
        resetNodeCategoryCache();
        let range = snapshot.Selection ? deserializeSelection(snapshot.Selection, this.Root) : null;
        if (!range) {
            range = createRange(this.Root, 0);
            moveRangeBoundariesDownTree(range);
        }
        this.SetSelection(range);
        this.events.Emit('input', undefined);
    }

    private emitUndoStateIfChanged(): void {
        const state = { CanUndo: this.undo.CanUndo, CanRedo: this.undo.CanRedo };
        if (state.CanUndo === this.lastUndoState.CanUndo && state.CanRedo === this.lastUndoState.CanRedo) {
            return;
        }
        this.lastUndoState = state;
        this.events.Emit('undoStateChange', state);
    }

    private updatePath(range: Range): void {
        const path = getPath(range.startContainer, this.Root);
        this.events.Emit('select', undefined);
        if (path !== this.lastPath) {
            this.lastPath = path;
            this.events.Emit('pathChange', { Path: path });
        }
    }

    private hasFocus(): boolean {
        const active = this.document.activeElement;
        return !!active && (active === this.Root || this.Root.contains(active));
    }

    private attachListeners(): void {
        this.attachKeyboardListeners();
        this.attachClipboardListeners();
        this.attachFocusAndSelectionListeners();
    }

    private attachKeyboardListeners(): void {
        this.listen(this.Root, 'keydown', (keyboard) => {
            this.guard(() => {
                this.nativeDeletePending = false;
                // keyCode 229 is the legacy "IME is composing" signal some engines still send
                // without setting isComposing.
                if (this.composing || keyboard.keyCode === 229) {
                    return;
                }
                if (keyStringFor(keyboard) === `${this.primaryModifier}Shift-v`) {
                    // Paste-as-plain-text: let the paste event through, flagged.
                    this.plainTextPasteRequested = true;
                    return;
                }
                dispatchKeydown(this, keyboard, this.keyHandlers);
            });
        });
        this.listen(this.Root, 'beforeinput', (event) => {
            this.guard(() => {
                if (this.composing) {
                    return;
                }
                dispatchBeforeInput(this, event, this.nativeDeletePending);
            });
        });
        this.listen(this.Root, 'input', () => {
            // Native typing. The browser changed the document; the undo stack must know.
            this.guard(() => this.nativeInputChanged());
        });
        this.listen(this.Root, 'compositionstart', () => {
            // IME input arrives as a stream of replacements; one checkpoint before it starts
            // is the difference between "undo the word" and "undo one syllable".
            this.guard(() => {
                this.SaveUndoState();
                this.composing = true;
            });
        });
        this.listen(this.Root, 'compositionend', () => {
            this.composing = false;
        });
    }

    private attachClipboardListeners(): void {
        this.listen(this.Root, 'cut', (event) => this.guard(() => handleCut(this, event)));
        this.listen(this.Root, 'copy', (event) => this.guard(() => handleCopy(this, event)));
        this.listen(this.Root, 'paste', (event) => {
            this.guard(() => {
                const asPlainText = this.plainTextPasteRequested;
                this.plainTextPasteRequested = false;
                handlePaste(this, event, asPlainText);
            });
        });
        this.listen(this.Root, 'dragstart', () => {
            this.internalDrag = true;
        });
        this.listen(this.Root, 'dragend', () => {
            this.internalDrag = false;
        });
        this.listen(this.Root, 'drop', (event) => {
            this.guard(() => {
                const internal = this.internalDrag;
                this.internalDrag = false;
                if (!handleDrop(this, event, internal) && internal) {
                    // The browser moved content within the editor; tidy the seams it left.
                    this.ScheduleAfterNativeDelete();
                }
            });
        });
    }

    private attachFocusAndSelectionListeners(): void {
        this.listen(this.Root, 'focus', () => this.events.Emit('focus', undefined));
        this.listen(this.Root, 'blur', () => this.events.Emit('blur', undefined));
        this.listen(this.document, 'selectionchange', () => {
            this.guard(() => {
                const live = readSelectionWithin(this.Root);
                if (!live) {
                    return;
                }
                this.lastSelection = live.cloneRange();
                this.updatePath(live);
            });
        });
    }

    private listen<K extends keyof HTMLElementEventMap>(
        target: EventTarget,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
    ): void {
        const listener = handler as EventListener;
        target.addEventListener(type, listener);
        this.listeners.push({ Target: target, Type: type, Handler: listener });
    }

    private guard(action: () => void): void {
        try {
            action();
        } catch (error) {
            this.didError(error);
        }
    }
}
