/**
 * Tests for the public pages file that `mj codegen manifest --open-app-client-bootstrap` writes
 * beside the class manifest.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuildPublicPagesFile, FindOutdatedHostMain, PublicPagesFilePath, WritePublicPagesFile, type OpenAppPublicPageEntry } from '../commands/codegen/manifest.js';

const HEADER = [
    '/**',
    ' * Public pages from installed Open Apps.',
    ' * Written by `mj codegen manifest --open-app-client-bootstrap`. Do not edit.',
    ' */',
    '',
].join('\n');

const LUMEN: OpenAppPublicPageEntry = {
    AppName: 'acme-lumen',
    Slug: 'lumen',
    PackageName: '@acme/lumen-public',
    ExportName: 'LumenLandingPageComponent',
    Enabled: true,
};

describe('BuildPublicPagesFile', () => {
    it('writes one lazy-loaded element per enabled page', () => {
        expect(BuildPublicPagesFile([LUMEN])).toBe(HEADER + [
            'export const PUBLIC_PAGES = [',
            "    { Slug: 'lumen', AppName: 'acme-lumen', Load: () => import('@acme/lumen-public').then((m) => m.LumenLandingPageComponent) },",
            '] as const;',
            '',
        ].join('\n'));
    });

    it('writes an empty list when there are no pages', () => {
        expect(BuildPublicPagesFile([])).toBe(HEADER + 'export const PUBLIC_PAGES = [] as const;\n');
    });

    it('writes a disabled page as a comment line in place of its element', () => {
        const other: OpenAppPublicPageEntry = { AppName: 'other-app', Slug: 'other', PackageName: '@other/public', ExportName: 'OtherPage', Enabled: true };
        expect(BuildPublicPagesFile([{ ...LUMEN, Enabled: false }, other])).toBe(HEADER + [
            'export const PUBLIC_PAGES = [',
            "    // 'lumen' from 'acme-lumen' disabled by `mj app disable`",
            "    { Slug: 'other', AppName: 'other-app', Load: () => import('@other/public').then((m) => m.OtherPage) },",
            '] as const;',
            '',
        ].join('\n'));
    });

    it('marks a page that answers the addresses under its slug', () => {
        expect(BuildPublicPagesFile([{ ...LUMEN, SubPaths: true }])).toContain(
            "    { Slug: 'lumen', AppName: 'acme-lumen', SubPaths: true, Load: () => import('@acme/lumen-public').then((m) => m.LumenLandingPageComponent) },");
    });

    it('writes an error page with its role and scope, and no slug', () => {
        const errorPage: OpenAppPublicPageEntry = { AppName: 'acme-lumen', Role: 'error', Scope: 'lumen/guides', PackageName: '@acme/lumen-public', ExportName: 'LumenNotFoundPage', Enabled: true };
        const output = BuildPublicPagesFile([LUMEN, errorPage, { ...errorPage, Scope: '' }]);
        expect(output).toContain("    { Role: 'error', Scope: 'lumen/guides', AppName: 'acme-lumen', Load: () => import('@acme/lumen-public').then((m) => m.LumenNotFoundPage) },");
        expect(output).toContain("    { Role: 'error', Scope: '', AppName: 'acme-lumen', Load:");
    });

    it('writes a disabled error page as a comment line', () => {
        const errorPage: OpenAppPublicPageEntry = { AppName: 'acme-lumen', Role: 'error', Scope: 'lumen', PackageName: '@acme/lumen-public', ExportName: 'LumenNotFoundPage', Enabled: false };
        expect(BuildPublicPagesFile([errorPage])).toContain("    // error page 'lumen' from 'acme-lumen' disabled by `mj app disable`");
    });

    it('escapes single quotes and backslashes in string values', () => {
        const output = BuildPublicPagesFile([{ ...LUMEN, AppName: "it's", Slug: 'a\\b' }]);
        expect(output).toContain("{ Slug: 'a\\\\b', AppName: 'it\\'s', Load:");
    });
});

describe('WritePublicPagesFile', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mj-public-pages-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('creates the file and its folder when missing', () => {
        const filePath = join(dir, 'generated', 'public-pages.generated.ts');

        expect(WritePublicPagesFile(filePath, [LUMEN])).toBe(true);
        expect(readFileSync(filePath, 'utf-8')).toBe(BuildPublicPagesFile([LUMEN]));
    });

    it('leaves the file untouched when its content is unchanged', () => {
        const filePath = join(dir, 'public-pages.generated.ts');
        writeFileSync(filePath, BuildPublicPagesFile([LUMEN]), 'utf-8');
        const before = statSync(filePath).mtimeMs;

        expect(WritePublicPagesFile(filePath, [LUMEN])).toBe(false);
        expect(statSync(filePath).mtimeMs).toBe(before);
    });
});

describe('PublicPagesFilePath', () => {
    it('is public-pages.generated.ts beside the class manifest', () => {
        expect(PublicPagesFilePath('/host/src/app/generated/class-registrations-manifest.ts')).toBe('/host/src/app/generated/public-pages.generated.ts');
    });
});

describe('FindOutdatedHostMain', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'mj-host-main-'));
        mkdirSync(join(dir, 'src'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('gives the path of a main.ts that does not call StartExplorer()', () => {
        writeFileSync(join(dir, 'src', 'main.ts'), 'platformBrowser().bootstrapModule(AppModule);');
        expect(FindOutdatedHostMain(dir)).toBe(join(dir, 'src', 'main.ts'));
    });

    it('gives null for a main.ts that calls StartExplorer(), and for a folder with no main.ts', () => {
        expect(FindOutdatedHostMain(dir)).toBeNull();
        writeFileSync(join(dir, 'src', 'main.ts'), "import { StartExplorer } from '@memberjunction/ng-explorer-app/bootstrap';\nStartExplorer({});");
        expect(FindOutdatedHostMain(dir)).toBeNull();
    });
});
