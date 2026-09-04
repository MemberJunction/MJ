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
import { existsSync } from 'node:fs';

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
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
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
    AddClientDynamicPackages: vi.fn(),
    RemoveServerDynamicPackages: vi.fn(),
    PruneDynamicPackagesNotInManifest: vi.fn(() => ({ Success: true })),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
    AddExcludeSchema: vi.fn(() => ({ Success: true })),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
}));
vi.mock('../install/history-recorder.js', () => ({
    RecordAppInstallation: vi.fn(),
    RecordInstallHistoryEntry: vi.fn(),
    RecordAppDependencies: vi.fn(),
    DeleteAppDependencies: vi.fn(),
    SetAppStatus: vi.fn(),
    SetAppStep: vi.fn(),
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

import { InstallApp, UpgradeApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion, ListGitHubReleases, ListGitHubTags, ValidateGitHubTag } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists, DropAppSchema } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstall, BumpPrefixedDependencies } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, ToggleServerDynamicPackages, AddEntityPackageMapping, PruneDynamicPackagesNotInManifest } from '../install/config-manager.js';
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
// CanonicalSchemaName is the one Dialect member HandleSchemaCreation calls directly.
const context = {
    ContextUser: {},
    DatabaseProvider: { Dialect: { CanonicalSchemaName: (s: string) => s } },
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
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined); // nothing installed yet
        vi.mocked(ListInstalledApps).mockResolvedValue([]);

        // Dependency version resolution (B26): deps declare '^1.0.0'; offer a satisfying tag,
        // and let the pinned-version tag validation pass so the dep install proceeds.
        vi.mocked(ListGitHubTags).mockResolvedValue(['1.0.0']);
        vi.mocked(ListGitHubReleases).mockResolvedValue([]);
        vi.mocked(ValidateGitHubTag).mockResolvedValue({ Exists: true });

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
        ({ ...context, DatabaseProvider: { Dialect: { PlatformKey: platformKey, CanonicalSchemaName: (s: string) => s } }, DatabaseConfig: {} } as unknown as OrchestratorContext);

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

    /** The temp dir the engine created for this install (4th arg of the download call). */
    function downloadedTempDir(): string {
        const call = vi.mocked(DownloadMigrations).mock.calls[0];
        return call[3] as string;
    }

    it('removes the migration temp directory after a successful install', async () => {
        const r = await InstallApp({ Source: source }, ctxFor('sqlserver'));
        expect(r.Success).toBe(true);
        // Without cleanup, every install/upgrade leaves a copy of the app's .sql files in the OS temp dir.
        expect(existsSync(downloadedTempDir())).toBe(false);
    });

    it('removes the migration temp directory even when the migration run fails', async () => {
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: false, ErrorMessage: 'V2 failed' });
        const r = await InstallApp({ Source: source }, ctxFor('sqlserver'));
        expect(r.Success).toBe(false);
        expect(existsSync(downloadedTempDir())).toBe(false);
    });
});

/**
 * Rollback of a FAILED install.
 *
 * Migrations apply per-migration, so a set that fails partway leaves earlier files
 * committed — the database will not undo them. The install's all-or-nothing guarantee
 * therefore has to be a compensating action, and it has to reach everything the install
 * wrote: the app's own schema AND the rows its migrations seeded into the SHARED core
 * schema, which dropping the app schema cannot reach.
 */
