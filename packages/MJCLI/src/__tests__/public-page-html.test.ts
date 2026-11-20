/**
 * Tests for the page files of `mj explorer postbuild`: one HTML file per public page, with the page
 * title, link preview tags and security policy, and the Azure Static Web Apps routes that serve them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    ApplyPublicPageRoutes,
    BuildPublicFallbackHtml,
    BuildPublicPageHtml,
    WritePublicPageHtmlFiles,
    WriteStaticWebAppRoutes,
    type StaticWebAppRoute,
} from '../lib/explorer-postbuild/public-page-html.js';
import type { OpenAppPublicPageEntry } from '../commands/codegen/manifest.js';
import { PublicPageEntrySchema } from '../config.js';

const INDEX_HTML = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>MemberJunction Explorer</title>',
    '  <base href="/" />',
    '<link rel="stylesheet" href="styles-AAA.css"></head>',
    '<body>',
    '<app-root></app-root>',
    '<script src="main-BBB.js" type="module"></script></body>',
    '</html>',
].join('\n');

const PRICING: OpenAppPublicPageEntry = {
    AppName: 'acme-app',
    Slug: 'pricing',
    PackageName: '@acme/app-public',
    ExportName: 'PricingPageComponent',
    Title: 'Pricing',
    Description: 'Plans for every team.',
    Enabled: true,
};

describe('PublicPageEntrySchema', () => {
    it('keeps the title and description from mj.config.cjs', () => {
        const entry = PublicPageEntrySchema.parse({ ...PRICING });
        expect(entry.Title).toBe('Pricing');
        expect(entry.Description).toBe('Plans for every team.');
    });
});

describe('BuildPublicPageHtml', () => {
    it('sets the title and adds the description and link preview tags', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, PRICING);
        expect(html).toContain('<title>Pricing</title>');
        expect(html).not.toContain('<title>MemberJunction Explorer</title>');
        expect(html).toContain('<meta name="description" content="Plans for every team.">');
        expect(html).toContain('<meta property="og:title" content="Pricing">');
        expect(html).toContain('<meta property="og:description" content="Plans for every team.">');
        expect(html).toContain('<meta property="og:type" content="website">');
        expect(html).toContain('<meta name="twitter:card" content="summary">');
    });

    it('keeps the scripts and styles of the Explorer build', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, PRICING);
        expect(html).toContain('<script src="main-BBB.js" type="module"></script>');
        expect(html).toContain('<link rel="stylesheet" href="styles-AAA.css">');
    });

    it('escapes HTML in the title and description', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, { ...PRICING, Title: 'A & B <script>', Description: 'Say "hi" & \'bye\'' });
        expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>');
        expect(html).toContain(`<meta name="description" content="Say &quot;hi&quot; &amp; 'bye'">`);
        expect(html).toContain('<meta property="og:title" content="A &amp; B <script>">');
        expect(html.match(/<\/script>/g)).toHaveLength(1);
    });

    it('keeps the default title when the page has only a description', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, { ...PRICING, Title: undefined });
        expect(html).toContain('<title>MemberJunction Explorer</title>');
        expect(html).toContain('<meta name="description" content="Plans for every team.">');
        expect(html).not.toContain('og:title');
    });
});

const THEME_SCRIPT = "\n    (function () { document.documentElement.setAttribute('data-theme', 'dark'); })();\n  ";
const BRAND_SCRIPT = "(function () { /* brand */ })();";

/** Explorer's built index.html, with the tags a public page must not keep. */
const BUILT_INDEX_HTML = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>MemberJunction Explorer</title>',
    '  <base href="/" />',
    '  <meta name="robots" content="noindex">',
    `  <script>${THEME_SCRIPT}</script>`,
    '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous">',
    '  <!-- Leaflet for map view -->',
    '  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-x" crossorigin="" />',
    '  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-y" crossorigin="" defer></script>',
    '  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" crossorigin="" />',
    '  <script>',
    '    (function () {',
    "      var s = document.createElement('script');",
    "      s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';",
    '      document.head.appendChild(s);',
    '    })();',
    '  </script>',
    '<link rel="stylesheet" href="styles-AAA.css" media="print" onload="this.media=\'all\'"><noscript><link rel="stylesheet" href="styles-AAA.css"></noscript></head>',
    '<body>',
    `  <script>${BRAND_SCRIPT}</script>`,
    '<app-root></app-root>',
    '<script src="main-BBB.js" type="module"></script></body>',
    '</html>',
].join('\n');

function scriptHash(body: string): string {
    return `'sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}'`;
}

function policyOf(html: string): string {
    return html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1] ?? '';
}

