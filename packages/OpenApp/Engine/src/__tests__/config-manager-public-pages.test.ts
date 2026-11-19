/**
 * Tests for the top-level `publicPages` array in mj.config.cjs: install adds an app's pages,
 * a slug owned by another app fails the install, and the remove / prune / toggle helpers
 * keyed by AppName also act on `publicPages`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInNewContext } from 'node:vm';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    AddPublicPages,
    CheckPublicPageSlugConflicts,
    RemoveServerDynamicPackages,
    PruneDynamicPackagesNotInManifest,
    ToggleServerDynamicPackages,
} from '../install/config-manager.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';

interface PublicPageConfigEntry {
    AppName: string;
    Slug?: string;
    Role?: 'error';
    Scope?: string;
    PackageName: string;
    ExportName: string;
    Title?: string;
    Description?: string;
    SubPaths?: boolean;
    Enabled: boolean;
}

interface ManifestPageInput { slug: string; export: string; package?: string; title?: string; description?: string; subPaths?: boolean }
interface ManifestErrorInput { scope: string; export: string }

function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    return mockedWriteFileSync.mock.calls[0][1] as string;
}

/** Evaluates written config text and returns its `publicPages` array. */
function evaluatedPublicPages(content: string): PublicPageConfigEntry[] {
    const sandbox: { module: { exports: { publicPages?: PublicPageConfigEntry[] } } } = { module: { exports: {} } };
    runInNewContext(content, sandbox);
    return sandbox.module.exports.publicPages ?? [];
}

function makeManifest(appName: string, pages: ManifestPageInput[], errorPages: ManifestErrorInput[] = []): MJAppManifest {
    return {
        name: appName,
        packages: { client: [{ name: '@acme/lumen-public', role: 'components' }] },
        publicPages: [
            ...pages.map((p) => ({ slug: p.slug, package: p.package ?? '@acme/lumen-public', export: p.export, title: p.title, description: p.description, subPaths: p.subPaths })),
            ...errorPages.map((e) => ({ role: 'error', scope: e.scope, package: '@acme/lumen-public', export: e.export })),
        ],
    } as MJAppManifest;
}

function configWithPages(entries: PublicPageConfigEntry[]): string {
    const body = entries.map((e) => [
        '    {',
        `      AppName: '${e.AppName}',`,
        ...(e.Role ? [`      Role: '${e.Role}',`, `      Scope: '${e.Scope}',`] : [`      Slug: '${e.Slug}',`]),
        `      PackageName: '${e.PackageName}',`,
        `      ExportName: '${e.ExportName}',`,
        ...(e.SubPaths ? ['      SubPaths: true,'] : []),
        `      Enabled: ${e.Enabled}`,
        '    },',
    ].join('\n')).join('\n');
    return ['module.exports = {', '  dbHost: "localhost",', '  publicPages: [', body, '  ],', '};'].join('\n');
}

