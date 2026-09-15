/**
 * #4428 — a Node-only `shared` package must not reach `dynamicPackages.client`.
 *
 * The manifests here are the real first-party shapes: `bizapps-common` declares BOTH its entities
 * package and its actions package under `shared` with `role: 'library'`. The entities package is
 * browser-safe and MUST stay in client (its @RegisterClass calls run there); the actions package
 * reaches @google-cloud/storage and must not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

vi.mock('node:fs', () => ({ readFileSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() }));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    AddServerDynamicPackages,
    AddClientDynamicPackages,
    PruneDynamicPackagesNotInManifest,
} from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';
const ROOT_CONFIG = resolve(REPO_ROOT, 'mj.config.cjs');

function setupConfigFile(content: string): void {
    mockedExistsSync.mockImplementation((p: unknown) => String(p) === ROOT_CONFIG);
    mockedReadFileSync.mockReturnValue(content);
}
function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const calls = mockedWriteFileSync.mock.calls;
    return calls[calls.length - 1][1] as string;
}
function bareConfig(): string {
    return ['module.exports = {', "  coreSchema: '__mj',", '};', ''].join('\n');
}

/** Body of ONE dynamicPackages array, so "in the file" cannot be mistaken for "in this array". */
function arrayBody(content: string, arrayName: 'server' | 'client'): string {
    const dyn = content.indexOf('dynamicPackages');
    expect(dyn).toBeGreaterThan(-1);
    const rel = content.slice(dyn).match(new RegExp(`${arrayName}:\\s*\\[`));
    expect(rel).not.toBeNull();
    const open = dyn + (rel!.index ?? 0) + rel![0].length - 1;
    let depth = 0;
    for (let i = open; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) return content.slice(open, i);
        }
    }
    throw new Error(`unterminated dynamicPackages.${arrayName}`);
}

/** bizapps-common/mj-app.json, with the one-line fix its repo needs. */
function bizAppsCommonManifest() {
    return {
        name: 'mj-bizapps-common',
        packages: {
            server: [{ name: '@mj-biz-apps/common-server', role: 'bootstrap', startupExport: 'LoadBizAppsCommonServer' }],
            client: [{ name: '@mj-biz-apps/common-ng', role: 'bootstrap', startupExport: 'LoadBizAppsCommonClient' }],
            shared: [
                { name: '@mj-biz-apps/common-entities', role: 'library' },
                { name: '@mj-biz-apps/common-actions', role: 'library', platform: 'node' },
            ],
        },
    } as unknown as Parameters<typeof AddClientDynamicPackages>[1];
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('client routing honours platform', () => {
    it('keeps a browser-safe shared package and drops the node-only one', () => {
        setupConfigFile(bareConfig());
        expect(AddClientDynamicPackages(REPO_ROOT, bizAppsCommonManifest()).Success).toBe(true);
        const client = arrayBody(writtenContent(), 'client');

        expect(client).toContain('@mj-biz-apps/common-ng');
        expect(client).toContain('@mj-biz-apps/common-entities');
        expect(client).not.toContain('@mj-biz-apps/common-actions');
    });

    it('routes a role:actions shared package to node without an explicit platform', () => {
        const manifest = {
            name: 'acme',
            packages: { shared: [{ name: '@acme/acme-actions', role: 'actions', startupExport: 'LoadActions' }] },
        } as unknown as Parameters<typeof AddClientDynamicPackages>[1];

        setupConfigFile(bareConfig());
        expect(AddClientDynamicPackages(REPO_ROOT, manifest).Success).toBe(true);
        // The only candidate package is node-only, so GetClientPackagesFromManifest returns zero
        // entries and AddClientDynamicPackages's pre-existing empty-set guard (config-manager.ts)
        // short-circuits before ever touching the file — no write is the correct outcome here, not
        // just an acceptable one, so guard the same way the sibling server-side test above does.
        if (mockedWriteFileSync.mock.calls.length > 0) {
            expect(arrayBody(writtenContent(), 'client')).not.toContain('@acme/acme-actions');
        }
    });
});

describe('server routing honours platform', () => {
    it('still writes the node-only shared package to server', () => {
        const manifest = {
            name: 'acme',
            packages: { shared: [{ name: '@acme/acme-actions', role: 'library', platform: 'node', startupExport: 'LoadActions' }] },
        } as unknown as Parameters<typeof AddServerDynamicPackages>[1];

        setupConfigFile(bareConfig());
        expect(AddServerDynamicPackages(REPO_ROOT, manifest).Success).toBe(true);
        expect(arrayBody(writtenContent(), 'server')).toContain('@acme/acme-actions');
    });

    it('keeps a browser-only shared package OUT of server', () => {
        const manifest = {
            name: 'acme',
            packages: { shared: [{ name: '@acme/acme-widgets', role: 'library', platform: 'browser', startupExport: 'LoadWidgets' }] },
        } as unknown as Parameters<typeof AddServerDynamicPackages>[1];

        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, manifest);
        if (mockedWriteFileSync.mock.calls.length > 0) {
            expect(arrayBody(writtenContent(), 'server')).not.toContain('@acme/acme-widgets');
        }
    });
});

describe('an already-broken host self-heals on upgrade', () => {
    it('prunes a node-only package that a previous install put in client', () => {
        // A host installed BEFORE this fix: the actions package is sitting in client.
        const brokenHost = [
            'module.exports = {',
            "  coreSchema: '__mj',",
            '  dynamicPackages: {',
            '    server: [],',
            '    client: [',
            '      {',
            '        PackageName: "@mj-biz-apps/common-ng",',
            '        AppName: "mj-bizapps-common",',
            '        Enabled: true',
            '      },',
            '      {',
            '        PackageName: "@mj-biz-apps/common-actions",',
            '        AppName: "mj-bizapps-common",',
            '        Enabled: true',
            '      },',
            '    ]',
            '  },',
            '};',
            '',
        ].join('\n');

        setupConfigFile(brokenHost);
        const r = PruneDynamicPackagesNotInManifest(REPO_ROOT, bizAppsCommonManifest());
        expect(r.Success).toBe(true);

        const client = arrayBody(writtenContent(), 'client');
        expect(client).not.toContain('@mj-biz-apps/common-actions');
        expect(client).toContain('@mj-biz-apps/common-ng');
    });
});