describe('BuildPublicPageHtml security', () => {
    const html = BuildPublicPageHtml(BUILT_INDEX_HTML, PRICING);

    it('removes the map library tags, and keeps the icon font', () => {
        expect(html).not.toContain('unpkg.com');
        expect(html).not.toContain('leaflet');
        expect(html).toContain('font-awesome/6.5.2/css/all.min.css');
    });

    it('allows only scripts of the site and the inline scripts that remain', () => {
        const policy = policyOf(html);
        expect(policy).toContain(`script-src 'self' ${scriptHash(THEME_SCRIPT)} ${scriptHash(BRAND_SCRIPT)};`);
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("base-uri 'self'");
        expect(policy).not.toContain('unsafe-inline');
        expect(policy.match(/sha256-/g)).toHaveLength(2);
    });

    it('puts the policy before every script and stylesheet', () => {
        const policyAt = html.indexOf('http-equiv="Content-Security-Policy"');
        expect(policyAt).toBeGreaterThan(-1);
        expect(policyAt).toBeLessThan(html.indexOf('<script'));
        expect(policyAt).toBeLessThan(html.indexOf('<link'));
    });

    it('loads the main stylesheet with a plain link, because the policy blocks the inline handler', () => {
        expect(html).toContain('<link rel="stylesheet" href="styles-AAA.css">');
        expect(html).not.toContain('onload=');
        expect(html).not.toContain('<noscript>');
    });

    it('lets search engines index the page', () => {
        expect(html).toContain('<meta name="robots" content="index, follow">');
        expect(html).not.toContain('noindex');
    });

    it('writes the policy and the robots tag for a page with no title and no description', () => {
        const bare = BuildPublicPageHtml(BUILT_INDEX_HTML, { ...PRICING, Title: undefined, Description: undefined });
        expect(policyOf(bare)).toContain("script-src 'self'");
        expect(bare).toContain('<meta name="robots" content="index, follow">');
        expect(bare).toContain('<title>MemberJunction Explorer</title>');
    });
});

describe('BuildPublicPageHtml with comments that name tags', () => {
    const indexHtml = [
        '<html><head>',
        '  <title>MemberJunction Explorer</title>',
        '  <!-- The plugin must not load as a plain <script> during <head> parse. -->',
        '  <script>',
        "    var s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';",
        '  </script>',
        '  <!-- <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"> was here -->',
        '  <link rel="stylesheet" href="styles-ABC.css">',
        '</head><body><app-root></app-root><script src="main.js" type="module"></script></body></html>',
    ].join('\n');
    const html = BuildPublicPageHtml(indexHtml, PRICING);

    it('leaves no comment, so no tag after a comment is lost', () => {
        expect(html).not.toContain('<!--');
        expect(html).not.toContain('-->');
        expect(html).toContain('<link rel="stylesheet" href="styles-ABC.css">');
        expect(html).toContain('<script src="main.js" type="module"></script>');
    });
});

describe('BuildPublicPageHtml with inline scripts in other forms', () => {
    const page = (script: string): string => `<html><head><title>T</title>${script}</head><body><script src="main.js" type="module"></script></body></html>`;

    it('reads an end tag with a space, as a browser does', () => {
        const html = BuildPublicPageHtml(page('<script>var a = 1;</script ><script>var b = 2;</script>'), PRICING);
        expect(policyOf(html)).toContain(`script-src 'self' ${scriptHash('var a = 1;')} ${scriptHash('var b = 2;')};`);
    });

    it('hashes the text with the line ends that a browser reads', () => {
        const html = BuildPublicPageHtml(page('<script>var a = 1;\r\nvar b = 2;</script>'), PRICING);
        expect(policyOf(html)).toContain(scriptHash('var a = 1;\nvar b = 2;'));
    });
});

describe('BuildPublicFallbackHtml', () => {
    const html = BuildPublicFallbackHtml(BUILT_INDEX_HTML);

    it('has the same policy as a page file, and no map library tags', () => {
        expect(policyOf(html)).toContain(`script-src 'self' ${scriptHash(THEME_SCRIPT)} ${scriptHash(BRAND_SCRIPT)};`);
        expect(html).not.toContain('unpkg.com');
        expect(html).not.toContain('onload=');
    });

    it('tells search engines not to index it, and keeps the default title', () => {
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).not.toContain('index, follow');
        expect(html).toContain('<title>MemberJunction Explorer</title>');
        expect(html).not.toContain('og:');
    });
});

const ERROR_PAGE: OpenAppPublicPageEntry = { AppName: 'acme-app', Role: 'error', Scope: 'pricing', PackageName: '@acme/app-public', ExportName: 'NotFoundPage', Enabled: true };

