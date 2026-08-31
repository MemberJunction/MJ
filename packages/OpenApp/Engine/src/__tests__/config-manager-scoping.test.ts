/**
 * Tests for two config-manager defects that both fail SILENTLY — the app installs, `__mj.OpenApp`
 * reports Active, and nothing in the logs is red, but the config the runtime actually loads is wrong:
 *
 *  1. **Cross-array idempotency.** A `shared` package is written to BOTH `dynamicPackages.server`
 *     and `dynamicPackages.client`. The "already present?" check matched the WHOLE file, so the
 *     server entry written moments earlier satisfied the client check and the client insert was
 *     skipped. The package never reached `dynamicPackages.client`, so its `@RegisterClass`
 *     components were tree-shaken out of the browser bundle with no error anywhere.
 *
 *  2. **Add-only upgrades.** The `Add*` writers are additive and idempotent — correct for install,
 *     but on upgrade they never remove what the new manifest dropped, so `mj.config.cjs` converges
 *     on the union of every version ever installed. A package deleted in v2 keeps being bootstrapped
 *     until it fails to resolve at startup.
 *
 * Validity of every written config is asserted by compiling it with `new Function(src)` — the same
 * guard `config-manager-dynamic.test.ts` uses (throws SyntaxError at construction without executing
 * the body, so `process.env` / `require` references are harmless).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    AddServerDynamicPackages,
    AddClientDynamicPackages,
    PruneDynamicPackagesNotInManifest,
    ToggleServerDynamicPackages,
} from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';
const ROOT_CONFIG = resolve(REPO_ROOT, 'mj.config.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────

function setupConfigFile(content: string): void {
    mockedExistsSync.mockImplementation((p: unknown) => String(p) === ROOT_CONFIG);
    mockedReadFileSync.mockReturnValue(content);
}

function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const calls = mockedWriteFileSync.mock.calls;
    return calls[calls.length - 1][1] as string;
}

function assertValidConfig(src: string): void {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(src)).not.toThrow();
}

function bareConfig(): string {
    return ['module.exports = {', "  coreSchema: '__mj',", '};', ''].join('\n');
}

/**
 * Returns the body of one `dynamicPackages` array so an assertion can distinguish
 * "present in the file somewhere" from "present in THIS array" — the exact distinction
 * defect #1 collapsed.
 */
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

/** A manifest whose ONE package is `shared` — so it must land in both arrays. */
function sharedManifest(appName = 'mj-bizapps-common', pkg = '@mj-biz-apps/common-shared') {
    return {
        name: appName,
        packages: {
            shared: [{ name: pkg, role: 'bootstrap', startupExport: 'LoadShared' }],
        },
    } as unknown as Parameters<typeof AddServerDynamicPackages>[1];
}

/** Multi-package manifest: one server-only, one shared. */
function twoPackageManifest(appName = 'mj-bizapps-common') {
    return {
        name: appName,
        packages: {
            server: [{ name: '@mj-biz-apps/common-server', role: 'bootstrap', startupExport: 'LoadServer' }],
            shared: [{ name: '@mj-biz-apps/common-shared', role: 'bootstrap', startupExport: 'LoadShared' }],
        },
    } as unknown as Parameters<typeof AddServerDynamicPackages>[1];
}

beforeEach(() => {
    vi.resetAllMocks();
});

// ── Defect 1: idempotency must be scoped to the target array ─────────────

