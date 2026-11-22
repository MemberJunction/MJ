/**
 * Source-routing tests for the install orchestrator.
 *
 * InstallApp, UpgradeApp and RemoveApp must read every manifest, version and SQL file from the
 * OpenAppSource that ResolveAppSource returns. These tests replace ResolveAppSource with in-memory
 * sources and make every GitHub client function fail, so any read that skips the source layer
 * breaks the operation and is recorded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The template-user step loads the record-cloning engine, which this file's mocks don't provide for.
vi.mock('../install/template-user.js', () => ({
    OfferTemplateUser: vi.fn(),
    NamesFromEmail: vi.fn(),
    TEMPLATE_USER_ENV: {},
}));

/** Names of GitHub client functions the orchestrator called. Must stay empty. */
const gitHubCalls: string[] = [];
vi.mock('../github/github-client.js', () => {
    const refuse = (name: string) => (): never => {
        gitHubCalls.push(name);
        throw new Error(`GitHub client called directly: ${name}`);
    };
    return {
        FetchManifestFromGitHub: refuse('FetchManifestFromGitHub'),
        DownloadMigrations: refuse('DownloadMigrations'),
        GetLatestVersion: refuse('GetLatestVersion'),
        DescribeUnresolvedVersion: refuse('DescribeUnresolvedVersion'),
        ValidateGitHubTag: refuse('ValidateGitHubTag'),
        ListGitHubReleases: refuse('ListGitHubReleases'),
        ListGitHubTags: refuse('ListGitHubTags'),
        ParseGitHubUrl: refuse('ParseGitHubUrl'),
    };
});

/** In-memory sources by locator; ResolveAppSource serves from here. */
const sources = new Map<string, InMemoryAppSource>();
/** The locator, subpath and app name of each ResolveAppSource call. */
const resolvedSources: Array<{ Locator: string; Subpath?: string; AppName?: string }> = [];
vi.mock('../source/open-app-source.js', () => ({
    ResolveAppSource: (locator: string, context: { Subpath?: string; AppName?: string }) => {
        resolvedSources.push({ Locator: locator, Subpath: context.Subpath, AppName: context.AppName });
        const source = sources.get(locator);
        if (!source) {
            throw new Error(`No test source for ${locator}`);
        }
        return source;
    },
    SubpathFromLocator: () => undefined,
}));

