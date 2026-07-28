/**
 * Engine-wide constants: the tag classification tables and the sentinel characters
 * the editor relies on for caret placement.
 *
 * This module is the bottom of the dependency graph — it imports nothing, including
 * nothing from Angular. Everything else in `engine/` may depend on it.
 */

// ---------------------------------------------------------------------------
// Sentinel characters
// ---------------------------------------------------------------------------

/**
 * Zero-width space (U+200B).
 *
 * Used as caret ballast in two places: inside an otherwise-empty inline element
 * (WebKit refuses to place a caret in an empty text node), and inside the pending-format
 * wrapper produced by a collapsed `changeFormat` call so that the next typed character
 * lands already formatted.
 *
 * Every ZWS the engine inserts is transient. `getHTML()` strips all of them, so a ZWS
 * must never be load-bearing for anything a consumer can observe.
 */
export const ZERO_WIDTH_SPACE = '\u200B';

/**
 * Non-breaking space (U+00A0).
 *
 * A leading or trailing plain space does not render in HTML, so delete operations that
 * would leave one adjacent to the caret substitute this instead.
 */
export const NON_BREAKING_SPACE = '\u00A0';

/** Matches one or more consecutive zero-width spaces. Global — callers rely on `replace` sweeping. */
export const ZERO_WIDTH_SPACE_PATTERN = /\u200B+/g;

// ---------------------------------------------------------------------------
// Node categories
// ---------------------------------------------------------------------------

/**
 * How the engine classifies a node structurally.
 *
 * Note that this is **computed from content, not from the tag name** (see `node/category`).
 * A `<blockquote>` holding only inline content is a `'block'`; the same `<blockquote>`
 * holding a `<div>` is a `'container'`. This is the single most important idea in the
 * node model — block-level operations act on `'block'` nodes and never recurse into a
 * `'container'` blindly.
 */
export type NodeCategory = 'inline' | 'block' | 'container';

// ---------------------------------------------------------------------------
// Tag classification
// ---------------------------------------------------------------------------

/**
 * Elements that are inline **by tag**, checked only after the content-based rules in
 * `node/category` have failed to classify a node. Uppercase, matching `Node.nodeName`.
 */
export const INLINE_TAGS: ReadonlySet<string> = new Set([
    'A',
    'ABBR',
    'ACRONYM',
    'B',
    'BR',
    'BUTTON',
    'CITE',
    'CODE',
    'DEL',
    'DFN',
    'EM',
    'FONT',
    'I',
    'IMG',
    'INPUT',
    'INS',
    'KBD',
    'LABEL',
    'MAP',
    'Q',
    'S',
    'SAMP',
    'SELECT',
    'SMALL',
    'SPAN',
    'STRIKE',
    'STRONG',
    'SUB',
    'SUP',
    'TEXTAREA',
    'TT',
    'U',
    'VAR',
    'WBR',
]);

/**
 * Elements that take no children. Splitting, wrapping, and merging all bail on these —
 * a leaf is moved wholesale or not at all.
 */
export const LEAF_TAGS: ReadonlySet<string> = new Set(['BR', 'HR', 'IMG', 'INPUT', 'IFRAME']);

/**
 * Elements whose children must NOT be wrapped in a default block by `fixContainer`.
 *
 * Two distinct reasons are folded into one set. For table plumbing (`TABLE`, `TR`, and the
 * row groups) and list plumbing (`OL`, `UL`), inserting a `<div>` child produces invalid
 * HTML that browsers will re-parent unpredictably. For `P` and `PRE`, loose inline content
 * is already valid and wrapping it would restructure content the user never touched —
 * a direct violation of the fidelity contract.
 */
export const FIX_CONTAINER_SKIP_TAGS: ReadonlySet<string> = new Set([
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'OL',
    'UL',
    'P',
    'PRE',
]);

/**
 * Elements that establish their own block-formatting semantics and therefore always
 * classify as `'block'` or `'container'` regardless of the inline-tag table.
 */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'CAPTION',
    'COLGROUP',
    'DD',
    'DIV',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TBODY',
    'TD',
    'TFOOT',
    'TH',
    'THEAD',
    'TR',
    'UL',
]);

/** The three heading levels the v1 toolbar exposes via `setBlockType`. */
export const HEADING_TAGS: ReadonlySet<string> = new Set(['H1', 'H2', 'H3']);

// ---------------------------------------------------------------------------
// Enter-key behavior
// ---------------------------------------------------------------------------

/**
 * What tag the *second half* of a block should take when Enter splits it.
 *
 * A `null` value means "use the configured `blockTag`" — that is how Enter at the end of
 * a heading yields an ordinary paragraph instead of a second heading. Tags absent from
 * this map also fall back to the configured `blockTag`; the explicit `null` entries exist
 * to document the intent rather than to change the lookup result.
 */
export const TAG_AFTER_SPLIT: Readonly<Record<string, string | null>> = {
    DD: 'DT',
    DT: 'DD',
    H1: null,
    H2: null,
    H3: null,
    H4: null,
    H5: null,
    H6: null,
    LI: 'LI',
    PRE: 'PRE',
};

/** Fallback block tag when no configuration is supplied. See `RichTextEditorConfig.BlockTag`. */
export const DEFAULT_BLOCK_TAG = 'DIV';

// ---------------------------------------------------------------------------
// TreeIterator node-type bitmask
// ---------------------------------------------------------------------------

/**
 * `NodeFilter.SHOW_*` equivalents, redeclared so the engine can be reasoned about (and
 * unit-tested) without depending on the global `NodeFilter` object being present.
 */
export const SHOW_ELEMENT = 1;
/** @see SHOW_ELEMENT */
export const SHOW_TEXT = 4;
/** @see SHOW_ELEMENT */
export const SHOW_COMMENT = 128;
/** Convenience mask for the traversal most cleanup passes want. */
export const SHOW_ELEMENT_OR_TEXT = SHOW_ELEMENT | SHOW_TEXT;