describe('InstallApp — compensation when migrations fail', () => {
    const withTeardown = JSON.stringify({
        manifestVersion: 1, name: 'connector-hubspot', displayName: 'HubSpot Connector',
        description: 'HubSpot connector test app description', version: '1.0.0', publisher: { name: 'Test' },
        repository: 'https://github.com/MemberJunction/Integrations', mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: 'mj_connector_hubspot', createIfNotExists: true },
        migrations: { directory: 'migrations', teardownDirectory: 'teardown', engine: 'skyway' },
        packages: {},
    });
    const noTeardown = JSON.stringify({
        manifestVersion: 1, name: 'connector-hubspot', displayName: 'HubSpot Connector',
        description: 'HubSpot connector test app description', version: '1.0.0', publisher: { name: 'Test' },
        repository: 'https://github.com/MemberJunction/Integrations', mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: 'mj_connector_hubspot', createIfNotExists: true },
        migrations: { directory: 'migrations', engine: 'skyway' },
        packages: {},
    });
    const source = 'https://github.com/MemberJunction/Integrations/CRM/HubSpot';
    const warnings: string[] = [];
    const ctx = () => ({
        ...context,
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s } },
        DatabaseConfig: {},
        Callbacks: { OnWarn: (_phase: string, message: string) => { warnings.push(message); } },
    } as unknown as OrchestratorContext);

    beforeEach(() => {
        vi.clearAllMocks();
        warnings.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(false);
        // The schema is created THIS run, which is what licenses tearing it down again.
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true, Created: true });
        vi.mocked(DropAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(FindInstalledApp).mockResolvedValue(null);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined as never);
        // No teardown scripts on disk — enough to prove the teardown path was entered
        // without needing real files.
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, LocalPath: '/tmp/m', Files: [] });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: false, ErrorMessage: 'deadlock victim (1205)' });
    });

    /** The teardown download is the observable signal that step 2 ran. */
    const teardownAttempted = () =>
        vi.mocked(DownloadMigrations).mock.calls.some((c) => c[2] === 'teardown');

    it('drops the schema it created when migrations fail', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: withTeardown });
        const r = await InstallApp({ Source: source }, ctx());
        expect(r.Success).toBe(false);
        expect(vi.mocked(DropAppSchema)).toHaveBeenCalledWith('mj_connector_hubspot', expect.anything(), expect.anything());
    });

    it("runs the app's teardown scripts, so rows seeded into the shared core schema do not orphan", async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: withTeardown });
        await InstallApp({ Source: source }, ctx());
        expect(teardownAttempted()).toBe(true);
    });

    it('still drops the schema even though the teardown step also ran (no step short-circuits another)', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: withTeardown });
        await InstallApp({ Source: source }, ctx());
        expect(teardownAttempted()).toBe(true);
        expect(vi.mocked(DropAppSchema)).toHaveBeenCalled();
    });

    it('warns instead of claiming a clean rollback when the app declares no teardownDirectory', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: noTeardown });
        await InstallApp({ Source: source }, ctx());
        expect(teardownAttempted()).toBe(false);
        expect(warnings.some((w) => w.includes('teardownDirectory') && w.includes('WILL remain'))).toBe(true);
        expect(vi.mocked(DropAppSchema)).toHaveBeenCalled();
    });

    // The second call site: every migration commits, then recording the installation fails.
    // Proven end-to-end on a real instance; pinned here so it cannot regress silently.
    it('compensates when recording the installation fails after migrations succeed', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: withTeardown });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true, MigrationsApplied: 7, AppliedFiles: [] });
        vi.mocked(RecordAppInstallation).mockRejectedValue(new Error('forced record failure'));

        const r = await InstallApp({ Source: source }, ctx());

        expect(r.Success).toBe(false);
        expect(teardownAttempted()).toBe(true);
        expect(vi.mocked(DropAppSchema)).toHaveBeenCalledWith('mj_connector_hubspot', expect.anything(), expect.anything());
    });

    it('warns that a reinstall may fail when an app has migrations but no teardownDirectory', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: noTeardown });
        await InstallApp({ Source: source }, ctx());
        const warning = warnings.find((w) => w.includes('teardownDirectory'));
        expect(warning).toBeDefined();
        expect(warning).toContain('WILL remain');
        expect(warning).toContain('primary-key violation');
    });

    it('does NOT tear down a schema it did not create (reused/adopted schema is left alone)', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: withTeardown });
        // An ALREADY-EXISTING schema adopted via createIfNotExists: HandleSchemaCreation returns
        // Created: false, so this run did not create it and must not tear it down — it may hold
        // data we did not put there.
        vi.mocked(SchemaExists).mockResolvedValue(true);
        const r = await InstallApp({ Source: source }, ctx());
        expect(r.Success).toBe(false);
        expect(vi.mocked(CreateAppSchema)).not.toHaveBeenCalled();
        expect(vi.mocked(DropAppSchema)).not.toHaveBeenCalled();
        expect(teardownAttempted()).toBe(false);
    });
});

