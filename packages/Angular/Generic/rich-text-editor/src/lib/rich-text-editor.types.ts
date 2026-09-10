/**
 * Public contract for the rich text editor: configuration, toolbar commands, and event
 * payloads. Shared by the Angular-free engine and the Angular component layer, so this
 * module imports nothing from Angular either.
 *
 * Naming note: MemberJunction uses PascalCase for public API members (see
 * `.claude/rules/typescript-style.md`), so the config/event surface here is PascalCase
 * even though the engine's own internal helpers stay camelCase.
 */

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Which sanitizer profile to apply.
 *
 * - `'strict'` — comments stripped. The default for ordinary MJ forms.
 * - `'email'` — comments preserved on the trusted `SetHTML` path only, so that Outlook
 *   conditional blocks (`<!--[if mso]>`) inside a quoted reply chain survive a round trip.
 *
 * Untrusted **paste** always strips comments regardless of profile: DOMPurify comment
 * retention is a documented mXSS foot-gun (cure53/DOMPurify #528, #932).
 */
export type RichTextSanitizeProfile = 'email' | 'strict';

/**
 * How `cleanupBRs` treats `<br>` elements, selected per content source rather than
 * globally.
 *
 * - `'preserve'` — used on `SetHTML`. Trailing `<br>`s in loaded content are meaningful
 *   (they are frequently the blank lines of a quoted email) and are left alone.
 * - `'normalize'` — used on paste. Converts `<br>`-soup into real block structure.
 */
export type RichTextBrPolicy = 'preserve' | 'normalize';

/**
 * URI scheme allowances layered on top of DOMPurify's default `IS_ALLOWED_URI` check.
 *
 * `IS_ALLOWED_URI` is never disabled — it is the check that blocks `javascript:`. The
 * `'email'` profile widens `ALLOWED_URI_REGEXP` to additionally permit `cid:` (inline
 * image references in quoted mail) and nothing else.
 */
export type RichTextUriPolicy = 'default' | 'allow-cid';

// ---------------------------------------------------------------------------
// Toolbar commands
// ---------------------------------------------------------------------------

/**
 * Every command the v1 toolbar can surface. `ToolbarConfig` is an ordered subset of
 * these; omitting the input shows the default set.
 */
export type RichTextCommand =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'blockquote'
    | 'code'
    | 'orderedList'
    | 'bulletList'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'link'
    | 'removeFormat'
    | 'undo'
    | 'redo';

/**
 * A toolbar layout: an ordered list of commands, where the literal `'separator'`
 * renders a visual divider rather than a button.
 */
export type RichTextToolbarItem = RichTextCommand | 'separator';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * A single entry in the clean pipeline's rewriter table — "when you see this element,
 * replace it with that one". Injectable so consumers can extend the defaults
 * (`STRONG`→`B`, `EM`→`I`, `SPAN[font-weight:bold]`→`B`, legacy `FONT`→styled span)
 * without the table being hardcoded in the engine.
 */
export type RichTextRewriter = (element: Element) => Node | null;

/** Engine configuration. Every field is optional; the engine supplies the documented default. */
export interface RichTextEditorConfig {
    /**
     * Tag used for the default block and for every blank line. Defaults to `'DIV'`, which
     * makes a blank line `<div><br></div>` — identical to Gmail's composer, and one
     * line-height in every client including Outlook's Word engine. `<p>` carries
     * client-specific default margins, which is why it is not the default.
     */
    BlockTag?: string;

    /** Attributes stamped onto every default block the engine creates (e.g. `{ style: 'margin:0' }`). */
    BlockAttributes?: Readonly<Record<string, string>>;

    /** Per-tag attribute defaults applied when the engine creates that tag, keyed by uppercase tag name. */
    TagAttributes?: Readonly<Record<string, Readonly<Record<string, string>>>>;

    /** Maximum number of undo snapshots retained. Defaults to 50. */
    UndoLimit?: number;

    /** Skip snapshotting once the document exceeds this many characters of HTML. */
    UndoSizeThreshold?: number;

    /** Convert bare URLs to links as the user types past them. Defaults to `true`. */
    AddLinks?: boolean;

    /** Sanitizer profile. Defaults to `'strict'`. */
    SanitizeProfile?: RichTextSanitizeProfile;

    /** URI scheme policy. Defaults to `'default'`; the `'email'` profile implies `'allow-cid'`. */
    UriPolicy?: RichTextUriPolicy;

    /** `<br>` handling on the paste path. `SetHTML` always uses `'preserve'`. Defaults to `'normalize'`. */
    BrPolicy?: RichTextBrPolicy;

    /**
     * Replace the built-in sanitize step wholesale. Receives the raw HTML, must return a
     * fragment. Use for hosts with their own audited sanitizer.
     */
    SanitizeToDOMFragment?: (html: string) => DocumentFragment;

    /** Additional/overriding rewriter entries for the clean pipeline, keyed by uppercase tag name. */
    Rewriters?: Readonly<Record<string, RichTextRewriter>>;

    /** Tags the clean pipeline should unwrap to their children, in addition to the defaults. */
    Blacklist?: readonly string[];

    /**
     * Rewrite the HTML about to be placed on the clipboard by cut or copy. Receives the
     * serialized selection (with its inline/block context) and returns what to write.
     */
    WillCutCopy?: (html: string) => string;

    /**
     * Sink for exceptions thrown inside engine event handlers. Handler errors are caught
     * and routed here rather than escaping into the host's event loop; defaults to
     * `console.error`.
     */
    DidError?: (error: unknown) => void;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/**
 * Emitted whenever the selection moves to a structurally different position.
 *
 * `Path` is a CSS-path string of the selection anchor (`'DIV>BLOCKQUOTE>B'`). Toolbars
 * string-match against it to derive pressed state, which is O(path length) rather than
 * a tree walk per button per selection change.
 */
export interface RichTextPathChangeEvent {
    Path: string;
}

/** Emitted after any operation that changes what `Undo`/`Redo` would do. */
export interface RichTextUndoStateChangeEvent {
    CanUndo: boolean;
    CanRedo: boolean;
}

/**
 * Emitted after sanitization but before the fragment is merged into the document.
 * Cancelable: setting `Cancel` to `true` aborts the paste. Mutating `Fragment` in place
 * is supported and is the intended extension point.
 */
export interface RichTextWillPasteEvent {
    Fragment: DocumentFragment;
    Cancel: boolean;
}

/**
 * Emitted when the clipboard carries an image. The engine does not insert it — image
 * handling is a host decision (upload, reject, inline as data URI).
 */
export interface RichTextPasteImageEvent {
    File: File;
}

// ---------------------------------------------------------------------------
// Component event args (Before*/After* contract — see guides/UI_LAYERING_GUIDE.md)
// ---------------------------------------------------------------------------

/**
 * Base for the component's cancelable events. A listener sets `Cancel = true` to halt the
 * action; the matching `After*` event then does not fire.
 */
export class RichTextCancelableEventArgs {
    public Cancel = false;
    public CancelReason?: string;
}

/**
 * Fired by `<mj-rich-text-editor>` BEFORE pasted content is inserted, after sanitization.
 * `Fragment` may be mutated in place; set `Cancel` to drop the paste.
 */
export class BeforePasteEventArgs extends RichTextCancelableEventArgs {
    constructor(public readonly Fragment: DocumentFragment) {
        super();
    }
}

/** Fired AFTER a paste was inserted. NOT fired when the Before event was canceled. */
export class AfterPasteEventArgs {
    constructor(public readonly Html: string) {}
}

/**
 * Emitted by the Angular component when the content changes.
 *
 * `IsUserChange` distinguishes a user edit from a programmatic `writeValue`, which is how
 * the ControlValueAccessor avoids echoing its own value back to the form.
 */
export interface RichTextContentChangeEvent {
    Html: string;
    IsUserChange: boolean;
}
