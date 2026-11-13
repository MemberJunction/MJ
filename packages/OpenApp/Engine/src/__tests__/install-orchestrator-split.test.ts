/**
 * Tests for the split install modes: the package step (`PackagesOnly`, run by a Docker build with
 * no database) and the database step (`DatabaseOnly`, run later by a container entrypoint).
 *
 * Every external collaborator is stubbed; the manifest schema and dependency resolver are real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const angularLoad = vi.hoisted(() => vi.fn(() => true));

vi.mock('../install/template-user.js', () => ({
    OfferTemplateUser: vi.fn(),
    NamesFromEmail: vi.fn(),
    TEMPLATE_USER_ENV: {},
}));
vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    ParseGitHubUrl: () => ({ Owner: 'test', Repo: 'x', Subpath: undefined }),
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
}));
vi.mock('../install/schema-manager.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../install/schema-manager.js')>()),
    CreateAppSchema: vi.fn(),
    CheckCanMigrateAppSchema: vi.fn(async () => ({ Success: true })),
    DropAppSchema: vi.fn(),
    SchemaExists: vi.fn(),
}));
vi.mock('../install/migration-runner.js', () => ({ RunAppMigrations: vi.fn() }));
vi.mock('../install/package-manager.js', () => ({
    AddAppPackages: vi.fn(),
    RemoveAppPackages: vi.fn(),
    RunPackageInstallAsync: vi.fn(),
    BumpPrefixedDependencies: vi.fn(),
    PreflightAppPackages: vi.fn(),
    ListPackageStepFiles: vi.fn(() => []),
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(),
    AddClientDynamicPackages: vi.fn(),
    RemoveServerDynamicPackages: vi.fn(),
    PruneDynamicPackagesNotInManifest: vi.fn(() => ({ Success: true })),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
    AddExcludeSchema: vi.fn(),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
}));
vi.mock('../install/angular-config-manager.js', () => ({
    AngularConfigManager: vi.fn().mockImplementation(() => ({
        Load: angularLoad,
        AddPrebundleExcludes: vi.fn(),
        RemovePrebundleExcludes: vi.fn(),
        Save: vi.fn(() => ({ Success: true, Changes: [] })),
    })),
}));
vi.mock('../install/history-recorder.js', async (importOriginal) => {
    const { MockHistoryRecorder } = await import('./helpers/history-recorder-mock.js');
    return MockHistoryRecorder(await importOriginal());
});
vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { InstallApp, InstallAppPackages } from '../install/install-orchestrator.js';
import type { OrchestratorContext, PackageStepContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, ListGitHubReleases, ListGitHubTags, ValidateGitHubTag } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstallAsync, BumpPrefixedDependencies, PreflightAppPackages } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, AddEntityPackageMapping, AddExcludeSchema } from '../install/config-manager.js';
import { RecordAppInstallation, SetAppStatus, FindInstalledApp, ListInstalledApps } from '../install/history-recorder.js';

/** Builds a valid mj-app.json with a schema, migrations, one server package and optional deps. */
function manifestJSON(name: string, deps: Record<string, { version: string; repository: string }> = {}): string {
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
        packages: { server: [{ name: `@test/${name}-server`, role: 'actions' }] },
        dependencies: deps,
    });
}

const ROOT = 'https://github.com/test/app-root';
const COMMON = 'https://github.com/test/app-common';

function serveRootWithDependency(): void {
    const byUrl: Record<string, string> = {
        [ROOT]: manifestJSON('app-root', { 'app-common': { version: '^1.0.0', repository: COMMON } }),
        [COMMON]: manifestJSON('app-common'),
    };
    vi.mocked(FetchManifestFromGitHub).mockImplementation(async (url: string) =>
        byUrl[url] ? { Success: true, ManifestJSON: byUrl[url] } : { Success: false, ErrorMessage: `no manifest for ${url}` },
    );
}

/** The package names AddAppPackages received, in call order. */
function addedPackages(): string[] {
    return vi.mocked(AddAppPackages).mock.calls.map(([opts]) => opts.ServerPackages[0]?.name ?? '');
}

const packageContext: PackageStepContext = {
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.37.0',
};

const fullContext = {
    ...packageContext,
    ContextUser: {},
    DatabaseProvider: { Dialect: { CanonicalSchemaName: (s: string) => s } },
    DatabaseConfig: {},
} as unknown as OrchestratorContext;

