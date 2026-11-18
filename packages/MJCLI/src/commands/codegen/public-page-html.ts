import { Command, Flags } from '@oclif/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReadConfiguredPublicPages, type OpenAppPublicPageEntry } from './manifest.js';

/** Folder in the site folder that holds one HTML file per page. */
const PUBLIC_PAGE_HTML_FOLDER = 'public-pages';

/** Address prefix of public pages. The public host uses the same prefix. */
const PUBLIC_PAGE_PATH_PREFIX = '/p/';

/** The Azure Static Web Apps config file in the site folder. */
const STATIC_WEB_APP_CONFIG_FILE = 'staticwebapp.config.json';

/** The slug rule of `publicPages` in mj-app.json: lowercase words joined by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

/** The enabled pages. Throws on a slug that does not follow the slug rule, because the slug is a file name and an address. */
function enabledPages(entries: OpenAppPublicPageEntry[]): OpenAppPublicPageEntry[] {
    const pages = entries.filter((entry) => entry.Enabled !== false);
    const invalid = pages.find((page) => !SLUG_PATTERN.test(page.Slug));
    if (invalid) {
        throw new Error(`Public page slug '${invalid.Slug}' of app '${invalid.AppName}' must be lowercase letters and digits joined by single hyphens.`);
    }
    return pages;
}

/** The head tags that search results and link previews read for a page. */
function previewTags(page: OpenAppPublicPageEntry): string[] {
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
 * Builds a page's HTML from Explorer's `index.html`: the page title in `<title>`, and
 * the description and Open Graph tags that link previews read. A page with no title and no
 * description gets `index.html` unchanged.
 */
export function BuildPublicPageHtml(indexHtml: string, page: OpenAppPublicPageEntry): string {
    if (!page.Title && !page.Description) {
        return indexHtml;
    }
    let html = indexHtml;
    if (page.Title) {
        const title = `<title>${escapeHtml(page.Title)}</title>`;
        html = /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, () => title) : html.replace(/<\/head>/i, () => `${title}\n</head>`);
    }
    const tags = previewTags(page).map((tag) => `  ${tag}`).join('\n');
    return /<\/title>/i.test(html)
        ? html.replace(/<\/title>/i, () => `</title>\n${tags}`)
        : html.replace(/<\/head>/i, () => `${tags}\n</head>`);
}

/**
 * Writes `public-pages/<slug>.html` into the site folder (Explorer's build) for each enabled page.
 *
 * @returns the number of files written
 */
export function WritePublicPageHtmlFiles(siteDir: string, entries: OpenAppPublicPageEntry[]): number {
    const indexPath = join(siteDir, 'index.html');
    if (!existsSync(indexPath)) {
        throw new Error(`No index.html in ${siteDir}. Build MJ Explorer first.`);
    }
    const indexHtml = readFileSync(indexPath, 'utf-8');
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
    if (!existsSync(configPath)) {
        return false;
    }
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as JsonObject;
    const current = config['routes'];
    const routes = Array.isArray(current) ? current.filter(isRoute) : [];
    const updated = ApplyPublicPageRoutes(routes, entries);
    if (JSON.stringify(updated) === JSON.stringify(current ?? [])) {
        return false;
    }
    writeFileSync(configPath, `${JSON.stringify({ ...config, routes: updated }, null, 2)}\n`, 'utf-8');
    return true;
}

export default class CodeGenPublicPageHtml extends Command {
    static description = `Write one HTML file per public page into MJ Explorer's build, with the page title and link preview tags.

Reads the pages from mj.config \`publicPages\` (their \`Title\` and \`Description\` come from
mj-app.json). Each file is a copy of Explorer's index.html, so link previews and search engines see
the page's title and description without running JavaScript. The web host serves
public-pages/<slug>.html for /p/<slug>. When the folder has a staticwebapp.config.json (Azure Static
Web Apps), the command adds a rewrite for each page to it. Run it after the Explorer build.`;

    static examples = [
        {
            command: '<%= config.bin %> <%= command.id %> --dir dist/MJExplorer/browser',
            description: 'Write public-pages/<slug>.html for each public page',
        },
    ];

    static flags = {
        dir: Flags.string({
            description: "The site folder: MJ Explorer's build output, with its index.html.",
            required: true,
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Do not print a summary.',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CodeGenPublicPageHtml);
        const dir = resolve(process.cwd(), flags.dir);
        const entries = ReadConfiguredPublicPages();
        const written = WritePublicPageHtmlFiles(dir, entries);
        const routesChanged = WriteStaticWebAppRoutes(dir, entries);
        if (!flags.quiet) {
            this.log(`[public-page-html] ${written} ${written === 1 ? 'page' : 'pages'} written${routesChanged ? ', Static Web Apps routes updated' : ''}`);
        }
    }
}