const LUMEN: PublicPageConfigEntry = { AppName: 'acme-lumen', Slug: 'lumen', PackageName: '@acme/lumen-public', ExportName: 'LumenLandingPageComponent', Enabled: true };
const LUMEN_ERROR: PublicPageConfigEntry = { AppName: 'acme-lumen', Role: 'error', Scope: 'lumen/guides', PackageName: '@acme/lumen-public', ExportName: 'LumenNotFoundPage', Enabled: true };
const ROOT_ERROR: PublicPageConfigEntry = { ...LUMEN_ERROR, Scope: '', ExportName: 'NotFoundPage' };
const OTHER: PublicPageConfigEntry = { AppName: 'other-app', Slug: 'other', PackageName: '@other/public', ExportName: 'OtherPage', Enabled: true };

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AddPublicPages', () => {
    it('creates a top-level publicPages array holding the app\'s pages', () => {
        setupConfigFile(['module.exports = {', '  dbHost: "localhost",', '};'].join('\n'));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([LUMEN]);
    });

    it('appends to an existing array without touching other apps\' pages', () => {
        setupConfigFile(configWithPages([OTHER]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER, LUMEN]);
    });

    it('updates an existing page of the same app in place and keeps its Enabled state', () => {
        setupConfigFile(configWithPages([{ ...LUMEN, ExportName: 'OldPage', Enabled: false }]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...LUMEN, Enabled: false }]);
    });

    it('writes the page title and description for the link preview', () => {
        setupConfigFile(configWithPages([OTHER]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [
            { slug: 'lumen', export: 'LumenLandingPageComponent', title: 'Lumen', description: 'Lighting plans for every room.' },
        ]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER, { ...LUMEN, Title: 'Lumen', Description: 'Lighting plans for every room.' }]);
    });

    it('updates the title and description of an existing page, and removes a field the manifest drops', () => {
        const existing = configWithPages([LUMEN]).replace(
            `ExportName: '${LUMEN.ExportName}',`,
            `ExportName: '${LUMEN.ExportName}',\n      Title: 'Old title',\n      Description: "Old description",`,
        );
        setupConfigFile(existing);

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent', title: 'New title' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...LUMEN, Title: 'New title' }]);
    });

    it('writes a title with braces, quotes and slashes so the entry can still be removed', () => {
        const title = `Acme's {beta} "pricing" // compare /* plans */`;
        setupConfigFile(configWithPages([OTHER]));
        AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent', title }]));
        const withPage = writtenContent();
        expect(evaluatedPublicPages(withPage)).toEqual([OTHER, { ...LUMEN, Title: title }]);

        vi.resetAllMocks();
        setupConfigFile(withPage);
        const result = RemoveServerDynamicPackages(REPO_ROOT, 'acme-lumen');

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER]);
    });

    it('writes SubPaths for a page that answers the addresses under its slug', () => {
        setupConfigFile(['module.exports = {', '};'].join('\n'));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent', subPaths: true }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...LUMEN, SubPaths: true }]);
    });

    it('adds SubPaths to an existing page, and removes it when the manifest drops it', () => {
        setupConfigFile(configWithPages([LUMEN]));
        AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent', subPaths: true }]));
        const withSubPaths = writtenContent();
        expect(evaluatedPublicPages(withSubPaths)).toEqual([{ ...LUMEN, SubPaths: true }]);

        vi.resetAllMocks();
        setupConfigFile(withSubPaths);
        AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));
        expect(evaluatedPublicPages(writtenContent())).toEqual([LUMEN]);
    });

    it('writes error pages with their role and scope, and no slug', () => {
        setupConfigFile(configWithPages([OTHER]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen',
            [{ slug: 'lumen', export: 'LumenLandingPageComponent' }],
            [{ scope: 'lumen/guides', export: 'LumenNotFoundPage' }, { scope: '', export: 'NotFoundPage' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER, LUMEN, LUMEN_ERROR, ROOT_ERROR]);
    });

    it('updates an existing error page of the same scope in place and keeps its Enabled state', () => {
        setupConfigFile(configWithPages([LUMEN, { ...LUMEN_ERROR, ExportName: 'OldNotFound', Enabled: false }, ROOT_ERROR]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen',
            [{ slug: 'lumen', export: 'LumenLandingPageComponent' }],
            [{ scope: 'lumen/guides', export: 'LumenNotFoundPage' }, { scope: '', export: 'NotFoundPage' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([LUMEN, { ...LUMEN_ERROR, Enabled: false }, ROOT_ERROR]);
    });

    it('lets two apps each have a root error page', () => {
        setupConfigFile(configWithPages([{ ...ROOT_ERROR, AppName: 'other-app' }]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }], [{ scope: '', export: 'NotFoundPage' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...ROOT_ERROR, AppName: 'other-app' }, LUMEN, ROOT_ERROR]);
    });

    it('fails, naming both apps, when another app owns the slug', () => {
        setupConfigFile(configWithPages([{ ...OTHER, Slug: 'lumen' }]));

        const result = AddPublicPages(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('acme-lumen');
        expect(result.ErrorMessage).toContain('other-app');
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });
});

describe('CheckPublicPageSlugConflicts', () => {
    it('fails, naming both apps and the slug, when another app owns a slug', () => {
        setupConfigFile(configWithPages([{ ...OTHER, Slug: 'lumen' }]));

        const result = CheckPublicPageSlugConflicts(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain("'lumen'");
        expect(result.ErrorMessage).toContain('acme-lumen');
        expect(result.ErrorMessage).toContain('other-app');
    });

    it('passes when the slug is owned by the same app', () => {
        setupConfigFile(configWithPages([LUMEN]));

        const result = CheckPublicPageSlugConflicts(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success).toBe(true);
    });
});

describe('RemoveServerDynamicPackages', () => {
    it('removes the app\'s public pages and keeps other apps\' pages', () => {
        setupConfigFile(configWithPages([LUMEN, OTHER]));

        const result = RemoveServerDynamicPackages(REPO_ROOT, 'acme-lumen');

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER]);
    });
});

describe('RemoveServerDynamicPackages with error pages', () => {
    it('removes the app\'s error pages with its pages', () => {
        setupConfigFile(configWithPages([LUMEN, LUMEN_ERROR, ROOT_ERROR, OTHER]));

        const result = RemoveServerDynamicPackages(REPO_ROOT, 'acme-lumen');

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([OTHER]);
    });
});

describe('PruneDynamicPackagesNotInManifest', () => {
    it('removes the app\'s error pages whose scope the manifest no longer declares', () => {
        setupConfigFile(configWithPages([LUMEN, LUMEN_ERROR, ROOT_ERROR, { ...ROOT_ERROR, AppName: 'other-app' }]));

        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }], [{ scope: '', export: 'NotFoundPage' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([LUMEN, ROOT_ERROR, { ...ROOT_ERROR, AppName: 'other-app' }]);
    });

    it('removes the app\'s pages whose slug the manifest no longer declares', () => {
        const dropped = { ...LUMEN, Slug: 'lumen-old' };
        setupConfigFile(configWithPages([{ ...LUMEN, Enabled: false }, dropped, OTHER]));

        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, makeManifest('acme-lumen', [{ slug: 'lumen', export: 'LumenLandingPageComponent' }]));

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...LUMEN, Enabled: false }, OTHER]);
    });
});

describe('ToggleServerDynamicPackages', () => {
    it('sets Enabled on the app\'s public pages only', () => {
        setupConfigFile(configWithPages([LUMEN, OTHER]));

        const result = ToggleServerDynamicPackages(REPO_ROOT, 'acme-lumen', false);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(evaluatedPublicPages(writtenContent())).toEqual([{ ...LUMEN, Enabled: false }, OTHER]);
    });
});
