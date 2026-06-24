/**
 * Orchestration-level tests for InstallApp's dependency handling.
 *
 * These exercise the "outer shell" — the control flow that resolves an app's
 * dependency graph and installs each member in the right order — while STUBBING
 * every heavy/external collaborator (GitHub fetch, schema DDL, Skyway migrations,
 * npm, config writes, DB records). The dependency resolver and manifest schema
 * are kept real, so this proves the orchestrator:
 *
 *   1. installs transitive dependencies before their dependents (topo order),
 *   2. installs each app exactly once even in a diamond graph, and
 *   3. detects a cross-repo cycle up front and performs NO install work.
 *
 * The de-dup assertion is the key proof of the `_skipDependencyResolution` flow:
 * since the stubs report nothing as installed, a regression that let dependency
 * installs re-resolve their own subtrees would install the shared dep multiple
 * times (and in the wrong order).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub every external collaborator the install path touches ──────────────
vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    // The orchestrator derives an optional in-repo subpath from the Source URL;
    // keep the real parser so single-app URLs resolve to `undefined` (root manifest).
    ParseGitHubUrl: (repoUrl: string) => {
        const m = repoUrl.match(/github\.com\/([^/?#]+)\/([^/?#]+)((?:\/[^?#]+)*)/);
        if (!m) return null;
        const sub = (m[3] ?? '').replace(/^\/+|\/+$/g, '');
        return { Owner: m[1], Repo: m[2].replace(/\.git$/, ''), Subpath: sub.length ? sub : undefined };
    },
}));
vi.mock('../install/schema-manager.js', () => ({
    CreateAppSchema: vi.fn(),
    DropAppSchema: vi.fn(),
    SchemaExists: vi.fn(),
    EscapeSqlString: (s: string) => s,
}));
vi.mock('../install/migration-runner.js', () => ({ RunAppMigrations: vi.fn() }));
vi.mock('../install/package-manager.js', () => ({
    AddAppPackages: vi.fn(),
    RemoveAppPackages: vi.fn(),
    RunPackageInstall: vi.fn(),
    BumpPrefixedDependencies: vi.fn(),
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(),
    RemoveServerDynamicPackages: vi.fn(),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
}));
vi.mock('../install/client-bootstrap-gen.js', () => ({ RegenerateClientBootstrap: vi.fn() }));
vi.mock('../install/history-recorder.js', () => ({
    RecordAppInstallation: vi.fn(),
    RecordInstallHistoryEntry: vi.fn(),
    RecordAppDependencies: vi.fn(),
    DeleteAppDependencies: vi.fn(),
    SetAppStatus: vi.fn(),
    FindInstalledApp: vi.fn(),
    FindDependentApps: vi.fn(),
    ListInstalledApps: vi.fn(),
    UpdateAppRecord: vi.fn(),
}));
vi.mock('@memberjunction/core', () => ({
    // Only CreateTransactionGroup is used on the install path.
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { InstallApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, DownloadMigrations } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstall, BumpPrefixedDependencies } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddEntityPackageMapping } from '../install/config-manager.js';
import {
    RecordAppInstallation,
    RecordInstallHistoryEntry,
    RecordAppDependencies,
    SetAppStatus,
    FindInstalledApp,
    ListInstalledApps,
} from '../install/history-recorder.js';

/** Records the name of each app as it reaches the "record installation" step. */
const installSequence: string[] = [];

/** Builds a valid mj-app.json string for a test app with the given dependencies. */
function manifestJSON(name: string, deps: Record<string, { version: string; repository: string }>): string {
    return JSON.stringify({
        manifestVersion: 1,
        name,
        displayName: name,
        description: `${name} test app description`,
        version: '1.0.0',
        publisher: { name: 'Test' },
        repository: `https://github.com/test/${name}`,
        mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: `test_${name.replace(/-/g, '_')}` },
        packages: {},
        dependencies: deps,
    });
}

function dep(name: string): { version: string; repository: string } {
    return { version: '^1.0.0', repository: `https://github.com/test/${name}` };
}

