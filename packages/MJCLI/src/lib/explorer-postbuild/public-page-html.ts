/**
 * @fileoverview The HTML file of each public page, and the Azure Static Web Apps routes that
 * serve those files. `mj explorer postbuild` runs this on MJ Explorer's build output.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_PAGE_SLUG_PATTERN } from '@memberjunction/open-app-engine';
import { IsPublicPage, ReadFileIfExists, type OpenAppPublicPage, type OpenAppPublicPageEntry } from '../../commands/codegen/manifest.js';

/** Folder in the site folder that holds one HTML file per page. */
const PUBLIC_PAGE_HTML_FOLDER = 'public-pages';

/** Address prefix of public pages. The public host uses the same prefix. */
const PUBLIC_PAGE_PATH_PREFIX = '/p/';

/** The Azure Static Web Apps config file in the site folder. */
const STATIC_WEB_APP_CONFIG_FILE = 'staticwebapp.config.json';

/** A JSON value, as read from a config file. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** A JSON object, as read from a config file. */
export interface JsonObject {
    [key: string]: JsonValue;
}

/** One route in an Azure Static Web Apps config file. Other route settings are kept as they are. */
export interface StaticWebAppRoute {
    // case-violation-ok-legacy-back-compat: key name in Azure's staticwebapp.config.json
    route: string;
    // case-violation-ok-legacy-back-compat: key name in Azure's staticwebapp.config.json
    rewrite?: string;
    [key: string]: JsonValue | undefined;
}

/** Escapes text for an HTML element or a double-quoted attribute. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * The enabled pages. Error pages are left out: they have no address of their own, so no file and
 * no route. Throws on a slug that does not follow the slug rule, because the slug is a file name
 * and an address.
 */
function enabledPages(entries: OpenAppPublicPageEntry[]): OpenAppPublicPage[] {
    const pages = entries.filter(IsPublicPage).filter((entry) => entry.Enabled !== false);
    const invalid = pages.find((page) => !PUBLIC_PAGE_SLUG_PATTERN.test(page.Slug));
    if (invalid) {
        throw new Error(`Public page slug '${invalid.Slug}' of app '${invalid.AppName}' must be lowercase letters and digits joined by single hyphens.`);
    }
    return pages;
}

/** The head tags that search results and link previews read for a page. */
function previewTags(page: OpenAppPublicPage): string[] {
    const tags: string[] = [];
    if (page.Description) {
        tags.push(`<meta name="description" content="${escapeHtml(page.Description)}">`);
    }
    tags.push('<meta property="og:type" content="website">');
    if (page.Title) {
        tags.push(`<meta property="og:title" content="${escapeHtml(page.Title)}">`);
    }
    if (page.Description) {
        tags.push(`<meta property="og:description" content="${escapeHtml(page.Description)}">`);
    }
    tags.push('<meta name="twitter:card" content="summary">');
    return tags;
}

/**
 * Removes HTML comments. A comment can hold text that looks like a tag, and the edits below
 * must see real tags only. Text inside a script or a style block stays as it is.
 */
function removeComments(html: string): string {
    return html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>|[ \t]*<!--[\s\S]*?-->\n?/gi, (match: string, block?: string) =>
        block ? match : '');
}

/**
 * Removes the map library's tags (Leaflet and its cluster plugin). They load scripts from another
 * site, and a public page does not use them.
 */
function removeMapLibraryTags(html: string): string {
    const mapLibraryUrl = 'https://unpkg\\.com/leaflet';
    return html
        .replace(new RegExp(`[ \\t]*<link\\b[^>]*\\bhref="${mapLibraryUrl}[^"]*"[^>]*>\\n?`, 'gi'), '')
        .replace(new RegExp(`[ \\t]*<script\\b[^>]*\\bsrc="${mapLibraryUrl}[^"]*"[^>]*>\\s*</script>\\n?`, 'gi'), '')
        .replace(/[ \t]*<script\b([^>]*)>([\s\S]*?)<\/script>\n?/gi, (tag: string, attributes: string, body: string) =>
            !/\bsrc\s*=/i.test(attributes) && /unpkg\.com\/leaflet/i.test(body) ? '' : tag);
}

/**
 * Turns a stylesheet link that Angular's build defers with an inline `onload` handler into a
 * plain link, and removes its `<noscript>` copy. The page's policy blocks inline handlers.
 */
function useStylesheetLinks(html: string): string {
    return html
        .replace(/<link\b([^>]*?)\s+media="print"\s+onload="this\.media='all'"([^>]*)>/gi, '<link$1$2>')
        .replace(/<noscript>\s*<link\b[^>]*\brel="stylesheet"[^>]*>\s*<\/noscript>/gi, '');
}

/** The policy source for each inline script: the SHA-256 hash of its text. Scripts with `src` and data blocks have none. */
function inlineScriptHashes(html: string): string[] {
    const hashes: string[] = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const [, attributes, body] = match;
        const type = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
        const runs = !type || type === 'module' || type.endsWith('javascript');
        if (runs && !/\bsrc\s*=/i.test(attributes)) {
            hashes.push(`'sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}'`);
        }
    }
    return hashes;
}

/**
 * The page's Content Security Policy tag. Scripts run only from the site itself, plus the inline
 * scripts that the page file holds. A script from another site, or one that an attacker injects,
 * does not run, so it cannot read Explorer's sign-in tokens.
 */