describe('AddClientDynamicPackages — idempotency scoped to the target array', () => {
    it('adds a shared package to client even when the SAME entry already exists in server', () => {
        // Sequence a real install performs: HandleServerConfig first, then the client step.
        setupConfigFile(bareConfig());
        const server = AddServerDynamicPackages(REPO_ROOT, sharedManifest());
        expect(server.Success).toBe(true);
        const afterServer = writtenContent();
        expect(arrayBody(afterServer, 'server')).toContain('@mj-biz-apps/common-shared');

        vi.resetAllMocks();
        setupConfigFile(afterServer);
        const client = AddClientDynamicPackages(REPO_ROOT, sharedManifest());

        expect(client.Success).toBe(true);
        const afterClient = writtenContent();
        assertValidConfig(afterClient);
        // The regression: a file-wide match saw the server entry and skipped this insert entirely.
        expect(arrayBody(afterClient, 'client')).toContain('@mj-biz-apps/common-shared');
        // and the server entry is still intact
        expect(arrayBody(afterClient, 'server')).toContain('@mj-biz-apps/common-shared');
    });

    it('is still idempotent WITHIN an array — re-running does not duplicate the entry', () => {
        setupConfigFile(bareConfig());
        AddClientDynamicPackages(REPO_ROOT, sharedManifest());
        const once = writtenContent();

        vi.resetAllMocks();
        setupConfigFile(once);
        const again = AddClientDynamicPackages(REPO_ROOT, sharedManifest());

        expect(again.Success).toBe(true);
        const twice = writtenContent();
        assertValidConfig(twice);
        const occurrences = arrayBody(twice, 'client').split('@mj-biz-apps/common-shared').length - 1;
        expect(occurrences).toBe(1);
    });

    it('scopes idempotency per app, not just per package name', () => {
        // Two apps may legitimately ship the same package name; each needs its own entry.
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, sharedManifest('app-one'));
        const first = writtenContent();

        vi.resetAllMocks();
        setupConfigFile(first);
        AddServerDynamicPackages(REPO_ROOT, sharedManifest('app-two'));
        const both = writtenContent();

        assertValidConfig(both);
        expect(both).toMatch(/AppName:\s*["']app-one["']/);
        expect(both).toMatch(/AppName:\s*["']app-two["']/);
    });
});

// ── Defect 2: upgrades must prune what the new manifest dropped ──────────

describe('PruneDynamicPackagesNotInManifest — upgrade no longer accumulates', () => {
    /** Installs the two-package v1 shape and returns the resulting config. */
    function installV1(): string {
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, twoPackageManifest());
        const afterServer = writtenContent();
        vi.resetAllMocks();
        setupConfigFile(afterServer);
        AddClientDynamicPackages(REPO_ROOT, twoPackageManifest());
        return writtenContent();
    }

    it('removes an entry the new manifest no longer declares', () => {
        const v1 = installV1();
        expect(arrayBody(v1, 'server')).toContain('@mj-biz-apps/common-server');

        // v2 dropped common-server and kept only the shared package.
        vi.resetAllMocks();
        setupConfigFile(v1);
        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, sharedManifest());

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(pruned).not.toContain('@mj-biz-apps/common-server');
        expect(arrayBody(pruned, 'server')).toContain('@mj-biz-apps/common-shared');
        expect(arrayBody(pruned, 'client')).toContain('@mj-biz-apps/common-shared');
    });

    it('never touches ANOTHER app\'s entries', () => {
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, twoPackageManifest('app-under-upgrade'));
        const step1 = writtenContent();
        vi.resetAllMocks();
        setupConfigFile(step1);
        AddServerDynamicPackages(REPO_ROOT, sharedManifest('innocent-bystander', '@other/pkg'));
        const step2 = writtenContent();

        vi.resetAllMocks();
        setupConfigFile(step2);
        // Upgrade app-under-upgrade to a manifest that declares NOTHING for server.
        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, {
            name: 'app-under-upgrade',
            packages: {},
        } as unknown as Parameters<typeof PruneDynamicPackagesNotInManifest>[1]);

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(pruned).not.toContain('@mj-biz-apps/common-server');
        expect(pruned).toContain('@other/pkg'); // the bystander survives
        expect(pruned).toMatch(/AppName:\s*["']innocent-bystander["']/);
    });

    it('preserves a surviving entry BYTE-IDENTICALLY so Enabled: false is not silently reset', () => {
        // A disabled app that gets upgraded must stay disabled. Prune-then-re-add would resurrect
        // it with the default Enabled: true, silently re-enabling an app the operator turned off.
        const v1 = installV1();
        vi.resetAllMocks();
        setupConfigFile(v1);
        const toggled = ToggleServerDynamicPackages(REPO_ROOT, 'mj-bizapps-common', false);
        expect(toggled.Success).toBe(true);
        const disabled = writtenContent();
        expect(disabled).toContain('Enabled: false');

        const survivingEntry = arrayBody(disabled, 'server')
            .split('{')
            .find((b) => b.includes('@mj-biz-apps/common-shared'));
        expect(survivingEntry).toBeDefined();

        vi.resetAllMocks();
        setupConfigFile(disabled);
        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, sharedManifest());

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(pruned).not.toContain('@mj-biz-apps/common-server');
        // the kept block is unchanged, including its Enabled flag
        expect(arrayBody(pruned, 'server')).toContain(survivingEntry!);
        expect(pruned).toContain('Enabled: false');
    });

    it('keeps a server-only package in server (keep-sets are per-array, not shared)', () => {
        // A naive single keep-set built from `shared` alone would prune the server-only package
        // out of `server`. The server keep-set must include server + shared.
        const v1 = installV1();
        vi.resetAllMocks();
        setupConfigFile(v1);

        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, twoPackageManifest());

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(arrayBody(pruned, 'server')).toContain('@mj-biz-apps/common-server');
        expect(arrayBody(pruned, 'server')).toContain('@mj-biz-apps/common-shared');
        // common-server is server-only, so it must NOT be in client
        expect(arrayBody(pruned, 'client')).not.toContain('@mj-biz-apps/common-server');
        expect(arrayBody(pruned, 'client')).toContain('@mj-biz-apps/common-shared');
    });

    it('is a no-op (still Success) when the manifest already matches the config', () => {
        const v1 = installV1();
        vi.resetAllMocks();
        setupConfigFile(v1);

        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, twoPackageManifest());

        expect(result.Success).toBe(true);
        assertValidConfig(writtenContent());
        expect(writtenContent()).toContain('@mj-biz-apps/common-server');
    });

    it('succeeds without writing when the config has no dynamicPackages section at all', () => {
        // A host that never installed an app has nothing to prune; this must not be an upgrade error.
        setupConfigFile(bareConfig());

        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, sharedManifest());

        expect(result.Success).toBe(true);
    });

    // ── Convergence is by entry, not just by package name ────────────────

    /** Same package name as sharedManifest(), but a different startup export. */
    function renamedExportManifest(startupExport: string) {
        return {
            name: 'mj-bizapps-common',
            packages: {
                shared: [{ name: '@mj-biz-apps/common-shared', role: 'bootstrap', startupExport }],
            },
        } as unknown as Parameters<typeof PruneDynamicPackagesNotInManifest>[1];
    }

    it('retargets a surviving entry when the new version RENAMED its startup export', () => {
        // Keeping by PackageName alone leaves the old export name in place forever: the block
        // survives byte-identical AND the follow-up Add is skipped by the (PackageName, AppName)
        // idempotency check. ServerBootstrap then reads mod['LoadShared'], gets undefined, skips
        // it because it is not a function, and still logs "(ran LoadShared)".
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, sharedManifest());
        const v1 = writtenContent();
        expect(v1).toContain('LoadShared');

        vi.resetAllMocks();
        setupConfigFile(v1);
        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, renamedExportManifest('LoadSharedV2'));

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(arrayBody(pruned, 'server')).toContain('LoadSharedV2');
        expect(arrayBody(pruned, 'server')).not.toContain('LoadShared,');
        expect(arrayBody(pruned, 'server')).not.toContain(`LoadShared"`);
        // the package itself is kept, not removed and re-added
        expect(arrayBody(pruned, 'server')).toContain('@mj-biz-apps/common-shared');
    });

    it('retargets WITHOUT resetting Enabled: false', () => {
        // The retarget must edit only the StartupExport value — an operator-disabled entry that is
        // removed and re-added comes back with the default Enabled: true.
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, sharedManifest());
        const v1 = writtenContent();
        vi.resetAllMocks();
        setupConfigFile(v1);
        ToggleServerDynamicPackages(REPO_ROOT, 'mj-bizapps-common', false);
        const disabled = writtenContent();
        expect(disabled).toContain('Enabled: false');

        vi.resetAllMocks();
        setupConfigFile(disabled);
        const result = PruneDynamicPackagesNotInManifest(REPO_ROOT, renamedExportManifest('LoadSharedV2'));

        expect(result.Success).toBe(true);
        const pruned = writtenContent();
        assertValidConfig(pruned);
        expect(arrayBody(pruned, 'server')).toContain('LoadSharedV2');
        expect(pruned).toContain('Enabled: false');
    });

    it('leaves another app\'s identically-named package on its own export', () => {
        setupConfigFile(bareConfig());
        AddServerDynamicPackages(REPO_ROOT, sharedManifest());
        const step1 = writtenContent();
        vi.resetAllMocks();
        setupConfigFile(step1);
        AddServerDynamicPackages(REPO_ROOT, sharedManifest('innocent-bystander'));
        const step2 = writtenContent();

        vi.resetAllMocks();
        setupConfigFile(step2);
        PruneDynamicPackagesNotInManifest(REPO_ROOT, renamedExportManifest('LoadSharedV2'));

        const pruned = writtenContent();
        assertValidConfig(pruned);
        // the bystander's entry still names the export IT declared
        const bystander = arrayBody(pruned, 'server')
            .split('{')
            .find((b) => b.includes('innocent-bystander'));
        expect(bystander).toBeDefined();
        expect(bystander).toContain('LoadShared');
        expect(bystander).not.toContain('LoadSharedV2');
    });
});
