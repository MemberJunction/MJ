/*
 * Public API Surface of @memberjunction/ng-rich-text-editor
 */

// Configuration, toolbar command vocabulary, and event payloads
export * from './lib/rich-text-editor.types';

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

// The remaining engine internals (node/, range/, keyboard/) stay unexported: they are
// implementation detail, and per MJ convention this file never re-exports another
// package's symbols. The Angular component layer lands in P4.