function policyTag(html: string): string {
    const scriptSources = ["'self'", ...inlineScriptHashes(html)].join(' ');
    return `<meta http-equiv="Content-Security-Policy" content="script-src ${scriptSources}; object-src 'none'; base-uri 'self'">`;
}

/** Puts `tag` first in `<head>`: after the charset tag when there is one, so it applies to all that follows. */
function insertFirstInHead(html: string, tag: string): string {
    const charset = html.match(/<meta\b[^>]*\bcharset\b[^>]*>/i);
    if (charset) {
        return html.replace(charset[0], () => `${charset[0]}\n  ${tag}`);
    }
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}\n  ${tag}`);
}

/** Sets the page's title and adds its link preview tags and the robots tag, in place of `<title>`. */
function setHeadTags(html: string, page: OpenAppPublicPage): string {
    const titlePattern = /<title>[\s\S]*?<\/title>/i;
    const withoutRobots = html.replace(/[ \t]*<meta\b[^>]*\bname="robots"[^>]*>\n?/gi, '');
    const currentTitle = withoutRobots.match(titlePattern)?.[0];
    const title = page.Title ? `<title>${escapeHtml(page.Title)}</title>` : currentTitle;
    const tags = [...previewTags(page), '<meta name="robots" content="index, follow">'];
    const head = [...(title ? [title] : []), ...tags.map((tag) => `  ${tag}`)].join('\n');
    return currentTitle
        ? withoutRobots.replace(titlePattern, () => head)
        : withoutRobots.replace(/<\/head>/i, () => `${head}\n</head>`);
}

/**
 * Builds a page's HTML from Explorer's built `index.html`:
 * - the page title, and the description and Open Graph tags that link previews read
 * - a robots tag that lets search engines index the page
 * - no map library tags, and a plain link for the main stylesheet
 * - a Content Security Policy that allows only the site's own scripts
 */
export function BuildPublicPageHtml(indexHtml: string, page: OpenAppPublicPage): string {
    const html = setHeadTags(useStylesheetLinks(removeMapLibraryTags(removeComments(indexHtml))), page);
    return insertFirstInHead(html, policyTag(html));
}

/**
 * Writes `public-pages/<slug>.html` into the site folder (Explorer's build) for each enabled page.
 *
 * @returns the number of files written
 */
export function WritePublicPageHtmlFiles(siteDir: string, entries: OpenAppPublicPageEntry[]): number {
    const indexHtml = ReadFileIfExists(join(siteDir, 'index.html'));
    if (indexHtml === null) {
        throw new Error(`No index.html in ${siteDir}. Build MJ Explorer first.`);
    }
    const pages = enabledPages(entries);
    if (pages.length > 0) {
        mkdirSync(join(siteDir, PUBLIC_PAGE_HTML_FOLDER), { recursive: true });
    }
    for (const page of pages) {
        writeFileSync(join(siteDir, PUBLIC_PAGE_HTML_FOLDER, `${page.Slug}.html`), BuildPublicPageHtml(indexHtml, page), 'utf-8');
    }
    return pages.length;
}

/**
 * Returns `routes` with two rewrites for each enabled page (`/p/<slug>` and `/p/<slug>/*`) to the
 * page's HTML file, before the other routes. Page routes from an earlier run are replaced.
 */
export function ApplyPublicPageRoutes(routes: StaticWebAppRoute[], entries: OpenAppPublicPageEntry[]): StaticWebAppRoute[] {
    const pagesUrlPath = `/${PUBLIC_PAGE_HTML_FOLDER}`;
    const isPageRoute = (route: StaticWebAppRoute): boolean => !!route.rewrite?.startsWith(`${pagesUrlPath}/`);
    const pageRoutes = enabledPages(entries)
        .flatMap((entry) => {
            const rewrite = `${pagesUrlPath}/${entry.Slug}.html`;
            const path = `${PUBLIC_PAGE_PATH_PREFIX}${entry.Slug}`;
            return [{ route: path, rewrite }, { route: `${path}/*`, rewrite }];
        });
    return [...pageRoutes, ...routes.filter((route) => !isPageRoute(route))];
}

/** True when a JSON value is a route object. */
function isRoute(value: JsonValue): value is StaticWebAppRoute {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['route'] === 'string';
}

/**
 * Adds the page routes to `staticwebapp.config.json` (Azure Static Web Apps) in the site folder.
 * A site folder without that file is not changed.
 *
 * @returns true when the file was written
 */
export function WriteStaticWebAppRoutes(siteDir: string, entries: OpenAppPublicPageEntry[]): boolean {
    const configPath = join(siteDir, STATIC_WEB_APP_CONFIG_FILE);
    const configText = ReadFileIfExists(configPath);
    if (configText === null) {
        return false;
    }
    const config = JSON.parse(configText) as JsonObject;
    const current = config['routes'];
    const routes = Array.isArray(current) ? current.filter(isRoute) : [];
    const updated = ApplyPublicPageRoutes(routes, entries);
    if (JSON.stringify(updated) === JSON.stringify(current ?? [])) {
        return false;
    }
    writeFileSync(configPath, `${JSON.stringify({ ...config, routes: updated }, null, 2)}\n`, 'utf-8');
    return true;
}
