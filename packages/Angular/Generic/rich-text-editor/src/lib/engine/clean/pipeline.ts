import { DefaultBlockSpec, DEFAULT_BLOCK_SPEC, fixContainer } from '../node/block';
import { resetNodeCategoryCache } from '../node/category';
import { RichTextEditorConfig } from '../../rich-text-editor.types';
import { cleanupBRs } from './brs';
import { cleanTree } from './clean-tree';
import { stripMsoArtifacts } from './mso';
import { CleanSource, sanitizeToFragment } from './sanitize';

/**
 * The clean pipeline: the only place in the engine where content is normalized in bulk.
 *
 * There are exactly two entry points, and they are deliberately asymmetric.
 *
 * ## Load does almost nothing
 *
 * `cleanForLoad` sanitizes, then enforces the single container invariant, and stops. It does
 * not rewrite tags, prune whitespace, remove empty inlines, or touch `<br>`s. Every one of
 * those would be a change to content the user never edited, and `SetHTML(GetHTML(x))` would
 * stop being a fixed point.
 *
 * ## Paste does everything
 *
 * `cleanForPaste` runs the full stack, because clipboard content is foreign markup being
 * imported into someone else's document and should adopt the document's conventions.
 *
 * That asymmetry *is* the architecture. If a future change makes the load path do more
 * work, the fidelity guarantee is gone — regardless of what bug the change fixes.
 */

/** Shared inputs for both entry points. */
export interface CleanOptions {
    Config: RichTextEditorConfig;
    BlockSpec?: DefaultBlockSpec;
}

/**
 * Prepare trusted content for `SetHTML`.
 *
 * The only structural change is `fixContainer`, which wraps loose inline children so the
 * root holds blocks. Without it the editor has nowhere to put a caret at top level; with
 * it, everything else survives untouched.
 */
export function cleanForLoad(html: string | null | undefined, options: CleanOptions): DocumentFragment {
    const fragment = sanitize(html, 'load', options);
    resetNodeCategoryCache();
    fixContainer(fragment, options.BlockSpec ?? DEFAULT_BLOCK_SPEC);
    return fragment;
}

/**
 * Prepare untrusted clipboard content for insertion.
 *
 * Comments are always stripped here regardless of profile — DOMPurify comment retention is
 * a documented mXSS vector, and the clipboard is exactly the untrusted channel that makes
 * it exploitable.
 */
export function cleanForPaste(html: string | null | undefined, options: CleanOptions): DocumentFragment {
    const spec = options.BlockSpec ?? DEFAULT_BLOCK_SPEC;
    const fragment = sanitize(html, 'paste', options);

    stripMsoArtifacts(fragment);
    cleanTree(fragment, {
        Blacklist: options.Config.Blacklist,
        Rewriters: options.Config.Rewriters,
        DropStyleElements: true,
    });
    cleanupBRs(fragment, options.Config.BrPolicy ?? 'normalize');
    resetNodeCategoryCache();
    fixContainer(fragment, spec);
    return fragment;
}

/** Run the sanitize stage with the config's profile and override, if any. */
function sanitize(
    html: string | null | undefined,
    source: CleanSource,
    options: CleanOptions,
): DocumentFragment {
    return sanitizeToFragment(html, {
        Profile: options.Config.SanitizeProfile ?? 'strict',
        Source: source,
        Override: options.Config.SanitizeToDOMFragment ?? null,
    });
}
