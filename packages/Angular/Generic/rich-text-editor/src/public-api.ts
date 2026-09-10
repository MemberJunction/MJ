/*
 * Public API Surface of @memberjunction/ng-rich-text-editor
 */

// Configuration, toolbar command vocabulary, and event payloads
export * from './lib/rich-text-editor.types';

// The Angular component, its toolbar, and the link editor
export { RichTextEditorComponent } from './lib/rich-text-editor.component';
export { RichTextToolbarComponent } from './lib/toolbar/rich-text-toolbar.component';
export type { RichTextToolbarRow } from './lib/toolbar/rich-text-toolbar.component';
export { RichTextLinkEditorComponent } from './lib/toolbar/rich-text-link-editor.component';
export {
    DEFAULT_TOOLBAR_ITEMS,
    RICH_TEXT_COMMAND_DESCRIPTORS,
    describeCommand,
    normalizeHref,
} from './lib/toolbar/toolbar-config';
export type { RichTextCommandDescriptor } from './lib/toolbar/toolbar-config';

// Document boundary — load and serialize
export { setHTML, getHTML } from './lib/engine/html';

// Clean pipeline entry points and the sanitize profiles behind them
export { cleanForLoad, cleanForPaste } from './lib/engine/clean/pipeline';
export type { CleanOptions } from './lib/engine/clean/pipeline';
export type { CleanSource, SanitizeOptions } from './lib/engine/clean/sanitize';

// Block model, exposed because BlockTag/BlockAttributes callers need the shape
export { DEFAULT_BLOCK_SPEC } from './lib/engine/node/block';
export type { DefaultBlockSpec } from './lib/engine/node/block';

// Fidelity test harness. Exported so downstream packages can assert the same contract
// against their own content; it has no runtime cost for consumers that don't import it.
export { diffHtml, isSemanticallyEqual, formatDifferences } from './lib/engine/testing/semantic-diff';
export type {
    SemanticDiffOptions,
    SemanticDiffResult,
    SemanticDifference,
} from './lib/engine/testing/semantic-diff';

// The engine — one instance per contenteditable root
export { RichTextEngine } from './lib/engine/editor';
export type {
    RichTextEngineEventMap,
    RichTextEngineEventName,
    RichTextEngineEventHandler,
} from './lib/engine/events';

// Inline formats, for hosts that want to query or apply something beyond the toolbar set
export type { InlineFormat } from './lib/engine/format/inline';
export { INLINE_FORMAT_ALIASES } from './lib/engine/format/inline';

// Block transforms, for hosts composing their own block commands via ModifyBlocks
export type { BlockTransform, TagAttributeTable, ListTag, ListSelection } from './lib/engine/format/block';
export {
    increaseQuoteLevel,
    decreaseQuoteLevel,
    makeList,
    removeList,
    increaseListLevel,
    decreaseListLevel,
    getListSelection,
    setBlockType,
} from './lib/engine/format/block';

// Clipboard plumbing, for hosts driving paste/drop themselves or supplying fakes in tests
export type { ClipboardHost, ClipboardDataLike, ClipboardEventLike } from './lib/engine/clipboard/clipboard';
export { fragmentToPlainText, plainTextToHtml } from './lib/engine/clipboard/plain-text';
export { insertTreeFragmentIntoRange } from './lib/engine/range/insert-fragment';
export { findLinks, findTrailingLink } from './lib/engine/format/links';
export type { LinkMatch } from './lib/engine/format/links';

// Undo snapshot shape, for hosts persisting or inspecting history
export type { UndoSnapshot, UndoStackOptions } from './lib/engine/undo';
export type { SerializedSelection } from './lib/engine/path';

// The remaining engine internals (node/, most of range/, keyboard/, clean/ stages) stay
// unexported: they are implementation detail, and per MJ convention this file never
// re-exports another package's symbols.
