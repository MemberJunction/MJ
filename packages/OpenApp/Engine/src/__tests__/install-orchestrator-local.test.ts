/**
 * Install, upgrade and remove of an Open App from a folder in the consumer repository
 * (a `file:` locator).
 *
 * The app folder is real (OS temp directory) and is read by the real LocalAppSource. The database,
 * the package manager and the config files are stubbed, and every GitHub client function fails,
 * so a local app that reaches GitHub breaks the operation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The template-user step loads the record-cloning engine, which this file's mocks don't provide for.
vi.mock('../install/template-user.js', () => ({
    OfferTemplateUser: vi.fn(),
    NamesFromEmail: vi.fn(),
    TEMPLATE_USER_ENV: {},
}));

/** Names of GitHub client functions the orchestrator called. Must stay empty. */
const gitHubCalls: string[] = [];
vi.mock('../github/github-client.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../github/github-client.js')>();
    const refuse = (name: string) => vi.fn((): never => {
        gitHubCalls.push(name);
        throw new Error(`GitHub client called: ${name}`);
    });
    return {
        ...actual,
        FetchManifestFromGitHub: refuse('FetchManifestFromGitHub'),
        DownloadMigrations: refuse('DownloadMigrations'),
        GetLatestVersion: refuse('GetLatestVersion'),
        DescribeUnresolvedVersion: refuse('DescribeUnresolvedVersion'),
        ValidateGitHubTag: refuse('ValidateGitHubTag'),
        ListGitHubReleases: refuse('ListGitHubReleases'),
        ListGitHubTags: refuse('ListGitHubTags'),
    };
});

vi.mock('../install/workspace-packages.js', () => ({ CheckWorkspacePackages: vi.fn() }));
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
    AddAppPackages: vi.fn(() => ({ Success: true })),
    RemoveAppPackages: vi.fn(() => ({ Success: true })),
    RunPackageInstallAsync: vi.fn(async () => ({ Success: true })),
    BumpPrefixedDependencies: vi.fn(() => 0),
    PreflightAppPackages: vi.fn(async () => ({ Success: true, Checks: [], Warnings: [] })),
    ListPackageStepFiles: vi.fn(() => []),
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(() => ({ Success: true })),
    AddClientDynamicPackages: vi.fn(() => ({ Success: true })),
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
import { CheckWorkspacePackages } from '../install/workspace-packages.js';
import { FetchManifestFromGitHub } from '../github/github-client.js';
import { SchemaExists, CreateAppSchema } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, PreflightAppPackages } from '../install/package-manager.js';
import { RecordAppInstallation, FindInstalledApp, ListInstalledApps, FindDependentApps, SetAppStatus } from '../install/history-recorder.js';

const LOCATOR = 'file:openapps/analytics';
const SERVER_PACKAGE = '@acme/analytics-server';
const CREATE_SQL = 'CREATE TABLE analytics.Event (ID INT);';
const ALTER_SQL = 'ALTER TABLE analytics.Event ADD Name NVARCHAR(100);';
const CREATE_PG_SQL = 'CREATE TABLE analytics."Event" ("ID" INT);';
const TEARDOWN_SQL = "DELETE FROM [${mjSchema}].[Integration] WHERE ID = 'analytics';";

/** Index of the repository URL argument of RecordAppInstallation. */
const REPOSITORY_URL_ARG = 7;
/** Index of the subpath argument of RecordAppInstallation. */
const SUBPATH_ARG = 6;

let repoRoot: string;
let appDir: string;

/** Writes the folder's mj-app.json and returns its JSON. */
function writeManifest(version: string, extra: Record<string, unknown> = {}): string {
    const json = JSON.stringify({
        manifestVersion: 1,
        name: 'analytics',
        displayName: 'Analytics',
        description: 'Analytics test app for the hub',
        version,
        publisher: { name: 'Acme' },
        repository: 'https://github.com/acme/platform',
        mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: 'analytics' },
        migrations: { directory: 'migrations', teardownDirectory: 'migrations-teardown' },
        packages: { server: [{ name: SERVER_PACKAGE, role: 'bootstrap', startupExport: 'Load' }] },
        ...extra,
    });
    writeFileSync(join(appDir, 'mj-app.json'), json);
    return json;
}

