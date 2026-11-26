/**
 * @fileoverview {@link BasePageRenderPolicy} — when a source with a page renderer renders a page, and when it fetches
 * it plainly. One decision, shared by Extract and the website crawl.
 *
 * Selected per source with `Configuration.PageRenderMode` (resolved like every web setting, see
 * `ResolveWebFetchSettings`); unset is the default, `Always`:
 * - `Always` ({@link AlwaysRenderPolicy}): a HEAD asks what the address is; a document file
 *   ({@link IsDocumentContentType}: a PDF, a Word file) is fetched plainly and anything else is rendered.
 * - `WhenEmpty` ({@link WhenEmptyRenderPolicy}): the page is fetched plainly, and rendered only when that finds an
 *   empty, script-only page ({@link LooksLikeEmptyPage}, under `Tuning.EmptyPageTextChars` of text) or when the site
 *   refused the plain fetch ({@link RendersAfterRefusal}).
 *
 * @module @memberjunction/content-pipeline-base
 */

import { IsDocumentContentType } from '@memberjunction/network-utils';
import { DEFAULT_EMPTY_PAGE_TEXT_CHARS, IsHtmlContentType, LooksLikeEmptyPage, PageRenderMode, RendersAfterRefusal } from './BasePageRenderer.js';

/** What a plain fetch of a page answered, as a policy needs it. */
export interface PlainPageAnswer {
    /** The HTTP status; 0 when there was no answer. */
    Status: number;
    ContentType?: string;
    /** The page's text, decoded; empty for an error answer or a file that was not read. */
    Html: string;
}

/** What the policy may use besides the answer. */
export interface PageRenderPolicyContext {
    /** `Tuning.EmptyPageTextChars`: below this much visible text a page is an empty shell. */
    EmptyPageTextChars?: number;
}

/** When a renderer source's page is rendered. See the file header. */
export abstract class BasePageRenderPolicy {
    /**
     * Whether the address is first asked about with a HEAD ({@link RendersAfterProbe} then decides), rather than
     * fetched plainly ({@link RendersAfterPlainFetch} then decides).
     */
    public abstract readonly ProbesFirst: boolean;

    /** After a HEAD: whether to render the address (true) or fetch it plainly. `contentType` is undefined when HEAD did not answer. */
    public RendersAfterProbe(contentType: string | undefined): boolean {
        return !IsDocumentContentType(contentType);
    }

    /** After a plain fetch: whether to render the page instead of keeping what the fetch got. */
    public RendersAfterPlainFetch(_answer: PlainPageAnswer, _context: PageRenderPolicyContext): boolean {
        return false;
    }

    /** The policy for a source's `PageRenderMode`. */
    public static Resolve(mode: PageRenderMode): BasePageRenderPolicy {
        return mode === 'WhenEmpty' ? new WhenEmptyRenderPolicy() : new AlwaysRenderPolicy();
    }
}

/** `Always`: render every address a HEAD does not name a document file. The default. */
export class AlwaysRenderPolicy extends BasePageRenderPolicy {
    public readonly ProbesFirst = true;
}

/** `WhenEmpty`: fetch plainly; render only an empty, script-only page, or one the site refused to a plain fetch. */
export class WhenEmptyRenderPolicy extends BasePageRenderPolicy {
    public readonly ProbesFirst = false;

    public override RendersAfterPlainFetch(answer: PlainPageAnswer, context: PageRenderPolicyContext): boolean {
        if (RendersAfterRefusal(answer.Status)) {
            return true;
        }
        const ok = answer.Status >= 200 && answer.Status < 300;
        return ok && IsHtmlContentType(answer.ContentType) && LooksLikeEmptyPage(answer.Html, context.EmptyPageTextChars ?? DEFAULT_EMPTY_PAGE_TEXT_CHARS);
    }
}