/** A connector-profile manifest (no `schema` block — entities come from metadata, not DDL). */
function manifestJSONNoSchema(name: string): string {
    return JSON.stringify({
        manifestVersion: 1,
        name,
        displayName: name,
        description: `${name} test app description`,
        version: '1.0.0',
        publisher: { name: 'Test' },
        repository: `https://github.com/test/${name}`,
        mjVersionRange: '>=5.0.0 <6.0.0',
        packages: {},
        dependencies: {},
    });
}

describe('InstallApp — post-install summary (B16: schema-only shell needs CodeGen)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
        vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
            installSequence.push(manifest.name);
            return `id-${manifest.name}`;
        });
    });

    it('a schema-bearing app is told to run CodeGen (entities materialize out-of-band)', async () => {
        serveManifests({ 'https://github.com/test/schema-app': manifestJSON('schema-app', {}) });
        const result = await InstallApp({ Source: 'https://github.com/test/schema-app' }, context);
        expect(result.Success).toBe(true);
        // Pre-fix: a generic "restart + rebuild" summary omitted the one step (CodeGen) that
        // materializes the app's entity metadata, so 'Active' overstated readiness.
        expect(result.Summary?.toLowerCase()).toContain('codegen');
    });

    it('a connector-profile (no-schema) app is NOT told to run CodeGen', async () => {
        serveManifests({ 'https://github.com/test/conn-app': manifestJSONNoSchema('conn-app') });
        const result = await InstallApp({ Source: 'https://github.com/test/conn-app' }, context);
        expect(result.Success).toBe(true);
        // No schema → no entity DDL → CodeGen guidance would be misleading. Restart/rebuild only.
        expect(result.Summary?.toLowerCase()).not.toContain('codegen');
        expect(result.Summary?.toLowerCase()).toContain('restart');
    });
});

describe('InstallApp — reinstall over a prior install (B17: Error apps are reinstallable)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
        vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
            installSequence.push(manifest.name);
            return `id-${manifest.name}`;
        });
        serveManifests({ 'https://github.com/test/app-x': manifestJSON('app-x', {}) });
    });

    function existing(status: string) {
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'old-id',
            Name: 'app-x',
            Status: status,
            SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
    }

    it("reinstalls over a half-installed 'Error' app instead of dead-ending the user", async () => {
        existing('Error');
        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        // Pre-fix: only 'Removed' was reinstallable, so an Error app returned a failure
        // pointing at `mj app upgrade` (which can't recover a half-install). Now it reinstalls.
        expect(result.Success).toBe(true);
        expect(installSequence).toContain('app-x');
    });

    it("still reinstalls a previously 'Removed' app", async () => {
        existing('Removed');
        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        expect(result.Success).toBe(true);
        expect(installSequence).toContain('app-x');
    });

    it("refuses to reinstall an already-'Active' app (directs to upgrade)", async () => {
        existing('Active');
        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage?.toLowerCase()).toContain('already installed');
        expect(installSequence).toEqual([]);
    });
});

describe('InstallApp — npm-install failure disables the app AND its dynamicPackages (client-bootstrap build safety)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
        // npm install fails AFTER package.json was updated → app finalizes Disabled.
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: false, ErrorMessage: 'peer dep conflict' });
        vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(ToggleServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
            installSequence.push(manifest.name);
            return `id-${manifest.name}`;
        });
        serveManifests({ 'https://github.com/test/app-x': manifestJSON('app-x', {}) });
    });

    it('finalizes Disabled and flips dynamicPackages Enabled:false so the client manifest comments out (not imports) uninstalled packages', async () => {
        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        // Install still succeeds — it's installed-but-Disabled, not failed.
        expect(result.Success).toBe(true);
        // App finalized Disabled (npm couldn't resolve the deps).
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Disabled');
        // The app's dynamicPackages entries are flipped off (array-agnostic by AppName → both
        // server and client) so `mj codegen manifest --open-app-client-bootstrap` emits commented
        // imports — a static import of a not-yet-installed package would break the MJExplorer build.
        expect(vi.mocked(ToggleServerDynamicPackages)).toHaveBeenCalledWith(expect.anything(), 'app-x', false, undefined);
    });
});

