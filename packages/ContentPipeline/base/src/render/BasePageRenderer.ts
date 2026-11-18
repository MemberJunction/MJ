/**
 * @fileoverview Page renderers: registered ways of turning a web page's URL into its HTML.
 *
 * A plain HTTP GET returns what the server sends, which for a page built by script in the browser is an empty
 * shell. A source that names a renderer (`Configuration.PageRenderer`) has its pages loaded through it instead:
 * by the website crawler when it walks the site for links, and by Extract when it reads a page. The pipeline
 * ships a headless-browser renderer (`Headless`); a deployment can register its own (a hosted rendering
 * service) under another key.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { AccessArtifact } from '../access/BaseAccessDriver.js';

/** What a renderer is asked to load. */
export interface PageRenderRequest {
    URL: string;
    /**
     * The source's session, or null. A renderer sends its headers only to {@link AccessOrigins} (for the page and
     * everything it loads), never to a third-party script or image host, and adds its query parameters only to
     * the page's own URL when that is one of them.
     */
    Access?: AccessArtifact | null;
    /** The origins the session may be presented to (`https://host[:port]`). Empty: none. */
    AccessOrigins: readonly string[];
    /** The longest the page may take to load and settle, in ms. */
    TimeoutMs?: number;
    Signal: AbortSignal;
}

/** A rendered page. */
export interface PageRenderResult {
    /** The page's HTML after it loaded and settled. */
    Html: string;
    /** Where the page ended up after redirects. */
    FinalURL: string;
    /** The HTTP status of the page's own response; 0 when there was none. */
    Status: number;
}

/** Base class for page renderers, resolved by key from `Configuration.PageRenderer`. */
export abstract class BasePageRenderer {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /**
     * Load the page and return its HTML.
     *
     * @throws When the page cannot be loaded at all; a page that loads with an error status returns it in
     *   {@link PageRenderResult.Status} so the caller can treat a 404 as gone.
     */
    public abstract Render(request: PageRenderRequest): Promise<PageRenderResult>;

    /** Resolve a registered renderer by key, or null; never a hollow base instance. */
    public static Resolve(key: string): BasePageRenderer | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BasePageRenderer>(BasePageRenderer, key.trim());
        return result.Resolved ? result.Instance : null;
    }
}