/** Writes another local app (one migration, no packages) at openapps/<name> and returns its locator. */
function writeOtherApp(name: string, version: string, extra: Record<string, unknown> = {}): string {
    const dir = join(repoRoot, 'openapps', name);
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'mj-app.json'), JSON.stringify(otherManifest(name, version, extra)));
    writeFileSync(join(dir, 'migrations', 'V1__create.sql'), `CREATE TABLE ${name}.Item (ID INT);`);
    return `file:openapps/${name}`;
}

function otherManifest(name: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifestVersion: 1,
        name,
        displayName: name,
        description: `The ${name} test app for the hub`,
        version,
        publisher: { name: 'Acme' },
        repository: 'https://github.com/acme/platform',
        mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name },
        migrations: { directory: 'migrations' },
        ...extra,
    };
}

/** Writes a .sql file under a folder of the app. */
function writeSql(directory: string, file: string, sql: string): void {
    mkdirSync(join(appDir, directory), { recursive: true });
    writeFileSync(join(appDir, directory, file), sql);
}

function buildContext(platform: 'sqlserver' | 'postgresql' = 'sqlserver'): OrchestratorContext {
    return {
        ContextUser: {},
        DatabaseProvider: {
            Dialect: { PlatformKey: platform, CanonicalSchemaName: (s: string) => s },
            ExecuteSQL: executeSQL,
            BeginTransaction: vi.fn(async () => {}),
            CommitTransaction: vi.fn(async () => {}),
            RollbackTransaction: vi.fn(async () => {}),
        },
        DatabaseConfig: {},
        GitHubOptions: {},
        RepoRoot: repoRoot,
        MJVersion: '5.37.0',
    } as unknown as OrchestratorContext;
}

/** An installed-app record whose files come from the local folder. */
function installedRecord(version: string, manifestJSON: string): Awaited<ReturnType<typeof FindInstalledApp>> {
    return {
        ID: 'id-analytics', Name: 'analytics', Version: version, Status: 'Active',
        RepositoryURL: LOCATOR, Subpath: null, SchemaName: null, ManifestJSON: manifestJSON,
    } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>;
}

const executeSQL = vi.fn(async () => []);
/** File name to SQL text for each migration run, read from its directory during the run. */
const migrationRuns: Array<Record<string, string>> = [];

beforeEach(() => {
    vi.clearAllMocks();
    gitHubCalls.length = 0;
    migrationRuns.length = 0;
    repoRoot = mkdtempSync(join(tmpdir(), 'local-app-install-'));
    appDir = join(repoRoot, 'openapps', 'analytics');
    mkdirSync(appDir, { recursive: true });

    vi.mocked(CheckWorkspacePackages).mockResolvedValue({ Success: true, Missing: [] });
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

afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
});