beforeEach(() => {
    vi.clearAllMocks();
    serveRootWithDependency();
    vi.mocked(SchemaExists).mockResolvedValue(false);
    vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true, Created: true });
    vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
    vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
    vi.mocked(RunPackageInstallAsync).mockResolvedValue({ Success: true });
    vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
    vi.mocked(PreflightAppPackages).mockResolvedValue({ Success: true, Checks: [], Warnings: [] });
    vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
    vi.mocked(AddExcludeSchema).mockReturnValue({ Success: true });
    vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
    vi.mocked(ListInstalledApps).mockResolvedValue([]);
    vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => `id-${manifest.name}`);
    vi.mocked(ListGitHubTags).mockResolvedValue(['1.0.0']);
    vi.mocked(ListGitHubReleases).mockResolvedValue([]);
    vi.mocked(ValidateGitHubTag).mockResolvedValue({ Exists: true });
});

describe('InstallAppPackages (package step, no database)', () => {
    it('installs the packages and config of the app and its dependencies, dependency first', async () => {
        const result = await InstallAppPackages({ Source: ROOT }, packageContext);

        expect(result.Success).toBe(true);
        expect(addedPackages()).toEqual(['@test/app-common-server', '@test/app-root-server']);
        expect(vi.mocked(RunPackageInstallAsync)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(AddServerDynamicPackages)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(AddExcludeSchema)).toHaveBeenCalledTimes(2);
    });

    it('touches no database: no schema, migrations, Open App records or installed-app lookups', async () => {
        await InstallAppPackages({ Source: ROOT }, packageContext);

        expect(vi.mocked(CreateAppSchema)).not.toHaveBeenCalled();
        expect(vi.mocked(RunAppMigrations)).not.toHaveBeenCalled();
        expect(vi.mocked(RecordAppInstallation)).not.toHaveBeenCalled();
        expect(vi.mocked(SetAppStatus)).not.toHaveBeenCalled();
        expect(vi.mocked(FindInstalledApp)).not.toHaveBeenCalled();
        expect(vi.mocked(ListInstalledApps)).not.toHaveBeenCalled();
    });

    it('fails when the package install fails', async () => {
        vi.mocked(RunPackageInstallAsync).mockResolvedValue({ Success: false, ErrorMessage: 'pnpm install failed' });

        const result = await InstallAppPackages({ Source: ROOT }, packageContext);

        expect(result.Success).toBe(false);
        expect(result.ErrorPhase).toBe('Packages');
    });
});

describe('InstallApp install modes', () => {
    it('PackagesOnly runs only the package step', async () => {
        const result = await InstallApp({ Source: ROOT, PackagesOnly: true }, fullContext);

        expect(result.Success).toBe(true);
        expect(addedPackages()).toEqual(['@test/app-common-server', '@test/app-root-server']);
        expect(vi.mocked(CreateAppSchema)).not.toHaveBeenCalled();
        expect(vi.mocked(RecordAppInstallation)).not.toHaveBeenCalled();
    });

    it('DatabaseOnly runs the database step for the app and its dependencies and changes no files', async () => {
        const result = await InstallApp({ Source: ROOT, DatabaseOnly: true }, fullContext);

        expect(result.Success).toBe(true);
        expect(vi.mocked(RecordAppInstallation).mock.calls.map(([, m]) => m.name)).toEqual(['app-common', 'app-root']);
        expect(vi.mocked(RunAppMigrations)).toHaveBeenCalledTimes(0); // no migrations block in the manifest
        expect(vi.mocked(CreateAppSchema)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'id-app-root', 'Active');
        expect(vi.mocked(AddAppPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(RunPackageInstallAsync)).not.toHaveBeenCalled();
        expect(vi.mocked(BumpPrefixedDependencies)).not.toHaveBeenCalled();
        expect(vi.mocked(PreflightAppPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(AddServerDynamicPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(AddClientDynamicPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(AddEntityPackageMapping)).not.toHaveBeenCalled();
        expect(vi.mocked(AddExcludeSchema)).not.toHaveBeenCalled();
        expect(angularLoad).not.toHaveBeenCalled();
    });

    it('rejects PackagesOnly together with DatabaseOnly before doing any work', async () => {
        const result = await InstallApp({ Source: ROOT, PackagesOnly: true, DatabaseOnly: true }, fullContext);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/PackagesOnly.*DatabaseOnly|DatabaseOnly.*PackagesOnly/);
        expect(vi.mocked(FetchManifestFromGitHub)).not.toHaveBeenCalled();
    });
});