/** Wires the GitHub fetch stub to serve a fixed set of manifests by repo URL. */
function serveManifests(byRepoUrl: Record<string, string>): void {
    vi.mocked(FetchManifestFromGitHub).mockImplementation(async (repoUrl: string) => {
        const json = byRepoUrl[repoUrl];
        return json
            ? { Success: true, ManifestJSON: json }
            : { Success: false, ErrorMessage: `no manifest for ${repoUrl}` };
    });
}

// Minimal context — the stubbed collaborators ignore the provider/user objects,
// so a cast is sufficient for wiring (no real DB or GitHub is contacted).
const context = {
    ContextUser: {},
    DatabaseProvider: {},
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.37.0',
} as unknown as OrchestratorContext;

describe('InstallApp dependency orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;

        // Default happy-path stubs for every install step.
        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
        vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined); // nothing installed yet
        vi.mocked(ListInstalledApps).mockResolvedValue([]);

        // The marker: capture install order as each app is recorded.
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
            installSequence.push(manifest.name);
            return `id-${manifest.name}`;
        });
    });

    it('installs a diamond graph leaf-first, each app exactly once', async () => {
        // app-root -> app-a, app-b ;  app-a -> app-common ;  app-b -> app-common
        serveManifests({
            'https://github.com/test/app-root': manifestJSON('app-root', { 'app-a': dep('app-a'), 'app-b': dep('app-b') }),
            'https://github.com/test/app-a': manifestJSON('app-a', { 'app-common': dep('app-common') }),
            'https://github.com/test/app-b': manifestJSON('app-b', { 'app-common': dep('app-common') }),
            'https://github.com/test/app-common': manifestJSON('app-common', {}),
        });

        const result = await InstallApp({ Source: 'https://github.com/test/app-root' }, context);

        expect(result.Success).toBe(true);
        // common before both dependents; root last; common exactly once.
        expect(installSequence).toEqual(['app-common', 'app-a', 'app-b', 'app-root']);
        expect(installSequence.filter((n) => n === 'app-common').length).toBe(1);
    });

    it('installs a deep transitive chain in dependency order', async () => {
        // root -> a -> b -> c
        serveManifests({
            'https://github.com/test/app-root': manifestJSON('app-root', { 'app-a': dep('app-a') }),
            'https://github.com/test/app-a': manifestJSON('app-a', { 'app-b': dep('app-b') }),
            'https://github.com/test/app-b': manifestJSON('app-b', { 'app-c': dep('app-c') }),
            'https://github.com/test/app-c': manifestJSON('app-c', {}),
        });

        const result = await InstallApp({ Source: 'https://github.com/test/app-root' }, context);

        expect(result.Success).toBe(true);
        expect(installSequence).toEqual(['app-c', 'app-b', 'app-a', 'app-root']);
    });

    it('skips already-installed dependencies but still installs the rest in order', async () => {
        serveManifests({
            'https://github.com/test/app-root': manifestJSON('app-root', { 'app-a': dep('app-a'), 'app-common': dep('app-common') }),
            'https://github.com/test/app-a': manifestJSON('app-a', { 'app-common': dep('app-common') }),
            'https://github.com/test/app-common': manifestJSON('app-common', {}),
        });
        // app-common is already installed at a compatible version. The record must
        // carry ManifestJSON/Status because the client-bootstrap regen reads them.
        vi.mocked(ListInstalledApps).mockResolvedValue([
            {
                Name: 'app-common',
                Version: '1.0.0',
                RepositoryURL: 'https://github.com/test/app-common',
                Status: 'Active',
                ManifestJSON: manifestJSON('app-common', {}),
            },
        ] as unknown as Awaited<ReturnType<typeof ListInstalledApps>>);

        const result = await InstallApp({ Source: 'https://github.com/test/app-root' }, context);

        expect(result.Success).toBe(true);
        // app-common is NOT (re)installed; app-a then app-root are.
        expect(installSequence).not.toContain('app-common');
        expect(installSequence).toEqual(['app-a', 'app-root']);
    });

    it('forwards AllowDoubleUnderscoreSchema from the parent install to every dependency install', async () => {
        // Dependency uses a '__'-prefixed schema; flag must reach the dep's schema creation.
        serveManifests({
            'https://github.com/test/app-root': manifestJSON('app-root', { 'app-common': dep('app-common') }),
            'https://github.com/test/app-common': manifestJSON('app-common', {}),
        });

        const result = await InstallApp(
            { Source: 'https://github.com/test/app-root', AllowDoubleUnderscoreSchema: true },
            context,
        );

        expect(result.Success).toBe(true);
        // Every CreateAppSchema call (one per app installed) should carry allowDoubleUnderscore: true.
        const createCalls = vi.mocked(CreateAppSchema).mock.calls;
        expect(createCalls.length).toBe(2); // common + root
        for (const call of createCalls) {
            // Signature: (schemaName, dbProvider, { allowDoubleUnderscore })
            expect((call[2] as { allowDoubleUnderscore?: boolean }).allowDoubleUnderscore).toBe(true);
        }
    });

    it('detects a cross-repo cycle up front and performs no install work', async () => {
        // root -> a -> b -> a  (cycle)
        serveManifests({
            'https://github.com/test/app-root': manifestJSON('app-root', { 'app-a': dep('app-a') }),
            'https://github.com/test/app-a': manifestJSON('app-a', { 'app-b': dep('app-b') }),
            'https://github.com/test/app-b': manifestJSON('app-b', { 'app-a': dep('app-a') }),
        });

        const result = await InstallApp({ Source: 'https://github.com/test/app-root' }, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage?.toLowerCase()).toContain('circular');
        // Nothing was installed — failure happened during resolution, before side effects.
        expect(installSequence).toEqual([]);
        expect(vi.mocked(CreateAppSchema)).not.toHaveBeenCalled();
        expect(vi.mocked(RecordAppInstallation)).not.toHaveBeenCalled();
    });
});

