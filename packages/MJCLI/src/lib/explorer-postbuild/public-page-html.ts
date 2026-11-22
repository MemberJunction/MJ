/**
 * @fileoverview The HTML file of each public page, and the Azure Static Web Apps routes that
 * serve those files. `mj explorer postbuild` runs this on MJ Explorer's build output.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultTreeAdapter, html as htmlNames, parse, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import { PUBLIC_PAGE_SLUG_PATTERN } from '@memberjunction/open-app-engine';
import { IsPublicPage, ReadFileIfExists, type OpenAppPublicPage, type OpenAppPublicPageEntry } from '../../commands/codegen/manifest.js';

/** Folder in the site folder that holds one HTML file per page. */
const PUBLIC_PAGE_HTML_FOLDER = 'public-pages';

/** File in the pages folder that answers a public page address with no page file of its own. An underscore cannot be in a slug. */
const PUBLIC_PAGE_FALLBACK_FILE = '_fallback.html';

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

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParent = DefaultTreeAdapterTypes.ParentNode;

/** The head values of a page file. */
interface PageHead {
    Title?: string;
    Description?: string;
    /** Content of the robots tag. */
    Robots: string;
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

function isElement(node: HtmlNode): node is HtmlElement {
    return defaultTreeAdapter.isElementNode(node);
}

/** All nodes below `parent`, in document order. */
function nodesIn(parent: HtmlParent): HtmlNode[] {
    return parent.childNodes.flatMap((child) => ('childNodes' in child ? [child, ...nodesIn(child)] : [child]));
}

/** The elements below `parent` with one of the tag names, in document order. */
function elementsIn(parent: HtmlParent, ...tagNames: string[]): HtmlElement[] {
    return nodesIn(parent).filter(isElement).filter((element) => tagNames.includes(element.tagName));
}

function attribute(element: HtmlElement, name: string): string | undefined {
    return element.attrs.find((attr) => attr.name === name)?.value;
}

function textOf(element: HtmlElement): string {
    return element.childNodes.map((child) => (defaultTreeAdapter.isTextNode(child) ? child.value : '')).join('');
}

function isBlankText(node: HtmlNode | undefined): boolean {
    return !!node && defaultTreeAdapter.isTextNode(node) && node.value.trim() === '';
}

/** Removes a node, and the blank text before it, so no empty line stays. */
function removeNode(node: DefaultTreeAdapterTypes.ChildNode): void {
    const siblings = node.parentNode?.childNodes ?? [];
    const before = siblings[siblings.indexOf(node) - 1];
    if (before && isBlankText(before)) {
        defaultTreeAdapter.detachNode(before);
    }
    defaultTreeAdapter.detachNode(node);
}

function createElement(tagName: string, attrs: Record<string, string>): HtmlElement {
    return defaultTreeAdapter.createElement(tagName, htmlNames.NS.HTML, Object.entries(attrs).map(([name, value]) => ({ name, value })));
}

/** Puts `elements` after `reference`, or first in `parent` when there is no reference. Each goes on its own line. */
function insertElements(parent: HtmlParent, reference: HtmlNode | undefined, elements: HtmlElement[]): void {
    const index = reference ? parent.childNodes.indexOf(reference as DefaultTreeAdapterTypes.ChildNode) + 1 : 0;
    const next = parent.childNodes[index];
    for (const element of elements) {
        const indent: DefaultTreeAdapterTypes.TextNode = { nodeName: '#text', value: '\n  ', parentNode: null };
        for (const node of [indent, element]) {
            if (next) {
                defaultTreeAdapter.insertBefore(parent, node, next);
            } else {
                defaultTreeAdapter.appendChild(parent, node);
            }
        }
    }
}

/** True for an address of the map library (Leaflet and its cluster plugin) on unpkg.com. */
function isMapLibraryUrl(address: string): boolean {
    if (!URL.canParse(address)) {
        return false;
    }
    const url = new URL(address);
    return url.hostname === 'unpkg.com' && url.pathname.startsWith('/leaflet');
}

/** True for an inline script that names a map library address. */
function loadsMapLibrary(script: HtmlElement): boolean {
    const addresses = textOf(script).match(/https?:\/\/[^\s'"`]+/g) ?? [];
    return addresses.some(isMapLibraryUrl);
}

/**
 * Removes the map library's tags. They load scripts from another site, and a public page does
 * not use them.
 */
function removeMapLibraryTags(document: HtmlParent): void {
    for (const element of elementsIn(document, 'link', 'script')) {
        const address = attribute(element, element.tagName === 'link' ? 'href' : 'src');
        const isMapTag = address !== undefined ? isMapLibraryUrl(address) : element.tagName === 'script' && loadsMapLibrary(element);
        if (isMapTag) {
            removeNode(element);
        }
    }
}

function isStylesheetLink(node: HtmlNode): boolean {
    return isElement(node) && node.tagName === 'link' && attribute(node, 'rel') === 'stylesheet';
}

/**
 * Turns a stylesheet link that Angular's build defers with an inline `onload` handler into a
 * plain link, and removes its `<noscript>` copy. The page's policy blocks inline handlers.
 */
function useStylesheetLinks(document: HtmlParent): void {
    for (const link of elementsIn(document, 'link')) {
        if (isStylesheetLink(link) && attribute(link, 'media') === 'print' && attribute(link, 'onload') === "this.media='all'") {
            link.attrs = link.attrs.filter((attr) => attr.name !== 'media' && attr.name !== 'onload');
        }
    }
    for (const noscript of elementsIn(document, 'noscript')) {
        const content = noscript.childNodes.filter((child) => !isBlankText(child));
        if (content.length > 0 && content.every(isStylesheetLink)) {
            defaultTreeAdapter.detachNode(noscript);
        }
    }
}

/** True for a script that the browser runs from its own text: no `src`, and not a data block. */
function isInlineScript(script: HtmlElement): boolean {
    const type = attribute(script, 'type')?.trim().toLowerCase();
    const runs = !type || type === 'module' || type.endsWith('javascript');
    return runs && attribute(script, 'src') === undefined;
}

/**
 * The page's Content Security Policy tag. Scripts run only from the site itself, plus the inline
 * scripts that the page file holds, each named by the SHA-256 hash of its text. A script from
 * another site, or one that an attacker injects, does not run, so it cannot read Explorer's
 * sign-in tokens.
 */
function policyTag(document: HtmlParent): HtmlElement {
    const hashes = elementsIn(document, 'script')
        .filter(isInlineScript)
        .map((script) => `'sha256-${createHash('sha256').update(textOf(script), 'utf-8').digest('base64')}'`);
    const scriptSources = ["'self'", ...hashes].join(' ');
    return createElement('meta', {
        'http-equiv': 'Content-Security-Policy',
        content: `script-src ${scriptSources}; object-src 'none'; base-uri 'self'`,
    });
}

/** The head tags that search results and link previews read. */
function previewTags(head: PageHead): HtmlElement[] {
    const tags: HtmlElement[] = [];
    if (head.Description) {
        tags.push(createElement('meta', { name: 'description', content: head.Description }));
    }
    tags.push(createElement('meta', { property: 'og:type', content: 'website' }));
    if (head.Title) {
        tags.push(createElement('meta', { property: 'og:title', content: head.Title }));
    }
    if (head.Description) {
        tags.push(createElement('meta', { property: 'og:description', content: head.Description }));
    }
    tags.push(createElement('meta', { name: 'twitter:card', content: 'summary' }));
    return tags;
}

/** Sets the title, and puts the given tags and the robots tag after it. */
function setHeadTags(headElement: HtmlElement, head: PageHead, tags: HtmlElement[]): void {
    for (const meta of elementsIn(headElement, 'meta')) {
        if (attribute(meta, 'name')?.toLowerCase() === 'robots') {
            removeNode(meta);
        }
    }
    let title = elementsIn(headElement, 'title')[0];
    if (head.Title) {
        if (!title) {
            title = createElement('title', {});
            insertElements(headElement, headElement.childNodes.at(-1), [title]);
        }
        title.childNodes = [];
        defaultTreeAdapter.insertText(title, head.Title);
    }
    const parent = title?.parentNode ?? headElement;
    const reference = title ?? parent.childNodes.at(-1);
    insertElements(parent, reference, [...tags, createElement('meta', { name: 'robots', content: head.Robots })]);
}

/**
 * Builds a page file from Explorer's built `index.html`. The file is parsed and written as a
 * browser reads it, so the policy names each inline script by the text that the browser runs.
 */
function buildHtml(indexHtml: string, head: PageHead, tags: HtmlElement[]): string {
    const document = parse(indexHtml, { scriptingEnabled: false });
    for (const node of nodesIn(document)) {
        if (defaultTreeAdapter.isCommentNode(node)) {
            removeNode(node);
        }
    }
    removeMapLibraryTags(document);
    useStylesheetLinks(document);

    const headElement = elementsIn(document, 'head')[0];
    setHeadTags(headElement, head, tags);
    const charset = elementsIn(headElement, 'meta').find((meta) => attribute(meta, 'charset') !== undefined);
    insertElements(charset?.parentNode ?? headElement, charset, [policyTag(document)]);
    return serialize(document, { scriptingEnabled: false });
}

/**
 * Builds a page's HTML from Explorer's built `index.html`:
 * - the page title, and the description and Open Graph tags that link previews read
 * - a robots tag that lets search engines index the page
 * - no map library tags, and a plain link for the main stylesheet
 * - a Content Security Policy that allows only the site's own scripts
 */
export function BuildPublicPageHtml(indexHtml: string, page: OpenAppPublicPage): string {
    const head: PageHead = { Title: page.Title, Description: page.Description, Robots: 'index, follow' };
    return buildHtml(indexHtml, head, previewTags(head));
}

/**
 * Builds the HTML for a public page address that has no page file: an unknown slug, or `/p/` alone.
 * It has the same policy as a page file, so the error page that shows there runs under it. Search
 * engines do not index it.
 */
export function BuildPublicFallbackHtml(indexHtml: string): string {
    return buildHtml(indexHtml, { Robots: 'noindex' }, []);
}

/**
 * Writes `public-pages/<slug>.html` into the site folder (Explorer's build) for each enabled page,
 * and `public-pages/_fallback.html` for the other public page addresses.
 *
 * @returns the number of page files written
 */
export function WritePublicPageHtmlFiles(siteDir: string, entries: OpenAppPublicPageEntry[]): number {
    const indexHtml = ReadFileIfExists(join(siteDir, 'index.html'));
    if (indexHtml === null) {
        throw new Error(`No index.html in ${siteDir}. Build MJ Explorer first.`);
    }
    const pages = enabledPages(entries);
    mkdirSync(join(siteDir, PUBLIC_PAGE_HTML_FOLDER), { recursive: true });
    writeFileSync(join(siteDir, PUBLIC_PAGE_HTML_FOLDER, PUBLIC_PAGE_FALLBACK_FILE), BuildPublicFallbackHtml(indexHtml), 'utf-8');
    for (const page of pages) {
        writeFileSync(join(siteDir, PUBLIC_PAGE_HTML_FOLDER, `${page.Slug}.html`), BuildPublicPageHtml(indexHtml, page), 'utf-8');
    }
    return pages.length;
}

/**
 * Returns `routes` with two rewrites for each enabled page (`/p/<slug>` and `/p/<slug>/*`) to the
 * page's HTML file, then one for every other public page address to the fallback file, before the
 * other routes. Page routes from an earlier run are replaced.
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
    const fallbackRoute = { route: `${PUBLIC_PAGE_PATH_PREFIX}*`, rewrite: `${pagesUrlPath}/${PUBLIC_PAGE_FALLBACK_FILE}` };
    return [...pageRoutes, fallbackRoute, ...routes.filter((route) => !isPageRoute(route))];
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