describe('InstallApp — schema rollback tracks actual creation (B18)', () => {
    // B18's rollback fires when a migration fails AFTER schema handling. That path needs a
    // `migrations` block, a successful download, and a Dialect on the provider.
    function manifestWithMigrations(name: string): string {
        const base = JSON.parse(manifestJSON(name, {}));
        base.migrations = { directory: 'migrations' };
        return JSON.stringify(base);
    }
    const migContext = {
        ...context,
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s } },
    } as unknown as OrchestratorContext;

    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(DropAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
        vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
            installSequence.push(manifest.name);
            return `id-${manifest.name}`;
        });
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, Files: [] } as unknown as Awaited<ReturnType<typeof DownloadMigrations>>);
        // Migration fails — this is the rollback trigger for every case below.
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: false, ErrorMessage: 'migration boom' });
        serveManifests({ 'https://github.com/test/app-x': manifestWithMigrations('app-x') });
    });

    it('rolls back a schema we created this run when a later migration fails', async () => {
        // Reinstall of a Removed app whose schema was dropped on remove → we recreate it.
        vi.mocked(FindInstalledApp).mockResolvedValue({
            Name: 'app-x', Status: 'Removed', SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        vi.mocked(SchemaExists).mockResolvedValue(false); // schema absent → CreateAppSchema runs

        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, migContext);

        expect(result.Success).toBe(false);
        // Pre-fix `schemaCreated = !isReinstall` → false on a reinstall → the freshly-created
        // schema LEAKED. Post-fix tracks actual creation → it is rolled back.
        expect(vi.mocked(DropAppSchema)).toHaveBeenCalledTimes(1);
    });

    it('does NOT drop an adopted/reused schema we did not create', async () => {
        // Fresh install adopting a pre-existing schema (createIfNotExists default).
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined); // not a reinstall
        vi.mocked(SchemaExists).mockResolvedValue(true); // schema already there → reuse, don't create

        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, migContext);

        expect(result.Success).toBe(false);
        // Pre-fix `schemaCreated = !isReinstall` → true on a fresh install → it would DROP a
        // schema it merely adopted (someone else's data). Post-fix: Created=false → no drop.
        expect(vi.mocked(DropAppSchema)).not.toHaveBeenCalled();
    });
});

describe('UpgradeApp — migration failure is honest + recoverable (B21)', () => {
    const migContext = {
        ...context,
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s } },
    } as unknown as OrchestratorContext;

    function v2ManifestWithMigrations(name: string): string {
        return JSON.stringify({
            manifestVersion: 1,
            name,
            displayName: name,
            description: `${name} test app description`,
            version: '2.0.0',
            publisher: { name: 'Test' },
            repository: `https://github.com/test/${name}`,
            mjVersionRange: '>=5.0.0 <6.0.0',
            schema: { name: `test_${name.replace(/-/g, '_')}` },
            migrations: { directory: 'migrations' },
            packages: {},
            dependencies: {},
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(true);
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(GetLatestVersion).mockResolvedValue('2.0.0' as unknown as Awaited<ReturnType<typeof GetLatestVersion>>);
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Active',
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        serveManifests({ 'https://github.com/test/app-x': v2ManifestWithMigrations('app-x') });
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, Files: [] } as unknown as Awaited<ReturnType<typeof DownloadMigrations>>);
        // The new version's migration fails partway.
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: false, ErrorMessage: 'DDL boom on V2' });
    });

    it('marks the app Error and returns a message stating forward-only + how to resume', async () => {
        const result = await UpgradeApp({ AppName: 'app-x' }, migContext);

        expect(result.Success).toBe(false);
        // Pre-fix: a bare "Migration failed" implied an unrecoverable dead-end. Now it explains
        // the partial-upgrade state and that re-running the upgrade resumes via Skyway history.
        const msg = (result.ErrorMessage ?? '').toLowerCase();
        expect(msg).toContain('forward-only');
        expect(msg).toContain('resume');
        // Original failure detail is preserved.
        expect(msg).toContain('ddl boom on v2');
        // App is flipped to Error (retryable: B17 makes Error reinstallable; upgrade resumes).
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Error');
    });
});

