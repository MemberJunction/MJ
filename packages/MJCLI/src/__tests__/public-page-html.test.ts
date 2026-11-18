/**
 * Tests for `mj codegen public-page-html`: one HTML file per public page, with the page title and
 * link preview tags, and the Azure Static Web Apps routes that serve those files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
        expect(html).toContain('<meta name="description" content="Say &quot;hi&quot; &amp; &#39;bye&#39;">');
        expect(html).not.toContain('<script>');
    });

    it('keeps the default title when the page has only a description', () => {
        const html = BuildPublicPageHtml(INDEX_HTML, { ...PRICING, Title: undefined });
        expect(html).toContain('<title>MemberJunction Explorer</title>');
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

    it('writes public-pages/<slug>.html for each enabled page and skips disabled pages', () => {
        writeFileSync(join(dir, 'index.html'), INDEX_HTML);
        const written = WritePublicPageHtmlFiles(dir, [PRICING, { ...PRICING, Slug: 'old', Enabled: false }]);
        expect(written).toBe(1);
        expect(readFileSync(join(dir, 'public-pages', 'pricing.html'), 'utf-8')).toContain('<title>Pricing</title>');
        expect(existsSync(join(dir, 'public-pages', 'old.html'))).toBe(false);
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

    it('puts a rewrite for each enabled page before the other routes', () => {
        const routes = ApplyPublicPageRoutes([OTHER_ROUTE], [PRICING, { ...PRICING, Slug: 'old', Enabled: false }]);
        expect(routes).toEqual([
            { route: '/p/pricing', rewrite: '/public-pages/pricing.html' },
            { route: '/p/pricing/*', rewrite: '/public-pages/pricing.html' },
            OTHER_ROUTE,
        ]);
    });

    it('replaces page routes from an earlier run', () => {
        const earlier = ApplyPublicPageRoutes([OTHER_ROUTE], [{ ...PRICING, Slug: 'gone' }]);
        const routes = ApplyPublicPageRoutes(earlier, [PRICING]);
        expect(routes.map((r) => r.route)).toEqual(['/p/pricing', '/p/pricing/*', '/admin/*']);
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
        ]);
        expect(config.navigationFallback).toEqual({ rewrite: 'index.html' });
    });

    it('leaves the file as it is when there are no page routes', () => {
        const configPath = join(site, 'staticwebapp.config.json');
        const text = '{\n  "navigationFallback": { "rewrite": "index.html", "exclude": ["*.js"] }\n}\n';
        writeFileSync(configPath, text);

        expect(WriteStaticWebAppRoutes(site, [])).toBe(false);
        expect(readFileSync(configPath, 'utf-8')).toBe(text);
    });

    it('returns false when the site folder has no staticwebapp.config.json', () => {
        expect(WriteStaticWebAppRoutes(site, [PRICING])).toBe(false);
    });
});