// Spread the real module so ValidateSchemaName is the genuine rule; only DB-touching functions are stubbed.
vi.mock('../install/schema-manager.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../install/schema-manager.js')>()),
    CreateAppSchema: vi.fn(),
    CheckCanMigrateAppSchema: vi.fn(async () => ({ Success: true })),
    DropAppSchema: vi.fn(),
    SchemaExists: vi.fn(),
    EscapeSqlString: (s: string) => s,
}));
vi.mock('../install/migration-runner.js', () => ({ RunAppMigrations: vi.fn() }));
vi.mock('../install/package-manager.js', () => ({
    AddAppPackages: vi.fn(() => ({ Success: true, Added: [], Removed: [] })),
    RemoveAppPackages: vi.fn(() => ({ Success: true })),
    RunPackageInstallAsync: vi.fn(async () => ({ Success: true })),
    BumpPrefixedDependencies: vi.fn(() => 0),
    PreflightAppPackages: vi.fn(async () => ({ Success: true, Checks: [], Warnings: [] })),
    ListPackageStepFiles: vi.fn(() => []),
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(() => ({ Success: true })),
    AddClientDynamicPackages: vi.fn(() => ({ Success: true })),
    AddPublicPages: vi.fn(() => ({ Success: true })),
    CheckPublicPageSlugConflicts: vi.fn(() => ({ Success: true })),
    RemoveServerDynamicPackages: vi.fn(() => ({ Success: true })),
    PruneDynamicPackagesNotInManifest: vi.fn(() => ({ Success: true })),
    ToggleServerDynamicPackages: vi.fn(() => ({ Success: true })),
    AddEntityPackageMapping: vi.fn(() => ({ Success: true })),
    RemoveEntityPackageMapping: vi.fn(() => ({ Success: true })),
    AddExcludeSchema: vi.fn(() => ({ Success: true })),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
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

import { InstallApp, UpgradeApp, RemoveApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import type { OpenAppSource } from '../source/open-app-source.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import type { ManifestFetchResult, MigrationDownloadResult } from '../github/github-client.js';
import { SchemaExists, CreateAppSchema } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { RecordAppInstallation, FindInstalledApp, ListInstalledApps, FindDependentApps } from '../install/history-recorder.js';

/** Key for the manifest a source serves when no version is requested (the default branch). */
const DEFAULT_BRANCH = 'HEAD';

/** An Open App source that serves manifests and SQL files from memory. */
class InMemoryAppSource implements OpenAppSource {
    public readonly Subpath: string | undefined = undefined;
    public readonly PackageVersionStrategy = undefined;

    public constructor(
        public readonly Locator: string,
        private readonly manifestsByVersion: Record<string, string>,
        private readonly sqlByDirectory: Record<string, Record<string, string>> = {},
        private readonly latestVersion: string | null = null,
    ) {}

    public async FetchManifest(version?: string): Promise<ManifestFetchResult> {
        const json = this.manifestsByVersion[version ?? DEFAULT_BRANCH];
        return json ? { Success: true, ManifestJSON: json } : { Success: false, ErrorMessage: `no manifest at ${version}` };
    }

    public async CopySqlDirectory(directory: string, _version: string, targetDir: string): Promise<MigrationDownloadResult> {
        const files = this.sqlByDirectory[directory];
        if (!files) {
            return { Success: false, ErrorMessage: `no directory ${directory}` };
        }
        for (const [name, sql] of Object.entries(files)) {
            writeFileSync(join(targetDir, name), sql);
        }
        return { Success: true, LocalPath: targetDir, Files: Object.keys(files) };
    }

    public async ValidateVersion(version: string): Promise<{ Exists: boolean; ErrorMessage?: string }> {
        return version in this.manifestsByVersion ? { Exists: true } : { Exists: false, ErrorMessage: `no version ${version}` };
    }

    public async GetLatestVersion(): Promise<string | null> {
        return this.latestVersion;
    }

    public async DescribeUnresolvedVersion(): Promise<string> {
        return `no versions in ${this.Locator}`;
    }

    public async ListVersions(): Promise<string[]> {
        return Object.keys(this.manifestsByVersion).filter((v) => v !== DEFAULT_BRANCH);
    }

    /** Returns the test source for the manifest's repository, as a GitHub source does. */
    public ForManifest(manifest: Pick<MJAppManifest, 'name' | 'repository'>): OpenAppSource {
        const source = sources.get(manifest.repository);
        if (!source) {
            throw new Error(`No test source for ${manifest.repository}`);
        }
        return source;
    }
}

const ROOT_URL = 'https://github.com/test/acme-root';
const COMMON_URL = 'https://github.com/test/acme-common';
/** Repository a later acme-root manifest declares. Upgrade keeps the record's RepositoryURL, so the two can differ. */
const MOVED_URL = 'https://github.com/test/acme-root-moved';
const CREATE_SQL = 'CREATE TABLE acme_root.Widget (ID INT);';
const ALTER_SQL = 'ALTER TABLE acme_root.Widget ADD Name NVARCHAR(100);';
const TEARDOWN_SQL = "DELETE FROM [${mjSchema}].[Integration] WHERE ID = 'int-1';";

/** Builds a valid mj-app.json string. */
function manifestJSON(name: string, version: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        manifestVersion: 1,
        name,
        displayName: name,
        description: `${name} test app description`,
        version,
        publisher: { name: 'Test' },
        repository: `https://github.com/test/${name}`,
        mjVersionRange: '>=5.0.0 <6.0.0',
        packages: {},
        ...extra,
    });
}

const ROOT_SCHEMA = { schema: { name: 'acme_root' }, migrations: { directory: 'migrations' } };

const executeSQL = vi.fn(async () => []);
const context = {
    ContextUser: {},
    DatabaseProvider: {
        Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s },
        ExecuteSQL: executeSQL,
        BeginTransaction: vi.fn(async () => {}),
        CommitTransaction: vi.fn(async () => {}),
        RollbackTransaction: vi.fn(async () => {}),
    },
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.37.0',
} as unknown as OrchestratorContext;

/** File name to SQL text for each migration run, read from its directory during the run. */
const migrationRuns: Array<Record<string, string>> = [];

describe('install orchestrator reads app files only through the resolved source', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gitHubCalls.length = 0;
        migrationRuns.length = 0;
        sources.clear();
        resolvedSources.length = 0;

        vi.mocked(SchemaExists).mockResolvedValue(false);
        vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
        vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(FindDependentApps).mockResolvedValue([]);
        vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => `id-${manifest.name}`);
        vi.mocked(RunAppMigrations).mockImplementation(async (options) => {
            const run: Record<string, string> = {};
            for (const file of readdirSync(options.MigrationsDir)) {
                run[file] = readFileSync(join(options.MigrationsDir, file), 'utf-8');
            }
            migrationRuns.push(run);
            return { Success: true };
        });
    });

    it('installs an app and its dependency from source manifests, versions and migration files', async () => {
        sources.set(ROOT_URL, new InMemoryAppSource(
            ROOT_URL,
            { [DEFAULT_BRANCH]: manifestJSON('acme-root', '1.0.0', { ...ROOT_SCHEMA, dependencies: { 'acme-common': { version: '^1.0.0', repository: COMMON_URL } } }) },
            { migrations: { 'V1__create_widget.sql': CREATE_SQL } },
        ));
        sources.set(COMMON_URL, new InMemoryAppSource(COMMON_URL, {
            '1.0.0': manifestJSON('acme-common', '1.0.0'),
            '1.2.0': manifestJSON('acme-common', '1.2.0'),
            '2.0.0': manifestJSON('acme-common', '2.0.0'),
        }));

        const result = await InstallApp({ Source: ROOT_URL }, context);

        expect(result.Success).toBe(true);
        const recorded = vi.mocked(RecordAppInstallation).mock.calls.map(([, manifest]) => `${manifest.name}@${manifest.version}`);
        expect(recorded).toEqual(['acme-common@1.2.0', 'acme-root@1.0.0']);
        expect(migrationRuns).toEqual([{ 'V1__create_widget.sql': CREATE_SQL }]);
        expect(gitHubCalls).toEqual([]);
    });

    it('upgrades to the version the source reports and runs its migrations from the new manifest\'s repository', async () => {
        vi.mocked(SchemaExists).mockResolvedValue(true);
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'id-acme-root', Name: 'acme-root', Version: '1.0.0', Status: 'Active',
            RepositoryURL: ROOT_URL, Subpath: 'apps/acme-root', SchemaName: 'acme_root',
            ManifestJSON: manifestJSON('acme-root', '1.0.0', ROOT_SCHEMA),
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        sources.set(ROOT_URL, new InMemoryAppSource(
            ROOT_URL,
            {
                '1.0.0': manifestJSON('acme-root', '1.0.0', ROOT_SCHEMA),
                '1.1.0': manifestJSON('acme-root', '1.1.0', { ...ROOT_SCHEMA, repository: MOVED_URL }),
            },
            {},
            '1.1.0',
        ));
        sources.set(MOVED_URL, new InMemoryAppSource(
            MOVED_URL,
            {},
            { migrations: { 'V1__create_widget.sql': CREATE_SQL, 'V2__add_name.sql': ALTER_SQL } },
        ));

        const result = await UpgradeApp({ AppName: 'acme-root' }, context);

        expect(result.Success).toBe(true);
        expect(result.Version).toBe('1.1.0');
        expect(resolvedSources).toContainEqual({ Locator: ROOT_URL, Subpath: 'apps/acme-root', AppName: 'acme-root' });
        expect(migrationRuns).toEqual([{ 'V1__create_widget.sql': CREATE_SQL, 'V2__add_name.sql': ALTER_SQL }]);
        expect(gitHubCalls).toEqual([]);
    });

    it('reports the source\'s reason when the source has no version to upgrade to', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'id-acme-root', Name: 'acme-root', Version: '1.0.0', Status: 'Active',
            RepositoryURL: ROOT_URL, Subpath: null, SchemaName: 'acme_root',
            ManifestJSON: manifestJSON('acme-root', '1.0.0', ROOT_SCHEMA),
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        sources.set(ROOT_URL, new InMemoryAppSource(ROOT_URL, {}, {}, null));

        const result = await UpgradeApp({ AppName: 'acme-root' }, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(`no versions in ${ROOT_URL}`);
        expect(gitHubCalls).toEqual([]);
    });

    it('removes an app with the teardown scripts from its stored manifest\'s repository', async () => {
        const installedManifest = manifestJSON('acme-root', '1.0.0', {
            repository: MOVED_URL,
            schema: { name: 'acme_root' },
            migrations: { directory: 'migrations', teardownDirectory: 'migrations-teardown' },
        });
        // SchemaName null skips the entity-metadata removal and schema drop, isolating teardown.
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'id-acme-root', Name: 'acme-root', Version: '1.0.0', Status: 'Active',
            RepositoryURL: ROOT_URL, Subpath: 'apps/acme-root', SchemaName: null, ManifestJSON: installedManifest,
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        sources.set(ROOT_URL, new InMemoryAppSource(ROOT_URL, { '1.0.0': installedManifest }));
        sources.set(MOVED_URL, new InMemoryAppSource(
            MOVED_URL,
            {},
            { 'migrations-teardown': { 'V1__teardown.sql': TEARDOWN_SQL } },
        ));

        const result = await RemoveApp({ AppName: 'acme-root' }, context);

        expect(result.Success).toBe(true);
        expect(resolvedSources).toContainEqual({ Locator: ROOT_URL, Subpath: 'apps/acme-root', AppName: 'acme-root' });
        expect(executeSQL).toHaveBeenCalledWith("DELETE FROM [__mj].[Integration] WHERE ID = 'int-1';");
        expect(gitHubCalls).toEqual([]);
    });
});