describe('UpgradeApp — config prune ordering', () => {
    const upContext = {
        ...context,
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s } },
    } as unknown as OrchestratorContext;

    function v2Manifest(name: string): string {
        return JSON.stringify({
            manifestVersion: 1,
            name,
            displayName: name,
            description: `${name} test app description`,
            version: '2.0.0',
            publisher: { name: 'Test' },
            repository: `https://github.com/test/${name}`,
            mjVersionRange: '>=5.0.0 <6.0.0',
            schema: { name: `test_${name.replace(/-/g, '_')}` },
            packages: { server: [{ name: '@test/app-x-server', role: 'bootstrap', startupExport: 'Load' }] },
            dependencies: {},
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        installSequence.length = 0;
        vi.mocked(SchemaExists).mockResolvedValue(true);
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(GetLatestVersion).mockResolvedValue('2.0.0' as unknown as Awaited<ReturnType<typeof GetLatestVersion>>);
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Active',
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        serveManifests({ 'https://github.com/test/app-x': v2Manifest('app-x') });
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true } as ReturnType<typeof AddServerDynamicPackages>);
        vi.mocked(PruneDynamicPackagesNotInManifest).mockReturnValue(
            { Success: true } as ReturnType<typeof PruneDynamicPackagesNotInManifest>
        );
    });

    it('adds the new manifest\'s entries BEFORE pruning stale ones', async () => {
        // Both orders converge on the same config (the keep-set IS the new manifest), so the
        // order is chosen for the FAILURE window between these two un-rolled-back writes.
        // Add-then-prune leaves that window at (old ∪ new) — the running server still finds every
        // entry it needs. Prune-then-add would leave a subset of BOTH versions.
        await UpgradeApp({ AppName: 'app-x' }, upContext);

        const pruneCall = vi.mocked(PruneDynamicPackagesNotInManifest).mock.invocationCallOrder[0];
        const addCall = vi.mocked(AddServerDynamicPackages).mock.invocationCallOrder[0];
        expect(pruneCall).toBeDefined();
        expect(addCall).toBeDefined();
        expect(addCall).toBeLessThan(pruneCall);
    });

    it('fails the upgrade when the prune fails, leaving the added entries in place', async () => {
        // The adds have already run, so the config is a superset of what the new version needs and
        // the server keeps booting. The upgrade must still report failure so the operator retries;
        // the resume checkpoint is not advanced, so the retry re-runs both writes.
        vi.mocked(PruneDynamicPackagesNotInManifest).mockReturnValue(
            { Success: false, ErrorMessage: 'config left unchanged' } as ReturnType<typeof PruneDynamicPackagesNotInManifest>
        );

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.Success).toBe(false);
        expect(vi.mocked(AddServerDynamicPackages)).toHaveBeenCalled();
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Error');
    });

    it('does NOT prune when the add fails — the old config is left intact', async () => {
        // The failure window that motivates the order: if the first write fails, the second must
        // not run, so the config still holds exactly what the previous version needed.
        vi.mocked(AddServerDynamicPackages).mockReturnValue(
            { Success: false, ErrorMessage: 'could not write mj.config.cjs' } as ReturnType<typeof AddServerDynamicPackages>
        );

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.Success).toBe(false);
        expect(vi.mocked(PruneDynamicPackagesNotInManifest)).not.toHaveBeenCalled();
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Error');
    });
});
