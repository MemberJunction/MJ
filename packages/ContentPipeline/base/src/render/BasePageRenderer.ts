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

import { AccessArtifact } from '../access/BaseAccessDriver.js';
import { ResolveRegistered } from '../ResolveRegistered.js';

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

/** When a source's pages go through its renderer (`Configuration.PageRenderMode`); see `PageRenderPolicy.ts`. */
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

/** Elements whose content is never visible text. */
const INVISIBLE_ELEMENTS = new Set(['script', 'style', 'noscript', 'template', 'svg']);

/**
 * Whether an HTML page is a shell its scripts fill in: under `minChars` characters of visible text once scripts,
 * styles, `<noscript>`, `<template>`, `<svg>`, comments and tags are removed. A cheap structural scan, not a parse,
 * and linear in the page's length whatever it holds (an unclosed comment or element swallows the rest of the page,
 * as a browser would, rather than being searched for again); it stops as soon as there is enough text.
 */
export function LooksLikeEmptyPage(html: string, minChars: number = DEFAULT_EMPTY_PAGE_TEXT_CHARS): boolean {
    // Lower-cased once so tag names match without regard to case; the text's length is all that is counted.
    const lower = html.toLowerCase();
    const body = lower.search(/<body\b/);
    let i = body < 0 ? 0 : lower.indexOf('>', body) + 1 || lower.length;
    const text: string[] = [];
    let visible = 0;
    while (i < lower.length) {
        const tag = lower.indexOf('<', i);
        const segment = lower.slice(i, tag < 0 ? lower.length : tag);
        text.push(segment);
        visible += segment.replace(/\s+|&nbsp;|&#160;/gi, '').length;
        if (visible >= minChars || tag < 0) {
            break;
        }
        text.push(' ');
        if (lower.startsWith('<!--', tag)) {
            const end = lower.indexOf('-->', tag + 4);
            i = end < 0 ? lower.length : end + 3;
            continue;
        }
        const close = lower.indexOf('>', tag);
        const name = /^<([a-z][a-z0-9-]*)/.exec(lower.slice(tag, tag + 32))?.[1];
        if (close < 0) {
            break;
        }
        i = close + 1;
        // A self-closing tag (`<svg ... />`) has no content to skip.
        if (name && INVISIBLE_ELEMENTS.has(name) && lower.charAt(close - 1) !== '/') {
            const end = lower.indexOf(`</${name}`, i);
            const endClose = end < 0 ? -1 : lower.indexOf('>', end);
            i = endClose < 0 ? lower.length : endClose + 1;
        }
    }
    return text.join('').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim().length < minChars;
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
        return ResolveRegistered<BasePageRenderer>(BasePageRenderer, key);
    }
}