describe('error pages', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mj-public-page-html-'));
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('get no HTML file', () => {
        expect(WritePublicPageHtmlFiles(dir, [PRICING, ERROR_PAGE, { ...ERROR_PAGE, Scope: '' }])).toBe(1);
        expect(existsSync(join(dir, 'public-pages', '.html'))).toBe(false);
    });

    it('get no route', () => {
        expect(ApplyPublicPageRoutes([], [PRICING, ERROR_PAGE]).map((r) => r.route)).toEqual(['/p/pricing', '/p/pricing/*', '/p/*']);
    });
});

describe('WritePublicPageHtmlFiles', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mj-public-page-html-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('writes public-pages/<slug>.html for each enabled page and skips disabled pages', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        const written = WritePublicPageHtmlFiles(dir, [PRICING, { ...PRICING, Slug: 'old', Enabled: false }]);
        expect(written).toBe(1);
        expect(readFileSync(join(dir, 'public-pages', 'pricing.html'), 'utf-8')).toContain('<title>Pricing</title>');
        expect(existsSync(join(dir, 'public-pages', 'old.html'))).toBe(false);
    });

    it('writes public-pages/_fallback.html, also when there is no page', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        expect(WritePublicPageHtmlFiles(dir, [])).toBe(0);
        const fallback = readFileSync(join(dir, 'public-pages', '_fallback.html'), 'utf-8');
        expect(fallback).toContain('http-equiv="Content-Security-Policy"');
        expect(fallback).toContain('<meta name="robots" content="noindex">');
    });

    it('fails on a slug that is not lowercase kebab-case, and writes nothing outside public-pages/', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        expect(() => WritePublicPageHtmlFiles(dir, [{ ...PRICING, Slug: '../escape' }])).toThrow(/\.\.\/escape/);
        expect(existsSync(join(dir, 'escape.html'))).toBe(false);
    });

    it('fails when the folder has no index.html', () => {
        expect(() => WritePublicPageHtmlFiles(dir, [PRICING])).toThrow(/index\.html/);
    });
});

describe('ApplyPublicPageRoutes', () => {
    const OTHER_ROUTE: StaticWebAppRoute = { route: '/admin/*', allowedRoles: ['authenticated'] };

    it('puts a rewrite for each enabled page, then the fallback for other page addresses, before the other routes', () => {
        const routes = ApplyPublicPageRoutes([OTHER_ROUTE], [PRICING, { ...PRICING, Slug: 'old', Enabled: false }]);
        expect(routes).toEqual([
            { route: '/p/pricing', rewrite: '/public-pages/pricing.html' },
            { route: '/p/pricing/*', rewrite: '/public-pages/pricing.html' },
            { route: '/p/*', rewrite: '/public-pages/_fallback.html' },
            OTHER_ROUTE,
        ]);
    });

    it('replaces page routes from an earlier run', () => {
        const earlier = ApplyPublicPageRoutes([OTHER_ROUTE], [{ ...PRICING, Slug: 'gone' }]);
        const routes = ApplyPublicPageRoutes(earlier, [PRICING]);
        expect(routes.map((r) => r.route)).toEqual(['/p/pricing', '/p/pricing/*', '/p/*', '/admin/*']);
    });
});

describe('WriteStaticWebAppRoutes', () => {
    let site: string;

    beforeEach(() => {
        site = mkdtempSync(join(tmpdir(), 'mj-public-page-swa-'));
    });

    afterEach(() => {
        rmSync(site, { recursive: true, force: true });
    });

    it('adds the page routes to staticwebapp.config.json in the site folder, and keeps the other settings', () => {
        const configPath = join(site, 'staticwebapp.config.json');
        writeFileSync(configPath, JSON.stringify({ navigationFallback: { rewrite: 'index.html' } }));

        expect(WriteStaticWebAppRoutes(site, [PRICING])).toBe(true);

        const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { routes: StaticWebAppRoute[]; navigationFallback: { rewrite: string } };
        expect(config.routes).toEqual([
            { route: '/p/pricing', rewrite: '/public-pages/pricing.html' },
            { route: '/p/pricing/*', rewrite: '/public-pages/pricing.html' },
            { route: '/p/*', rewrite: '/public-pages/_fallback.html' },
        ]);
        expect(config.navigationFallback).toEqual({ rewrite: 'index.html' });
    });

    it('leaves the file as it is on a second run', () => {
        const configPath = join(site, 'staticwebapp.config.json');
        writeFileSync(configPath, JSON.stringify({ navigationFallback: { rewrite: 'index.html' } }));
        expect(WriteStaticWebAppRoutes(site, [PRICING])).toBe(true);
        const text = readFileSync(configPath, 'utf-8');

        expect(WriteStaticWebAppRoutes(site, [PRICING])).toBe(false);
        expect(readFileSync(configPath, 'utf-8')).toBe(text);
    });

    it('returns false when the site folder has no staticwebapp.config.json', () => {
        expect(WriteStaticWebAppRoutes(site, [PRICING])).toBe(false);
    });
});
