/**
 * Tests for the public pages file written by `mj codegen manifest --public-pages`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuildPublicPagesFile, WritePublicPagesFile, type OpenAppPublicPageEntry } from '../commands/codegen/manifest.js';

const HEADER = [
    '/**',
    ' * Public pages from installed Open Apps.',
    ' * Written by `mj codegen manifest --public-pages`. Do not edit.',
    ' */',
    "import type { PublicPageEntry } from '@memberjunction/ng-public-host/bootstrap';",
    '',
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
            'export const PUBLIC_PAGES: PublicPageEntry[] = [',
            "    { Slug: 'lumen', AppName: 'acme-lumen', Load: () => import('@acme/lumen-public').then((m) => m.LumenLandingPageComponent) },",
            '];',
            '',
        ].join('\n'));
    });

    it('writes an empty list when there are no pages', () => {
        expect(BuildPublicPagesFile([])).toBe(HEADER + 'export const PUBLIC_PAGES: PublicPageEntry[] = [];\n');
    });

    it('writes a disabled page as a comment line in place of its element', () => {
        const other: OpenAppPublicPageEntry = { AppName: 'other-app', Slug: 'other', PackageName: '@other/public', ExportName: 'OtherPage', Enabled: true };
        expect(BuildPublicPagesFile([{ ...LUMEN, Enabled: false }, other])).toBe(HEADER + [
            'export const PUBLIC_PAGES: PublicPageEntry[] = [',
            "    // 'lumen' from 'acme-lumen' disabled by `mj app disable`",
            "    { Slug: 'other', AppName: 'other-app', Load: () => import('@other/public').then((m) => m.OtherPage) },",
            '];',
            '',
        ].join('\n'));
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