describe('InstallApp from a local folder', () => {
    it('runs the folder migrations, records the file: locator and writes workspace package versions', async () => {
        writeManifest('1.0.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(true);
        expect(migrationRuns).toEqual([{ 'V1__create_event.sql': CREATE_SQL }]);
        const recordCall = vi.mocked(RecordAppInstallation).mock.calls[0];
        expect(recordCall[REPOSITORY_URL_ARG]).toBe(LOCATOR);
        expect(recordCall[SUBPATH_ARG]).toBeUndefined();
        expect(CheckWorkspacePackages).toHaveBeenCalledWith([SERVER_PACKAGE], repoRoot, undefined);
        expect(PreflightAppPackages).toHaveBeenCalledWith(expect.objectContaining({ VersionStrategy: 'workspace' }));
        expect(AddAppPackages).toHaveBeenCalledWith(expect.objectContaining({ VersionStrategy: 'workspace' }));
        expect(gitHubCalls).toEqual([]);
    });

    it('runs the -pg migrations on PostgreSQL', async () => {
        writeManifest('1.0.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        writeSql('migrations-pg', 'V1__create_event.pg.sql', CREATE_PG_SQL);

        const result = await InstallApp({ Source: LOCATOR }, buildContext('postgresql'));

        expect(result.Success).toBe(true);
        expect(migrationRuns).toEqual([{ 'V1__create_event.pg.sql': CREATE_PG_SQL }]);
    });

    it('stops before any change when a requested version is not the folder version', async () => {
        writeManifest('1.0.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);

        const result = await InstallApp({ Source: LOCATOR, Version: '2.0.0' }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('1.0.0');
        expect(result.ErrorMessage).toContain('2.0.0');
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RecordAppInstallation).not.toHaveBeenCalled();
    });

    it('stops before any change when an app package is not in the workspace', async () => {
        writeManifest('1.0.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        vi.mocked(CheckWorkspacePackages).mockResolvedValue({
            Success: false,
            Missing: [SERVER_PACKAGE],
            ErrorMessage: `${SERVER_PACKAGE} is not in the pnpm workspace. Nothing has been changed.`,
        });

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(SERVER_PACKAGE);
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RunAppMigrations).not.toHaveBeenCalled();
        expect(AddAppPackages).not.toHaveBeenCalled();
    });
});

describe('UpgradeApp from a local folder', () => {
    it('upgrades to the folder version with its migrations and workspace package versions', async () => {
        const installedManifest = JSON.stringify({ name: 'analytics', version: '1.0.0' });
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', installedManifest));
        vi.mocked(SchemaExists).mockResolvedValue(true);
        writeManifest('1.1.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        writeSql('migrations', 'V2__add_name.sql', ALTER_SQL);

        const result = await UpgradeApp({ AppName: 'analytics' }, buildContext());

        expect(result.Success).toBe(true);
        expect(result.Version).toBe('1.1.0');
        expect(migrationRuns).toEqual([{ 'V1__create_event.sql': CREATE_SQL, 'V2__add_name.sql': ALTER_SQL }]);
        expect(AddAppPackages).toHaveBeenCalledWith(expect.objectContaining({ VersionStrategy: 'workspace' }));
        expect(gitHubCalls).toEqual([]);
    });

    it('reports the app as current when the folder is at the installed version', async () => {
        const manifestJSON = writeManifest('1.0.0');
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', manifestJSON));

        const result = await UpgradeApp({ AppName: 'analytics' }, buildContext());

        expect(result.Success).toBe(true);
        expect(result.Summary).toContain('Already at version 1.0.0');
        expect(RunAppMigrations).not.toHaveBeenCalled();
    });

    it('stops before any change when an app package is not in the workspace', async () => {
        const installedManifest = JSON.stringify({ name: 'analytics', version: '1.0.0' });
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', installedManifest));
        writeManifest('1.1.0');
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        vi.mocked(CheckWorkspacePackages).mockResolvedValue({
            Success: false,
            Missing: [SERVER_PACKAGE],
            ErrorMessage: `${SERVER_PACKAGE} is not in the pnpm workspace. Nothing has been changed.`,
        });

        const result = await UpgradeApp({ AppName: 'analytics' }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(SERVER_PACKAGE);
        expect(RunAppMigrations).not.toHaveBeenCalled();
        expect(AddAppPackages).not.toHaveBeenCalled();
    });

    it('re-runs the upgrade at the installed version when Reapply is set', async () => {
        const manifestJSON = writeManifest('1.0.0');
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', manifestJSON));
        vi.mocked(SchemaExists).mockResolvedValue(true);
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        writeSql('migrations', 'V2__add_name.sql', ALTER_SQL);

        const result = await UpgradeApp({ AppName: 'analytics', Reapply: true }, buildContext());

        expect(result.Success).toBe(true);
        expect(result.Version).toBe('1.0.0');
        expect(migrationRuns).toEqual([{ 'V1__create_event.sql': CREATE_SQL, 'V2__add_name.sql': ALTER_SQL }]);
        expect(AddAppPackages).toHaveBeenCalledWith(expect.objectContaining({ VersionStrategy: 'workspace' }));
    });
});

describe('RemoveApp from a local folder', () => {
    it('runs the teardown scripts from the folder', async () => {
        const manifestJSON = writeManifest('1.0.0', { packages: undefined });
        writeSql('migrations-teardown', 'V1__teardown.sql', TEARDOWN_SQL);
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', manifestJSON));

        const result = await RemoveApp({ AppName: 'analytics' }, buildContext());

        expect(result.Success).toBe(true);
        expect(executeSQL).toHaveBeenCalledWith("DELETE FROM [__mj].[Integration] WHERE ID = 'analytics';");
        expect(gitHubCalls).toEqual([]);
    });

    it('changes nothing when the folder has moved past the installed version', async () => {
        const installedManifest = writeManifest('1.0.0', { packages: undefined });
        writeManifest('1.1.0', { packages: undefined });
        writeSql('migrations-teardown', 'V1__teardown.sql', TEARDOWN_SQL);
        vi.mocked(FindInstalledApp).mockResolvedValue(installedRecord('1.0.0', installedManifest));

        const result = await RemoveApp({ AppName: 'analytics' }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('1.0.0');
        expect(result.ErrorMessage).toContain('1.1.0');
        expect(executeSQL).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'));
        expect(SetAppStatus).not.toHaveBeenCalled();
    });
});

describe('InstallApp with local dependencies', () => {
    it('installs a file: dependency from its folder before the app', async () => {
        const settings = writeOtherApp('settings', '1.2.0');
        writeManifest('1.0.0', { dependencies: { settings: { version: '^1.0.0', repository: settings } } });
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(true);
        const recorded = vi.mocked(RecordAppInstallation).mock.calls.map((call) => [call[1].name, call[1].version, call[REPOSITORY_URL_ARG]]);
        expect(recorded).toEqual([['settings', '1.2.0', settings], ['analytics', '1.0.0', LOCATOR]]);
        expect(migrationRuns).toEqual([{ 'V1__create.sql': 'CREATE TABLE settings.Item (ID INT);' }, { 'V1__create_event.sql': CREATE_SQL }]);
        expect(gitHubCalls).toEqual([]);
    });

    it('stops before any change when the dependency folder is outside the declared range', async () => {
        const settings = writeOtherApp('settings', '2.0.0');
        writeManifest('1.0.0', { dependencies: { settings: { version: '^1.0.0', repository: settings } } });
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('^1.0.0');
        expect(result.ErrorMessage).toContain('2.0.0');
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RecordAppInstallation).not.toHaveBeenCalled();
    });

    it('stops before any change when a later dependency has a package that is not in the workspace', async () => {
        const reportsPackage = '@acme/reports-server';
        const settings = writeOtherApp('settings', '1.2.0');
        const reports = writeOtherApp('reports', '1.0.0', {
            packages: { server: [{ name: reportsPackage, role: 'bootstrap', startupExport: 'Load' }] },
            dependencies: { settings: { version: '^1.0.0', repository: settings } },
        });
        writeManifest('1.0.0', { dependencies: { reports: { version: '^1.0.0', repository: reports } } });
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);
        vi.mocked(CheckWorkspacePackages).mockImplementation(async (names) => names.includes(reportsPackage)
            ? { Success: false, Missing: [reportsPackage], ErrorMessage: `${reportsPackage} is not in the pnpm workspace. Nothing has been changed.` }
            : { Success: true, Missing: [] });

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(reportsPackage);
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RecordAppInstallation).not.toHaveBeenCalled();
    });

    it('refuses a file: dependency declared by an app installed from GitHub', async () => {
        const settings = writeOtherApp('settings', '1.2.0');
        const fromGitHub = otherManifest('crm', '1.0.0', { dependencies: { settings: { version: '^1.0.0', repository: settings } } });
        vi.mocked(FetchManifestFromGitHub).mockResolvedValueOnce({ Success: true, ManifestJSON: JSON.stringify(fromGitHub) });

        const result = await InstallApp({ Source: 'https://github.com/acme/crm' }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(settings);
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RecordAppInstallation).not.toHaveBeenCalled();
    });

    it('refuses a file: dependency declared by a dependency fetched from GitHub', async () => {
        const settings = writeOtherApp('settings', '1.2.0');
        const shared = otherManifest('shared', '1.0.0', { dependencies: { settings: { version: '^1.0.0', repository: settings } } });
        vi.mocked(FetchManifestFromGitHub).mockResolvedValueOnce({ Success: true, ManifestJSON: JSON.stringify(shared) });
        writeManifest('1.0.0', { dependencies: { shared: { version: '*', repository: 'https://github.com/acme/shared' } } });
        writeSql('migrations', 'V1__create_event.sql', CREATE_SQL);

        const result = await InstallApp({ Source: LOCATOR }, buildContext());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(settings);
        expect(CreateAppSchema).not.toHaveBeenCalled();
        expect(RecordAppInstallation).not.toHaveBeenCalled();
    });
});
