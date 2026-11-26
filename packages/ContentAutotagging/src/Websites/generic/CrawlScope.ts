/**
 * @fileoverview What the website crawl treats as one page, and which pages it visits: URL normalization (tracking
 * parameters, www/apex and http/https as one site), include/exclude lists, and the crawl-trap guards (a path that
 * keeps producing new query strings, a calendar that never ends).
 *
 * @module @memberjunction/content-autotagging
 */

import { LogStatus } from '@memberjunction/core';

/**
 * The query parameters {@link CrawlScopeOptions.StripTrackingParams} removes: campaign tags and back-links that
 * make one page look like many. A name ending in `*` is a prefix.
 */
export const DEFAULT_STRIPPED_QUERY_PARAMS: readonly string[] = [
    'utm_*',
    'gclid',
    'fbclid',
    'msclkid',
    'mc_cid',
    'mc_eid',
    '_ga',
    '_gl',
    '_gac_*',
    'redirect',
    '_token',
];

/** How the crawl decides what one page is and which pages it visits. Every field is optional and off by default. */
export interface CrawlScopeOptions {
    /** Treat `www.` and the bare host, and `http` and `https`, as one site: one page, one scope. Default false. */
    MergeWwwAndScheme?: boolean;
    /** Remove {@link DEFAULT_STRIPPED_QUERY_PARAMS} (or {@link StripQueryParams}) from every URL. Default false. */
    StripTrackingParams?: boolean;
    /** The query parameters to remove (names; a trailing `*` is a prefix). Setting it turns stripping on. */
    StripQueryParams?: readonly string[];
    /** A page whose `<link rel="canonical">` names a page already found is a duplicate and is not reported. Default false. */
    DedupCanonical?: boolean;
    /** A page that redirects to a page already found is a duplicate and is not reported, and the target is not read again. Default false. */
    DedupRedirects?: boolean;
    /** More than this many distinct query strings on one path and the crawl stops following that path (links and sitemap pages alike). Unset: no limit. */
    LoopLimit?: number | null;
    /** Do not follow links whose path is a date (`/2026/05/01/`, `/01-05-2026/`): the classic endless calendar. Default false. */
    SkipCalendarPaths?: boolean;
    /**
     * Only pages matching one of these are visited and reported (the start page is always visited, for its links).
     * Each entry is a substring of the URL, or a regular expression when written `re:<pattern>` (a blank `re:` is
     * ignored). Unset: everything.
     */
    IncludePatterns?: readonly string[];
    /**
     * Pages matching one of these are neither visited nor reported (the start page is still visited for its links,
     * but not reported). Same syntax as {@link IncludePatterns}.
     */
    ExcludePatterns?: readonly string[];
}

/** Date-shaped path segments: `/2026/05/01/`, `/01/05/2026/`, `-2026-05-01-`, `/01-05-2026/`. */
const CALENDAR_PATH = /[/-](\d{4}\/\d{2}\/\d{2}|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})(?:[/-]|$)/;

/** The prefix that marks an include/exclude entry as a regular expression rather than a substring. */
const REGEX_PREFIX = 're:';

/** One include/exclude entry, compiled. */
type UrlMatcher = (url: string) => boolean;

/**
 * Compile include/exclude entries; an invalid `re:` entry throws, naming it, so a typo fails loudly at the start. A blank
 * `re:` entry (`re:` alone) is left out, with one log line naming it: compiled, it would match every URL.
 */
export function CompileUrlPatterns(patterns: readonly string[] | undefined): UrlMatcher[] {
    const entries = (patterns ?? []).filter((p) => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim());
    const blank = entries.filter((p) => p.startsWith(REGEX_PREFIX) && p.slice(REGEX_PREFIX.length).trim().length === 0);
    if (blank.length > 0) {
        LogStatus(`Website crawl: ignoring the URL pattern(s) ${blank.map((p) => `'${p}'`).join(', ')}: an empty regular expression would match every URL`);
    }
    return entries.filter((p) => !blank.includes(p)).map(CompileUrlPattern);
}

/** One include/exclude entry: a substring, or a regular expression when written `re:<pattern>`. */
function CompileUrlPattern(pattern: string): UrlMatcher {
    if (!pattern.startsWith(REGEX_PREFIX)) {
        return (url: string) => url.includes(pattern);
    }
    let regex: RegExp;
    try {
        regex = new RegExp(pattern.slice(REGEX_PREFIX.length));
    } catch (error) {
        throw new Error(`The URL pattern '${pattern}' is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`);
    }
    return (url: string) => regex.test(url);
}

/** The crawl's scope rules, compiled once per crawl. */
export class CrawlScope {
    private readonly include: UrlMatcher[];
    private readonly exclude: UrlMatcher[];
    private readonly stripped: readonly string[];