describe('HandleMigrations — platform-aware dialect directory', () => {
    // A full Open App (schema + migrations) like the per-connector Integrations apps.
    const fullAppJSON = JSON.stringify({
        manifestVersion: 1, name: 'connector-hubspot', displayName: 'HubSpot Connector',
        description: 'HubSpot connector test app description', version: '1.0.0', publisher: { name: 'Test' },
        repository: 'https://github.com/MemberJunction/Integrations', mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: 'mj_connector_hubspot', createIfNotExists: true },
        migrations: { directory: 'migrations', engine: 'skyway' },
        packages: { server: [{ name: '@memberjunction/connector-hubspot', role: 'bootstrap', startupExport: 'registerConnector' }] },
    });
    const source = 'https://github.com/MemberJunction/Integrations/CRM/HubSpot';
    const ctxFor = (platformKey: string) =>
        ({ ...context, DatabaseProvider: { Dialect: { PlatformKey: platformKey } }, DatabaseConfig: {} } as unknown as OrchestratorContext);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true, MigrationsApplied: 1, AppliedFiles: ['V1__x.sql'] });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true } as never);
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true } as never);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined as never);
        vi.mocked(FindInstalledApp).mockResolvedValue(null);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockResolvedValue('id-hubspot');
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: fullAppJSON });
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, LocalPath: '/tmp/m', Files: ['V1__x.sql'] });
    });

    it('downloads migrations/ on SQL Server', async () => {
        const r = await InstallApp({ Source: source }, ctxFor('sqlserver'));
        expect(r.Success).toBe(true);
        expect(vi.mocked(DownloadMigrations)).toHaveBeenCalledWith(
            'https://github.com/MemberJunction/Integrations', '1.0.0', 'migrations', expect.any(String), expect.anything(), 'CRM/HubSpot',
        );
    });

    it('downloads migrations-pg/ on PostgreSQL', async () => {
        const r = await InstallApp({ Source: source }, ctxFor('postgresql'));
        expect(r.Success).toBe(true);
        expect(vi.mocked(DownloadMigrations)).toHaveBeenCalledWith(
            'https://github.com/MemberJunction/Integrations', '1.0.0', 'migrations-pg', expect.any(String), expect.anything(), 'CRM/HubSpot',
        );
    });
});
