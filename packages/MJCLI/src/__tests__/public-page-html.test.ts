/**
 * Tests for `mj codegen public-page-html`: one HTML file per public page, with the page title and
 * link preview tags, and the Azure Static Web Apps routes that serve those files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    ApplyPublicPageRoutes,
    BuildPublicPageHtml,
    WritePublicPageHtmlFiles,
    WriteStaticWebAppRoutes,
    type StaticWebAppRoute,
} from '../commands/codegen/public-page-html.js';
import type { OpenAppPublicPageEntry } from '../commands/codegen/manifest.js';
import { PublicPageEntrySchema } from '../config.js';

const INDEX_HTML = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>MemberJunction</title>',
    '  <base href="/" />',
    '<link rel="stylesheet" href="/public-host/styles-AAA.css"></head>',
    '<body>',
    '<script src="/public-host/main-BBB.js" type="module"></script></body>',
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
        expect(html).not.toContain('<title>MemberJunction</title>');
        expect(html).toContain('<meta name="description" content="Plans for every team.">');
        expect(html).toContain('<meta property="og:title" content="Pricing">');
        expect(html).toContain('<meta property="og:description" content="Plans for every team.">');
        expect(html).toContain('<meta property="og:type" content="website">');
        expect(html).toContain('<meta name="twitter:card" content="summary">');
    });

    it('keeps the scripts and styles of the public build', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, PRICING);
        expect(html).toContain('<script src="/public-host/main-BBB.js" type="module"></script>');
        expect(html).toContain('<link rel="stylesheet" href="/public-host/styles-AAA.css">');
    });

    it('escapes HTML in the title and description', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, { ...PRICING, Title: 'A & B <script>', Description: 'Say "hi" & \'bye\'' });
        expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>');
        expect(html).toContain('<meta name="description" content="Say &quot;hi&quot; &amp; &#39;bye&#39;">');
        expect(html).not.toContain('<script>');
    });

    it('keeps the default title when the page has only a description', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, { ...PRICING, Title: undefined });
        expect(html).toContain('<title>MemberJunction</title>');
        expect(html).toContain('<meta name="description" content="Plans for every team.">');
        expect(html).not.toContain('og:title');
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

    it('writes pages/<slug>.html for each enabled page and skips disabled pages', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        const written = WritePublicPageHtmlFiles(dir, [PRICING, { ...PRICING, Slug: 'old', Enabled: false }]);
        expect(written).toBe(1);
        expect(readFileSync(join(dir, 'pages', 'pricing.html'), 'utf-8')).toContain('<title>Pricing</title>');
        expect(existsSync(join(dir, 'pages', 'old.html'))).toBe(false);
    });

    it('fails on a slug that is not lowercase kebab-case, and writes nothing outside pages/', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        expect(() => WritePublicPageHtmlFiles(dir, [{ ...PRICING, Slug: '../escape' }])).toThrow(/\.\.\/escape/);
        expect(existsSync(join(dir, 'escape.html'))).toBe(false);
    });

    it('fails when the folder has no index.html', () => {
        expect(() => WritePublicPageHtmlFiles(dir, [PRICING])).toThrow(/index\.html/);
    });
});

describe('ApplyPublicPageRoutes', () => {
    const GENERIC: StaticWebAppRoute = { route: '/p/*', rewrite: '/public-host/index.html' };

    it('puts a rewrite for each enabled page before the other routes', () => {
        const routes = ApplyPublicPageRoutes([GENERIC], [PRICING, { ...PRICING, Slug: 'old', Enabled: false }], '/public-host/pages');
        expect(routes).toEqual([
            { route: '/p/pricing', rewrite: '/public-host/pages/pricing.html' },
            { route: '/p/pricing/*', rewrite: '/public-host/pages/pricing.html' },
            GENERIC,
        ]);
    });

    it('replaces page routes from an earlier run', () => {
        const earlier = ApplyPublicPageRoutes([GENERIC], [{ ...PRICING, Slug: 'gone' }], '/public-host/pages');
        const routes = ApplyPublicPageRoutes(earlier, [PRICING], '/public-host/pages');
        expect(routes.map((r) => r.route)).toEqual(['/p/pricing', '/p/pricing/*', '/p/*']);
    });
});

describe('WriteStaticWebAppRoutes', () => {
    let site: string;

    beforeEach(() => {
        site = mkdtempSync(join(tmpdir(), 'mj-public-page-swa-'));
        mkdirSync(join(site, 'public-host'));
    });

    afterEach(() => {
        rmSync(site, { recursive: true, force: true });
    });

    it('adds the page routes with the public build folder as the URL path, and keeps the other settings', () => {
        const configPath = join(site, 'staticwebapp.config.json');
        writeFileSync(configPath, JSON.stringify({
            routes: [{ route: '/p/*', rewrite: '/public-host/index.html' }],
            navigationFallback: { rewrite: 'index.html' },
        }));

        expect(WriteStaticWebAppRoutes(configPath, join(site, 'public-host'), [PRICING])).toBe(true);

        const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { routes: StaticWebAppRoute[]; navigationFallback: { rewrite: string } };
        expect(config.routes[0]).toEqual({ route: '/p/pricing', rewrite: '/public-host/pages/pricing.html' });
        expect(config.routes[2]).toEqual({ route: '/p/*', rewrite: '/public-host/index.html' });
        expect(config.navigationFallback).toEqual({ rewrite: 'index.html' });
    });

    it('fails when the public build folder is outside the site folder', () => {
        const configPath = join(site, 'staticwebapp.config.json');
        writeFileSync(configPath, '{}');
        expect(() => WriteStaticWebAppRoutes(configPath, tmpdir(), [PRICING])).toThrow();
    });
});