    constructor(private readonly options: CrawlScopeOptions = {}) {
        this.include = CompileUrlPatterns(options.IncludePatterns);
        this.exclude = CompileUrlPatterns(options.ExcludePatterns);
        this.stripped = options.StripQueryParams?.length
            ? options.StripQueryParams
            : options.StripTrackingParams
              ? DEFAULT_STRIPPED_QUERY_PARAMS
              : [];
    }

    /** Whether redirect or canonical dedup is on (so the crawl keeps the identities it has reported). */
    public get Dedups(): boolean {
        return this.options.DedupCanonical === true || this.options.DedupRedirects === true;
    }

    public get DedupCanonical(): boolean {
        return this.options.DedupCanonical === true;
    }

    public get DedupRedirects(): boolean {
        return this.options.DedupRedirects === true;
    }

    public get LoopLimit(): number | null {
        const limit = this.options.LoopLimit;
        return typeof limit === 'number' && Number.isFinite(limit) && limit >= 0 ? limit : null;
    }

    /** The URL to fetch and report: {@link NormalizeCrawlURL} without the stripped query parameters. */
    public Clean(href: string): string {
        if (this.stripped.length === 0) {
            return NormalizeCrawlURL(href);
        }
        try {
            const u = new URL(href);
            for (const name of [...u.searchParams.keys()]) {
                if (this.isStripped(name)) {
                    u.searchParams.delete(name);
                }
            }
            return NormalizeCrawlURL(u.href);
        } catch {
            return NormalizeCrawlURL(href);
        }
    }

    /** The identity a cleaned URL is deduplicated by: itself, or with www/apex and http/https merged. */
    public Key(cleanURL: string): string {
        if (!this.options.MergeWwwAndScheme) {
            return cleanURL;
        }
        try {
            const u = new URL(cleanURL);
            if (u.protocol === 'http:') {
                u.protocol = 'https:';
                if (u.port === '80') {
                    u.port = '';
                }
            }
            if (u.hostname.startsWith('www.')) {
                u.hostname = u.hostname.slice(4);
            }
            return u.href;
        } catch {
            return cleanURL;
        }
    }

    /**
     * Whether a cleaned URL is under the root: the same origin (www/apex and http/https as one when merging) and the
     * root's path or a path below it, segment by segment (a root of `/docs` covers `/docs` and `/docs/a`, not
     * `/docs-private`; a root of `https://site.test` does not cover `https://site.test.evil.com` or
     * `https://site.test:8443`). The root's query string, if any, is not compared. A URL that does not parse is not
     * under any root.
     */
    public UnderRoot(cleanURL: string, rootURL: string): boolean {
        const url = this.parsedIdentity(cleanURL);
        const root = this.parsedIdentity(rootURL);
        if (!url || !root || url.origin !== root.origin) {
            return false;
        }
        const rootPath = root.pathname.endsWith('/') ? root.pathname.slice(0, -1) : root.pathname;
        return rootPath.length === 0 || url.pathname === rootPath || url.pathname.startsWith(`${rootPath}/`);
    }

    /** A URL parsed for a scope comparison: with www/apex and http/https merged when merging; null when it does not parse. */
    private parsedIdentity(href: string): URL | null {
        try {
            return new URL(this.Key(href));
        } catch {
            return null;
        }
    }

    /** Whether a found link may be visited at all (exclusions, the include list, the calendar guard). */
    public MayVisit(cleanURL: string): boolean {
        if (this.exclude.some((m) => m(cleanURL))) {
            return false;
        }
        if (this.include.length > 0 && !this.include.some((m) => m(cleanURL))) {
            return false;
        }
        return !(this.options.SkipCalendarPaths && IsCalendarURL(cleanURL));
    }

    /** Whether a visited page is reported (the start page is visited for its links even when it is not). */
    public MayReport(cleanURL: string): boolean {
        if (this.exclude.some((m) => m(cleanURL))) {
            return false;
        }
        return this.include.length === 0 || this.include.some((m) => m(cleanURL));
    }

    private isStripped(name: string): boolean {
        const lower = name.toLowerCase();
        return this.stripped.some((p) => {
            const pattern = p.toLowerCase();
            return pattern.endsWith('*') ? lower.startsWith(pattern.slice(0, -1)) : lower === pattern;
        });
    }
}

/** Whether a URL's path is date-shaped: an endless calendar. */
export function IsCalendarURL(url: string): boolean {
    try {
        return CALENDAR_PATH.test(new URL(url).pathname);
    } catch {
        return CALENDAR_PATH.test(url);
    }
}

/**
 * A URL as a dedup key: no fragment, no trailing slash on the path (except the root), query parameters sorted.
 * Path case is kept: paths are case-sensitive.
 */
export function NormalizeCrawlURL(href: string): string {
    try {
        const u = new URL(href);
        u.hash = '';
        if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.slice(0, -1);
        }
        u.searchParams.sort();
        return u.href;
    } catch {
        return href;
    }
}
