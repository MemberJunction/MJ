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

import { InstallApp, UpgradeApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists, DropAppSchema } from '../install/schema-manager.js';
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
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver' } },
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
        DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver' } },
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
