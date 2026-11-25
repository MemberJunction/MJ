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
    /** How the page is loaded and when it counts as settled (`Configuration.PageRendererOptions`). Unset: the renderer's defaults. */
    Options?: PageRenderOptions;
    Signal: AbortSignal;
}

/**
 * Per-source settings for loading a page in a browser, from `Configuration.PageRendererOptions`. Every one is
 * optional; unset keeps the renderer's default. A renderer ignores what it cannot do.
 */
export interface PageRenderOptions {
    /**
     * When navigation counts as done: `load`, `domcontentloaded`, `networkidle` or `commit` (Playwright's
     * names). Default `networkidle`. A site that polls forever never goes network-idle; use `load` with a
     * {@link WaitSelector} there.
     */
    WaitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    /** A CSS selector that must be visible before the page is read, for content that arrives after load. */
    WaitSelector?: string;
    /** How long to wait for {@link WaitSelector}, in ms. Default 10000. A selector that never appears fails the render. */
    WaitSelectorTimeoutMs?: number;
    /** Scroll to the bottom before reading, so content loaded on scroll (infinite lists, lazy sections) is there. Default false. */
    ScrollToBottom?: boolean;
    /** The `User-Agent` the browser presents. Unset: the browser's own. */
    UserAgent?: string;
}

/**
 * When a source's pages go through its renderer (`Configuration.PageRenderMode`):
 * - `Always` (the default): every page is rendered, except an address whose HEAD names a document file
 *   ({@link IsDocumentContentType}: a PDF, a Word file), which is fetched plainly.
 * - `WhenEmpty`: a page is fetched plainly first and rendered only when that finds an empty or script-only
 *   page ({@link LooksLikeEmptyPage}), or when the site refused the plain fetch ({@link RendersAfterRefusal}),
 *   so a mostly static site pays for a browser only where it needs one.
 */
export type PageRenderMode = 'Always' | 'WhenEmpty';

/** The render mode a configured value names; anything else is the default, `Always`. */
export function ResolvePageRenderMode(value: unknown): PageRenderMode {
    return typeof value === 'string' && value.trim().toLowerCase() === 'whenempty' ? 'WhenEmpty' : 'Always';
}

/**
 * Whether a `Content-Type` names an HTML page. No content type at all counts as HTML (a server that does not say
 * is answered as the page it most likely is); anything else (`application/pdf`, `image/png`) does not.
 */
export function IsHtmlContentType(contentType: string | null | undefined): boolean {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return type.length === 0 || type === 'text/html' || type === 'application/xhtml+xml';
}

/**
 * Whether a `Content-Type` names a document file a browser would download rather than render: PDF, Word, Excel,
 * PowerPoint, OpenDocument, RTF, EPUB, CSV, a zip, or an image, audio or video file. A renderer source fetches such
 * an address plainly. Anything else, `application/octet-stream` and `text/plain` included, is not known to be a
 * file (servers send those for pages too), so the page is rendered as before.
 */
export function IsDocumentContentType(contentType: string | null | undefined): boolean {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return (
        DOCUMENT_CONTENT_TYPES.has(type) ||
        DOCUMENT_CONTENT_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix))
    );
}

/** Exact document types {@link IsDocumentContentType} recognises. */
const DOCUMENT_CONTENT_TYPES: ReadonlySet<string> = new Set([
    'application/pdf',
    'application/msword',
    'application/rtf',
    'text/rtf',
    'application/epub+zip',
    'application/zip',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
]);

/** Document type families {@link IsDocumentContentType} recognises by prefix. */
const DOCUMENT_CONTENT_TYPE_PREFIXES: readonly string[] = [
    'application/vnd.openxmlformats-officedocument.',
    'application/vnd.oasis.opendocument.',
    'image/',
    'audio/',
    'video/',
];

/**
 * Whether a plain fetch's error status is worth a render in `WhenEmpty` mode: a site that refuses a plain client
 * (401, 403, 406, a 5xx from bot protection) often serves the page to a browser. Not a 404 or 410, which a browser
 * would get too (rendering every dead link would cost a browser each), nor a 429, which is the site asking the
 * caller to slow down.
 */
export function RendersAfterRefusal(status: number): boolean {
    return status >= 400 && status !== 404 && status !== 410 && status !== 429;
}

/** Below this much visible text a page counts as empty: a shell that a script fills in. */
export const DEFAULT_EMPTY_PAGE_TEXT_CHARS = 200; // a few words of real content; a script shell's noscript/nav text is shorter

/**
 * Whether an HTML page is a shell its scripts fill in: under `minChars` characters of visible text once scripts,
 * styles, `<noscript>`, `<template>`, comments and tags are removed. A cheap structural test, not a parse.
 */
export function LooksLikeEmptyPage(html: string, minChars: number = DEFAULT_EMPTY_PAGE_TEXT_CHARS): boolean {
    const body = /<body\b[^>]*>([\s\S]*)/i.exec(html)?.[1] ?? html;
    const text = body
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length < minChars;
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
